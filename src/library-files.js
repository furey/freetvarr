import path from 'path'
import fs from 'fs/promises'

import { db } from './db.js'
import { createPathRootReady } from './library-roots.js'

export const LIBRARY_STATES = ['replaced', 'not_in_library']

export const refreshLibraryStates = async (rows, { rootReady = createPathRootReady() } = {}) => {
  const checked = await Promise.all(rows.map(async (row) => ({ row, ...(await libraryStateOf(row, { rootReady })) })))
  await Promise.all(checked.filter(hasChanged).map(saveLibraryState))
  return checked.map(({ row, state, replacement }) => ({
    ...row,
    library_state: state,
    library_replacement: replacement,
  }))
}

export const sweepLibraryStates = async () => {
  const rows = await db('recordings')
    .whereIn('status', CHECKED_STATUSES)
    .whereNotNull('file_path')
    .whereNull('purged_at')
  return refreshLibraryStates(rows)
}

export const libraryStateOf = async (row, { rootReady = createPathRootReady() } = {}) => {
  if (!CHECKED_STATUSES.includes(row.status) || !row.file_path) return KEPT
  if (await isPresent(row.file_path)) return KEPT
  if (!(await rootReady(row.file_path))) return storedStateOf(row)
  const replacement = await findReplacement(row)
  return replacement
    ? { state: 'replaced', replacement }
    : { state: 'not_in_library', replacement: null }
}

export const libraryChoicePatchOf = (choice) => (choice === 'include'
  ? { library_choice: choice, status: 'pending', error: null, library_state: null, library_replacement: null, library_deleted_at: null }
  : { library_choice: choice })

export const findReplacement = async ({ file_path: filePath, season, episode }) => {
  if (season == null || episode == null) return null
  const wanted = { season: Number(season), episode: Number(episode) }
  for (const dir of await seasonFoldersOf({ filePath, season: wanted.season })) {
    const names = (await fs.readdir(dir).catch(() => [])).sort()
    const match = names.find((name) => isVideo(name) && namesEpisode({ name, ...wanted }))
    if (match) return path.join(dir, match)
  }
  return null
}

const CHECKED_STATUSES = ['done', 'partial']
const KEPT = { state: null, replacement: null }
const VIDEO_EXTENSIONS = new Set(['.ts', '.mkv', '.mp4', '.m4v', '.avi', '.mov', '.webm', '.mpg', '.mpeg'])

const isPresent = async (filePath) => fs.access(filePath).then(() => true, () => false)

export const isVideo = (name) => VIDEO_EXTENSIONS.has(path.extname(name).toLowerCase())

const seasonFoldersOf = async ({ filePath, season }) => {
  const own = path.dirname(filePath)
  if (seasonNumberOf(path.basename(own)) == null) return [own]
  const showDir = path.dirname(own)
  const siblings = (await fs.readdir(showDir).catch(() => []))
    .sort()
    .map((name) => path.join(showDir, name))
    .filter((dir) => dir !== own && seasonNumberOf(path.basename(dir)) === season)
  return [own, ...siblings]
}

const seasonNumberOf = (folderName) => {
  const match = SEASON_FOLDER.exec(folderName)
  return match ? Number(match[1]) : null
}

const namesEpisode = ({ name, season, episode }) => [...name.matchAll(EPISODE_TOKEN)]
  .some((match) => Number(match[1]) === season && Number(match[2]) === episode)

const SEASON_FOLDER = /^season\s*(\d+)$/i
const EPISODE_TOKEN = /(?<![a-z0-9])S0?(\d+)\s*E0?(\d+)(?!\d)/gi

const storedStateOf = (row) => ({ state: row.library_state ?? null, replacement: row.library_replacement ?? null })

const hasChanged = ({ row, state, replacement }) =>
  (row.library_state ?? null) !== state || (row.library_replacement ?? null) !== replacement

const saveLibraryState = ({ row, state, replacement }) =>
  db('recordings')
    .where({ recording_id: row.recording_id })
    .update({ library_state: state, library_replacement: replacement })
