import { resolveRoute, recordingsPageOf } from './route-table.js'
import { showHrefOf, showKeyOf } from './show-key.js'
import { recordingLeftText } from './recording-time-left.js'

export const recordingChipOf = ({ active = [], nowMs = Date.now() } = {}) => {
  const recording = active.filter((entry) => !entry.failed)
  if (!recording.length) return null
  if (recording.length > 1) {
    const label = `Recording ${recording.length} shows`
    const titles = recording.map((entry) => entry.title).filter(Boolean).join(', ')
    return { label, detail: '', bannerTitle: titles || label, bannerDetail: titles ? label : '' }
  }
  const [only] = recording
  const detail = recordingLeftText({ recording: only, nowMs })
  return {
    label: `Recording ${only.title || 'now'}`,
    detail,
    bannerTitle: only.title || 'Recording now',
    bannerDetail: only.title ? joinMeta(['Recording', detail]) : detail,
  }
}

const joinMeta = (parts) => parts.filter(Boolean).join(' · ')

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
