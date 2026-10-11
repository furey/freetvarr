export const STOP_RECORDING_KEEP_MIN_MS = 5 * 60_000

export const recordedMsOf = ({ recordingSince, nowMs }) =>
  (recordingSince == null ? 0 : Math.max(0, nowMs - recordingSince))

export const keepsStoppedRecording = (recordedMs) => recordedMs >= STOP_RECORDING_KEEP_MIN_MS

export const stopRecordingOutcome = ({ recordedMs, addsToLibrary = true }) => {
  const minutes = Math.floor(recordedMs / 60_000)
  if (keepsStoppedRecording(recordedMs)) {
    const place = addsToLibrary ? 'your library' : 'TVHeadend'
    return `Stops the recording. The ${minutesText(minutes)} recorded so far stay in ${place}.`
  }
  if (minutes < 1) return 'Stops the recording and deletes what it recorded so far.'
  return `Stops the recording and deletes the ${minutesText(minutes)} recorded so far.`
}

const minutesText = (minutes) => (minutes === 1 ? '1 minute' : `${minutes} minutes`)
