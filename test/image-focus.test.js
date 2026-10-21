import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createImageFocus, facesFromScores, focusOf, suppressOverlaps } from '../src/image-focus.js'
import { focusKeyOf, isFocusImagePath, objectPositionOf, requestedWidthOf } from '../src/web/image-focus.js'

const WIDE = { width: 768, height: 432 }
const PHONE_HERO = { width: 390, height: 488 }
const DESKTOP_HERO = { width: 1200, height: 360 }
const CARD = { width: 320, height: 180 }
const POSTER = { width: 200, height: 300 }

const visibleRangeOf = ({ natural, view, position, axis }) => {
  const scale = Math.max(view.width / natural.width, view.height / natural.height)
  const size = (axis === 'x' ? natural.width : natural.height) * scale
  const length = axis === 'x' ? view.width : view.height
  const percent = parseFloat(position.split(' ')[axis === 'x' ? 0 : 1])
  const start = ((size - length) * percent) / 100
  return [start / size, (start + length) / size]
}

const contains = (range, [start, end]) => range[0] <= start + 0.005 && range[1] >= end - 0.005

const fakeResponse = (contentType = 'image/webp') => ({ statusCode: 200, get: () => contentType })

const waitForDrain = async (focus) => {
  await new Promise((resolve) => setTimeout(resolve, 5))
  await focus.settle()
}

const createQueue = (overrides = {}) => {
  const calls = []
  const saved = []
  const focus = createImageFocus({
    loadRows: async () => [],
    saveRow: async (row) => { saved.push(row) },
    isEnabled: async () => true,
    readHeadroomMb: async () => 2000,
    detect: async (jobs) => {
      calls.push(jobs.map((job) => job.urlKey))
      return new Map(jobs.map((job) => [job.urlKey, { faces: [{ score: 0.99, box: [0.7, 0.2, 0.8, 0.4] }] }]))
    },
    delayMs: 0,
    pauseMs: 0,
    ...overrides,
  })
  return { focus, calls, saved }
}

test('focusKeyOf drops the width and stamp and sorts the query', () => {
  assert.equal(focusKeyOf('/api/epg/show-image?w=768&title=Merlin&c=abc'), '/api/epg/show-image?title=Merlin')
  assert.equal(focusKeyOf('http://localhost/api/epg/image/123?w=192'), '/api/epg/image/123')
  assert.equal(focusKeyOf('/api/epg/show-image?title=A%20B&kind=film'), '/api/epg/show-image?kind=film&title=A+B')
  assert.equal(focusKeyOf('/api/epg/show-image?title=A+B&kind=film'), focusKeyOf('/api/epg/show-image?kind=film&title=A%20B'))
})

test('focusKeyOf ignores channel logos, other paths, and other hosts', () => {
  assert.equal(focusKeyOf('/api/epg/logo/5?w=96'), null)
  assert.equal(focusKeyOf('/icon-192.png'), null)
  assert.equal(focusKeyOf('https://example.com/api/epg/image/1', 'http://localhost'), null)
  assert.equal(focusKeyOf('not a url ::', 'nope'), null)
})

test('isFocusImagePath covers every picture route', () => {
  assert.ok(isFocusImagePath('/api/recordings/abc/image'))
  assert.ok(isFocusImagePath('/api/library/shows/merlin/art-pool/1f2e'))
  assert.ok(isFocusImagePath('/api/library/recordings/abc/art/1f2e'))
  assert.ok(isFocusImagePath('/api/library/shows/merlin/artwork-candidates/9'))
  assert.ok(isFocusImagePath('/api/epg/person-image'))
  assert.ok(!isFocusImagePath('/api/library/shows/merlin/art-pool'))
})

test('requestedWidthOf reads w and returns null without it', () => {
  assert.equal(requestedWidthOf('/api/epg/image/1?w=384'), 384)
  assert.equal(requestedWidthOf('/api/recordings/1/image'), null)
})

test('objectPositionOf keeps a face at the right edge in a phone hero', () => {
  const focus = { x: 0.85, y: 0.3, box: [0.78, 0.15, 0.92, 0.5] }
  const position = objectPositionOf({ natural: WIDE, view: PHONE_HERO, focus })
  assert.ok(contains(visibleRangeOf({ natural: WIDE, view: PHONE_HERO, position, axis: 'x' }), [0.78, 0.92]))
  assert.equal(position.split(' ')[1], '50%')
})

test('objectPositionOf centres the keep box in a 16:9 card and a 2:3 poster', () => {
  const focus = { x: 0.2, y: 0.3, box: [0.1, 0.1, 0.3, 0.6] }
  for (const view of [CARD, POSTER, PHONE_HERO, DESKTOP_HERO]) {
    const position = objectPositionOf({ natural: WIDE, view, focus })
    assert.ok(contains(visibleRangeOf({ natural: WIDE, view, position, axis: 'x' }), [0.1, 0.3]), `${view.width}x${view.height} ${position}`)
  }
})

test('objectPositionOf keeps every face of a group that fits', () => {
  const focus = { x: 0.5, y: 0.3, box: [0.3, 0.1, 0.7, 0.6] }
  const position = objectPositionOf({ natural: { width: 768, height: 432 }, view: { width: 300, height: 300 }, focus })
  assert.ok(contains(visibleRangeOf({ natural: WIDE, view: { width: 300, height: 300 }, position, axis: 'x' }), [0.3, 0.7]))
})

test('objectPositionOf centres on the largest face when the group is too wide', () => {
  const focus = { x: 0.65, y: 0.3, box: [0.05, 0.1, 0.95, 0.6] }
  const position = objectPositionOf({ natural: WIDE, view: PHONE_HERO, focus })
  const [start, end] = visibleRangeOf({ natural: WIDE, view: PHONE_HERO, position, axis: 'x' })
  assert.ok(Math.abs((start + end) / 2 - 0.65) < 0.01)
})

test('objectPositionOf keeps the upper face when a face is taller than the frame', () => {
  const focus = { x: 0.5, y: 0.35, box: [0.3, 0.05, 0.7, 0.98] }
  const position = objectPositionOf({ natural: WIDE, view: DESKTOP_HERO, focus })
  const [start, end] = visibleRangeOf({ natural: WIDE, view: DESKTOP_HERO, position, axis: 'y' })
  assert.ok(start <= 0.35 && end >= 0.35)
  assert.ok(start > 0.05)
  assert.ok(Math.abs(start + (end - start) * 0.4 - 0.35) < 0.01)
})

test('objectPositionOf moves faces away from the text area when they fit', () => {
  const focus = { x: 0.5, y: 0.5, box: [0.45, 0.42, 0.55, 0.6] }
  const plain = objectPositionOf({ natural: WIDE, view: DESKTOP_HERO, focus })
  const avoiding = objectPositionOf({ natural: WIDE, view: DESKTOP_HERO, focus, avoid: { bottom: 0.35 } })
  const plainRange = visibleRangeOf({ natural: WIDE, view: DESKTOP_HERO, position: plain, axis: 'y' })
  const avoidRange = visibleRangeOf({ natural: WIDE, view: DESKTOP_HERO, position: avoiding, axis: 'y' })
  assert.ok(avoidRange[0] > plainRange[0])
  const textTop = avoidRange[0] + (avoidRange[1] - avoidRange[0]) * 0.65
  assert.ok(textTop >= 0.6 - 1e-6)
})

test('objectPositionOf keeps all faces in view when the text area leaves too little room', () => {
  const focus = { x: 0.5, y: 0.4, box: [0.4, 0.25, 0.6, 0.7] }
  const position = objectPositionOf({ natural: WIDE, view: DESKTOP_HERO, focus, avoid: { bottom: 0.35 } })
  const range = visibleRangeOf({ natural: WIDE, view: DESKTOP_HERO, position, axis: 'y' })
  assert.ok(contains(range, [0.25, 0.7]))
  assert.ok(Math.abs(range[0] - 0.25) < 0.01)
})

test('objectPositionOf uses a point focus and leaves unknown sizes alone', () => {
  const position = objectPositionOf({ natural: WIDE, view: PHONE_HERO, focus: { x: 0.9, y: 0.5, box: null } })
  assert.equal(position, '100% 50%')
  assert.equal(objectPositionOf({ natural: WIDE, view: WIDE, focus: { x: 0.9, y: 0.1, box: null } }), '50% 50%')
  assert.equal(objectPositionOf({ natural: { width: 0, height: 0 }, view: CARD, focus: { x: 0.5, y: 0.5 } }), null)
  assert.equal(objectPositionOf({ natural: WIDE, view: CARD, focus: null }), null)
})

test('focusOf groups the main faces and drops small background faces', () => {
  const focus = focusOf({
    faces: [
      { score: 0.99, box: [0.4, 0.1, 0.6, 0.5] },
      { score: 0.95, box: [0.7, 0.2, 0.82, 0.45] },
      { score: 0.9, box: [0.05, 0.05, 0.08, 0.1] },
    ],
  })
  assert.equal(focus.method, 'faces')
  assert.equal(focus.x, 0.5)
  assert.equal(focus.y, 0.26)
  assert.ok(focus.box[0] > 0.3 && focus.box[2] > 0.82)
  assert.ok(focus.box[0] > 0.08)
})

test('focusOf falls back to the attention point, then the centre', () => {
  assert.deepEqual(focusOf({ faces: [], attention: { x: 0.25, y: 1.4 } }), { x: 0.25, y: 1, box: null, method: 'attention' })
  assert.deepEqual(focusOf({}), { x: 0.5, y: 0.5, box: null, method: 'centre' })
})

test('suppressOverlaps keeps the best of overlapping boxes', () => {
  const kept = suppressOverlaps([
    { score: 0.8, box: [0.1, 0.1, 0.3, 0.3] },
    { score: 0.99, box: [0.11, 0.1, 0.31, 0.3] },
    { score: 0.9, box: [0.6, 0.1, 0.8, 0.3] },
  ])
  assert.deepEqual(kept.map((face) => face.score), [0.99, 0.9])
})

test('facesFromScores keeps confident faces and drops tiny ones', () => {
  const scores = Float32Array.from([0.1, 0.9, 0.5, 0.5, 0.05, 0.95])
  const boxes = Float32Array.from([0.1, 0.1, 0.3, 0.4, 0.5, 0.5, 0.6, 0.6, 0.7, 0.7, 0.705, 0.71])
  const faces = facesFromScores({ scores, boxes })
  assert.equal(faces.length, 1)
  assert.deepEqual(faces[0].box.map((value) => Math.round(value * 100) / 100), [0.1, 0.1, 0.3, 0.4])
})

test('the queue detects a served picture once and answers lookups', async () => {
  const { focus, calls, saved } = createQueue()
  const body = Buffer.from('picture one')
  assert.ok(focus.noteServed({ url: '/api/epg/show-image?title=Merlin&w=768', body }))
  await waitForDrain(focus)
  assert.deepEqual(calls, [['/api/epg/show-image?title=Merlin']])
  assert.equal(saved[0].method, 'faces')
  assert.equal(focus.noteServed({ url: '/api/epg/show-image?title=Merlin&w=768&c=1', body }), false)
  assert.equal(focus.noteServed({ url: '/api/epg/show-image?title=Merlin&w=384', body: Buffer.from('smaller') }), false)
  const { enabled, items } = await focus.lookup(['/api/epg/show-image?title=Merlin', '/api/epg/image/9'])
  assert.equal(enabled, true)
  assert.deepEqual(Object.keys(items), ['/api/epg/show-image?title=Merlin'])
})

test('the queue detects again when the picture changes', async () => {
  const { focus, calls } = createQueue()
  focus.noteServed({ url: '/api/epg/image/1?w=384', body: Buffer.from('first') })
  await waitForDrain(focus)
  assert.ok(focus.noteServed({ url: '/api/epg/image/1?w=384', body: Buffer.from('second') }))
  await waitForDrain(focus)
  assert.equal(calls.length, 2)
})

test('the queue skips work when turned off and answers lookups with nothing', async () => {
  const { focus, calls } = createQueue({ isEnabled: async () => false })
  focus.noteServed({ url: '/api/epg/image/1?w=384', body: Buffer.from('first') })
  await waitForDrain(focus)
  assert.deepEqual(calls, [])
  assert.equal(focus.stats().pending, 0)
  assert.deepEqual(await focus.lookup(['/api/epg/image/1']), { enabled: false, items: {} })
})

test('the queue waits while free memory is under 400 MB', async () => {
  const { focus, calls } = createQueue({ readHeadroomMb: async () => 300 })
  focus.noteServed({ url: '/api/epg/image/1?w=384', body: Buffer.from('first') })
  await waitForDrain(focus)
  assert.deepEqual(calls, [])
  assert.equal(focus.stats().pending, 1)
})

test('the queue pauses after the detector fails', async () => {
  let attempts = 0
  const { focus } = createQueue({ detect: async () => { attempts += 1; throw new Error('crashed') } })
  focus.noteServed({ url: '/api/epg/image/1?w=384', body: Buffer.from('first') })
  await waitForDrain(focus)
  focus.noteServed({ url: '/api/epg/image/2?w=384', body: Buffer.from('second') })
  await waitForDrain(focus)
  assert.equal(attempts, 1)
})

test('the queue runs batches of the configured size', async () => {
  const { focus, calls } = createQueue({ batchSize: 2 })
  for (const id of [1, 2, 3]) focus.noteServed({ url: `/api/epg/image/${id}?w=192`, body: Buffer.from(`p${id}`) })
  await waitForDrain(focus)
  await waitForDrain(focus)
  assert.deepEqual(calls.map((batch) => batch.length), [2, 1])
})

test('the tap notes pictures only for successful image responses', () => {
  const { focus } = createQueue({ delayMs: 60_000 })
  const sent = []
  const run = ({ path, res }) => {
    const req = { method: 'GET', path, originalUrl: `${path}?w=192` }
    const response = { ...res, send: (body) => { sent.push(body) } }
    focus.tap(req, response, () => {})
    response.send(Buffer.from(`body of ${path}`))
  }
  run({ path: '/api/epg/image/1', res: fakeResponse() })
  run({ path: '/api/epg/image/2', res: fakeResponse('image/svg+xml') })
  run({ path: '/api/epg/logo/3', res: fakeResponse() })
  assert.equal(sent.length, 3)
  assert.equal(focus.stats().pending, 1)
})

test('the stylesheet hides every focus picture path until it is placed', async () => {
  const { readFile } = await import('node:fs/promises')
  const css = await readFile(new URL('../src/web/styles.css', import.meta.url), 'utf8')
  const rule = css.split('\n').find((line) => line.includes(':not(.is-focus-ready)'))
  const prefixes = [...rule.matchAll(/\[src\^="([^"]+)"\]/g)].map((match) => match[1])
  const samples = [
    '/api/epg/image/1',
    '/api/epg/show-image?title=Merlin',
    '/api/epg/person-image?src=x',
    '/api/recordings/abc/image',
    '/api/library/shows/merlin/art-pool/1f2e',
    '/api/library/recordings/abc/art/1f2e',
    '/api/library/shows/merlin/artwork-candidates/9',
  ]
  for (const sample of samples) {
    assert.ok(isFocusImagePath(new URL(sample, 'http://localhost').pathname), sample)
    assert.ok(prefixes.some((prefix) => sample.startsWith(prefix)), sample)
  }
})
