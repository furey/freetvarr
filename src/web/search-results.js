import { failureText } from './shared/request-errors.js'
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

export const guideRowsOf = ({ results = [], query, whenOf, stateTextOf = () => '' }) => {
  const notedShows = new Set()
  return results.map((programme) => {
    const showKey = showKeyOf(programme.title)
    const note = notedShows.has(showKey) ? '' : matchNoteOf({ ...programme, query })
    notedShows.add(showKey)
    const group = programme.group || 'guide'
    const stateText = STATE_TEXT_GROUPS.has(group) ? stateTextOf(programme) : ''
    return {
      key: `${programme.channelId}:${programme.start}`,
      group,
      title: programme.title,
      episode: episodeLineOf(programme),
      meta: [stateText, note, whenOf(programme.start), programme.channelName].filter(Boolean).join(' · '),
      programme,
    }
  })
}

export const searchGroupsOf = ({ shows = [], programmes = [], expanded = new Set(), limit = GROUP_ROW_LIMIT }) => {
  const rowsByGroup = new Map([['recordings', shows.map((show) => ({ ...show, kind: 'show' }))]])
  for (const programme of programmes) {
    const rows = rowsByGroup.get(programme.group) || []
    rowsByGroup.set(programme.group, [...rows, { ...programme, kind: 'programme' }])
  }
  return GROUP_ORDER
    .filter((key) => rowsByGroup.get(key)?.length)
    .map((key) => {
      const rows = rowsByGroup.get(key)
      const isCapped = rows.length > limit && !expanded.has(key)
      const label = SEARCH_GROUP_LABELS[key]
      const isTotalKnown = key === 'recordings' ? shows.length < MAX_SHOW_RESULTS : programmes.length < MAX_GUIDE_RESULTS
      return {
        key,
        label,
        rows: isCapped ? rows.slice(0, limit) : rows,
        total: rows.length,
        isCapped,
        ...showAllLabelsOf({ label, total: rows.length, isTotalKnown }),
      }
    })
}

export const showAllLabelsOf = ({ label, total, isTotalKnown }) => ({
  showAllText: isTotalKnown ? `Show all ${total}` : 'Show all',
  showAllLabel: isTotalKnown ? `Show all ${total} in ${label}` : `Show all in ${label}`,
})

export const remainingBusyMs = ({ startedAt, nowMs, minimum = MIN_SEARCHING_MS }) => Math.max(0, minimum - (nowMs - startedAt))

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

export const guideSearchOutcomeOf = async (request) => {
  try {
    const body = await request()
    return { results: body?.results || [], failure: '' }
  } catch (err) {
    return { results: [], failure: failureText({ action: 'Could not search the guide', err }) }
  }
}

const showMetaOf = ({ recordingCount, hasRule }) => [
  recordingCount === 1 ? '1 recording' : recordingCount > 1 && `${recordingCount} recordings`,
  hasRule && 'Series rule',
].filter(Boolean).join(' · ')

const SEARCH_GROUP_LABELS = { scheduled: 'Scheduled', series: 'Series', recordings: 'Recordings', 'for-you': 'For you', guide: 'TV guide' }
const GROUP_ORDER = ['scheduled', 'series', 'recordings', 'for-you', 'guide']
const STATE_TEXT_GROUPS = new Set(['scheduled', 'series'])
export const GROUP_ROW_LIMIT = 5
const MIN_SEARCHING_MS = 800
const ALIAS_REASONS = new Set(['alias', 'yours', 'known-as'])

export const MAX_SHOW_RESULTS = 8
export const MAX_GUIDE_RESULTS = 30
