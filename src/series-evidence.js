import { db } from './db.js'
import { FOUND_DATABASE_IDS, NO_DATABASE_IDS, mergeSeriesFacts, seriesFactsOf } from './series-kind.js'
import { showKeyOf } from './web/show-key.js'

export const guideEvidenceOf = ({ programmes = [], recordsByKey = new Map() }) => {
  const evidence = new Map()
  for (const [key, airings] of groupByKey(programmes)) {
    const facts = seriesFactsOf(airings.map(guideAiringOf))
    evidence.set(key, { ...facts, awardShow: isAwardShow(recordsByKey.get(key)) })
  }
  return evidence
}

export const changedEvidenceOf = ({ stored, fresh }) => {
  const changed = new Map()
  for (const [key, facts] of fresh) {
    const merged = mergeSeriesFacts(stored.get(key), facts)
    if (!sameFacts(stored.get(key), merged)) changed.set(key, merged)
  }
  return changed
}

export const saveGuideEvidence = async ({ programmes, recordsByKey, nowMs = Date.now() }) => {
  const fresh = guideEvidenceOf({ programmes, recordsByKey })
  const changed = changedEvidenceOf({ stored: await loadSeriesEvidence(), fresh })
  if (!changed.size) return 0
  const rows = [...changed].map(([key, facts]) => ({ show_key: key, facts_json: JSON.stringify(facts), updated_at: nowMs }))
  await db.transaction(async (trx) => {
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      await trx('series_evidence').insert(rows.slice(i, i + CHUNK_SIZE)).onConflict('show_key').merge()
    }
  })
  return changed.size
}

export const loadSeriesEvidence = async () => new Map(
  (await db('series_evidence').select('show_key', 'facts_json', 'database_ids', 'database_ids_at')).map((row) => [row.show_key, evidenceOf(row)]),
)

export const saveDatabaseIds = async ({ key, databaseIds, nowMs = Date.now(), database = db }) => {
  if (!key || !DATABASE_ID_VALUES.has(databaseIds)) return false
  await database('series_evidence')
    .insert({ show_key: key, facts_json: '{}', database_ids: databaseIds, database_ids_at: nowMs, updated_at: nowMs })
    .onConflict('show_key')
    .merge(['database_ids', 'database_ids_at', 'updated_at'])
  return true
}

const evidenceOf = (row) => {
  const facts = parseFacts(row.facts_json)
  if (!row.database_ids) return facts
  return { ...(facts || {}), databaseIds: row.database_ids, databaseIdsAt: Number(row.database_ids_at) || null }
}

const groupByKey = (programmes) => {
  const groups = new Map()
  for (const programme of programmes) {
    const key = showKeyOf(programme?.title)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(programme)
  }
  return groups
}

const guideAiringOf = (programme) => ({
  start: programme.start,
  season: programme.series_no ?? null,
  episode: programme.episode_no ?? null,
  episodeTitle: programme.episode_title ?? null,
  genre: programme.genre ?? null,
})

const isAwardShow = (record) => (record?.genres || []).includes('type:Award Show')

const sameFacts = (a, b) => Boolean(a)
  && FACT_FIELDS.every((field) => (a[field] ?? null) === (b[field] ?? null))

const parseFacts = (json) => {
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

const FACT_FIELDS = ['recurs', 'realSeason', 'sports', 'awardShow', 'minDatedEpisode']
const CHUNK_SIZE = 200
const DATABASE_ID_VALUES = new Set([NO_DATABASE_IDS, FOUND_DATABASE_IDS])
