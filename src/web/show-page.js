import { durationText } from './recording-info.js'
import { weekdayClockOf, dayMonthOf, firstEpisodeText } from './library-shelves.js'
import { showKeyOf } from './show-key.js'
import { dateFormat, formatMinutes } from './time-format.js'

export const LEAD_OPTIONS = [0, 1, 2, 3, 5, 10, 15]
export const LAG_OPTIONS = [0, 5, 10, 15, 30, 60]
export const KEEP_OPTIONS = [0, 1, 2, 3, 5, 10, 15, 20, 30, 50]
export const UNIMPORTED_STATUSES = ['failed', 'skipped', 'not_imported']

export const stepOption = ({ options, value, direction }) => {
  const current = Number(value) || 0
  if (direction > 0) return options.find((option) => option > current) ?? options.at(-1)
  return [...options].reverse().find((option) => option < current) ?? options[0]
}

export const canStep = ({ options, value, direction }) => (direction > 0
  ? Number(value) < options.at(-1)
  : Number(value) > options[0])

export const keepLabel = (count) => (count > 0 ? String(count) : 'All')

export const paddingLabel = (minutes) => `${minutes}m`

export const seasonLabel = (season) => (season == null ? 'Other' : `Season ${season}`)

export const episodeHeading = (episode) => {
  const number = episode.episode != null ? `E${episode.episode}` : ''
  const name = episode.episodeTitle && episode.episodeTitle !== episode.title ? episode.episodeTitle : ''
  return [number, name].filter(Boolean).join(' · ') || episode.title
}

export const episodeMetaOf = ({ episode, timeZone }) => [
  episode.airedAt ? shortDayOf({ ms: episode.airedAt, timeZone }) : '',
  durationText(episode.durationS),
  episodeStateText(episode),
].filter(Boolean).join(' · ')

export const episodeStateText = (episode) => {
  if (episode.failed) return 'Failed'
  if (episode.watched) return 'Watched'
  if (episode.positionS > 0 && episode.durationS) {
    const left = Math.max(1, Math.round((episode.durationS - episode.positionS) / 60))
    return `${formatMinutes(left)} left`
  }
  const state = episode.libraryState || episode.status
  return STATE_TEXT[state] || ''
}

export const heroMetaOf = ({ show }) => {
  const latestSeason = show.seasons.find((s) => s.season != null)?.season
  const episodes = show.seasons.reduce((sum, s) => sum + s.episodes.length, 0)
  const channels = show.rule?.anyChannel ? [] : show.rule?.channels ?? []
  const channel = channels[0] || show.seasons[0]?.episodes[0]?.channelName || ''
  return [
    channel,
    latestSeason != null ? `Season ${latestSeason}` : '',
    episodes ? `${episodes} ${episodes === 1 ? 'episode' : 'episodes'} recorded` : '',
  ].filter(Boolean).join(' · ')
}

export const episodeById = ({ show, recordingId }) => show.seasons
  .flatMap((s) => s.episodes)
  .find((e) => e.recordingId === recordingId) || null

export const playButtonLabel = ({ show }) => {
  const next = show.resumeNext
  if (!next) return ''
  const episode = episodeById({ show, recordingId: next.recordingId })
  const number = episode?.episode != null ? ` E${episode.episode}` : ''
  if (next.positionS > 0) return `Resume${number}`
  return number ? `Play${number}` : 'Play'
}

export const ruleStatusOf = ({ show, activeRecording, timeZone }) => {
  const rule = show.rule
  if (!rule) {
    return {
      tone: 'idle',
      headline: 'Not recording new episodes',
      detail: 'To record new episodes, find the show in the TV guide and choose Record series.',
    }
  }
  return { tone: toneOf({ rule, activeRecording }), headline: headlineOf({ show, activeRecording, timeZone }), detail: rule.summary }
}

export const activeRecordingFor = ({ active = [], key }) =>
  active.find((r) => !r.failed && showKeyOf(r.title) === key) || null

export const sheetIntroOf = ({ show }) => (show.rule?.paused
  ? `Paused. New episodes of ${show.title} are not recorded.`
  : `Records every new episode of ${show.title}.`)

export const channelChipsOf = ({ autorecs = [], guideMatches = [] }) => {
  const anyChannel = autorecs.find((a) => a.anyChannel) || null
  const ruleChips = autorecs
    .filter((a) => !a.anyChannel)
    .map((a) => ({ key: `channel:${a.channelId}`, channelId: a.channelId, label: a.channelName || 'Unknown channel', on: !anyChannel, autorec: a, match: null }))
  const ruleChannels = new Set(ruleChips.map((chip) => String(chip.channelId)))
  const guideChips = uniqueBy(guideMatches, (m) => String(m.channelId))
    .filter((m) => !ruleChannels.has(String(m.channelId)))
    .map((m) => ({ key: `channel:${m.channelId}`, channelId: m.channelId, label: m.channelName || 'Unknown channel', on: false, autorec: null, match: m }))
  const withMatches = [...ruleChips, ...guideChips].map((chip) => ({
    ...chip,
    match: chip.match || guideMatches.find((m) => String(m.channelId) === String(chip.channelId)) || null,
  }))
  return [
    ...withMatches,
    { key: 'any', channelId: '', label: 'Any channel', on: Boolean(anyChannel), autorec: anyChannel, match: guideMatches[0] || null },
  ]
}

export const guideMatchesFor = ({ results = [], key }) => results.filter((p) => showKeyOf(p.title) === key)

export const episodeActionsOf = (episode) => [
  { key: episode.watched ? 'unwatched' : 'watched', label: episode.watched ? 'Mark unwatched' : 'Mark watched' },
  ...(canImport(episode) ? [{ key: 'import', label: importLabelOf(episode) }] : []),
  ...(canRemoveFromTvh(episode) ? [{ key: 'remove-from-tvh', label: 'Delete', danger: true }] : []),
  ...(canClearRow(episode) ? [{ key: 'clear', label: 'Delete', danger: true }] : []),
]

export const canRemoveFromTvh = (episode) => episode.status === 'done' && !episode.deletedFromTvhAt

export const canClearRow = (episode) => Boolean(episode.deletedFromTvhAt) || UNIMPORTED_STATUSES.includes(episode.status)

export const canImport = (episode) => RETRYABLE_STATES.includes(episode.libraryState || episode.status)
  && !episode.deletedFromTvhAt

const RETRYABLE_STATES = ['not_imported', 'not_in_library', 'failed', 'skipped']

const importLabelOf = (episode) => {
  if (episode.libraryState === 'not_in_library') return 'Import again'
  return ['failed', 'skipped'].includes(episode.status) ? 'Retry' : 'Import'
}

export const recordingRowOf = (episode) => ({
  recording_id: episode.recordingId,
  title: episode.title,
  episode_title: episode.episodeTitle,
  season: episode.season,
  episode: episode.episode,
  aired_at: episode.airedAt,
  duration_s: episode.durationS,
  synopsis: episode.synopsis,
  channel_id: episode.channelId,
  channel_name: episode.channelName,
  image_path: episode.image ? 'saved' : null,
  playback_position_s: episode.positionS,
  status: episode.status,
  file_path: episode.filePath,
  deleted_from_tvh_at: episode.deletedFromTvhAt,
  library_state: episode.libraryState,
  library_file_present: !episode.libraryState,
})

export const shortDayOf = ({ ms, timeZone }) =>
  `${dateFormat({ weekday: 'short' }, timeZone).format(new Date(ms))} ${dayMonthOf({ ms, timeZone })}`

const toneOf = ({ rule, activeRecording }) => {
  if (activeRecording) return 'live'
  return rule.paused ? 'paused' : 'scheduled'
}

const headlineOf = ({ show, activeRecording, timeZone }) => {
  if (activeRecording) {
    return activeRecording.episode != null ? `Recording now · Episode ${activeRecording.episode}` : 'Recording now'
  }
  if (show.rule.paused) return 'Paused'
  const next = show.nextAiring
  if (!next) return 'Not in the guide this week'
  if (!show.seasons.length) return firstEpisodeText({ nextAiring: next, timeZone })
  const channel = next.channelName ? ` on ${next.channelName}` : ''
  return `Next: ${weekdayClockOf({ ms: next.startDate, timeZone })}${channel}`
}

const uniqueBy = (items, keyOf) => {
  const seen = new Set()
  return items.filter((item) => {
    const key = keyOf(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const STATE_TEXT = {
  importing: 'Importing',
  pending: 'Waiting to import',
  partial: 'Partly imported',
  skipped: 'Skipped',
  not_imported: 'Not imported',
  not_in_library: 'Not in library',
  replaced: 'Replaced in library',
}
