import path from 'path'
import fs from 'fs/promises'

import { db, getSetting } from './db.js'

export const ROOT_MISSING = 'missing'
export const ROOT_EMPTY = 'empty'

export const getMediaRoot = async () => mediaRootFrom(await getSetting('media_root'))

export const getOneOffRoot = async () => oneOffRootFrom(await getSetting('oneoff_root'))

export const getMoviesRoot = async () => moviesRootFrom(await getSetting('movies_root'))

export const mediaRootFrom = (setting) => setting?.trim() || process.env.MEDIA_ROOT || DEFAULT_MEDIA_ROOT

export const oneOffRootFrom = (setting) => setting?.trim() || process.env.ONEOFF_ROOT || DEFAULT_ONEOFF_ROOT

export const moviesRootFrom = (setting) => (setting != null ? setting.trim() : (process.env.MOVIES_ROOT || '').trim())

export const rootsAfterSaveOf = async (body, read = getSetting) => {
  const valueOf = async (key) => (body[key] !== undefined ? String(body[key]) : read(key))
  return {
    mediaRoot: mediaRootFrom(await valueOf('media_root')),
    oneOffRoot: oneOffRootFrom(await valueOf('oneoff_root')),
    moviesRoot: moviesRootFrom(await valueOf('movies_root')),
  }
}

export const loadLibraryRoots = async () => ({
  mediaRoot: await getMediaRoot(),
  oneOffRoot: await getOneOffRoot(),
  moviesRoot: await getMoviesRoot(),
})

export const libraryRootProblemOf = async (root, { countRowsUnder = countImportedRowsUnder } = {}) => {
  const entries = await fs.readdir(root).catch(() => null)
  if (!entries) return ROOT_MISSING
  if (entries.some(isContentEntry)) return null
  return (await countRowsUnder(root)) > 0 ? ROOT_EMPTY : null
}

export const libraryRootReady = async (root, options) => !(await libraryRootProblemOf(root, options))

export const createRootCheck = (options) => {
  const problems = new Map()
  return (root) => {
    if (!problems.has(root)) problems.set(root, libraryRootProblemOf(root, options))
    return problems.get(root)
  }
}

export const createPathRootReady = ({ loadRoots = loadLibraryRoots, ...options } = {}) => {
  const problemOf = createRootCheck(options)
  let roots = null
  return async (filePath) => {
    roots ??= loadRoots().then(Object.values)
    const root = rootOfPath({ filePath, roots: await roots })
    return root ? !(await problemOf(root)) : true
  }
}

export const rootOfPath = ({ filePath, roots }) => roots
  .filter(Boolean)
  .map(withoutTrailingSlash)
  .filter((root) => isUnderRoot({ filePath, root }))
  .sort((a, b) => b.length - a.length)[0] ?? null

export const isUnderRoot = ({ filePath, root }) => String(filePath ?? '').startsWith(`${withoutTrailingSlash(root)}/`)

export const nestedRootsError = (roots) => {
  const named = Object.entries(ROOT_LABELS)
    .map(([key, label]) => ({ label, root: roots[key] ? path.resolve(roots[key]) : null }))
    .filter(({ root }) => root)
  for (const outer of named) {
    for (const inner of named) {
      if (outer === inner) continue
      if (inner.root === outer.root) return `The ${inner.label} and ${outer.label} folders are the same folder (${inner.root}). Choose a separate folder for each.`
      if (inner.root.startsWith(`${outer.root}${path.sep}`)) return `The ${inner.label} folder ${inner.root} is inside the ${outer.label} folder ${outer.root}. Choose folders that do not sit inside each other.`
    }
  }
  return null
}

export const libraryRootsSaveError = ({ before, after }) => {
  const changed = Object.keys(ROOT_LABELS).some((key) => before[key] !== after[key])
  return changed ? nestedRootsError(after) : null
}

export const countImportedRowsUnder = async (root) => {
  const prefix = `${withoutTrailingSlash(root)}/`
  const row = await db('recordings')
    .whereIn('status', IMPORTED_STATUSES)
    .whereNull('purged_at')
    .whereNull('library_state')
    .whereNull('library_deleted_at')
    .whereRaw('substr(file_path, 1, ?) = ?', [prefix.length, prefix])
    .count({ n: '*' })
    .first()
  return Number(row?.n ?? 0)
}

const withoutTrailingSlash = (root) => String(root).replace(/\/+$/, '')

const isContentEntry = (name) => !/^[.@#]/.test(name)

const ROOT_LABELS = { mediaRoot: 'TV', oneOffRoot: 'one-off', moviesRoot: 'movies' }
const IMPORTED_STATUSES = ['done', 'partial']
const DEFAULT_MEDIA_ROOT = '/media/tv'
const DEFAULT_ONEOFF_ROOT = '/media/one-offs'
