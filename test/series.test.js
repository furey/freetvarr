import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import http from 'node:http'

import { listAutorecs, setSeriesTagsEnabled } from '../src/tvheadend.js'
import { folderForTitle, getSeries, joinSeries, savesTo } from '../src/series.js'

const NOW = Date.UTC(2026, 9, 6, 8, 0)
const HOUR_MS = 60 * 60 * 1000
const ABC_TV = '3b6b1efd5c4ad532eef656c9ab9f6f4e'
const ABC_HD = '6f2d8a1c4b3e5f7a9c0d1e2f3a4b5c6d'
const SBS = 'e52f8028f3bbf341a4f0569d3048c652'

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/tvh/${name}.json`, import.meta.url), 'utf8'))

const SAVING = { mediaRoot: '/media/tv', oneOffRoot: '/media/one-offs', importUnmatched: true }

const readBody = (req) => new Promise((resolve) => {
  let body = ''
  req.on('data', (chunk) => { body += chunk })
  req.on('end', () => resolve(body))
})

const withAutorecGrid = async (run, { saves = [] } = {}) => {
  const server = http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://tvh')
    if (pathname === '/api/idnode/save') {
      saves.push(JSON.parse(new URLSearchParams(await readBody(req)).get('node')))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end('{}')
    }
    if (pathname !== '/api/dvr/autorec/grid') {
      res.writeHead(404)
      return res.end()
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(fixture('dvr-autorec-grid')))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    return await run({ url: `http://127.0.0.1:${server.address().port}`, username: '', password: '' })
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
}

const show = (overrides) => ({
  id: 1,
  show_pattern: 'Hard Quiz',
  dest_folder: 'Hard Quiz (2016)',
  season_template: 'Season {season}',
  enabled: true,
  delete_after_import: false,
  ad_removal: 'off',
  ...overrides,
})

const channels = [
  { id: ABC_TV, name: 'ABC TV' },
  { id: ABC_HD, name: 'ABC TV HD' },
  { id: SBS, name: 'SBS ONE' },
]

const upcoming = (overrides) => ({
  programId: 900,
  name: 'Hard Quiz',
  channelId: ABC_HD,
  channelName: null,
  startDate: NOW + 2 * HOUR_MS,
  endDate: NOW + 2.5 * HOUR_MS,
  episodeTitle: null,
  seriesLinkId: `${ABC_HD}|hard quiz`,
  source: 'timer',
  ...overrides,
})

test('joinSeries: lists an SD and HD autorec pair as one series filed to its folder', async () => {
  const seriesTags = await withAutorecGrid(listAutorecs)
  const { series, titleMatches } = joinSeries({ seriesTags, shows: [show()], channels, nowMs: NOW })
  const hardQuiz = series.find((s) => s.title === 'Hard Quiz')
  assert.equal(hardQuiz.folder.dest_folder, 'Hard Quiz (2016)')
  assert.deepEqual(hardQuiz.autorecs.map((a) => a.channelName), ['ABC TV', 'ABC TV HD'])
  assert.equal(hardQuiz.recording, true)
  assert.equal(hardQuiz.episodesToKeep, 5)
  assert.deepEqual(titleMatches, [])
})

test('joinSeries: a series with no matching row saves to the one-off folder', async () => {
  const seriesTags = await withAutorecGrid(listAutorecs)
  const { series } = joinSeries({ seriesTags, shows: [show()], channels, saving: SAVING, nowMs: NOW })
  const news = series.find((s) => s.title === 'SBS World News')
  assert.equal(news.folder, null)
  assert.deepEqual(news.savesTo, { kind: 'oneOff', path: '/media/one-offs/SBS World News' })
  assert.equal(news.autorecs[0].channelName, 'SBS ONE')
})

test('joinSeries: a disabled autorec shows the series as not recording', async () => {
  const seriesTags = await withAutorecGrid(listAutorecs)
  const { series } = joinSeries({ seriesTags, shows: [], channels, nowMs: NOW })
  assert.equal(series.find((s) => s.title === 'Gardening Australia').recording, false)
})

test('joinSeries: rows with no autorec go to the title matches', () => {
  const nrl = show({ id: 2, show_pattern: 'NRL', dest_folder: 'NRL' })
  const seriesTags = [{ id: 'a', seriesLinkId: `${ABC_TV}|hard quiz`, name: 'Hard Quiz', channelId: ABC_TV, enabled: true }]
  const { series, titleMatches } = joinSeries({ seriesTags, shows: [show(), nrl], saving: SAVING, nowMs: NOW })
  assert.equal(series[0].folder.id, 1)
  assert.deepEqual(titleMatches.map((s) => s.id), [2])
  assert.equal(titleMatches[0].savesTo.path, '/media/tv/NRL/Season …')
})

test('joinSeries: picks the soonest airing across the pair and skips ended ones', () => {
  const seriesTags = [
    { id: 'a', seriesLinkId: `${ABC_TV}|hard quiz`, name: 'Hard Quiz', channelId: ABC_TV, enabled: true },
    { id: 'b', seriesLinkId: `${ABC_HD}|hard quiz`, name: 'Hard Quiz', channelId: ABC_HD, enabled: true },
  ]
  const upcomingRecordings = [
    upcoming({ programId: 1, startDate: NOW - 2 * HOUR_MS, endDate: NOW - HOUR_MS }),
    upcoming({ programId: 2, startDate: NOW + 5 * HOUR_MS, endDate: NOW + 6 * HOUR_MS, source: 'series' }),
    upcoming({ programId: 3, channelId: ABC_TV, seriesLinkId: `${ABC_TV}|hard quiz`, startDate: NOW + 3 * HOUR_MS, endDate: NOW + 4 * HOUR_MS }),
  ]
  const [hardQuiz] = joinSeries({ seriesTags, upcomingRecordings, channels, nowMs: NOW }).series
  assert.equal(hardQuiz.nextAiring.programId, 3)
  assert.equal(hardQuiz.nextAiring.channelName, 'ABC TV')
  assert.equal(hardQuiz.nextAiring.expected, false)
})

test('joinSeries: saves to the season of the next airing', () => {
  const seriesTags = [{ id: 'a', seriesLinkId: `${ABC_HD}|hard quiz`, name: 'Hard Quiz', channelId: ABC_HD, enabled: true }]
  const upcomingRecordings = [upcoming({ season: 9 })]
  const [hardQuiz] = joinSeries({ seriesTags, upcomingRecordings, shows: [show()], saving: SAVING, nowMs: NOW }).series
  assert.deepEqual(hardQuiz.savesTo, { kind: 'library', path: '/media/tv/Hard Quiz (2016)/Season 09' })
})

test('savesTo: an unknown season shows the season template with an ellipsis', () => {
  const folder = show({ season_template: 'S{season_unpadded}' })
  assert.equal(savesTo({ folder, title: 'Hard Quiz', saving: SAVING }).path, '/media/tv/Hard Quiz (2016)/S…')
})

test('savesTo: a disabled row saves to the one-off folder, as sync does', () => {
  const folder = show({ enabled: false })
  assert.deepEqual(savesTo({ folder, title: 'Hard Quiz', saving: SAVING }), { kind: 'oneOff', path: '/media/one-offs/Hard Quiz' })
})

test('savesTo: with Import every recording off, a recording with no row is held', () => {
  assert.deepEqual(savesTo({ title: 'Hard Quiz', saving: { ...SAVING, importUnmatched: false } }), { kind: 'held', path: null })
})

test('setSeriesTagsEnabled: pauses both autorecs of an SD and HD pair', async () => {
  const saves = []
  const result = await withAutorecGrid((conn) => setSeriesTagsEnabled({
    seriesLinkIds: [`${ABC_TV}|hard quiz`, `${ABC_HD}|hard quiz`],
    enabled: false,
    conn,
  }), { saves })
  assert.deepEqual(saves, [
    { uuid: 'a1f0c9d2e3b4a5f6c7d8e9f0a1b2c3d4', enabled: false },
    { uuid: 'b2e1d0c3f4a5b6c7d8e9f0a1b2c3d4e5', enabled: false },
  ])
  assert.equal(result.enabled, false)
})

test('setSeriesTagsEnabled: resumes a disabled autorec', async () => {
  const saves = []
  await withAutorecGrid((conn) => setSeriesTagsEnabled({
    seriesLinkIds: [`${ABC_TV}|gardening australia`],
    enabled: true,
    conn,
  }), { saves })
  assert.deepEqual(saves, [{ uuid: 'c3d2e1f0a5b4c7d6e9f8a1b0c3d2e5f4', enabled: true }])
})

test('setSeriesTagsEnabled: rejects a series link with no autorec', async () => {
  await assert.rejects(
    withAutorecGrid((conn) => setSeriesTagsEnabled({ seriesLinkIds: ['nope'], enabled: false, conn })),
    /No series recording matches/,
  )
})

test('joinSeries: no airing in the guide leaves nextAiring empty', () => {
  const seriesTags = [{ id: 'a', seriesLinkId: `${ABC_TV}|hard quiz`, name: 'Hard Quiz', channelId: ABC_TV, enabled: true }]
  assert.equal(joinSeries({ seriesTags, nowMs: NOW }).series[0].nextAiring, null)
})

test('folderForTitle: uses the longest pattern, as sync does', () => {
  const shows = [show({ id: 1, show_pattern: 'NRL' }), show({ id: 2, show_pattern: 'NRL Grand Final' })]
  assert.equal(folderForTitle({ shows, title: 'NRL Grand Final' }).id, 2)
  assert.equal(folderForTitle({ shows, title: 'NRL Friday Night Football' }).id, 1)
})

test('folderForTitle: an enabled row wins over a longer disabled one', () => {
  const shows = [show({ id: 1, show_pattern: 'Quiz' }), show({ id: 2, enabled: false })]
  assert.equal(folderForTitle({ shows, title: 'Hard Quiz' }).id, 1)
  assert.equal(folderForTitle({ shows: [shows[1]], title: 'Hard Quiz' }).id, 2)
})

test('getSeries: an unreachable TVHeadend still returns every row as a title match', async () => {
  const shows = [show()]
  const result = await getSeries({
    loadShows: async () => shows,
    loadSaving: async () => SAVING,
    loadState: async () => { throw new Error('TVHeadend is not reachable') },
    loadChannels: async () => [],
  })
  assert.deepEqual(result.series, [])
  assert.deepEqual(result.titleMatches.map((s) => s.id), [1])
  assert.equal(result.error, 'TVHeadend is not reachable')
})

test('getSeries: passes the stale flag through from the recording state', async () => {
  const result = await getSeries({
    loadShows: async () => [show()],
    loadSaving: async () => SAVING,
    loadState: async () => ({ seriesTags: [], upcomingRecordings: [], stale: true }),
    loadChannels: async () => { throw new Error('no guide') },
  })
  assert.equal(result.stale, true)
  assert.equal(result.titleMatches.length, 1)
})
