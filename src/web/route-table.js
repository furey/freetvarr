export const ROUTES = ['home', 'for-you', 'live', 'guide', 'recordings', 'settings', 'welcome']

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
  const segments = carriesLogFilters({ raw, hash }) ? ['settings', 'system', 'log'] : canonicalSegments(raw)
  const [view, ...params] = segments
  if (!ROUTES.includes(view)) return { view: DEFAULT_ROUTE, params: [], section: '', canonicalHash: null }
  const canonicalHash = `#/${segments.map(encodeURIComponent).join('/')}${queryOf(hash)}`
  const changed = raw.join('/') !== segments.join('/')
  return { view, params, section: legacySectionOf({ view, params }), canonicalHash: changed ? canonicalHash : null }
}

export const activeDestinationOf = (view) => {
  const destination = NAV_PARENTS[view] ?? view
  return NAV_DESTINATIONS.some(({ key }) => key === destination) ? destination : null
}

const NAV_PARENTS = { 'for-you': 'home' }

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

const LOG_FILTER_PARAMS = ['status', 'since', 'deleted', 'sort', 'dir', 'show', 'show_id', 'when', 'page']

const carriesLogFilters = ({ raw, hash }) => {
  if (raw.length !== 1 || raw[0].toLowerCase() !== 'recordings') return false
  const query = new URLSearchParams(queryOf(hash))
  return LOG_FILTER_PARAMS.some((param) => query.has(param))
}

const queryOf = (hash) => {
  const index = String(hash).indexOf('?')
  return index === -1 ? '' : String(hash).slice(index)
}

const lowerCase = (segments) => segments.map((segment) => segment.toLowerCase())

const safeDecode = (segment) => {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}
