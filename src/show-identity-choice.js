import { db } from './db.js'
import { USER_ORIGIN } from './show-origin.js'
import { showTitleKey } from './show-artwork.js'
import { identityFolderOf, showIdentityFor } from './show-identity.js'
import { networkFamilyOf } from './show-match.js'
import { channelNameOfShow, clearIdentityPick, identityColumnsOf, saveIdentityPick, storedIdentityOf } from './show-identity-store.js'

export const showIdentityStatus = async ({ showId, database = db, identityFor = showIdentityFor, waitMs = STATUS_WAIT_MS }) => {
  const show = await database('shows').where({ id: showId }).first()
  if (!show) return null
  const channelName = await channelNameOfShow({ showId, database })
  const match = await Promise.resolve()
    .then(() => identityFor({ title: show.show_pattern, channelName, wait: waitMs, usePick: false }))
    .catch(() => null)
  const current = storedIdentityOf(show)
  return {
    state: show.identity_state || (current ? 'matched' : match?.state ?? 'none'),
    current: current ? { ...current, folder: identityFolderOf(current) } : null,
    suggested: match?.identity ? { ...match.identity, folder: identityFolderOf(match.identity) } : null,
    candidates: match?.candidates ?? [],
    lookup: match?.state ?? 'unreachable',
  }
}

export const chooseShowIdentity = async ({ showId, tvmazeId, database = db, identityFor = showIdentityFor }) => {
  const status = await showIdentityStatus({ showId, database, identityFor })
  if (!status) return null
  const candidate = status.candidates.find((entry) => String(entry.tvmazeId) === String(tvmazeId))
  if (!candidate?.identity && UNANSWERED_LOOKUPS.has(status.lookup)) {
    throw Object.assign(new Error('Freetvarr cannot reach TVmaze right now. Try again later.'), { code: 'unreachable' })
  }
  if (!candidate?.identity) throw Object.assign(new Error('That show is no longer in the list. Close and open the series again.'), { code: 'unknown-show' })
  const show = await database('shows').where({ id: showId }).first()
  const channelName = await channelNameOfShow({ showId, database })
  const identity = { ...candidate.identity, needsConfirm: false }
  await database.transaction(async (trx) => {
    await trx('shows').where({ id: showId }).update({ ...identityColumnsOf({ identity, state: 'chosen' }), kept_folder: null, origin: USER_ORIGIN })
    await saveIdentityPick({ titleKey: showTitleKey(show.show_pattern), family: networkFamilyOf(channelName), identity, database: trx })
  })
  return { ...identity, folder: identityFolderOf(identity) }
}

export const declineShowIdentity = async ({ showId, database = db }) => {
  const show = await database('shows').where({ id: showId }).first()
  if (!show) return null
  const channelName = await channelNameOfShow({ showId, database })
  await database.transaction(async (trx) => {
    await trx('shows').where({ id: showId }).update(identityColumnsOf({ identity: null, state: 'declined' }))
    await clearIdentityPick({ titleKey: showTitleKey(show.show_pattern), family: networkFamilyOf(channelName), database: trx })
  })
  return { state: 'declined', folder: show.dest_folder }
}

const STATUS_WAIT_MS = 20000
const UNANSWERED_LOOKUPS = new Set(['unreachable', 'pending'])
