import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  TIER_ORDER,
  TOP_TIERS,
  createArtWarmer,
  mergeRunPlans,
  nextLocalTimeOf,
  pictureRequestOf,
  runPlanOf,
  startWarmSchedule,
  withWidth,
} from '../src/art-warmer.js'
import { isBackgroundWork, onlineLookupsAllowed } from '../src/background-work.js'
import { createWarmUrls, forYouUrlsOf, guideUrlsOf } from '../src/art-warm-plan.js'

const warmerWith = ({ urls = {}, warmUrls = new Set(), outcome = () => ({ image: { body: Buffer.from('x') } }), ...options } = {}) => {
  const calls = { tiers: [], warmed: [], contexts: [], sleeps: 0, logs: [] }
  const clock = { ms: 0 }
  const warmer = createArtWarmer({
    urlsFor: async (tier) => {
      calls.tiers.push(tier)
      return urls[tier] ?? []
    },
    isWarm: async (url) => warmUrls.has(url),
    warm: async (url) => {
      calls.warmed.push(url)
      calls.contexts.push({ background: isBackgroundWork(), online: onlineLookupsAllowed() })
      return outcome(url)
    },
    now: () => clock.ms,
    sleep: async (ms) => {
      calls.sleeps += 1
      clock.ms += ms
    },
    log: (line) => calls.logs.push(line),
    debounceMs: 0,
    setTimer: (fn) => {
      queueMicrotask(fn)
      return null
    },
    ...options,
  })
  return { warmer, calls, clock }
}

const runOnce = async (warmer, trigger, options) => {
  assert.equal(warmer.request(trigger, options), true)
  await new Promise((resolve) => setImmediate(resolve))
  await warmer.idle()
}

test('runPlanOf: change triggers warm the top and next tiers, nightly warms all, and backoff narrows it', () => {
  assert.deepEqual(runPlanOf({ trigger: 'guide', mode: 'active' }).tiers, ['home', 'for-you', 'recordings', 'guide-today', 'scheduled', 'show-heroes', 'show-posters'])
  assert.deepEqual(runPlanOf({ trigger: 'sync', mode: 'quiet' }).tiers, TOP_TIERS)
  assert.equal(runPlanOf({ trigger: 'sync', mode: 'dormant' }), null)
  assert.deepEqual(runPlanOf({ trigger: 'nightly', mode: 'active' }), { tiers: TIER_ORDER, offline: false })
  assert.deepEqual(runPlanOf({ trigger: 'nightly', mode: 'dormant' }), { tiers: TIER_ORDER, offline: true })
  assert.equal(runPlanOf({ trigger: 'visit-window', mode: 'quiet' }), null)
  assert.equal(runPlanOf({ trigger: 'visit-window', mode: 'active' }).offline, false)
  assert.deepEqual(runPlanOf({ trigger: 'prep', mode: 'dormant' }), { tiers: TIER_ORDER, offline: false })
})

test('mergeRunPlans keeps tier order and goes online when either plan is online', () => {
  const merged = mergeRunPlans({ tiers: ['frames', 'home'], offline: true }, { tiers: ['for-you'], offline: false })
  assert.deepEqual(merged, { tiers: ['home', 'for-you', 'frames'], offline: false, urls: undefined })
})

test('a full run asks each tier in priority order and warms in that order, each URL once', async () => {
  const urls = Object.fromEntries(TIER_ORDER.map((tier) => [tier, [`/${tier}?w=192`, '/shared?w=192']]))
  const { warmer, calls } = warmerWith({ urls })
  await runOnce(warmer, 'nightly')
  assert.deepEqual(calls.tiers, TIER_ORDER)
  assert.deepEqual(calls.warmed, ['/home?w=192', '/shared?w=192', ...TIER_ORDER.slice(1).map((tier) => `/${tier}?w=192`)])
  assert.match(calls.logs.at(-1), /^\[art-warm\] trigger nightly · tiers home,.* · checked 10 · warm 0 · rendered 10 · pending 0/)
})

test('no work when every picture is already warm', async () => {
  const urls = { home: ['/a?w=384', '/b?w=384'], 'for-you': ['/c?w=384'] }
  const { warmer, calls } = warmerWith({ urls, warmUrls: new Set(['/a?w=384', '/b?w=384', '/c?w=384']) })
  await runOnce(warmer, 'guide')
  assert.deepEqual(calls.warmed, [])
  assert.equal(warmer.current().counts.warm, 3)
})

test('warm runs as background work, and a dormant nightly run allows no online lookups', async () => {
  const urls = { home: ['/a?w=384'] }
  const online = warmerWith({ urls })
  await runOnce(online.warmer, 'nightly')
  assert.deepEqual(online.calls.contexts, [{ background: true, online: true }])
  const dormant = warmerWith({ urls, modeOf: () => 'dormant' })
  assert.equal(dormant.warmer.request('guide'), false)
  await runOnce(dormant.warmer, 'nightly')
  assert.deepEqual(dormant.calls.contexts, [{ background: true, online: false }])
})

test('pauses while playback, a busy event loop, a frame grab, or a lookup backlog runs', async () => {
  const reasons = ['playback', 'playback', null]
  let loop = [80, 0]
  let frames = [true, false]
  let backlog = [9, 0]
  const { warmer, calls } = warmerWith({
    urls: { home: ['/a?w=384'] },
    busyReason: () => reasons.shift() ?? null,
    loopP99Ms: () => loop.shift() ?? 0,
    framesBusy: () => frames.shift() ?? false,
    lookupBacklog: () => backlog.shift() ?? 0,
  })
  await runOnce(warmer, 'sync')
  assert.equal(calls.sleeps, 5)
  assert.deepEqual(calls.warmed, ['/a?w=384'])
  assert.equal(warmer.current().counts.pausedMs, 25_000)
})

test('stops rendering when warm pictures hold 60% of the thumbnail cache', async () => {
  let share = 0.5
  const { warmer, calls } = warmerWith({
    urls: { home: ['/a?w=384', '/b?w=384', '/c?w=384'] },
    cacheShare: () => share,
    outcome: () => {
      share += 0.1
      return { image: { body: Buffer.from('x') } }
    },
  })
  await runOnce(warmer, 'sync')
  assert.deepEqual(calls.warmed, ['/a?w=384'])
  assert.equal(warmer.current().counts.capped, true)
  assert.match(calls.logs.at(-1), /cache share cap reached/)
})

test('For you: a rebuild warms only the new items', async () => {
  const { warmer, calls } = warmerWith({ urls: {} })
  warmer.noteForYou(['/x?w=384', '/y?w=384'])
  await new Promise((resolve) => setImmediate(resolve))
  await warmer.idle()
  assert.deepEqual(calls.warmed, ['/x?w=384', '/y?w=384'])
  assert.equal(warmer.noteForYou(['/x?w=384', '/y?w=384']), false)
  warmer.noteForYou(['/y?w=384', '/z?w=384'])
  await new Promise((resolve) => setImmediate(resolve))
  await warmer.idle()
  assert.deepEqual(calls.warmed, ['/x?w=384', '/y?w=384', '/z?w=384'])
  assert.deepEqual(calls.tiers, [])
})

test('a pending picture is asked again once the lookups drain, and a rendered one is not asked again', async () => {
  const answers = new Map([['/a?w=384', [{ pending: true }, { image: { body: Buffer.from('x') } }]]])
  let backlog = [0, 2, 1, 0]
  const { warmer, calls } = warmerWith({
    urls: { home: ['/a?w=384', '/b?w=384'] },
    outcome: (url) => answers.get(url)?.shift() ?? { image: { body: Buffer.from('x') } },
    lookupBacklog: () => backlog.shift() ?? 0,
  })
  await runOnce(warmer, 'guide')
  assert.deepEqual(calls.warmed, ['/a?w=384', '/b?w=384', '/a?w=384'])
  assert.equal(warmer.current().counts.rendered, 2)
  await runOnce(warmer, 'guide')
  assert.equal(calls.warmed.length, 3)
})

test('progress reports done and total for a content-prep step', async () => {
  const { warmer } = warmerWith({ urls: { home: ['/a?w=384', '/b?w=384'] } })
  const seen = []
  warmer.onProgress((progress) => seen.push(`${progress.state} ${progress.done}/${progress.total}`))
  await runOnce(warmer, 'prep')
  assert.equal(seen.at(-1), 'done 2/2')
  assert.ok(seen.includes('running 1/2'))
})

test('pictureRequestOf and withWidth read and set the picture width', () => {
  assert.deepEqual(pictureRequestOf('/api/epg/show-image?title=Fargo&shape=poster&kind=movie&w=384&c=ab'), { route: 'show', width: 384, title: 'Fargo', shape: 'poster', kind: 'movie' })
  assert.deepEqual(pictureRequestOf('/api/epg/image/12%3A3?w=192'), { route: 'programme', width: 192, eventId: '12:3' })
  assert.deepEqual(pictureRequestOf('/api/recordings/9/image?w=384'), { route: 'other', width: 384 })
  assert.equal(withWidth('/api/epg/image/1?w=192', 768), '/api/epg/image/1?w=768')
  assert.equal(withWidth('/api/epg/show-image?title=A', 384), '/api/epg/show-image?title=A&w=384')
})

test('createWarmUrls builds each screen with the widths the UI asks for', async () => {
  const nowMs = 1_000_000
  const urlsFor = createWarmUrls({
    now: () => nowMs,
    loadHero: async () => ({ candidates: [{ art: { image: '/api/epg/show-image?title=Bluey' } }] }),
    loadEpisodes: async () => [{ picture: '/api/recordings/4/image?w=384' }],
    loadOnNow: async () => { throw new Error('TVHeadend is not set up') },
    loadShows: async () => [{ title: 'Fargo', kind: 'movie', poster: '/api/epg/show-image?title=Fargo&shape=poster&kind=movie' }],
    loadGuideProgrammes: async () => [
      { program_id: 2, title: 'Later', image: 'https://img/2', start: nowMs + 2 * 86_400_000, end: nowMs + 2 * 86_400_000 + 1 },
      { program_id: 1, title: 'Soon', image: 'https://img/1', start: nowMs + 60_000, end: nowMs + 120_000 },
      { program_id: 3, title: 'No picture', image: null, start: nowMs, end: nowMs + 1 },
    ],
  })
  assert.deepEqual(await urlsFor('home'), [
    '/api/epg/show-image?title=Bluey&w=768',
    '/api/epg/show-image?title=Bluey&w=1280',
    '/api/epg/show-image?title=Bluey&w=1920',
    '/api/recordings/4/image?w=384',
  ])
  assert.deepEqual(await urlsFor('recordings'), [
    '/api/epg/show-image?title=Fargo&shape=poster&kind=movie&w=384',
    '/api/epg/show-image?title=Fargo&kind=movie&w=384',
  ])
  assert.deepEqual(await urlsFor('show-posters'), ['/api/epg/show-image?title=Fargo&shape=poster&kind=movie&w=192'])
  assert.deepEqual(await urlsFor('guide-today'), ['/api/epg/image/1?w=192'])
  assert.deepEqual(await urlsFor('guide-week'), ['/api/epg/image/2?w=192'])
  assert.deepEqual(guideUrlsOf({ programmes: [], fromMs: 0, toMs: 1 }), [])
  assert.deepEqual(forYouUrlsOf({ topPick: { image: '/api/epg/image/5', title: 'Top' }, sections: [{ items: [{ title: 'Bluey' }] }] }), [
    '/api/epg/image/5?w=384',
    '/api/epg/image/5?w=768',
    '/api/epg/show-image?title=Bluey&w=384',
    '/api/epg/show-image?title=Bluey&w=768',
  ])
})

test('startWarmSchedule asks for the nightly run and for a predicted visit window', () => {
  const timers = []
  const requests = []
  const nowMs = new Date(2026, 10, 9, 12, 0).getTime()
  const stop = startWarmSchedule({
    request: (trigger) => requests.push(trigger),
    nextWindowAt: () => nowMs + 30 * 60_000,
    now: () => nowMs,
    setTimer: (fn, ms) => {
      timers.push({ fn, ms })
      return timers.length
    },
    clearTimer: () => {},
  })
  assert.equal(timers[0].ms, nextLocalTimeOf({ nowMs, hour: 3, minute: 30 }) - nowMs)
  assert.equal(timers[1].ms, 30 * 60_000)
  timers[1].fn()
  assert.deepEqual(requests, ['visit-window'])
  timers[0].fn()
  assert.deepEqual(requests, ['visit-window', 'nightly'])
  stop()
})

test('stop ends a run between pictures and refuses new requests', async () => {
  let warmer = null
  const setup = warmerWith({
    urls: { home: ['/a?w=384', '/b?w=384', '/c?w=384'] },
    outcome: () => {
      warmer.stop()
      return { image: { body: Buffer.from('x') } }
    },
  })
  warmer = setup.warmer
  await runOnce(warmer, 'sync')
  assert.deepEqual(setup.calls.warmed, ['/a?w=384'])
  assert.equal(warmer.request('sync'), false)
})
