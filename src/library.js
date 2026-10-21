import path from 'path'

import { db } from './db.js'
import { getRecordingNow } from './recording-now.js'
import { getRecordingState, updateSeriesRule } from './epg.js'
import { refreshLibraryStates } from './library-files.js'
import { MAX_PADDING_MINUTES } from './recording-padding.js'
import { RESUME_END_MARGIN_S } from './playback.js'
import { getSeries } from './series.js'
import { getMoviesRoot } from './sync.js'
import { showKeyOf } from './web/show-key.js'
import { artworkChoices } from './artwork-choices.js'

export const MOVIE_MIN_DURATION_S = 4500
export const EPISODE_STATES = ['in-progress', 'new', 'unwatched']
export const EPISODE_KINDS = ['show', 'movie', 'oneoff']

export const getLibraryShows = async ({
  loadRows = loadLibraryRows,
  loadSeries = getSeries,
  loadRecordingNow = loadActiveRecordings,
  loadMoviesRoot = getMoviesRoot,
  loadChoiceStamps = choiceStampsByKey,
} = {}) => {
  const [rows, seriesData, active, moviesRoot, stamps] = await Promise.all([
    loadRows(),
    loadSeries(),
    loadRecordingNow(),
    loadMoviesRoot().catch(() => ''),
    loadChoiceStamps().catch(() => new Map()),
  ])
  return {
    shows: showSummariesOf({ rows, series: seriesData.series, active, moviesRoot, stamps }),
    stale: Boolean(seriesData.stale || seriesData.error),
  }
}

export const getLibraryShow = async ({
  key,
  resolvePlayable = async () => false,
  loadRows = loadLibraryRows,
  loadSeries = getSeries,
  loadRecordingNow = loadActiveRecordings,
  loadMoviesRoot = getMoviesRoot,
  loadSeriesTags = loadTimedSeriesTags,
  refreshStates = refreshLibraryStates,
  loadChoiceStamps = choiceStampsByKey,
} = {}) => {
  const [rows, seriesData, active, moviesRoot, seriesTags, stamps] = await Promise.all([
    loadRows(),
    loadSeries(),
    loadRecordingNow(),
    loadMoviesRoot().catch(() => ''),
    loadSeriesTags().catch(() => []),
    loadChoiceStamps().catch(() => new Map()),
  ])
  const groupRows = rows.filter((row) => showKeyOf(row.title) === key)
  const series = seriesByKey(seriesData.series).get(key) || null
  if (!groupRows.length && !series) return null
  const checkedRows = await refreshStates(groupRows)
  const playable = await Promise.all(checkedRows.map(async (row) => Boolean(await resolvePlayable(row))))
  return showDetailOf({
    key,
    rows: checkedRows,
    playable,
    series,
    active,
    moviesRoot,
    seriesTags,
    stamps,
  })
}

export const getLibraryEpisodes = async ({
  state,
  limit,
  kind = null,
  loadRows = loadLibraryRows,
  loadMoviesRoot = getMoviesRoot,
  loadChoiceStamps = choiceStampsByKey,
} = {}) => {
  const [rows, moviesRoot, stamps] = await Promise.all([
    loadRows(),
    loadMoviesRoot().catch(() => ''),
    loadChoiceStamps().catch(() => new Map()),
  ])
  return { episodes: libraryEpisodesOf({ rows, state, limit, kind, moviesRoot, stamps }) }
}

export const setRecordingWatched = async ({ recordingId, watched, nowIso = new Date().toISOString() }) => {
  const patch = watched
    ? { watched_at: nowIso, played_at: nowIso }
    : { watched_at: null, playback_position_s: null }
  const n = await db('recordings').where({ recording_id: recordingId }).update(patch)
  if (n === 0) return null
  const row = await db('recordings').where({ recording_id: recordingId }).first()
  return { watched, watched_at: row.watched_at ?? null, playback_position_s: row.playback_position_s ?? null }
}

export const watchedAtAfterPosition = ({ seconds, nowIso = new Date().toISOString() }) => db.raw(
  `CASE WHEN duration_s > 0 AND ? >= duration_s - ${RESUME_END_MARGIN_S} THEN ? ELSE watched_at END`,
  [seconds, nowIso],
)

export const updateShowRule = async ({ key, patch, loadSeries = getSeries, update = updateSeriesRule }) => {
  const series = seriesByKey((await loadSeries()).series).get(key)
  if (!series) return null
  return update({ seriesLinkIds: series.autorecs.map((a) => a.id), patch })
}

export const rulePatchFrom = (body = {}) => {
  const fields = [
    ['episodes_to_keep', 'episodesToKeep', MAX_EPISODES_TO_KEEP],
    ['lead_time', 'leadTime', MAX_PADDING_MINUTES],
    ['lag_time', 'lagTime', MAX_PADDING_MINUTES],
  ]
  const patch = {}
  for (const [name, key, max] of fields) {
    if (body[name] === undefined) continue
    const value = Number(body[name])
    if (!Number.isInteger(value) || value < 0 || value > max) {
      return { error: `${name} must be a whole number from 0 to ${max}` }
    }
    patch[key] = value
  }
  if (!Object.keys(patch).length) return { error: 'send episodes_to_keep, lead_time or lag_time' }
  return { patch }
}

export const isLibraryMember = (row) => row.purged_at == null
  && (['done', 'partial'].includes(row.status) || row.deleted_from_tvh_at == null)

export const isWatched = (row) => row.watched_at != null

export const isFailed = (row) => row.status === 'failed'

export const kindOf = ({ rows, hasRule = false, moviesRoot = '' }) => {
  const hasEpisodeMarks = rows.some((r) => r.show_id != null || r.season != null || r.episode != null)
  if (hasRule || hasEpisodeMarks || rows.length >= 2) return 'show'
  if (moviesRoot && rows.some((r) => isInsideFolder({ filePath: r.file_path, folder: moviesRoot }))) return 'movie'
  if (rows.some(looksLikeUnimportedFilm)) return 'movie'
  return 'oneoff'
}

export const isInsideFolder = ({ filePath, folder }) => {
  if (!filePath || !folder) return false
  const relative = path.relative(path.resolve(folder), path.resolve(filePath))
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
}

export const ruleSummaryOf = ({ paused, anyChannel, channels = [], episodesToKeep, adRemoval }) => [
  paused ? 'Paused' : recordsOnText({ anyChannel, channels }),
  episodesToKeep > 0 ? `keeps the latest ${episodesToKeep}` : 'keeps every episode',
  AD_REMOVAL_TEXT[adRemoval] || '',
].filter(Boolean).join(' · ')

export const seriesByKey = (series = []) => {
  const groups = new Map()
  for (const entry of series) {
    const key = showKeyOf(entry.title)
    groups.set(key, groups.has(key) ? mergeSeries(groups.get(key), entry) : entry)
  }
  return groups
}

export const showSummariesOf = ({ rows, series = [], active = [], moviesRoot = '', stamps = new Map() }) => {
  const rowsByKey = groupBy(rows.filter(isLibraryMember), (row) => showKeyOf(row.title))
  const rules = seriesByKey(series)
  const activeKeys = activeKeysOf(active)
  const keys = new Set([...rowsByKey.keys(), ...rules.keys()])
  return [...keys]
    .map((key) => showSummaryOf({
      key,
      rows: rowsByKey.get(key) || [],
      series: rules.get(key) || null,
      recordingNow: activeKeys.has(key),
      moviesRoot,
      stamps: stamps.get(key),
    }))
    .sort((a, b) => (b.latestAt ?? -Infinity) - (a.latestAt ?? -Infinity) || a.title.localeCompare(b.title))
}

export const showDetailOf = ({
  key, rows, playable = [], series, active = [], moviesRoot = '', seriesTags = [], stamps = new Map(),
}) => {
  const members = rows.map((row, i) => ({ row, playable: Boolean(playable[i]) })).filter(({ row }) => isLibraryMember(row))
  const summary = showSummaryOf({
    key,
    rows: members.map(({ row }) => row),
    series,
    recordingNow: activeKeysOf(active).has(key),
    moviesRoot,
    stamps: stamps.get(key),
  })
  const episodes = members.map(({ row, playable: canPlay }) => episodeOf({ row, playable: canPlay }))
  const { counts, latest, latestAt, ...shown } = summary
  return {
    ...shown,
    counts,
    rule: series ? { ...summary.rule, ...ruleDetailOf({ series, seriesTags }) } : null,
    seasons: seasonsOf(episodes),
    resumeNext: resumeNextOf(episodes),
  }
}

export const episodeOf = ({ row, playable = false }) => {
  const watched = isWatched(row)
  const positionS = row.playback_position_s ?? null
  return {
    recordingId: row.recording_id,
    title: row.title,
    episodeTitle: row.episode_title ?? null,
    season: row.season ?? null,
    episode: row.episode ?? null,
    airedAt: numberOrNull(row.aired_at),
    durationS: row.duration_s ?? null,
    synopsis: row.synopsis ?? null,
    channelId: row.channel_id ?? null,
    channelName: row.channel_name ?? null,
    classification: row.classification ?? null,
    image: recordingImageOf(row),
    status: row.status,
    libraryState: row.library_state ?? null,
    deletedFromTvhAt: row.deleted_from_tvh_at ?? null,
    filePath: row.file_path ?? null,
    failed: isFailed(row),
    error: row.error ?? null,
    playable,
    positionS,
    playedAt: row.played_at ?? null,
    watched,
    watchedPercent: watched ? 100 : percentOf({ position: positionS, duration: row.duration_s }),
    new: row.played_at == null && !watched,
  }
}

export const seasonsOf = (episodes) => {
  const bySeason = groupBy(episodes, (e) => e.season ?? null)
  return [...bySeason.entries()]
    .sort(([a], [b]) => compareMissingLast(a, b, (x, y) => y - x))
    .map(([season, list]) => ({ season, episodes: [...list].sort(newestEpisodeFirst) }))
}

export const resumeNextOf = (episodes) => {
  const playable = episodes.filter((e) => e.playable && !e.failed)
  const inProgress = playable
    .filter((e) => !e.watched && e.positionS > 0)
    .sort((a, b) => timeOf(b.playedAt) - timeOf(a.playedAt))[0]
  if (inProgress) return { recordingId: inProgress.recordingId, positionS: inProgress.positionS }
  const oldestUnwatched = playable
    .filter((e) => !e.watched)
    .sort((a, b) => -newestEpisodeFirst(a, b))[0]
  return oldestUnwatched ? { recordingId: oldestUnwatched.recordingId, positionS: 0 } : null
}

export const libraryEpisodesOf = ({
  rows, state = 'unwatched', limit = DEFAULT_EPISODE_LIMIT, kind = null, moviesRoot = '', stamps = new Map(),
}) => {
  const libraryRows = rows.filter(isLibraryMember)
  const kinds = kindsByKey({ rows: libraryRows, moviesRoot })
  const isWantedKind = (row) => !kind || (kinds.get(showKeyOf(row.title)) || 'oneoff') === kind
  const members = libraryRows.filter((row) => !isFailed(row) && !isWatched(row) && isWantedKind(row))
  const chosen = {
    'in-progress': () => members
      .filter((row) => row.playback_position_s > 0)
      .sort((a, b) => timeOf(b.played_at) - timeOf(a.played_at)),
    new: () => members.filter((row) => row.played_at == null).sort(newestAiredFirst),
    unwatched: () => [...members].sort(newestAiredFirst),
  }[state]?.() ?? []
  return chosen.slice(0, limit).map((row) => libraryEpisodeOf({
    row,
    kind: kinds.get(showKeyOf(row.title)),
    stamps: stamps.get(showKeyOf(row.title)),
  }))
}

export const episodeLimitFrom = (value) => {
  const limit = Number(value ?? DEFAULT_EPISODE_LIMIT)
  return Number.isInteger(limit) && limit >= 1 && limit <= MAX_EPISODE_LIMIT ? limit : null
}

const showSummaryOf = ({ key, rows, series, recordingNow, moviesRoot, stamps = NO_STAMPS }) => {
  const newestFirst = [...rows].sort(newestAiredFirst)
  const latestRow = newestFirst[0] || null
  const title = latestRow?.title || series?.title || key
  const watchable = rows.filter((row) => !isFailed(row))
  const latestAiredAt = latestRow ? airedMsOf(latestRow) : null
  const kind = kindOf({ rows, hasRule: Boolean(series), moviesRoot })
  return {
    key,
    title,
    kind,
    classification: newestFirst.find((row) => row.classification)?.classification ?? null,
    year: kind === 'movie' ? newestFirst.find((row) => row.year)?.year ?? null : null,
    poster: `/api/epg/show-image?title=${encodeURIComponent(title)}&shape=poster${stampParamOf(stamps.poster)}`,
    image: chosenBackgroundOf({ title, stamp: stamps.background }) || newestFirst.map(recordingImageOf).find(Boolean) || null,
    artworkStamps: { background: stamps.background ?? null, poster: stamps.poster ?? null },
    counts: {
      total: rows.length,
      new: watchable.filter((row) => row.played_at == null && !isWatched(row)).length,
      unwatched: watchable.filter((row) => !isWatched(row)).length,
      failed: rows.filter(isFailed).length,
    },
    recordingNow,
    nextAiring: series?.nextAiring ?? null,
    rule: series ? ruleOf(series) : null,
    latest: latestRow ? latestOf(latestRow) : null,
    latestAt: latestAiredAt ?? series?.nextAiring?.startDate ?? null,
  }
}

const ruleOf = (series) => {
  const anyChannel = series.autorecs.some((a) => a.anyChannel)
  const channels = unique(series.autorecs.filter((a) => !a.anyChannel).map((a) => a.channelName).filter(Boolean))
  const paused = !series.recording
  const episodesToKeep = series.episodesToKeep || 0
  const adRemoval = series.folder?.ad_removal || 'off'
  return {
    recording: Boolean(series.recording),
    paused,
    channels,
    anyChannel,
    episodesToKeep,
    adRemoval,
    folderId: series.folder?.id ?? null,
    summary: ruleSummaryOf({ paused, anyChannel, channels, episodesToKeep, adRemoval }),
  }
}

const ruleDetailOf = ({ series, seriesTags }) => {
  const tagsById = new Map(seriesTags.map((tag) => [String(tag.id), tag]))
  return {
    autorecs: series.autorecs.map((a) => ({
      ...a,
      leadTime: tagsById.get(String(a.id))?.leadTime ?? null,
      lagTime: tagsById.get(String(a.id))?.lagTime ?? null,
    })),
    folder: series.folder ?? null,
    savesTo: series.savesTo ?? null,
  }
}

const latestOf = (row) => ({
  recordingId: row.recording_id,
  episodeTitle: row.episode_title ?? null,
  season: row.season ?? null,
  episode: row.episode ?? null,
  airedAt: numberOrNull(row.aired_at),
  durationS: row.duration_s ?? null,
  channelName: row.channel_name ?? null,
  watched: isWatched(row),
  positionS: row.playback_position_s ?? null,
})

const libraryEpisodeOf = ({ row, kind, stamps = NO_STAMPS }) => {
  const episode = episodeOf({ row })
  const chosenImage = chosenBackgroundOf({ title: row.title, stamp: stamps.background })
  return {
    recordingId: episode.recordingId,
    showKey: showKeyOf(row.title),
    title: episode.title,
    episodeTitle: episode.episodeTitle,
    season: episode.season,
    episode: episode.episode,
    airedAt: episode.airedAt,
    durationS: episode.durationS,
    synopsis: episode.synopsis,
    channelId: episode.channelId,
    channelName: episode.channelName,
    classification: episode.classification,
    image: chosenImage || episode.image,
    artChosen: Boolean(chosenImage),
    positionS: episode.positionS,
    playedAt: episode.playedAt,
    watchedPercent: episode.watchedPercent,
    kind: kind || 'oneoff',
  }
}

const kindsByKey = ({ rows, moviesRoot }) => new Map(
  [...groupBy(rows, (row) => showKeyOf(row.title)).entries()]
    .map(([key, group]) => [key, kindOf({ rows: group, moviesRoot })]),
)

const mergeSeries = (a, b) => ({
  ...a,
  recording: a.recording || b.recording,
  episodesToKeep: Math.max(a.episodesToKeep || 0, b.episodesToKeep || 0),
  autorecs: [...a.autorecs, ...b.autorecs],
  nextAiring: earliestAiring(a.nextAiring, b.nextAiring),
  folder: a.folder || b.folder,
  savesTo: a.folder ? a.savesTo : b.savesTo,
})

const earliestAiring = (a, b) => {
  if (!a || !b) return a || b || null
  return a.startDate <= b.startDate ? a : b
}

const recordsOnText = ({ anyChannel, channels }) => {
  if (anyChannel) return 'Records every new episode on any channel'
  if (!channels.length) return 'Records every new episode'
  return `Records every new episode on ${listText(channels)}`
}

const listText = (items) => (items.length < 2
  ? items.join('')
  : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`)

const activeKeysOf = (active = []) => new Set(active.filter((r) => !r.failed).map((r) => showKeyOf(r.title)))

const looksLikeUnimportedFilm = (row) => !['done', 'partial'].includes(row.status)
  && row.season == null && row.episode == null && Number(row.duration_s) >= MOVIE_MIN_DURATION_S

const chosenBackgroundOf = ({ title, stamp }) => (stamp
  ? `/api/epg/show-image?title=${encodeURIComponent(title)}&w=${CARD_IMAGE_WIDTH}${stampParamOf(stamp)}`
  : null)

const stampParamOf = (stamp) => (stamp ? `&c=${stamp}` : '')

const choiceStampsByKey = () => artworkChoices.stampsByKey()

const recordingImageOf = (row) => (row.image_path
  ? `/api/recordings/${encodeURIComponent(row.recording_id)}/image?w=${CARD_IMAGE_WIDTH}`
  : null)

const percentOf = ({ position, duration }) => {
  const total = Number(duration)
  if (!Number.isFinite(total) || total <= 0 || !position) return 0
  return Math.min(100, Math.max(0, Math.round((Number(position) / total) * 100)))
}

const newestEpisodeFirst = (a, b) => compareMissingLast(a.episode, b.episode, (x, y) => y - x)
  || (b.airedAt ?? 0) - (a.airedAt ?? 0)

const newestAiredFirst = (a, b) => (airedMsOf(b) ?? 0) - (airedMsOf(a) ?? 0)

const airedMsOf = (row) => numberOrNull(row.aired_at) ?? (row.imported_at ? timeOf(row.imported_at) : null)

const compareMissingLast = (a, b, compare) => {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return compare(a, b)
}

const timeOf = (stamp) => {
  if (stamp == null) return 0
  const text = String(stamp)
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? `${text.replace(' ', 'T')}Z` : text
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : 0
}

const numberOrNull = (value) => {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const groupBy = (items, keyOf) => {
  const groups = new Map()
  for (const item of items) {
    const key = keyOf(item)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  return groups
}

const unique = (items) => [...new Set(items)]

const loadLibraryRows = () => db('recordings')
  .whereNull('purged_at')
  .where((q) => q.whereIn('status', ['done', 'partial']).orWhereNull('deleted_from_tvh_at'))

const loadActiveRecordings = async () => (await getRecordingNow().catch(() => ({ active: [] }))).active || []

const loadTimedSeriesTags = async () => (await getRecordingState()).seriesTags || []

const AD_REMOVAL_TEXT = { cut: 'ads removed', detect: 'ad breaks marked' }
const MAX_EPISODES_TO_KEEP = 999
const DEFAULT_EPISODE_LIMIT = 20
const MAX_EPISODE_LIMIT = 50
const CARD_IMAGE_WIDTH = 384
const NO_STAMPS = {}
