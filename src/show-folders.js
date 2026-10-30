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
  const sorted = [...folders].sort()
  const exact = sorted.find((folder) => folder.toLowerCase() === wanted)
  if (exact) return exact
  const suffixed = sorted.filter((folder) => isSuffixedFolderOf({ folder, wanted }))
  return suffixed.length === 1 ? suffixed[0] : undefined
}

const isSuffixedFolderOf = ({ folder, wanted }) => {
  const name = folder.toLowerCase()
  return name.startsWith(`${wanted} `) && YEAR_OR_COUNTRY_SUFFIX.test(name.slice(wanted.length))
}

const YEAR_OR_COUNTRY_SUFFIX = /^(?: \((?:\d{4}|[a-z]{2,3})\)){1,2}$/
