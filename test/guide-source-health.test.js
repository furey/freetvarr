import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'

import knexFactory from 'knex'

import { down, up } from '../migrations/0048_guide_source_health.js'
import { buildMergedGuide, createGuideMerge } from '../src/guide-merge.js'
import {
  SOURCE_ROW,
  createBuildHealth,
  createSourceHealthStore,
  isBelow,
  judgeScore,
  leadOf,
  medianOf,
  scoreListings,
} from '../src/guide-source-health.js'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const NOW = Date.parse('2026-11-10T00:00:00Z')

const cleanups = []
after(() => Promise.all(cleanups.map((cleanup) => cleanup())))

const tempDir = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-source-health-'))
  cleanups.push(() => fs.rm(dir, { recursive: true, force: true }))
  return dir
}

const slot = ({ title, at, minutes = 60, desc = 'About it' }) => ({
  title,
  desc,
  start: NOW + at * MINUTE,
  stop: NOW + (at + minutes) * MINUTE,
  subTitle: null,
  categories: [],
  rating: null,
  icon: null,
  episodeNums: [],
  extras: [],
})

const dayOfSlots = ({ days = 9, title = 'News' } = {}) => Array.from({ length: days * 24 }, (_, hour) => slot({ title: `${title} ${hour % 3}`, at: hour * 60 }))

const healthyScore = (overrides = {}) => ({
  coveredHours: 48,
  horizonHours: 9 * 24,
  describedShare: 1,
  agreement: 1,
  fetchAttempts: 1,
  fetchFailures: 0,
  ...overrides,
})

test('score: covered hours count the next 48 h once, horizon is the last stop, and agreement needs a partner within 5 min with an agreeing title', () => {
  const programmes = [
    slot({ title: 'Morning Show', at: 0, minutes: 120 }),
    slot({ title: 'Morning Show', at: 60, minutes: 120, desc: null }),
    slot({ title: 'Gardening', at: 600 }),
    slot({ title: 'Late Movie', at: 4 * 24 * 60 }),
  ]
  const others = [slot({ title: 'The Morning Show', at: 3 }), slot({ title: 'Cooking', at: 600 })]
  const score = scoreListings({ programmes, others, nowMs: NOW, attempts: 10, failures: 2 })
  assert.equal(score.coveredHours, 4)
  assert.equal(score.horizonHours, 4 * 24 + 1)
  assert.equal(score.describedShare, 0.67)
  assert.equal(score.agreement, 0.33)
  assert.equal(score.fetchAttempts, 10)
  assert.equal(score.fetchFailures, 2)
  assert.equal(scoreListings({ programmes, others: [], nowMs: NOW }).agreement, null)
})

test('degraded thresholds: under half the 14-day median coverage, under 3 days ahead, or under 60% agreement', () => {
  assert.equal(isBelow({ score: healthyScore(), medianCoverage: 48 }), false)
  assert.equal(isBelow({ score: healthyScore({ coveredHours: 23.9 }), medianCoverage: 48 }), true)
  assert.equal(isBelow({ score: healthyScore({ coveredHours: 24 }), medianCoverage: 48 }), false)
  assert.equal(isBelow({ score: healthyScore({ coveredHours: 0 }), medianCoverage: null }), false)
  assert.equal(isBelow({ score: healthyScore({ horizonHours: 71 }) }), true)
  assert.equal(isBelow({ score: healthyScore({ horizonHours: 72 }) }), false)
  assert.equal(isBelow({ score: healthyScore({ agreement: 0.59 }) }), true)
  assert.equal(isBelow({ score: healthyScore({ agreement: null }) }), false)
  assert.equal(medianOf([48, 10, 40, 44]), 42)
})

test('degraded needs two builds in a row below a threshold', () => {
  const low = healthyScore({ horizonHours: 10 })
  assert.deepEqual(judgeScore({ score: low, history: [] }), { below: true, degraded: false })
  assert.deepEqual(judgeScore({ score: low, history: [{ coveredHours: 48, below: false }] }), { below: true, degraded: false })
  assert.deepEqual(judgeScore({ score: low, history: [{ coveredHours: 48, below: true }] }), { below: true, degraded: true })
  assert.deepEqual(judgeScore({ score: healthyScore(), history: [{ coveredHours: 48, below: true }] }), { below: false, degraded: false })
  const median = [{ coveredHours: 48, below: false }, { coveredHours: 46, below: false }, { coveredHours: 47, below: false }]
  assert.equal(judgeScore({ score: healthyScore({ coveredHours: 20 }), history: median }).below, true)
})

test('lead: Automatic falls back per channel only when the primary is degraded and the secondary is not; a pin or a named source is never overridden', () => {
  const base = { channel: 'seven', primaryId: 'freeview-au', secondaryId: 'mjh-au', hasPrimary: true, hasSecondary: true }
  assert.deepEqual(leadOf({ ...base, choice: { mode: 'auto', pins: {} } }), { lead: 'primary', pinned: false, fallback: false })
  assert.deepEqual(leadOf({ ...base, choice: { mode: 'auto', pins: {} }, primaryDegraded: true }), { lead: 'secondary', pinned: false, fallback: true })
  assert.equal(leadOf({ ...base, choice: { mode: 'auto', pins: {} }, primaryDegraded: true, secondaryDegraded: true }).lead, 'primary')
  assert.deepEqual(leadOf({ ...base, choice: { mode: 'auto', pins: { seven: 'freeview-au' } }, primaryDegraded: true }), { lead: 'primary', pinned: true, fallback: false })
  assert.deepEqual(leadOf({ ...base, choice: { mode: 'freeview-au', pins: {} }, primaryDegraded: true }), { lead: 'primary', pinned: true, fallback: false })
  assert.equal(leadOf({ ...base, choice: { mode: 'mjh-au', pins: {} } }).lead, 'secondary')
  assert.equal(leadOf({ ...base, choice: { mode: 'mjh-au', pins: { seven: 'freeview-au' } } }).lead, 'primary')
  assert.deepEqual(leadOf({ ...base, hasSecondary: false, choice: { mode: 'mjh-au', pins: {} }, primaryDegraded: true }), { lead: 'primary', pinned: false, fallback: false })
})

test('build health: channel rows per source, then a source row that adds coverage and keeps the longest horizon', () => {
  const health = createBuildHealth({ nowMs: NOW, primaryId: 'freeview-au', secondaryId: 'mjh-au' })
  health.channel({ id: 'seven', primary: { programmes: dayOfSlots({ days: 9 }) }, secondary: { programmes: dayOfSlots({ days: 20 }) } })
  health.channel({ id: 'nine', primary: null, secondary: { programmes: dayOfSlots({ days: 20 }) } })
  health.markLed({ source: 'freeview-au', channel: 'seven' })
  const rows = health.finish()
  const sourceRow = (source) => rows.find((row) => row.source === source && row.channel === SOURCE_ROW)
  assert.equal(sourceRow('freeview-au').score.coveredHours, 48)
  assert.equal(sourceRow('freeview-au').score.horizonHours, 9 * 24)
  assert.equal(sourceRow('mjh-au').score.coveredHours, 96)
  assert.equal(sourceRow('freeview-au').led, true)
  assert.equal(sourceRow('mjh-au').led, false)
  assert.equal(rows.filter((row) => row.channel !== SOURCE_ROW).length, 3)
  const failed = createBuildHealth({ nowMs: NOW, primaryId: 'freeview-au', secondaryId: 'mjh-au' }).finish({ failedSources: new Map([['freeview-au', 'HTTP 500']]) })
  assert.deepEqual(failed.find((row) => row.source === 'freeview-au').score.fetchFailures, 1)
  assert.equal(failed.find((row) => row.source === 'freeview-au').below, true)
})

const fakeSource = ({ id, channels, listings, horizonDays = 9, feeds = null }) => ({
  id,
  label: id,
  countries: ['au'],
  channelIdPrefix: 'freeview',
  horizonDays,
  feeds,
  regionOf: () => 'region',
  regionOfUrl: () => null,
  channels: async () => channels,
  listings: async ({ channel }) => (listings[channel] ?? []).map((programme) => ({ ...programme, channel })),
})

const sides = ({ freeviewSeven = [slot({ title: 'Alpha Quiz', at: 0 })] } = {}) => ({
  primary: {
    source: fakeSource({
      id: 'freeview-au',
      channels: [{ id: '0x1010_0x0001_0x0010', names: ['Seven'], lcn: 7 }, { id: '0x1010_0x0001_0x0020', names: ['Nine'], lcn: 9 }],
      listings: {
        '0x1010_0x0001_0x0010': freeviewSeven,
        '0x1010_0x0001_0x0020': [slot({ title: 'Bravo Drama', at: 0 })],
      },
    }),
    region: 'region',
  },
  secondary: {
    source: fakeSource({
      id: 'mjh-au',
      feeds: [{ region: 'region', url: 'https://example.test/epg.xml' }],
      channels: [{ id: 'mjh-seven', names: ['Seven'], lcn: 7 }, { id: 'mjh-nine', names: ['Nine'], lcn: 9 }],
      listings: {
        'mjh-seven': [slot({ title: 'Charlie Talk', at: 0 })],
        'mjh-nine': [slot({ title: 'Delta Sport', at: 0 })],
      },
    }),
    region: 'region',
  },
})

const buildText = async (options) => {
  const out = new PassThrough()
  const chunks = []
  out.on('data', (chunk) => chunks.push(chunk))
  const stats = await buildMergedGuide({ ...options, now: () => NOW, out })
  return { stats, xml: Buffer.concat(chunks).toString('utf8') }
}

const degradedHistory = (channels) => new Map(channels.map((channel) => [`freeview-au|${channel}`, [{ coveredHours: 48, below: true, led: true }]]))

test('Automatic: a channel whose Freeview listings stay degraded uses mjh; other channels keep Freeview; the switch is listed once as a change', async () => {
  const { stats, xml } = await buildText({ ...sides(), history: degradedHistory(['mjh-seven']), choice: { mode: 'auto', pins: {} } })
  assert.match(xml, /Charlie Talk/)
  assert.doesNotMatch(xml, /Alpha Quiz/)
  assert.match(xml, /Bravo Drama/)
  assert.deepEqual(stats.fallbacks.map(({ channel, from, to, changed }) => ({ channel, from, to, changed })), [
    { channel: 'mjh-seven', from: 'freeview-au', to: 'mjh-au', changed: true },
  ])
  const seven = stats.healthRows.filter((row) => row.channel === 'mjh-seven')
  assert.deepEqual(seven.map(({ source, degraded, led }) => ({ source, degraded, led })), [
    { source: 'freeview-au', degraded: true, led: false },
    { source: 'mjh-au', degraded: false, led: true },
  ])
})

test('Automatic: one build below the threshold is not enough to fall back', async () => {
  const { stats, xml } = await buildText({ ...sides(), history: new Map(), choice: { mode: 'auto', pins: {} } })
  assert.match(xml, /Alpha Quiz/)
  assert.deepEqual(stats.fallbacks, [])
})

test('pins: a channel pinned to Freeview keeps Freeview while it is degraded; a channel pinned to mjh uses mjh', async () => {
  const pinned = await buildText({ ...sides(), history: degradedHistory(['mjh-seven']), choice: { mode: 'auto', pins: { 'mjh-seven': 'freeview-au', 'mjh-nine': 'mjh-au' } } })
  assert.match(pinned.xml, /Alpha Quiz/)
  assert.match(pinned.xml, /Delta Sport/)
  assert.doesNotMatch(pinned.xml, /Bravo Drama/)
  assert.deepEqual(pinned.stats.fallbacks, [])
  const named = await buildText({ ...sides(), history: degradedHistory(['mjh-seven', 'mjh-nine']), choice: { mode: 'freeview-au', pins: {} } })
  assert.match(named.xml, /Alpha Quiz/)
  assert.match(named.xml, /Bravo Drama/)
})

const memoryStore = async (now = () => NOW) => {
  const database = knexFactory({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true })
  await up(database)
  cleanups.push(() => database.destroy())
  return { database, store: createSourceHealthStore({ database, now }) }
}

test('store: saves each build, reads 14 days of history newest first, and reports the latest build with each source score and last success', async () => {
  let clock = NOW - 2 * DAY
  const { database, store } = await memoryStore(() => clock)
  const rowsOf = ({ horizonHours, degraded }) => [
    { source: 'freeview-au', channel: SOURCE_ROW, score: healthyScore({ horizonHours }), below: degraded, degraded, led: true },
    { source: 'freeview-au', channel: 'seven', score: healthyScore({ horizonHours }), below: degraded, degraded, led: true },
    { source: 'freeview-au', channel: 'nine', score: healthyScore(), below: false, degraded: false, led: true },
  ]
  await store.save({ builtAt: clock, rows: rowsOf({ horizonHours: 200, degraded: false }) })
  clock = NOW
  await store.save({ builtAt: clock, rows: rowsOf({ horizonHours: 0, degraded: true }).map((row) => (row.channel === SOURCE_ROW ? { ...row, score: { ...row.score, coveredHours: 0 } } : row)) })
  const history = await store.history()
  assert.deepEqual(history.get('freeview-au|seven').map((row) => row.horizonHours), [0, 200])
  const latest = await store.latest()
  assert.equal(latest.builtAt, NOW)
  assert.equal(latest.sources[0].score, 50)
  assert.equal(latest.sources[0].lastSuccessAt, NOW - 2 * DAY)
  assert.equal(latest.channels.length, 2)
  clock = NOW + 20 * DAY
  await store.save({ builtAt: clock, rows: rowsOf({ horizonHours: 200, degraded: false }) })
  assert.equal(Number((await database('guide_source_health').count({ n: '*' }).first()).n), 3)
})

test('migration 0048: down drops guide_source_health', async () => {
  const { database } = await memoryStore()
  assert.equal(await database.schema.hasTable('guide_source_health'), true)
  await down(database)
  assert.equal(await database.schema.hasTable('guide_source_health'), false)
})

test('scheduler: each build saves its health rows and lists fallbacks in its Activity job', async () => {
  const saved = []
  const job = { items: [], logs: [], outcomes: [] }
  const handle = {
    item: (item) => job.items.push(item),
    log: (text, level) => job.logs.push([text, level]),
    outcome: (text, tone) => job.outcomes.push([text, tone]),
  }
  const plan = sides()
  const merge = createGuideMerge({
    dir: await tempDir(),
    sources: { forCountry: () => [plan.primary.source, plan.secondary.source] },
    timeZone: () => 'Australia/Sydney',
    health: {
      history: async () => degradedHistory(['mjh-seven']),
      save: async ({ rows }) => saved.push(rows),
    },
    listingChoice: async () => ({ mode: 'auto', pins: {} }),
    track: (options, fn) => fn(handle),
    now: () => NOW,
    log: { log: () => {}, warn: () => {} },
  })
  const stats = await merge.requestBuild()
  assert.equal(stats.fallbacks, 1)
  assert.ok(saved[0].some((row) => row.channel === SOURCE_ROW && row.source === 'freeview-au'))
  assert.deepEqual(job.items, [{ label: 'Seven', state: 'warn', detail: 'Uses mjh-au; freeview-au listings are degraded.' }])
  assert.equal(job.logs[0][1], 'warn')
  assert.equal(job.outcomes[0][1], 'warn')
})
