const LONG_WAIT_MINUTES = 60

export const minutesLeft = ({ program, nowMs }) =>
  Math.max(0, Math.ceil((program.end - nowMs) / 60_000))

export const timeLeftLabel = ({ program, nowMs, clockText }) => {
  const minutes = minutesLeft({ program, nowMs })
  return minutes < LONG_WAIT_MINUTES ? `${minutes} min left` : `until ${clockText(program.end)}`
}

export const nextLabel = ({ next, clockText }) => (next ? `${next.title} · ${clockText(next.start)}` : '')

export const phoneMetaLine = ({ program, next, nowMs, clockText }) => {
  const left = timeLeftLabel({ program, nowMs, clockText })
  return next ? `${left} · Next ${next.title}` : left
}

export const groupsOf = ({ entries, favouritesOnly, groupLabelOf }) => {
  const pinned = entries.filter((e) => e.channel.pinned)
  const rest = favouritesOnly ? [] : entries.filter((e) => !e.channel.pinned)
  const anyPinned = pinned.length > 0
  return [
    ...(anyPinned ? [{ key: 'pinned', label: groupLabelOf({ pinned: true }), entries: pinned }] : []),
    ...(rest.length ? [{ key: 'other', label: groupLabelOf({ pinned: false, anyPinned }), entries: rest }] : []),
  ]
}

export const matchesFilter = ({ entry, query }) => {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [entry.channel.name, entry.channel.number, entry.now?.title, entry.next?.title]
    .some((v) => v != null && String(v).toLowerCase().includes(q))
}
