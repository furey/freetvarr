import { databaseIdsOf, isMostlySport, rowAiringOf } from './series-kind.js'
import { saveDatabaseIds } from './series-evidence.js'
import { showKeyOf } from './web/show-key.js'
import { isUserFolderRow } from './show-origin.js'

export const needsDatabaseIds = ({ recordings, evidence = null, override = null, hasRule = false }) =>
  !CHOSEN_KINDS.has(override) && !hasRule && evidence?.databaseIds == null && isMostlySport(recordings)

export const lookUpDatabaseIds = async ({ key, request, identityFor, evidence = null, save = saveDatabaseIds }) => {
  const match = await Promise.resolve().then(() => identityFor({ ...request, wait: INLINE_WAIT_MS })).catch(() => null)
  const databaseIds = databaseIdsOf(match)
  if (databaseIds) return keepDatabaseIds({ key, databaseIds, evidence, save })
  if (match?.state === 'pending') settleLater({ key, request, identityFor, save })
  return null
}

export const settleDatabaseIds = async ({ inputs, identityFor, limit = MAX_LOOKUPS_PER_PASS, save = saveDatabaseIds }) => {
  const showsById = new Map((inputs.shows ?? []).map((show) => [show.id, show]))
  const candidates = [...groupBy(inputs.rows ?? [], groupKeyOf)]
    .filter(([key, group]) => needsDatabaseIds({
      recordings: group.map(rowAiringOf),
      evidence: inputs.evidence.get(key) ?? null,
      override: inputs.overrides?.get(key) ?? null,
      hasRule: inputs.ruleKeys?.has(key) || group.some(isUserFolderRow),
    }))
  for (const [key, group] of candidates.slice(0, limit)) {
    const fromFolder = databaseIdsOfShow(showsById.get(group.find((row) => row.show_id != null)?.show_id))
    if (fromFolder) await keepDatabaseIds({ key, databaseIds: fromFolder, evidence: inputs.evidence, save })
    else await lookUpDatabaseIds({ key, request: requestOfRow(group[0]), identityFor, evidence: inputs.evidence, save })
  }
}

export const databaseIdsOfShow = (show) => (show
  ? databaseIdsOf({ state: show.identity_state, identity: { tvdbId: show.tvdb_id, tmdbId: show.tmdb_id } })
  : null)

const keepDatabaseIds = async ({ key, databaseIds, evidence, save }) => {
  await Promise.resolve().then(() => save({ key, databaseIds })).catch(() => false)
  evidence?.set(key, { ...(evidence.get(key) || {}), databaseIds })
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
