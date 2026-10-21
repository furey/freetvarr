import { isPlaceholderEpisodeTitle } from './web/scheduled-groups.js'

export const dvrAiringsOf = ({ upcoming = [], pastAirings = [] }) => {
  const finished = pastAirings.filter((entry) => !entry.failed && !entry.removed)
  return [
    ...upcoming.map((entry) => ({ entry, status: upcomingStatusOf(entry) })),
    ...finished.map((entry) => ({ entry, status: 'recorded' })),
    ...pastAirings
      .filter((entry) => entry.removed)
      .map((entry) => ({ entry, status: removedStatusOf({ entry, finished }) })),
  ]
}

export const dvrAiringMatchOf = ({ programme, tag, airings = [] }) => {
  const best = airings
    .filter(({ entry }) => String(entry.programId) !== String(programme.program_id))
    .filter(({ entry }) => belongsToRule({ entry, tag, programme }))
    .filter(({ entry }) => isSameEpisode({ programme, entry }))
    .sort(byStatusThenLatest)[0]
  if (!best) return null
  return { status: best.status, startDate: best.entry.startDate, channelName: best.entry.channelName || null }
}

export const isSameEpisode = ({ programme, entry }) => {
  if (programme.episode_uri && programme.episode_uri === entry.episodeUri) return true
  const programmeNumbered = programme.series_no != null && programme.episode_no != null
  const entryNumbered = entry.season != null && entry.episode != null
  if (programmeNumbered && entryNumbered) {
    return Number(programme.series_no) === Number(entry.season) && Number(programme.episode_no) === Number(entry.episode)
  }
  return hasRealSubtitle(programme.episode_title)
    && textKey(programme.title) === textKey(entry.name)
    && textKey(programme.episode_title) === textKey(entry.episodeTitle)
}

const STATUS_RANK = { recording: 0, scheduled: 1, recorded: 2, skipped: 3 }

const byStatusThenLatest = (a, b) =>
  STATUS_RANK[a.status] - STATUS_RANK[b.status] || Number(b.entry.startDate) - Number(a.entry.startDate)

const upcomingStatusOf = (entry) => {
  if (entry.enabled === false) return 'skipped'
  return entry.schedStatus === 'recording' ? 'recording' : 'scheduled'
}

const removedStatusOf = ({ entry, finished }) => {
  const completed = /completed ok/i.test(entry.statusText || '')
  const copied = finished.some((other) => isSameEpisode({ programme: programmeOfEntry(entry), entry: other }))
  return completed || copied ? 'recorded' : 'skipped'
}

const programmeOfEntry = (entry) => ({
  title: entry.name,
  episode_title: entry.episodeTitle,
  episode_uri: entry.episodeUri,
  series_no: entry.season,
  episode_no: entry.episode,
})

const belongsToRule = ({ entry, tag, programme }) =>
  (tag?.id != null && entry.autorecId === tag.id) || textKey(entry.name) === textKey(programme.title)

const hasRealSubtitle = (subtitle) => textKey(subtitle) !== '' && !isPlaceholderEpisodeTitle(subtitle)

const textKey = (text) => String(text ?? '').trim().toLowerCase()
