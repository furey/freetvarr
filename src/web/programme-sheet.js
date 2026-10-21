import { recordWordingOf } from './record-wording.js'

export const SHEET_LEAD_STEPS = [0, 1, 2, 3, 5, 10, 15]
export const SHEET_LAG_STEPS = [0, 5, 10, 15, 30, 60]
export const SHEET_KEEP_STEPS = [1, 2, 3, 5, 10, 20, 0]

export const stepValue = ({ steps, value, step }) => {
  const index = steps.indexOf(value)
  const from = index < 0 ? 0 : index
  return steps[Math.min(steps.length - 1, Math.max(0, from + step))]
}

export const canStep = ({ steps, value, step }) => stepValue({ steps, value, step }) !== value

export const minutesShort = (minutes) => `${minutes}m`

export const keepLabel = (count) => (count === 0 ? 'All' : String(count))

export const sheetStrengthsFor = ({ canRecordEpisode, canRecordSeries, kind = null }) => [
  canRecordEpisode && { key: 'episode', label: recordWordingOf({ kind }).strengthLabel },
  canRecordSeries && { key: 'series', label: 'Every episode' },
].filter(Boolean)

export const initialStrengthOf = ({ strengths, focus = '' }) => {
  const keys = strengths.map((s) => s.key)
  if (keys.includes(focus)) return focus
  return keys[0] ?? ''
}

export const strengthLineOf = ({ strength, title, channelLabel = '', onAirUntil = '', recordWhenSeen = false, kind = null }) => {
  if (strength === 'episode') {
    return onAirUntil
      ? `Records from now until ${onAirUntil}. The part already aired is not included.`
      : recordWordingOf({ kind }).strengthLine
  }
  if (strength === 'series') return `Records every new episode of ${title} ${channelLabel}.`.replace(/ \./, '.')
  if (strength !== 'notify') return ''
  return recordWhenSeen
    ? `Records every episode of ${title} on any channel as soon as it is in the guide.`
    : `Lists ${title} in Scheduled under Watchlist whenever it is in the guide. Nothing records.`
}

export const primaryActionOf = ({ strength }) => {
  if (strength === 'episode') return { key: 'record', label: 'Record', tone: 'record' }
  if (strength === 'series') return { key: 'record-series', label: 'Record series', tone: 'record' }
  return null
}

export const pendingActionLabelOf = (key) => PENDING_ACTION_LABELS[key] || 'Saving…'

export const sheetMetaLineOf = ({ seasonEpisode, episodeTitle, channelName, timeRange }) =>
  [seasonEpisode, episodeTitle, channelName, timeRange].filter(Boolean).join(' · ')

export const seasonEpisodeShort = ({ series_no: season, episode_no: episode }) =>
  [season != null && `S${season}`, episode != null && `E${episode}`].filter(Boolean).join(' ')

export const activeWatchItemFor = ({ items = [], key }) =>
  items.find((item) => item.key === key && !item.fulfilledAt) ?? null

export const watchedKeysOf = (items = []) =>
  new Set(items.filter((item) => !item.fulfilledAt).map((item) => item.key))

export const cellMarksOf = ({ state, seriesScheduled = false, watching = false }) => ({
  ring: state === 'recording',
  scheduledDot: state === 'scheduled' || state === 'series' || seriesScheduled,
  watchDot: watching && state !== 'recording' && state !== 'scheduled' && state !== 'series',
})

export const clockWithoutPeriod = (clock) => String(clock).replace(/\s?[ap]\.?m\.?$/i, '')

const PENDING_ACTION_LABELS = {
  record: 'Scheduling…',
  'record-series': 'Setting up…',
  cancel: 'Cancelling…',
  stop: 'Stopping…',
  'remove-watch': 'Removing…',
}
