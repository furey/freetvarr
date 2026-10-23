import { resolveRoute, recordingsPageOf } from './route-table.js'
import { showHrefOf, showKeyOf } from './show-key.js'

export const recordingChipOf = ({ active = [], nowMs = Date.now() } = {}) => {
  const recording = active.filter((entry) => !entry.failed)
  if (!recording.length) return null
  if (recording.length > 1) return { label: `Recording ${recording.length} shows`, detail: '' }
  const [only] = recording
  return { label: `Recording ${only.title || 'now'}`, detail: minutesLeftOf({ stop: only.stop, nowMs }) }
}

export const recordingChipTargetOf = ({ active = [], currentHash = '' } = {}) => {
  const titles = active.filter((entry) => !entry.failed).map((entry) => entry.title).filter(Boolean)
  if (new Set(titles.map(showKeyOf)).size !== 1) return { href: SCHEDULED_HREF, originHash: null }
  return { href: showHrefOf(titles[0]), originHash: isLibraryHash(currentHash) ? currentHash : LIBRARY_HREF }
}

export const SCHEDULED_HREF = '#/recordings/scheduled'
export const LIBRARY_HREF = '#/recordings'

const isLibraryHash = (hash) => {
  const { view, params } = resolveRoute(hash)
  return view === 'recordings' && recordingsPageOf(params).page === 'library'
}

const minutesLeftOf = ({ stop, nowMs }) => {
  const stopMs = typeof stop === 'number' ? stop : Date.parse(stop ?? '')
  if (!Number.isFinite(stopMs)) return ''
  const minutes = Math.max(0, Math.ceil((stopMs - nowMs) / 60_000))
  return `${minutes} min left`
}
