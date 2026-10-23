import { resolveRoute, recordingsPageOf, NAV_DESTINATIONS } from './route-table.js'

export const BACK_FALLBACK = { label: 'Library', route: '#/recordings', usesHistory: false }

export const backTargetOf = ({ previousHash, currentHash = '', fallback = BACK_FALLBACK, inHistory = true }) => {
  if (!previousHash || previousHash === currentHash) return fallback
  const { view, params } = resolveRoute(previousHash)
  return { label: labelOf({ view, params }), route: previousHash, usesHistory: inHistory }
}

const labelOf = ({ view, params }) => {
  if (view === 'recordings') return recordingsLabelOf(params)
  return NAV_DESTINATIONS.find(({ key }) => key === view)?.label ?? 'Back'
}

const recordingsLabelOf = (params) => {
  const { page } = recordingsPageOf(params)
  if (page === 'scheduled') return 'Scheduled'
  if (page === 'show') return 'Back'
  return 'Library'
}

export const entryStateWithOrigin = ({ state, originHash, inHistory = true }) => {
  if (state && 'cameFrom' in state) return state
  return { ...(state || {}), cameFrom: originHash || null, ...(inHistory ? {} : { cameFromOutsideHistory: true }) }
}
