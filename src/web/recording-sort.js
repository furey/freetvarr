export const RECORDING_SORTS = [
  { key: 'newest', label: 'NEWEST', column: 'aired_at', dir: 'desc' },
  { key: 'oldest', label: 'OLDEST', column: 'aired_at', dir: 'asc' },
  { key: 'az', label: 'A–Z', column: 'title', dir: 'asc' },
  { key: 'show', label: 'SHOW A–Z', column: 'show_pattern', dir: 'asc' },
  { key: 'imported', label: 'RECENTLY IMPORTED', column: 'imported_at', dir: 'desc' },
  { key: 'largest', label: 'LARGEST', column: 'size', dir: 'desc' },
]

export const recordingSortFor = (key) => RECORDING_SORTS.find((s) => s.key === key) ?? RECORDING_SORTS[0]

export const headerSortKey = ({ column, current }) => {
  if (column === 'aired_at') return current === 'newest' ? 'oldest' : 'newest'
  return RECORDING_SORTS.find((s) => s.column === column)?.key ?? current
}
