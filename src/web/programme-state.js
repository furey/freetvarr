import { findSeriesLink } from './series-link.js'
import { localDayNumber } from './guide-time.js'

export const programmeIdOf = (programme) => String(programme.program_id ?? programme.programId)

export const scheduledByProgramIdOf = (futureRecordings = []) => {
  const map = new Map()
  for (const recording of futureRecordings) {
    if (recording?.programId != null) map.set(String(recording.programId), recording)
  }
  return map
}

export const seriesLinkSetOf = (seriesTags = []) => {
  const set = new Set()
  for (const tag of seriesTags) {
    const link = tag?.seriesLinkId ?? tag?.id
    if (link != null) set.add(String(link))
  }
  return set
}

export const programmeStateOf = ({ programme, scheduledByProgramId, activeRecordingSet, seriesLinks, repeatByProgramId = new Map() }) => {
  if (programme.past) return programme.recorded ? 'recorded' : ''
  const scheduled = scheduledByProgramId.get(programmeIdOf(programme))
  if (scheduled && activeRecordingSet.has(String(scheduled.programId))) return 'recording'
  if (scheduled) return 'scheduled'
  if (repeatByProgramId.has(programmeIdOf(programme))) return 'repeat'
  if (seriesLinkOfProgramme({ programme, seriesLinks })) return 'series'
  return ''
}

export const seriesLinkOfProgramme = ({ programme, seriesLinks }) =>
  findSeriesLink({ links: seriesLinks, seriesLink: programme.series_link })
  || (programme.rule_link != null && seriesLinks.has(String(programme.rule_link)) ? String(programme.rule_link) : null)

export const twinCoverOf = ({ programme, scheduledByProgramId, activeRecordingSet, seriesLinks }) => {
  if (programme.past) return null
  for (const twin of programme.twins || []) {
    const state = programmeStateOf({ programme: twin, scheduledByProgramId, activeRecordingSet, seriesLinks })
    if (TWIN_COVER_STATES.includes(state)) return { state, twin }
  }
  return null
}

export const twinCoverTextOf = ({ cover, seriesScheduled = false }) => {
  if (!cover) return ''
  const channel = cover.twin.channel_name || 'its twin channel'
  if (cover.state === 'recording') return `Recording now on ${channel}.`
  if (cover.state === 'scheduled') return `Scheduled to record on ${channel}${seriesScheduled ? ' (part of a series recording).' : '.'}`
  return `A series recording on ${channel} records this programme.`
}

const TWIN_COVER_STATES = ['recording', 'scheduled', 'series']

export const isSeriesScheduledOf = ({ programme, scheduledByProgramId, seriesLinks }) => {
  const scheduled = scheduledByProgramId.get(programmeIdOf(programme))
  return Boolean(scheduled?.seriesLinkId != null && seriesLinks.has(String(scheduled.seriesLinkId)))
}

export const recordingStateTextOf = ({ state, seriesScheduled = false, past = false, watched = false }) => {
  if (state === 'recording') return 'Recording now'
  if (state === 'scheduled') return seriesScheduled ? 'Series recording scheduled' : 'One-off recording scheduled'
  if (state === 'series') return 'Series recording set'
  if (state === 'repeat') return 'Repeat, skipped'
  if (state === 'recorded') return 'Recorded'
  if (!past && watched) return 'On watchlist'
  return ''
}

export const programmeOfUpcoming = ({ upcoming, msOf }) => ({
  program_id: upcoming.programId,
  epg_program_id: upcoming.epgProgramId ?? null,
  title: upcoming.name,
  episode_title: upcoming.episodeTitle || null,
  synopsis: upcoming.description || null,
  start: msOf(upcoming.startDate),
  end: msOf(upcoming.endDate),
  series_link: upcoming.seriesLinkId || null,
  series_no: upcoming.seriesNo ?? null,
  episode_no: upcoming.episodeNo ?? null,
  has_image: Boolean(upcoming.hasImage),
  channelId: upcoming.channelId,
})

export const guideDayOffsetOf = ({ startMs, nowMs, timeZone }) => (Number.isFinite(startMs)
  ? Math.min(6, Math.max(0, localDayNumber({ ms: startMs, timeZone }) - localDayNumber({ ms: nowMs, timeZone })))
  : 0)

export const channelHintOf = ({ channel = null, programme = {} }) => ({
  name: channel?.name || programme.channelName || '',
  hasLogo: channel?.hasLogo ?? Boolean(channel?.logos?.length),
})

export const guideChannelOf = ({ guideDay, channelId }) =>
  (guideDay?.channels || []).find((channel) => String(channel.id) === String(channelId)) || null

export const listedProgrammeOf = ({ guideDay, channelId, programme }) =>
  (guideDay?.programs?.[channelId] || []).find((listed) => listed.start === programme.start) || null
