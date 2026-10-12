export const SERIES_SORTS = [
  { key: 'az', label: 'A–Z' },
  { key: 'next', label: 'NEXT AIRING' },
  { key: 'added', label: 'RECENTLY ADDED' },
]

export const SERIES_STATUSES = [
  { key: 'all', label: 'ALL' },
  { key: 'paused', label: 'PAUSED' },
  { key: 'not-in-guide', label: 'NOT IN GUIDE' },
  { key: 'recording-now', label: 'RECORDING NOW' },
]

export const sortSeries = ({ series, sort }) => {
  const compare = SERIES_COMPARATORS[sort] || SERIES_COMPARATORS.az
  return [...series].sort((a, b) => compare(a, b) || byTitle(a, b))
}

export const filterSeries = ({ series, query = '', status = 'all', nowMs = Date.now() }) => {
  const terms = words(query)
  return series.filter((s) =>
    matchesStatus({ series: s, status, nowMs }) && matchesTerms({ terms, haystack: seriesHaystack(s) }))
}

export const filterTitleMatches = ({ titleMatches, query = '' }) => {
  const terms = words(query)
  return titleMatches
    .filter((t) => matchesTerms({ terms, haystack: titleMatchHaystack(t) }))
    .sort((a, b) => compareTitles(a.show_pattern, b.show_pattern))
}

export const titleSortKey = (title) => String(title || '').trim().replace(/^the\s+/i, '')

export const isRecordingNow = ({ series, nowMs }) => {
  const next = series.nextAiring
  return Boolean(next) && next.startDate <= nowMs && nowMs < next.endDate
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

const compareTitles = (a, b) =>
  collator.compare(titleSortKey(a), titleSortKey(b)) || collator.compare(String(a || ''), String(b || ''))

const byTitle = (a, b) => compareTitles(a.title, b.title) || String(a.key).localeCompare(String(b.key))

const missingLast = ({ a, b, compare }) => {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return compare(a, b)
}

const SERIES_COMPARATORS = {
  az: () => 0,
  next: (a, b) => missingLast({
    a: a.nextAiring?.startDate,
    b: b.nextAiring?.startDate,
    compare: (x, y) => x - y,
  }),
  added: (a, b) => missingLast({
    a: a.folder?.created_at,
    b: b.folder?.created_at,
    compare: (x, y) => String(y).localeCompare(String(x)),
  }),
}

const matchesStatus = ({ series, status, nowMs }) => {
  if (status === 'paused') return !series.recording
  if (status === 'not-in-guide') return !series.nextAiring
  if (status === 'recording-now') return isRecordingNow({ series, nowMs })
  return true
}

const seriesHaystack = (s) => normalise([
  s.title,
  ...s.autorecs.map((a) => a.anyChannel ? 'any channel' : a.channelName),
  s.nextAiring?.channelName,
  s.savesTo?.path,
].filter(Boolean).join(' '))

const titleMatchHaystack = (t) => normalise([t.show_pattern, t.dest_folder, t.savesTo?.path]
  .filter(Boolean).join(' '))

const matchesTerms = ({ terms, haystack }) => terms.every((term) => haystack.includes(term))

const normalise = (text) => String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')

const words = (query) => normalise(query).split(/\s+/).filter(Boolean)
