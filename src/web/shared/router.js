import { ref, nextTick } from '/vendor/vue.esm-browser.prod.js'

const ROUTES = ['dashboard', 'live', 'guide', 'series', 'syncs', 'recordings', 'settings', 'doctor', 'welcome']
const DEFAULT_ROUTE = 'dashboard'
const ROUTE_ALIASES = { shows: 'series' }

const hashSegments = () => (window.location.hash || '').replace(/^#\/?/, '').toLowerCase().split('/')

const parseHash = () => {
  const [segment] = hashSegments()
  const view = ROUTE_ALIASES[segment] || segment
  return ROUTES.includes(view) ? view : DEFAULT_ROUTE
}

const parseHashSection = () => hashSegments()[1] || ''

const canonicaliseHash = () => {
  const [segment, ...rest] = hashSegments()
  const view = ROUTE_ALIASES[segment]
  if (view) history.replaceState(null, '', `#/${[view, ...rest].join('/')}`)
}

canonicaliseHash()
export const route = ref(parseHash())
export const routeSection = ref(parseHashSection())
window.addEventListener('hashchange', () => {
  canonicaliseHash()
  route.value = parseHash()
  routeSection.value = parseHashSection()
})

const ROUTE_SECTION_ALIASES = { about: 'help' }

export const routeSectionId = () => ROUTE_SECTION_ALIASES[routeSection.value] || routeSection.value

export const scrollToRouteSection = async () => {
  if (!routeSection.value) return
  await nextTick()
  const behavior = document.visibilityState === 'visible' ? 'smooth' : 'auto'
  document.getElementById(`section-${routeSectionId()}`)?.scrollIntoView({ behavior, block: 'start' })
}
