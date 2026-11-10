import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const WEB_ROOT = fileURLToPath(new URL('../src/web', import.meta.url))
const VUE = fileURLToPath(new URL('../node_modules/vue/dist/vue.esm-browser.prod.js', import.meta.url))
const stub = (code) => `data:text/javascript,${encodeURIComponent(code)}`
const STUBS = {
  '/shared/utils.js': stub('export const wait = () => new Promise((resolve) => setImmediate(resolve)); export const prefersReducedMotion = () => false'),
}

registerHooks({
  resolve: (specifier, context, nextResolve) => {
    const fromWeb = context.parentURL?.startsWith(pathToFileURL(WEB_ROOT).href)
    if (!fromWeb || !specifier.startsWith('/')) return nextResolve(specifier, context)
    if (specifier === '/vendor/vue.esm-browser.prod.js') return nextResolve(pathToFileURL(VUE).href, context)
    if (STUBS[specifier]) return nextResolve(STUBS[specifier], context)
    return nextResolve(pathToFileURL(`${WEB_ROOT}${specifier}`).href, context)
  },
})

const { effectScope, ref } = await import(pathToFileURL(VUE).href)
const { usePacedJob } = await import('../src/web/views/welcome-shared.js')

const settle = async () => {
  for (let i = 0; i < 50; i += 1) await new Promise((resolve) => setImmediate(resolve))
}

const step = (id, status, detail = null) => ({ id, label: id, status, detail })

const pacedJob = (initial) => {
  const scope = effectScope()
  const job = ref(initial)
  const paced = scope.run(() => usePacedJob(job))
  return { job, paced, stop: () => scope.stop() }
}

test('usePacedJob: steps that arrive after the start still reveal, through to the done state', async () => {
  const { job, paced, stop } = pacedJob({ running: true, steps: [], result: null })
  try {
    paced.begin()
    await settle()
    job.value = { running: true, steps: [step('merged', 'done'), step('link', 'running'), step('verify', 'pending')], result: null }
    await settle()
    assert.deepEqual(paced.shown.value.steps.map((s) => s.status), ['done', 'running', 'pending'])
    job.value = { running: false, steps: [step('merged', 'done'), step('link', 'done', { found: 178, expected: 178 }), step('verify', 'done')], result: { ok: true } }
    await settle()
    assert.deepEqual(paced.shown.value.steps.map((s) => s.status), ['done', 'done', 'done'])
    assert.deepEqual(paced.shown.value.result, { ok: true })
    assert.equal(paced.shown.value.running, false)
  } finally {
    stop()
  }
})

test('usePacedJob: a failed step stops the reveal and shows the rolled-back result', async () => {
  const { job, paced, stop } = pacedJob({ running: true, steps: [step('merged', 'pending'), step('point', 'pending')], result: null })
  try {
    paced.begin()
    await settle()
    job.value = { running: false, steps: [step('merged', 'failed'), step('point', 'pending')], result: { ok: false, restored: true } }
    await settle()
    assert.deepEqual(paced.shown.value.steps.map((s) => s.status), ['failed', 'pending'])
    assert.deepEqual(paced.shown.value.result, { ok: false, restored: true })
  } finally {
    stop()
  }
})

test('usePacedJob: a step not yet started shows no detail', async () => {
  const { job, paced, stop } = pacedJob({ running: true, steps: [step('merged', 'running'), step('link', 'pending', { found: 178, expected: 178 })], result: null })
  try {
    paced.begin()
    await settle()
    assert.equal(paced.shown.value.steps[1].status, 'pending')
    assert.equal(paced.shown.value.steps[1].detail, undefined)
    job.value = { ...job.value, running: false, result: null }
  } finally {
    stop()
  }
})
