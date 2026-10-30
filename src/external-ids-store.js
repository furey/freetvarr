import { db } from './db.js'
import { showTitleKey } from './show-artwork.js'
import { externalIdKindOf, mergedExternalIdsOf } from './external-ids.js'

export const saveExternalIds = async ({ source, entries, replace = false, seenAt = Date.now() }) => {
  await db.transaction(async (trx) => {
    if (replace) await trx('external_ids').where({ source }).delete()
    for (const entry of entries) {
      await trx('external_ids').insert(rowOf({ entry, source, seenAt })).onConflict(['title_key', 'kind', 'source']).merge()
    }
  })
}

export const loadExternalIds = async ({ title, kind = null }) => {
  const titleKey = showTitleKey(title)
  if (!titleKey) return null
  const rows = await db('external_ids').where({ title_key: titleKey, kind: externalIdKindOf(kind) })
  const ordered = SOURCE_ORDER.map((source) => rows.find((row) => row.source === source)).filter(Boolean)
  return mergedExternalIdsOf(ordered.map(idsOfRow))
}

const rowOf = ({ entry, source, seenAt }) => ({
  title_key: entry.titleKey,
  kind: entry.kind,
  source,
  tvdb_id: entry.ids.tvdb,
  tmdb_id: entry.ids.tmdb,
  imdb_id: entry.ids.imdb,
  seen_at: seenAt,
})

const idsOfRow = (row) => ({ tvdb: row.tvdb_id, tmdb: row.tmdb_id, imdb: row.imdb_id })

const SOURCE_ORDER = ['plex', 'sonarr']
