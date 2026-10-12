import path from 'path'
import fs from 'fs/promises'

import { db } from './db.js'

export const LIBRARY_STATES = ['replaced', 'not_in_library']

export const refreshLibraryStates = async (rows) => {
  const checked = await Promise.all(rows.map(async (row) => ({ row, ...(await libraryStateOf(row)) })))
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

export const libraryStateOf = async (row) => {
  if (!CHECKED_STATUSES.includes(row.status) || !row.file_path) return KEPT
  if (await isPresent(row.file_path)) return KEPT
  const replacement = await findReplacement(row)
  return replacement
    ? { state: 'replaced', replacement }
    : { state: 'not_in_library', replacement: null }
}

export const findReplacement = async ({ file_path: filePath, season, episode }) => {
  const token = episodeToken({ season, episode })
  if (!token) return null
  const dir = path.dirname(filePath)
  const names = await fs.readdir(dir).catch(() => [])
  const match = names.find((name) => isVideo(name) && name.toUpperCase().includes(token))
  return match ? path.join(dir, match) : null
}

const CHECKED_STATUSES = ['done', 'partial']
const KEPT = { state: null, replacement: null }
const VIDEO_EXTENSIONS = new Set(['.ts', '.mkv', '.mp4', '.m4v', '.avi', '.mov', '.webm'])

const isPresent = async (filePath) => fs.access(filePath).then(() => true, () => false)

const isVideo = (name) => VIDEO_EXTENSIONS.has(path.extname(name).toLowerCase())

const episodeToken = ({ season, episode }) => {
  if (season == null || episode == null) return null
  return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
}

const hasChanged = ({ row, state, replacement }) =>
  (row.library_state ?? null) !== state || (row.library_replacement ?? null) !== replacement

const saveLibraryState = ({ row, state, replacement }) =>
  db('recordings')
    .where({ recording_id: row.recording_id })
    .update({ library_state: state, library_replacement: replacement })
