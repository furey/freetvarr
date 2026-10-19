import { ref, nextTick } from '/vendor/vue.esm-browser.prod.js'
import { resolveRoute } from '/route-table.js'

const resolveCurrentHash = () => {
  const resolved = resolveRoute(window.location.hash || '')
  if (resolved.canonicalHash) history.replaceState(null, '', resolved.canonicalHash)
  return resolved
}

const initial = resolveCurrentHash()
export const route = ref(initial.view)
export const routeParams = ref(initial.params)
export const routeSection = ref(initial.section)

window.addEventListener('hashchange', () => {
  const resolved = resolveCurrentHash()
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
