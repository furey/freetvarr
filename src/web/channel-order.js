import { sdSimulcastIds } from './simulcast.js'

// Pinned channels float to the top in pin order; the rest follow in the chosen
// sort. Hidden and pinned are mutually exclusive (enforced on save).
export const orderChannels = ({ channels, pinnedIds = [], hiddenIds = [], sort = 'default', hideSdSimulcasts = false, hideSdChannels = false }) => {
  const hiddenSet = new Set(hiddenIds.map(String))
  const simulcastSet = hideSdSimulcasts && !hideSdChannels ? sdSimulcastIds(channels) : new Set()
  const pinOrder = new Map(pinnedIds.map((id, i) => [String(id), i]))
  const annotated = channels.map((c) => {
    const pinned = pinOrder.has(String(c.id))
    const id = String(c.id)
    return { ...c, pinned, hidden: !pinned && (hiddenSet.has(id) || simulcastSet.has(id) || (hideSdChannels && !c.hd)) }
  })
  const pinned = annotated
    .filter((c) => c.pinned)
    .sort((a, b) => pinOrder.get(String(a.id)) - pinOrder.get(String(b.id)))
  const rest = annotated.filter((c) => !c.pinned)
  if (sort === 'name') {
    rest.sort((a, b) => a.name.localeCompare(b.name, 'en-AU', { numeric: true, sensitivity: 'base' }))
  } else if (sort === 'number') {
    rest.sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity))
  }
  return [...pinned, ...rest]
}
