import { computed, ref, shallowRef } from '/vendor/vue.esm-browser.prod.js'
import { recordingProgramIdsOf } from '/live-record.js'
import { watchedKeysOf } from '/programme-sheet.js'
import {
  channelHintOf,
  guideDayOffsetOf,
  isSeriesScheduledOf,
  programmeOfUpcoming,
  programmeStateOf,
  recordingStateTextOf,
  scheduledByProgramIdOf,
  seriesLinkSetOf,
} from '/programme-state.js'
import { showKeyOf } from '/show-key.js'
import { programmeOpenedOf } from '/for-you.js'
import { api } from '/shared/api.js'
import { recordingNow } from '/shared/recording-now.js'
import { now, tsOfMs, tz } from '/shared/time.js'

export const epgState = ref(null)
export const watchItems = ref([])
export const libraryDefault = ref(true)

export const loadEpgState = async ({ fresh = false } = {}) => {
  try {
    epgState.value = await api('GET', `/api/epg/state${fresh ? '?fresh=1' : ''}`)
    loadedAt.state = Date.now()
  } catch { /* keep the last state */ }
}

export const loadWatchlist = async () => {
  try {
    watchItems.value = (await api('GET', '/api/watchlist')).items || []
  } catch {
    watchItems.value = []
  }
  loadedAt.watchlist = Date.now()
}

export const loadLibraryDefault = async () => {
  try {
    libraryDefault.value = (await api('GET', '/api/recording-defaults')).add_to_library !== false
  } catch {
    libraryDefault.value = true
  }
  loadedAt.libraryDefault = Date.now()
}

export const scheduledByProgramId = computed(() => scheduledByProgramIdOf(epgState.value?.futureRecordings || []))

export const activeRecordingSet = computed(() => new Set([
  ...(epgState.value?.activeRecordingIds || []).map(String),
  ...recordingProgramIdsOf(recordingNow.value.active),
]))

export const seriesLinkSet = computed(() => seriesLinkSetOf(epgState.value?.seriesTags || []))

export const seriesTags = computed(() => epgState.value?.seriesTags || [])

export const watchedKeys = computed(() => watchedKeysOf(watchItems.value))

export const cellState = (programme) => programmeStateOf({
  programme,
  scheduledByProgramId: scheduledByProgramId.value,
  activeRecordingSet: activeRecordingSet.value,
  seriesLinks: seriesLinkSet.value,
})

export const isSeriesScheduled = (programme) => isSeriesScheduledOf({
  programme,
  scheduledByProgramId: scheduledByProgramId.value,
  seriesLinks: seriesLinkSet.value,
})

export const isWatched = (programme) => watchedKeys.value.has(showKeyOf(programme.title))

export const recordingStateText = (programme) => recordingStateTextOf({
  state: cellState(programme),
  seriesScheduled: isSeriesScheduled(programme),
  past: programme.past,
  watched: isWatched(programme),
})

export const programmeSheetFor = async ({ channelId, startMs }) => {
  const key = `${channelId}|${startMs}`
  const cached = programmeSheets.get(key)
  if (cached && !isOlderThan(cached.at, PROGRAMME_SHEET_FRESH_MS)) return cached.sheet
  const sheet = await api('GET', `/api/epg/programme?channel=${encodeURIComponent(channelId)}&start=${startMs}`)
  programmeSheets.set(key, { at: Date.now(), sheet })
  return sheet
}

export const refreshSheetData = ({ freshState = false } = {}) => Promise.all([
  (freshState || isOlderThan(loadedAt.state, SHEET_DATA_FRESH_MS)) && loadEpgState({ fresh: freshState }),
  isOlderThan(loadedAt.watchlist, SHEET_DATA_FRESH_MS) && loadWatchlist(),
  !loadedAt.libraryDefault && loadLibraryDefault(),
])

export const sheetDataFor = ({ freshState = false } = {}) => {
  const refresh = refreshSheetData({ freshState })
  return freshState || !loadedAt.state || !loadedAt.watchlist || !loadedAt.libraryDefault ? refresh : Promise.resolve()
}

export const programmeSheetRequest = shallowRef(null)

export const programmeSheetOpen = computed(() => Boolean(programmeSheetRequest.value))

export const guideDayOffsetFor = (programme) =>
  guideDayOffsetOf({ startMs: programme.start, nowMs: now.value.getTime(), timeZone: tz.value })

export const useProgrammeSheet = () => ({ openProgramme, openUpcoming, closeProgramme, programmeSheetOpen })

const openProgramme = ({ channelId, programme, channel = null, channelHint = null, guideDay = null, focus = '', dayOffset = null, freshState = false }) => {
  programmeSheetRequest.value = {
    id: ++requestCount,
    channelId: channelId ?? programme.channelId,
    programme,
    channel,
    channelHint: channelHintOf({ channel: channelHint ?? channel, programme }),
    guideDay,
    focus,
    dayOffset: dayOffset ?? guideDayOffsetFor(programme),
    freshState,
  }
  noteProgrammeOpened({ programme, channelId: channelId ?? programme.channelId })
}

const noteProgrammeOpened = ({ programme, channelId }) => {
  if (!programme?.title) return
  api('POST', '/api/events/feedback', programmeOpenedOf({ programme, channelId })).catch(() => {})
}

const openUpcoming = (upcoming) => openProgramme({
  channelId: upcoming.channelId,
  channelHint: { name: upcoming.channelName },
  programme: programmeOfUpcoming({ upcoming, msOf: tsOfMs }),
})

const closeProgramme = () => { programmeSheetRequest.value = null }

const isOlderThan = (at, ms) => Date.now() - at > ms

const SHEET_DATA_FRESH_MS = 30_000
const PROGRAMME_SHEET_FRESH_MS = 120_000
const programmeSheets = new Map()
const loadedAt = { state: 0, watchlist: 0, libraryDefault: 0 }
let requestCount = 0
