import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const WEB_ROOT = fileURLToPath(new URL('../src/web', import.meta.url))
const VUE = fileURLToPath(new URL('../node_modules/vue/dist/vue.esm-browser.prod.js', import.meta.url))
const stub = (code) => `data:text/javascript,${encodeURIComponent(code)}`
const STUBS = {
  '/shared/api.js': stub('export const api = async () => ({ stamps: {} })'),
  '/shared/image-focus.js': stub('export const primeImageFocus = () => {}; export const showLoadedImage = () => {}'),
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

const { effectScope, nextTick } = await import(pathToFileURL(VUE).href)
const { TitleArt } = await import('../src/web/components/title-art.js')
const { artStreamConnected } = await import('../src/web/shared/art-stream.js')
const { applyResolvedArt } = await import('../src/web/shared/artwork-stamps.js')

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve))
  await nextTick()
}

const mountArt = (src) => {
  const scope = effectScope()
  const state = scope.run(() => TitleArt.setup({ title: 'Gruen', shape: 'poster', src, fallbackSrc: '' }))
  return { state, stop: () => scope.stop() }
}

const answering = (states) => {
  const asked = []
  globalThis.fetch = async (url, options) => {
    asked.push(options.method)
    const state = states.shift() ?? 'pending'
    return { ok: state === 'ok', headers: { get: () => (state === 'ok' ? null : state) } }
  }
  return asked
}

test('TitleArt keeps asking with HEAD while the art stream is connected, and stops at final', async () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  artStreamConnected.value = true
  const asked = answering(['pending', 'final'])
  const { state, stop } = mountArt('/api/epg/show-image?title=Gruen&shape=poster&w=384')
  try {
    state.onError()
    assert.equal(state.failed.value, true)
    mock.timers.tick(4000)
    await flush()
    mock.timers.tick(12000)
    await flush()
    mock.timers.tick(30000)
    await flush()
    assert.deepEqual(asked, ['HEAD', 'HEAD'])
    assert.equal(state.failed.value, true)
    const again = mountArt('/api/epg/show-image?title=Gruen&shape=poster&w=384')
    assert.equal(again.state.failed.value, true)
    again.stop()
  } finally {
    stop()
    artStreamConnected.value = false
    mock.timers.reset()
  }
})

test('TitleArt shows the picture once a resolve event arrives and the picture loads', async () => {
  answering([])
  globalThis.Image = class {
    set src(url) { if (url) setImmediate(() => this.onload()) }
  }
  const { state, stop } = mountArt('/api/epg/show-image?title=Utopia&shape=poster&w=384')
  try {
    state.onError()
    assert.equal(state.failed.value, true)
    applyResolvedArt([{ key: 'utopia', kind: 'poster', stamp: null }])
    await flush()
    assert.equal(state.failed.value, false)
    assert.equal(state.attempt.value, 1)
  } finally {
    stop()
  }
})

test('a final miss is forgotten when its picture resolves while no tile shows it, so a remount loads the picture', async () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  answering(['final'])
  const url = '/api/epg/show-image?title=Rake&shape=poster&w=384'
  try {
    const first = mountArt(url)
    first.state.onError()
    mock.timers.tick(4000)
    await flush()
    first.stop()
    assert.equal(mountArt(url).state.failed.value, true)
    applyResolvedArt([{ key: 'rake', kind: 'poster', stamp: null }])
    const again = mountArt(url)
    assert.equal(again.state.failed.value, false)
    again.stop()
  } finally {
    mock.timers.reset()
  }
})
