import { db } from './db.js'

export const TITLE_ALIAS = 'alias'
export const VARIANT_CANDIDATE = 'variant-candidate'

export const createTitleAliases = ({ database = db, now = Date.now, keepCandidatesMs = KEEP_CANDIDATES_MS } = {}) => {
  const load = async (source) => {
    const rows = await database('title_aliases').where({ source, kind: TITLE_ALIAS }).select('source_title', 'title')
    return new Map(rows.map((row) => [titleKeyOf(row.source_title), row.title]))
  }

  const save = async ({ source, aliases = [], candidates = [], seenTitles = null }) => {
    const nowMs = now()
    const rows = [
      ...uniqueBy(candidates, (title) => title).map((title) => ({ source_title: title, title: null, kind: VARIANT_CANDIDATE })),
      ...uniqueBy(aliases, (alias) => alias.sourceTitle).map((alias) => ({ source_title: alias.sourceTitle, title: alias.title, kind: TITLE_ALIAS })),
    ].map((row) => ({ ...row, source, first_seen_at: nowMs, last_seen_at: nowMs }))
    for (let index = 0; index < rows.length; index += WRITE_BATCH) {
      await database('title_aliases').insert(rows.slice(index, index + WRITE_BATCH))
        .onConflict(['source', 'source_title'])
        .merge(['title', 'kind', 'last_seen_at'])
    }
    await database('title_aliases').where({ source, kind: VARIANT_CANDIDATE }).where('last_seen_at', '<', nowMs - keepCandidatesMs).delete()
    if (seenTitles) await dropSeenCandidates({ source, seenTitles })
    return rows.length
  }

  const dropSeenCandidates = async ({ source, seenTitles }) => {
    const rows = await database('title_aliases').where({ source, kind: VARIANT_CANDIDATE }).select('id', 'source_title')
    const seen = rows.filter((row) => seenTitles.has(titleKeyOf(row.source_title))).map((row) => row.id)
    for (let index = 0; index < seen.length; index += WRITE_BATCH) {
      await database('title_aliases').whereIn('id', seen.slice(index, index + WRITE_BATCH)).delete()
    }
  }

  const candidates = (source) => database('title_aliases').where({ source, kind: VARIANT_CANDIDATE }).orderBy('source_title').pluck('source_title')

  return { load, save, candidates }
}

export const titleKeyOf = (title) => String(title ?? '').trim().toLowerCase()

const uniqueBy = (items, keyOf) => [...new Map(items.map((item) => [titleKeyOf(keyOf(item)), item])).values()]

const WRITE_BATCH = 200
const KEEP_CANDIDATES_MS = 30 * 24 * 60 * 60_000
