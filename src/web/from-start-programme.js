export const fromStartProgrammeOf = (recording) => ({
  programId: recording.programId ?? null,
  title: recording.title || '',
  episodeTitle: recording.episodeTitle || '',
  season: recording.season ?? null,
  episode: recording.episode ?? null,
  start: recording.start ?? null,
  stop: recording.stop ?? null,
  hasImage: Boolean(recording.hasImage),
})

export const recordedProgrammeAtMsOf = ({ programme, recordingStartedAt }) => {
  const { start, stop } = programme || {}
  if (Number.isFinite(start) && Number.isFinite(stop) && stop > start) return start + (stop - start) / 2
  if (Number.isFinite(start)) return start + 60_000
  return Number.isFinite(recordingStartedAt) ? recordingStartedAt + 60_000 : null
}

export const fromStartAiringOf = ({ programme, fetched }) => ({
  now: guideMatches({ programme, guide: fetched?.now }) ? fetched.now : programmeRowOf(programme),
  next: null,
  atMs: fetched?.atMs ?? programme?.start ?? 0,
  loaded: true,
})

const guideMatches = ({ programme, guide }) => {
  if (!guide) return false
  if (programme?.programId != null && guide.program_id != null) return String(guide.program_id) === String(programme.programId)
  return !programme?.title || titleKeyOf(guide.title) === titleKeyOf(programme.title)
}

const programmeRowOf = (programme) => (programme?.title
  ? {
    program_id: programme.programId,
    title: programme.title,
    episode_title: programme.episodeTitle || null,
    series_no: programme.season,
    episode_no: programme.episode,
    start: programme.start,
    end: programme.stop,
    has_image: programme.hasImage && programme.programId != null,
  }
  : null)

const titleKeyOf = (title) => String(title || '').trim().toLowerCase()
