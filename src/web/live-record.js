export const NO_LISTING_TITLE = "No listing for what's on now, so there is nothing to record."
const RECORD_FROM_NOW_TITLE = 'Record what is on now. The part already aired is not included.'
const RECORDING_TITLE = 'Recording now. Open the dialog to stop it.'

export const isOnAir = ({ program, nowMs }) =>
  Boolean(program) && program.start <= nowMs && program.end > nowMs

export const nowProgramFor = ({ entries = [], channelId }) =>
  entries.find((e) => String(e.channel?.id) === String(channelId))?.now || null

export const liveRecordButton = ({ program, nowMs, recording }) => {
  if (!isOnAir({ program, nowMs })) {
    return { disabled: true, label: 'RECORD', title: NO_LISTING_TITLE }
  }
  return recording
    ? { disabled: false, label: 'REC', title: RECORDING_TITLE }
    : { disabled: false, label: 'RECORD', title: RECORD_FROM_NOW_TITLE }
}
