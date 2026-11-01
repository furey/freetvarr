import path from 'path'
import fs from 'fs/promises'

export const ONE_OFF_PLACEHOLDER = '.freetvarr-keep'

export const keepOneOffFolder = async (oneOffRoot) => {
  if (!oneOffRoot || !(await isDirectory(oneOffRoot))) return false
  const placeholder = path.join(oneOffRoot, ONE_OFF_PLACEHOLDER)
  await fs.writeFile(placeholder, '', { flag: 'a' }).catch(() => null)
  return hasOneOffPlaceholder(oneOffRoot)
}

export const hasOneOffPlaceholder = (oneOffRoot) =>
  fs.access(path.join(oneOffRoot, ONE_OFF_PLACEHOLDER)).then(() => true, () => false)

export const hasRecordingFiles = async (folder, depth = 0) => {
  const entries = await fs.readdir(folder, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (entry.isFile() && !(depth === 0 && entry.name === ONE_OFF_PLACEHOLDER)) return true
    if (entry.isDirectory() && depth < MAX_DEPTH && await hasRecordingFiles(path.join(folder, entry.name), depth + 1)) return true
  }
  return false
}

const isDirectory = (folder) => fs.stat(folder).then((stat) => stat.isDirectory(), () => false)

const MAX_DEPTH = 3
