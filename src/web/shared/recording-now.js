import { ref, computed, watch } from '/vendor/vue.esm-browser.prod.js'
import { api } from '/shared/api.js'
import { setFaviconRecording } from '/shared/favicon.js'
import { live } from '/shared/player-shared.js'
import { recordingSetKeyOf } from '/in-progress-display.js'

export const recordingNow = ref({ active: [], journeys: [], finishing: [] })
let recordingNowTimer = null

export const recordingCount = computed(() => recordingNow.value.active.length)

const recordingNowBusy = computed(() =>
  recordingNow.value.active.length > 0 || recordingNow.value.journeys.length > 0 || (recordingNow.value.finishing || []).length > 0)

export const recordingSetKey = computed(() => recordingSetKeyOf(recordingNow.value))

const loadRecordingNow = async () => {
  try {
    recordingNow.value = await api('GET', '/api/recording-now')
  } catch {
    recordingNow.value = { active: [], journeys: [], finishing: [] }
  }
}

export const pollRecordingNow = async () => {
  clearTimeout(recordingNowTimer)
  await loadRecordingNow()
  const fast = (recordingNowBusy.value || live.open) && !document.hidden
  recordingNowTimer = setTimeout(pollRecordingNow, fast ? RECORDING_NOW_FAST_POLL_MS : RECORDING_NOW_IDLE_POLL_MS)
}

export const recordingChangeTick = ref(0)
let recordingChangeTimers = []

export const refreshAfterRecordingChange = () => {
  recordingChangeTimers.forEach(clearTimeout)
  recordingChangeTimers = RECORDING_CHANGE_REFRESH_MS.map((ms) => setTimeout(() => {
    recordingChangeTick.value += 1
    pollRecordingNow()
  }, ms))
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && (recordingNowBusy.value || live.open)) pollRecordingNow()
})

watch(recordingCount, (count) => {
  document.title = count > 0 ? `● REC · ${APP_TITLE}` : APP_TITLE
  setFaviconRecording(count > 0)
})

const APP_TITLE = 'Freetvarr'
const RECORDING_NOW_FAST_POLL_MS = 5_000
const RECORDING_NOW_IDLE_POLL_MS = 45_000
const RECORDING_CHANGE_REFRESH_MS = [0, 2_000, 6_000]

const recordingChannelIds = computed(() =>
  new Set(recordingNow.value.active.filter((r) => !r.failed).map((r) => String(r.channelId))))

export const isRecordingChannel = (channelId) => recordingChannelIds.value.has(String(channelId))
