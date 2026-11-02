import { ref, nextTick } from '/vendor/vue.esm-browser.prod.js'
import { resolveRoute } from '/route-table.js'
import { entryStateWithOrigin, replacedEntryStateOf } from '/back-target.js'
import { createScrollMemory, entryStateWithKey, canReachTop } from '/scroll-memory.js'

const resolveCurrentHash = () => {
  const resolved = resolveRoute(window.location.hash || '')
  if (resolved.canonicalHash) history.replaceState(history.state, '', resolved.canonicalHash)
  return resolved
}

const initial = resolveCurrentHash()
export const route = ref(initial.view)
export const routeParams = ref(initial.params)
export const routeSection = ref(initial.section)

let currentHash = window.location.hash
export const cameFromHash = ref(history.state?.cameFrom ?? null)
export const cameFromHistory = ref(!history.state?.cameFromOutsideHistory)

let originOverride = null

const stampOrigin = (originHash) => {
  const origin = originOverride ?? originHash
  originOverride = null
  history.replaceState(entryStateWithOrigin({ state: history.state, originHash: origin, inHistory: origin === originHash }), '')
  cameFromHash.value = history.state.cameFrom
  cameFromHistory.value = !history.state.cameFromOutsideHistory
}

const scrollMemory = createScrollMemory()

const stampEntryKey = (key) => {
  history.replaceState(entryStateWithKey({ state: history.state, key }), '')
  return key
}

if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
let arrival = { fresh: !history.state?.entryKey, sameView: false, at: performance.now() }
export const latestArrival = () => arrival
let currentEntryKey = stampEntryKey(history.state?.entryKey || scrollMemory.arrive(null).key)

const RESTORE_LIMIT_MS = 1500
const USER_SCROLL_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown']

const maxScrollY = () => document.documentElement.scrollHeight - window.innerHeight

const restoreScroll = (top) => {
  if (top <= 0) return window.scrollTo({ top: 0 })
  const startedAt = performance.now()
  let cancelled = false
  const cancel = () => { cancelled = true }
  USER_SCROLL_EVENTS.forEach((type) => window.addEventListener(type, cancel, { once: true, passive: true }))
  const stop = () => USER_SCROLL_EVENTS.forEach((type) => window.removeEventListener(type, cancel))
  const attempt = () => {
    if (cancelled) return stop()
    const reachable = canReachTop({ top, maxScrollY: maxScrollY() })
    const expired = performance.now() - startedAt > RESTORE_LIMIT_MS
    if (reachable || expired) {
      window.scrollTo({ top })
      return stop()
    }
    requestAnimationFrame(attempt)
  }
  requestAnimationFrame(attempt)
}

const scrollForArrival = async (view) => {
  scrollMemory.leave({ key: currentEntryKey, scrollY: window.scrollY })
  arrival = { fresh: !history.state?.entryKey, sameView: view === route.value, at: performance.now() }
  const { key, top } = scrollMemory.arrive(history.state)
  currentEntryKey = stampEntryKey(key)
  await nextTick()
  restoreScroll(top)
}

window.addEventListener('hashchange', () => {
  const resolved = resolveCurrentHash()
  stampOrigin(currentHash)
  currentHash = window.location.hash
  scrollForArrival(resolved.view)
  route.value = resolved.view
  routeParams.value = resolved.params
  routeSection.value = resolved.section
})

export const navigate = (hash) => {
  window.location.hash = hash
}

export const replaceHash = (hash) => {
  if (window.location.hash === hash) return
  history.replaceState(replacedEntryStateOf(history.state), '', hash)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

export const navigateFrom = ({ hash, originHash }) => {
  if (window.location.hash === hash) return
  originOverride = originHash || null
  window.location.hash = hash
}

const ROUTE_SECTION_ALIASES = { about: 'help', reset: 'danger-zone' }

export const routeSectionId = () => ROUTE_SECTION_ALIASES[routeSection.value] || routeSection.value

export const scrollToRouteSection = async () => {
  if (!routeSection.value) return
  await nextTick()
  const behavior = document.visibilityState === 'visible' ? 'smooth' : 'auto'
  document.getElementById(`section-${routeSectionId()}`)?.scrollIntoView({ behavior, block: 'start' })
}
