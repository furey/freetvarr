import { loadedBuild } from '/shared/api.js'
import { browserStorage } from '/shared/storage.js'
import { readViewCache, writeViewCache } from '/view-cache.js'

export const viewStoreOf = (spec) => {
  let latest = null
  let pendingWrite = null

  const cached = (nowMs = Date.now()) => {
    if (latest && spec.isValid(latest, nowMs)) return spec.freshen({ value: latest, nowMs })
    return readViewCache({ storage: browserStorage(), spec, build: VIEW_BUILD, nowMs })
  }

  const keep = (value) => {
    latest = value
    if (pendingWrite) return
    pendingWrite = whenIdle(() => {
      pendingWrite = null
      writeViewCache({ storage: browserStorage(), spec, build: VIEW_BUILD, value: latest })
    })
  }

  return { cached, keep }
}

const VIEW_BUILD = loadedBuild || 'dev'

const IDLE_TIMEOUT_MS = 2000

const whenIdle = (run) => (typeof requestIdleCallback === 'function'
  ? requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS })
  : setTimeout(run, 0)) || true
