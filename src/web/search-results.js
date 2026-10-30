import { episodeMetaParts } from './scheduled-groups.js'
import { buildSearchIndex, searchIndex } from './search-index.js'
import { normaliseSearchText } from './search-text.js'
import { showKeyOf } from './show-key.js'

export const buildShowSearch = ({ keyOf, shows = [], series = [], curated = [], aliases = [] }) => buildSearchIndex({
  entries: showEntriesOf({ keyOf, shows, series }),
  curated,
  aliases,
})

export const searchShowsOf = ({ index, query, limit = MAX_SHOW_RESULTS }) => searchIndex({ index, query, limit })
  .map(({ entry, reason, matchedName }) => ({
    key: entry.key,
    title: entry.title,
    meta: [matchNoteOf({ reason, matchedName, query }), showMetaOf(entry)].filter(Boolean).join(' · '),
    reason,
  }))

export const guideRowsOf = ({ results = [], query, whenOf }) => {
  const notedShows = new Set()
  return results.map((programme) => {
    const showKey = showKeyOf(programme.title)
    const note = notedShows.has(showKey) ? '' : matchNoteOf({ ...programme, query })
    notedShows.add(showKey)
    return {
      key: `${programme.channelId}:${programme.start}`,
      title: programme.title,
      episode: episodeLineOf(programme),
      meta: [note, whenOf(programme.start), programme.channelName].filter(Boolean).join(' · '),
      programme,
    }
  })
}

export const episodeLineOf = ({ title, series_no: seriesNo, episode_no: episodeNo, episode_title: episodeTitle }) => episodeMetaParts({
  seriesNo: seriesNo ?? null,
  episodeNo: episodeNo ?? null,
  episodeTitle: normaliseSearchText(episodeTitle) === normaliseSearchText(title) ? null : episodeTitle,
}).join(' · ')

export const matchNoteOf = ({ reason, matchedName, query }) => {
  if (matchedName && ALIAS_REASONS.has(reason)) return `Also known as ${matchedName}`
  if (reason === 'initials') return `Initials ${String(query ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()}`
  if (reason === 'fuzzy') return 'Did you mean'
  return ''
}

export const showEntriesOf = ({ keyOf, shows = [], series = [] }) => {
  const entries = new Map()
  const entryFor = (title) => {
    const key = keyOf(title)
    if (!entries.has(key)) entries.set(key, { key, title, recordingCount: 0, hasRule: false })
    return entries.get(key)
  }
  shows.filter((show) => show.title).forEach((show) => { entryFor(show.title).recordingCount += Number(show.recordingCount) || 0 })
  series.filter((rule) => rule.title).forEach((rule) => { entryFor(rule.title).hasRule = true })
  return [...entries.values()]
}

const showMetaOf = ({ recordingCount, hasRule }) => [
  recordingCount === 1 ? '1 recording' : recordingCount > 1 && `${recordingCount} recordings`,
  hasRule && 'Series rule',
].filter(Boolean).join(' · ')

const ALIAS_REASONS = new Set(['alias', 'yours', 'known-as'])

const MAX_SHOW_RESULTS = 8
