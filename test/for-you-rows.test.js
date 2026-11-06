import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'

process.env.DB_PATH ??= path.join(os.tmpdir(), `freetvarr-for-you-rows-${process.pid}.db`)

const { buildForYou, tonightWindowOf } = await import('../src/for-you.js')
const { isTopRatedSeries, seriesFactsByKeyOf, tvmazeIdOf } = await import('../src/top-rated.js')

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const NOW = Date.UTC(2026, 9, 20, 8, 0)
const hourOf = (ms) => new Date(ms).getUTCHours()
const SEVEN = 'seven'
const ABC = 'abc'
const channels = [{ id: SEVEN, name: '7 Sydney' }, { id: ABC, name: 'ABC TV' }]

let nextId = 5000
const airing = (title, extra = {}) => {
  const start = extra.start ?? NOW + 3 * HOUR
  return {
    program_id: nextId++,
    channel_id: SEVEN,
    title,
    episode_title: null,
    synopsis: `${title} synopsis`,
    start,
    end: start + HOUR,
    series_no: 1,
    episode_no: 1,
    series_link: `${extra.channel_id ?? SEVEN}|${title.toLowerCase()}`,
    genre: null,
    image: 'https://example.com/i.jpg',
    ...extra,
  }
}

const film = (title, extra = {}) => airing(title, { series_no: null, episode_no: null, series_link: null, genre: 0x10, end: (extra.start ?? NOW + 3 * HOUR) + 2 * HOUR, ...extra })

const watched = (title, { episodes = 1, daysAgo = 3 } = {}) => Array.from({ length: episodes }, (_, index) => ({
  id: nextId++,
  ts: NOW - (daysAgo + index) * DAY,
  kind: 'watch_end',
  series_key: null,
  title,
  programme_start: NOW - (daysAgo + index + 1) * DAY,
  channel_id: SEVEN,
  recording_id: null,
  duration_s: 3600,
  position_s: 3600,
  programme_len_s: 3600,
  source: 'live',
  meta_json: '{"attended":true}',
}))

const engagedEvents = () => ['Gardening Australia', 'Hard Quiz', 'Landline', 'Muster Dogs', 'Rosehaven']
  .flatMap((title) => watched(title, { episodes: 5 }))

const recording = (title, extra = {}) => ({
  recording_id: `r${nextId++}`,
  title,
  show_title_override: null,
  season: 1,
  episode: 1,
  episode_title: null,
  aired_at: NOW - 5 * DAY,
  imported_at: NOW - 5 * DAY,
  watched_at: null,
  played_at: null,
  playback_position_s: null,
  duration_s: 3600,
  status: 'done',
  image_path: 'saved',
  purged_at: null,
  library_state: null,
  ...extra,
})

const run = (options) => buildForYou({ nowMs: NOW, channels, hourOf, timeZone: 'UTC', limit: 20, ...options })
const sectionOf = (result, key) => result.sections.find((section) => section.key === key)
const titlesIn = (result, key) => (sectionOf(result, key)?.items || []).map((item) => item.title)
const allTitles = (result) => result.sections.flatMap((section) => section.items.map((item) => item.title))

test('ready to watch: the oldest unwatched episode per show, watched and gone recordings left out', () => {
  const recordings = [
    recording('Rosehaven', { season: 2, episode: 3, aired_at: NOW - 2 * DAY }),
    recording('Rosehaven', { season: 2, episode: 1, aired_at: NOW - 9 * DAY }),
    recording('Rosehaven', { season: 2, episode: 2, aired_at: NOW - 8 * DAY, watched_at: '2026-10-15 10:00:00' }),
    recording('Fisk', { purged_at: NOW - DAY }),
    recording('Utopia', { status: 'failed' }),
    recording('Total Control', { library_state: 'not_in_library' }),
    recording('Mother and Son', { recording_id: 'rec-watched-live' }),
  ]
  const events = [...engagedEvents(), { ...watched('Mother and Son')[0], recording_id: 'rec-watched-live', source: 'recording' }]
  const result = run({ programmes: [], events, recordings })
  const section = sectionOf(result, 'ready-to-watch')
  assert.deepEqual(section.items.map((item) => item.title), ['Rosehaven'])
  const [item] = section.items
  assert.equal(item.episodeLabel, 'S2 E1')
  assert.equal(item.reason, '2 episodes to watch')
  assert.equal(item.kind, 'ready')
  assert.equal(item.start, null)
  assert.match(item.image, /^\/api\/recordings\/r\d+\/image\?w=384$/)
  assert.deepEqual(result.explanations.get(item.id).signals, ['You have 2 unwatched recordings of Rosehaven', 'This is the oldest one'])
})

test('ready to watch: shows you engage with come first, then the newest arrivals, up to 12', () => {
  const titles = Array.from({ length: 14 }, (_, index) => `Drama ${index}`)
  const recordings = titles.map((title, index) => recording(title, { imported_at: NOW - (index + 1) * HOUR }))
  recordings.push(recording('Rosehaven', { imported_at: NOW - 30 * DAY }))
  const result = run({ programmes: [], events: engagedEvents(), recordings })
  const ready = titlesIn(result, 'ready-to-watch')
  assert.equal(ready.length, 12)
  assert.equal(ready[0], 'Rosehaven')
  assert.deepEqual(ready.slice(1, 4), ['Drama 0', 'Drama 1', 'Drama 2'])
})

test('ready to watch: the row is left out when everything is watched', () => {
  const recordings = [recording('Rosehaven', { watched_at: '2026-10-15 10:00:00' })]
  const result = run({ programmes: [], events: engagedEvents(), recordings })
  assert.equal(sectionOf(result, 'ready-to-watch'), undefined)
})

test('finish what you started: shows with 1 to 3 watched episodes whose next episode airs this week', () => {
  const events = [
    ...engagedEvents(),
    ...watched('The Newsreader', { episodes: 2 }),
    ...watched('Colin from Accounts', { episodes: 3 }),
    ...watched('Bay of Fires', { episodes: 4 }),
    ...watched('Old Habit', { episodes: 1, daysAgo: 90 }),
  ]
  const programmes = [
    airing('Colin from Accounts', { start: NOW + 30 * HOUR }),
    airing('The Newsreader', { start: NOW + 5 * HOUR, episode_no: 3 }),
    airing('The Newsreader', { start: NOW + 2 * DAY, episode_no: 4 }),
    airing('Bay of Fires', { start: NOW + 4 * HOUR }),
    airing('Old Habit', { start: NOW + 4 * HOUR }),
  ]
  const result = run({ programmes, events })
  assert.deepEqual(titlesIn(result, 'finish-started'), ['The Newsreader', 'Colin from Accounts'])
  const newsreader = sectionOf(result, 'finish-started').items[0]
  assert.equal(newsreader.episodeNumber, 3)
  assert.equal(newsreader.start, NOW + 5 * HOUR)
  assert.equal(newsreader.reason, 'You watched 2 episodes')
  assert.equal(allTitles(result).filter((title) => title === 'The Newsreader').length, 1)
})

test('finish what you started: a show you already record as a series is left out', () => {
  const events = [...engagedEvents(), ...watched('The Newsreader', { episodes: 2 })]
  const result = run({ programmes: [airing('The Newsreader')], events, ruleKeys: new Set(['the-newsreader']) })
  assert.equal(sectionOf(result, 'finish-started'), undefined)
})

test('tonight: films from 5 pm to 3 am ranked by fit and rating, posters only', () => {
  const programmes = [
    film('The Castle', { start: NOW + 11 * HOUR }),
    film('Muriel\'s Wedding', { start: NOW + 12 * HOUR }),
    film('Afternoon Film', { start: NOW + 2 * HOUR }),
    film('Tomorrow Film', { start: NOW + 26 * HOUR }),
    film('Started Film', { start: NOW - HOUR }),
  ]
  const filmFacts = new Map([
    ['Muriel\'s Wedding', { score: 7.8, votes: 4000, originalLanguage: 'en' }],
    ['The Castle', { score: 6.9, votes: 900, originalLanguage: 'en' }],
  ])
  const result = run({ programmes, events: engagedEvents(), filmFacts })
  assert.deepEqual(titlesIn(result, 'tonight-movies'), ['Muriel\'s Wedding', 'The Castle'])
  const top = sectionOf(result, 'tonight-movies').items[0]
  assert.equal(top.kind, 'movie')
  assert.deepEqual(top.rating, { score: 7.8, votes: 4000 })
  assert.ok(result.explanations.get(top.id).signals.includes('TMDB users rate it 7.8 out of 10 from 4,000 votes'))
})

test('tonight: from the later of now and 5 pm local until 3 am local, or until 3 am after midnight', () => {
  const at = (iso, timeZone) => tonightWindowOf({ nowMs: Date.parse(iso), timeZone })
  assert.deepEqual(at('2026-10-20T19:45:00Z', 'UTC'), { start: Date.parse('2026-10-20T19:45:00Z'), end: Date.parse('2026-10-21T03:00:00Z') })
  assert.deepEqual(at('2026-10-21T01:10:00Z', 'UTC'), { start: Date.parse('2026-10-21T01:10:00Z'), end: Date.parse('2026-10-21T03:00:00Z') })
  assert.deepEqual(at('2026-10-21T09:00:00Z', 'UTC'), { start: Date.parse('2026-10-21T17:00:00Z'), end: Date.parse('2026-10-22T03:00:00Z') })
})

test('tonight: half-hour zones such as Adelaide and Darwin', () => {
  const at = (iso, timeZone) => tonightWindowOf({ nowMs: Date.parse(iso), timeZone })
  assert.deepEqual(at('2026-11-06T09:00:00Z', 'Australia/Adelaide'), { start: Date.parse('2026-11-06T09:00:00Z'), end: Date.parse('2026-11-06T16:30:00Z') })
  assert.deepEqual(at('2026-11-06T22:30:00Z', 'Australia/Adelaide'), { start: Date.parse('2026-11-07T06:30:00Z'), end: Date.parse('2026-11-07T16:30:00Z') })
  assert.deepEqual(at('2026-11-06T09:00:00Z', 'Australia/Darwin'), { start: Date.parse('2026-11-06T09:00:00Z'), end: Date.parse('2026-11-06T17:30:00Z') })
})

test('tonight: 3 am local on the nights daylight saving starts and ends', () => {
  const at = (iso) => tonightWindowOf({ nowMs: Date.parse(iso), timeZone: 'Australia/Sydney' })
  assert.equal(at('2026-10-03T10:00:00Z').end, Date.parse('2026-10-03T16:00:00Z'))
  assert.equal(at('2026-04-04T10:00:00Z').end, Date.parse('2026-04-04T17:00:00Z'))
})

test('top rated series: TVmaze score 7 or more and weight 50 or more, scripted only, best first', () => {
  const genresByKey = new Map([
    ['the-newsreader', { categories: ['drama'], genres: [], source: 'tvmaze:101' }],
    ['bluey', { categories: ['kids'], genres: [], source: 'tvmaze:102' }],
    ['married-at-first-sight', { categories: ['reality'], genres: [], source: 'tvmaze:103' }],
    ['niche-drama', { categories: ['drama'], genres: [], source: 'tvmaze:104' }],
    ['so-so-drama', { categories: ['drama'], genres: [], source: 'tvmaze:105' }],
  ])
  const seriesRatings = new Map([
    ['the-newsreader', { score: 8.1, weight: 92, type: 'Scripted' }],
    ['bluey', { score: 8.9, weight: 98, type: 'Animation' }],
    ['married-at-first-sight', { score: 7.5, weight: 99, type: 'Reality' }],
    ['niche-drama', { score: 9.1, weight: 20, type: 'Scripted' }],
    ['so-so-drama', { score: 6.8, weight: 90, type: 'Scripted' }],
  ])
  const programmes = ['The Newsreader', 'Bluey', 'Married at First Sight', 'Niche Drama', 'So So Drama'].map((title) => airing(title))
  const result = run({ programmes, events: engagedEvents(), genresByKey, seriesRatings })
  const section = sectionOf(result, 'top-rated-series')
  assert.deepEqual(section.items.map((item) => item.title), ['Bluey', 'The Newsreader'])
  assert.deepEqual(section.credit, { source: 'TVmaze', href: 'https://www.tvmaze.com' })
  assert.deepEqual(section.items[1].rating, { score: 8.1, votes: null })
  assert.deepEqual(result.explanations.get(section.items[1].id).signals, ['TVmaze users rate it 8.1 out of 10'])
})

test('top rated series: a guide slot that does not fit the TVmaze runtime is a different show', () => {
  const genresByKey = new Map([
    ['the-pacific', { categories: ['drama'], genres: [], source: 'tvmaze:201' }],
    ['mr-bean', { categories: ['comedy'], genres: [], source: 'tvmaze:202' }],
  ])
  const seriesRatings = new Map([
    ['the-pacific', { score: 8.3, weight: 95, type: 'Scripted', runtime: 60 }],
    ['mr-bean', { score: 8.1, weight: 90, type: 'Scripted', runtime: 25 }],
  ])
  const programmes = [
    airing('The Pacific', { end: NOW + 3 * HOUR + 30 * 60 * 1000 }),
    airing('Mr. Bean', { title: 'Mr Bean', end: NOW + 3 * HOUR + 30 * 60 * 1000 }),
  ]
  const result = run({ programmes, events: engagedEvents(), genresByKey, seriesRatings })
  assert.deepEqual(titlesIn(result, 'top-rated-series'), ['Mr Bean'])
})

test('top rated series works with no ratings saved and in cold start', () => {
  const genresByKey = new Map([['the-newsreader', { categories: ['drama'], genres: [], source: 'tvmaze:101' }]])
  const empty = run({ programmes: [airing('The Newsreader')], genresByKey })
  assert.equal(sectionOf(empty, 'top-rated-series'), undefined)
  const rated = run({ programmes: [airing('The Newsreader')], genresByKey, seriesRatings: new Map([['the-newsreader', { score: 8.1, weight: 92, type: 'Scripted' }]]) })
  assert.equal(rated.coldStart, true)
  assert.deepEqual(titlesIn(rated, 'top-rated-series'), ['The Newsreader'])
})

test('series rating helpers read saved TVmaze rows by title key and the source id', () => {
  assert.equal(tvmazeIdOf({ source: 'tvmaze:4521' }), '4521')
  assert.equal(tvmazeIdOf({ source: 'wikidata:Q1' }), null)
  assert.equal(isTopRatedSeries({ score: 7, weight: 50, type: 'Documentary' }), true)
  assert.equal(isTopRatedSeries({ score: 7, weight: 50, type: null }), false)
  const facts = seriesFactsByKeyOf([
    { lookup_key: 'tvmaze:series:the-newsreader', found_json: '{"score":8.2,"weight":97,"type":"Scripted","url":"https://www.tvmaze.com/shows/4521/x"}' },
    { lookup_key: 'tmdb:movie:the-castle', found_json: '{"score":7}' },
    { lookup_key: 'tvmaze:series:9', found_json: 'not json' },
  ])
  assert.deepEqual([...facts.keys()], ['the-newsreader'])
  assert.equal(facts.get('the-newsreader').score, 8.2)
})

test('row order puts ready and started shows first, and each show appears once', () => {
  const genresByKey = new Map([['rosehaven', { categories: ['comedy'], genres: [], source: 'tvmaze:7' }]])
  const seriesRatings = new Map([['rosehaven', { score: 8, weight: 80, type: 'Scripted' }]])
  const programmes = [
    airing('Rosehaven'),
    airing('The Newsreader', { start: NOW + 5 * HOUR }),
  ]
  const events = [...engagedEvents(), ...watched('The Newsreader', { episodes: 2 })]
  const recordings = [recording('Utopia')]
  const result = run({ programmes, events, recordings, genresByKey, seriesRatings })
  assert.deepEqual(result.sections.map((section) => section.key).slice(0, 2), ['ready-to-watch', 'finish-started'])
  assert.equal(allTitles(result).filter((title) => title === 'Rosehaven').length, 1)
  assert.deepEqual(titlesIn(result, 'finish-started'), ['The Newsreader'])
})

test('cold start keeps the new rows that need no viewing history', () => {
  const programmes = [film('The Castle', { start: NOW + 11 * HOUR }), airing('The Voice')]
  const result = run({ programmes, recordings: [recording('Utopia')] })
  assert.equal(result.coldStart, true)
  assert.deepEqual(result.sections.map((section) => section.key), ['ready-to-watch', 'tonight-movies'])
})

test('tonight: leaves out films you already recorded or watched, and shopping blocks', () => {
  const programmes = [
    film('The Castle', { start: NOW + 11 * HOUR }),
    film('Muriel\'s Wedding', { start: NOW + 12 * HOUR }),
    film('Gemporia Live', { start: NOW + 11 * HOUR }),
    film('Strictly Ballroom', { start: NOW + 13 * HOUR }),
  ]
  const recordings = [recording('The Castle', { season: null, episode: null, watched_at: '2026-10-01 10:00:00' })]
  const events = [...engagedEvents(), ...watched('Muriel\'s Wedding')]
  const result = run({ programmes, events, recordings })
  assert.deepEqual(titlesIn(result, 'tonight-movies'), ['Strictly Ballroom'])
})

test('ready to watch leaves airing rows alone, but wins over finish what you started for the same show', () => {
  const events = [...engagedEvents(), ...watched('The Newsreader', { episodes: 2 }), ...watched('Rosehaven', { episodes: 5 })]
  const programmes = [airing('The Newsreader', { start: NOW + 5 * HOUR, episode_no: 3 }), airing('Rosehaven', { start: NOW + 6 * HOUR, episode_no: 3 })]
  const recordings = [recording('The Newsreader'), recording('Rosehaven')]
  const result = run({ programmes, events, recordings })
  assert.deepEqual(titlesIn(result, 'ready-to-watch').sort(), ['Rosehaven', 'The Newsreader'])
  assert.equal(sectionOf(result, 'finish-started'), undefined)
  assert.ok(titlesIn(result, 'coming-up').includes('Rosehaven'))
  assert.ok(titlesIn(result, 'coming-up').includes('The Newsreader'))
})
