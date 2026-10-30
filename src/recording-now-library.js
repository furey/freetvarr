export const RECORDING = 'recording'
export const FINISHING = 'finishing'

export const inProgressRowsOf = ({ active = [], finishing = [], rows = [] }) => {
  const taken = new Set(rows.map((row) => row.recording_id))
  const isNew = (item) => {
    const id = recordingIdOf(item)
    if (!id || taken.has(id)) return false
    taken.add(id)
    return true
  }
  return [
    ...active.filter((item) => !item.failed && isNew(item)).map((item) => inProgressRowOf({ item, phase: RECORDING })),
    ...finishing.filter(isNew).map((item) => inProgressRowOf({ item, phase: FINISHING })),
  ]
}

export const inProgressRowOf = ({ item, phase }) => ({
  recording_id: recordingIdOf(item),
  show_id: item.seriesFolderId ?? null,
  title: item.title,
  show_title_override: null,
  episode_title: item.episodeTitle ?? null,
  season: item.season ?? null,
  episode: item.episode ?? null,
  channel_id: item.channelId ?? null,
  channel_name: item.channelName ?? null,
  aired_at: item.start ?? null,
  duration_s: durationSecondsOf(item),
  synopsis: null,
  classification: null,
  genres_json: JSON.stringify(item.genres || []),
  image_path: null,
  file_path: null,
  status: phase,
  error: null,
  deleted_from_tvh_at: null,
  purged_at: null,
  playback_position_s: null,
  played_at: null,
  watched_at: null,
  library_state: null,
  in_progress: {
    phase,
    dvrUuid: recordingIdOf(item),
    programId: item.programId ?? null,
    hasImage: Boolean(item.hasImage),
    channelId: item.channelId ?? null,
    channelName: item.channelName ?? null,
    start: item.start ?? null,
    stop: item.stop ?? null,
    stopPadded: item.stopPadded ?? null,
    recordingStartedAt: item.recordingStartedAt ?? item.recordingSince ?? null,
    canPlayFromStart: phase === RECORDING && item.canPlayFromStart !== false,
    libraryHold: item.libraryHold ?? null,
    seriesRecording: item.autorecId != null,
  },
})

export const isInProgressRow = (row) => Boolean(row?.in_progress)

export const inProgressSummaryOf = (rows = []) => {
  const current = rows.filter(isInProgressRow).map((row) => row.in_progress)
  if (!current.length) return null
  const recording = current.filter((item) => item.phase === RECORDING)
  const pool = recording.length ? recording : current
  return [...pool].sort((a, b) => (a.stopPadded ?? a.stop ?? Infinity) - (b.stopPadded ?? b.stop ?? Infinity))[0]
}

export const inProgressImageOf = ({ in_progress: item }, width) => (item?.hasImage && item.programId != null
  ? `/api/epg/image/${encodeURIComponent(item.programId)}?w=${width}`
  : null)

export const recordingTitlesOf = ({ active = [], finishing = [] }) => [
  ...active.filter((item) => !item.failed),
  ...finishing,
].map((item) => item.title).filter(Boolean)

const recordingIdOf = (item) => item.dvrUuid ?? item.uuid ?? null

const durationSecondsOf = ({ start, stop }) => (Number.isFinite(start) && Number.isFinite(stop) && stop > start
  ? Math.round((stop - start) / 1000)
  : null)
