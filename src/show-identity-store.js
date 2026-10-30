import { db } from './db.js'

export const loadIdentityPick = async ({ titleKey, family, database = db }) => {
  const rows = await database('show_identity_picks').where({ title_key: titleKey })
  const row = pickForFamily({ rows, family: family || '' })
  return row ? storedIdentityOf(row) : null
}

const pickForFamily = ({ rows, family }) => rows.find((row) => row.network_family === family)
  ?? rows.find((row) => row.network_family === '')
  ?? (!family && rows.length === 1 ? rows[0] : null)

export const saveIdentityPick = ({ titleKey, family, identity, database = db, now = Date.now }) => database('show_identity_picks')
  .insert({
    title_key: titleKey,
    network_family: family || '',
    tvmaze_id: identity.tvmazeId,
    tvdb_id: identity.tvdbId ?? null,
    tmdb_id: identity.tmdbId ?? null,
    database_title: identity.name,
    picked_at: now(),
  })
  .onConflict(['title_key', 'network_family'])
  .merge()

export const clearIdentityPick = ({ titleKey, family, database = db }) => database('show_identity_picks')
  .where({ title_key: titleKey })
  .whereIn('network_family', [...new Set([family || '', ''])])
  .delete()

export const channelNameOfShow = async ({ showId, database = db }) => (await database('recordings')
  .where({ show_id: showId })
  .whereNotNull('channel_name')
  .orderBy('aired_at', 'desc')
  .first('channel_name'))?.channel_name ?? null

export const identityColumnsOf = ({ identity, state }) => ({
  tvmaze_id: identity?.tvmazeId ?? null,
  tvdb_id: identity?.tvdbId ?? null,
  tmdb_id: identity?.tmdbId ?? null,
  database_title: identity?.name ?? null,
  identity_state: state ?? null,
})

export const storedIdentityOf = (row) => (row?.database_title && (row.tvdb_id || row.tmdb_id || row.tvmaze_id)
  ? { tvmazeId: row.tvmaze_id || null, name: row.database_title, tvdbId: row.tvdb_id || null, tmdbId: row.tmdb_id || null, needsConfirm: row.identity_state === 'confirm' }
  : null)
