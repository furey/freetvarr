import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

import {
  createFrameGrabs,
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

const grabsWith = async ({ frames = [], hasFfmpeg = true, canRead = true, durationS = 3600, onGrabbed = () => {} } = {}) => {
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
  const first = await grabs.frameFor({ filePath: '/r/a.ts', programmeDurationS: 3600, onReady: () => ready.push(true) })
  assert.deepEqual(first, { sources: [], pending: true })
  await grabs.idle()
  assert.deepEqual(offsets, [900, 1440])
  assert.deepEqual(await fs.readdir(root), [`${frameIdOf('/r/a.ts')}.jpg`])
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
  await grabs.frameFor({ filePath: '/r/b.ts' })
  await grabs.idle()
  assert.equal(offsets.length, 3)
  assert.deepEqual(await grabs.frameFor({ filePath: '/r/b.ts' }), { sources: [], pending: false })
  assert.equal(offsets.length, 3)
})

test('an ffmpeg error saves no miss and waits before it tries the file again', async () => {
  const failure = new Error('ffmpeg exited 1')
  const { grabs, root, offsets } = await grabsWith({ frames: [failure, failure, failure] })
  await grabs.frameFor({ filePath: '/r/c.ts' })
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
  await Promise.all(['/r/1.ts', '/r/2.ts', '/r/3.ts'].map((filePath) => grabs.frameFor({ filePath })))
  await grabs.idle()
  assert.equal(most, 1)
  assert.equal((await fs.readdir(root)).length, 3)
})

test('no ffmpeg (an install outside Docker) or an unreadable file skips the frame step cleanly', async () => {
  const missing = await grabsWith({ hasFfmpeg: false })
  assert.deepEqual(await missing.grabs.frameFor({ filePath: '/r/d.ts' }), { sources: [], pending: false })
  assert.deepEqual(missing.offsets, [])
  const unreadable = await grabsWith({ canRead: false })
  assert.deepEqual(await unreadable.grabs.frameFor({ filePath: '/r/d.ts' }), { sources: [], pending: false })
  assert.deepEqual(await unreadable.grabs.frameFor({ filePath: null }), { sources: [], pending: false })
})

test('prune removes frames and misses whose recording is gone, and names their origins', async () => {
  const body = await noisyJpeg()
  const { grabs, root } = await grabsWith({ frames: [body, body] })
  for (const filePath of ['/r/keep.ts', '/r/gone.ts']) {
    await grabs.frameFor({ filePath })
    await grabs.idle()
  }
  await fs.writeFile(path.join(root, `${frameIdOf('/r/old.ts')}.none`), '')
  const result = await grabs.prune({ keepPaths: ['/r/keep.ts'] })
  assert.equal(result.removed, 2)
  assert.deepEqual(result.removedOrigins.sort(), [frameOriginOf('/r/gone.ts'), frameOriginOf('/r/old.ts')].sort())
  assert.deepEqual(await fs.readdir(root), [`${frameIdOf('/r/keep.ts')}.jpg`])
})
