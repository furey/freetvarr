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

export const isSameEpisode = ({ programme, entry }) =>
  isSameIdentity(identityOfProgramme(programme), identityOfEntry(entry))

export const isSameEpisodeEntry = ({ entry, other }) =>
  isSameIdentity(identityOfEntry(entry), identityOfEntry(other))

export const earlierAiringOfEntry = ({ entry, upcoming = [], pastAirings = [] }) => {
  const isEarlierSameEpisode = (other) => other.uuid !== entry.uuid
    && Number(other.startDate) < Number(entry.startDate)
    && sharesRule({ entry, other })
    && isSameEpisodeEntry({ entry, other })
  const finished = pastAirings.filter((other) => !other.failed && !other.removed)
  const recorded = pastAirings
    .filter((other) => !other.failed && (!other.removed || removedStatusOf({ entry: other, finished }) === 'recorded'))
    .filter(isEarlierSameEpisode)
    .sort((a, b) => Number(b.startDate) - Number(a.startDate))[0]
  if (recorded) return airingSummaryOf({ entry: recorded, status: 'recorded' })
  const pending = upcoming
    .filter((other) => other.enabled !== false && !other.duplicateOfStart && isPendingStatus(other.schedStatus))
    .filter(isEarlierSameEpisode)
    .sort((a, b) => Number(a.startDate) - Number(b.startDate))[0]
  return pending ? airingSummaryOf({ entry: pending, status: upcomingStatusOf(pending) }) : null
}

const STATUS_RANK = { recording: 0, scheduled: 1, recorded: 2, skipped: 3 }

const byStatusThenLatest = (a, b) =>
  STATUS_RANK[a.status] - STATUS_RANK[b.status] || Number(b.entry.startDate) - Number(a.entry.startDate)

const upcomingStatusOf = (entry) => {
  if (entry.enabled === false) return 'skipped'
  return entry.schedStatus === 'recording' ? 'recording' : 'scheduled'
}

const isPendingStatus = (schedStatus) => schedStatus === 'scheduled' || schedStatus === 'recording'

const airingSummaryOf = ({ entry, status }) => ({
  status,
  startDate: entry.startDate,
  channelName: entry.channelName || null,
  uuid: entry.uuid,
})

const removedStatusOf = ({ entry, finished }) => {
  const completed = /completed ok/i.test(entry.statusText || '')
  const copied = finished.some((other) => isSameEpisodeEntry({ entry, other }))
  return completed || copied ? 'recorded' : 'skipped'
}

const isSameIdentity = (a, b) => {
  const uriA = textKey(a.uri)
  const uriB = textKey(b.uri)
  if (uriA && uriA === uriB) return true
  if (hasEpisodeNumber(a) && hasEpisodeNumber(b)) {
    return Number(a.season) === Number(b.season) && Number(a.episode) === Number(b.episode)
  }
  if (uriA && uriB) return false
  return textKey(a.title) === textKey(b.title)
    && hasRealSubtitle(a)
    && textKey(a.subtitle) === textKey(b.subtitle)
    && descriptionsAgree(a.description, b.description)
}

const identityOfProgramme = (programme) => ({
  title: programme.title,
  subtitle: programme.episode_title,
  uri: programme.episode_uri,
  season: programme.series_no,
  episode: programme.episode_no,
  description: programme.synopsis,
})

const identityOfEntry = (entry) => ({
  title: entry.name,
  subtitle: entry.episodeTitle,
  uri: entry.episodeUri,
  season: entry.season,
  episode: entry.episode,
  description: entry.description,
})

const hasEpisodeNumber = ({ season, episode }) => season != null && episode != null

const hasRealSubtitle = ({ title, subtitle }) =>
  textKey(subtitle) !== '' && !isPlaceholderEpisodeTitle(subtitle) && textKey(subtitle) !== textKey(title)

const descriptionsAgree = (a, b) => {
  const keyA = wordsKey(a)
  const keyB = wordsKey(b)
  if (!keyA || !keyB) return true
  return keyA.startsWith(keyB) || keyB.startsWith(keyA)
}

const sharesRule = ({ entry, other }) =>
  (entry.autorecId != null && entry.autorecId === other.autorecId) || textKey(entry.name) === textKey(other.name)

const belongsToRule = ({ entry, tag, programme }) =>
  (tag?.id != null && entry.autorecId === tag.id) || textKey(entry.name) === textKey(programme.title)

const wordsKey = (text) => String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const textKey = (text) => String(text ?? '').trim().toLowerCase()
