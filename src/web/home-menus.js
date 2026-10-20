export const PROGRAMME_INFO = { key: 'programme-info', label: 'Programme info', icon: 'info' }
export const GO_TO_SHOW = { key: 'show', label: 'Go to show', icon: 'show' }

export const onNowMenuOf = ({ channelName = '', seriesLink = false }) => [
  [
    { key: 'watch-live', label: 'Watch live', icon: 'play', detail: channelName },
    { key: 'record-episode', label: 'Record this episode', icon: 'record', detail: 'From now' },
    seriesLink && { key: 'record-series', label: 'Record series', icon: 'series' },
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

export const scheduledMenuOf = ({ hasRule = false }) => [
  [PROGRAMME_INFO, GO_TO_SHOW, hasRule && { key: 'options', label: 'Recording options', icon: 'options' }],
  [{ key: 'skip', label: 'Don\'t record this episode', icon: 'skip', danger: true }],
].map(compact)

export const guideMatchMenuOf = ({ when = '', seriesLink = false }) => [
  [
    { key: 'record-episode', label: 'Record this episode', icon: 'record', detail: when },
    seriesLink && { key: 'record-series', label: 'Record series', icon: 'series' },
  ],
  [PROGRAMME_INFO],
].map(compact)

export const withGoToShow = (groups) => groups.map((group) => group.flatMap((item) => (item.key === 'episode-info' ? [item, GO_TO_SHOW] : [item])))

export const programmeOfRecording = (recording) => ({
  program_id: recording.programId ?? null,
  title: recording.title,
  episode_title: recording.episodeTitle || null,
  start: recording.start,
  end: recording.stop,
  channelId: recording.channelId,
})

export const showArtOf = (title) => `/api/epg/show-image?title=${encodeURIComponent(title)}&w=384`

export const programmeArtOf = (program) => (program.has_image && program.program_id != null
  ? `/api/epg/image/${encodeURIComponent(program.program_id)}?w=384`
  : showArtOf(program.title))

export const skippedTextOf = (title) => `Won't record this episode of ${title}`

const compact = (group) => group.filter(Boolean)
