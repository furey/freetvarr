import { db, getSetting, setSetting } from './db.js'
import { getGuideSnapshot, getRecordingState } from './epg.js'
import { buildForYou } from './for-you.js'
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
import { showKeyOf } from './web/show-key.js'
import { hiddenShowsOf, profileOf } from './for-you-profile.js'
import { eventRowOf } from './user-events.js'
import { flushUserEvents } from './user-events-log.js'

export const isForYouEnabled = async () => forYouEnabledFrom(await getSetting(SETTINGS.enabled))

export const getForYou = async ({ nowMs = Date.now() } = {}) => {
  await flushUserEvents().catch(() => {})
  const inputs = await loadInputs({ nowMs })
  const signature = signatureOf({ inputs, nowMs })
  if (cached?.signature === signature) return cached.result
  const started = Date.now()
  const result = buildForYou({ ...inputs, nowMs, limit: CACHED_LIMIT })
  result.computeMs = Date.now() - started
  cached = { signature, result }
  return result
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

export const forgetForYouCache = () => { cached = null }

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

export const startForYou = ({ version, delayMs = STARTUP_DELAY_MS }) => {
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
  const result = await genreEnrichment.run({ titles })
  forgetForYouCache()
  return result
}

const afterStartup = async ({ version }) => {
  if (!(await isForYouEnabled())) return
  await probeIfStale({ version })
  runForYouUpkeep({ force: true }).catch((err) => console.warn(`[for-you] upkeep failed: ${err.message}`))
}

const upkeepNow = async ({ nowMs }) => {
  await setSetting(SETTINGS.upkeep, String(nowMs))
  const embeddings = await runEmbeddings({ nowMs }).catch((err) => ({ ok: false, error: err.message }))
  forgetForYouCache()
  const genres = await enrichGenres({ nowMs }).catch((err) => ({ error: err.message }))
  return { embeddings, genres }
}

const loadInputs = async ({ nowMs }) => {
  const [guide, state, events, recordings, watchlist, genresByKey, tier, embedder, pinned, history] = await Promise.all([
    getGuideSnapshot(),
    getRecordingState().catch(() => null),
    db('user_events').orderBy('id'),
    db('recordings').select('recording_id', 'title', 'season', 'episode', 'aired_at', 'imported_at', 'played_at', 'watched_at', 'playback_position_s', 'duration_s', 'channel_id', 'synopsis', 'status'),
    db('watchlist').select('title', 'mode'),
    loadTitleGenres(),
    currentTier(),
    currentEmbedder(),
    pinnedChannelIds(),
    db('guide_programs').where('end', '<=', nowMs).select('program_json').catch(() => []),
  ])
  const vectorsByHash = embedder ? await loadVectors(embedder.id) : null
  const ruleKeys = new Set([
    ...(state?.seriesTags || []).filter((tag) => tag.enabled !== false).map((tag) => showKeyOf(tag.name)),
    ...watchlist.filter((row) => row.mode === 'record').map((row) => showKeyOf(row.title)),
  ])
  const scheduledProgramIds = new Set([
    ...(state?.futureRecordings || []).map((recording) => String(recording.programId)),
    ...(state?.skippedProgramIds || []).map(String),
  ])
  return {
    programmes: Object.values(guide.programsByChannel || {}).flat(),
    history: history.map((row) => JSON.parse(row.program_json)),
    channels: guide.channels || [],
    events,
    recordings,
    scheduledProgramIds,
    ruleKeys,
    genresByKey,
    vectorsByHash,
    pinnedChannelIds: pinned,
    tier: tier.tier,
    stamps: {
      guide: guide.fetchedAt,
      state: state?.fetchedAt ?? null,
      lastEventId: events.at(-1)?.id ?? 0,
      events: events.length,
      recordings: recordingStampOf(recordings),
      watchlist: watchlist.length,
      categories: genresByKey.size,
      vectors: `${embedder?.id}|${vectorsVersion()}|${vectorsByHash?.size ?? 0}`,
      pinned: pinned.join(','),
      tier: tier.tier,
    },
  }
}

const signatureOf = ({ inputs, nowMs }) => JSON.stringify({ ...inputs.stamps, bucket: Math.floor(nowMs / BUCKET_MS) })

const recordingStampOf = (recordings) => [
  recordings.length,
  recordings.filter((row) => row.watched_at).length,
  recordings.reduce((sum, row) => sum + (Number(row.playback_position_s) || 0), 0),
].join(':')

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

let cached = null
let upkeeping = null
const genreEnrichment = createGenreEnrichment()

const CACHED_LIMIT = 20
const HIDING_KINDS = ['not_interested', 'not_interested_undo']
const BUCKET_MS = 5 * 60 * 1000
const STARTUP_DELAY_MS = 20 * 1000
const NIGHT_START = 2
const NIGHT_END = 6
const OVERDUE_MS = 36 * 60 * 60 * 1000
