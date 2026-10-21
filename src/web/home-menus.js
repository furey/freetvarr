import { recordWordingOf } from './record-wording.js'
import { artworkStamps, showImageUrlOf } from './artwork-stamps.js'

export const PROGRAMME_INFO = { key: 'programme-info', label: 'Programme info', icon: 'info' }
export const GO_TO_SHOW = { key: 'show', label: 'Go to show', icon: 'show' }

export const onNowMenuOf = ({ channelName = '', seriesLink = false, kind = null }) => [
  [
    { key: 'watch-live', label: 'Watch live', icon: 'play', detail: channelName },
    { key: 'record-episode', label: recordWordingOf({ kind }).menuLabel, icon: 'record', detail: 'From now' },
    seriesLink && kind !== 'movie' && { key: 'record-series', label: 'Record series', icon: 'series' },
  ],
  [PROGRAMME_INFO],
].map(compact).filter((group) => group.length)

export const recordingNowMenuOf = ({ channelName = '', canStartOver = false }) => [
  [
    canStartOver && { key: 'from-start', label: 'Watch from the start', icon: 'restart' },
    { key: 'watch-live', label: 'Watch live', icon: 'play', detail: channelName },
  ],
  [PROGRAMME_INFO, GO_TO_SHOW],
].map(compact).filter((group) => group.length)

export const scheduledMenuOf = ({ hasRule = false, kind = null }) => [
  [PROGRAMME_INFO, GO_TO_SHOW, hasRule && { key: 'options', label: 'Recording options', icon: 'options' }],
  [{ key: 'skip', label: recordWordingOf({ kind, hasRule }).skipLabel, icon: 'skip', danger: true }],
].map(compact)

export const guideMatchMenuOf = ({ when = '', seriesLink = false, kind = null }) => [
  [
    { key: 'record-episode', label: recordWordingOf({ kind }).menuLabel, icon: 'record', detail: when },
    seriesLink && kind !== 'movie' && { key: 'record-series', label: 'Record series', icon: 'series' },
  ],
  [PROGRAMME_INFO],
].map(compact)

export const withLeadItem = ({ groups, item }) => {
  if (!item) return groups
  const existing = groups.flat().find((entry) => entry.key === item.key)
  const rest = groups.map((group) => group.filter((entry) => entry.key !== item.key)).filter((group) => group.length)
  return [[existing || item, ...(rest[0] || [])], ...rest.slice(1)]
}

export const slideLeadItemOf = (secondary) => {
  if (!secondary) return null
  if (secondary.href) return { key: 'secondary-link', label: secondary.label, icon: 'check-list' }
  const key = SECONDARY_MENU_KEYS[secondary.action]
  return key ? { key, label: secondary.label, icon: 'info' } : null
}

export const withGoToShow = (groups) => groups.map((group) => group.flatMap((item) => (item.key === 'episode-info' ? [item, GO_TO_SHOW] : [item])))

export const programmeOfRecording = (recording) => ({
  program_id: recording.programId ?? null,
  title: recording.title,
  episode_title: recording.episodeTitle || null,
  start: recording.start,
  end: recording.stop,
  channelId: recording.channelId,
})

export const showArtOf = (title) => artworkStamps.stampUrl(showImageUrlOf({ title, width: 384 }))

export const programmeArtOf = (program) => (program.has_image && program.program_id != null
  ? `/api/epg/image/${encodeURIComponent(program.program_id)}?w=384`
  : showArtOf(program.title))

export const skippedTextOf = (title, kind = null) => recordWordingOf({ kind }).skippedText(title)

const SECONDARY_MENU_KEYS = { 'watch-live': 'watch-live', record: 'record-episode', guide: 'programme-info' }

const compact = (group) => group.filter(Boolean)
