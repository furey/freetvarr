import { findSeriesLink } from './series-link.js'

export const NO_LISTING_TITLE = "No listing for what's on now, so there is nothing to record."
const RECORD_FROM_NOW_TITLE = 'Record what is on now. The part already aired is not included.'
const RECORDING_TITLE = 'Recording now. Press to stop the recording.'
const SERIES_NO_LISTING_TITLE = "No listing for what's on now, so there is no series to record."
const SERIES_CHECKING_TITLE = 'Checking TVHeadend for series recordings.'
const SERIES_SET_TITLE = 'A series recording in TVHeadend records this show. Press to change or cancel it.'

export const isOnAir = ({ program, nowMs }) =>
  Boolean(program) && program.start <= nowMs && program.end > nowMs

export const nowProgramFor = ({ entries = [], channelId }) =>
  entries.find((e) => String(e.channel?.id) === String(channelId))?.now || null

export const liveRecordButton = ({ program, nowMs, recordingProgramIds = new Set() }) => {
  if (!isOnAir({ program, nowMs })) {
    return { disabled: true, recording: false, label: 'RECORD', ariaLabel: 'Record', title: NO_LISTING_TITLE }
  }
  return recordingProgramIds.has(String(program.program_id))
    ? { disabled: false, recording: true, label: 'STOP REC', ariaLabel: 'Recording now. Stop recording', title: RECORDING_TITLE }
    : { disabled: false, recording: false, label: 'RECORD', ariaLabel: 'Record', title: RECORD_FROM_NOW_TITLE }
}

export const recordingProgramIdsOf = (active = []) =>
  new Set(active.filter((r) => !r.failed && r.programId != null).map((r) => String(r.programId)))

export const liveSeriesButton = ({ program, nowMs, seriesTags, channelName = () => '' }) => {
  if (!isOnAir({ program, nowMs })) return seriesButton({ disabled: true, title: SERIES_NO_LISTING_TITLE })
  if (!program.series_link) return { ...seriesButton({ disabled: true }), hidden: true }
  if (!seriesTags) return seriesButton({ disabled: true, title: SERIES_CHECKING_TITLE })
  const links = new Set(seriesTags.map((t) => String(t?.seriesLinkId ?? t?.id)))
  if (findSeriesLink({ links, seriesLink: program.series_link })) {
    return {
      ...seriesButton({ title: SERIES_SET_TITLE }),
      set: true,
      ariaLabel: `Series recording set for "${program.title}"`,
    }
  }
  const otherChannelId = otherSeriesChannelId({ seriesTags, seriesLink: program.series_link })
  const otherName = otherChannelId && channelName(otherChannelId)
  const title = otherName
    ? `A series recording records "${program.title}" on ${otherName}. Press to add this channel.`
    : `Record every episode of "${program.title}" on this channel.`
  return { ...seriesButton({ title }), ariaLabel: `Record series: "${program.title}"` }
}

export const otherSeriesChannelId = ({ seriesTags = [], seriesLink }) => {
  const link = String(seriesLink ?? '')
  const separator = link.indexOf('|')
  if (separator < 0) return null
  const titlePart = link.slice(separator)
  const other = seriesTags.find((t) => {
    const tagLink = String(t?.seriesLinkId ?? '')
    return tagLink !== link && tagLink !== titlePart && tagLink.endsWith(titlePart)
  })
  return other ? String(other.channelId || other.seriesLinkId.slice(0, -titlePart.length)) : null
}

const seriesButton = ({ disabled = false, title = '' }) =>
  ({ hidden: false, disabled, set: false, ariaLabel: 'Record series', title })
