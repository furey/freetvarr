import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-guide-history-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const {
  saveGuidePrograms,
  loadEndedProgramsByChannel,
  mergeGuidePrograms,
  syncSavedDvrState,
  savedImageFor,
  startOfYesterdayMs,
} = await import('../src/guide-history.js')
const { toGuideCell } = await import('../src/epg.js')
const { normaliseEvent } = await import('../src/tvheadend.js')
const { db } = await import('../src/db.js')

const MIN = 60_000
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/tvh/${name}.json`, import.meta.url), 'utf8'))
const RAW_EVENT = fixture('epg-events-last').entries[0]
const CHANNEL = RAW_EVENT.channelUuid
const T0 = RAW_EVENT.start * 1000

const programme = (overrides = {}, minutes = 30) => {
  const event = normaliseEvent(RAW_EVENT)
  const start = overrides.start ?? event.start
  return { ...event, end: start + minutes * MIN, ...overrides }
}

before(async () => {
  await db.migrate.latest()
})

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

beforeEach(async () => {
  await db('guide_programs').delete()
})

test('saveGuidePrograms: upserts by channel and start, keeping the guide shape', async () => {
  const first = programme({ title: 'Old title', image: 'https://example.test/a.jpg' })
  await saveGuidePrograms({ programs: [first], nowMs: T0 })
  await saveGuidePrograms({ programs: [{ ...first, title: 'New title' }], nowMs: T0 })
  const rows = await db('guide_programs')
  assert.equal(rows.length, 1)
  const ended = await loadEndedProgramsByChannel({ fromMs: T0 - 60 * MIN, toMs: T0 + 24 * 60 * MIN, nowMs: T0 + 60 * MIN })
  const [saved] = ended.get(CHANNEL)
  assert.equal(saved.title, 'New title')
  assert.equal(saved.program_id, RAW_EVENT.eventId)
  assert.equal(saved.image, 'https://example.test/a.jpg')
})

test('saveGuidePrograms: prunes programmes that ended before the start of yesterday', async () => {
  const cutoff = startOfYesterdayMs(T0)
  await db('guide_programs').insert([
    { channel_id: CHANNEL, start: cutoff - 60 * MIN, end: cutoff - MIN, program_id: '1', program_json: '{}' },
    { channel_id: CHANNEL, start: cutoff - 30 * MIN, end: cutoff + 30 * MIN, program_id: '2', program_json: '{}' },
  ])
  await saveGuidePrograms({ programs: [programme()], nowMs: T0 })
  const ids = (await db('guide_programs').orderBy('start')).map((r) => r.program_id)
  assert.deepEqual(ids, ['2', String(RAW_EVENT.eventId)])
})

test('startOfYesterdayMs: local midnight one day back', () => {
  const at = new Date(2026, 9, 3, 14, 30).getTime()
  assert.equal(startOfYesterdayMs(at), new Date(2026, 9, 2).getTime())
})

test('loadEndedProgramsByChannel: returns only programmes that ended by now within the window', async () => {
  await saveGuidePrograms({
    programs: [
      programme({ program_id: 1, start: T0 }),
      programme({ program_id: 2, start: T0 + 30 * MIN }),
      programme({ program_id: 3, start: T0 + 60 * MIN }),
    ],
    nowMs: T0,
  })
  const ended = await loadEndedProgramsByChannel({ fromMs: T0, toMs: T0 + 24 * 60 * MIN, nowMs: T0 + 70 * MIN })
  assert.deepEqual(ended.get(CHANNEL).map((p) => p.program_id), [1, 2])
  const future = await loadEndedProgramsByChannel({ fromMs: T0 + 24 * 60 * MIN, toMs: T0 + 48 * 60 * MIN, nowMs: T0 })
  assert.equal(future.size, 0)
})

test('mergeGuidePrograms: TVHeadend wins on overlap; saved programmes fill the gaps', () => {
  const live = [programme({ program_id: 20, title: 'Live', start: T0 + 30 * MIN })]
  const saved = [
    programme({ program_id: 10, title: 'Earlier', start: T0 }),
    programme({ program_id: 21, title: 'Stale copy', start: T0 + 30 * MIN }),
    programme({ program_id: 22, title: 'Overlapping', start: T0 + 45 * MIN }),
  ]
  const merged = mergeGuidePrograms({ live, saved })
  assert.deepEqual(merged.map((p) => p.title), ['Earlier', 'Live'])
})

test('toGuideCell: flags past programmes and keeps their recording state', () => {
  const recorded = programme({ dvr_state: 'recording', dvr_uuid: 'dvr-1' })
  const cell = toGuideCell({ program: recorded, nowMs: recorded.end })
  assert.equal(cell.past, true)
  assert.equal(cell.recorded, true)
  assert.equal(cell.image, undefined)
  const airing = toGuideCell({ program: recorded, nowMs: recorded.end - MIN })
  assert.equal(airing.past, false)
  assert.equal(airing.recorded, false)
  assert.equal(toGuideCell({ program: programme(), nowMs: recorded.end }).recorded, false)
})

test('syncSavedDvrState: marks scheduled programmes and clears cancelled ones before they end', async () => {
  await saveGuidePrograms({
    programs: [
      programme({ program_id: 1, start: T0, dvr_state: 'scheduled', dvr_uuid: 'dvr-old' }),
      programme({ program_id: 2, start: T0 + 30 * MIN }),
      programme({ program_id: 3, start: T0 + 60 * MIN, dvr_state: 'scheduled', dvr_uuid: 'dvr-gone' }),
    ],
    nowMs: T0,
  })
  await syncSavedDvrState({
    futureRecordings: [{ programId: 2, uuid: 'dvr-2', schedStatus: 'recording' }],
    nowMs: T0 + 40 * MIN,
  })
  const rows = await db('guide_programs').orderBy('start')
  assert.deepEqual(rows.map((r) => [r.program_id, r.dvr_state, r.dvr_uuid]), [
    ['1', 'scheduled', 'dvr-old'],
    ['2', 'recording', 'dvr-2'],
    ['3', null, null],
  ])
})

test('savedImageFor: finds the image of a programme TVHeadend no longer returns', async () => {
  await saveGuidePrograms({ programs: [programme({ image: 'https://example.test/b.jpg' })], nowMs: T0 })
  assert.equal(await savedImageFor({ programId: RAW_EVENT.eventId }), 'https://example.test/b.jpg')
  assert.equal(await savedImageFor({ programId: 999 }), null)
})
