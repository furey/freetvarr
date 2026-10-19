export const ROUTES = ['home', 'live', 'guide', 'recordings', 'settings', 'welcome']

export const DEFAULT_ROUTE = 'home'

export const NAV_DESTINATIONS = [
  { key: 'home', label: 'Home', href: '#/home' },
  { key: 'live', label: 'Live TV', href: '#/live' },
  { key: 'guide', label: 'Guide', href: '#/guide' },
  { key: 'recordings', label: 'Recordings', href: '#/recordings' },
  { key: 'settings', label: 'Settings', href: '#/settings' },
]

export const hashSegments = (hash = '') => String(hash)
  .replace(/^#\/?/, '')
  .split('?')[0]
  .split('/')
  .filter(Boolean)
  .map(safeDecode)

export const canonicalSegments = (segments) => {
  const [head = '', ...rest] = segments
  const view = head.toLowerCase()
  if (SHOW_PAGE_ALIASES.includes(view) && rest.length) return ['recordings', 'show', ...rest]
  if (ROUTE_ALIASES[view]) return [...ROUTE_ALIASES[view], ...lowerCase(rest)]
  if (view === 'settings') return ['settings', ...canonicalSettingsPath(lowerCase(rest))]
  if (view === 'recordings' && rest[0]?.toLowerCase() === 'show') return ['recordings', 'show', ...rest.slice(1)]
  return [view, ...lowerCase(rest)]
}

export const resolveRoute = (hash) => {
  const raw = hashSegments(hash)
  const segments = canonicalSegments(raw)
  const [view, ...params] = segments
  if (!ROUTES.includes(view)) return { view: DEFAULT_ROUTE, params: [], section: '', canonicalHash: null }
  const canonicalHash = `#/${segments.map(encodeURIComponent).join('/')}`
  const changed = raw.join('/') !== segments.join('/')
  return { view, params, section: legacySectionOf({ view, params }), canonicalHash: changed ? canonicalHash : null }
}

export const activeDestinationOf = (view) =>
  NAV_DESTINATIONS.some(({ key }) => key === view) ? view : null

export const recordingsPageOf = (params = []) => {
  if (params[0] === 'scheduled') return { page: 'scheduled' }
  if (params[0] === 'show' && params[1]) return { page: 'show', showKey: params[1] }
  return { page: 'library' }
}

const ROUTE_ALIASES = {
  dashboard: ['home'],
  series: ['settings', 'system', 'series'],
  shows: ['settings', 'system', 'series'],
  syncs: ['settings', 'system', 'activity'],
  doctor: ['settings', 'system', 'health'],
}

const SHOW_PAGE_ALIASES = ['series', 'shows']

const SETTINGS_ALIASES = {
  tvheadend: ['system', 'tvheadend'],
  health: ['system', 'health'],
  activity: ['system', 'activity'],
  log: ['system', 'log'],
}

const canonicalSettingsPath = (rest) => {
  const alias = SETTINGS_ALIASES[rest[0]]
  return alias ? [...alias, ...rest.slice(1)] : rest
}

const legacySectionOf = ({ view, params }) => {
  if (view !== 'settings') return params[0] || ''
  if (params[0] !== 'system') return params[0] || ''
  if (params[1] === 'tvheadend') return 'tvheadend'
  return params[2] || ''
}

const lowerCase = (segments) => segments.map((segment) => segment.toLowerCase())

const safeDecode = (segment) => {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}
