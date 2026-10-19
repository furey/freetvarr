import { ref, nextTick } from '/vendor/vue.esm-browser.prod.js'
import { resolveRoute } from '/route-table.js'
import { entryStateWithOrigin } from '/back-target.js'

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

const stampOrigin = (originHash) => {
  history.replaceState(entryStateWithOrigin({ state: history.state, originHash }), '')
  cameFromHash.value = history.state.cameFrom
}

window.addEventListener('hashchange', () => {
  const resolved = resolveCurrentHash()
  stampOrigin(currentHash)
  currentHash = window.location.hash
  route.value = resolved.view
  routeParams.value = resolved.params
  routeSection.value = resolved.section
})

export const navigate = (hash) => {
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
