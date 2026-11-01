import { NO_DATABASE_IDS, databaseIdsOf, isMostlySport, rowAiringOf } from './series-kind.js'
import { saveDatabaseIds } from './series-evidence.js'
import { showKeyOf } from './web/show-key.js'
import { isUserFolderRow } from './show-origin.js'

export const needsDatabaseIds = ({ recordings, evidence = null, override = null, hasRule = false, nowMs = Date.now() }) =>
  !CHOSEN_KINDS.has(override) && !hasRule && isUnsettled({ evidence, nowMs }) && isMostlySport(recordings)

const isUnsettled = ({ evidence, nowMs }) => {
  if (evidence?.databaseIds == null) return true
  if (evidence.databaseIds !== NO_DATABASE_IDS) return false
  return !evidence.databaseIdsAt || nowMs - evidence.databaseIdsAt >= RECHECK_NONE_MS
}

export const lookUpDatabaseIds = async ({ key, request, identityFor, evidence = null, save = saveDatabaseIds, nowMs = Date.now() }) => {
  const match = await Promise.resolve().then(() => identityFor({ ...request, wait: INLINE_WAIT_MS })).catch(() => null)
  const databaseIds = databaseIdsOf(match)
  if (databaseIds) return keepDatabaseIds({ key, databaseIds, evidence, save, nowMs })
  if (match?.state === 'pending') settleLater({ key, request, identityFor, save })
  return null
}

export const settleDatabaseIds = async ({
  inputs,
  identityFor,
  limit = MAX_LOOKUPS_PER_PASS,
  save = saveDatabaseIds,
  retries = retryAfterByKey,
  nowMs = Date.now(),
}) => {
  const showsById = new Map((inputs.shows ?? []).map((show) => [show.id, show]))
  const candidates = [...groupBy(inputs.rows ?? [], groupKeyOf)]
    .filter(([key]) => (retries.get(key) ?? 0) <= nowMs)
    .filter(([key, group]) => needsDatabaseIds({
      recordings: group.map(rowAiringOf),
      evidence: inputs.evidence.get(key) ?? null,
      override: inputs.overrides?.get(key) ?? null,
      hasRule: inputs.ruleKeys?.has(key) || group.some(isUserFolderRow),
      nowMs,
    }))
    .sort(([a], [b]) => (retries.get(a) ?? 0) - (retries.get(b) ?? 0))
  for (const [key, group] of candidates.slice(0, limit)) {
    const known = inputs.evidence.get(key)?.databaseIds
    const fromFolder = known ? null : databaseIdsOfShow(showsById.get(group.find((row) => row.show_id != null)?.show_id))
    if (fromFolder) {
      await keepDatabaseIds({ key, databaseIds: fromFolder, evidence: inputs.evidence, save, nowMs })
      continue
    }
    retries.set(key, nowMs + RETRY_LOOKUP_MS)
    await lookUpDatabaseIds({ key, request: requestOfRow(group[0]), identityFor, evidence: inputs.evidence, save, nowMs })
  }
}

export const databaseIdsOfShow = (show) => (show
  ? databaseIdsOf({ state: show.identity_state, identity: { tvdbId: show.tvdb_id, tmdbId: show.tmdb_id } })
  : null)

const keepDatabaseIds = async ({ key, databaseIds, evidence, save, nowMs = Date.now() }) => {
  await Promise.resolve().then(() => save({ key, databaseIds, nowMs })).catch(() => false)
  evidence?.set(key, { ...(evidence.get(key) || {}), databaseIds, databaseIdsAt: nowMs })
  return databaseIds
}

const settleLater = ({ key, request, identityFor, save }) => Promise.resolve()
  .then(() => identityFor({ ...request, wait: BACKGROUND_WAIT_MS }))
  .then((match) => {
    const databaseIds = databaseIdsOf(match)
    return databaseIds ? save({ key, databaseIds }) : null
  })
  .catch(() => null)

const requestOfRow = (row) => ({
  title: groupTitleOf(row),
  channelName: row.channel_name ?? null,
  start: Number(row.aired_at) || null,
  durationS: row.duration_s ?? null,
  season: row.season ?? null,
  episode: row.episode ?? null,
})

const groupTitleOf = (row) => row.show_title_override ?? row.title

const groupKeyOf = (row) => showKeyOf(groupTitleOf(row))

const groupBy = (list, keyOf) => {
  const groups = new Map()
  for (const item of list) {
    const key = keyOf(item)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  return groups
}

const CHOSEN_KINDS = new Set(['show', 'one-off', 'movie'])
const INLINE_WAIT_MS = 5000
const BACKGROUND_WAIT_MS = 60000
const MAX_LOOKUPS_PER_PASS = 5
const RETRY_LOOKUP_MS = 30 * 60 * 1000
const RECHECK_NONE_MS = 30 * 24 * 60 * 60 * 1000
const retryAfterByKey = new Map()
