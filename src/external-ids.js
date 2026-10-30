import { showTitleKey } from './show-artwork.js'

export const EXTERNAL_ID_KINDS = { series: 'series', movie: 'movie' }

export const externalIdsOfGuids = (guids) => {
  const ids = {}
  for (const guid of Array.isArray(guids) ? guids : []) {
    const match = String(guid?.id ?? '').match(PLEX_GUID)
    if (match && !ids[match[1]]) ids[match[1]] = match[2]
  }
  return idsOrNull(ids)
}

export const externalIdsOfSeries = (series) => idsOrNull({
  tvdb: positiveIdOf(series?.tvdbId),
  tmdb: positiveIdOf(series?.tmdbId),
  imdb: imdbIdOf(series?.imdbId),
})

export const hasExternalIds = (ids) => Boolean(ids && (ids.tvdb || ids.tmdb || ids.imdb))

export const externalIdsKeyOf = (ids) => (hasExternalIds(ids)
  ? ID_NAMES.filter((name) => ids[name]).map((name) => `${name}-${ids[name]}`).join('.')
  : '')

export const idKeyedCacheKeyOf = ({ cacheKey, ids }) => (hasExternalIds(ids) ? `${cacheKey}@${externalIdsKeyOf(ids)}` : cacheKey)

export const externalIdsOf = async ({ externalIdsFor, title, kind }) => {
  const ids = await Promise.resolve().then(() => externalIdsFor({ title, kind })).catch(() => null)
  return hasExternalIds(ids) ? ids : null
}

export const mergedExternalIdsOf = (list) => idsOrNull(Object.fromEntries(ID_NAMES
  .map((name) => [name, list.map((ids) => ids?.[name]).find(Boolean) || null])))

export const tmdbIdOfExternalIds = async ({ ids, type, findTmdb }) => {
  if (ids.tmdb) return ids.tmdb
  for (const [source, id] of [['tvdb_id', ids.tvdb], ['imdb_id', ids.imdb]]) {
    if (!id) continue
    const found = await findTmdb({ source, id })
    const result = (type === 'movie' ? found?.movie_results : found?.tv_results)?.[0]
    if (result?.id != null) return String(result.id)
  }
  return null
}

export const externalIdKindOf = (kind) => (kind === 'movie' ? EXTERNAL_ID_KINDS.movie : EXTERNAL_ID_KINDS.series)

export const plexExternalIdEntriesOf = ({ items = [], kind }) => entriesOf(items
  .map((item) => ({ title: item?.title, kind, ids: externalIdsOfGuids(item?.Guid) })))

export const sonarrExternalIdEntriesOf = (series = []) => entriesOf((Array.isArray(series) ? series : [])
  .map((entry) => ({ title: entry?.title, kind: EXTERNAL_ID_KINDS.series, ids: externalIdsOfSeries(entry) })))

const entriesOf = (candidates) => [...new Map(candidates
  .map(({ title, kind, ids }) => ({ titleKey: showTitleKey(title), kind, ids }))
  .filter((entry) => entry.titleKey && entry.ids)
  .map((entry) => [`${entry.kind}|${entry.titleKey}`, entry])).values()]

const idsOrNull = (ids) => {
  const kept = Object.fromEntries(ID_NAMES.map((name) => [name, ids[name] ? String(ids[name]) : null]))
  return hasExternalIds(kept) ? kept : null
}

const positiveIdOf = (value) => (Number.isInteger(Number(value)) && Number(value) > 0 ? String(Number(value)) : null)

const imdbIdOf = (value) => (IMDB_ID.test(String(value ?? '')) ? String(value) : null)

const ID_NAMES = ['tmdb', 'tvdb', 'imdb']
const PLEX_GUID = /^(tvdb|tmdb|imdb):\/\/([A-Za-z0-9]+)$/
const IMDB_ID = /^tt\d+$/
