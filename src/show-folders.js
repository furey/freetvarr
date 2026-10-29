import { db } from './db.js'
import { listShowFolders } from './folder-matcher.js'
import { createValidFilename, getMediaRoot, matchShow } from './sync.js'

export const ensureShowFolder = async ({ title, shows = null }) => {
  const enabled = shows ?? await db('shows').where({ enabled: true })
  const existing = matchShow(enabled, title)
  if (existing) return { ...existing, created: false }
  const folders = await listShowFolders(await getMediaRoot()).catch(() => [])
  const rule = {
    show_pattern: title.trim(),
    dest_folder: existingFolderFor({ title, folders }) || createValidFilename(title) || 'Recordings',
  }
  const [id] = await db('shows').insert(rule)
  return { ...(await db('shows').where({ id }).first()), created: true }
}

export const existingFolderFor = ({ title, folders }) => {
  const wanted = createValidFilename(title).toLowerCase()
  return folders.find((f) => f.toLowerCase() === wanted)
    || folders.find((f) => f.toLowerCase().startsWith(`${wanted} (`))
}
