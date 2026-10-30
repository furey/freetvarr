import { db } from './db.js'
import { listShowFolders } from './folder-matcher.js'
import { createValidFilename, getMediaRoot, matchShow } from './sync.js'
import { identityFolderOf, showIdentityFor } from './show-identity.js'
import { identityColumnsOf } from './show-identity-store.js'

export const ensureShowFolder = async ({ title, shows = null, airing = {}, identityFor = showIdentityFor }) => {
  const enabled = shows ?? await db('shows').where({ enabled: true })
  const existing = matchShow(enabled, title)
  if (existing) return { ...existing, created: false }
  const [folders, match] = await Promise.all([
    getMediaRoot().then(listShowFolders).catch(() => []),
    Promise.resolve().then(() => identityFor({ ...airing, title })).catch(() => null),
  ])
  const identity = match?.identity ?? null
  const rule = {
    show_pattern: title.trim(),
    dest_folder: newShowFolderOf({ title, folders, identity }),
    ...identityColumnsOf({ identity, state: match?.state ?? null }),
  }
  const [id] = await db('shows').insert(rule)
  return { ...(await db('shows').where({ id }).first()), created: true }
}

export const newShowFolderOf = ({ title, folders = [], identity = null }) => folderWithIdOf({ folders, identity })
  || (identity && existingFolderFor({ title: identity.name, folders, exactOnly: true }))
  || existingFolderFor({ title, folders })
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

const FOLDER_SUFFIX = /^(?:(?: \((?:\d{4}|[a-z]{2,3})\)){1,2}(?: \{(?:tvdb|tmdb|imdb)-[a-z0-9]+\})?| \{(?:tvdb|tmdb|imdb)-[a-z0-9]+\})$/
