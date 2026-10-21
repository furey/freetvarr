import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HERO_SLIDE_LIMIT, MOVIES_URL, heroSlidesOf, heroRecordingIdsOf, heroProgramIdsOf, liveGenreOf, durationText,
  recordedWhenOf, airingWhenOf, watchedShowKeysOf, activeRecordingOf, recordingWhenEyebrowOf, nextUpcomingOf, heroCandidatesOf, reusedArtSlidesOf,
} from '../src/web/home-hero.js'

const timeZone = 'UTC'
const nowMs = Date.parse('2026-10-19T19:14:00Z')
const MIN = 60_000

const episode = (over) => ({
  recordingId: 'r1', showKey: 'the-block', title: 'The Block', kind: 'show', season: 22, episode: 45,
  episodeTitle: 'Reveal', channelName: '9HD', durationS: 3600, positionS: 1920, airedAt: nowMs - 86_400_000,
  image: null, ...over,
})

const show = (over) => ({ key: 'the-block', title: 'The Block', counts: { total: 3, unwatched: 2 }, rule: null, ...over })

const recording = (over) => ({
  uuid: 'dvr1', dvrUuid: 'dvr1', programId: 46, title: 'The Block', season: null, episode: null,
  episodeTitle: 'Episode 46', channelId: 'c9', channelName: '9HD', start: nowMs - 30 * MIN, stop: nowMs + 34 * MIN,
  canPlayFromStart: true, failed: false, ...over,
})

const entry = (over = {}) => ({
  channel: { id: 'c7', name: '7mate', number: 73, pinned: true, offAir: false, hasLogo: true, ...over.channel },
  now: { program_id: 900, title: 'Big Wave Season', start: nowMs - 20 * MIN, end: nowMs + 52 * MIN, genre: 64, has_image: true, ...over.now },
})

const upcomingItem = (over) => ({
  programId: 77, name: 'Gogglebox', channelId: 'c10', channelName: '10', startDate: nowMs + 76 * MIN,
  endDate: nowMs + 136 * MIN, season: 1, episodeNo: 4, source: 'autorec', ...over,
})

const watchItem = (over) => ({
  id: 5, title: 'Ships Ahoy', mode: 'notify', fulfilledAt: null,
  nextMatch: { program_id: 501, title: 'Ships Ahoy', start: nowMs + 2 * 86_400_000, end: nowMs + 2 * 86_400_000 + 30 * MIN, channelId: 'c3', channelName: 'SBS', series_link: 'sbs|ships', has_image: false },
  ...over,
})

const movie = (over) => episode({ recordingId: 'm1', showKey: 'the-long-paddock', title: 'The Long Paddock', kind: 'movie', season: null, episode: null, episodeTitle: null, durationS: 6060, positionS: null, ...over })

const fullFeed = () => ({
  inProgress: [episode()],
  newEpisodes: [episode({ recordingId: 'r2', episode: 46 }), episode({ recordingId: 'r3', showKey: 'mkr', title: 'MKR' })],
  shows: [show({ rule: { recording: true } })],
  recordingNow: [recording({ channelId: 'c9' })],
  nowEntries: [entry()],
  upcoming: [upcomingItem({ name: 'The Block', programId: 78 })],
  activeProgramIds: [46],
  watchlist: [watchItem()],
  movies: [movie()],
  nowMs,
  timeZone,
  remix: false,
})

test('heroSlidesOf: ranks slides, caps them at five, and skips repeated art without a pool', () => {
  const slides = heroSlidesOf(fullFeed())
  assert.deepEqual(slides.map((s) => s.type), ['continue', 'on-now', 'watchlist', 'movie'])
  const many = heroSlidesOf({ ...fullFeed(), pools: { recordings: { r1: [{ url: '/r1', kind: 'episode' }], r2: [{ url: '/r2', kind: 'episode' }] } } })
  assert.equal(many.length, HERO_SLIDE_LIMIT)
})

test('heroSlidesOf: keeps rank order when every slide has its own artwork', () => {
  const slides = heroSlidesOf({
    ...fullFeed(),
    newEpisodes: [episode({ recordingId: 'n1', showKey: 'mkr', title: 'MKR' })],
    shows: [show({ key: 'mkr' })],
    recordingNow: [recording({ title: 'Gogglebox', channelId: 'c10' })],
    upcoming: [upcomingItem({ name: 'Hard Quiz', programId: 79 })],
  })
  assert.deepEqual(slides.map((s) => s.type), ['continue', 'new', 'recording', 'on-now', 'upcoming'])
})

test('heroSlidesOf: drops slides with nothing to show', () => {
  const slides = heroSlidesOf({ ...fullFeed(), inProgress: [], recordingNow: [], nowEntries: [], upcoming: [] })
  assert.deepEqual(slides.map((s) => s.type), ['new', 'watchlist', 'movie'])
  assert.deepEqual(heroSlidesOf({ nowMs, timeZone }), [])
})

test('continue watching slide: resume with watched progress', () => {
  const [slide] = heroSlidesOf({ inProgress: [episode()], nowMs, timeZone })
  assert.equal(slide.eyebrow, 'Continue watching')
  assert.equal(slide.meta, 'S22 E45 · Reveal · 9HD · 28 min left')
  assert.equal(slide.metaShort, 'S22 E45 · 28 min left')
  assert.deepEqual(slide.progress, { percent: 53, live: false, label: 'Watched' })
  assert.equal(slide.primary.label, 'Resume')
  assert.equal(slide.secondary.href, '#/recordings/show/the-block')
  assert.equal(slide.art.image, '/api/epg/show-image?title=The%20Block&w=768')
})

test('new episode slide: only for a series you have watched', () => {
  const newEpisodes = [episode({ recordingId: 'n1', showKey: 'mkr', title: 'MKR', season: 16, episode: 8, positionS: null })]
  const unseen = heroSlidesOf({ newEpisodes, shows: [show({ key: 'mkr', counts: { total: 4, unwatched: 4 } })], nowMs, timeZone })
  assert.deepEqual(unseen, [])
  const [slide] = heroSlidesOf({ newEpisodes, shows: [show({ key: 'mkr', counts: { total: 4, unwatched: 3 } })], nowMs, timeZone })
  assert.equal(slide.eyebrow, 'New episode')
  assert.equal(slide.meta, 'S16 E8 · Recorded last night · 9HD · 1 h')
  assert.equal(slide.primary.label, 'Play')
})

test('recording now slide: start over when it can, red progress, watch live second', () => {
  const [slide] = heroSlidesOf({ recordingNow: [recording()], nowEntries: [entry({ channel: { id: 'c9', name: '9HD' } })], nowMs, timeZone })
  assert.equal(slide.badge, 'REC')
  assert.equal(slide.meta, 'Episode 46 · 9HD · until 7:48pm · 34 min left')
  assert.equal(slide.progress.live, true)
  assert.equal(slide.primary.action, 'from-start')
  assert.equal(slide.secondary.action, 'watch-live')
  assert.equal(slide.target.channel.name, '9HD')
  const [plain] = heroSlidesOf({ recordingNow: [recording({ canPlayFromStart: false })], nowMs, timeZone })
  assert.equal(plain.primary.action, 'watch-live')
  assert.equal(plain.secondary, null)
})

test('on now slide: live sport or news on a favourite channel only', () => {
  const [slide] = heroSlidesOf({ nowEntries: [entry()], nowMs, timeZone })
  assert.equal(slide.eyebrow, 'Live sport on 7mate')
  assert.equal(slide.meta, 'Sport · 7mate · until 8:06pm · 52 min left')
  assert.equal(slide.badge, 'LIVE')
  assert.equal(slide.secondary.action, 'record')
  assert.equal(slide.art.image, '/api/epg/image/900')
  const news = heroSlidesOf({ nowEntries: [entry({ now: { genre: 0x23 } })], nowMs, timeZone })[0]
  assert.equal(news.eyebrow, 'Live news on 7mate')
  assert.deepEqual(heroSlidesOf({ nowEntries: [entry({ now: { genre: 0x14 } })], nowMs, timeZone }), [])
  assert.deepEqual(heroSlidesOf({ nowEntries: [entry({ channel: { pinned: false } })], nowMs, timeZone }), [])
})

test('on now slide: skips the channel the recording slide already shows', () => {
  const slides = heroSlidesOf({ recordingNow: [recording({ channelId: 'c7' })], nowEntries: [entry()], nowMs, timeZone })
  assert.deepEqual(slides.map((s) => s.type), ['recording'])
})

test('tonight slide: recording options for a series rule, details for a one-off', () => {
  const [ruled] = heroSlidesOf({ upcoming: [upcomingItem()], shows: [show({ key: 'gogglebox', rule: {} })], nowMs, timeZone })
  assert.equal(ruled.eyebrow, 'Recording tonight')
  assert.equal(ruled.meta, '8:30pm · 10 · S1 E4 · Records every new episode')
  assert.equal(ruled.primary.action, 'options')
  assert.equal(ruled.target.showKey, 'gogglebox')
  const [single] = heroSlidesOf({ upcoming: [upcomingItem()], nowMs, timeZone })
  assert.equal(single.primary.action, 'upcoming')
  assert.match(single.meta, /Records this episode$/)
})

test('watchlist slide: notify items with a guide match', () => {
  const [slide] = heroSlidesOf({ watchlist: [watchItem()], nowMs, timeZone })
  assert.equal(slide.eyebrow, 'Now in the guide')
  assert.equal(slide.meta, 'Wed 7:14pm · SBS · On your watchlist')
  assert.equal(slide.primary.action, 'record-series')
  assert.deepEqual(heroSlidesOf({ watchlist: [watchItem({ mode: 'record' })], nowMs, timeZone }), [])
  assert.deepEqual(heroSlidesOf({ watchlist: [watchItem({ nextMatch: null })], nowMs, timeZone }), [])
})

test('movie slide: unwatched movie with length and when recorded', () => {
  const [slide] = heroSlidesOf({ movies: [movie()], nowMs, timeZone })
  assert.equal(slide.eyebrow, 'Unwatched movie')
  assert.equal(slide.meta, 'Movie · 1 h 41 min · Recorded last night · 9HD')
  assert.equal(slide.secondary.label, 'Details')
  assert.equal(MOVIES_URL, '/api/library/episodes?state=unwatched&kind=movie&limit=2')
})

test('heroSlidesOf: one recording never appears twice', () => {
  const slides = heroSlidesOf({ inProgress: [movie()], movies: [movie()], nowMs, timeZone })
  assert.deepEqual(slides.map((s) => s.type), ['continue'])
})

test('heroRecordingIdsOf and heroProgramIdsOf: what the rows hide', () => {
  const slides = heroSlidesOf(fullFeed())
  assert.deepEqual([...heroRecordingIdsOf(slides)], ['r1', 'm1'])
  assert.deepEqual([...heroProgramIdsOf(slides)], [])
  const varied = heroSlidesOf({ ...fullFeed(), upcoming: [upcomingItem({ programId: 78 })], inProgress: [] })
  assert.deepEqual([...heroProgramIdsOf(varied)], ['78'])
})

test('liveGenreOf, durationText, watchedShowKeysOf, activeRecordingOf', () => {
  assert.equal(liveGenreOf(64), 'sport')
  assert.equal(liveGenreOf(0x2f), 'news')
  assert.equal(liveGenreOf(20), null)
  assert.equal(liveGenreOf(null), null)
  assert.equal(durationText(45 * 60), '45 min')
  assert.equal(durationText(120 * 60), '2 h')
  assert.equal(durationText(70 * 60), '1 h 10 min')
  assert.deepEqual([...watchedShowKeysOf({ shows: [show(), show({ key: 'x', counts: { total: 1, unwatched: 1 } })], inProgress: [episode({ showKey: 'y' })] })], ['the-block', 'y'])
  assert.equal(activeRecordingOf({ active: [recording({ failed: true })], nowMs }), null)
  assert.equal(activeRecordingOf({ active: [recording({ start: nowMs + MIN })], nowMs }), null)
})

test('recordedWhenOf and airingWhenOf: plain day words', () => {
  const at = (iso) => Date.parse(iso)
  assert.equal(recordedWhenOf({ ms: at('2026-10-19T08:00:00Z'), nowMs, timeZone }), 'Recorded today')
  assert.equal(recordedWhenOf({ ms: at('2026-10-18T09:00:00Z'), nowMs, timeZone }), 'Recorded yesterday')
  assert.equal(recordedWhenOf({ ms: at('2026-10-17T20:00:00Z'), nowMs, timeZone }), 'Recorded Sat')
  assert.equal(recordedWhenOf({ ms: at('2026-10-01T20:00:00Z'), nowMs, timeZone }), 'Recorded 1 Oct')
  assert.equal(recordedWhenOf({ ms: null, nowMs, timeZone }), '')
  assert.equal(airingWhenOf({ ms: nowMs + 60 * MIN, nowMs, timeZone }), 'Today 8:14pm')
  assert.equal(airingWhenOf({ ms: nowMs + 86_400_000, nowMs, timeZone }), 'Tomorrow 7:14pm')
})

test('recordingWhenEyebrowOf: tonight from 5 pm, today before, then tomorrow and weekdays', () => {
  const at = (iso) => recordingWhenEyebrowOf({ startMs: Date.parse(iso), nowMs: Date.parse('2026-10-19T09:00:00Z'), timeZone })
  assert.equal(at('2026-10-19T17:00:00Z'), 'Recording tonight')
  assert.equal(at('2026-10-19T16:59:00Z'), 'Recording today')
  assert.equal(at('2026-10-19T12:00:00Z'), 'Recording today')
  assert.equal(at('2026-10-20T20:30:00Z'), 'Recording tomorrow')
  assert.equal(at('2026-10-22T20:30:00Z'), 'Recording Thursday')
})

test('nextUpcomingOf: the soonest future recording that is not already recording', () => {
  const upcoming = [
    upcomingItem({ programId: 1, startDate: nowMs - MIN }),
    upcomingItem({ programId: 2, startDate: nowMs + 3 * 86_400_000 }),
    upcomingItem({ programId: 3, startDate: nowMs + 2 * MIN }),
    upcomingItem({ programId: 4, startDate: nowMs + MIN }),
  ]
  assert.equal(nextUpcomingOf({ upcoming, activeProgramIds: [4], nowMs }).programId, 3)
  assert.equal(nextUpcomingOf({ upcoming: [], nowMs }), null)
  const [slide] = heroSlidesOf({ upcoming: [upcomingItem({ startDate: nowMs + 86_400_000 })], nowMs, timeZone })
  assert.equal(slide.eyebrow, 'Recording tomorrow')
})

const keys = (slides) => slides.map((s) => s.key)
const showArt = (title) => `/api/epg/show-image?title=${encodeURIComponent(title)}&w=768`

test('heroCandidatesOf: every ranked slide, uncapped, with a show key on recording slides', () => {
  const candidates = heroCandidatesOf(fullFeed())
  assert.deepEqual(candidates.map((s) => s.type), ['continue', 'new', 'recording', 'on-now', 'upcoming', 'watchlist', 'movie'])
  assert.equal(candidates[0].showKey, 'the-block')
})

test('heroSlidesOf: same show stays when its pool gives each slide different art', () => {
  const pools = {
    shows: { 'the-block': [{ url: '/bg1', kind: 'background' }, { url: '/bg2', kind: 'background' }] },
    recordings: { r1: [{ url: '/r1', kind: 'episode' }], r2: [{ url: '/r2', kind: 'episode' }] },
  }
  const slides = heroSlidesOf({ ...fullFeed(), pools })
  assert.deepEqual(slides.map((s) => s.type), ['continue', 'new', 'recording', 'on-now', 'upcoming'])
  assert.deepEqual(slides.map((s) => s.art.image), ['/r1', '/r2', showArt('The Block'), '/api/epg/image/900', '/bg1'])
})

test('heroSlidesOf: drops a same-show slide only when its pool is used up, then refills', () => {
  const pools = { recordings: { r1: [{ url: '/r1', kind: 'episode' }], r2: [{ url: '/r2', kind: 'episode' }] } }
  const slides = heroSlidesOf({ ...fullFeed(), pools })
  assert.deepEqual(slides.map((s) => s.type), ['continue', 'new', 'recording', 'on-now', 'watchlist'])
  assert.equal(new Set(slides.map((s) => s.art.image)).size, slides.length)
})

test('reusedArtSlidesOf: later slides whose art already appeared', () => {
  const slide = (key, image) => ({ key, art: { image, title: key } })
  const slides = [slide('a', '/x?w=768'), slide('b', '/y'), slide('c', '/X?w=384')]
  assert.deepEqual(keys(reusedArtSlidesOf({ slides })), ['c'])
  const pools = { shows: { s: [{ url: '/y', contentKey: 'k' }, { url: '/z', contentKey: 'k' }] } }
  assert.deepEqual(keys(reusedArtSlidesOf({ slides: [slide('a', '/y'), slide('b', '/z')], pools })), ['b'])
})

test('heroSlidesOf: the last slide never shares art with the first', () => {
  const slides = heroSlidesOf({ inProgress: [episode()], upcoming: [upcomingItem({ name: 'The Block' })], nowMs, timeZone, remix: false })
  assert.deepEqual(slides.map((s) => s.type), ['continue'])
  assert.equal(showArt('The Block'), slides[0].art.image)
})

test('heroSlidesOf: up to two of a kind, one per show, to mix through the day', () => {
  const feed = {
    inProgress: [episode(), episode({ recordingId: 'r4', showKey: 'mkr', title: 'MKR' }), episode({ recordingId: 'r5', showKey: 'qi', title: 'QI' })],
    upcoming: [upcomingItem(), upcomingItem({ programId: 78, startDate: nowMs + 90 * MIN }), upcomingItem({ programId: 79, name: 'Hard Quiz' })],
    movies: [movie(), movie({ recordingId: 'm2', showKey: 'jaws', title: 'Jaws' })],
    nowMs,
    timeZone,
  }
  const candidates = heroCandidatesOf(feed)
  assert.deepEqual(keys(candidates), ['continue:r1', 'continue:r4', 'upcoming:77', 'upcoming:79', 'movie:m1', 'movie:m2'])
})

test('heroSlidesOf: remixes by the hour with recording now first', () => {
  const feed = {
    ...fullFeed(),
    remix: true,
    newEpisodes: [episode({ recordingId: 'n1', showKey: 'mkr', title: 'MKR' })],
    shows: [show({ key: 'mkr' })],
    recordingNow: [recording({ title: 'Gogglebox', channelId: 'c10', stop: nowMs + 30 * 60 * MIN })],
    nowEntries: [entry({ now: { end: nowMs + 30 * 60 * MIN } })],
    upcoming: [upcomingItem({ name: 'Hard Quiz', programId: 79, startDate: nowMs + 30 * 60 * MIN })],
  }
  const hourly = Array.from({ length: 24 }, (_, h) => heroSlidesOf({ ...feed, nowMs: nowMs + h * 3_600_000 }))
  assert.ok(hourly.every((slides) => slides[0].type === 'recording' && slides[1].type === 'on-now'))
  assert.ok(new Set(hourly.map((slides) => keys(slides).join())).size > 1)
  assert.deepEqual(keys(heroSlidesOf(feed)), keys(heroSlidesOf({ ...feed, nowMs: nowMs + 30 * MIN })))
})
