import { isProven } from './hero-picture-proof.js'
import { createArtworkStamps } from './web/artwork-stamps.js'
import { forYouSlideOf, msOf, scheduledKeysOf, topRatedSlideOf } from './web/for-you.js'
import { artIdentityFrom, candidatesOf, isEpisodeSlide, slideShowKeyOf } from './web/hero-art.js'
import { HERO_SLIDE_LIMIT, heroCandidatesOf, heroShowKeyOf, heroSrcsetOf, showImageOf } from './web/home-hero.js'
import { measureJob } from './event-loop-lag.js'

export const HERO_SNAPSHOT_VERSION = 1
export const HERO_SNAPSHOT_SETTING = 'home_hero_snapshot'
export const HERO_CANDIDATE_LIMIT = HERO_SLIDE_LIMIT * 2
export const PICTURES_PER_CANDIDATE = 3
export const PROOFS_PER_CANDIDATE = 6
export const BUILD_START_DELAY_MS = 20 * 1000
export const BUILD_INTERVAL_MS = 5 * 60 * 1000
export const INVALIDATE_DEBOUNCE_MS = 3 * 1000
export const FIRST_BUILD_BUDGET_MS = 2500
export const PENDING_RETRY_MS = 60 * 1000
export const BOUNDARY_SLACK_MS = 2 * 1000
export const KEEP_SNAPSHOT_THROUGH_OUTAGE_MS = 2 * 60 * 60 * 1000
export const SNAPSHOT_RESAVE_MS = 10 * 60 * 1000

export const createSnapshotSaver = ({ write, resaveMs = SNAPSHOT_RESAVE_MS }) => {
  let saved = null
  return async (snapshot) => {
    const candidates = JSON.stringify(snapshot.candidates)
    const unchanged = saved?.candidates === candidates
      && saved.timeZone === snapshot.timeZone
      && snapshot.builtAt - saved.builtAt < resaveMs
    if (unchanged) return false
    await write(JSON.stringify(snapshot))
    saved = { candidates, timeZone: snapshot.timeZone, builtAt: snapshot.builtAt }
    return true
  }
}

export const HOME_HERO_WRITE_PATHS = [
  /^\/api\/epg\/(record|record-series|cancel|cancel-series|pause-series|channel-prefs)$/,
  /^\/api\/library\//,
  /^\/api\/recordings(\/[^/]+(\/(watched|library|restore-original))?)?$/,
  /^\/api\/watchlist(\/[^/]+)?$/,
  /^\/api\/for-you\/(hidden|picks|settings)(\/|$)/,
  /^\/api\/programme-kind\/[^/]+$/,
  /^\/api\/play\/[^/]+$/,
  /^\/api\/(settings|shows|recording-defaults)(\/|$)/,
]

export const readFeedWith = (sources) => async () => {
  const failed = new Set()
  const read = async ({ name, load, fallback, soft = false }) => {
    try {
      return (await load?.()) ?? fallback
    } catch {
      if (!soft) failed.add(name)
      return fallback
    }
  }
  const [inProgress, newEpisodes, movies, shows, nowEntries, state, recordingNow, watchlist, forYouPayload, stamps] = await Promise.all([
    read({ name: 'library', load: sources.inProgress, fallback: [] }),
    read({ name: 'library', load: sources.newEpisodes, fallback: [] }),
    read({ name: 'library', load: sources.movies, fallback: [] }),
    read({ name: 'library', load: sources.shows, fallback: [] }),
    read({ name: 'tvheadend', load: sources.nowEntries, fallback: [] }),
    read({ name: 'tvheadend', load: sources.recordingState, fallback: {} }),
    read({ name: 'tvheadend', load: sources.recordingNow, fallback: [] }),
    read({ name: 'watchlist', load: sources.watchlist, fallback: [] }),
    read({ name: 'for-you', load: sources.forYouPayload, fallback: null, soft: true }),
    read({ name: 'stamps', load: sources.stamps, fallback: new Map(), soft: true }),
  ])
  return {
    inProgress,
    newEpisodes,
    movies,
    shows,
    nowEntries,
    upcoming: state.upcoming ?? [],
    activeProgramIds: state.activeProgramIds ?? [],
    recordingNow,
    watchlist,
    forYouPayload,
    stamps,
    failed: [...failed],
  }
}

export const readPoolsWith =({ showImages, recordingImages }) => async ({ showKeys = [], recordingIds = [] }) => ({
  shows: await imagesByKey({ keys: showKeys, load: showImages }),
  recordings: await imagesByKey({ keys: recordingIds, load: recordingImages }),
})

export const isHomeHeroWrite =({ method, path }) => method !== 'GET'
  && method !== 'HEAD'
  && HOME_HERO_WRITE_PATHS.some((pattern) => pattern.test(path))

export const isHeroSnapshot = (value) => Boolean(value)
  && value.version === HERO_SNAPSHOT_VERSION
  && Number.isFinite(value.builtAt)
  && Array.isArray(value.candidates)

export const createHomeHero = ({
  readFeed,
  readPools = async () => ({}),
  proofHeroPicture,
  loadSaved = async () => null,
  save = async () => {},
  timeZone = () => undefined,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  setRepeat = setInterval,
  clearRepeat = clearInterval,
  startDelayMs = BUILD_START_DELAY_MS,
  intervalMs = BUILD_INTERVAL_MS,
  debounceMs = INVALIDATE_DEBOUNCE_MS,
  firstBuildBudgetMs = FIRST_BUILD_BUDGET_MS,
  pendingRetryMs = PENDING_RETRY_MS,
  keepThroughOutageMs = KEEP_SNAPSHOT_THROUGH_OUTAGE_MS,
  limit = HERO_CANDIDATE_LIMIT,
  log = (message) => console.warn(`[home-hero] ${message}`),
}) => {
  let snapshot = null
  let stale = false
  let restoring = null
  let building = null
  let rebuildWanted = false
  const timers = { start: null, repeat: null, debounce: null, followUp: null }

  const unrefed = (timer) => {
    timer?.unref?.()
    return timer
  }

  const restore = () => {
    restoring ??= Promise.resolve()
      .then(loadSaved)
      .then((saved) => {
        if (!snapshot && isHeroSnapshot(saved)) snapshot = saved
      })
      .catch(() => {})
    return restoring
  }

  const build = () => {
    if (building) {
      rebuildWanted = true
      return building
    }
    building = measureJob('hero-build', runBuild, { kind: 'hero' }).finally(() => {
      building = null
      if (!rebuildWanted) return
      rebuildWanted = false
      build()
    })
    return building
  }

  const runBuild = async () => {
    await restore()
    const nowMs = now()
    try {
      const feed = await readFeed()
      if (keepsPrevious({ feed, nowMs })) {
        stale = true
        scheduleFollowUp({ atMs: nowMs + pendingRetryMs, nowMs })
        return snapshot
      }
      const built = await buildHeroSnapshot({ feed, readPools, proofHeroPicture, nowMs, timeZone: timeZone(), limit })
      snapshot = built.snapshot
      stale = false
      await Promise.resolve().then(() => save(snapshot)).catch(() => {})
      scheduleFollowUp({ atMs: followUpAtOf({ built, nowMs, pendingRetryMs }), nowMs })
      return snapshot
    } catch (err) {
      stale = Boolean(snapshot)
      log(`build failed: ${err.message}`)
      scheduleFollowUp({ atMs: nowMs + pendingRetryMs, nowMs })
      return snapshot
    }
  }

  const keepsPrevious = ({ feed, nowMs }) => Boolean(feed.failed?.length)
    && Boolean(snapshot)
    && nowMs - snapshot.builtAt < keepThroughOutageMs

  const scheduleFollowUp = ({ atMs, nowMs }) => {
    clearTimer(timers.followUp)
    timers.followUp = null
    if (!Number.isFinite(atMs) || atMs - nowMs >= intervalMs) return
    timers.followUp = unrefed(setTimer(() => {
      timers.followUp = null
      build()
    }, Math.max(0, atMs - nowMs)))
  }

  const invalidate = () => {
    clearTimer(timers.debounce)
    timers.debounce = unrefed(setTimer(() => {
      timers.debounce = null
      build()
    }, debounceMs))
  }

  const read = async () => {
    await restore()
    if (snapshot) return { ...snapshot, stale }
    const first = await withinMs({ promise: build(), ms: firstBuildBudgetMs, setTimer, clearTimer })
    return first ? { ...first, stale } : { version: HERO_SNAPSHOT_VERSION, builtAt: null, candidates: [], building: true }
  }

  const start = () => {
    restore()
    timers.start = unrefed(setTimer(() => {
      timers.start = null
      build()
    }, startDelayMs))
    timers.repeat = unrefed(setRepeat(build, intervalMs))
  }

  const stop = () => {
    clearTimer(timers.start)
    clearTimer(timers.debounce)
    clearTimer(timers.followUp)
    clearRepeat(timers.repeat)
    Object.keys(timers).forEach((name) => { timers[name] = null })
  }

  const current = () => snapshot

  return { start, stop, build, invalidate, read, current }
}

export const buildHeroSnapshot = async ({
  feed,
  readPools = async () => ({}),
  proofHeroPicture,
  nowMs,
  timeZone,
  limit = HERO_CANDIDATE_LIMIT,
}) => {
  const stampUrl = stampUrlFrom(feed.stamps)
  const ranked = rankedSlidesOf({ feed, nowMs, timeZone, stampUrl })
  const pools = await readPools(poolRequestsFor({ slides: ranked, shows: feed.shows ?? [] })).catch(() => ({}))
  const identityOf = artIdentityFrom(pools)
  const proven = []
  let pending = false
  const shownShows = new Set()
  for (const slide of ranked) {
    if (proven.length >= limit) break
    if (shownShows.has(heroShowKeyOf(slide))) continue
    const found = await provenPicturesOf({ slide, pools, stampUrl, proofHeroPicture, identityOf })
    pending ||= found.pending
    if (!found.pictures.length) continue
    shownShows.add(heroShowKeyOf(slide))
    proven.push({ slide, pictures: found.pictures })
  }
  const candidates = proven.map(candidateOf)
  return {
    snapshot: { version: HERO_SNAPSHOT_VERSION, builtAt: nowMs, timeZone: timeZone ?? null, candidates },
    pending,
    nextBoundaryMs: nextBoundaryOf({ candidates, feed, nowMs }),
  }
}

export const rankedSlidesOf = ({ feed, nowMs, timeZone, stampUrl }) => {
  const suggestionFeed = {
    payload: feed.forYouPayload ?? null,
    scheduledKeys: scheduledKeysOf(feed.upcoming ?? []),
    nowMs,
    timeZone,
    stampUrl,
  }
  const forYou = forYouSlideOf(suggestionFeed)
  const topRated = topRatedSlideOf({ ...suggestionFeed, besides: forYou })
  return heroCandidatesOf({
    inProgress: feed.inProgress ?? [],
    newEpisodes: feed.newEpisodes ?? [],
    shows: feed.shows ?? [],
    recordingNow: feed.recordingNow ?? [],
    nowEntries: feed.nowEntries ?? [],
    upcoming: feed.upcoming ?? [],
    activeProgramIds: feed.activeProgramIds ?? [],
    watchlist: feed.watchlist ?? [],
    movies: feed.movies ?? [],
    forYou,
    topRated,
    nowMs,
    timeZone,
    stampUrl,
  })
}

export const poolRequestsFor = ({ slides, shows }) => {
  const libraryKeys = new Set(shows.map((show) => show.key))
  return {
    showKeys: [...new Set(slides.map(slideShowKeyOf).filter((key) => libraryKeys.has(key)))],
    recordingIds: [...new Set(slides.filter(isEpisodeSlide).map((slide) => slide.recordingId).filter(Boolean))],
  }
}

export const nextBoundaryOf = ({ candidates, feed, nowMs }) => {
  const times = [
    ...candidates.map((candidate) => candidate.endsAt),
    ...(feed.upcoming ?? []).map((item) => item.startDate),
    ...(feed.recordingNow ?? []).flatMap((recording) => [recording.start, recording.stop]),
    ...(feed.nowEntries ?? []).filter((entry) => entry.channel?.pinned).map((entry) => entry.now?.end),
  ].filter((ms) => Number.isFinite(ms) && ms > nowMs)
  return times.length ? Math.min(...times) : null
}

export const startsAtOf = (slide) => {
  if (slide.type === 'upcoming') return slide.source.item.startDate ?? null
  if (slide.type === 'recording') return slide.source.recording.start ?? null
  if (slide.type === 'on-now') return slide.source.program.start ?? null
  if (slide.type === 'watchlist') return slide.source.item.nextMatch?.start ?? null
  if (slide.type === 'for-you' || slide.type === 'top-rated') return msOf(slide.source.item.start)
  return null
}

const provenPicturesOf = async ({ slide, pools, stampUrl, proofHeroPicture, identityOf }) => {
  const ladder = uniqueBy({
    items: [...candidatesOf({ slide, pools }), showImageOf({ title: slide.art.title ?? slide.title, stampUrl })],
    keyOf: identityOf,
  })
  const pictures = []
  let pending = false
  for (const url of ladder.slice(0, PROOFS_PER_CANDIDATE)) {
    if (pictures.length >= PICTURES_PER_CANDIDATE) break
    const verdict = await proofHeroPicture(url)
    if (verdict?.status === 'pending') pending = true
    if (!isProven(verdict)) continue
    const identity = verdict.contentKey ? `content:${verdict.contentKey}` : identityOf(url)
    if (!pictures.some((picture) => picture.identity === identity)) pictures.push({ url, identity, focus: verdict.focus ?? null })
  }
  return { pictures, pending }
}

const candidateOf = ({ slide, pictures }) => ({
  key: slide.key,
  type: slide.type,
  source: slide.source,
  startsAt: startsAtOf(slide),
  endsAt: slide.endsAt ?? null,
  art: {
    title: slide.art.title ?? slide.title,
    image: pictures[0].url,
    images: pictures.map(({ url, identity, focus }) => ({
      url,
      srcset: heroSrcsetOf(url),
      focus,
      identity,
    })),
  },
})

const followUpAtOf = ({ built, nowMs, pendingRetryMs }) => Math.min(
  built.nextBoundaryMs == null ? Infinity : built.nextBoundaryMs + BOUNDARY_SLACK_MS,
  built.pending ? nowMs + pendingRetryMs : Infinity,
)

const stampUrlFrom = (stamps) => {
  const store = createArtworkStamps()
  store.replaceAll(Object.fromEntries(stamps instanceof Map ? stamps : Object.entries(stamps ?? {})))
  return store.stampUrl
}

const imagesByKey = async ({ keys, load }) => {
  const found = {}
  for (const key of keys) {
    const images = await Promise.resolve().then(() => load(key)).catch(() => null)
    if (images?.length) found[key] = images
  }
  return found
}

const uniqueBy = ({ items, keyOf }) => {
  const seen = new Set()
  return items.filter((item) => {
    if (!item) return false
    const key = keyOf(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const withinMs = ({ promise, ms, setTimer, clearTimer }) => new Promise((resolve) => {
  const timer = setTimer(() => resolve(null), ms)
  timer?.unref?.()
  promise.then(
    (value) => {
      clearTimer(timer)
      resolve(value)
    },
    () => {
      clearTimer(timer)
      resolve(null)
    },
  )
})
