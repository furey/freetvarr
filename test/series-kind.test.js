import { test } from 'node:test'
import assert from 'node:assert/strict'

import { databaseIdsOf, isMostlySport, isYearSeason, mergeSeriesFacts, seriesFactsOf, seriesKindOf } from '../src/series-kind.js'
import { changedEvidenceOf, guideEvidenceOf } from '../src/series-evidence.js'

const DAY = 24 * 60 * 60 * 1000
const NOON = new Date(2026, 9, 30, 12).getTime()
const SPORT = 0x40

const airing = ({ day = 0, season = null, episode = null, episodeTitle = null, genres = [] } = {}) => ({
  start: NOON + day * DAY,
  season,
  episode,
  episodeTitle,
  genres,
})

const guideOf = (title, airings) => airings.map(({ day = 0, season = null, episode = null, episodeTitle = null, genre = null }) => ({
  title,
  start: NOON + day * DAY,
  series_no: season,
  episode_no: episode,
  episode_title: episodeTitle,
  genre,
}))

const kindFromGuide = ({ title, recordings, guide, recordsByKey }) => seriesKindOf({
  title,
  recordings,
  evidence: guideEvidenceOf({ programmes: guide, recordsByKey }).values().next().value ?? null,
})

test('Love Island Australia: one recorded episode with a real season number is a show', () => {
  assert.equal(seriesKindOf({ title: 'Love Island Australia', recordings: [airing({ season: 8, episode: 4 })] }), 'show')
})

test('9News: a dated season that recurs across days in the guide is a show', () => {
  const guide = guideOf('9News', [{ day: 0, season: 2026, episode: 217 }, { day: 1, season: 2026, episode: 218 }])
  assert.equal(kindFromGuide({ title: '9News', recordings: [airing({ season: 2026, episode: 217 })], guide }), 'show')
})

test('Melbourne Cup: a dated first episode on one day is a one-off', () => {
  const guide = guideOf('2026 Melbourne Cup', [{ season: 2026, episode: 1, genre: SPORT }])
  assert.equal(kindFromGuide({ title: '2026 Melbourne Cup', recordings: [airing({ season: 2026, episode: 1, genres: [SPORT] })], guide }), 'oneoff')
})

test('AFLW and the Rugby League World Cup: weekly sport with no TVDB or TMDB id is a one-off', () => {
  const guide = guideOf('AFLW', [
    { day: 0, season: 26, episode: 125, episodeTitle: 'Rnd 12: GWS v Gold Coast', genre: SPORT },
    { day: 1, season: 26, episode: 126, episodeTitle: 'Rnd 12: Carlton v Essendon', genre: SPORT },
  ])
  const evidence = { ...guideEvidenceOf({ programmes: guide }).get('aflw'), databaseIds: 'none' }
  assert.equal(seriesKindOf({ title: 'AFLW', recordings: [airing({ season: 26, episode: 125, genres: [SPORT] })], evidence }), 'oneoff')
  const games = [airing({ day: 0, season: 26, episode: 6, genres: [SPORT] }), airing({ day: 7, season: 26, episode: 15, genres: [SPORT] })]
  assert.equal(seriesKindOf({ title: 'Rugby League World Cup 2026', recordings: games, evidence: { recurs: true, databaseIds: 'none' } }), 'oneoff')
})

test('Friday Night Football: weekly sport stays a show until the database lookup answers', () => {
  const football = [airing({ day: 0, episodeTitle: 'Broncos v Storm', genres: [SPORT] }), airing({ day: 7, episodeTitle: 'Eels v Panthers', genres: [SPORT] })]
  assert.equal(seriesKindOf({ title: 'Friday Night Football', recordings: football }), 'show')
  assert.equal(seriesKindOf({ title: 'Friday Night Football', recordings: football, evidence: { databaseIds: 'none' } }), 'oneoff')
})

test('databaseIdsOf: Formula 1 with several candidates and AFL matched without a TVDB id have no id; Offsiders has one', () => {
  assert.equal(databaseIdsOf({ state: 'choose', identity: null }), 'none')
  assert.equal(databaseIdsOf({ state: 'none', identity: null }), 'none')
  assert.equal(databaseIdsOf({ state: 'matched', identity: { tvmazeId: '1', name: 'AFL', tvdbId: null, tmdbId: null } }), 'none')
  assert.equal(databaseIdsOf({ state: 'matched', identity: { tvmazeId: '2', name: 'Offsiders', tvdbId: '80577', tmdbId: null } }), 'found')
  assert.equal(databaseIdsOf({ state: 'pending', identity: null }), null)
  assert.equal(databaseIdsOf({ state: 'unreachable', identity: null }), null)
  assert.equal(databaseIdsOf({ state: 'off', identity: null }), null)
})

test('sport titles: Formula 1, AFL, and State of Origin without an id are one-offs; Offsiders with an id is a show', () => {
  const weekly = [airing({ day: 0, genres: [SPORT], episodeTitle: 'Race 1' }), airing({ day: 14, genres: [SPORT], episodeTitle: 'Race 2' })]
  assert.equal(seriesKindOf({ title: 'Formula 1', recordings: weekly, evidence: { databaseIds: databaseIdsOf({ state: 'choose' }) } }), 'oneoff')
  assert.equal(seriesKindOf({ title: 'AFL', recordings: weekly, evidence: { databaseIds: 'none' } }), 'oneoff')
  const origin = [airing({ day: 0, season: 2026, episode: 1, genres: [SPORT] }), airing({ day: 21, season: 2026, episode: 2, genres: [SPORT] })]
  assert.equal(seriesKindOf({ title: 'State of Origin', recordings: origin, evidence: { databaseIds: 'none' } }), 'oneoff')
  assert.equal(seriesKindOf({ title: 'Offsiders', recordings: weekly, evidence: { databaseIds: 'found' } }), 'show')
})

test('sport one-offs: overrides, series rules, and title matches you made win; an automatic title match does not', () => {
  const games = [airing({ day: 0, genres: [SPORT] }), airing({ day: 7, genres: [SPORT] })]
  const evidence = { databaseIds: 'none' }
  assert.equal(seriesKindOf({ title: 'AFLW', override: 'show', recordings: games, evidence }), 'show')
  assert.equal(seriesKindOf({ title: 'AFLW', hasRule: true, recordings: games, evidence }), 'show')
  assert.equal(seriesKindOf({ title: 'AFLW', hasTitleMatch: true, recordings: games, evidence }), 'oneoff')
  assert.equal(seriesKindOf({ title: 'AFLW', hasTitleMatch: true, recordings: games }), 'show')
})

test('QI: a few sport-coded airings among mostly comedy stay a show', () => {
  const qi = [
    airing({ day: 0, season: 22, episode: 1, genres: [SPORT] }),
    airing({ day: 1, season: 22, episode: 2, genres: [0x30] }),
    airing({ day: 2, season: 22, episode: 3, genres: [0x30] }),
  ]
  assert.equal(isMostlySport(qi), false)
  assert.equal(seriesKindOf({ title: 'QI', recordings: qi, evidence: { sports: true, databaseIds: 'none' } }), 'show')
})

test('a sport title with a year is a one-off while the lookup is pending, but not once an id is found', () => {
  const games = [airing({ day: 0, episodeTitle: 'Tonga v Lebanon', genres: [SPORT] }), airing({ day: 7, episodeTitle: 'Tonga v Samoa', genres: [SPORT] })]
  assert.equal(seriesKindOf({ title: 'Rugby League World Cup 2026', recordings: games }), 'oneoff')
  assert.equal(seriesKindOf({ title: 'Rugby League World Cup 2026', recordings: games, evidence: { databaseIds: 'found' } }), 'show')
})

test('State of Origin: one game is a one-off, a second recorded game makes the series a show', () => {
  const game1 = airing({ day: 0, season: 2026, episode: 1, genres: [SPORT] })
  assert.equal(seriesKindOf({ title: 'State of Origin', recordings: [game1] }), 'oneoff')
  const game2 = airing({ day: 21, season: 2026, episode: 2, genres: [SPORT] })
  assert.equal(seriesKindOf({ title: 'State of Origin', recordings: [game1, game2] }), 'show')
})

test('the Logies and award shows are one-offs, by title or by TVmaze type', () => {
  assert.equal(seriesKindOf({ title: 'The 2026 Logie Awards', recordings: [airing({ season: 2026, episode: 1 })] }), 'oneoff')
  const guide = guideOf('ARIAs', [{ season: 2026, episode: 1 }])
  const recordsByKey = new Map([['arias', { genres: ['type:Award Show'] }]])
  assert.equal(kindFromGuide({ title: 'ARIAs', recordings: [], guide, recordsByKey }), 'oneoff')
})

test('USA Votes: a block numbered from E1 on one day stays a one-off', () => {
  const guide = guideOf('USA Votes', [1, 2, 3, 4, 5].map((episode) => ({ season: 2026, episode })))
  assert.equal(kindFromGuide({ title: 'USA Votes', recordings: [airing({ season: 2026, episode: 3 })], guide }), 'oneoff')
})

test('films, overrides, and series rules come first', () => {
  assert.equal(seriesKindOf({ title: 'Heat', isFilm: true, recordings: [airing()] }), 'movie')
  assert.equal(seriesKindOf({ title: 'Heat', isFilm: true, override: 'not-movie', recordings: [airing()] }), 'oneoff')
  assert.equal(seriesKindOf({ title: 'Love Island Australia', override: 'one-off', recordings: [airing({ season: 8, episode: 4 })] }), 'oneoff')
  assert.equal(seriesKindOf({ title: 'Melbourne Cup', override: 'show', recordings: [airing({ season: 2026, episode: 1 })] }), 'show')
  assert.equal(seriesKindOf({ title: 'Hard Quiz', hasRule: true }), 'show')
  assert.equal(seriesKindOf({ title: 'Untitled Special', recordings: [airing()] }), 'oneoff')
})

test('repeats and simulcasts of one episode do not count as recurrence', () => {
  const facts = seriesFactsOf([
    airing({ day: 0, season: 2026, episode: 1, genres: [SPORT] }),
    airing({ day: 0, season: 2026, episode: 1, genres: [SPORT] }),
    airing({ day: 3, season: 2026, episode: 1, genres: [SPORT] }),
  ])
  assert.equal(facts.recurs, false)
  assert.equal(facts.minDatedEpisode, 1)
})

test('isYearSeason: four-digit years and two-digit years near the airing are dates, not seasons', () => {
  assert.equal(isYearSeason({ season: 2026, start: NOON }), true)
  assert.equal(isYearSeason({ season: 26, start: NOON }), true)
  assert.equal(isYearSeason({ season: 8, start: NOON }), false)
})

test('evidence only grows: a later guide load keeps what an earlier one saw', () => {
  const stored = new Map([['afl', mergeSeriesFacts(null, { recurs: true, minDatedEpisode: 3 })]])
  const fresh = guideEvidenceOf({ programmes: guideOf('AFL', [{ season: 2026, episode: 9 }]) })
  assert.equal(changedEvidenceOf({ stored, fresh }).size, 0)
  const newer = guideEvidenceOf({ programmes: guideOf('AFL', [{ season: 2026, episode: 2 }]) })
  assert.equal(changedEvidenceOf({ stored, fresh: newer }).get('afl').minDatedEpisode, 2)
  assert.equal(changedEvidenceOf({ stored, fresh: newer }).get('afl').recurs, true)
})
