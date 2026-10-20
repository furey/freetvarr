import { ref, onMounted, onUnmounted, watch } from '/vendor/vue.esm-browser.prod.js'
import { syncStatus } from '/shared/sync-status.js'
import { holdAtLeast, PENDING_MIN_MS } from '/pending.js'

export const useMediaQuery = (query) => {
  const list = window.matchMedia(query)
  const matches = ref(list.matches)
  const update = () => { matches.value = list.matches }
  onMounted(() => list.addEventListener('change', update))
  onUnmounted(() => list.removeEventListener('change', update))
  return matches
}

export const useFlash = () => {
  const flashText = ref('')
  const flashKind = ref('ok')
  const flash = ({ msg, kind = 'ok', ms = FLASH_DEFAULT_MS }) => {
    flashText.value = msg
    flashKind.value = kind
    if (ms > 0) setTimeout(() => (flashText.value = ''), ms)
  }
  const flashUntilSyncDone = ({ msg, kind = 'ok' }) => {
    flashText.value = msg
    flashKind.value = kind
    const ourMsg = msg
    const clearIfStillOurs = () => {
      if (flashText.value === ourMsg) flashText.value = ''
    }
    const stop = watch(() => syncStatus.value.activeSyncId, (curr, prev) => {
      if (!curr && prev) {
        clearIfStillOurs()
        stop()
      }
    })
    setTimeout(() => {
      clearIfStillOurs()
      stop()
    }, SYNC_FLASH_SAFETY_MS)
  }
  return { flashText, flashKind, flash, flashUntilSyncDone }
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
