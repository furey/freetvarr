import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'

process.env.DB_PATH ??= path.join(os.tmpdir(), `freetvarr-for-you-${process.pid}.db`)

const { buildForYou, diversify, isInfomercial, premiereCheckOf, timeLabelOf } = await import('../src/for-you.js')
const { LIKED_AFFINITY, decayOf, hiddenShowsOf, profileOf, watchFractionOf, watchWeightOf } = await import('../src/for-you-profile.js')
const { embedTextOf, textHashOf } = await import('../src/for-you-texts.js')
const { autorecMatchFieldsOf } = await import('../src/autorec-match.js')

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const NOW = Date.UTC(2026, 9, 20, 2, 0)
const hourOf = (ms) => new Date(ms).getUTCHours()
const NINE = 'nine'
const SEVEN = 'seven'
const channels = [{ id: NINE, name: '9HD Sydney' }, { id: SEVEN, name: '7 Sydney' }]

let nextId = 1000
const airing = (title, extra = {}) => {
  const start = extra.start ?? NOW + 10 * HOUR
  return {
    program_id: nextId++,
    channel_id: SEVEN,
    title,
    episode_title: null,
    synopsis: `${title} synopsis`,
    start,
    end: start + HOUR,
    series_no: null,
    episode_no: null,
    series_link: `${extra.channel_id ?? SEVEN}|${title.toLowerCase()}`,
    genre: null,
    image: 'https://example.com/i.jpg',
    ...extra,
  }
}

const watched = (title, { episodes = 1, completed = episodes, daysAgo = 3, channel = SEVEN, atHour = 19 } = {}) =>
  Array.from({ length: episodes }, (_, index) => {
    const ts = NOW - (daysAgo + index) * DAY
    const start = Math.floor((ts - 2 * DAY) / DAY) * DAY + atHour * HOUR
    const full = index < completed
    return {
      id: nextId++,
      ts,
      kind: 'watch_end',
      series_key: null,
      title,
      programme_start: start,
      channel_id: channel,
      recording_id: null,
      duration_s: full ? 3600 : 900,
      position_s: full ? 3600 : 900,
      programme_len_s: 3600,
      source: 'live',
      meta_json: '{"attended":true}',
    }
  })

const feedback = (kind, title, daysAgo = 1) => ({ id: nextId++, ts: NOW - daysAgo * DAY, kind, title, series_key: null, meta_json: null })

const baseEvents = () => [
  ...watched('Gardening Australia', { episodes: 2 }),
  ...watched('Hard Quiz', { episodes: 2 }),
  ...watched('Landline', { episodes: 2 }),
  ...watched('Muster Dogs', { episodes: 2 }),
]

const run = (options) => buildForYou({ nowMs: NOW, channels, hourOf, ...options })
const sectionOf = (result, key) => result.sections.find((section) => section.key === key)
const itemFor = (result, title) => result.sections.flatMap((section) => section.items).find((item) => item.title === title)

test('half-life of sixty days', () => {
  assert.equal(decayOf({ ts: NOW, nowMs: NOW }), 1)
  assert.ok(Math.abs(decayOf({ ts: NOW - 60 * DAY, nowMs: NOW }) - 0.5) < 1e-9)
})

test('watch fraction prefers duration for live and position for recordings', () => {
  assert.equal(watchFractionOf({ event: { source: 'live', duration_s: 1800, position_s: 3500, programme_len_s: 3600 } }), 0.5)
  assert.equal(watchFractionOf({ event: { source: 'recording', duration_s: 60, position_s: 3240, programme_len_s: 3600 } }), 0.9)
  assert.equal(watchFractionOf({ event: { source: 'recording' }, meta: { watched: true } }), 1)
})

test('a show you finish most episodes of comes up with a reason and signals', () => {
  const events = [...baseEvents(), ...watched('The Block', { episodes: 10, completed: 9 })]
  const block = airing('The Block', { channel_id: NINE })
  const result = run({ programmes: [block, airing('Other Show')], events })
  assert.equal(result.coldStart, false)
  const item = sectionOf(result, 'coming-up').items.find((entry) => entry.title === 'The Block')
  assert.equal(item.kind, 'liked')
  assert.equal(item.reason, 'Because you watched The Block')
  assert.equal(item.channelName, '9HD Sydney')
  assert.equal(item.canRecordSeries, true)
  const why = result.explanations.get(item.id)
  assert.ok(why.signals.includes('You watched 9 of 10 episodes of The Block'))
  assert.equal(why.reasons[0].text, 'Because you watched The Block')
})

test('watch weight grows with how much was watched and peaks past 80%', () => {
  const weights = [60, 300, 600, 1200, 2400, 2880, 3600].map((seconds) => watchWeightOf({ seconds, length: 3600 }))
  assert.deepEqual(weights.slice(0, 2), [0, 0])
  assert.ok(weights[2] > 0)
  for (let i = 3; i < weights.length; i += 1) assert.ok(weights[i] >= weights[i - 1])
  assert.ok(weights[5] > 1.2 && weights[5] < 2)
  assert.ok(watchWeightOf({ fraction: 0.25, seconds: 0, length: 7200 }) > 0)
})

test('opening a programme again and again stays a small signal with no reason line', () => {
  const opens = Array.from({ length: 12 }, (_, index) => feedback(index % 2 ? 'programme_opened' : 'suggestion_accepted', 'Harry Brown', 1 + (index % 4)))
  const shortTune = { ...watched('Harry Brown')[0], duration_s: 90, position_s: 90 }
  const events = [...baseEvents(), ...watched('Rake', { episodes: 2 }), ...opens, shortTune]
  const show = profileOf({ events, nowMs: NOW, hourOf }).shows.get('harry-brown')
  assert.ok(show.affinity > 0 && show.affinity < LIKED_AFFINITY)
  assert.equal(show.episodesStarted, 0)
  const genresByKey = new Map(['gardening-australia', 'hard-quiz', 'landline', 'muster-dogs', 'rake', 'harry-brown'].map((key) => [key, ['drama']]))
  const result = run({ programmes: [airing('Harry Brown')], events, genresByKey })
  const item = itemFor(result, 'Harry Brown')
  assert.equal(item.reason, 'Because you like drama')
  assert.ok(result.explanations.get(item.id).signals.includes('You looked at Harry Brown recently'))
})

test('the reason names how you engaged: watched, recorded, or More like this', () => {
  const recordedEvents = [...baseEvents(), { id: nextId++, ts: NOW - DAY, kind: 'record_request', title: 'Rake', meta_json: '{"type":"series"}' }]
  assert.equal(itemFor(run({ programmes: [airing('Rake')], events: recordedEvents }), 'Rake').reason, 'Because you recorded Rake')
  const likedEvents = [...recordedEvents, feedback('thumb_up', 'Rake')]
  assert.equal(itemFor(run({ programmes: [airing('Rake')], events: likedEvents }), 'Rake').reason, 'More like Rake')
  const watchedEvents = [...baseEvents(), ...watched('Rake', { episodes: 2 })]
  assert.equal(itemFor(run({ programmes: [airing('Rake')], events: watchedEvents }), 'Rake').reason, 'Because you watched Rake')
})

test('live watching without attended time gives no watch credit or reason', () => {
  const unattended = watched('Beyond Paradise', { episodes: 1, completed: 1 }).map((event) => ({ ...event, meta_json: '{"session_id":"s1","reason":"stopped"}' }))
  const opened = { id: nextId++, ts: NOW - DAY, kind: 'programme_opened', title: 'Beyond Paradise', series_key: null, meta_json: null }
  const profile = profileOf({ events: [...unattended, opened], nowMs: NOW, hourOf })
  const show = profile.shows.get('beyond-paradise')
  assert.equal(show.episodesStarted, 0)
  assert.ok(show.affinity < LIKED_AFFINITY)
  assert.equal(profile.habits.total, 0)
  const item = itemFor(run({ programmes: [airing('Beyond Paradise')], events: [...baseEvents(), ...unattended, opened] }), 'Beyond Paradise')
  assert.notEqual(item?.reason, 'Because you watched Beyond Paradise')
})

test('one item per show, the best airing wins', () => {
  const events = [...baseEvents(), ...watched('The Block', { episodes: 4 })]
  const result = run({ programmes: [airing('The Block', { start: NOW + 2 * HOUR }), airing('The Block', { start: NOW + 26 * HOUR })], events })
  const blocks = result.sections.flatMap((section) => section.items).filter((item) => item.title === 'The Block')
  assert.equal(blocks.length, 1)
})

test('scheduled, ruled, recorded, ended and infomercial airings are left out', () => {
  const events = [...baseEvents(), ...watched('The Block', { episodes: 4 }), ...watched('MKR', { episodes: 4 }), ...watched('Bluey', { episodes: 4 })]
  const scheduled = airing('The Block')
  const recorded = airing('Bluey', { series_no: 3, episode_no: 5 })
  const programmes = [
    scheduled,
    airing('MKR'),
    recorded,
    airing('Gardening Australia', { dvr_state: 'scheduled' }),
    airing('Hard Quiz', { start: NOW - 2 * HOUR }),
    airing('TVSN'),
    airing('Danoz Direct'),
    airing('Infomercials'),
  ]
  const recordings = [{ recording_id: 'r1', title: 'Bluey', season: 3, episode: 5 }]
  const result = run({ programmes, events, recordings, scheduledProgramIds: new Set([String(scheduled.program_id)]), ruleKeys: new Set(['mkr']) })
  assert.deepEqual(result.sections.flatMap((section) => section.items), [])
  assert.equal(isInfomercial({ title: 'Global Shop Direct' }), true)
  assert.equal(isInfomercial({ title: 'Paid Programming' }), true)
  assert.equal(isInfomercial({ title: 'Shopping Spree Stories', synopsis: 'Drama.' }), false)
})

test('a new season of a show you finished is called out', () => {
  const events = [...baseEvents(), ...watched('The Block', { episodes: 5 })]
  const recordings = [{ recording_id: 'r1', title: 'The Block', season: 22, episode: 40, aired_at: NOW - 10 * DAY, watched_at: '2026-10-11 10:00:00', duration_s: 3600 }]
  const result = run({ programmes: [airing('The Block', { series_no: 23, episode_no: 1 })], events, recordings })
  const item = sectionOf(result, 'new-seasons').items[0]
  assert.equal(item.kind, 'returning')
  assert.equal(item.reason, 'New season of a show you finished')
  assert.ok(result.explanations.get(item.id).signals.includes('Season 23 is airing; you last recorded season 22'))
})

test('a liked show you have not touched in weeks is back after a break', () => {
  const events = [...baseEvents(), ...watched('Rake', { episodes: 6, daysAgo: 70 })]
  const item = itemFor(run({ programmes: [airing('Rake')], events }), 'Rake')
  assert.equal(item.kind, 'returning')
  assert.equal(item.reason, 'Back after a break')
  assert.equal(sectionOf(run({ programmes: [airing('Rake')], events }), 'new-seasons').items[0].title, 'Rake')
})

test('abandoned shows (three or more starts, under 15% finished) are not treated as liked', () => {
  const events = [...baseEvents(), ...watched('Dud Show', { episodes: 4, completed: 0 })]
  const result = run({ programmes: [airing('Dud Show')], events })
  const item = itemFor(result, 'Dud Show')
  assert.ok(!item || item.kind !== 'liked')
  assert.ok(!sectionOf(result, 'coming-up'))
})

test('not interested hides a show for 90 days, thumbs down hides it outright', () => {
  const programmes = [airing('The Block'), airing('MKR')]
  const liked = [...baseEvents(), ...watched('The Block', { episodes: 4 }), ...watched('MKR', { episodes: 4 })]
  const hidden = run({ programmes, events: [...liked, feedback('not_interested', 'The Block', 10), feedback('thumb_down', 'MKR', 200)] })
  assert.equal(itemFor(hidden, 'The Block'), undefined)
  assert.equal(itemFor(hidden, 'MKR'), undefined)
  const expired = run({ programmes, events: [...liked, feedback('not_interested', 'The Block', 91)] })
  assert.ok(itemFor(expired, 'The Block'))
})

test('dismissals lower the score', () => {
  const events = [...baseEvents(), ...watched('The Block', { episodes: 4 })]
  const before = itemFor(run({ programmes: [airing('The Block')], events }), 'The Block').score
  const after = itemFor(run({ programmes: [airing('The Block')], events: [...events, feedback('suggestion_dismissed', 'The Block')] }), 'The Block').score
  assert.ok(after < before * 0.7)
})

test('channel and time habits give a habit reason', () => {
  const events = [...baseEvents(), ...['A', 'B', 'C', 'D', 'E'].flatMap((letter) => watched(`Nine Show ${letter}`, { channel: NINE, atHour: 19 }))]
  const start = Math.floor(NOW / DAY) * DAY + DAY + 19 * HOUR
  const result = run({ programmes: [airing('Fresh Thing', { channel_id: NINE, start })], events })
  const item = itemFor(result, 'Fresh Thing')
  assert.equal(item.kind, 'habit')
  assert.equal(item.reason, 'You often watch 9HD Sydney at 7 pm')
})

test('genre affinity suggests shows in the genres you watch', () => {
  const events = [...baseEvents(), ...watched('MasterChef', { episodes: 4 }), ...watched('My Kitchen Rules', { episodes: 4 })]
  const genresByKey = new Map([['masterchef', ['reality', 'food']], ['my-kitchen-rules', ['reality', 'food']], ['hells-kitchen', ['reality', 'food']], ['war-docs', ['documentary']]])
  const result = run({ programmes: [airing('Hells Kitchen'), airing('War Docs')], events, genresByKey })
  const kitchen = itemFor(result, 'Hells Kitchen')
  assert.match(kitchen.reason, /^Because you like (reality|food)$/)
  assert.ok(!itemFor(result, 'War Docs') || itemFor(result, 'War Docs').score < kitchen.score)
})

test('embedding similarity explains with the nearest liked title', () => {
  const events = [...baseEvents(), ...watched('The Block', { episodes: 6 })]
  const block = airing('The Block', { synopsis: 'Couples renovate.' })
  const house = airing('House Rules', { synopsis: 'Teams renovate homes.' })
  const cricket = airing('Cricket Talk', { synopsis: 'Panel talks cricket.' })
  const vector = (values) => Float32Array.from(values)
  const vectorsByHash = new Map([
    [textHashOf(embedTextOf(block)), vector([1, 0, 0])],
    [textHashOf(embedTextOf(house)), vector([0.95, 0.31, 0])],
    [textHashOf(embedTextOf(cricket)), vector([0, 0, 1])],
  ])
  const result = run({ programmes: [block, house, cricket], events, vectorsByHash, tier: 'standard' })
  assert.equal(result.similarity, 'embedding')
  const item = itemFor(result, 'House Rules')
  assert.equal(item.reason, 'Similar to The Block')
  assert.equal(item.kind, 'similar')
  assert.ok(!itemFor(result, 'Cricket Talk') || itemFor(result, 'Cricket Talk').reason !== 'Similar to The Block')
})

test('the basic tier uses BM25 text similarity', () => {
  const events = [...baseEvents(), ...watched('The Block', { episodes: 6 })]
  const programmes = [
    airing('The Block', { synopsis: 'Couples renovate apartments and auction them for profit.' }),
    airing('House Rules', { synopsis: 'Couples renovate houses in a renovation contest.' }),
    airing('Cricket Talk', { synopsis: 'Panel discusses batting averages.' }),
    airing('Bowls', { synopsis: 'Lawn bowls highlights.' }),
  ]
  const result = run({ programmes, events, tier: 'basic' })
  assert.equal(result.similarity, 'bm25')
  assert.equal(itemFor(result, 'House Rules').reason, 'Similar to The Block')
})

test('premieres are new first episodes, never reruns', () => {
  const fresh = (key) => [key, { categories: ['drama'], genres: ['premiered:2026-10-18', 'status:Running'], source: 'tvmaze:1' }]
  const known = new Map([fresh('brand-new-drama'), fresh('summit'), fresh('friends'), fresh('brassic')])
  const premiereOf = (programme, { upcoming = [programme], history = [], records = known, channelNames = new Map() } = {}) =>
    premiereCheckOf({ upcoming, history, records, channelNames, nowMs: NOW })(programme)
  const pilot = airing('Brand New Drama', { series_no: 1, episode_no: 1 })
  assert.equal(premiereOf(pilot), true)
  assert.equal(premiereOf(pilot, { records: new Map() }), false)
  assert.equal(premiereOf(airing('Footy', { series_no: 2026, episode_no: 1 })), false)
  assert.equal(premiereOf(airing('Old Show', { episode_no: 4, synopsis: 'Series premiere.' })), false)
  const strip = Array.from({ length: 6 }, (_, index) => airing('Friends', { series_no: 1, episode_no: index + 1 }))
  assert.equal(premiereOf(strip[0], { upcoming: strip }), false)
  const mixed = [airing('Brassic', { series_no: 3, episode_no: 1 }), airing('Brassic', { series_no: 2, episode_no: 5 })]
  assert.equal(premiereOf(mixed[0], { upcoming: mixed }), false)
  const seenYesterday = airing('Summit', { series_no: 1, episode_no: 1 })
  assert.equal(premiereOf(seenYesterday, { history: [airing('Summit', { start: NOW - DAY, series_no: 1, episode_no: 1 })] }), false)
  const returning = airing('Summit', { series_no: 3, episode_no: 1 })
  const history = [airing('Summit', { start: NOW - DAY, series_no: 2, episode_no: 9 })]
  assert.equal(premiereOf(returning, { history }), true)
  assert.equal(premiereOf(returning, { history, channelNames: new Map([[SEVEN, '9Go!HD Sydney']]) }), false)
  const ended = new Map([['brand-new-drama', { categories: ['drama'], genres: ['status:Ended'], source: 'tvmaze:1' }]])
  assert.equal(premiereOf(pilot, { records: ended }), false)
  const old = new Map([['brand-new-drama', { categories: ['drama'], genres: ['premiered:2019-01-01'], source: 'tvmaze:1' }]])
  assert.equal(premiereOf(pilot, { records: old }), false)
  const result = run({ programmes: [pilot], events: baseEvents().concat(watched('Fifth', { episodes: 2 })), genresByKey: known })
  assert.equal(itemFor(result, 'Brand New Drama').reason, 'A premiere this week')
})

test('movies are films only, never series', () => {
  const events = baseEvents().concat(watched('Fifth', { episodes: 2 }))
  const evening = Math.floor(NOW / DAY) * DAY + 19 * HOUR
  const film = airing('A Big Movie', { start: evening, end: evening + 2 * HOUR })
  const marathon = [0, 1, 2].map((day) => airing('Friends', { start: NOW + (day * 24 + 10) * HOUR, end: NOW + (day * 24 + 12) * HOUR }))
  const matched = airing('The Big Bang Theory', { end: NOW + 12 * HOUR })
  const genresByKey = new Map([['the-big-bang-theory', { categories: ['comedy'], genres: ['type:Scripted'], source: 'tvmaze:66' }]])
  const result = run({ programmes: [film, ...marathon, matched], events, genresByKey })
  assert.equal(itemFor(result, 'A Big Movie').kind, 'movie')
  assert.notEqual(itemFor(result, 'Friends')?.kind, 'movie')
  assert.notEqual(itemFor(result, 'The Big Bang Theory')?.kind, 'movie')
  assert.deepEqual(sectionOf(result, 'movies').items.map((item) => item.title), ['A Big Movie'])
})

test('a film without a guide picture asks for film artwork', () => {
  const events = baseEvents().concat(watched('Fifth', { episodes: 2 }))
  const evening = Math.floor(NOW / DAY) * DAY + 19 * HOUR
  const film = airing('Training Day (2001)', { start: evening, end: evening + 2 * HOUR, image: null })
  const result = run({ programmes: [film], events })
  assert.equal(itemFor(result, 'Training Day (2001)').image, '/api/epg/show-image?title=Training%20Day%20(2001)&kind=movie')
})

test('hidden shows list and undo', () => {
  const events = [feedback('not_interested', 'The Block', 10), feedback('not_interested', 'MKR', 100), feedback('not_interested', 'Rake', 5), feedback('not_interested_undo', 'Rake', 4)]
  const hidden = hiddenShowsOf({ profile: profileOf({ events, nowMs: NOW }), nowMs: NOW })
  assert.deepEqual(hidden.map((show) => [show.seriesKey, show.until - show.hiddenAt]), [['the-block', 90 * DAY]])
})

test('cold start offers premieres and movies only', () => {
  const programmes = [
    airing('Brand New Drama', { series_no: 1, episode_no: 1 }),
    airing('A Big Movie', { end: NOW + 13 * HOUR, genre: 0x10 }),
    airing('Midweek Repeat', { series_no: 4, episode_no: 7 }),
  ]
  const genresByKey = new Map([['brand-new-drama', { categories: ['drama'], genres: ['premiered:2026-10-19'], source: 'tvmaze:2' }]])
  const result = run({ programmes, events: watched('Only Show', { episodes: 2 }), genresByKey })
  assert.equal(result.coldStart, true)
  assert.deepEqual(result.sections.map((section) => section.key), ['premieres', 'movies'])
  assert.equal(sectionOf(result, 'movies').items[0].kind, 'movie')
  assert.equal(sectionOf(result, 'movies').items[0].canRecordSeries, false)
  assert.ok(result.topPick)
})

test('diversity caps a genre at three in ten and adds exploration slots', () => {
  const entries = Array.from({ length: 12 }, (_, index) => ({
    score: 1 - index / 100,
    primaryGenre: index < 9 ? 'reality' : 'drama',
    item: { seriesKey: `show-${index}`, image: 'x', reason: 'r' },
  })).concat([{ score: 0.1, primaryGenre: 'documentary', item: { seriesKey: 'doco', image: 'x', reason: 'r' } }])
  const picked = diversify({ entries, limit: 10, genreShares: new Map([['reality', 0.7], ['drama', 0.3]]) })
  const reality = picked.filter((entry) => entry.primaryGenre === 'reality').length
  assert.ok(reality <= 3)
  assert.ok(picked.some((entry) => entry.explored && entry.item.seriesKey === 'doco'))
  assert.equal(picked.find((entry) => entry.explored).item.reason, 'Something different this week')
})

test('profiles count recordings and requests', () => {
  const profile = profileOf({
    nowMs: NOW,
    recordings: [{ recording_id: 'a', title: 'The Block', season: 22, aired_at: NOW - DAY, watched_at: null, playback_position_s: 0 }],
    events: [{ ts: NOW - DAY, kind: 'record_request', title: 'The Block', meta_json: '{"type":"series"}' }],
  })
  const show = profile.shows.get('the-block')
  assert.equal(show.recordings, 1)
  assert.equal(show.maxSeason, 22)
  assert.ok(show.affinity > 0.25)
})

test('time labels read like Australian clocks', () => {
  assert.equal(timeLabelOf({ ms: 19 * HOUR, hourOf, minuteOf: () => 0 }), '7 pm')
  assert.equal(timeLabelOf({ ms: 19 * HOUR, hourOf, minuteOf: () => 30 }), '7.30 pm')
  assert.equal(timeLabelOf({ ms: 0, hourOf, minuteOf: () => 0 }), '12 am')
})

test('ranks a full week guide', (t) => {
  const titles = Array.from({ length: 1300 }, (_, index) => `Show ${index}`)
  const programmes = Array.from({ length: 8000 }, (_, index) => airing(titles[index % titles.length], {
    start: NOW + (index % 160) * HOUR,
    synopsis: `Episode ${index} of ${titles[index % titles.length]} with words ${index % 97} and ${index % 31}.`,
  }))
  const events = [...baseEvents(), ...titles.slice(0, 40).flatMap((title) => watched(title, { episodes: 3 }))]
  const started = performance.now()
  const result = run({ programmes, events })
  t.diagnostic(`8000 airings ranked in ${Math.round(performance.now() - started)} ms`)
  assert.ok(result.sections.length > 0)
  assert.ok(result.sections.every((section) => section.items.length <= 10))
})

test('recording titles with an episode suffix join the show', () => {
  const events = [...baseEvents(), ...watched('The Block', { episodes: 2 })]
  const recordings = [{ recording_id: 'r9', title: 'The Block - Kids Room Week', season: 22, episode: 35, aired_at: NOW - DAY }]
  const result = run({ programmes: [airing('The Block')], events, recordings })
  const why = result.explanations.get(itemFor(result, 'The Block').id)
  assert.ok(why.signals.includes('You recorded 1 episode of The Block'))
})

test('genre shares count shows with no known genre', () => {
  const events = [...baseEvents(), ...watched('NRL Grand Final', { episodes: 1 })]
  const result = run({ programmes: [airing('Surfing Australia TV')], events, genresByKey: new Map([['surfing-australia-tv', ['sport']]]) })
  const item = itemFor(result, 'Surfing Australia TV')
  const signal = result.explanations.get(item.id).signals.find((text) => text.startsWith('Sport is'))
  assert.ok(signal && !signal.includes('100%'), signal)
})

test('a close description match names the liked show even when the genre also fits', () => {
  const events = [...baseEvents(), ...watched('The Block', { episodes: 6 })]
  const block = airing('The Block', { synopsis: 'Couples renovate.' })
  const house = airing('House Rules', { synopsis: 'Teams renovate homes.' })
  const vectorsByHash = new Map([
    [textHashOf(embedTextOf(block)), Float32Array.from([1, 0])],
    [textHashOf(embedTextOf(house)), Float32Array.from([0.8, 0.6])],
  ])
  const genresByKey = new Map([['the-block', ['reality']], ['house-rules', ['reality']]])
  const result = run({ programmes: [block, house], events, vectorsByHash, genresByKey, tier: 'standard' })
  assert.equal(itemFor(result, 'House Rules').reason, 'Similar to The Block')
})

const film = (title, { day = 1, ...extra } = {}) => {
  const start = NOW + (day * 24 + 8) * HOUR
  return airing(title, { start, end: start + 2 * HOUR, genre: 0x10, kind: 'movie', series_link: null, ...extra })
}

const factsOf = (entries) => new Map(entries.map(([title, score, votes, originalLanguage = 'en']) => [title, { score, votes, originalLanguage }]))

test('top rated movies rank by vote-weighted score and leave Movies this week', () => {
  const events = baseEvents().concat(watched('Fifth', { episodes: 2 }))
  const programmes = [film('Tiny Gem'), film('The Pianist', { day: 2 }), film('West Side Story', { day: 3 }), film('No Score Film'), film('Plain Film', { day: 4 })]
  const filmFacts = factsOf([['Tiny Gem', 9.0, 3], ['The Pianist', 8.4, 20000], ['West Side Story', 7.8, 4000], ['Plain Film', 5.1, 900]])
  const result = run({ programmes, events, filmFacts })
  const topRated = sectionOf(result, 'top-rated')
  assert.equal(topRated.title, 'Top rated movies this week')
  assert.deepEqual(topRated.items.map((item) => item.title), ['The Pianist', 'West Side Story', 'Tiny Gem', 'Plain Film'])
  assert.deepEqual(topRated.items[0].rating, { score: 8.4, votes: 20000 })
  assert.equal(topRated.items[0].kind, 'movie')
  const movies = sectionOf(result, 'movies')?.items.map((item) => item.title) ?? []
  assert.ok(!movies.some((title) => topRated.items.some((item) => item.title === title)))
  assert.match(result.explanations.get(topRated.items[0].id).signals[0], /8\.4 out of 10 from 20,000 votes/)
})

test('top rated movies sit directly above Movies this week', () => {
  const events = baseEvents().concat(watched('Fifth', { episodes: 2 }))
  const evening = Math.floor(NOW / DAY) * DAY + 19 * HOUR
  const programmes = [film('Rated Film'), airing('Prime Film', { start: evening, end: evening + 2 * HOUR, genre: 0x10, kind: 'movie' })]
  const result = run({ programmes, events, filmFacts: factsOf([['Rated Film', 8, 3000]]) })
  const keys = result.sections.map((section) => section.key)
  assert.equal(keys.indexOf('movies'), keys.indexOf('top-rated') + 1)
})

test('top rated movies keep ten, skip watched films and Fewer like this, and take the next airing', () => {
  const programmes = Array.from({ length: 12 }, (_, index) => film(`Film ${index}`, { day: (index % 6) + 1 }))
    .concat([film('Seen It'), film('Not For Me'), film('Twice Shown', { day: 5 }), film('Twice Shown', { day: 2 })])
  const filmFacts = factsOf([
    ...Array.from({ length: 12 }, (_, index) => [`Film ${index}`, 7 + index / 10, 3000]),
    ['Seen It', 9.5, 50000], ['Not For Me', 9.4, 50000], ['Twice Shown', 9.3, 50000],
  ])
  const events = baseEvents().concat(watched('Fifth', { episodes: 2 }), watched('Seen It'), [feedback('thumb_down', 'Not For Me')])
  const result = run({ programmes, events, filmFacts })
  const items = sectionOf(result, 'top-rated').items
  assert.equal(items.length, 10)
  assert.equal(items[0].title, 'Twice Shown')
  assert.equal(items[0].start, NOW + (2 * 24 + 8) * HOUR)
  assert.ok(!items.some((item) => item.title === 'Seen It' || item.title === 'Not For Me'))
})

test('films in other languages: a few allows two per row, none allows none, all allows every one', () => {
  const programmes = ['Amelie', 'Parasite', 'Roma', 'Local Hero'].map((title, index) => film(title, { day: index + 1 }))
  const filmFacts = factsOf([['Amelie', 7.9, 12000, 'fr'], ['Parasite', 8.5, 18000, 'ko'], ['Roma', 7.7, 4000, 'es'], ['Local Hero', 7.0, 900, 'en']])
  const events = baseEvents().concat(watched('Fifth', { episodes: 2 }))
  const titlesFor = (otherLanguageFilms) => sectionOf(run({ programmes, events, filmFacts, otherLanguageFilms }), 'top-rated').items.map((item) => item.title)
  assert.deepEqual(titlesFor('few'), ['Parasite', 'Amelie', 'Local Hero'])
  assert.deepEqual(titlesFor('none'), ['Local Hero'])
  assert.equal(titlesFor('all').length, 4)
  const few = run({ programmes, events, filmFacts })
  assert.equal(few.otherLanguageFilms, 'few')
  assert.equal(sectionOf(few, 'top-rated').items[0].otherLanguage, true)
})

test('films in other languages are capped in Movies this week too', () => {
  const evening = Math.floor(NOW / DAY) * DAY + 19 * HOUR
  const programmes = ['Amelie', 'Parasite', 'Roma', 'Local Hero'].map((title, index) => airing(title, {
    start: evening + index * DAY, end: evening + index * DAY + 2 * HOUR, genre: 0x10, kind: 'movie',
  }))
  const filmFacts = factsOf([['Amelie', null, null, 'fr'], ['Parasite', null, null, 'ko'], ['Roma', null, null, 'es'], ['Local Hero', null, null, 'en']])
  const events = baseEvents().concat(watched('Fifth', { episodes: 2 }))
  const moviesFor = (otherLanguageFilms) => sectionOf(run({ programmes, events, filmFacts, otherLanguageFilms }), 'movies').items.map((item) => item.title)
  assert.equal(moviesFor('all').length, 4)
  assert.equal(moviesFor('few').length, 3)
  assert.deepEqual(moviesFor('none'), ['Local Hero'])
})

test('cold start shows top rated movies before the other movies', () => {
  const programmes = [film('Old Classic'), film('Another Film', { day: 2 })]
  const result = run({ programmes, events: watched('Only Show', { episodes: 2 }), filmFacts: factsOf([['Old Classic', 8.1, 6000]]) })
  assert.equal(result.coldStart, true)
  assert.equal(sectionOf(result, 'top-rated').items[0].title, 'Old Classic')
  assert.ok(!(sectionOf(result, 'movies')?.items ?? []).some((item) => item.title === 'Old Classic'))
})

const twinLineup = [
  { id: 'ten-hd', name: '10 HD', hd: true },
  { id: 'ten-sd', name: '10', hd: false },
  { id: 'ten-plus', name: '10 HD +1', hd: true },
  { id: 'food', name: 'SBS Food', hd: false },
]

const twinEvents = () => [
  ...baseEvents(),
  ...watched('Big Brother Australia', { episodes: 8 }),
  ...watched('Survivor Australia', { episodes: 8 }),
  ...watched('My Market Kitchen', { episodes: 8 }),
]

const suggestedChannelsOf = (result, title) => result.sections
  .flatMap((section) => section.items)
  .filter((item) => item.title === title)
  .map((item) => item.channelId)

test('For you suggests one airing per twin group, on the visible HD channel', () => {
  const programmes = ['ten-sd', 'ten-hd'].map((channel_id) => airing('Survivor Australia', { channel_id }))
  const result = run({ programmes, events: twinEvents(), channels: twinLineup })
  assert.deepEqual(suggestedChannelsOf(result, 'Survivor Australia'), ['ten-hd'])
})

test('For you skips a programme whose twin TVHeadend already records', () => {
  const programmes = [
    airing('Big Brother Australia', { channel_id: 'ten-hd', dvr_state: 'scheduled' }),
    airing('Big Brother Australia', { channel_id: 'ten-sd' }),
    airing('Big Brother Australia', { channel_id: 'ten-plus', start: NOW + 11 * HOUR }),
  ]
  const result = run({ programmes, events: twinEvents(), channels: twinLineup })
  assert.deepEqual(suggestedChannelsOf(result, 'Big Brother Australia'), [])
})

test('For you skips a programme that a TVHeadend rule on its twin matches', () => {
  const programmes = ['ten-sd', 'ten-hd'].map((channel_id) => airing('Big Brother Australia', { channel_id }))
  const autorecs = [{ seriesLinkId: 'ten-hd|big brother', channelId: 'ten-hd', enabled: true, match: autorecMatchFieldsOf({ title: 'Big Brother', weekdays: [1, 2, 3, 4, 5, 6, 7] }) }]
  const result = run({ programmes, events: twinEvents(), channels: twinLineup, autorecs })
  assert.deepEqual(suggestedChannelsOf(result, 'Big Brother Australia'), [])
})

test('For you leaves out hidden channels under both hide SD settings', () => {
  const programmes = [airing('My Market Kitchen', { channel_id: 'food' }), airing('Survivor Australia', { channel_id: 'ten-sd' })]
  const simulcasts = run({ programmes, events: twinEvents(), channels: twinLineup, channelPrefs: { hideSdSimulcasts: true } })
  assert.deepEqual(suggestedChannelsOf(simulcasts, 'My Market Kitchen'), ['food'])
  assert.deepEqual(suggestedChannelsOf(simulcasts, 'Survivor Australia'), [])
  const everySd = run({ programmes, events: twinEvents(), channels: twinLineup, channelPrefs: { hideSdChannels: true } })
  assert.deepEqual(suggestedChannelsOf(everySd, 'My Market Kitchen'), [])
})

test('For you offers the +1 airing only after the original has finished', () => {
  const original = airing('Survivor Australia', { channel_id: 'ten-hd', start: NOW - 30 * 60 * 1000 })
  const later = airing('Survivor Australia', { channel_id: 'ten-plus', start: original.start + HOUR })
  const before = run({ programmes: [original, later], events: twinEvents(), channels: twinLineup })
  assert.deepEqual(suggestedChannelsOf(before, 'Survivor Australia'), ['ten-hd'])
  const after = run({ programmes: [original, later], events: twinEvents(), channels: twinLineup, nowMs: original.end + 60 * 1000 })
  assert.deepEqual(suggestedChannelsOf(after, 'Survivor Australia'), ['ten-plus'])
})
