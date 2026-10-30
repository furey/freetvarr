import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  createShowIdentity,
  databaseTitleOf,
  identityFolderOf,
  titleCountryOf,
} from '../src/show-identity.js'
import { buildDestPath, episodeFilename } from '../src/sync.js'
import { existingFolderFor, newShowFolderOf } from '../src/show-folders.js'

const tvmazeShow = ({ id, name, country, network, tvdb = null, imdb = null }) => ({
  id,
  name,
  language: 'English',
  network: { name: network, country: { code: country } },
  externals: { thetvdb: tvdb, imdb },
})

const BIG_BROTHER_US = tvmazeShow({ id: 1, name: 'Big Brother', country: 'US', network: 'CBS', tvdb: 76706 })
const BIG_BROTHER_AU = tvmazeShow({ id: 2, name: 'Big Brother', country: 'AU', network: 'Seven Network', tvdb: 76237 })
const TRAITORS_US = tvmazeShow({ id: 3, name: 'The Celebrity Traitors', country: 'US', network: 'Peacock', tvdb: 470001 })
const TRAITORS_UK = tvmazeShow({ id: 4, name: 'The Celebrity Traitors', country: 'GB', network: 'BBC One', tvdb: 470002 })
const OFFICE_US = tvmazeShow({ id: 5, name: 'The Office', country: 'US', network: 'NBC', tvdb: 73244 })
const OFFICE_UK = tvmazeShow({ id: 6, name: 'The Office', country: 'GB', network: 'BBC Two', tvdb: 78107 })
const GRUEN = tvmazeShow({ id: 7, name: 'Gruen', country: 'AU', network: 'ABC', tvdb: 83281 })

const fakeClient = ({ searches = {}, episodes = {}, tmdb = {}, fail = false, hang = false } = {}) => {
  const calls = []
  const getJson = async ({ url, params = {} }) => {
    calls.push({ url, params })
    if (hang) return new Promise(() => {})
    if (fail) throw new Error('tvmaze is down')
    if (url.endsWith('/search/shows')) return (searches[params.q] || []).map((show) => ({ score: 1, show }))
    const episodeList = url.match(/\/shows\/(\d+)\/episodes$/)
    if (episodeList) return episodes[episodeList[1]] || []
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
  hintsFor: async () => null,
  externalIdsFor: async () => null,
  ...options,
})

test('keyless: an AU install picks the Australian Big Brother and tags it (AU)', async () => {
  const client = fakeClient({ searches: { 'Big Brother': [BIG_BROTHER_US, BIG_BROTHER_AU] } })
  const identity = await identityWith({ client })({ title: 'Big Brother' })
  assert.deepEqual(identity, { name: 'Big Brother (AU)', tvdbId: '76237', tmdbId: null })
  assert.equal(identityFolderOf(identity), 'Big Brother (AU) {tvdb-76237}')
  assert.ok(client.calls.every((call) => call.url.startsWith('https://api.tvmaze.com/')))
})

test('keyless: a UK install picks the UK show and tags it (UK)', async () => {
  const client = fakeClient({ searches: { 'The Office': [OFFICE_US, OFFICE_UK] } })
  const identity = await identityWith({ client, country: 'gb' })({ title: 'The Office' })
  assert.equal(identityFolderOf(identity), 'The Office (UK) {tvdb-78107}')
})

test('a country word in the guide title beats the install country', async () => {
  const client = fakeClient({ searches: { 'Celebrity Traitors': [TRAITORS_US, TRAITORS_UK] } })
  const identity = await identityWith({ client, country: 'au' })({ title: 'Celebrity Traitors UK' })
  assert.equal(identityFolderOf(identity), 'The Celebrity Traitors (UK) {tvdb-470002}')
  assert.deepEqual(client.calls.map((call) => call.params.q), ['Celebrity Traitors'])
})

test('a show whose own name ends in a country word gets no second tag', async () => {
  const named = tvmazeShow({ id: 8, name: 'Celebrity Traitors UK', country: 'GB', network: 'BBC One', tvdb: 470003 })
  const client = fakeClient({ searches: { 'Celebrity Traitors': [TRAITORS_US, named] } })
  const identity = await identityWith({ client })({ title: 'Celebrity Traitors UK' })
  assert.equal(identity.name, 'Celebrity Traitors UK')
})

test('episode evidence beats the install country', async () => {
  const client = fakeClient({
    searches: { 'Big Brother': [BIG_BROTHER_US, BIG_BROTHER_AU] },
    episodes: { 1: [{ season: 27, number: 1, name: 'Premiere' }], 2: [{ season: 17, number: 6, name: 'Day 12' }] },
  })
  const identity = await identityWith({ client, country: 'us' })({ title: 'Big Brother', episodes: [{ season: 17, episode: 6, title: null }] })
  assert.equal(identityFolderOf(identity), 'Big Brother (AU) {tvdb-76237}')
})

test('an AU install with S17 evidence picks the Australian show', async () => {
  const client = fakeClient({
    searches: { 'Big Brother': [BIG_BROTHER_US, BIG_BROTHER_AU] },
    episodes: { 1: [{ season: 27, number: 1 }], 2: [{ season: 17, number: 6 }] },
  })
  const identity = await identityWith({ client })({ title: 'Big Brother', episodes: [{ season: 17, episode: 6 }] })
  assert.equal(identity.tvdbId, '76237')
})

test('the guide channel network picks between two local shows', async () => {
  const onSeven = tvmazeShow({ id: 9, name: 'Home and Away', country: 'AU', network: 'Seven Network', tvdb: 71890 })
  const onNine = tvmazeShow({ id: 10, name: 'Home and Away', country: 'AU', network: 'Nine Network', tvdb: 99999 })
  const client = fakeClient({ searches: { 'Home and Away': [onNine, onSeven] } })
  const identity = await identityWith({ client })({ title: 'Home and Away', channelName: '7mate' })
  assert.equal(identity.tvdbId, '71890')
})

test('an AU install with two foreign shows and no evidence keeps the bare title', async () => {
  const client = fakeClient({ searches: { 'The Office': [OFFICE_US, OFFICE_UK] } })
  assert.equal(await identityWith({ client, country: 'au' })({ title: 'The Office' }), null)
  assert.equal(newShowFolderOf({ title: 'The Office', identity: null }), 'The Office')
})

test('a unique title gets no country tag', async () => {
  const client = fakeClient({ searches: { Gruen: [GRUEN] } })
  const identity = await identityWith({ client })({ title: 'Gruen' })
  assert.equal(identityFolderOf(identity), 'Gruen {tvdb-83281}')
})

test('no TVDB id and no TMDB key gives no folder hint', async () => {
  const client = fakeClient({ searches: { Gruen: [{ ...GRUEN, externals: {} }] } })
  const identity = await identityWith({ client })({ title: 'Gruen' })
  assert.equal(identityFolderOf(identity), null)
  assert.equal(newShowFolderOf({ title: 'Gruen', identity }), 'Gruen')
})

test('with a TMDB key, a show without a TVDB id gets the TMDB id', async () => {
  const client = fakeClient({
    searches: { Gruen: [{ ...GRUEN, externals: { imdb: 'tt1432727' } }] },
    tmdb: { '/find/tt1432727': { tv_results: [{ id: 8711 }] }, '/tv/8711': { id: 8711, name: 'Gruen' } },
  })
  const identity = await identityWith({ client, tmdbKey: async () => 'key' })({ title: 'Gruen' })
  assert.equal(identityFolderOf(identity), 'Gruen {tmdb-8711}')
})

test('a failed lookup gives the bare title and backs off', async () => {
  const client = fakeClient({ fail: true })
  const identify = identityWith({ client })
  assert.equal(await identify({ title: 'Big Brother' }), null)
  const callsAfterFailure = client.calls.length
  assert.equal(await identify({ title: 'Gruen' }), null)
  assert.equal(client.calls.length, callsAfterFailure)
})

test('a slow lookup gives the bare title within the wait', async () => {
  const client = fakeClient({ hang: true })
  const started = Date.now()
  assert.equal(await identityWith({ client, waitMs: 20 })({ title: 'Big Brother' }), null)
  assert.ok(Date.now() - started < 1000)
})

test('TVmaze lookups turned off give the bare title with no requests', async () => {
  const client = fakeClient({ searches: { Gruen: [GRUEN] } })
  assert.equal(await identityWith({ client, isTvmazeEnabled: async () => false })({ title: 'Gruen' }), null)
  assert.equal(client.calls.length, 0)
})

test('titleCountryOf strips a trailing country word for the search', () => {
  assert.deepEqual(titleCountryOf('Celebrity Traitors UK'), { query: 'Celebrity Traitors', country: 'GB' })
  assert.deepEqual(titleCountryOf('Love Island Australia'), { query: 'Love Island', country: 'AU' })
  assert.deepEqual(titleCountryOf('Ghosts (US)'), { query: 'Ghosts', country: 'US' })
  assert.deepEqual(titleCountryOf('Gruen'), { query: 'Gruen', country: null })
})

test('databaseTitleOf takes the tag from the matched show, not the install', () => {
  const results = [{ show: OFFICE_US }, { show: OFFICE_UK }]
  assert.equal(databaseTitleOf({ show: OFFICE_US, results }), 'The Office (US)')
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
