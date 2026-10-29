import { showKeyOf } from './web/show-key.js'

export const nextScheduledByKey = ({ upcoming = [], activeProgramIds = [], nowMs = Date.now() }) => {
  const active = new Set(activeProgramIds.map(String))
  const next = new Map()
  for (const entry of upcoming) {
    if (!entry?.name || entry.startDate <= nowMs || active.has(String(entry.programId))) continue
    const key = showKeyOf(entry.name)
    if (!next.has(key) || entry.startDate < next.get(key).startDate) next.set(key, entry)
  }
  return next
}

export const scheduledEpisodeOf = (entry) => ({
  recordingId: `${SCHEDULED_ID_PREFIX}${entry.programId}`,
  title: entry.name,
  episodeTitle: entry.episodeTitle ?? null,
  season: entry.season ?? entry.seriesNo ?? null,
  episode: entry.episodeNo ?? null,
  airedAt: entry.startDate,
  durationS: Math.max(0, Math.round((entry.endDate - entry.startDate) / 1000)) || null,
  synopsis: entry.synopsis ?? null,
  channelId: entry.channelId ?? null,
  channelName: entry.channelName ?? null,
  classification: entry.classification ?? null,
  image: entry.hasImage ? `/api/epg/image/${encodeURIComponent(entry.programId)}?w=${CARD_IMAGE_WIDTH}` : null,
  status: 'scheduled',
  libraryState: null,
  deletedFromTvhAt: null,
  filePath: null,
  failed: false,
  error: null,
  playable: false,
  positionS: null,
  playedAt: null,
  watched: false,
  watchedPercent: 0,
  new: false,
  ads: null,
  inProgress: null,
  scheduled: scheduledFieldsOf(entry),
})

export const scheduledAiringOf = (entry) => ({
  programId: entry.programId,
  startDate: entry.startDate,
  endDate: entry.endDate,
  episodeTitle: entry.episodeTitle ?? null,
  channelId: entry.channelId ?? null,
  channelName: entry.channelName ?? null,
  season: entry.season ?? null,
  synopsis: entry.synopsis ?? null,
  classification: entry.classification ?? null,
})

export const scheduledKindOf = (entry) => {
  if (entry.kind === 'movie') return 'movie'
  return entry.seriesLinkId ? 'show' : 'oneoff'
}

const scheduledFieldsOf = (entry) => ({
  programId: entry.programId,
  epgProgramId: entry.epgProgramId ?? null,
  name: entry.name,
  channelId: entry.channelId ?? null,
  channelName: entry.channelName ?? null,
  startDate: entry.startDate,
  endDate: entry.endDate,
  episodeTitle: entry.episodeTitle ?? null,
  description: entry.synopsis ?? null,
  seriesLinkId: entry.seriesLinkId ?? null,
  seriesNo: entry.seriesNo ?? entry.season ?? null,
  episodeNo: entry.episodeNo ?? null,
  hasImage: Boolean(entry.hasImage),
  source: entry.source ?? null,
})

const SCHEDULED_ID_PREFIX = 'scheduled-'
const CARD_IMAGE_WIDTH = 384
