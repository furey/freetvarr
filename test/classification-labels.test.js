import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-classification-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const {
  classificationFromAgeRating,
  classificationOfProgramme,
  createClassificationLookup,
  createClassificationRecorder,
  createClassificationStore,
  normaliseClassification,
  programmeClassification,
  programmeClassificationEntry,
} = await import('../src/classification-labels.js')
const { withClassification } = await import('../src/epg.js')
const { withClassifications } = await import('../src/for-you-service.js')
const { parseXmltvTime } = await import('../src/tvheadend-guide.js')
const { db } = await import('../src/db.js')

const DAY = 24 * 60 * 60_000
const NOW = Date.UTC(2026, 9, 21, 9)

const rated = (...ratings) => `<programme start="20261021090000 +0000" channel="x">
    <title lang="en">Halifax: Retribution</title>
    ${ratings.map(([value, system]) => `<rating${system ? ` system="${system}"` : ''}>\n      <value>${value}</value>\n    </rating>`).join('\n    ')}
  </programme>`

before(async () => {
  await db.migrate.latest()
})

beforeEach(async () => {
  await db('programme_classifications').delete()
  await db('recordings').delete()
})

const recording = (overrides) => ({ recording_id: 'r1', title: 'Halifax: Retribution', status: 'done', aired_at: NOW, ...overrides })

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test('normaliseClassification accepts Australian labels written with or without spaces', () => {
  assert.equal(normaliseClassification('MA 15+'), 'MA15+')
  assert.equal(normaliseClassification('R 18+'), 'R18+')
  assert.equal(normaliseClassification('av15+'), 'AV15+')
  assert.equal(normaliseClassification('MA15'), 'MA15+')
  assert.equal(normaliseClassification(' pg '), 'PG')
  for (const label of ['G', 'M', 'P', 'C']) assert.equal(normaliseClassification(label), label)
  for (const other of ['NA', 'TV-PG', 'G-CV', '7.5/10', '', null]) assert.equal(normaliseClassification(other), null)
})

test('classificationOfProgramme prefers the Australian label and falls back to another system', () => {
  assert.equal(classificationOfProgramme(rated(['PG', 'NZ'], ['M'])), 'M')
  assert.equal(classificationOfProgramme(rated(['G', 'NZ'])), 'G')
  assert.equal(classificationOfProgramme(rated(['NA'])), null)
  assert.equal(classificationOfProgramme(rated(['NA'], ['PG', 'NZ'])), 'PG')
  assert.equal(classificationOfProgramme(rated()), null)
})

test('programmeClassificationEntry keys a label by the plain title and start time', () => {
  const programme = rated(['MA 15+']).replace('Halifax: Retribution', '  Law &amp; Order  ')
  assert.deepEqual(programmeClassificationEntry({ programmeXml: programme, parseTime: parseXmltvTime }), {
    titleKey: 'law & order',
    startMs: NOW,
    label: 'MA15+',
  })
  assert.equal(programmeClassificationEntry({ programmeXml: rated(), parseTime: parseXmltvTime }), null)
})

test('classificationFromAgeRating maps only the unambiguous TVHeadend ages', () => {
  assert.equal(classificationFromAgeRating('15'), 'MA15+')
  assert.equal(classificationFromAgeRating(18), 'R18+')
  for (const age of [7, '11', 0, null, undefined]) assert.equal(classificationFromAgeRating(age), null)
})

test('the store saves labels, replaces a changed one, and prunes past programmes', async () => {
  const store = createClassificationStore({ keepMs: DAY })
  await store.record([
    { titleKey: 'halifax: retribution', startMs: NOW, label: 'M' },
    { titleKey: 'old show', startMs: NOW - 2 * DAY, label: 'G' },
  ])
  await store.record([{ titleKey: 'halifax: retribution', startMs: NOW, label: 'MA15+' }])
  assert.equal(await store.lookup({ title: ' Halifax:  Retribution ', startMs: NOW }), 'MA15+')
  assert.equal(await store.lookup({ title: 'Halifax: Retribution', startMs: NOW + 1 }), null)
  await store.prune({ nowMs: NOW })
  assert.equal(await store.lookup({ title: 'Old Show', startMs: NOW - 2 * DAY }), null)
  assert.equal(await store.lookup({ title: 'Halifax: Retribution', startMs: NOW }), 'MA15+')
})

test('the recorder writes in batches and prunes once the feed ends', async () => {
  const batches = []
  let prunedAt = null
  const recorder = createClassificationRecorder({
    store: { record: (entries) => batches.push(entries.length), prune: ({ nowMs }) => { prunedAt = nowMs } },
    batchSize: 3,
    now: () => NOW,
  })
  recorder.add([1, 2].map((i) => ({ titleKey: `t${i}`, startMs: i, label: 'G' })))
  recorder.add([3, 4].map((i) => ({ titleKey: `t${i}`, startMs: i, label: 'G' })))
  recorder.finish()
  assert.deepEqual(batches, [4, 0])
  assert.equal(prunedAt, NOW)
})

test('programmeClassification uses the feed label first, then a clear TVHeadend age', async () => {
  const store = createClassificationStore()
  await store.record([{ titleKey: 'halifax: retribution', startMs: NOW, label: 'M' }])
  const programme = { title: 'Halifax: Retribution', start: NOW, rating: '15' }
  assert.equal(await programmeClassification({ programme, store }), 'M')
  assert.equal(await programmeClassification({ programme: { ...programme, start: NOW + DAY }, store }), 'MA15+')
  assert.equal(await programmeClassification({ programme: { ...programme, rating: '7', start: 0 }, store }), null)
  assert.equal(await programmeClassification({ programme: null, store }), null)
})

test('withClassification adds the label to the sheet programme and leaves an empty sheet alone', async () => {
  const store = { lookup: async () => 'PG' }
  const sheet = { channel: { id: 'c' }, programme: { title: 'News', start: NOW }, hdEpisode: null, hdSeries: null }
  assert.equal((await withClassification({ sheet, store })).programme.classification, 'PG')
  const failing = { lookup: async () => { throw new Error('no table') } }
  const past = { ...sheet, programme: { title: 'News', start: NOW, rating: null } }
  assert.equal((await withClassification({ sheet: past, store: failing })).programme.classification, null)
  const empty = { channel: null, programme: null, hdEpisode: null, hdSeries: null }
  assert.equal(await withClassification({ sheet: empty, store }), empty)
})

test('the store reads every label for a list of start times in one query', async () => {
  const store = createClassificationStore()
  await store.record([
    { titleKey: 'halifax: retribution', startMs: NOW, label: 'M' },
    { titleKey: 'news', startMs: NOW, label: 'PG' },
    { titleKey: 'later', startMs: NOW + DAY, label: 'G' },
  ])
  const queries = []
  const listen = (query) => queries.push(query.sql)
  db.on('query', listen)
  const labels = await store.labelsAt([NOW, NOW, String(NOW + DAY), null])
  db.off('query', listen)
  assert.equal(queries.length, 1)
  assert.deepEqual([...labels.entries()].sort(), [
    [`halifax: retribution|${NOW}`, 'M'],
    [`later|${NOW + DAY}`, 'G'],
    [`news|${NOW}`, 'PG'],
  ])
  assert.equal((await store.labelsAt([])).size, 0)
})

test('the store reads a long list of start times as one range', async () => {
  const store = createClassificationStore()
  await store.record([{ titleKey: 'news', startMs: NOW + 30, label: 'PG' }])
  const starts = Array.from({ length: 800 }, (_, i) => NOW + i * 60)
  assert.equal((await store.labelsAt(starts)).get(`news|${NOW + 30}`), 'PG')
})

test('createClassificationLookup prefers the feed label, then the TVHeadend label, then a clear age', async () => {
  const store = createClassificationStore()
  await store.record([{ titleKey: 'halifax: retribution', startMs: NOW, label: 'M' }])
  const classificationOf = await createClassificationLookup({
    programmes: [{ title: 'Halifax: Retribution', start: NOW }, { title: 'Other', start: NOW + DAY }],
    store,
  })
  assert.equal(classificationOf({ title: ' halifax:  retribution', start: NOW, rating: '18' }), 'M')
  assert.equal(classificationOf({ title: 'Other', start: NOW + DAY, ratingLabel: 'pg', rating: '18' }), 'PG')
  assert.equal(classificationOf({ title: 'Other', start: NOW + DAY, rating: '18' }), 'R18+')
  assert.equal(classificationOf({ title: 'Other', start: NOW + DAY, rating: '7' }), null)
})

test('createClassificationLookup falls back to ages when the store fails', async () => {
  const failing = { labelsAt: async () => { throw new Error('no table') } }
  const classificationOf = await createClassificationLookup({ programmes: [{ title: 'A', start: NOW }], store: failing })
  assert.equal(classificationOf({ title: 'A', start: NOW, rating: '15' }), 'MA15+')
})

test('pruning copies labels onto recordings before it deletes them', async () => {
  const store = createClassificationStore({ keepMs: DAY })
  await db('recordings').insert([
    recording({ recording_id: 'old', aired_at: NOW - 2 * DAY, title: 'Old  Show' }),
    recording({ recording_id: 'kept', aired_at: NOW - 2 * DAY, title: 'Old Show', classification: 'G' }),
    recording({ recording_id: 'other', aired_at: NOW - 2 * DAY, title: 'Unlabelled' }),
  ])
  await store.record([
    { titleKey: 'old show', startMs: NOW - 2 * DAY, label: 'M' },
    { titleKey: 'halifax: retribution', startMs: NOW, label: 'MA15+' },
  ])
  await store.prune({ nowMs: NOW })
  const labels = Object.fromEntries((await db('recordings').select('recording_id', 'classification'))
    .map((row) => [row.recording_id, row.classification]))
  assert.deepEqual(labels, { old: 'M', kept: 'G', other: null })
  assert.equal(await store.lookup({ title: 'Old Show', startMs: NOW - 2 * DAY }), null)
})

test('migration 0018 backfills recordings from the labels still in the store', async () => {
  const migration = '0018_recording_classification.js'
  await db.migrate.down({ name: migration })
  await db('recordings').insert([
    { recording_id: 'a', title: 'Halifax:  Retribution', status: 'done', aired_at: NOW },
    { recording_id: 'b', title: 'Other', status: 'done', aired_at: NOW },
  ])
  await db('programme_classifications').insert({ title_key: 'halifax: retribution', start_ms: NOW, label: 'MA15+' })
  await db.migrate.up({ name: migration })
  const rows = await db('recordings').orderBy('recording_id').select('recording_id', 'classification', 'year')
  assert.deepEqual(rows.map((row) => ({ ...row })), [
    { recording_id: 'a', classification: 'MA15+', year: null },
    { recording_id: 'b', classification: null, year: null },
  ])
})

test('withClassifications labels every For you item and the top pick', async () => {
  const store = createClassificationStore()
  await store.record([{ titleKey: 'heat', startMs: NOW, label: 'MA15+' }])
  const heat = { title: 'Heat', start: NOW, programmeKey: `c1:${NOW}` }
  const news = { title: 'News', start: NOW + DAY, programmeKey: `c2:${NOW + DAY}` }
  const result = await withClassifications({
    result: { topPick: { ...heat, section: 'movies' }, sections: [{ key: 'movies', items: [heat, news] }], explanations: new Map() },
    programmes: [
      { channel_id: 'c1', start: NOW, title: 'Heat', rating: null },
      { channel_id: 'c2', start: NOW + DAY, title: 'News', rating: '18' },
    ],
    store,
  })
  assert.equal(result.topPick.classification, 'MA15+')
  assert.equal(result.topPick.section, 'movies')
  assert.deepEqual(result.sections[0].items.map((item) => item.classification), ['MA15+', 'R18+'])
  assert.ok(result.explanations instanceof Map)
  const empty = await withClassifications({ result: { topPick: null, sections: [] }, programmes: [], store })
  assert.equal(empty.topPick, null)
})
