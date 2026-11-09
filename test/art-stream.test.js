import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const WEB_ROOT = fileURLToPath(new URL('../src/web', import.meta.url))
const VUE = fileURLToPath(new URL('../node_modules/vue/dist/vue.esm-browser.prod.js', import.meta.url))
const API_STUB = `data:text/javascript,${encodeURIComponent('export const api = async () => ({ stamps: {} })')}`

registerHooks({
  resolve: (specifier, context, nextResolve) => {
    const fromWeb = context.parentURL?.startsWith(pathToFileURL(WEB_ROOT).href)
    if (!fromWeb || !specifier.startsWith('/')) return nextResolve(specifier, context)
    if (specifier === '/vendor/vue.esm-browser.prod.js') return nextResolve(pathToFileURL(VUE).href, context)
    if (specifier === '/shared/api.js') return nextResolve(API_STUB, context)
    return nextResolve(pathToFileURL(`${WEB_ROOT}${specifier}`).href, context)
  },
})

const { ref } = await import(pathToFileURL(VUE).href)
const { createArtStream } = await import('../src/web/shared/art-stream.js')
const { applyResolvedArt, artResolvedTickOf, stampedShowImage } = await import('../src/web/shared/artwork-stamps.js')
const { showImageUrlOf } = await import('../src/web/artwork-stamps.js')

const harness = () => {
  const sources = []
  class FakeEventSource {
    constructor(url) {
      this.url = url
      this.listeners = {}
      this.closed = false
      sources.push(this)
    }
    addEventListener(name, listener) { this.listeners[name] = listener }
    close() { this.closed = true }
    emit(name, data) { this.listeners[name]?.({ data: JSON.stringify(data) }) }
  }
  const doc = {
    visibilityState: 'visible',
    listeners: new Set(),
    addEventListener: (name, listener) => doc.listeners.add(listener),
    removeEventListener: (name, listener) => doc.listeners.delete(listener),
    show: (state) => {
      doc.visibilityState = state
      doc.listeners.forEach((listener) => listener())
    },
  }
  const timers = []
  const changes = []
  const resets = []
  const connected = ref(false)
  const stream = createArtStream({
    eventSourceOf: () => FakeEventSource,
    doc,
    onArt: (stamps) => changes.push(...stamps),
    onReset: (reset) => resets.push(reset),
    connected,
    setTimer: (run, ms) => timers.push({ run, ms }),
    clearTimer: () => {},
  })
  return { stream, sources, doc, timers, changes, resets, connected, last: () => sources.at(-1) }
}

test('one stream opens while visible, closes when hidden, and reopens with the since cursor', () => {
  const { stream, sources, doc, changes, resets, connected, last } = harness()
  stream.start()
  stream.start()
  assert.equal(sources.length, 1)
  assert.equal(last().url, '/api/activity/stream?topics=art')
  last().emit('art', { cursor: 'b1.0', reset: false, stamps: [] })
  assert.equal(connected.value, true)
  assert.deepEqual(resets, [{ reload: false }])
  last().emit('art', { cursor: 'b1.2', reset: false, stamps: [{ key: 'bluey', kind: 'poster', stamp: null }] })
  assert.deepEqual(changes, [{ key: 'bluey', kind: 'poster', stamp: null }])
  doc.show('hidden')
  assert.equal(sources[0].closed, true)
  assert.equal(connected.value, false)
  doc.show('visible')
  assert.equal(sources.length, 2)
  assert.equal(last().url, '/api/activity/stream?topics=art&since=b1.2')
  last().emit('art', { cursor: 'b2.0', reset: true, stamps: [] })
  assert.deepEqual(resets.at(-1), { reload: true })
  stream.stop()
  assert.equal(last().closed, true)
})

test('an error closes the stream and reconnects later with backoff and the cursor', () => {
  const { stream, sources, timers, last } = harness()
  stream.start()
  last().emit('art', { cursor: 'b1.4', reset: false, stamps: [] })
  last().onerror()
  assert.equal(sources[0].closed, true)
  assert.equal(timers[0].ms, 1000)
  timers[0].run()
  assert.equal(last().url, '/api/activity/stream?topics=art&since=b1.4')
  last().onerror()
  assert.equal(timers[1].ms, 3000)
  stream.stop()
})

test('a jobs listener shares the same stream: it reopens with the jobs topic and back without it', () => {
  const { stream, sources, last } = harness()
  stream.start()
  last().emit('art', { cursor: 'b1.1', reset: false, stamps: [] })
  const seen = []
  const stopJobs = stream.onJobs((jobs) => seen.push(jobs.runningCount))
  assert.equal(sources.length, 2)
  assert.equal(sources[0].closed, true)
  assert.equal(last().url, '/api/activity/stream?topics=art%2Cjobs&since=b1.1')
  last().emit('jobs', { runningCount: 2 })
  assert.deepEqual(seen, [2])
  stopJobs()
  assert.equal(last().url, '/api/activity/stream?topics=art&since=b1.1')
  stream.stop()
})

test('a resolved picture with a stamp restamps its URL; one without bumps only its own tick', () => {
  const poster = showImageUrlOf({ title: 'Heat', shape: 'poster' })
  const background = showImageUrlOf({ title: 'Heat' })
  assert.equal(artResolvedTickOf({ url: poster }), 0)
  applyResolvedArt([{ key: 'heat', kind: 'poster', stamp: null }])
  assert.equal(artResolvedTickOf({ url: poster }), 1)
  assert.equal(artResolvedTickOf({ url: background }), 0)
  assert.equal(artResolvedTickOf({ url: '/api/epg/image/7', title: 'Heat', shape: 'poster' }), 1)
  applyResolvedArt([{ key: 'heat', kind: 'background', stamp: 'r9' }])
  assert.equal(stampedShowImage(background), '/api/epg/show-image?title=Heat&c=r9')
  assert.equal(artResolvedTickOf({ url: background }), 1)
})
