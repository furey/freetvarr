import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HERO_SLIDE_LIMIT, MOVIES_URL, heroSrcsetOf, heroSlidesOf, heroRecordingIdsOf, heroProgramIdsOf, liveGenreOf, durationText,
  recordedWhenOf, airingWhenOf, watchedShowKeysOf, activeRecordingOf, recordingWhenEyebrowOf, nextUpcomingOf, heroCandidatesOf, reusedArtSlidesOf,
  slideOf, currentCandidateTestOf, slideArtIdentityOf,
} from '../src/web/home-hero.js'
import { artIdentityFrom, candidatesOf } from '../src/web/hero-art.js'

const timeZone = 'UTC'

const provenCandidateOf = ({ slide, pools }) => {
  const identityOf = artIdentityFrom(pools)
  const urls = candidatesOf({ slide, pools })
  return {
    key: slide.key,
    type: slide.type,
    source: slide.source,
    endsAt: slide.endsAt ?? null,
    art: { title: slide.art.title, image: urls[0], images: urls.map((url) => ({ url, identity: identityOf(url) })) },
  }
}

const slidesFrom = ({ pools = {}, remix = true, limit, isCurrent, ...feed }) => heroSlidesOf({
  candidates: heroCandidatesOf(feed).map((slide) => provenCandidateOf({ slide, pools })),
  remix,
  limit,
  isCurrent,
  nowMs: feed.nowMs,
  timeZone: feed.timeZone,
})
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

test('heroSlidesOf: ranks slides, one per show, and caps them at five', () => {
  const slides = slidesFrom(fullFeed())
  assert.deepEqual(slides.map((s) => s.type), ['continue', 'on-now', 'watchlist', 'movie'])
  const many = slidesFrom({
    ...fullFeed(),
    recordingNow: [recording({ title: 'Gogglebox', channelId: 'c10' })],
    upcoming: [upcomingItem({ name: 'Hard Quiz', programId: 79 })],
  })
  assert.equal(many.length, HERO_SLIDE_LIMIT)
})

test('heroSlidesOf: one slide per show across kinds, continue watching first (real :3744 snapshot shape)', () => {
  const chefs = (over) => episode({ showKey: 'chefs-ahoy', title: 'Chefs Ahoy', ...over })
  const block = (over) => episode({ recordingId: 'a07', showKey: 'the-block', title: 'The Block', ...over })
  const feed = {
    inProgress: [chefs({ recordingId: '4e2c', positionS: 66 })],
    newEpisodes: [block(), chefs({ recordingId: 'bcbc', episode: 3 })],
    shows: [show({ rule: { recording: true } }), show({ key: 'chefs-ahoy', title: 'Chefs Ahoy' })],
    upcoming: [upcomingItem({ name: 'The Block', programId: 377981, startDate: nowMs + 2 * 86_400_000 }), upcomingItem({ name: 'Big Brother', programId: 387216, startDate: nowMs + 3 * 86_400_000 })],
    nowMs,
    timeZone,
  }
  const pools = { recordings: { '4e2c': [{ url: '/chefs-1', kind: 'episode' }], bcbc: [{ url: '/chefs-2', kind: 'episode' }], a07: [{ url: '/block', kind: 'episode' }] } }
  const hourly = Array.from({ length: 24 }, (_, h) => slidesFrom({ ...feed, pools, nowMs: nowMs + h * 3_600_000 }))
  for (const slides of hourly) {
    assert.deepEqual(slides.map((s) => s.key).sort(), ['continue:4e2c', 'new:a07', 'upcoming:387216'])
  }
})

test('heroSlidesOf: keeps rank order when every slide has its own artwork', () => {
  const slides = slidesFrom({
    ...fullFeed(),
    newEpisodes: [episode({ recordingId: 'n1', showKey: 'mkr', title: 'MKR' })],
    shows: [show({ key: 'mkr' })],
    recordingNow: [recording({ title: 'Gogglebox', channelId: 'c10' })],
    upcoming: [upcomingItem({ name: 'Hard Quiz', programId: 79 })],
  })
  assert.deepEqual(slides.map((s) => s.type), ['continue', 'new', 'recording', 'on-now', 'upcoming'])
})

test('heroSlidesOf: drops slides with nothing to show', () => {
  const slides = slidesFrom({ ...fullFeed(), inProgress: [], recordingNow: [], nowEntries: [], upcoming: [] })
  assert.deepEqual(slides.map((s) => s.type), ['new', 'watchlist', 'movie'])
  assert.deepEqual(slidesFrom({ nowMs, timeZone }), [])
})

test('continue watching slide: resume with watched progress', () => {
  const [slide] = slidesFrom({ inProgress: [episode()], nowMs, timeZone })
  assert.equal(slide.eyebrow, 'Continue watching')
  assert.equal(slide.meta, 'S22 E45 · Reveal · 9HD · 28 min left')
  assert.equal(slide.metaShort, 'S22 E45 · 28 min left')
  assert.deepEqual(slide.progress, { percent: 53, live: false, label: 'Watched' })
  assert.equal(slide.primary.label, 'Resume')
  assert.equal(slide.secondary.href, '#/recordings/show/the-block')
  assert.equal(slide.art.image, '/api/epg/show-image?title=The%20Block&w=768&c=series-v2')
})

test('new episode slide: only for a series you have watched', () => {
  const newEpisodes = [episode({ recordingId: 'n1', showKey: 'mkr', title: 'MKR', season: 16, episode: 8, positionS: null })]
  const unseen = slidesFrom({ newEpisodes, shows: [show({ key: 'mkr', counts: { total: 4, unwatched: 4 } })], nowMs, timeZone })
  assert.deepEqual(unseen, [])
  const [slide] = slidesFrom({ newEpisodes, shows: [show({ key: 'mkr', counts: { total: 4, unwatched: 3 } })], nowMs, timeZone })
  assert.equal(slide.eyebrow, 'New episode')
  assert.equal(slide.meta, 'S16 E8 · Recorded last night · 9HD · 1 h')
  assert.equal(slide.primary.label, 'Play')
})

test('recording now slide: start over when it can, red progress, watch live second', () => {
  const [slide] = slidesFrom({ recordingNow: [recording()], nowEntries: [entry({ channel: { id: 'c9', name: '9HD' } })], nowMs, timeZone })
  assert.equal(slide.badge, 'REC')
  assert.equal(slide.meta, 'Episode 46 · 9HD · until 7:48pm · 34 min left')
  assert.equal(slide.progress.live, true)
  assert.equal(slide.primary.action, 'from-start')
  assert.equal(slide.secondary.action, 'watch-live')
  assert.equal(slide.target.channel.name, '9HD')
  const [plain] = slidesFrom({ recordingNow: [recording({ canPlayFromStart: false })], nowMs, timeZone })
  assert.equal(plain.primary.action, 'watch-live')
  assert.equal(plain.secondary, null)
})

test('on now slide: live sport or news on a favourite channel only', () => {
  const [slide] = slidesFrom({ nowEntries: [entry()], nowMs, timeZone })
  assert.equal(slide.eyebrow, 'Live sport on 7mate')
  assert.equal(slide.meta, 'Sport · 7mate · until 8:06pm · 52 min left')
  assert.equal(slide.badge, 'LIVE')
  assert.equal(slide.secondary.action, 'record')
  assert.equal(slide.art.image, '/api/epg/image/900')
  const news = slidesFrom({ nowEntries: [entry({ now: { genre: 0x23 } })], nowMs, timeZone })[0]
  assert.equal(news.eyebrow, 'Live news on 7mate')
  assert.deepEqual(slidesFrom({ nowEntries: [entry({ now: { genre: 0x14 } })], nowMs, timeZone }), [])
  assert.deepEqual(slidesFrom({ nowEntries: [entry({ channel: { pinned: false } })], nowMs, timeZone }), [])
})

test('on now slide: skips the channel the recording slide already shows', () => {
  const slides = slidesFrom({ recordingNow: [recording({ channelId: 'c7' })], nowEntries: [entry()], nowMs, timeZone })
  assert.deepEqual(slides.map((s) => s.type), ['recording'])
})

test('tonight slide: recording options for a series rule, details for a one-off', () => {
  const [ruled] = slidesFrom({ upcoming: [upcomingItem()], shows: [show({ key: 'gogglebox', rule: {} })], nowMs, timeZone })
  assert.equal(ruled.eyebrow, 'Recording tonight')
  assert.equal(ruled.meta, '8:30pm · 10 · S1 E4 · Records every new episode')
  assert.equal(ruled.primary.action, 'options')
  assert.equal(ruled.target.showKey, 'gogglebox')
  const [single] = slidesFrom({ upcoming: [upcomingItem()], nowMs, timeZone })
  assert.equal(single.primary.action, 'upcoming')
  assert.match(single.meta, /Records this episode$/)
})

test('watchlist slide: notify items with a guide match', () => {
  const [slide] = slidesFrom({ watchlist: [watchItem()], nowMs, timeZone })
  assert.equal(slide.eyebrow, 'Now in the guide')
  assert.equal(slide.meta, 'Wed 7:14pm · SBS · On your watchlist')
  assert.equal(slide.primary.action, 'record-series')
  assert.deepEqual(slidesFrom({ watchlist: [watchItem({ mode: 'record' })], nowMs, timeZone }), [])
  assert.deepEqual(slidesFrom({ watchlist: [watchItem({ nextMatch: null })], nowMs, timeZone }), [])
})

test('movie slide: unwatched movie with length and when recorded', () => {
  const [slide] = slidesFrom({ movies: [movie()], nowMs, timeZone })
  assert.equal(slide.eyebrow, 'Unwatched movie')
  assert.equal(slide.meta, 'Movie · 1 h 41 min · Recorded last night · 9HD')
  assert.equal(slide.secondary.label, 'Details')
  assert.equal(MOVIES_URL, '/api/library/episodes?state=unwatched&kind=movie&limit=2')
})

test('heroSlidesOf: one recording never appears twice', () => {
  const slides = slidesFrom({ inProgress: [movie()], movies: [movie()], nowMs, timeZone })
  assert.deepEqual(slides.map((s) => s.type), ['continue'])
})

test('heroRecordingIdsOf and heroProgramIdsOf: what the rows hide', () => {
  const slides = slidesFrom(fullFeed())
  assert.deepEqual([...heroRecordingIdsOf(slides)], ['r1', 'm1'])
  assert.deepEqual([...heroProgramIdsOf(slides)], [])
  const varied = slidesFrom({ ...fullFeed(), upcoming: [upcomingItem({ programId: 78 })], inProgress: [] })
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
  const [slide] = slidesFrom({ upcoming: [upcomingItem({ startDate: nowMs + 86_400_000 })], nowMs, timeZone })
  assert.equal(slide.eyebrow, 'Recording tomorrow')
})

const keys = (slides) => slides.map((s) => s.key)
const showArt = (title) => `/api/epg/show-image?title=${encodeURIComponent(title)}&w=768&c=series-v2`

test('heroCandidatesOf: every ranked slide, uncapped, with a show key on recording slides', () => {
  const candidates = heroCandidatesOf(fullFeed())
  assert.deepEqual(candidates.map((s) => s.type), ['continue', 'new', 'recording', 'on-now', 'upcoming', 'watchlist', 'movie'])
  assert.equal(candidates[0].showKey, 'the-block')
})

test('heroCandidatesOf: the top rated slide follows the For you slide', () => {
  const forYou = { key: 'for-you:1', type: 'for-you', title: 'Grand Designs', art: { image: '/a.jpg', title: 'Grand Designs' } }
  const topRated = { key: 'top-rated:2', type: 'top-rated', title: 'The Pianist', art: { image: '/b.jpg', title: 'The Pianist' } }
  const types = heroCandidatesOf({ ...fullFeed(), forYou, topRated }).map((s) => s.type)
  assert.equal(types.indexOf('top-rated'), types.indexOf('for-you') + 1)
})

test('heroSlidesOf: when a show\'s first slide is no longer current, its next slide takes the place', () => {
  const isCurrent = (candidate) => candidate.type !== 'continue'
  const slides = slidesFrom({ ...fullFeed(), isCurrent, remix: false })
  assert.deepEqual(slides.map((s) => s.key), ['new:r2', 'on-now:c7:900', 'watchlist:5', 'movie:m1'])
})

test('reusedArtSlidesOf: later slides whose art already appeared', () => {
  const slide = (key, image) => ({ key, art: { image, title: key } })
  const slides = [slide('a', '/x?w=768'), slide('b', '/y'), slide('c', '/X?w=384')]
  assert.deepEqual(keys(reusedArtSlidesOf({ slides })), ['c'])
  const sameContent = (key, image) => ({ key, art: { image, title: key, images: [{ url: image, identity: 'content:k' }] } })
  assert.deepEqual(keys(reusedArtSlidesOf({ slides: [sameContent('a', '/y'), sameContent('b', '/z')] })), ['b'])
})

test('slideArtIdentityOf: proven images carry their identity, other urls fall back to the url key', () => {
  const identityOf = slideArtIdentityOf([{ art: { images: [{ url: '/a?w=768', identity: 'content:1' }] } }])
  assert.equal(identityOf('/a?w=1920'), 'content:1')
  assert.equal(identityOf('/b?w=768'), '/b')
})

const candidateOf = (slide, images = [{ url: slide.art.image }]) => ({
  key: slide.key, type: slide.type, source: slide.source, endsAt: slide.endsAt ?? null,
  art: { title: slide.art.title, image: images[0].url, images },
})

test('slideOf: rebuilds the time text with the viewer clock and keeps the proven art', () => {
  const [ranked] = heroCandidatesOf({ upcoming: [upcomingItem()], nowMs: Date.parse('2026-10-19T09:00:00Z'), timeZone })
  const candidate = candidateOf(ranked, [{ url: '/proven?w=768', srcset: '/proven?w=768 768w', focus: { x: 0.4, y: 0.3 } }])
  const later = slideOf(candidate, { nowMs, timeZone })
  assert.equal(ranked.eyebrow, 'Recording tonight')
  assert.equal(later.eyebrow, 'Recording tonight')
  assert.equal(later.art.image, '/proven?w=768')
  assert.equal(later.title, 'Gogglebox')
  const tomorrow = slideOf(candidate, { nowMs: Date.parse('2026-10-18T20:00:00Z'), timeZone })
  assert.equal(tomorrow.eyebrow, 'Recording tomorrow')
  assert.equal(slideOf({ ...candidate, type: 'nope' }, { nowMs, timeZone }), null)
  assert.equal(slideOf({ ...candidate, source: null }, { nowMs, timeZone }), null)
})

test('slideOf: minutes left and progress follow the clock it is given', () => {
  const [ranked] = heroCandidatesOf({ nowEntries: [entry()], nowMs, timeZone })
  const candidate = candidateOf(ranked)
  assert.equal(slideOf(candidate, { nowMs, timeZone }).metaShort, '7mate · 52 min left')
  assert.equal(slideOf(candidate, { nowMs: nowMs + 30 * MIN, timeZone }).metaShort, '7mate · 22 min left')
  assert.equal(candidate.endsAt, nowMs + 52 * MIN)
})

test('heroSlidesOf: drops candidates that ended, have no proven picture, or are no longer current', () => {
  const ranked = heroCandidatesOf({
    ...fullFeed(),
    newEpisodes: [episode({ recordingId: 'r2', showKey: 'mkr', title: 'MKR' })],
    shows: [show({ key: 'mkr', title: 'MKR' })],
    recordingNow: [recording({ title: 'Gogglebox', channelId: 'c10' })],
    upcoming: [upcomingItem({ name: 'Hard Quiz', programId: 79 })],
  })
  const candidates = ranked.map((slide) => candidateOf(slide, [{ url: `/proven/${slide.key}`, srcset: 'set', focus: { x: 1, y: 1 } }]))
  const typesAt = (options) => heroSlidesOf({ candidates, remix: false, limit: 10, nowMs, timeZone, ...options }).map((s) => s.type)
  assert.deepEqual(typesAt({}), ['continue', 'new', 'recording', 'on-now', 'upcoming', 'watchlist', 'movie'])
  assert.deepEqual(typesAt({ nowMs: nowMs + 40 * MIN }), ['continue', 'new', 'on-now', 'upcoming', 'watchlist', 'movie'])
  assert.deepEqual(typesAt({ nowMs: nowMs + 80 * MIN }), ['continue', 'new', 'watchlist', 'movie'])
  const withoutPictures = candidates.map((candidate) => (candidate.type === 'movie' ? { ...candidate, art: { ...candidate.art, images: [] } } : candidate))
  assert.ok(!heroSlidesOf({ candidates: withoutPictures, remix: false, nowMs, timeZone, limit: 10 }).some((s) => s.type === 'movie'))
  const isCurrent = currentCandidateTestOf({ inProgress: [], newEpisodes: [episode({ recordingId: 'r2' })], movies: [], upcoming: [], activeProgramIds: [] })
  assert.deepEqual(typesAt({ isCurrent }), ['new', 'recording', 'on-now', 'watchlist'])
  const [first] = heroSlidesOf({ candidates, remix: false, nowMs, timeZone })
  assert.deepEqual(first.art, { title: 'The Block', image: '/proven/continue:r1', images: candidates[0].art.images, srcset: 'set', focus: { x: 1, y: 1 } })
})

test('currentCandidateTestOf: skipped, watched, and hidden picks leave before the next snapshot', () => {
  const test = currentCandidateTestOf({
    inProgress: [episode()],
    newEpisodes: [],
    movies: [movie()],
    upcoming: [upcomingItem({ programId: 77 }), upcomingItem({ programId: 78 })],
    activeProgramIds: [78],
    hiddenKeys: new Set(['grand-designs']),
  })
  assert.equal(test({ type: 'continue', source: { episode: episode() } }), true)
  assert.equal(test({ type: 'new', source: { episode: episode() } }), false)
  assert.equal(test({ type: 'movie', source: { movie: movie() } }), true)
  assert.equal(test({ type: 'upcoming', source: { item: { programId: 77 } } }), true)
  assert.equal(test({ type: 'upcoming', source: { item: { programId: 78 } } }), false)
  assert.equal(test({ type: 'upcoming', source: { item: { programId: 99 } } }), false)
  assert.equal(test({ type: 'for-you', source: { item: { title: 'Grand Designs' } } }), false)
  assert.equal(test({ type: 'top-rated', source: { item: { title: 'The Pianist' } } }), true)
  assert.equal(test({ type: 'on-now', source: {} }), true)
})

test('heroSlidesOf: the last slide never shares art with the first', () => {
  const slides = slidesFrom({ inProgress: [episode()], upcoming: [upcomingItem({ name: 'The Block' })], nowMs, timeZone, remix: false })
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
  const hourly = Array.from({ length: 24 }, (_, h) => slidesFrom({ ...feed, nowMs: nowMs + h * 3_600_000 }))
  assert.ok(hourly.every((slides) => slides[0].type === 'recording' && slides[1].type === 'on-now'))
  assert.ok(new Set(hourly.map((slides) => keys(slides).join())).size > 1)
  assert.deepEqual(keys(slidesFrom(feed)), keys(slidesFrom({ ...feed, nowMs: nowMs + 30 * MIN })))
})

test('heroSrcsetOf offers 768, 1280, and 1920 wide copies of the slide picture', () => {
  assert.equal(
    heroSrcsetOf('/api/epg/show-image?title=Love%20Island&w=768&c=series-v2'),
    '/api/epg/show-image?title=Love%20Island&c=series-v2&w=768 768w, '
      + '/api/epg/show-image?title=Love%20Island&c=series-v2&w=1280 1280w, '
      + '/api/epg/show-image?title=Love%20Island&c=series-v2&w=1920 1920w',
  )
  assert.equal(heroSrcsetOf('/api/epg/image/42').split(', ')[2], '/api/epg/image/42?w=1920 1920w')
  assert.equal(heroSrcsetOf(null), null)
})

test('heroCandidatesOf stamps show pictures with the stampUrl it is given', () => {
  const stampUrl = (url) => `${url}&c=server`
  const [slide] = heroCandidatesOf({ upcoming: [upcomingItem()], nowMs, timeZone, stampUrl })
  assert.equal(slide.art.image, '/api/epg/show-image?title=Gogglebox&w=768&c=server')
  const chosenImage = '/api/epg/show-image?title=The%20Block&w=384'
  const [chosen] = heroCandidatesOf({ inProgress: [episode({ artChosen: true, image: chosenImage })], nowMs, timeZone, stampUrl })
  assert.equal(chosen.art.image, '/api/epg/show-image?title=The%20Block&w=768&c=server')
})
