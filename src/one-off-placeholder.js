import path from 'path'
import fs from 'fs/promises'

export const ONE_OFF_PLACEHOLDER = '.freetvarr-keep'
export const PLACEHOLDER_KEPT = 'kept'
export const FOLDER_MISSING = 'missing'
export const FOLDER_UNWRITABLE = 'unwritable'

export const keepOneOffFolder = async (oneOffRoot) => {
  if (!oneOffRoot || !(await isDirectory(oneOffRoot))) return FOLDER_MISSING
  const written = await fs.writeFile(path.join(oneOffRoot, ONE_OFF_PLACEHOLDER), '', { flag: 'a' }).then(() => true, () => false)
  if (written || await hasOneOffPlaceholder(oneOffRoot)) return PLACEHOLDER_KEPT
  return FOLDER_UNWRITABLE
}

export const hasOneOffPlaceholder = (oneOffRoot) =>
  fs.access(path.join(oneOffRoot, ONE_OFF_PLACEHOLDER)).then(() => true, () => false)

export const hasRecordingFiles = async (folder, depth = 0) => {
  const entries = await fs.readdir(folder, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (entry.isFile() && isVideoFile(entry.name)) return true
    if (isSearchedFolder({ entry, depth }) && await hasRecordingFiles(path.join(folder, entry.name), depth + 1)) return true
  }
  return false
}

const isVideoFile = (name) => !name.startsWith('.') && VIDEO_EXTENSIONS.has(path.extname(name).toLowerCase())

const isSearchedFolder = ({ entry, depth }) => entry.isDirectory() && depth < MAX_DEPTH && !/^[.@#]/.test(entry.name)

const isDirectory = (folder) => fs.stat(folder).then((stat) => stat.isDirectory(), () => false)

const MAX_DEPTH = 3
const VIDEO_EXTENSIONS = new Set(['.ts', '.m2ts', '.mts', '.mkv', '.mp4', '.m4v', '.mov', '.avi', '.mpg', '.mpeg', '.wmv', '.webm', '.flv'])
