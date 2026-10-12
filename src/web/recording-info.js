import { formatClock, formatDate, formatHours, formatMinutes } from './time-format.js'

export const recordingSeasonEpisode = ({ season, episode }) => {
  if (season == null && episode == null) return ''
  const s = season != null ? `S${String(season).padStart(2, '0')}` : ''
  const e = episode != null ? `E${String(episode).padStart(2, '0')}` : ''
  return `${s}${e}`
}

export const recordingHeaderLine = (recording) => uniqueParts([
  recording.title,
  recordingSeasonEpisode(recording),
  recording.episode_title,
]).join(' · ')

export const recordingEpisodeLine = (recording) => uniqueParts([
  recordingSeasonEpisode(recording),
  recording.episode_title !== recording.title ? recording.episode_title : '',
]).join(' · ')

export const airedRangeText = ({ airedAt, durationSeconds, timeZone }) => {
  const start = Number(airedAt)
  if (!Number.isFinite(start) || start <= 0) return ''
  const day = formatDate(start, timeZone)
  const seconds = Number(durationSeconds)
  if (!Number.isFinite(seconds) || seconds <= 0) return `${day} ${formatClock(start, timeZone)}`
  return `${day} ${formatClock(start, timeZone)}–${formatClock(start + seconds * 1000, timeZone)}`
}

export const durationText = (durationSeconds) => {
  const totalMinutes = Math.round(Number(durationSeconds) / 60)
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return ''
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (!hours) return formatMinutes(minutes)
  return minutes ? `${formatHours(hours)} ${formatMinutes(minutes)}` : formatHours(hours)
}

export const watchedPercent = ({ position, duration }) => {
  const total = Number(duration)
  if (!Number.isFinite(total) || total <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((Number(position) / total) * 100)))
}

export const adsText = ({ ad_status: status, ad_breaks_json: json }) => {
  if (!status) return ''
  if (status === 'scanning') return 'Scanning for ad breaks'
  if (status === 'no_breaks') return 'No ad breaks found'
  if (status === 'detect_failed') return 'The ad scan failed'
  if (status === 'cut_failed') return 'The ad cut failed; the recording is uncut'
  const breaks = breaksOf(json)
  const summary = `${breaks.length} ${breaks.length === 1 ? 'break' : 'breaks'} · ${formatMinutes(adMinutesOf(breaks))} of ads`
  return status === 'cut' ? `${summary}, cut` : `${summary}, found`
}

export const libraryStatusOf = (recording) => recording.library_state || recording.status

export const savesToLine = (recording) => {
  const { status, file_path: filePath, library_file_present: present } = recording
  if (!['done', 'partial'].includes(status) || !filePath) return null
  if (recording.library_state === 'replaced') return { label: 'REPLACED BY', text: recording.library_replacement }
  const missing = recording.library_state === 'not_in_library' || present === false
  return { label: missing ? 'FILE MISSING' : 'SAVES TO', text: filePath }
}

export const libraryStateTitle = (recording) => {
  if (recording.library_state === 'replaced') {
    return `Another app, such as Sonarr, replaced Freetvarr's file with ${fileNameOf(recording.library_replacement)}.`
  }
  if (recording.library_state === 'not_in_library') {
    return `The file is gone from your library folder: ${fileNameOf(recording.file_path)}.`
  }
  return ''
}

export const libraryStatusText = ({ status, imported, deletedFromTvh }) => {
  const label = STATUS_LABELS[status] || String(status || '').replace(/_/g, ' ').toUpperCase()
  return [
    imported && status === 'done' ? `${label} ${imported}` : label,
    deletedFromTvh ? 'NOT IN TVHEADEND' : '',
  ].filter(Boolean).join(' · ')
}

export const sourceBadgeText = (source) => SOURCE_BADGES[source] || ''

const fileNameOf = (filePath) => String(filePath || '').split('/').pop()

const uniqueParts = (parts) => parts
  .filter(Boolean)
  .filter((part, i, all) => all.indexOf(part) === i)

const breaksOf = (json) => {
  try {
    const breaks = JSON.parse(json || '[]')
    return Array.isArray(breaks) ? breaks : []
  } catch {
    return []
  }
}

const adMinutesOf = (breaks) => {
  const seconds = breaks.reduce((sum, b) => sum + (Number(b.end) - Number(b.start) || 0), 0)
  return breaks.length ? Math.max(1, Math.round(seconds / 60)) : 0
}

const STATUS_LABELS = {
  done: 'IMPORTED',
  partial: 'PARTIAL',
  skipped: 'SKIPPED',
  failed: 'FAILED',
  not_imported: 'NOT IMPORTED',
  replaced: 'REPLACED',
  not_in_library: 'NOT IN LIBRARY',
  importing: 'IMPORTING',
  pending: 'PENDING',
}

const SOURCE_BADGES = {
  library: 'FROM LIBRARY',
  tvheadend: 'FROM TVHEADEND',
}
