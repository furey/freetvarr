export const searchShowsOf = ({ query, keyOf, recordings = [], series = [], limit = MAX_SHOW_RESULTS }) => {
  const needle = foldText(query).trim()
  if (needle.length < 2) return []
  const shows = new Map()
  const showFor = (title) => {
    const key = keyOf(title)
    if (!shows.has(key)) shows.set(key, { key, title, recordingCount: 0, hasRule: false })
    return shows.get(key)
  }
  recordings.filter((row) => row.title).forEach((row) => { showFor(row.title).recordingCount += 1 })
  series.filter((rule) => rule.title).forEach((rule) => { showFor(rule.title).hasRule = true })
  return [...shows.values()]
    .filter((show) => foldText(show.title).includes(needle))
    .sort((a, b) => rankOf(a, needle) - rankOf(b, needle) || a.title.localeCompare(b.title))
    .slice(0, limit)
    .map((show) => ({ key: show.key, title: show.title, meta: showMetaOf(show) }))
}

const foldText = (text) => String(text ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()

const rankOf = (show, needle) => (foldText(show.title).startsWith(needle) ? 0 : 1)

const showMetaOf = ({ recordingCount, hasRule }) => [
  recordingCount === 1 ? '1 recording' : recordingCount > 1 && `${recordingCount} recordings`,
  hasRule && 'Series rule',
].filter(Boolean).join(' · ')

const MAX_SHOW_RESULTS = 8
