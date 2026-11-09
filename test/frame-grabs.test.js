import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

import {
  adAwareOffsetsOf,
  adPlanOf,
  createFrameGrabs,
  frameDistanceOf,
  framePreferenceOrderOf,
  isAdFreeChannel,
  isNearBreak,
  programmeSegmentsOf,
  distinctFramesOf,
  steadyFrameOf,
  frameArgsOf,
  frameIdOf,
  frameLevelsOf,
  frameOffsetsOf,
  frameOriginOf,
  isUsableFrame,
  niceCommandOf,
} from '../src/frame-grabs.js'

const makeRoot = () => fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-frames-'))

const solidJpeg = (value) => sharp({ create: { width: 64, height: 36, channels: 3, background: { r: value, g: value, b: value } } }).jpeg().toBuffer()

const noisyJpeg = () => {
  const pixels = Buffer.alloc(64 * 36 * 3)
  for (let at = 0; at < pixels.length; at++) pixels[at] = (at * 97) % 256
  return sharp(pixels, { raw: { width: 64, height: 36, channels: 3 } }).jpeg().toBuffer()
}

const CLEAR = { state: 'clear', breaks: [] }
const AD_FREE = { state: 'ad-free', breaks: [] }

const grabsWith = async ({ frames = [], hasFfmpeg = true, canRead = true, durationS = 3600, onGrabbed = () => {}, fingerprintOf } = {}) => {
  const root = await makeRoot()
  const offsets = []
  const queue = [...frames]
  const grabs = createFrameGrabs({
    root,
    grab: async (args) => {
      offsets.push(Number(args[args.indexOf('-ss') + 1]))
      const next = queue.shift()
      if (next instanceof Error) throw next
      return next ?? null
    },
    probe: async () => durationS,
    hasFfmpeg: async () => hasFfmpeg,
    canRead: async () => canRead,
    onGrabbed,
    ...(fingerprintOf ? { fingerprintOf } : {}),
  })
  return { grabs, root, offsets }
}

test('frameArgsOf: seeks before the input, takes one deinterlaced frame at display aspect, and writes a JPEG to stdout', () => {
  const args = frameArgsOf({ filePath: '/recordings/Bluey/S01E01.ts', offsetS: 450 })
  assert.deepEqual(args.slice(0, 8), ['-hide_banner', '-loglevel', 'error', '-nostdin', '-ss', '450', '-i', '/recordings/Bluey/S01E01.ts'])
  assert.ok(args.indexOf('-ss') < args.indexOf('-i'))
  assert.equal(args[args.indexOf('-frames:v') + 1], '1')
  const filter = args[args.indexOf('-vf') + 1]
  assert.match(filter, /^yadif=deint=interlaced,/)
  assert.match(filter, /ih\*dar/)
  assert.match(filter, /min\(1280,iw\)/)
  assert.deepEqual(args.slice(-5), ['-f', 'image2', '-c:v', 'mjpeg', 'pipe:1'])
})

test('niceCommandOf: runs ffmpeg at the lowest priority', () => {
  assert.deepEqual(niceCommandOf(['-version']), { command: 'nice', args: ['-n', '19', 'ffmpeg', '-version'] })
})

test('frameOffsetsOf: skips the padding and seeks about a quarter of the way into the programme', () => {
  assert.deepEqual(frameOffsetsOf({ fileDurationS: 4200, programmeDurationS: 3600 }), [1200, 1740, 2460])
  assert.deepEqual(frameOffsetsOf({ fileDurationS: 1800 }), [450, 720, 1080])
  assert.deepEqual(frameOffsetsOf({ programmeDurationS: 1800 }), [450, 720, 1080])
  assert.deepEqual(frameOffsetsOf({ fileDurationS: 1000, programmeDurationS: 3600 }), [250, 400, 600])
  assert.deepEqual(frameOffsetsOf({}), [120, 300, 600])
})

test('isUsableFrame: rejects black, white, and flat frames', async () => {
  assert.equal(isUsableFrame(await frameLevelsOf(await solidJpeg(0))), false)
  assert.equal(isUsableFrame(await frameLevelsOf(await solidJpeg(255))), false)
  assert.equal(isUsableFrame(await frameLevelsOf(await solidJpeg(128))), false)
  assert.equal(isUsableFrame(await frameLevelsOf(await noisyJpeg())), true)
})

test('a black first frame tries the next offset and saves the first usable frame', async () => {
  const grabbed = []
  const { grabs, root, offsets } = await grabsWith({ frames: [await solidJpeg(0), await noisyJpeg()], onGrabbed: (file) => grabbed.push(file) })
  const ready = []
  const first = await grabs.frameFor({ filePath: '/r/a.ts', programmeDurationS: 3600, adPlan: CLEAR, onReady: () => ready.push(true) })
  assert.deepEqual(first, { sources: [], pending: true })
  await grabs.idle()
  assert.deepEqual(offsets, [1800, 1088])
  assert.deepEqual((await fs.readdir(root)).sort(), [`${frameIdOf('/r/a.ts')}.jpg`, `${frameIdOf('/r/a.ts')}.json`])
  assert.deepEqual(ready, [true])
  assert.deepEqual(grabbed, [{ filePath: '/r/a.ts' }])
  assert.deepEqual(await grabs.frameFor({ filePath: '/r/a.ts' }), { sources: [frameOriginOf('/r/a.ts')], pending: false })
  const image = await grabs.read(frameOriginOf('/r/a.ts'))
  assert.equal(image.contentType, 'image/jpeg')
  assert.equal(await grabs.read('frame:../../etc/passwd'), null)
})

test('three unusable frames save a miss, so the file is not grabbed again', async () => {
  const black = await solidJpeg(0)
  const { grabs, offsets } = await grabsWith({ frames: [black, black, black] })
  await grabs.frameFor({ filePath: '/r/b.ts', adPlan: AD_FREE })
  await grabs.idle()
  assert.equal(offsets.length, 3)
  assert.deepEqual(await grabs.frameFor({ filePath: '/r/b.ts' }), { sources: [], pending: false })
  assert.equal(offsets.length, 3)
})

test('an ffmpeg error saves no miss and waits before it tries the file again', async () => {
  const failure = new Error('ffmpeg exited 1')
  const { grabs, root, offsets } = await grabsWith({ frames: [failure, failure, failure] })
  await grabs.frameFor({ filePath: '/r/c.ts', adPlan: AD_FREE })
  await grabs.idle()
  assert.deepEqual(await fs.readdir(root).catch(() => []), [])
  assert.deepEqual(await grabs.frameFor({ filePath: '/r/c.ts' }), { sources: [], pending: false })
  assert.equal(offsets.length, 3)
})

test('one ffmpeg at a time: grabs queue behind each other', async () => {
  let running = 0
  let most = 0
  const root = await makeRoot()
  const body = await noisyJpeg()
  const grabs = createFrameGrabs({
    root,
    grab: async () => {
      running += 1
      most = Math.max(most, running)
      await new Promise((resolve) => setTimeout(resolve, 5))
      running -= 1
      return body
    },
    probe: async () => 1800,
    hasFfmpeg: async () => true,
    canRead: async () => true,
  })
  await Promise.all(['/r/1.ts', '/r/2.ts', '/r/3.ts'].map((filePath) => grabs.frameFor({ filePath, adPlan: CLEAR })))
  await grabs.idle()
  assert.equal(most, 1)
  assert.equal((await fs.readdir(root)).filter((name) => name.endsWith('.jpg')).length, 3)
})

test('no ffmpeg (an install outside Docker) or an unreadable file skips the frame step cleanly', async () => {
  const missing = await grabsWith({ hasFfmpeg: false })
  assert.deepEqual(await missing.grabs.frameFor({ filePath: '/r/d.ts', adPlan: AD_FREE }), { sources: [], pending: false })
  assert.deepEqual(missing.offsets, [])
  const unreadable = await grabsWith({ canRead: false })
  assert.deepEqual(await unreadable.grabs.frameFor({ filePath: '/r/d.ts', adPlan: AD_FREE }), { sources: [], pending: false })
  assert.deepEqual(await unreadable.grabs.frameFor({ filePath: null }), { sources: [], pending: false })
})

test('prune removes frames and misses whose recording is gone, and names their origins', async () => {
  const body = await noisyJpeg()
  const { grabs, root } = await grabsWith({ frames: [body, body] })
  for (const filePath of ['/r/keep.ts', '/r/gone.ts']) {
    await grabs.frameFor({ filePath, adPlan: CLEAR })
    await grabs.idle()
  }
  await fs.writeFile(path.join(root, `${frameIdOf('/r/old.ts')}.none`), '')
  const result = await grabs.prune({ keepPaths: ['/r/keep.ts'] })
  assert.equal(result.removed, 2)
  assert.deepEqual(result.removedOrigins.sort(), [frameOriginOf('/r/gone.ts'), frameOriginOf('/r/old.ts')].sort())
  assert.deepEqual((await fs.readdir(root)).sort(), [`${frameIdOf('/r/keep.ts')}.jpg`, `${frameIdOf('/r/keep.ts')}.json`])
})

test('a file under its expected size (still copying) saves no miss, so it is grabbed again later', async () => {
  const black = await solidJpeg(0)
  const root = await makeRoot()
  const grabs = createFrameGrabs({
    root,
    grab: async () => black,
    probe: async () => 1800,
    hasFfmpeg: async () => true,
    canRead: async () => true,
    sizeOf: async () => 100,
    failureRetryMs: 0,
  })
  await grabs.frameFor({ filePath: '/r/copying.ts', expectedBytes: 5000, adPlan: AD_FREE })
  await grabs.idle()
  assert.deepEqual(await fs.readdir(root).catch(() => []), [])
  assert.deepEqual(await grabs.frameFor({ filePath: '/r/copying.ts', expectedBytes: 5000, adPlan: AD_FREE }), { sources: [], pending: true })
})

test('adAwareOffsetsOf: picks the middle of the longest programme segment, then other segments, at least 20 s from breaks and padding', () => {
  const breaks = [{ start: 900, end: 1080 }, { start: 2000, end: 2200 }]
  assert.deepEqual(adAwareOffsetsOf({ fileDurationS: 4200, programmeDurationS: 3600, breaks }), [3050, 1540, 600])
  assert.deepEqual(adAwareOffsetsOf({ fileDurationS: 1800, breaks: [] }), [900, 548, 1252])
  for (const offsetS of adAwareOffsetsOf({ fileDurationS: 4200, programmeDurationS: 3600, breaks })) {
    assert.equal(isNearBreak({ offsetS, breaks }), false)
    assert.ok(offsetS >= 320 && offsetS <= 3880)
  }
  assert.deepEqual(adAwareOffsetsOf({ fileDurationS: 100, breaks: [{ start: 0, end: 70 }] }), [])
  assert.deepEqual(adAwareOffsetsOf({}), [])
})

test('programmeSegmentsOf: removes overlapping and out-of-window breaks from the programme', () => {
  const window = { start: 300, end: 3900 }
  const breaks = [{ start: 0, end: 400 }, { start: 1000, end: 1200 }, { start: 1100, end: 1300 }, { start: 3800, end: 4200 }]
  assert.deepEqual(programmeSegmentsOf({ window, breaks }), [{ start: 400, end: 1000 }, { start: 1300, end: 3800 }])
})

test('isNearBreak: inside a break or within 20 s of its edges', () => {
  const breaks = [{ start: 1000, end: 1200 }]
  assert.equal(isNearBreak({ offsetS: 1100, breaks }), true)
  assert.equal(isNearBreak({ offsetS: 985, breaks }), true)
  assert.equal(isNearBreak({ offsetS: 1215, breaks }), true)
  assert.equal(isNearBreak({ offsetS: 970, breaks }), false)
  assert.equal(isNearBreak({ offsetS: 1230, breaks }), false)
})

test('adPlanOf: ad data, a scan to wait for, or no ad data', () => {
  const nowMs = Date.parse('2026-11-10T10:00:00Z')
  const breaksJson = JSON.stringify([{ start: 10, end: 20 }])
  assert.deepEqual(adPlanOf({ adStatus: 'detected', breaksJson }), { state: 'marked', breaks: [{ start: 10, end: 20 }] })
  assert.equal(adPlanOf({ adStatus: 'cut', breaksJson }).state, 'clear')
  assert.equal(adPlanOf({ adStatus: 'no_breaks' }).state, 'clear')
  assert.equal(adPlanOf({ adStatus: 'scanning' }).state, 'waiting')
  assert.equal(adPlanOf({ scanning: true }).state, 'waiting')
  const queued = { adStatus: null, showMode: 'detect', adRemovalEnabled: true, nowMs }
  assert.equal(adPlanOf({ ...queued, importedAt: '2026-11-10 09:00:00' }).state, 'waiting')
  assert.equal(adPlanOf({ ...queued, importedAt: '2026-11-09 09:00:00' }).state, 'unknown')
  assert.equal(adPlanOf({ ...queued, importedAt: '2026-11-10 09:00:00', adRemovalEnabled: false }).state, 'unknown')
  assert.equal(adPlanOf({ ...queued, importedAt: '2026-11-10 09:00:00', showMode: 'off' }).state, 'unknown')
  assert.equal(adPlanOf({ adStatus: 'detect_failed' }).state, 'unknown')
})

test('framePreferenceOrderOf: newest file with ad data first, then ad-free channels, then files waiting for a scan, then files with no ad data', () => {
  const files = [
    { filePath: '/newest-unknown.ts', adPlan: { state: 'unknown' } },
    { filePath: '/newer-waiting.ts', adPlan: { state: 'waiting' } },
    { filePath: '/abc.ts', adPlan: { state: 'ad-free' } },
    { filePath: '/older-marked.ts', adPlan: { state: 'marked' } },
    { filePath: '/oldest-clear.ts', adPlan: { state: 'clear' } },
    { filePath: '/plex.mkv' },
  ]
  assert.deepEqual(framePreferenceOrderOf(files).map((file) => file.filePath), ['/older-marked.ts', '/oldest-clear.ts', '/abc.ts', '/newer-waiting.ts', '/newest-unknown.ts', '/plex.mkv'])
})

test('a file with ad breaks is grabbed only at offsets inside the programme, away from the breaks', async () => {
  const body = await noisyJpeg()
  const { grabs, offsets } = await grabsWith({ frames: [await solidJpeg(0), body], durationS: 4200 })
  const breaks = [{ start: 900, end: 1080 }, { start: 2000, end: 2200 }]
  await grabs.frameFor({ filePath: '/r/ads.ts', programmeDurationS: 3600, adPlan: { state: 'marked', breaks } })
  await grabs.idle()
  assert.deepEqual(offsets, [3050, 1540])
  assert.ok(offsets.every((offsetS) => !isNearBreak({ offsetS, breaks })))
})

test('a file waiting for its ad scan is not grabbed until the scan result arrives', async () => {
  const { grabs, offsets } = await grabsWith({ frames: [await noisyJpeg()] })
  assert.deepEqual(await grabs.frameFor({ filePath: '/r/wait.ts', adPlan: { state: 'waiting', breaks: [] } }), { sources: [], pending: true })
  await grabs.idle()
  assert.deepEqual(offsets, [])
  assert.deepEqual(await grabs.reconsider({ filePath: '/r/wait.ts', breaks: [] }), { stale: false, awaited: true })
  await grabs.frameFor({ filePath: '/r/wait.ts', adPlan: CLEAR })
  await grabs.idle()
  assert.equal(offsets.length, 1)
  assert.deepEqual(await grabs.frameFor({ filePath: '/r/wait.ts' }), { sources: [frameOriginOf('/r/wait.ts')], pending: false })
})

test('on an ad-free channel with no ad data, near-duplicate frames are dropped and only a frame steady over 2 s is kept', async () => {
  const steady = await noisyJpeg()
  const prints = new Map()
  const printOf = (body) => prints.get(body)
  const repeat = Buffer.from(await noisyJpeg())
  const repeatAgain = Buffer.from(repeat)
  const steadyNext = Buffer.from(steady)
  prints.set(repeat, Buffer.alloc(16, 10))
  prints.set(repeatAgain, Buffer.alloc(16, 10))
  prints.set(steady, Buffer.alloc(16, 200))
  prints.set(steadyNext, Buffer.alloc(16, 205))
  const { grabs, offsets, root } = await grabsWith({
    frames: [repeat, steady, repeatAgain, steadyNext],
    fingerprintOf: async (body) => printOf(body),
  })
  await grabs.frameFor({ filePath: '/r/no-ads.ts', programmeDurationS: 3600, adPlan: AD_FREE })
  await grabs.idle()
  assert.deepEqual(offsets, [900, 1440, 2160, 1442])
  const meta = JSON.parse(await fs.readFile(path.join(root, `${frameIdOf('/r/no-ads.ts')}.json`), 'utf8'))
  assert.deepEqual(meta, { offsetS: 1440, adAware: false, version: 0 })
})

test('steadyFrameOf and distinctFramesOf: a frame that cuts away within 2 s, or that repeats at another offset, is not kept', () => {
  const print = Buffer.alloc(16, 100)
  const other = Buffer.alloc(16, 30)
  assert.deepEqual(distinctFramesOf([{ offsetS: 900, print }, { offsetS: 1440, print: Buffer.from(print) }, { offsetS: 2160, print: other }]).map((frame) => frame.offsetS), [2160])
  assert.equal(steadyFrameOf([{ offsetS: 900, print, drift: 0.5 }]), null)
  assert.equal(steadyFrameOf([{ offsetS: 900, print, drift: 0.02 }]).offsetS, 900)
  assert.equal(frameDistanceOf(Buffer.alloc(4, 0), Buffer.alloc(4, 255)), 1)
})

test('new ad data re-grabs a frame taken without it when the frame sits in a break, under a new origin', async () => {
  const body = await noisyJpeg()
  const { grabs, root } = await grabsWith({ frames: [body, body, body, body] })
  const filePath = '/r/regrab.ts'
  const id = frameIdOf(filePath)
  await fs.writeFile(path.join(root, `${id}.jpg`), body)
  await fs.writeFile(path.join(root, `${id}.json`), JSON.stringify({ offsetS: 900, adAware: false, version: 0 }))
  assert.deepEqual(await grabs.reconsider({ filePath, breaks: [{ start: 880, end: 1000 }] }), { stale: true, awaited: false })
  await grabs.frameFor({ filePath, programmeDurationS: 3600, adPlan: { state: 'marked', breaks: [{ start: 880, end: 1000 }] } })
  await grabs.idle()
  const found = await grabs.frameFor({ filePath })
  assert.deepEqual(found, { sources: [`${frameOriginOf(filePath)}-v1`], pending: false })
  assert.equal((await grabs.read(found.sources[0])).contentType, 'image/jpeg')
})

test('new ad data keeps a frame taken without it when the frame is clear of every break', async () => {
  const body = await noisyJpeg()
  const { grabs, root } = await grabsWith()
  const filePath = '/r/keep-frame.ts'
  const id = frameIdOf(filePath)
  await fs.writeFile(path.join(root, `${id}.jpg`), body)
  await fs.writeFile(path.join(root, `${id}.json`), JSON.stringify({ offsetS: 1500, adAware: false, version: 0 }))
  assert.deepEqual(await grabs.reconsider({ filePath, breaks: [{ start: 880, end: 1000 }] }), { stale: false, awaited: false })
  assert.deepEqual(await grabs.frameFor({ filePath }), { sources: [frameOriginOf(filePath)], pending: false })
  assert.equal(JSON.parse(await fs.readFile(path.join(root, `${id}.json`), 'utf8')).adAware, true)
})

test('new ad data clears a miss mark, so the file is grabbed again with the breaks', async () => {
  const { grabs, root } = await grabsWith()
  const filePath = '/r/missed.ts'
  await fs.writeFile(path.join(root, `${frameIdOf(filePath)}.none`), '')
  assert.deepEqual(await grabs.frameFor({ filePath }), { sources: [], pending: false })
  await grabs.reconsider({ filePath, breaks: [] })
  assert.deepEqual(await grabs.frameFor({ filePath, adPlan: CLEAR }), { sources: [], pending: true })
})

test('isAdFreeChannel: ABC network channels carry no ads; commercial channels and SBS do', () => {
  for (const name of ['ABC', 'ABC TV HD', 'ABCTV', 'ABC Kids/ABC Family', 'ABC Entertains', 'ABC NEWS', 'ABC ME', 'ABC2']) assert.equal(isAdFreeChannel(name), true, name)
  for (const name of ['SBS', 'NITV', '7mate', 'Nine', '10 Peach', 'Fox ABC', '', null]) assert.equal(isAdFreeChannel(name), false, String(name))
})

test('adPlanOf: no ad data on an ABC channel is ad-free; on a commercial channel it stays unknown; a queued scan still waits', () => {
  assert.deepEqual(adPlanOf({ channelName: 'ABC TV' }), { state: 'ad-free', breaks: [] })
  assert.equal(adPlanOf({ channelName: '7mate' }).state, 'unknown')
  const nowMs = Date.parse('2026-11-10T10:00:00Z')
  assert.equal(adPlanOf({ channelName: 'ABC TV', showMode: 'detect', adRemovalEnabled: true, importedAt: '2026-11-10 09:00:00', nowMs }).state, 'waiting')
  assert.equal(adPlanOf({ channelName: 'ABC TV', adStatus: 'detected', breaksJson: '[{"start":1,"end":2}]' }).state, 'marked')
})

test('no ad data on a commercial channel: no still is grabbed', async () => {
  const { grabs, offsets } = await grabsWith({ frames: [await noisyJpeg()] })
  assert.deepEqual(await grabs.frameFor({ filePath: '/r/seven.ts', adPlan: adPlanOf({ channelName: '7mate' }) }), { sources: [], pending: false })
  await grabs.idle()
  assert.deepEqual(offsets, [])
})

test('no ad data on an ABC channel: a steady still is grabbed', async () => {
  const first = await noisyJpeg()
  const second = Buffer.from(first)
  const third = Buffer.from(first)
  const prints = new Map([[first, Buffer.alloc(16, 200)], [second, Buffer.alloc(16, 120)], [third, Buffer.alloc(16, 40)]])
  const { grabs, offsets } = await grabsWith({
    frames: [first, second, third, Buffer.from(first)],
    fingerprintOf: async (body) => prints.get(body) ?? Buffer.alloc(16, 201),
  })
  await grabs.frameFor({ filePath: '/r/abc.ts', programmeDurationS: 3600, adPlan: adPlanOf({ channelName: 'ABC TV' }) })
  await grabs.idle()
  assert.deepEqual(offsets.slice(0, 4), [900, 1440, 2160, 902])
  assert.deepEqual(await grabs.frameFor({ filePath: '/r/abc.ts' }), { sources: [frameOriginOf('/r/abc.ts')], pending: false })
})
