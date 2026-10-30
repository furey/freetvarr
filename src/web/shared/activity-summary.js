import { ref } from '/vendor/vue.esm-browser.prod.js'
import { api } from '/shared/api.js'

export const runningJobs = ref(0)

const SUMMARY_POLL_MS = 15_000
let watchers = 0
let timer = null

const loadSummary = async () => {
  if (document.visibilityState !== 'visible') return
  try {
    runningJobs.value = (await api('GET', '/api/activity/summary')).running ?? 0
  } catch {}
}

export const watchRunningJobs = () => {
  watchers += 1
  if (!timer) {
    loadSummary()
    timer = setInterval(loadSummary, SUMMARY_POLL_MS)
  }
  return () => {
    watchers -= 1
    if (watchers > 0 || !timer) return
    clearInterval(timer)
    timer = null
  }
}
