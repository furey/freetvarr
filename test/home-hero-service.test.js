import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  BOUNDARY_SLACK_MS,
  HERO_SNAPSHOT_VERSION,
  buildHeroSnapshot,
  createHomeHero,
  createSnapshotSaver,
  isHomeHeroWrite,
  nextBoundaryOf,
  readFeedWith,
  readPoolsWith,
} from '../src/home-hero-service.js'
import { createHeroPictureProof } from '../src/hero-picture-proof.js'

const MIN = 60_000
const nowMs = Date.parse('2026-10-19T19:14:00Z')
const timeZone = 'UTC'

const episode = (over) => ({
  recordingId: 'r1', showKey: 'the-block', title: 'The Block', kind: 'show', season: 22, episode: 45,
  episodeTitle: 'Reveal', channelName: '9HD', durationS: 3600, positionS: 1920, airedAt: nowMs - 86_400_000,
  image: '/api/recordings/r1/image?w=384', ...over,
})

const onNow = (over = {}) => ({
  channel: { id: 'c7', name: '7mate', pinned: true, offAir: false, hasLogo: true },
  now: { program_id: 900, title: 'No Picture Cup', start: nowMs - 20 * MIN, end: nowMs + 52 * MIN, genre: 64, has_image: false, ...over },
})

const upcoming = (over) => ({
  programId: 77, name: 'Gogglebox', channelId: 'c10', channelName: '10', startDate: nowMs + 76 * MIN,
  endDate: nowMs + 136 * MIN, season: 1, episodeNo: 4, ...over,
})

const feedOf = (over = {}) => ({
  inProgress: [episode()],
  newEpisodes: [],
  movies: [],
  shows: [{ key: 'the-block', title: 'The Block', counts: { total: 3, unwatched: 2 } }],
  nowEntries: [onNow()],
  upcoming: [upcoming()],
  activeProgramIds: [],
  recordingNow: [],
  watchlist: [],
  forYouPayload: null,
  stamps: new Map([['gogglebox', { background: 'k1', poster: null }]]),
  failed: [],
  ...over,
})

const proofOf = (verdicts, focus = null) => async (url) => ({ status: verdicts(url) ?? 'missing', width: 1280, focus })

const noPictureFor = (title) => (url) => (url.includes(encodeURIComponent(title)) || url.includes('/api/epg/image/900') ? 'missing' : 'pass')

test('buildHeroSnapshot drops a programme with no proven picture and keeps the rest with their proven pictures', async () => {
  const built = await buildHeroSnapshot({
    feed: feedOf(),
    proofHeroPicture: proofOf(noPictureFor('No Picture Cup'), { x: 0.5, y: 0.4 }),
    nowMs,
    timeZone,
  })
  const { candidates } = built.snapshot
  assert.deepEqual(candidates.map((c) => c.type), ['continue', 'upcoming'])
  assert.equal(built.snapshot.version, HERO_SNAPSHOT_VERSION)
  assert.equal(built.snapshot.builtAt, nowMs)
  const [continuing, next] = candidates
  assert.equal(continuing.art.image, '/api/recordings/r1/image?w=384')
  assert.deepEqual(continuing.art.images[0].focus, { x: 0.5, y: 0.4 })
  assert.match(continuing.art.images[0].srcset, /w=1920 1920w$/)
  assert.equal(next.art.image, '/api/epg/show-image?title=Gogglebox&w=768&c=k1')
  assert.equal(next.startsAt, nowMs + 76 * MIN)
  assert.equal(next.endsAt, nowMs + 76 * MIN)
  assert.equal(built.nextBoundaryMs, nowMs + 52 * MIN)
  assert.equal(built.pending, false)
})

test('buildHeroSnapshot tries the show picture when the programme picture fails, and notes pending lookups', async () => {
  const proofs = []
  const built = await buildHeroSnapshot({
    feed: feedOf({ inProgress: [], upcoming: [], nowEntries: [onNow({ has_image: true })] }),
    proofHeroPicture: async (url) => {
      proofs.push(url)
      if (url.startsWith('/api/epg/image/900')) return { status: 'pending', width: 0 }
      return { status: 'pass', width: 1920 }
    },
    nowMs,
    timeZone,
  })
  assert.deepEqual(built.snapshot.candidates.map((c) => c.art.image), ['/api/epg/show-image?title=No%20Picture%20Cup&w=768&c=series-v2'])
  assert.equal(built.pending, true)
  assert.equal(proofs.length, 2)
})

test('buildHeroSnapshot uses library art pools and keeps up to three proven pictures per slide', async () => {
  const pools = {
    shows: { 'the-block': ['/bg1', '/bg2', '/bg3', '/bg4'].map((url) => ({ url, kind: 'background' })) },
    recordings: { r1: [{ url: '/r1-a', kind: 'episode', contentKey: 'same' }, { url: '/r1-b', kind: 'episode', contentKey: 'same' }] },
  }
  const requests = []
  const built = await buildHeroSnapshot({
    feed: feedOf({ nowEntries: [], upcoming: [] }),
    readPools: async (request) => {
      requests.push(request)
      return pools
    },
    proofHeroPicture: proofOf(() => 'pass'),
    nowMs,
    timeZone,
  })
  assert.deepEqual(requests, [{ showKeys: ['the-block'], recordingIds: ['r1'] }])
  const [candidate] = built.snapshot.candidates
  assert.equal(candidate.art.images.length, 3)
  assert.deepEqual(candidate.art.images.map((image) => image.identity), ['content:same', '/api/recordings/r1/image', '/bg1'])
})

test('buildHeroSnapshot keeps one copy of a picture that two urls serve byte for byte', async () => {
  const contentOf = (url) => (url.includes('/api/epg/show-image') ? 'same' : url)
  const built = await buildHeroSnapshot({
    feed: feedOf({ inProgress: [], nowEntries: [], upcoming: [upcoming()], stamps: new Map() }),
    readPools: async () => ({ shows: { gogglebox: [{ url: '/api/epg/show-image?title=Gogglebox&w=768', kind: 'background' }, { url: '/pool/2', kind: 'background' }] } }),
    proofHeroPicture: async (url) => ({ status: 'pass', width: 1920, contentKey: contentOf(url) }),
    nowMs,
    timeZone,
  })
  const [candidate] = built.snapshot.candidates
  assert.deepEqual(candidate.art.images.map((image) => image.identity), ['content:same', 'content:/pool/2'])
})

test('buildHeroSnapshot keeps one candidate per show, the best ranked one that has a picture (:3744 Chefs Ahoy and The Block)', async () => {
  const chefs = (over) => episode({ showKey: 'chefs-ahoy', title: 'Chefs Ahoy', ...over })
  const feed = feedOf({
    inProgress: [chefs({ recordingId: '4e2c', image: null })],
    newEpisodes: [episode({ recordingId: 'a07' }), chefs({ recordingId: 'bcbc', image: '/api/recordings/bcbc/image?w=384' })],
    shows: [{ key: 'the-block', title: 'The Block', counts: { total: 3, unwatched: 2 } }, { key: 'chefs-ahoy', title: 'Chefs Ahoy', counts: { total: 3, unwatched: 2 } }],
    nowEntries: [],
    upcoming: [upcoming({ name: 'The Block', programId: 377981 }), upcoming({ name: 'Big Brother', programId: 387216, startDate: nowMs + 200 * MIN })],
  })
  const keysWith = async (verdicts) => (await buildHeroSnapshot({ feed, proofHeroPicture: proofOf(verdicts), nowMs, timeZone })).snapshot.candidates.map((c) => c.key)
  assert.deepEqual(await keysWith(() => 'pass'), ['continue:4e2c', 'new:a07', 'upcoming:387216'])
  const noChefsContinuePicture = (url) => (url.includes('Chefs%20Ahoy') ? 'missing' : 'pass')
  assert.deepEqual(await keysWith(noChefsContinuePicture), ['new:a07', 'new:bcbc', 'upcoming:387216'])
})

test('buildHeroSnapshot gives an empty list for an empty library and guide', async () => {
  const built = await buildHeroSnapshot({ feed: feedOf({ inProgress: [], nowEntries: [], upcoming: [], shows: [], stamps: undefined }), proofHeroPicture: proofOf(() => 'pass'), nowMs, timeZone })
  assert.deepEqual(built.snapshot.candidates, [])
  assert.equal(built.nextBoundaryMs, null)
})

test('nextBoundaryOf: the soonest end, start, or favourite programme change after now', () => {
  const feed = feedOf({ recordingNow: [{ start: nowMs - MIN, stop: nowMs + 10 * MIN }] })
  assert.equal(nextBoundaryOf({ candidates: [{ endsAt: nowMs + 30 * MIN }], feed, nowMs }), nowMs + 10 * MIN)
  assert.equal(nextBoundaryOf({ candidates: [], feed: feedOf({ nowEntries: [], upcoming: [] }), nowMs }), null)
})

const fakeClock = (startMs = nowMs) => {
  const clock = { ms: startMs, timers: new Map(), repeats: new Map(), nextId: 1 }
  clock.setTimer = (fn, ms) => {
    const id = clock.nextId++
    clock.timers.set(id, { fn, at: clock.ms + ms })
    return id
  }
  clock.clearTimer = (id) => clock.timers.delete(id)
  clock.setRepeat = (fn, ms) => {
    const id = clock.nextId++
    clock.repeats.set(id, { fn, ms })
    return id
  }
  clock.clearRepeat = (id) => clock.repeats.delete(id)
  clock.advance = async (ms) => {
    clock.ms += ms
    const due = [...clock.timers.entries()].filter(([, timer]) => timer.at <= clock.ms)
    due.forEach(([id]) => clock.timers.delete(id))
    due.forEach(([, timer]) => timer.fn())
    await settle()
  }
  clock.dueTimes = () => [...clock.timers.values()].map((timer) => timer.at - clock.ms).sort((a, b) => a - b)
  return clock
}

const settle = () => new Promise((resolve) => setImmediate(resolve))

const heroWith = ({ clock = fakeClock(), readFeed = async () => feedOf(), saved = null, proof = proofOf(() => 'pass'), ...over } = {}) => {
  const saves = []
  let reads = 0
  const hero = createHomeHero({
    readFeed: async () => {
      reads += 1
      return readFeed()
    },
    proofHeroPicture: proof,
    loadSaved: async () => saved,
    save: async (snapshot) => saves.push(snapshot),
    timeZone: () => timeZone,
    now: () => clock.ms,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    setRepeat: clock.setRepeat,
    clearRepeat: clock.clearRepeat,
    log: () => {},
    ...over,
  })
  return { hero, clock, saves, reads: () => reads }
}

test('the first read builds at once and later reads serve the saved snapshot without building', async () => {
  const { hero, saves, reads } = heroWith()
  const first = await hero.read()
  assert.deepEqual(first.candidates.map((c) => c.type), ['continue', 'on-now', 'upcoming'])
  assert.equal(first.stale, false)
  assert.equal(saves.length, 1)
  await hero.read()
  assert.equal(reads(), 1)
})

test('a restart serves the saved snapshot straight away', async () => {
  const saved = { version: HERO_SNAPSHOT_VERSION, builtAt: nowMs - MIN, candidates: [{ key: 'continue:r1' }] }
  const { hero, reads } = heroWith({ saved })
  assert.deepEqual((await hero.read()).candidates, [{ key: 'continue:r1' }])
  assert.equal(reads(), 0)
  const old = heroWith({ saved: { ...saved, version: HERO_SNAPSHOT_VERSION - 1 } })
  assert.equal((await old.hero.read()).candidates.length, 3)
})

test('a failed build keeps the last good snapshot and marks it stale', async () => {
  let failing = false
  const { hero, clock } = heroWith({
    readFeed: async () => {
      if (failing) throw new Error('database locked')
      return feedOf()
    },
  })
  const good = await hero.read()
  failing = true
  await hero.build()
  const served = await hero.read()
  assert.equal(served.builtAt, good.builtAt)
  assert.equal(served.stale, true)
  assert.ok(clock.dueTimes().length >= 1)
})

test('a TVHeadend outage keeps the last snapshot for a while instead of losing live slides', async () => {
  let feed = feedOf()
  const { hero, clock } = heroWith({ readFeed: async () => feed })
  const good = await hero.read()
  feed = feedOf({ nowEntries: [], upcoming: [], failed: ['tvheadend'] })
  clock.ms += 10 * MIN
  await hero.build()
  const kept = await hero.read()
  assert.equal(kept.builtAt, good.builtAt)
  assert.equal(kept.stale, true)
  clock.ms += 3 * 60 * MIN
  await hero.build()
  const rebuilt = await hero.read()
  assert.equal(rebuilt.stale, false)
  assert.deepEqual(rebuilt.candidates.map((c) => c.type), ['continue'])
})

test('with no snapshot and a slow build, the read answers building within its budget', async () => {
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const clock = fakeClock()
  const { hero } = heroWith({ clock, readFeed: async () => { await gate; return feedOf() } })
  const pending = hero.read()
  await settle()
  await clock.advance(2500)
  assert.deepEqual(await pending, { version: HERO_SNAPSHOT_VERSION, builtAt: null, candidates: [], building: true })
  release()
  await settle()
  await settle()
  assert.equal((await hero.read()).candidates.length, 3)
})

test('invalidate waits three seconds and folds repeated calls into one build', async () => {
  const { hero, clock, reads } = heroWith()
  hero.invalidate()
  await clock.advance(1000)
  hero.invalidate()
  await clock.advance(2999)
  assert.equal(reads(), 0)
  await clock.advance(1)
  assert.equal(reads(), 1)
})

test('one build runs at a time and a request during it runs once more afterwards', async () => {
  let release
  let gate = new Promise((resolve) => { release = resolve })
  const { hero, reads } = heroWith({ readFeed: async () => { await gate; return feedOf() } })
  const first = hero.build()
  hero.build()
  hero.build()
  await settle()
  assert.equal(reads(), 1)
  gate = Promise.resolve()
  release()
  await first
  await settle()
  await settle()
  assert.equal(reads(), 2)
})

test('the next boundary schedules a build just after it, and start sets the startup and repeat timers', async () => {
  const { hero, clock } = heroWith()
  await hero.build()
  assert.deepEqual(clock.dueTimes(), [52 * MIN + BOUNDARY_SLACK_MS].filter((ms) => ms < 5 * MIN))
  const soon = heroWith({ readFeed: async () => feedOf({ nowEntries: [onNow({ end: nowMs + 2 * MIN })] }) })
  await soon.hero.build()
  assert.deepEqual(soon.clock.dueTimes(), [2 * MIN + BOUNDARY_SLACK_MS])
  soon.hero.start()
  assert.equal(soon.clock.repeats.size, 1)
  assert.ok(soon.clock.dueTimes().includes(20_000))
  soon.hero.stop()
  assert.equal(soon.clock.repeats.size, 0)
  assert.deepEqual(soon.clock.dueTimes(), [])
})

test('a picture waiting for face focus stays off Home, and finished detection rebuilds within seconds', async () => {
  const focusStatus = { settled: false, focus: null }
  const clock = fakeClock()
  let hero = null
  const proof = createHeroPictureProof({
    resolve: async () => ({ image: { body: Buffer.from('p'), contentType: 'image/webp', width: 1920 }, pending: false }),
    measure: async (image) => image.width,
    focusStatusOf: async () => focusStatus,
    onFocusWaitOver: () => hero.invalidate(),
    yieldTurn: async () => {},
  })
  const built = heroWith({ clock, readFeed: async () => feedOf({ inProgress: [], upcoming: [] }), proof: proof.proofHeroPicture })
  hero = built.hero
  assert.deepEqual((await hero.read()).candidates, [])
  Object.assign(focusStatus, { settled: true, focus: { x: 0.2, y: 0.3, box: null } })
  proof.focusSettled('/api/epg/show-image?title=no+picture+cup')
  await clock.advance(3000)
  await settle()
  const [candidate] = (await hero.read()).candidates
  assert.equal(candidate.type, 'on-now')
  assert.deepEqual(candidate.art.images[0].focus, { x: 0.2, y: 0.3, box: null })
})

test('readFeedWith marks hard failures, lets For you fail quietly, and maps recording state', async () => {
  const feed = await readFeedWith({
    inProgress: async () => [episode()],
    nowEntries: async () => { throw new Error('tvheadend down') },
    recordingState: async () => ({ upcoming: [upcoming()], activeProgramIds: ['5'] }),
    forYouPayload: async () => { throw new Error('cold') },
  })()
  assert.deepEqual(feed.failed, ['tvheadend'])
  assert.equal(feed.inProgress.length, 1)
  assert.deepEqual(feed.nowEntries, [])
  assert.equal(feed.upcoming.length, 1)
  assert.deepEqual(feed.activeProgramIds, ['5'])
  assert.equal(feed.forYouPayload, null)
})

test('readPoolsWith reads each pool in turn and skips empty or failed ones', async () => {
  const order = []
  const read = readPoolsWith({
    showImages: async (key) => {
      order.push(key)
      if (key === 'bad') throw new Error('plex down')
      return key === 'empty' ? [] : [{ url: `/${key}` }]
    },
    recordingImages: async (id) => [{ url: `/rec/${id}` }],
  })
  const pools = await read({ showKeys: ['a', 'bad', 'empty'], recordingIds: ['r1'] })
  assert.deepEqual(order, ['a', 'bad', 'empty'])
  assert.deepEqual(pools, { shows: { a: [{ url: '/a' }] }, recordings: { r1: [{ url: '/rec/r1' }] } })
})

test('isHomeHeroWrite: writes that change Home, never reads or playback pings', () => {
  const writes = [
    ['POST', '/api/epg/record'], ['POST', '/api/epg/cancel'], ['POST', '/api/recordings/r1/watched'],
    ['DELETE', '/api/recordings/r1'], ['POST', '/api/library/shows/the-block/watched'], ['PUT', '/api/library/shows/x/artwork/background'],
    ['DELETE', '/api/play/s1'], ['PATCH', '/api/watchlist/4'], ['PUT', '/api/epg/channel-prefs'], ['POST', '/api/settings'],
  ]
  writes.forEach(([method, path]) => assert.equal(isHomeHeroWrite({ method, path }), true, `${method} ${path}`))
  const others = [
    ['GET', '/api/epg/record'], ['POST', '/api/recordings/r1/position'], ['POST', '/api/play/s1/heartbeat'],
    ['POST', '/api/live/s1/attention'], ['POST', '/api/events/feedback'], ['POST', '/api/tvh-test'],
  ]
  others.forEach(([method, path]) => assert.equal(isHomeHeroWrite({ method, path }), false, `${method} ${path}`))
})

test('the snapshot saver skips writing a rebuild whose candidates did not change', async () => {
  const writes = []
  const save = createSnapshotSaver({ write: async (text) => { writes.push(JSON.parse(text)) }, resaveMs: 10 * MIN })
  const snapshot = (over) => ({ version: HERO_SNAPSHOT_VERSION, builtAt: nowMs, timeZone, candidates: [{ key: 'a' }], ...over })
  assert.equal(await save(snapshot()), true)
  assert.equal(await save(snapshot({ builtAt: nowMs + MIN })), false)
  assert.equal(await save(snapshot({ builtAt: nowMs + 2 * MIN, candidates: [{ key: 'b' }] })), true)
  assert.equal(await save(snapshot({ builtAt: nowMs + 3 * MIN, candidates: [{ key: 'b' }], timeZone: 'Australia/Sydney' })), true)
  assert.deepEqual(writes.map((written) => written.builtAt), [nowMs, nowMs + 2 * MIN, nowMs + 3 * MIN])
})

test('the snapshot saver still refreshes an unchanged snapshot after the resave gap', async () => {
  const writes = []
  const save = createSnapshotSaver({ write: async (text) => { writes.push(text) }, resaveMs: 10 * MIN })
  const snapshot = (builtAt) => ({ version: HERO_SNAPSHOT_VERSION, builtAt, timeZone, candidates: [] })
  await save(snapshot(nowMs))
  await save(snapshot(nowMs + 9 * MIN))
  await save(snapshot(nowMs + 10 * MIN))
  assert.equal(writes.length, 2)
})

test('the snapshot saver retries after a failed write', async () => {
  let fail = true
  const save = createSnapshotSaver({ write: async () => { if (fail) throw new Error('disk') } })
  const snapshot = { version: HERO_SNAPSHOT_VERSION, builtAt: nowMs, timeZone, candidates: [] }
  await assert.rejects(save(snapshot), /disk/)
  fail = false
  assert.equal(await save(snapshot), true)
})
