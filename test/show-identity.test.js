import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createShowIdentity, identityFolderOf } from '../src/show-identity.js'
import { networkFamilyOf, parsedTitleOf, titleCountryOf } from '../src/show-match.js'
import { buildDestPath, episodeFilename } from '../src/sync.js'
import { existingFolderFor, newShowFolderOf } from '../src/show-folders.js'

const ZONES = { AU: 'Australia/Sydney', GB: 'Europe/London', US: 'America/New_York', NZ: 'Pacific/Auckland' }

const tvmazeShow = ({ id, name, country, network, tvdb = null, premiered = '2000-01-01', ended = null, imdb = null }) => ({
  id,
  name,
  premiered,
  ended,
  status: ended ? 'Ended' : 'Running',
  language: 'English',
  network: { name: network, country: { code: country, timezone: ZONES[country] } },
  externals: { thetvdb: tvdb, imdb },
})

const BB_US = tvmazeShow({ id: 1453, name: 'Big Brother', country: 'US', network: 'CBS', tvdb: 76706, premiered: '2000-07-05' })
const BB_UK = tvmazeShow({ id: 1514, name: 'Big Brother', country: 'GB', network: 'Channel 4', tvdb: 72549, premiered: '2000-07-18', ended: '2018-11-05' })
const BB_AU_NINE = tvmazeShow({ id: 8471, name: 'Big Brother', country: 'AU', network: 'Nine Network', tvdb: 76237, premiered: '2001-04-23', ended: '2014-10-27' })
const BB_AU_SEVEN = tvmazeShow({ id: 48488, name: 'Big Brother', country: 'AU', network: 'Seven Network', premiered: '2020-04-26', ended: '2023-11-01' })
const BB_AU_TEN = tvmazeShow({ id: 87106, name: 'Big Brother', country: 'AU', network: 'Network 10', premiered: '2025-11-09' })
const TRAITORS_US = tvmazeShow({ id: 3, name: 'The Celebrity Traitors', country: 'US', network: 'Peacock', tvdb: 470001 })
const TRAITORS_UK = tvmazeShow({ id: 4, name: 'The Celebrity Traitors', country: 'GB', network: 'BBC One', tvdb: 470002, premiered: '2025-10-08' })
const WILTY_UK = tvmazeShow({ id: 2957, name: 'Would I Lie to You?', country: 'GB', network: 'BBC One', tvdb: 82548, premiered: '2007-06-16' })
const WILTY_US = tvmazeShow({ id: 54003, name: 'Would I Lie to You?', country: 'US', network: 'The CW', premiered: '2022-04-09' })
const WILTY_AU = tvmazeShow({ id: 59464, name: 'Would I Lie to You?', country: 'AU', network: 'Network 10', tvdb: 416047, premiered: '2022-02-28' })
const WILTY_NZ = tvmazeShow({ id: 18134, name: 'Would I Lie to You?', country: 'NZ', network: 'TV3', tvdb: 257322, premiered: '2012-02-12' })
const SURVIVOR_US = tvmazeShow({ id: 271, name: 'Survivor', country: 'US', network: 'CBS', tvdb: 76733 })
const SURVIVOR_AU = tvmazeShow({ id: 5765, name: 'Australian Survivor', country: 'AU', network: 'Network 10', tvdb: 314394, premiered: '2016-08-21' })
const GOGGLEBOX_UK = tvmazeShow({ id: 1840, name: 'Gogglebox', country: 'GB', network: 'Channel 4', tvdb: 275985 })
const GOGGLEBOX_AU = tvmazeShow({ id: 5257, name: 'Gogglebox Australia', country: 'AU', network: 'Network 10', tvdb: 291363, premiered: '2015-02-11' })
const HOT_SEAT_UK = tvmazeShow({ id: 89549, name: 'Millionaire Hot Seat', country: 'GB', network: 'ITV1', premiered: '2026-01-06' })
const HOT_SEAT_NINE = tvmazeShow({ id: 17469, name: 'Millionaire Hot Seat', country: 'AU', network: 'Nine Network', tvdb: 111111, premiered: '2009-04-20', ended: '2023-11-24' })
const HOT_SEAT_TEN = tvmazeShow({ id: 87431, name: 'Millionaire Hot Seat', country: 'AU', network: 'Network 10', tvdb: 222222, premiered: '2026-03-23' })
const SVU = tvmazeShow({ id: 4, name: 'Law & Order: Special Victims Unit', country: 'US', network: 'NBC', tvdb: 75692, premiered: '1999-09-20' })
const OFFICE_US = tvmazeShow({ id: 526, name: 'The Office', country: 'US', network: 'NBC', tvdb: 73244, premiered: '2005-03-24', ended: '2013-05-16' })
const OFFICE_UK = tvmazeShow({ id: 1214, name: 'The Office', country: 'GB', network: 'BBC Two', tvdb: 78107, premiered: '2001-07-09', ended: '2003-12-27' })
const GRUEN = tvmazeShow({ id: 7, name: 'Gruen', country: 'AU', network: 'ABC', tvdb: 83281 })

const resultsOf = (shows) => shows.map((show) => ({ score: 1, show }))

const fakeClient = ({ searches = {}, akas = {}, seasons = {}, byDate = {}, tmdb = {}, fail = false, hang = false } = {}) => {
  const calls = []
  const getJson = async ({ url, params = {} }) => {
    calls.push({ url, params })
    if (hang) return new Promise(() => {})
    if (fail) throw new Error('tvmaze is down')
    if (url.endsWith('/search/shows')) return resultsOf(searches[params.q.toLowerCase()] || [])
    const showPath = url.match(/\/shows\/(\d+)\/(akas|seasons|episodesbydate)$/)
    if (showPath?.[2] === 'akas') return akas[showPath[1]] || []
    if (showPath?.[2] === 'seasons') return (seasons[showPath[1]] || []).map((number) => ({ number }))
    if (showPath?.[2] === 'episodesbydate') return byDate[`${showPath[1]}|${params.date}`] ?? null
    const tmdbPath = Object.keys(tmdb).find((path) => url.endsWith(path))
    if (tmdbPath) return tmdb[tmdbPath]
    return null
  }
  return { getJson, calls }
}

const identityWith = ({ client, country = 'au', ...options }) => createShowIdentity({
  client,
  countryCode: () => country,
  tmdbKey: async () => null,
  isTvmazeEnabled: async () => true,
  ...options,
})

const AIRED_2026 = Date.parse('2026-10-28T08:30:00Z')

test('Big Brother on 10 picks the 2025 Network 10 entry and borrows the TVDB id of its Nine-era sibling', async () => {
  const client = fakeClient({ searches: { 'big brother': [BB_US, BB_UK, BB_AU_TEN, BB_AU_NINE, BB_AU_SEVEN] } })
  const match = await identityWith({ client })({ title: 'Big Brother', channelName: '10 Sydney', season: 17, episode: 6, start: AIRED_2026 })
  assert.equal(match.state, 'confirm')
  assert.deepEqual(match.identity, { tvmazeId: '87106', name: 'Big Brother (AU)', tvdbId: '76237', tmdbId: null, needsConfirm: true })
  assert.equal(identityFolderOf(match.identity), 'Big Brother (AU) {tvdb-76237}')
  assert.ok(client.calls.every((call) => call.url.startsWith('https://api.tvmaze.com/')))
  assert.ok(!client.calls.some((call) => call.url.includes('singlesearch')))
})

test('Celebrity Traitors UK on an AU install picks the BBC show and tags it (UK) once', async () => {
  const client = fakeClient({ searches: { 'celebrity traitors': [TRAITORS_US, TRAITORS_UK] } })
  const match = await identityWith({ client })({ title: 'Celebrity Traitors UK', channelName: 'ABC TV' })
  assert.equal(identityFolderOf(match.identity), 'The Celebrity Traitors (UK) {tvdb-470002}')
})

test('a show whose own name ends in a country word gets no second tag', async () => {
  const named = { ...TRAITORS_UK, name: 'Celebrity Traitors UK' }
  const client = fakeClient({ searches: { 'celebrity traitors uk': [named], 'celebrity traitors': [TRAITORS_US, named] } })
  const match = await identityWith({ client })({ title: 'Celebrity Traitors UK' })
  assert.equal(match.identity.name, 'Celebrity Traitors UK')
})

test('Would I Lie To You? S18 on ABC rejects the versions with too few seasons and picks the UK show', async () => {
  const client = fakeClient({
    searches: { 'would i lie to you?': [WILTY_UK, WILTY_US, WILTY_AU, WILTY_NZ] },
    seasons: { 2957: Array.from({ length: 18 }, (_, index) => index + 1), 54003: [1, 2], 59464: [1, 2], 18134: [1] },
  })
  const match = await identityWith({ client })({ title: 'Would I Lie To You?', channelName: 'ABC Entertains NSW', season: 18, episode: 3 })
  assert.equal(identityFolderOf(match.identity), 'Would I Lie to You (UK) {tvdb-82548}')
})

test('Survivor on 10 picks Australian Survivor', async () => {
  const client = fakeClient({ searches: { survivor: [SURVIVOR_US, SURVIVOR_AU] } })
  const match = await identityWith({ client })({ title: 'Survivor', channelName: '10 Sydney' })
  assert.equal(identityFolderOf(match.identity), 'Australian Survivor {tvdb-314394}')
})

test('Survivor on 10 finds Australian Survivor through the country search and its akas', async () => {
  const client = fakeClient({
    searches: { survivor: [SURVIVOR_US], 'survivor australia': [{ ...SURVIVOR_AU, name: 'Survivor: Australia Edition' }] },
    akas: { 5765: [{ name: 'Survivor', country: { code: 'AU' } }] },
  })
  const match = await identityWith({ client })({ title: 'Survivor', channelName: '10 Sydney' })
  assert.equal(match.identity.tvdbId, '314394')
})

test('Gogglebox on 10 picks Gogglebox Australia', async () => {
  const client = fakeClient({ searches: { gogglebox: [GOGGLEBOX_UK, GOGGLEBOX_AU] } })
  const match = await identityWith({ client })({ title: 'Gogglebox', channelName: '10 Peach' })
  assert.equal(identityFolderOf(match.identity), 'Gogglebox Australia {tvdb-291363}')
})

test('Millionaire Hot Seat follows the channel network: Nine 2009 on 9, Ten 2026 on 10', async () => {
  const client = fakeClient({ searches: { 'millionaire hot seat': [HOT_SEAT_UK, HOT_SEAT_NINE, HOT_SEAT_TEN] } })
  const onNine = await identityWith({ client })({ title: 'Millionaire Hot Seat', channelName: '9Gem', start: Date.parse('2019-05-01T07:00:00Z') })
  const onTen = await identityWith({ client })({ title: 'Millionaire Hot Seat', channelName: '10 Sydney', start: AIRED_2026 })
  assert.equal(onNine.identity.tvmazeId, '17469')
  assert.equal(onTen.identity.tvmazeId, '87431')
})

test('Law and Order matches Law & Order', async () => {
  const client = fakeClient({ searches: { 'law and order: special victims unit': [SVU] } })
  const match = await identityWith({ client })({ title: 'Law and Order: Special Victims Unit', channelName: '10 Drama' })
  assert.equal(identityFolderOf(match.identity), 'Law & Order Special Victims Unit {tvdb-75692}')
})

test('a calendar-year season number such as S2026E1030 is not a reason to reject', async () => {
  const client = fakeClient({ searches: { 'big brother': [BB_US, BB_AU_TEN] }, seasons: { 87106: [1, 2] } })
  const match = await identityWith({ client })({ title: 'Big Brother', channelName: '10 Sydney', season: 2026, episode: 1030 })
  assert.equal(match.identity.tvmazeId, '87106')
  assert.ok(!client.calls.some((call) => call.url.endsWith('/seasons')))
})

test('an episode that aired at the guide time decides between two same-network eras', async () => {
  const sevenOld = { ...BB_AU_SEVEN, ended: null, status: 'Running' }
  const sevenNew = tvmazeShow({ id: 99001, name: 'Big Brother', country: 'AU', network: 'Seven Network', premiered: '2024-01-01' })
  const client = fakeClient({
    searches: { 'big brother': [sevenOld, sevenNew] },
    byDate: { '99001|2026-10-28': [{ airstamp: '2026-10-28T08:30:00+00:00' }] },
  })
  const match = await identityWith({ client })({ title: 'Big Brother', channelName: '7mate', start: AIRED_2026, durationS: 3600 })
  assert.equal(match.identity.tvmazeId, '99001')
})

test('a repeat with no episode at the guide time is not held against the domestic show', async () => {
  const client = fakeClient({ searches: { 'millionaire hot seat': [HOT_SEAT_UK, HOT_SEAT_TEN] }, byDate: {} })
  const match = await identityWith({ client })({ title: 'Millionaire Hot Seat', channelName: '10 Sydney', start: AIRED_2026, durationS: 1800 })
  assert.equal(match.identity.tvmazeId, '87431')
})

test('a show that premiered after the airing is rejected', async () => {
  const client = fakeClient({ searches: { 'millionaire hot seat': [HOT_SEAT_NINE, HOT_SEAT_TEN] } })
  const match = await identityWith({ client })({ title: 'Millionaire Hot Seat', channelName: '10 Sydney', start: Date.parse('2019-05-01T07:00:00Z') })
  assert.equal(match.identity.tvmazeId, '17469')
})

test('no clear winner keeps the bare title and lists the shows to choose from', async () => {
  const client = fakeClient({ searches: { 'the office': [OFFICE_US, OFFICE_UK] } })
  const match = await identityWith({ client })({ title: 'The Office', channelName: 'ABC TV' })
  assert.equal(match.state, 'choose')
  assert.equal(match.identity, null)
  assert.equal(newShowFolderOf({ title: 'The Office', identity: match.identity }), 'The Office')
  assert.deepEqual(match.candidates.map(({ tvmazeId, name, country, network, years, folder }) => ({ tvmazeId, name, country, network, years, folder })), [
    { tvmazeId: '526', name: 'The Office', country: 'US', network: 'NBC', years: '2005–2013', folder: 'The Office (US) {tvdb-73244}' },
    { tvmazeId: '1214', name: 'The Office', country: 'UK', network: 'BBC Two', years: '2001–2003', folder: 'The Office (UK) {tvdb-78107}' },
  ])
})

test('a UK install picks the UK show on its own network', async () => {
  const client = fakeClient({ searches: { 'the office': [OFFICE_US, OFFICE_UK] } })
  const match = await identityWith({ client, country: 'gb' })({ title: 'The Office', channelName: 'BBC Two HD' })
  assert.equal(identityFolderOf(match.identity), 'The Office (UK) {tvdb-78107}')
})

test('the home country alone does not pick a show: The Office on ABC is not the Prime Video remake', async () => {
  const officeAu = tvmazeShow({ id: 74125, name: 'The Office', country: 'AU', network: 'Prime Video', tvdb: 446310, premiered: '2024-10-18', ended: '2024-10-18' })
  const client = fakeClient({ searches: { 'the office': [officeAu, OFFICE_US, OFFICE_UK] } })
  const match = await identityWith({ client })({ title: 'The Office', channelName: 'ABC TV', start: AIRED_2026 })
  assert.equal(match.state, 'choose')
  assert.equal(match.identity, null)
  assert.deepEqual(match.candidates.map((candidate) => candidate.tvmazeId), ['74125', '526', '1214'])
})

test('a unique title gets no country tag', async () => {
  const client = fakeClient({ searches: { gruen: [GRUEN] } })
  const match = await identityWith({ client })({ title: 'Gruen', channelName: 'ABC TV' })
  assert.equal(identityFolderOf(match.identity), 'Gruen {tvdb-83281}')
})

test('the owner pick for the title and network is used without a lookup', async () => {
  const client = fakeClient({ searches: { 'the office': [OFFICE_US, OFFICE_UK] } })
  const picks = []
  const loadPick = async (key) => {
    picks.push(key)
    return { tvmazeId: '1214', name: 'The Office (UK)', tvdbId: '78107', tmdbId: null }
  }
  const match = await identityWith({ client, loadPick })({ title: 'The Office', channelName: 'ABC TV Plus' })
  assert.equal(match.state, 'chosen')
  assert.equal(identityFolderOf(match.identity), 'The Office (UK) {tvdb-78107}')
  assert.deepEqual(picks, [{ titleKey: 'office', family: 'abc' }])
  assert.equal(client.calls.length, 0)
})

test('no TVDB id and no TMDB key gives no folder hint', async () => {
  const client = fakeClient({ searches: { gruen: [{ ...GRUEN, externals: {} }] } })
  const match = await identityWith({ client })({ title: 'Gruen' })
  assert.equal(identityFolderOf(match.identity), null)
  assert.equal(newShowFolderOf({ title: 'Gruen', identity: match.identity }), 'Gruen')
})

test('with a TMDB key, a show without a TVDB id gets the TMDB id', async () => {
  const client = fakeClient({
    searches: { gruen: [{ ...GRUEN, externals: { imdb: 'tt1432727' } }] },
    tmdb: { '/find/tt1432727': { tv_results: [{ id: 8711 }] }, '/tv/8711': { id: 8711, name: 'Gruen' } },
  })
  const match = await identityWith({ client, tmdbKey: async () => 'key' })({ title: 'Gruen' })
  assert.equal(identityFolderOf(match.identity), 'Gruen {tmdb-8711}')
})

test('a failed lookup gives the bare title and backs off', async () => {
  const client = fakeClient({ fail: true })
  const identify = identityWith({ client })
  const failed = await identify({ title: 'Big Brother' })
  assert.equal(failed.identity, null)
  assert.equal(failed.state, 'unreachable')
  const callsAfterFailure = client.calls.length
  assert.equal((await identify({ title: 'Gruen' })).state, 'unreachable')
  assert.equal(client.calls.length, callsAfterFailure)
})

test('a slow lookup gives the bare title within the wait', async () => {
  const client = fakeClient({ hang: true })
  const started = Date.now()
  const match = await identityWith({ client, waitMs: 20 })({ title: 'Big Brother' })
  assert.equal(match.identity, null)
  assert.equal(match.state, 'pending')
  assert.ok(Date.now() - started < 1000)
})

test('TVmaze lookups turned off give the bare title with no requests', async () => {
  const client = fakeClient({ searches: { gruen: [GRUEN] } })
  const off = await identityWith({ client, isTvmazeEnabled: async () => false })({ title: 'Gruen' })
  assert.equal(off.identity, null)
  assert.equal(off.state, 'off')
  assert.equal(client.calls.length, 0)
})

test('titleCountryOf strips a trailing country word or a leading demonym', () => {
  assert.deepEqual(titleCountryOf('Celebrity Traitors UK'), { query: 'Celebrity Traitors', country: 'GB' })
  assert.deepEqual(titleCountryOf('Gogglebox Australia'), { query: 'Gogglebox', country: 'AU' })
  assert.deepEqual(titleCountryOf('Ghosts (US)'), { query: 'Ghosts', country: 'US' })
  assert.deepEqual(titleCountryOf('Australian Survivor'), { query: 'Survivor', country: 'AU' })
  assert.deepEqual(titleCountryOf('Gruen'), { query: 'Gruen', country: null })
  assert.deepEqual([...parsedTitleOf('The Celebrity Traitors UK').keys], ['celebrity traitors uk', 'celebrity traitors'])
})

test('networkFamilyOf reduces a channel to its network family', () => {
  assert.equal(networkFamilyOf('10 Drama Sydney'), '10')
  assert.equal(networkFamilyOf('7TWO'), '7')
  assert.equal(networkFamilyOf('ABC Entertains NSW'), 'abc')
  assert.equal(networkFamilyOf(null), '')
})

test('episode files drop the folder id hint', () => {
  const show = { dest_folder: 'Big Brother (AU) {tvdb-76237}', season_template: 'Season {season}' }
  const item = { season: 17, episode: 6, episode_title: null, start: Date.UTC(2026, 9, 28), ext: 'ts' }
  assert.equal(episodeFilename({ item, show }), 'Big Brother (AU) - S17E06.ts')
  assert.equal(buildDestPath({ item, show, mediaRoot: '/media/tv' }), '/media/tv/Big Brother (AU) {tvdb-76237}/Season 17/Big Brother (AU) - S17E06.ts')
})

test('newShowFolderOf reuses a folder with the same id, then the database title, then names a new one', () => {
  const identity = { name: 'Big Brother (AU)', tvdbId: '76237', tmdbId: null }
  assert.equal(newShowFolderOf({ title: 'Big Brother', folders: ['Big Brother AU {tvdb-76237}'], identity }), 'Big Brother AU {tvdb-76237}')
  assert.equal(newShowFolderOf({ title: 'Big Brother', folders: ['Big Brother (AU)'], identity }), 'Big Brother (AU)')
  assert.equal(newShowFolderOf({ title: 'Big Brother', folders: [], identity }), 'Big Brother (AU) {tvdb-76237}')
})

test('existingFolderFor matches a folder that carries an id hint', () => {
  assert.equal(existingFolderFor({ title: 'Gruen', folders: ['Gruen {tvdb-83281}'] }), 'Gruen {tvdb-83281}')
  assert.equal(existingFolderFor({ title: 'Big Brother', folders: ['Big Brother (AU) {tvdb-76237}'] }), 'Big Brother (AU) {tvdb-76237}')
})

test('newShowFolderOf skips a folder named for the same title in another country or with another id', () => {
  const identity = { name: 'Big Brother (AU)', tvdbId: '76237', tmdbId: null }
  assert.equal(newShowFolderOf({ title: 'Big Brother', folders: ['Big Brother (US) {tvdb-76706}'], identity }), 'Big Brother (AU) {tvdb-76237}')
  assert.equal(newShowFolderOf({ title: 'Big Brother', folders: ['Big Brother (US)'], identity }), 'Big Brother (AU) {tvdb-76237}')
  assert.equal(newShowFolderOf({ title: 'Big Brother', folders: ['Big Brother {tvdb-76706}'], identity }), 'Big Brother (AU) {tvdb-76237}')
  assert.equal(newShowFolderOf({ title: 'Big Brother', folders: ['Big Brother (2001)'], identity }), 'Big Brother (2001)')
  assert.equal(newShowFolderOf({ title: 'Big Brother', folders: ['Big Brother (US)'] }), 'Big Brother (US)')
})

test('titleCountryOf leaves a title that ends in the word Us', () => {
  assert.deepEqual(titleCountryOf('The Two of Us'), { query: 'The Two of Us', country: null })
  assert.deepEqual(titleCountryOf('Ghosts US'), { query: 'Ghosts', country: 'US' })
  assert.deepEqual(titleCountryOf('Ghosts (us)'), { query: 'Ghosts', country: 'US' })
  assert.deepEqual(titleCountryOf('Love Island Australia'), { query: 'Love Island', country: 'AU' })
})
