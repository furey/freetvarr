import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-frame-ads-')))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db, setSetting } = await import('../src/db.js')
const { onAdScanResult, processRecordingAds } = await import('../src/commercials.js')
const { deleteFrameResolutions, filePlanOf, frameStage, publishStillsChange, refreshFrameAfterAdScan } = await import('../src/epg.js')
const { artFeed } = await import('../src/art-feed.js')
const { frameOriginOf } = await import('../src/frame-grabs.js')

const RECORDING_ID = 'rec-ads'
const FILE_PATH = path.join(tmpDir, 'Gruen - S01E01.ts')
const BREAKS = [{ start: 600, end: 780 }]

before(async () => {
  await db.migrate.latest()
})

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

beforeEach(async () => {
  await fs.writeFile(FILE_PATH, 'programme')
  await db('recordings').delete()
  await db('art_resolutions').delete()
  await db('shows').delete()
  const [showId] = await db('shows').insert({ show_pattern: 'Gruen', dest_folder: 'Gruen', ad_removal: 'detect' })
  await db('recordings').insert({
    recording_id: RECORDING_ID,
    title: 'Gruen',
    status: 'done',
    file_path: FILE_PATH,
    duration_s: 1800,
    show_id: typeof showId === 'object' ? showId.id : showId,
    ad_status: 'detected',
    ad_breaks_json: JSON.stringify(BREAKS),
  })
  await setSetting('episode_picture_order', 'series')
})

const fakeGrabs = ({ stale = false, awaited = false } = {}) => {
  const asked = []
  return {
    asked,
    reconsider: async () => ({ stale, awaited }),
    frameFor: async (request) => {
      asked.push(request)
      return { sources: [], pending: true }
    },
  }
}

const publishedSince = (cursor) => artFeed.since(cursor).stamps.map(({ key, kind }) => `${kind}|${key}`).sort()

test('a finished ad scan tells listeners the breaks it found', async () => {
  const heard = []
  const stop = onAdScanResult((result) => heard.push(result))
  await processRecordingAds({
    filePath: FILE_PATH,
    mode: 'detect',
    recordingId: RECORDING_ID,
    tools: { detect: async () => BREAKS, cut: async () => { throw new Error('not cutting') } },
  })
  stop()
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(heard, [{ recordingId: RECORDING_ID, filePath: FILE_PATH, status: 'detected', breaks: BREAKS }])
  await fs.rm(path.join(tmpDir, 'Gruen - S01E01.edl'), { force: true })
})

test('a frame in a break is grabbed again with the breaks, its resolutions asked again, and open pages told', async () => {
  await db('art_resolutions').insert({
    resolution_key: 'series|landscape|gruen', title_key: 'gruen', kind: 'series', shape: 'landscape', stage: 'frame',
    origin: frameOriginOf(FILE_PATH), transform: 'none', fingerprint: 'f', resolved_at: 1, next_check_at: Date.now() + 1e9,
  })
  const grabs = fakeGrabs({ stale: true })
  const cursor = artFeed.cursor()
  const result = await refreshFrameAfterAdScan({ recordingId: RECORDING_ID, filePath: FILE_PATH, breaks: BREAKS }, { grabs })
  assert.deepEqual(result, { stale: true, awaited: false, grabbing: true })
  assert.equal(Number((await db('art_resolutions').first()).next_check_at), 0)
  assert.deepEqual(grabs.asked.map((request) => request.adPlan), [{ state: 'marked', breaks: BREAKS }])
  assert.deepEqual(publishedSince(cursor), ['background|gruen', 'poster|gruen'])
})

test('a frame waiting for the ad scan is grabbed when the result arrives; a frame clear of breaks is left alone', async () => {
  const waiting = fakeGrabs({ awaited: true })
  assert.equal((await refreshFrameAfterAdScan({ recordingId: RECORDING_ID, filePath: FILE_PATH, breaks: BREAKS }, { grabs: waiting })).grabbing, true)
  assert.equal(waiting.asked.length, 1)
  const settled = fakeGrabs()
  assert.equal((await refreshFrameAfterAdScan({ recordingId: RECORDING_ID, filePath: FILE_PATH, breaks: BREAKS }, { grabs: settled })).grabbing, false)
  assert.equal(settled.asked.length, 0)
})

test('stills off: the frame step answers no picture, ad results grab nothing, and switching tells open pages', async () => {
  await db('art_resolutions').insert({
    resolution_key: 'series|landscape|gruen', title_key: 'gruen', show_key: 'gruen', kind: 'series', shape: 'landscape', stage: 'frame',
    origin: `${frameOriginOf(FILE_PATH)}-v2`, transform: 'none', fingerprint: 'f', resolved_at: 1, next_check_at: Date.now() + 1e9,
  })
  await setSetting('episode_picture_order', 'off')
  assert.deepEqual(await frameStage({ title: 'Gruen', kind: 'series' }), { sources: [], pending: false })
  assert.deepEqual(await frameStage({ title: 'Gruen', recordingId: RECORDING_ID, episodeFile: { filePath: FILE_PATH } }), { sources: [], pending: false })
  const grabs = fakeGrabs({ awaited: true })
  assert.equal((await refreshFrameAfterAdScan({ recordingId: RECORDING_ID, filePath: FILE_PATH, breaks: BREAKS }, { grabs })).grabbing, false)
  assert.equal(grabs.asked.length, 0)
  const cursor = artFeed.cursor()
  assert.equal(await publishStillsChange(), 1)
  assert.deepEqual(publishedSince(cursor), ['background|gruen', 'poster|gruen'])
})

test('filePlanOf: a library item from a recording takes the recording plan; a download is ad-free', () => {
  const plans = new Map([['r9', { state: 'unknown', breaks: [] }]])
  assert.equal(filePlanOf({ file: { filePath: '/tv/copy.mkv', recordingId: 'r9' }, plans }).state, 'unknown')
  assert.equal(filePlanOf({ file: { filePath: '/tv/gone.mkv', recordingId: 'r-missing' }, plans }).state, 'unknown')
  assert.equal(filePlanOf({ file: { filePath: '/tv/download.mkv', recordingId: null, managed: true }, plans }).state, 'ad-free')
})

test('deleteFrameResolutions: 1000 pruned origins and their versions delete in batches', async () => {
  const origins = Array.from({ length: 1000 }, (_, at) => `frame:${String(at).padStart(24, '0')}`)
  const row = (key, origin) => ({
    resolution_key: key, title_key: key, kind: 'series', shape: 'landscape', stage: 'frame',
    origin, transform: 'none', fingerprint: 'f', resolved_at: 1, next_check_at: 1,
  })
  const rows = [
    ...origins.map((origin, at) => row(`plain-${at}`, origin)),
    ...origins.slice(0, 300).map((origin, at) => row(`versioned-${at}`, `${origin}-v2`)),
    row('kept', 'frame:ffffffffffffffffffffffff'),
  ]
  for (let at = 0; at < rows.length; at += 100) await db('art_resolutions').insert(rows.slice(at, at + 100))
  assert.equal(await deleteFrameResolutions({ origins }), 1300)
  assert.deepEqual((await db('art_resolutions').select('resolution_key')).map((left) => left.resolution_key), ['kept'])
})
