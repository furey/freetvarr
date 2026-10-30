export const TVHEADEND_UNCONFIGURED_CODE = 'no-url'

export const isTvheadendUnconfigured = (err) => err?.code === TVHEADEND_UNCONFIGURED_CODE

export const isTvheadendUrlSet = (url) => Boolean(String(url ?? '').trim())

export const unconfiguredRecordingNow = ({ nowMs }) => ({
  configured: false,
  active: [],
  journeys: [],
  fetchedAt: nowMs,
})

export const unconfiguredRecordingState = ({ nowMs }) => ({
  configured: false,
  standby: false,
  storageInfo: null,
  tunerCount: 0,
  maxConcurrentRecordings: 0,
  activeInputs: [],
  futureRecordings: [],
  skippedRecordings: [],
  repeatRecordings: [],
  upcomingRecordings: [],
  seriesTags: [],
  activeRecordingIds: [],
  fetchedAt: nowMs,
})

export const unconfiguredGuideDay = ({ day, window, prefs, nowMs }) => ({
  configured: false,
  day,
  dayStart: window.dayStart,
  dayEnd: window.dayEnd,
  spillEnd: window.spillEnd,
  fetchedAt: nowMs,
  stale: false,
  ...channelPrefsOf(prefs),
  channels: [],
  programs: {},
  loadingListings: [],
})

export const unconfiguredOnNow = ({ all, prefs, nowMs }) => (all
  ? { configured: false, fetchedAt: nowMs, stale: false, ...channelPrefsOf(prefs), channels: [], entries: [] }
  : { configured: false, entries: [] })

const channelPrefsOf = ({ sort, hideSdSimulcasts, hideSdChannels, hiddenIds }) => ({
  sort,
  hideSdSimulcasts,
  hideSdChannels,
  hiddenIds,
})
