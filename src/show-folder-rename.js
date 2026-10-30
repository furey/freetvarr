import path from 'path'
import fs from 'fs/promises'

import { db } from './db.js'
import { getActiveSyncId, getMediaRoot } from './sync.js'
import { notifyPlexSectionRefresh } from './plex.js'
import { isAdJobRunning } from './commercials.js'
import { identityFolderOf, showIdentityFor } from './show-identity.js'
import { channelNameOfShow, identityColumnsOf, storedIdentityOf } from './show-identity-store.js'

export const planFolderFix = async ({
  showId,
  database = db,
  mediaRootOf = getMediaRoot,
  identityFor = showIdentityFor,
  fsApi = fs,
}) => {
  const show = await database('shows').where({ id: showId }).first()
  if (!show) return { state: 'not-found' }
  const identity = storedIdentityOf(show) ?? await lookedUpIdentityOf({ show, database, identityFor })
  const target = identityFolderOf(identity)
  if (!target) return { state: 'no-match', from: show.dest_folder }
  if (target === show.dest_folder) return { state: 'done', from: show.dest_folder, to: target, identity }
  const mediaRoot = await mediaRootOf()
  const paths = folderPathsOf({ mediaRoot, from: show.dest_folder, to: target })
  const [recordings, libraryItems, folderExists, targetExists] = await Promise.all([
    recordingsUnder({ database, folder: paths.from }),
    libraryItemsUnder({ database, folder: paths.from }),
    exists({ fsApi, filePath: paths.from }),
    exists({ fsApi, filePath: paths.to }),
  ])
  return {
    state: libraryItems.some(isManaged) ? 'managed' : targetExists ? 'target-exists' : 'ready',
    from: show.dest_folder,
    to: target,
    recordings: recordings.length,
    folderExists,
    identity,
  }
}

export const renameShowFolder = async ({
  showId,
  to,
  identity = null,
  database = db,
  mediaRootOf = getMediaRoot,
  fsApi = fs,
  refreshPlex = notifyPlexSectionRefresh,
  isSyncRunning = () => getActiveSyncId() != null,
  isRecordingBusy = isAdJobRunning,
}) => {
  const show = await database('shows').where({ id: showId }).first()
  if (!show) throw folderFixError('not-found', 'That series is no longer in Freetvarr.')
  if (!isPlainFolderName(to)) throw folderFixError('bad-name', 'The new folder name must be one folder inside the TV folder.')
  if (to === show.dest_folder) return { from: show.dest_folder, to, recordings: 0, moved: false, plex: null }
  if (isSyncRunning()) throw folderFixError('busy', 'A sync is running. Try again when it finishes.')
  const mediaRoot = await mediaRootOf()
  const paths = folderPathsOf({ mediaRoot, from: show.dest_folder, to })
  if (await exists({ fsApi, filePath: paths.to })) throw folderFixError('target-exists', `A folder called ${to} already exists.`)
  const [recordings, libraryItems, folderExists] = await Promise.all([
    recordingsUnder({ database, folder: paths.from }),
    libraryItemsUnder({ database, folder: paths.from }),
    exists({ fsApi, filePath: paths.from }),
  ])
  const managed = libraryItems.find(isManaged)
  if (managed) throw managedFolderError(managerNameOf(managed.manager))
  if (recordings.some((row) => isRecordingBusy(row.recording_id))) {
    throw folderFixError('busy', 'Ad removal is running on one of these recordings. Try again when it finishes.')
  }
  let moved = false
  try {
    await database.transaction(async (trx) => {
      await trx('shows').where({ id: showId }).update({ dest_folder: to, ...(identity ? identityColumnsOf({ identity, state: show.identity_state || 'matched' }) : {}) })
      for (const row of recordings) {
        await trx('recordings').where({ recording_id: row.recording_id }).update({ file_path: rebased({ filePath: row.file_path, paths }) })
      }
      for (const row of libraryItems) {
        await trx('library_items').where({ rating_key: row.rating_key, part_id: row.part_id }).update({ file_path: rebased({ filePath: row.file_path, paths }) })
      }
      if (!folderExists) return
      await renameFolder({ fsApi, paths })
      moved = true
    })
  } catch (err) {
    if (moved) await fsApi.rename(paths.to, paths.from).catch(() => { err.message = `${err.message}; the folder is still at ${paths.to}` })
    throw err
  }
  const plex = moved || recordings.length ? await Promise.resolve().then(refreshPlex).catch(() => null) : null
  return { from: show.dest_folder, to, recordings: recordings.length, moved, plex }
}

export const folderFixError = (code, message) => Object.assign(new Error(message), { code })

const lookedUpIdentityOf = async ({ show, database, identityFor }) => {
  if (show.identity_state === 'choose') return null
  const match = await Promise.resolve()
    .then(async () => identityFor({ title: show.show_pattern, channelName: await channelNameOfShow({ showId: show.id, database }) }))
    .catch(() => null)
  return match?.state === 'choose' ? null : match?.identity ?? null
}

const renameFolder = async ({ fsApi, paths }) => {
  try {
    await fsApi.rename(paths.from, paths.to)
  } catch (err) {
    if (err.code === 'EXDEV') throw folderFixError('cross-device', `${paths.from} is on a different drive from the TV folder, so Freetvarr cannot rename it.`)
    if (err.code === 'ENOTEMPTY' || err.code === 'EEXIST') throw folderFixError('target-exists', `A folder called ${path.basename(paths.to)} already exists.`)
    throw err
  }
}

const folderPathsOf = ({ mediaRoot, from, to }) => ({ from: path.join(mediaRoot, from), to: path.join(mediaRoot, to) })

const rebased = ({ filePath, paths }) => `${paths.to}${filePath.slice(paths.from.length)}`

const isUnder = ({ filePath, folder }) => Boolean(filePath) && filePath.startsWith(`${folder}${path.sep}`)

const recordingsUnder = async ({ database, folder }) => (await database('recordings').whereNotNull('file_path').select('recording_id', 'file_path'))
  .filter((row) => isUnder({ filePath: row.file_path, folder }))

const libraryItemsUnder = async ({ database, folder }) => (await database('library_items').whereNotNull('file_path').select('rating_key', 'part_id', 'file_path', 'manager'))
  .filter((row) => isUnder({ filePath: row.file_path, folder }))

const managedFolderError = (name) => folderFixError('managed', `${name} also saves episodes in this folder. Rename the series in ${name} instead, so ${name} keeps finding its files.`)

const isManaged = (row) => Boolean(row.manager)

const managerNameOf = (manager) => ({ sonarr: 'Sonarr', radarr: 'Radarr' }[manager] || 'Another app')

const isPlainFolderName = (name) => typeof name === 'string'
  && name.trim() === name
  && name !== ''
  && name !== '.'
  && name !== '..'
  && !/[\\/]/.test(name)

const exists = ({ fsApi, filePath }) => fsApi.access(filePath).then(() => true, () => false)
