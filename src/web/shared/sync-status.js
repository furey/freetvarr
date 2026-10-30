import { ref, watch } from '/vendor/vue.esm-browser.prod.js'
import { api } from '/shared/api.js'

export const syncStatus = ref({ activeSyncId: null, cron: '' })
let syncPollTimer = null

export const loadSyncStatus = async () => {
  try {
    syncStatus.value = await api('GET', '/api/sync-status')
  } catch {
    /* leave previous value */
  }
  return syncStatus.value
}

const stopSyncPolling = () => {
  if (syncPollTimer) clearInterval(syncPollTimer)
  syncPollTimer = null
}

export const ensureSyncPolling = () => {
  if (syncPollTimer || !syncStatus.value.activeSyncId) return
  syncPollTimer = setInterval(async () => {
    await loadSyncStatus()
    if (!syncStatus.value.activeSyncId) stopSyncPolling()
  }, 3000)
}

watch(() => syncStatus.value.activeSyncId, (curr) => {
  if (curr) ensureSyncPolling()
})
