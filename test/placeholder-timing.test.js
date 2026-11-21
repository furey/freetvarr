import { test, mock, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const WEB_ROOT = fileURLToPath(new URL('../src/web', import.meta.url))
const VUE = fileURLToPath(new URL('../node_modules/vue/dist/vue.esm-browser.prod.js', import.meta.url))

registerHooks({
  resolve: (specifier, context, nextResolve) => {
    const fromWeb = context.parentURL?.startsWith(pathToFileURL(WEB_ROOT).href)
    if (!fromWeb || !specifier.startsWith('/')) return nextResolve(specifier, context)
    if (specifier === '/vendor/vue.esm-browser.prod.js') return nextResolve(pathToFileURL(VUE).href, context)
    return nextResolve(pathToFileURL(`${WEB_ROOT}${specifier}`).href, context)
  },
})

const { effectScope, nextTick, ref } = await import(pathToFileURL(VUE).href)
const { usePlaceholderTiming, PLACEHOLDER_DELAY_MS, PLACEHOLDER_MIN_MS } = await import('../src/web/shared/placeholder-timing.js')

const advance = async (ms) => {
  mock.timers.tick(ms)
  await nextTick()
}

const started = (pendingAtStart = true) => {
  const pending = ref(pendingAtStart)
  const scope = effectScope()
  const timing = scope.run(() => usePlaceholderTiming(pending))
  return { pending, scope, timing }
}

beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 }))

afterEach(() => mock.timers.reset())

test('placeholder timing: an answer before the delay shows no placeholder at all', async () => {
  const { pending, timing } = started()
  await advance(PLACEHOLDER_DELAY_MS - 1)
  pending.value = false
  await nextTick()
  await advance(PLACEHOLDER_MIN_MS)
  assert.equal(timing.showing.value, false)
  assert.equal(timing.holding.value, false)
})

test('placeholder timing: a slow answer shows the placeholder after the delay and holds it for the minimum', async () => {
  const { pending, timing } = started()
  await advance(PLACEHOLDER_DELAY_MS)
  assert.equal(timing.showing.value, true)
  await advance(100)
  pending.value = false
  await nextTick()
  assert.equal(timing.holding.value, true)
  await advance(PLACEHOLDER_MIN_MS - 101)
  assert.equal(timing.showing.value, true)
  await advance(1)
  assert.equal(timing.showing.value, false)
  assert.equal(timing.holding.value, false)
})

test('placeholder timing: an answer after the minimum clears the placeholder at once', async () => {
  const { pending, timing } = started()
  await advance(PLACEHOLDER_DELAY_MS)
  await advance(PLACEHOLDER_MIN_MS)
  pending.value = false
  await nextTick()
  assert.equal(timing.showing.value, false)
  assert.equal(timing.holding.value, false)
})

test('placeholder timing: pending again during the hold keeps the placeholder up with no gap', async () => {
  const { pending, timing } = started()
  await advance(PLACEHOLDER_DELAY_MS)
  pending.value = false
  await nextTick()
  await advance(200)
  pending.value = true
  await nextTick()
  assert.equal(timing.holding.value, false)
  await advance(PLACEHOLDER_MIN_MS)
  assert.equal(timing.showing.value, true)
  pending.value = false
  await nextTick()
  assert.equal(timing.showing.value, false)
})

test('placeholder timing: stopping the scope cancels the timers', async () => {
  const { scope, timing } = started()
  scope.stop()
  await advance(PLACEHOLDER_DELAY_MS + PLACEHOLDER_MIN_MS)
  assert.equal(timing.showing.value, false)
})
