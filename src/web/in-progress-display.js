import { durationText } from './recording-info.js'
import { shortDayOf } from './show-page.js'
import { LATE_START_GRACE_MS, playsFromMsOf } from './start-over.js'
import { formatClock, formatMinutes } from './time-format.js'
import { recordingLeftText } from './recording-time-left.js'

export const RECORDING = 'recording'
export const FINISHING = 'finishing'

export const liveInProgressOf = ({ episode, active = [] }) => {
  const item = episode?.inProgress
  if (!item) return null
  const fresh = active.find((r) => !r.failed && String(r.dvrUuid ?? r.uuid) === String(item.dvrUuid))
  if (!fresh) return item
  return {
    ...item,
    phase: RECORDING,
    start: fresh.start ?? item.start,
    stop: fresh.stop ?? item.stop,
    stopPadded: fresh.stopPadded ?? item.stopPadded,
    recordingStartedAt: fresh.recordingStartedAt ?? item.recordingStartedAt,
    canPlayFromStart: Boolean(fresh.canPlayFromStart && fresh.dvrUuid),
    libraryHold: fresh.libraryHold ?? item.libraryHold,
  }
}

export const isRecordingPhase = (item) => item?.phase === RECORDING

export const canWatchFromStart = (item) => isRecordingPhase(item) && Boolean(item.canPlayFromStart && item.dvrUuid)

export const lateStartMinutesOf = ({ start, recordingStartedAt }) => {
  if (recordingStartedAt == null || start == null || recordingStartedAt - start <= LATE_START_GRACE_MS) return 0
  return Math.round((recordingStartedAt - start) / 60_000)
}

export const recordedPercentOf = ({ start, stop, nowMs }) => {
  if (!(stop > start)) return 0
  return Math.min(100, Math.max(0, Math.round(((nowMs - start) / (stop - start)) * 100)))
}

export const recordingEndOf = (item) => item.stopPadded ?? item.stop

export const holdReasonOf = (reason) => HOLD_REASONS[reason] || (reason ? reason.charAt(0).toLowerCase() + reason.slice(1) : '')

export const recordingCardOf = ({ item, nowMs, timeZone }) => {
  const clock = (ms) => formatClock(ms, timeZone)
  if (!isRecordingPhase(item)) {
    return {
      tone: 'idle',
      headline: `Recorded until ${clock(recordingEndOf(item))}`,
      detail: item.libraryHold
        ? `It stays in TVHeadend, because ${holdReasonOf(item.libraryHold)}.`
        : 'It joins your library at the next sync.',
    }
  }
  const late = lateStartMinutesOf(item)
  return {
    tone: 'live',
    headline: `Recording now until ${clock(recordingEndOf(item))}`,
    detail: [
      late ? `Recording started at ${clock(item.recordingStartedAt)}, ${formatMinutes(late)} after the programme began.` : '',
      nowMs >= item.stop ? `The programme ended at ${clock(item.stop)}. Recording continues in case it runs late.` : '',
      item.libraryHold
        ? `When it finishes it stays in TVHeadend, because ${holdReasonOf(item.libraryHold)}.`
        : 'It joins your library when it finishes.',
    ].filter(Boolean).join(' '),
  }
}

export const inProgressHeroMetaOf = ({ show, item }) => [
  RECORDING_KIND_TEXT[show.kind] || RECORDING_KIND_TEXT.oneoff,
  item.channelName || '',
  item.libraryHold ? 'Stays in TVHeadend' : 'Not in your library yet',
].filter(Boolean).join(' · ')

export const inProgressEpisodeMetaOf = ({ episode, item, nowMs, timeZone }) => {
  const day = item.start ? shortDayOf({ ms: item.start, timeZone }) : ''
  if (!isRecordingPhase(item)) {
    return [day, episode.channelName, durationText(episode.durationS), item.libraryHold ? 'Stays in TVHeadend' : 'Waiting to import']
      .filter(Boolean).join(' · ')
  }
  const recordedFrom = item.recordingStartedAt ?? item.start
  const recorded = durationText(Math.max(60, (nowMs - recordedFrom) / 1000))
  return [day, episode.channelName, recorded ? `${recorded} recorded` : '', recordingLeftText({ recording: item, nowMs, minutesText: formatMinutes })]
    .filter(Boolean).join(' · ')
}

export const inProgressEpisodeLineOf = ({ item, timeZone }) => (canWatchFromStart(item)
  ? `Plays from ${formatClock(playsFromMsOf(item), timeZone)} while it keeps recording. Seek anywhere in the recorded part, or go to live.`
  : '')

export const inProgressCardMetaOf = ({ show, timeZone }) => {
  const item = show.inProgress
  if (!item || show.counts.total > show.counts.inProgress) return ''
  if (!isRecordingPhase(item)) return item.libraryHold ? 'Stays in TVHeadend' : 'Waiting to import'
  return [item.channelName, `until ${formatClock(recordingEndOf(item), timeZone)}`].filter(Boolean).join(' · ')
}

export const episodeBadgeOf = ({ episode, activeIds = new Set() }) => {
  if (episode.inProgress) return isRecordingPhase(episode.inProgress) ? 'rec' : ''
  if (activeIds.has(episode.recordingId)) return 'rec'
  return episode.new ? 'new' : ''
}

export const recordingSetKeyOf = ({ active = [], finishing = [] } = {}) => [
  ...active.filter((r) => !r.failed).map((r) => `r:${r.dvrUuid ?? r.uuid}`),
  ...finishing.map((r) => `f:${r.uuid}`),
].sort().join(',')

export const recordingChannelOf = (item) => ({
  id: item.channelId,
  name: item.channelName || '',
  number: null,
  hasLogo: true,
})

export const fromStartRecordingOf = ({ item, title }) => ({
  dvrUuid: item.dvrUuid,
  title,
  start: item.start,
  startPadded: item.startPadded ?? null,
  recordingStartedAt: item.recordingStartedAt,
  stopPadded: item.stopPadded ?? null,
})

const RECORDING_KIND_TEXT = { show: 'Series recording', movie: 'Movie recording', oneoff: 'One-off recording' }

const HOLD_REASONS = {
  'No series folder for this title, and Import every recording is off': 'Import every recording is off and no series folder matches it',
  'Recorded with Add to library off': 'Add to library was off for this recording',
  'Kept out of the library': 'you kept it out of the library',
}
