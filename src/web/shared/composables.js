import { ref, onMounted, onUnmounted, watch } from '/vendor/vue.esm-browser.prod.js'
import { syncStatus } from '/shared/sync-status.js'
import { holdAtLeast, PENDING_MIN_MS } from '/pending.js'
import { toast, dismissToast } from '/shared/toast.js'

export const useMediaQuery = (query) => {
  const list = window.matchMedia(query)
  const matches = ref(list.matches)
  const update = () => { matches.value = list.matches }
  onMounted(() => list.addEventListener('change', update))
  onUnmounted(() => list.removeEventListener('change', update))
  return matches
}

export const useFlash = () => {
  const flash = ({ msg, kind = 'ok' }) => toast({ text: msg, kind })
  const flashUntilSyncDone = ({ msg, kind = 'ok' }) => {
    const id = toast({ text: msg, kind, persist: true })
    const clear = () => {
      dismissToast(id)
      stop()
      clearTimeout(safetyTimer)
    }
    const stop = watch(() => syncStatus.value.activeSyncId, (curr, prev) => {
      if (!curr && prev) clear()
    })
    const safetyTimer = setTimeout(clear, SYNC_FLASH_SAFETY_MS)
  }
  return { flash, flashUntilSyncDone }
}

export const usePending = ({ minMs = PENDING_MIN_MS } = {}) => {
  const pending = ref(false)
  const run = async (task) => {
    if (pending.value) return undefined
    pending.value = true
    try {
      return await holdAtLeast({ task, minMs })
    } finally {
      pending.value = false
    }
  }
  return { pending, run }
}

export const nextPaint = () => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve))
})

export const FLASH_DEFAULT_MS = 4500

const SYNC_FLASH_SAFETY_MS = 60_000
