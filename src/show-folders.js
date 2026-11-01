import path from 'path'
import fs from 'fs/promises'

import { db } from './db.js'
import { listShowFolders } from './folder-matcher.js'
import { createValidFilename, getMediaRoot, matchShow, withoutIdHint } from './sync.js'
import { identityFolderOf, showIdentityFor } from './show-identity.js'
import { identityColumnsOf } from './show-identity-store.js'
import { AUTO_ORIGIN, USER_ORIGIN } from './show-origin.js'
import { databaseIdsOf } from './series-kind.js'
import { saveDatabaseIds } from './series-evidence.js'
import { showKeyOf } from './web/show-key.js'

export const ensureShowFolder = async ({ title, shows = null, airing = {}, identityFor = showIdentityFor, inBackground = false, origin = AUTO_ORIGIN }) => {
  const enabled = shows ?? await db('shows').where({ enabled: true })
  const existing = matchShow(enabled, title)
  if (existing) return { ...await claimedBy({ show: existing, origin }), created: false }
  const [folders, match] = await Promise.all([
    getMediaRoot().then(listShowFolders).catch(() => []),
    inBackground ? null : Promise.resolve().then(() => identityFor({ ...airing, title, wait: INLINE_WAIT_MS })).catch(() => null),
  ])
  const identity = match?.identity ?? null
  await rememberDatabaseIds({ title, match })
  const rule = {
    show_pattern: title.trim(),
    dest_folder: newShowFolderOf({ title, folders, identity }),
    origin,
    ...identityColumnsOf({ identity, state: isSettled(match) ? match.state : null }),
  }
  const [id] = await db('shows').insert(rule)
  if (inBackground) settleShowIdentity({ showId: id, title, airing, identityFor }).catch(() => null)
  else if (match?.state === 'pending') settleShowIdentity({ showId: id, title, airing, identityFor, renameIfEmpty: false }).catch(() => null)
  return { ...(await db('shows').where({ id }).first()), created: true }
}

const rememberDatabaseIds = async ({ title, match }) => {
  const databaseIds = databaseIdsOf(match)
  if (databaseIds) await saveDatabaseIds({ key: showKeyOf(title), databaseIds }).catch(() => false)
}

const claimedBy = async ({ show, origin }) => {
  if (origin !== USER_ORIGIN || show.origin !== AUTO_ORIGIN) return show
  await db('shows').where({ id: show.id }).update({ origin: USER_ORIGIN })
  show.origin = USER_ORIGIN
  return show
}

export const settleShowIdentity = async ({ showId, title, airing = {}, identityFor = showIdentityFor, wait = BACKGROUND_WAIT_MS, renameIfEmpty = true }) => {
  const match = await Promise.resolve().then(() => identityFor({ ...airing, title, wait })).catch(() => null)
  await rememberDatabaseIds({ title, match })
  if (!isSettled(match) || match.state === 'none') return null
  const show = await db('shows').where({ id: showId }).first()
  if (!show || OWNER_STATES.has(show.identity_state)) return null
  const columns = identityColumnsOf({ identity: match.identity, state: match.state })
  const mediaRoot = await getMediaRoot()
  if (!renameIfEmpty || await hasRecordingsOnDisk({ show, mediaRoot })) {
    await db('shows').where({ id: showId }).update(columns)
    return { ...show, ...columns }
  }
  const folders = await listShowFolders(mediaRoot).catch(() => [])
  const destFolder = newShowFolderOf({ title, folders, identity: match.identity })
  await db('shows').where({ id: showId, dest_folder: show.dest_folder }).update({ ...columns, dest_folder: destFolder })
  return { ...show, ...columns, dest_folder: destFolder }
}

export const newShowFolderOf = ({ title, folders = [], identity = null }) => folderWithIdOf({ folders, identity })
  || (identity && existingFolderFor({ title: identity.name, folders, exactOnly: true }))
  || existingFolderFor({ title, folders: folders.filter((folder) => !isOtherShowFolder({ folder, identity })) })
  || identityFolderOf(identity)
  || createValidFilename(title)
  || 'Recordings'

export const existingFolderFor = ({ title, folders, exactOnly = false }) => {
  const wanted = createValidFilename(title).toLowerCase()
  const sorted = [...folders].sort()
  const exact = sorted.find((folder) => folder.toLowerCase() === wanted)
  if (exact || exactOnly) return exact
  const suffixed = sorted.filter((folder) => isSuffixedFolderOf({ folder, wanted }))
  return suffixed.length === 1 ? suffixed[0] : undefined
}

const folderWithIdOf = ({ folders, identity }) => {
  const hints = [identity?.tvdbId && `{tvdb-${identity.tvdbId}}`, identity?.tmdbId && `{tmdb-${identity.tmdbId}}`].filter(Boolean)
  return [...folders].sort().find((folder) => hints.some((hint) => folder.toLowerCase().includes(hint)))
}

const isSuffixedFolderOf = ({ folder, wanted }) => {
  const name = folder.toLowerCase()
  return name.startsWith(`${wanted} `) && FOLDER_SUFFIX.test(name.slice(wanted.length))
}

const isSettled = (match) => Boolean(match) && !UNSETTLED_STATES.has(match.state)

const isOtherShowFolder = ({ folder, identity }) => {
  if (!identity) return false
  const ids = { tvdb: identity.tvdbId, tmdb: identity.tmdbId }
  const otherId = [...folder.matchAll(ID_HINT)].some(([, source, id]) => {
    const known = ids[source.toLowerCase()]
    return Boolean(known) && String(known) !== id
  })
  const folderCountry = countryTagIn(withoutIdHint(folder))
  const showCountry = countryTagIn(identity.name)
  return otherId || Boolean(folderCountry && showCountry && folderCountry !== showCountry)
}

const countryTagIn = (name) => String(name ?? '').match(COUNTRY_TAG)?.[1]?.toUpperCase() ?? null

const hasRecordingsOnDisk = async ({ show, mediaRoot }) => {
  const recordings = await db('recordings').where({ show_id: show.id }).whereNotNull('file_path').first('recording_id')
  if (recordings) return true
  return fs.access(path.join(mediaRoot, show.dest_folder)).then(() => true, () => false)
}

const BACKGROUND_WAIT_MS = 60000
const INLINE_WAIT_MS = 5000
const UNSETTLED_STATES = new Set(['pending', 'unreachable', 'off'])
const OWNER_STATES = new Set(['chosen', 'declined'])
const ID_HINT = /\{(tvdb|tmdb|imdb)-([^}]*)\}/gi
const COUNTRY_TAG = /\(([a-z]{2,3})\)$/i
const FOLDER_SUFFIX = /^(?:(?: \((?:\d{4}|[a-z]{2,3})\)){1,2}(?: \{(?:tvdb|tmdb|imdb)-[a-z0-9]+\})?| \{(?:tvdb|tmdb|imdb)-[a-z0-9]+\})$/
