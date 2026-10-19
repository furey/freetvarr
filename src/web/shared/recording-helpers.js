import { recordedMsOf, stopRecordingOutcome } from '/stop-recording.js'
import { recordingNow } from '/shared/recording-now.js'
import { now } from '/shared/time.js'

export const episodeRecordingFor = (autorecIds) => {
  const ids = new Set(autorecIds.filter(Boolean).map(String))
  return recordingNow.value.active.find((r) => !r.failed && r.autorecId != null && ids.has(String(r.autorecId))) || null
}

export const stopOutcomeFor = (recording) => (recording
  ? stopRecordingOutcome({
    recordedMs: recordedMsOf({ recordingSince: recording.recordingSince, nowMs: now.value.getTime() }),
  })
  : '')
