import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FOCUS_VERSION, columnDetailOf, createImageFocus, facesFromScores, focusOf, pillarBandOf, refreshUrlOf, servedVerdictOf, staleRowsOf,
  suppressOverlaps, warmPlanOf,
} from '../src/image-focus.js'
import {
  FOCUS_RECHECK_DELAYS_MS, dueRechecksOf, focusEntriesOf, focusKeyOf, focusPointInViewOf, isFocusImagePath, objectPositionOf, recheckDelayOf, requestedWidthOf,
} from '../src/web/image-focus.js'

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

test('focusEntriesOf keys supplied focus by picture, ignoring width and pictures without focus', () => {
  const focus = { x: 0.2, y: 0.425, box: [0.096, 0.184, 0.304, 0.752] }
  const pictures = [
    { url: '/api/recordings/a07b/image?w=768', focus },
    { url: '/api/epg/image/1', focus: null },
    { url: 'https://elsewhere.example/a.jpg', focus },
    { url: '/api/epg/show-image?w=1280&title=The%20Block', focus: { x: 0.5, y: 0.5 } },
  ]
  assert.deepEqual(focusEntriesOf(pictures, 'http://nas:3744'), [
    ['/api/recordings/a07b/image', focus],
    ['/api/epg/show-image?title=The+Block', { x: 0.5, y: 0.5 }],
  ])
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

test('the picture fade keeps the hover zoom transition of a fading picture', async () => {
  const { readFile } = await import('node:fs/promises')
  const read = (path) => readFile(new URL(`../src/web/${path}`, import.meta.url), 'utf8')
  const fadingRule = (await read('styles.css')).match(/img\.is-focus-fading \{([^}]*)\}/)[1]
  assert.match(fadingRule, /transition: var\(--picture-fade\), var\(--picture-motion, transform 0s\);/)
  for (const path of ['styles/base.css', 'styles/recordings.css']) {
    const css = await read(path)
    const zoomTransitions = [...css.matchAll(/transition: transform 320ms[^;]*;/g)]
    assert.equal(zoomTransitions.length, 0, path)
    assert.match(css, /--picture-motion: transform 320ms var\(--ease-standard\);\s*transition: var\(--picture-motion\);/, path)
  }
})

const pillarboxPixels = ({ width, height, start, end }) => {
  const pixels = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inBand = x >= start && x < end
      pixels[y * width + x] = inBand ? ((x * 37 + y * 91) % 200) : 60 + Math.round(x / 8)
    }
  }
  return pixels
}

const BAND_SIZE = { width: 192, height: 108 }

const detailOf = (start, end) => columnDetailOf({ pixels: pillarboxPixels({ ...BAND_SIZE, start, end }), ...BAND_SIZE })

test('pillarBandOf finds the sharp portrait band between two blurred pillars', () => {
  const band = pillarBandOf(detailOf(60, 132))
  assert.ok(band, 'band')
  assert.ok(Math.abs(band[0] - 60 / 192) < 0.02 && Math.abs(band[1] - 132 / 192) < 0.02, JSON.stringify(band))
  assert.equal(band[0] + band[1], 1)
})

test('pillarBandOf ignores full-frame pictures, off-centre bands, and wide bands', () => {
  assert.equal(pillarBandOf(detailOf(0, 192)), null)
  assert.equal(pillarBandOf(detailOf(20, 92)), null)
  assert.equal(pillarBandOf(detailOf(10, 182)), null)
  assert.equal(pillarBandOf(new Array(192).fill(1)), null)
})

test('focusOf centres a portrait composite and keeps the vertical focus', () => {
  const band = [0.307, 0.693]
  assert.deepEqual(focusOf({ attention: { x: 0.531, y: 0.405 }, band }), { x: 0.5, y: 0.405, box: [0.307, 0.405, 0.693, 0.405], method: 'attention' })
  const faces = [{ score: 0.9, box: [0.6, 0.2, 0.66, 0.32] }]
  const withFaces = focusOf({ faces, band })
  assert.equal(withFaces.x, 0.5)
  assert.deepEqual([withFaces.box[0], withFaces.box[2]], band)
  assert.equal(withFaces.box[1], focusOf({ faces }).box[1])
  assert.deepEqual(focusOf({ band }), { x: 0.5, y: 0.5, box: null, method: 'centre' })
})

test('objectPositionOf centres a portrait composite in a phone hero and leaves wide views alone', () => {
  const composite = focusOf({ attention: { x: 0.531, y: 0.405 }, band: [0.307, 0.693] })
  const plain = focusOf({ attention: { x: 0.531, y: 0.405 } })
  const showHero = { width: 390, height: 420 }
  assert.equal(objectPositionOf({ natural: WIDE, view: showHero, focus: composite }), '50% 50%')
  assert.equal(objectPositionOf({ natural: WIDE, view: PHONE_HERO, focus: composite }), '50% 50%')
  assert.equal(objectPositionOf({ natural: WIDE, view: { width: 120, height: 180 }, focus: composite }), '50% 50%')
  assert.notEqual(objectPositionOf({ natural: WIDE, view: showHero, focus: plain }).split(' ')[0], '50%')
  assert.equal(
    objectPositionOf({ natural: WIDE, view: DESKTOP_HERO, focus: composite }),
    objectPositionOf({ natural: WIDE, view: DESKTOP_HERO, focus: plain }),
  )
})

test('warmPlanOf promotes pending pictures, renders unknown ones, and skips known or recently tried ones', () => {
  const plan = warmPlanOf({
    keys: ['/a', '/b', '/c', '/d', '/a', null],
    isKnown: (key) => key === '/c',
    isPending: (key) => key === '/b',
    wasTried: (key) => key === '/d',
  })
  assert.deepEqual(plan, { promote: ['/b'], render: ['/a'] })
  const many = warmPlanOf({ keys: ['/1', '/2', '/3'], isKnown: () => false, isPending: () => false, wasTried: () => false, limit: 2 })
  assert.deepEqual(many.render, ['/1', '/2'])
})

test('a warm lookup renders a missing hero picture and detects it ahead of the normal delay', async () => {
  const rendered = []
  const { focus, calls } = createQueue({
    delayMs: 60_000,
    urgentDelayMs: 0,
    warmStartMs: 0,
    render: async (url) => { rendered.push(url); return Buffer.from(`body of ${url}`) },
  })
  const answer = await focus.lookup(['/api/epg/show-image?title=Chefs+Ahoy'], { warmMissing: true })
  assert.deepEqual(answer.items, {})
  await focus.settleWarming()
  await new Promise((resolve) => setTimeout(resolve, 20))
  await focus.settle()
  assert.deepEqual(rendered, ['/api/epg/show-image?title=Chefs+Ahoy&w=768'])
  assert.deepEqual(calls, [['/api/epg/show-image?title=Chefs+Ahoy']])
  const again = await focus.lookup(['/api/epg/show-image?title=Chefs+Ahoy'], { warmMissing: true })
  assert.ok(again.items['/api/epg/show-image?title=Chefs+Ahoy'])
  assert.equal(rendered.length, 1)
})

test('a warm lookup moves an already served picture to the front of the queue', async () => {
  const { focus, calls } = createQueue({ delayMs: 60_000, urgentDelayMs: 0, warmStartMs: 0, batchSize: 1 })
  focus.noteServed({ url: '/api/epg/image/1?w=192', body: Buffer.from('row') })
  focus.noteServed({ url: '/api/epg/image/2?w=1920', body: Buffer.from('hero') })
  await focus.warm(['/api/epg/image/2'])
  assert.deepEqual(focus.pendingKeys(), ['/api/epg/image/2', '/api/epg/image/1'])
  await waitForDrain(focus)
  assert.deepEqual(calls[0], ['/api/epg/image/2'])
})

test('a picture that fails to render is not rendered again within ten minutes', async () => {
  let nowMs = 0
  let renders = 0
  const { focus } = createQueue({ now: () => nowMs, warmStartMs: 0, render: async () => { renders += 1; return null } })
  await focus.warm(['/api/epg/image/7'])
  await focus.settleWarming()
  await focus.warm(['/api/epg/image/7'])
  await focus.settleWarming()
  assert.equal(renders, 1)
  nowMs = 11 * 60 * 1000
  await focus.warm(['/api/epg/image/7'])
  await focus.settleWarming()
  assert.equal(renders, 2)
})

test('recheckDelayOf asks again about 2, 5, and 15 seconds after the first miss, then stops', () => {
  const startedAtMs = 1000
  assert.equal(recheckDelayOf({ attempt: 0, startedAtMs, nowMs: 1150 }), 1850)
  assert.equal(recheckDelayOf({ attempt: 1, startedAtMs, nowMs: 3000 }), 3000)
  assert.equal(recheckDelayOf({ attempt: 2, startedAtMs, nowMs: 6100 }), 9900)
  assert.equal(recheckDelayOf({ attempt: 2, startedAtMs, nowMs: 20000 }), 0)
  assert.equal(recheckDelayOf({ attempt: 3, startedAtMs, nowMs: 16000 }), null)
  assert.deepEqual(FOCUS_RECHECK_DELAYS_MS, [2000, 5000, 15000])
})

test('dueRechecksOf batches keys due now or within half a second, soonest first', () => {
  const rechecks = new Map([
    ['/late', { dueAt: 9000 }],
    ['/soon', { dueAt: 5400 }],
    ['/due', { dueAt: 4000 }],
  ])
  assert.deepEqual(dueRechecksOf({ rechecks, nowMs: 5000 }), ['/due', '/soon'])
  assert.deepEqual(dueRechecksOf({ rechecks, nowMs: 5000, limit: 1 }), ['/due'])
  assert.deepEqual(dueRechecksOf({ rechecks, nowMs: 1000 }), [])
})

test('focusPointInViewOf gives the focus point as a share of the shown frame', () => {
  const natural = { width: 1920, height: 1080 }
  assert.deepEqual(focusPointInViewOf({ natural, view: natural, position: '50% 50%', focus: { x: 0.25, y: 0.4 } }), { x: 0.25, y: 0.4 })
  const view = { width: 390, height: 488 }
  const focus = { x: 0.8, y: 0.3, box: [0.7, 0.2, 0.9, 0.5] }
  const position = objectPositionOf({ natural, view, focus })
  const point = focusPointInViewOf({ natural, view, position, focus })
  assert.ok(point.x > 0 && point.x < 1, JSON.stringify(point))
  assert.equal(point.y, 0.3)
  assert.equal(focusPointInViewOf({ natural, view, position, focus: null }), null)
})

const storedRow = (over) => ({
  urlKey: '/api/epg/show-image?title=Bluey', sourceHash: 'h768', width: 768, x: 0.3, y: 0.4, box: null,
  method: 'faces', version: FOCUS_VERSION, updatedAt: 1, ...over,
})

test('servedVerdictOf detects a changed picture at any width it has seen, and only notes new widths', () => {
  const row = storedRow({ hashes: { 768: 'h768', 384: 'h384' } })
  assert.equal(servedVerdictOf({ row, width: 768, sourceHash: 'h768' }), 'skip')
  assert.equal(servedVerdictOf({ row, width: 384, sourceHash: 'new' }), 'detect')
  assert.equal(servedVerdictOf({ row, width: 1920, sourceHash: 'h1920' }), 'note-hash')
  assert.equal(servedVerdictOf({ row: null, width: 384, sourceHash: 'x' }), 'detect')
  assert.equal(servedVerdictOf({ row, width: 384, sourceHash: 'new', pendingWidth: 768 }), 'skip')
  const legacy = storedRow({ version: FOCUS_VERSION - 1 })
  assert.equal(servedVerdictOf({ row: legacy, width: 768, sourceHash: 'h768' }), 'detect')
  assert.equal(servedVerdictOf({ row: legacy, width: 192, sourceHash: 'h192' }), 'skip')
  assert.equal(servedVerdictOf({ row: legacy, width: 768, sourceHash: 'changed' }), 'detect')
})

test('the queue re-detects a picture that changed behind the same address at a smaller width', async () => {
  const { focus, calls } = createQueue()
  focus.noteServed({ url: '/api/epg/show-image?title=Bluey&w=768', body: Buffer.from('old picture at 768') })
  await waitForDrain(focus)
  assert.equal(focus.noteServed({ url: '/api/epg/show-image?title=Bluey&w=384', body: Buffer.from('old picture at 384') }), false)
  assert.equal(focus.noteServed({ url: '/api/epg/show-image?title=Bluey&w=384', body: Buffer.from('old picture at 384') }), false)
  assert.ok(focus.noteServed({ url: '/api/epg/show-image?title=Bluey&w=384', body: Buffer.from('new picture at 384') }))
  await waitForDrain(focus)
  assert.equal(calls.length, 2)
})

test('rows from an older focus version keep answering lookups and are recomputed oldest first', async () => {
  const older = FOCUS_VERSION - 1
  const stored = [
    storedRow({ urlKey: '/api/epg/image/2', updatedAt: 20, version: older, width: 384 }),
    storedRow({ urlKey: '/api/epg/image/1', updatedAt: 10, version: older, width: 1000 }),
    storedRow({ urlKey: '/api/epg/image/3', updatedAt: 5 }),
  ]
  assert.deepEqual(staleRowsOf({ rows: stored }).map((row) => row.urlKey), ['/api/epg/image/1', '/api/epg/image/2'])
  assert.equal(refreshUrlOf(stored[0]), '/api/epg/image/2?w=384')
  assert.equal(refreshUrlOf(stored[1]), '/api/epg/image/1')
  const rendered = []
  const saved = []
  const { focus, calls } = createQueue({
    loadRows: async () => stored,
    saveRow: async (row) => { saved.push(row) },
    render: async (url) => { rendered.push(url); return Buffer.from(`picture ${url}`) },
    refreshStartMs: 0,
    refreshGapMs: 0,
  })
  const before = await focus.lookup(['/api/epg/image/1', '/api/epg/image/2'])
  assert.deepEqual(Object.keys(before.items), ['/api/epg/image/1', '/api/epg/image/2'])
  await focus.startRefresh()
  await waitForDrain(focus)
  assert.deepEqual(rendered, ['/api/epg/image/1', '/api/epg/image/2?w=384'])
  assert.deepEqual(calls.flat().sort(), ['/api/epg/image/1', '/api/epg/image/2'])
  assert.ok(saved.every((row) => row.version === FOCUS_VERSION))
})

test('focusStatusOf: pending until detection finishes, then settled with the focus, and listeners hear it', async () => {
  const { focus } = createQueue()
  const heard = []
  focus.onSettled((key) => heard.push(key))
  const url = '/api/epg/image/41?w=1920'
  focus.noteServed({ url, body: Buffer.from('picture 41') })
  assert.deepEqual(await focus.focusStatusOf(url), { settled: false, focus: null })
  await waitForDrain(focus)
  const settled = await focus.focusStatusOf(url)
  assert.equal(settled.settled, true)
  assert.ok(settled.focus && Number.isFinite(settled.focus.x))
  assert.deepEqual(heard, ['/api/epg/image/41'])
})

test('focusStatusOf: settled at once with no focus when Keep faces in view is off or the url has no focus key', async () => {
  const { focus, calls } = createQueue({ isEnabled: async () => false })
  const url = '/api/epg/image/42?w=1920'
  focus.noteServed({ url, body: Buffer.from('picture 42') })
  assert.deepEqual(await focus.focusStatusOf(url), { settled: true, focus: null })
  assert.deepEqual(await createQueue().focus.focusStatusOf('/api/epg/logo/1?w=96'), { settled: true, focus: null })
  await waitForDrain(focus)
  assert.deepEqual(calls, [])
})

test('focusStatusOf: a failed or timed-out detector settles the picture with no focus and tells listeners', async () => {
  const { focus } = createQueue({ detect: async () => { throw new Error('worker timed out') } })
  const heard = []
  focus.onSettled((key) => heard.push(key))
  const url = '/api/epg/image/43?w=1920'
  focus.noteServed({ url, body: Buffer.from('picture 43') })
  await waitForDrain(focus)
  assert.deepEqual(await focus.focusStatusOf(url), { settled: true, focus: null })
  assert.deepEqual(heard, ['/api/epg/image/43'])
})

test('focusStatusOf: too little memory to detect settles waiting pictures with no focus', async () => {
  const { focus, calls } = createQueue({ readHeadroomMb: async () => 10 })
  const url = '/api/epg/image/44?w=1920'
  focus.noteServed({ url, body: Buffer.from('picture 44') })
  await waitForDrain(focus)
  assert.deepEqual(await focus.focusStatusOf(url), { settled: true, focus: null })
  assert.deepEqual(calls, [])
})
