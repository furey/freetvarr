import { resolveRoute, recordingsPageOf, NAV_DESTINATIONS } from './route-table.js'

export const BACK_FALLBACK = { label: 'Recordings', route: '#/recordings', usesHistory: false }

export const backTargetOf = ({ previousHash, currentHash = '', fallback = BACK_FALLBACK }) => {
  if (!previousHash || previousHash === currentHash) return fallback
  const { view, params } = resolveRoute(previousHash)
  return { label: labelOf({ view, params }), route: previousHash, usesHistory: true }
}

const labelOf = ({ view, params }) => {
  if (view === 'recordings') return recordingsLabelOf(params)
  return NAV_DESTINATIONS.find(({ key }) => key === view)?.label ?? 'Back'
}

const recordingsLabelOf = (params) => {
  const { page } = recordingsPageOf(params)
  if (page === 'scheduled') return 'Scheduled'
  if (page === 'show') return 'Back'
  return 'Recordings'
}

export const entryStateWithOrigin = ({ state, originHash }) => {
  if (state && 'cameFrom' in state) return state
  return { ...(state || {}), cameFrom: originHash || null }
}
