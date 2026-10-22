import crypto from 'node:crypto'
import { Worker } from 'node:worker_threads'

import { db, getSetting, setSetting } from './db.js'
import { getChannelPrefs, getGuideSnapshot, getRecordingState, onGuideLoaded } from './epg.js'
import { buildForYouFromRequest } from './for-you-worker.js'
import { createClassificationLookup, createClassificationStore } from './classification-labels.js'
import { pickableShowsOf } from './for-you-pickable.js'
import {
  SETTINGS,
  currentEmbedder,
  currentTier,
  forYouEnabledFrom,
  loadVectors,
  probeIfStale,
  runEmbeddings,
  vectorsVersion,
} from './for-you-engine.js'
import { createGenreEnrichment, isMovieLike, loadTitleGenres, yearOf } from './genre-enrichment.js'
import { rememberKnownAsFromTvmaze, rememberKnownAsFromWikidata } from './search-aliases.js'
import { showKeyOf } from './web/show-key.js'
import { showTitleKey } from './show-artwork.js'
import { FILM_RATINGS_PREFIX, filmFactsByKeyOf, filmFactsForTitlesOf, otherLanguageChoiceFrom } from './top-rated.js'
import { hiddenShowsOf, profileOf } from './for-you-profile.js'
import { eventRowOf } from './user-events.js'
import { flushUserEvents } from './user-events-log.js'

const SAVED_RESULT_SETTING = 'for_you_saved_result'
const SAVED_RESULT_MAX_AGE_MS = 24 * 60 * 60 * 1000
export const SCORING_VERSION = 4

export const isForYouEnabled = async () => forYouEnabledFrom(await getSetting(SETTINGS.enabled))

export const getForYou = async ({ nowMs = Date.now() } = {}) => {
  await flushUserEvents().catch(() => {})
  return forYouCache.get({ nowMs })
}

export const warmForYou = async ({ nowMs = Date.now() } = {}) => {
  if (!(await isForYouEnabled())) return null
  return forYouCache.warm({ nowMs })
}

export const onForYouResult = (listener) => {
  forYouResultListeners.add(listener)
  return () => forYouResultListeners.delete(listener)
}

export const createForYouCache = ({ loadSnapshot, compute, onRefreshError = logRefreshError, store = null, onResult = () => {} }) => {
  let cached = null
  let computing = null
  let generation = 0
  let restored = false

  const restore = async () => {
    if (restored || !store) return
    restored = true
    const saved = await store.load().catch(() => null)
    if (saved && !cached) cached = { signature: null, result: saved }
  }

  const computeFor = ({ snapshot, signature, nowMs }) => {
    if (computing?.signature === signature && computing.generation === generation) return computing.promise
    const startedIn = generation
    const promise = compute({ snapshot, nowMs })
      .then((result) => {
        if (startedIn === generation) cached = { signature, result }
        store?.save(result).catch(() => {})
        Promise.resolve().then(() => onResult(result)).catch(() => {})
        return result
      })
      .finally(() => {
        if (computing?.promise === promise) computing = null
      })
    computing = { signature, generation, promise }
    return promise
  }

  let refreshing = null
  const refreshInBackground = ({ nowMs }) => {
    refreshing ??= loadSnapshot({ nowMs })
      .then((snapshot) => computeFor({ snapshot, signature: forYouSignatureOf({ stamps: snapshot.stamps, nowMs }), nowMs }))
      .catch(onRefreshError)
      .finally(() => { refreshing = null })
    return refreshing
  }

  const get = async ({ nowMs }) => {
    await restore()
    if (cached && cached.signature === null) {
      refreshInBackground({ nowMs })
      return cached.result
    }
    const snapshot = await loadSnapshot({ nowMs })
    const signature = forYouSignatureOf({ stamps: snapshot.stamps, nowMs })
    if (cached?.signature === signature) return cached.result
    if (!cached) return computeFor({ snapshot, signature, nowMs })
    if (!computing) computeFor({ snapshot, signature, nowMs }).catch(onRefreshError)
    return cached.result
  }

  const warm = async ({ nowMs }) => {
    await restore()
    if (cached || computing) return null
    return refreshInBackground({ nowMs })
  }

  const forget = () => {
    cached = null
    generation += 1
  }

  return { get, warm, forget }
}

export const forYouSignatureOf = ({ stamps, nowMs }) => JSON.stringify({ ...stamps, bucket: Math.floor(nowMs / BUCKET_MS) })

export const snapshotStampsOf = ({ guide, state, watchlist, events, recordings, categories, embedderId, vectors, pinned, tier, filmRatings = null, otherLanguageFilms = 'few', channelPrefs = null }) => {
  const autorecs = (state?.seriesTags || []).map(({ seriesLinkId, channelId, enabled, match }) => ({ seriesLinkId, channelId, enabled, match }))
  const ruleKeys = new Set([
    ...(state?.seriesTags || []).filter((tag) => tag.enabled !== false).map((tag) => showKeyOf(tag.name)),
    ...watchlist.filter((row) => row.mode === 'record').map((row) => showKeyOf(row.title)),
  ])
  const scheduledProgramIds = new Set([
    ...(state?.futureRecordings || []).map((recording) => String(recording.programId)),
    ...(state?.skippedProgramIds || []).map(String),
    ...(state?.repeatRecordings || []).map((recording) => String(recording.programId)),
  ])
  return {
    ruleKeys,
    scheduledProgramIds,
    autorecs,
    channelPrefs,
    stamps: {
      guide: guideVersionOf(guide),
      scheduled: hashOf([...scheduledProgramIds].sort().join(',')),
      rules: hashOf([...ruleKeys].sort().join(',')),
      autorecs: hashOf(JSON.stringify(autorecs)),
      channels: hashOf(JSON.stringify(channelPrefs)),
      lastEventId: Number(events?.lastId) || 0,
      events: Number(events?.count) || 0,
      recordings: recordingStampOf(recordings),
      categories: Number(categories?.count) || 0,
      vectors: `${embedderId}|${vectors}`,
      pinned: pinned.join(','),
      tier,
      filmRatings: `${Number(filmRatings?.count) || 0}:${Number(filmRatings?.latest) || 0}`,
      otherLanguageFilms,
      scoring: SCORING_VERSION,
    },
  }
}

export const guideVersionOf = (guide) => {
  if (!guide) return null
  if (!guideVersions.has(guide)) {
    guideVersions.set(guide, hashOf(JSON.stringify([guide.channels || [], guide.programsByChannel || {}])))
  }
  return guideVersions.get(guide)
}

export const getPickable = async ({ nowMs = Date.now() } = {}) => {
  const [guide, genresByKey] = await Promise.all([getGuideSnapshot(), loadTitleGenres()])
  return pickableShowsOf({
    programmes: Object.values(guide.programsByChannel || {}).flat(),
    genresByKey,
    pinnedChannelIds: await pinnedChannelIds(),
    nowMs,
  })
}

export const titlesForKeys = async (keys) => {
  const guide = await getGuideSnapshot().catch(() => null)
  const titles = new Map()
  for (const programme of Object.values(guide?.programsByChannel || {}).flat()) {
    const key = showKeyOf(programme.title)
    if (keys.includes(key) && !titles.has(key)) titles.set(key, programme.title)
  }
  return titles
}

export const forgetForYouCache = () => forYouCache.forget()

export const getHiddenShows = async ({ nowMs = Date.now() } = {}) => {
  await flushUserEvents().catch(() => {})
  const events = await db('user_events').whereIn('kind', HIDING_KINDS).orderBy('ts')
  return hiddenShowsOf({ profile: profileOf({ events, nowMs }), nowMs })
}

export const unhideShow = async ({ seriesKey, nowMs = Date.now() }) => {
  await flushUserEvents().catch(() => {})
  const latest = await db('user_events').where({ kind: 'not_interested', series_key: seriesKey }).orderBy('ts', 'desc').first()
  await db('user_events').insert(eventRowOf({
    event: { kind: 'not_interested_undo', series_key: seriesKey, title: latest?.title ?? null, source: 'for-you', ts: Math.max(nowMs, (latest?.ts ?? 0) + 1) },
    nowMs,
  }))
  forgetForYouCache()
  return { ok: true, wasHidden: Boolean(latest) }
}

export const startForYou = ({ version, delayMs = STARTUP_DELAY_MS, warmDelayMs = WARM_DELAY_MS }) => {
  onGuideLoaded(() => warmForYou().catch((err) => console.warn(`[for-you] guide warm-up failed: ${err.message}`)))
  const warm = setTimeout(() => {
    isForYouEnabled()
      .then((enabled) => enabled && getForYou())
      .catch((err) => console.warn(`[for-you] warm-up failed: ${err.message}`))
  }, warmDelayMs)
  warm.unref?.()
  const timer = setTimeout(() => {
    afterStartup({ version }).catch((err) => console.warn(`[for-you] startup check failed: ${err.message}`))
  }, delayMs)
  timer.unref?.()
}

export const runForYouUpkeep = async ({ nowMs = Date.now(), force = false } = {}) => {
  if (upkeeping) return upkeeping
  if (!(await isForYouEnabled())) return { skipped: true }
  const last = Number(await getSetting(SETTINGS.upkeep)) || 0
  if (!force && !isUpkeepDue({ last, nowMs })) return { skipped: true }
  upkeeping = upkeepNow({ nowMs }).finally(() => { upkeeping = null })
  return upkeeping
}

export const isUpkeepDue = ({ last, nowMs, nightStart = NIGHT_START, nightEnd = NIGHT_END }) => {
  if (!last) return true
  if (nowMs - last > OVERDUE_MS) return true
  const hour = new Date(nowMs).getHours()
  const sameDay = new Date(last).toDateString() === new Date(nowMs).toDateString()
  return hour >= nightStart && hour < nightEnd && !sameDay
}

export const enrichGenres = async ({ nowMs = Date.now() } = {}) => {
  const [guideRows, recordings, events, pinned] = await Promise.all([
    db('guide_programs').where('end', '>', nowMs).select('program_json'),
    db('recordings').select('title'),
    db('user_events').whereNotNull('title').distinct('title'),
    pinnedChannelIds(),
  ])
  const pinnedSet = new Set(pinned)
  const titles = [
    ...recordings.map((row) => ({ title: row.title, priority: 3 })),
    ...events.map((row) => ({ title: row.title, priority: 3 })),
    ...guideRows.map((row) => JSON.parse(row.program_json)).map((programme) => ({
      title: programme.title,
      movie: isMovieLike(programme),
      year: yearOf(programme),
      priority: (pinnedSet.has(String(programme.channel_id)) ? 1 : 0) + (isPrimeTime(programme.start) ? 1 : 0),
    })),
  ]
  return genreEnrichment.run({ titles })
}

const afterStartup = async ({ version }) => {
  if (!(await isForYouEnabled())) return
  await probeIfStale({ version })
  runForYouUpkeep({ force: true }).catch((err) => console.warn(`[for-you] upkeep failed: ${err.message}`))
}

const upkeepNow = async ({ nowMs }) => {
  await setSetting(SETTINGS.upkeep, String(nowMs))
  const embeddings = await runEmbeddings({ nowMs }).catch((err) => ({ ok: false, error: err.message }))
  const genres = await enrichGenres({ nowMs }).catch((err) => ({ error: err.message }))
  return { embeddings, genres }
}

const loadSnapshot = async () => {
  const [guide, state, watchlist, events, recordings, categories, tier, embedder, pinned, filmRatings, otherLanguageFilms, channelPrefs] = await Promise.all([
    getGuideSnapshot(),
    getRecordingState().catch(() => null),
    db('watchlist').select('title', 'mode'),
    db('user_events').first(db.raw('count(*) as count'), db.raw('max(id) as lastId')),
    db('recordings').first(...RECORDING_STAMP_COLUMNS.map((column) => db.raw(column))),
    db('title_genres').first(db.raw('count(*) as count')).catch(() => null),
    currentTier(),
    currentEmbedder(),
    pinnedChannelIds(),
    filmRatingRows().first(db.raw('count(*) as count'), db.raw('max(expires_at) as latest')).catch(() => null),
    currentOtherLanguageFilms(),
    getChannelPrefs().catch(() => null),
  ])
  const vectors = vectorsVersion()
  return {
    guide,
    embedder,
    pinned,
    tier: tier.tier,
    vectors,
    otherLanguageFilms,
    ...snapshotStampsOf({ guide, state, watchlist, events, recordings, categories, embedderId: embedder?.id, vectors, pinned, tier: tier.tier, filmRatings, otherLanguageFilms, channelPrefs }),
  }
}

const computeForYou = async ({ snapshot, nowMs }) => {
  const [events, recordings, genresByKey, history, vectorsByHash, filmRatings] = await Promise.all([
    db('user_events').orderBy('id'),
    db('recordings').select('recording_id', 'title', 'season', 'episode', 'aired_at', 'imported_at', 'played_at', 'watched_at', 'playback_position_s', 'duration_s', 'channel_id', 'synopsis', 'status'),
    loadTitleGenres(),
    db('guide_programs').where('end', '<=', nowMs).select('program_json').catch(() => []),
    snapshot.embedder ? loadVectors(snapshot.embedder.id) : null,
    filmRatingRows().select('lookup_key', 'found_json').catch(() => []),
  ])
  const guide = {
    programmes: Object.values(snapshot.guide.programsByChannel || {}).flat(),
    channels: snapshot.guide.channels || [],
  }
  const request = {
    guideVersion: snapshot.stamps.guide,
    vectorsKey: `${snapshot.embedder?.id}|${snapshot.vectors}`,
    inputs: {
      nowMs,
      limit: CACHED_LIMIT,
      history: history.map((row) => row.program_json),
      events,
      recordings,
      scheduledProgramIds: snapshot.scheduledProgramIds,
      ruleKeys: snapshot.ruleKeys,
      autorecs: snapshot.autorecs,
      channelPrefs: snapshot.channelPrefs,
      genresByKey,
      pinnedChannelIds: snapshot.pinned,
      tier: snapshot.tier,
      filmFacts: filmFactsForTitlesOf({
        titles: new Set(guide.programmes.map((programme) => programme.title)),
        factsByKey: filmFactsByKeyOf(filmRatings),
        keyOf: showTitleKey,
      }),
      otherLanguageFilms: snapshot.otherLanguageFilms,
    },
  }
  const started = Date.now()
  const built = await forYouWorker.build({ guide, vectorsByHash, request })
    .catch(() => buildForYouFromRequest({ guide, vectorsByHash, request }))
  const result = await withClassifications({ result: built.result, programmes: guide.programmes })
  result.computeMs = Date.now() - started
  return withLazyExplanations({ result, explanationsJson: built.explanationsJson })
}

export const createForYouWorker = ({ url, timeoutMs } = {}) => {
  const pending = new Map()
  let worker = null
  let sent = {}
  let nextId = 0

  const settle = ({ id, error, ...reply }) => {
    const waiter = pending.get(id)
    pending.delete(id)
    clearTimeout(waiter?.timer)
    if (!pending.size) worker?.unref()
    if (error) sent = {}
    if (error) waiter?.reject(new Error(error))
    else waiter?.resolve(reply)
  }

  const stop = (err) => {
    worker = null
    sent = {}
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer)
      waiter.reject(err)
    }
    pending.clear()
  }

  const start = () => {
    const started = new Worker(url ?? WORKER_URL)
    started.on('message', settle)
    started.on('error', stop)
    started.on('exit', () => {
      if (worker === started) stop(new Error('For you worker stopped'))
    })
    worker = started
    sent = {}
    return started
  }

  const build = async ({ guide, vectorsByHash, request }) => {
    const target = worker ?? start()
    const message = {
      ...request,
      ...(sent.guideVersion !== request.guideVersion && { guide }),
      ...(sent.vectorsKey !== request.vectorsKey && { vectorsByHash }),
    }
    sent = { guideVersion: request.guideVersion, vectorsKey: request.vectorsKey }
    const id = ++nextId
    target.ref()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => settle({ id, error: 'For you worker timed out' }), timeoutMs ?? WORKER_TIMEOUT_MS)
      pending.set(id, { resolve, reject, timer })
      target.postMessage({ id, request: message })
    })
  }

  const close = () => worker?.terminate()

  return { build, close }
}

export const createSavedResultStore = ({ read = getSetting, write = setSetting, now = Date.now, maxAgeMs = SAVED_RESULT_MAX_AGE_MS, scoring = SCORING_VERSION } = {}) => ({
  load: async () => {
    const saved = JSON.parse((await read(SAVED_RESULT_SETTING)) || 'null')
    if (!saved?.result || !(now() - saved.savedAt < maxAgeMs) || saved.scoring !== scoring) return null
    return withLazyExplanations({ result: saved.result, explanationsJson: saved.explanationsJson || '[]' })
  },
  save: (result) => write(SAVED_RESULT_SETTING, JSON.stringify({
    savedAt: now(),
    scoring,
    result,
    explanationsJson: JSON.stringify([...(result.explanations || new Map())]),
  })),
})

const withLazyExplanations = ({ result, explanationsJson }) => {
  let explanations = null
  return Object.defineProperty(result, 'explanations', {
    get: () => {
      explanations ??= new Map(JSON.parse(explanationsJson))
      return explanations
    },
  })
}

const hashOf = (text) => crypto.createHash('sha1').update(text).digest('hex')

const logRefreshError = (err) => console.warn(`[for-you] refresh failed: ${err.message}`)

export const withClassifications = async ({ result, programmes, store = classificationStore }) => {
  const items = [result.topPick, ...result.sections.flatMap((section) => section.items)].filter(Boolean)
  const wanted = new Set(items.map((item) => item.programmeKey))
  const ratingByKey = new Map(programmes
    .map((programme) => [`${programme.channel_id}:${programme.start}`, programme.rating])
    .filter(([key]) => wanted.has(key)))
  const sourceOf = (item) => ({ title: item.title, start: item.start, rating: ratingByKey.get(item.programmeKey) })
  const classificationOf = await createClassificationLookup({ programmes: items.map(sourceOf), store })
  const classified = (item) => item && { ...item, classification: classificationOf(sourceOf(item)) }
  return {
    ...result,
    topPick: classified(result.topPick),
    sections: result.sections.map((section) => ({ ...section, items: section.items.map(classified) })),
  }
}

export const currentOtherLanguageFilms = async () => otherLanguageChoiceFrom(await getSetting(SETTINGS.otherLanguageFilms).catch(() => null))

const filmRatingRows = () => db('programme_ratings').where('lookup_key', 'like', `${FILM_RATINGS_PREFIX}%`).whereNot('found_json', 'null')

const recordingStampOf = (recordings) => RECORDING_STAMP_FIELDS.map((field) => recordings?.[field] ?? '').join(':')

const pinnedChannelIds = async () => {
  try {
    const ids = JSON.parse((await getSetting('epg_pinned_channels')) || '[]')
    return Array.isArray(ids) ? ids.map(String) : []
  } catch {
    return []
  }
}

const isPrimeTime = (ms) => {
  const hour = new Date(Number(ms)).getHours()
  return hour >= 18 && hour < 22
}

let upkeeping = null
const guideVersions = new WeakMap()
const forYouWorker = createForYouWorker()
const forYouResultListeners = new Set()
const forYouCache = createForYouCache({
  loadSnapshot,
  compute: computeForYou,
  store: createSavedResultStore(),
  onResult: (result) => forYouResultListeners.forEach((listener) => listener(result)),
})
const classificationStore = createClassificationStore()
const genreEnrichment = createGenreEnrichment({ onTvmazeShow: rememberKnownAsFromTvmaze, onFilm: rememberKnownAsFromWikidata })

const CACHED_LIMIT = 20
const WORKER_URL = new URL('./for-you-worker.js', import.meta.url)
const WORKER_TIMEOUT_MS = 60 * 1000
const RECORDING_STAMP_FIELDS = ['count', 'watched', 'position', 'imported', 'played', 'watchedAt', 'aired']
const RECORDING_STAMP_COLUMNS = [
  'count(*) as count',
  'count(watched_at) as watched',
  'total(playback_position_s) as position',
  'max(imported_at) as imported',
  'max(played_at) as played',
  'max(watched_at) as watchedAt',
  'max(aired_at) as aired',
]
const HIDING_KINDS = ['not_interested', 'not_interested_undo']
const BUCKET_MS = 5 * 60 * 1000
const STARTUP_DELAY_MS = 20 * 1000
const WARM_DELAY_MS = 3 * 1000
const NIGHT_START = 2
const NIGHT_END = 6
const OVERDUE_MS = 36 * 60 * 60 * 1000
