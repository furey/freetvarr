import path from 'path'
import fsp from 'fs/promises'

export const SCOPES = ['watched', 'all']
export const MAX_RECORDING_IDS = 1000

export const deletionRequestFrom = (body = {}) => {
  const ids = body?.recording_ids
  if (ids !== undefined) return recordingIdsRequestFrom(ids)
  const showKey = typeof body?.show_key === 'string' ? body.show_key.trim() : ''
  if (!showKey) return { error: 'send recording_ids, or show_key with a scope' }
  if (!SCOPES.includes(body.scope)) return { error: `scope must be one of ${SCOPES.join(', ')}` }
  return { request: { showKey, scope: body.scope } }
}

export const expectedCountFrom = (body = {}) => {
  const value = body?.expected_count
  return Number.isInteger(value) && value >= 0 ? value : null
}

export const blockedReasonOf = ({ rows, syncing }) => {
  if (syncing) return 'A sync is running. Try again when it finishes.'
  const importing = rows.find((row) => row.status === 'importing')
  if (importing) return `${labelOf(importing)} is still being imported. Try again when it finishes.`
  const scanning = rows.find((row) => row.ad_status === 'scanning')
  if (scanning) return `${labelOf(scanning)} is being scanned for ad breaks. Try again when it finishes.`
  return null
}

export const rootFor = (filePath, roots = {}) => {
  const resolved = path.resolve(filePath)
  const matches = Object.entries(roots)
    .filter(([, root]) => typeof root === 'string' && root.trim())
    .map(([kind, root]) => ({ kind, root: path.resolve(root) }))
    .filter(({ root }) => isInside(resolved, root))
    .sort((a, b) => b.root.length - a.root.length)
  return matches[0] || null
}

export const deletionTargets = (row, roots) => {
  if (!row.file_path) return { file: null, sidecars: [] }
  if (!path.isAbsolute(row.file_path)) return { error: 'The library file path is not a full path' }
  const file = path.resolve(row.file_path)
  const found = rootFor(file, roots)
  if (!found) return { error: 'The library file is outside the library folders' }
  const replacement = row.library_replacement ? path.resolve(row.library_replacement) : null
  const sidecars = [skipMarkerPathOf(file), `${file}${ORIG_SUFFIX}`]
  return {
    kind: found.kind,
    root: found.root,
    file: file === replacement ? null : file,
    sidecars: sidecars.filter((sidecar) => sidecar !== replacement),
  }
}

export const isSafeTarget = ({ realFile, realRoot }) => isInside(realFile, realRoot)

export const bytesFreed = (entries = []) => {
  const groups = new Map()
  for (const entry of entries) {
    const key = `${entry.dev}:${entry.ino}`
    const group = groups.get(key) || { size: entry.size, nlink: 0, removed: 0 }
    group.nlink = Math.max(group.nlink, entry.nlink)
    group.removed += 1
    groups.set(key, group)
  }
  return [...groups.values()]
    .filter((group) => group.removed >= group.nlink)
    .reduce((sum, group) => sum + group.size, 0)
}

export const classifyFsError = (err) => {
  const code = err?.code
  if (code === 'ENOENT' || code === 'ENOTDIR') return { status: 'missing' }
  const message = FS_ERROR_MESSAGES[code] || `Could not delete the library file (${code || err?.message || 'unknown error'})`
  return { status: 'failed', error: message }
}

export const summarise = (results = []) => {
  const okCount = results.filter((result) => result.ok).length
  const failedCount = results.length - okCount
  return { okCount, failedCount, httpStatus: failedCount > 0 ? 207 : 200 }
}

export const deletionPatch = ({ row, result, now }) => {
  if (!LIBRARY_DONE.includes(result.library)) return null
  const patch = { library_deleted_at: row.library_deleted_at ?? now, library_choice: 'exclude' }
  if (!TVH_DONE.includes(result.tvh)) return patch
  return { ...patch, deleted_from_tvh_at: row.deleted_from_tvh_at ?? now, purged_at: now }
}

export const previewDeletion = async ({ rows, roots, tvh, fs = fsp }) => {
  const entries = []
  let missingCount = 0
  const items = []
  for (const row of rows) {
    const itemEntries = await previewEntriesOf({ row, roots, tvh, fs })
    if (itemEntries.missing) missingCount += 1
    entries.push(...itemEntries.entries)
    items.push({
      recordingId: row.recording_id,
      title: row.title,
      episodeTitle: row.episode_title ?? null,
      season: row.season ?? null,
      episode: row.episode ?? null,
      bytes: bytesFreed(itemEntries.entries),
    })
  }
  return { count: rows.length, bytes: bytesFreed(entries), missingCount, items }
}

export const runDeletion = async ({
  rows,
  roots,
  tvh,
  plex,
  fs = fsp,
  save = async () => {},
  now = () => new Date().toISOString(),
}) => {
  const results = []
  const entries = []
  const affectedKinds = new Set()
  for (const row of rows) {
    const outcome = await deleteOne({ row, roots, tvh, fs })
    entries.push(...outcome.entries)
    if (outcome.libraryChanged) affectedKinds.add(outcome.kind)
    const result = resultOf({ row, outcome })
    const patch = deletionPatch({ row, result, now: now() })
    if (patch) await save({ row, patch })
    results.push(result)
  }
  return { results, bytesFreed: bytesFreed(entries), plex: await refreshPlex({ kinds: affectedKinds, plex }) }
}

const deleteOne = async ({ row, roots, tvh, fs }) => {
  if (tvh.activeIds?.has(row.recording_id)) {
    return refusedOutcome('This episode is still recording. Stop it or wait until it finishes.')
  }
  const library = await deleteLibraryFiles({ row, roots, fs })
  if (library.status === 'failed') {
    return { ...library, library: 'failed', tvh: 'skipped', libraryChanged: library.changed }
  }
  const removal = await removeFromTvh({ row, tvh, fs })
  return {
    kind: library.kind,
    library: library.status,
    tvh: removal.status,
    error: removal.error ?? null,
    entries: [...library.entries, ...removal.entries],
    libraryChanged: library.changed,
  }
}

const deleteLibraryFiles = async ({ row, roots, fs }) => {
  const targets = deletionTargets(row, roots)
  if (targets.error) return failedLibrary(targets.error)
  if (!targets.root) return { status: 'none', entries: [], changed: false }
  const realRoot = await fs.realpath(targets.root).catch(() => null)
  if (!realRoot) return failedLibrary('The library folder is not available, so nothing was deleted')
  const main = targets.file
    ? await unlinkTarget({ target: targets.file, realRoot, fs })
    : { status: 'missing', entries: [] }
  if (main.status === 'failed') return { ...failedLibrary(main.error), kind: targets.kind }
  const sidecars = []
  for (const sidecar of targets.sidecars) sidecars.push(await unlinkTarget({ target: sidecar, realRoot, fs }))
  const removed = [main, ...sidecars].filter((outcome) => outcome.status === 'deleted')
  if (removed.length) await removeEmptyFolders({ dir: removed[0].realParent, realRoot, fs })
  const libraryEntries = removed.flatMap((outcome) => outcome.entries)
  const sidecarFailure = sidecars.find((outcome) => outcome.status === 'failed')
  if (sidecarFailure) {
    return { ...failedLibrary(sidecarFailure.error), kind: targets.kind, entries: libraryEntries, changed: true }
  }
  return {
    kind: targets.kind,
    status: libraryStatusOf({ main, row }),
    entries: libraryEntries,
    changed: removed.length > 0,
  }
}

const unlinkTarget = async ({ target, realRoot, fs }) => {
  const inspected = await inspectTarget({ target, realRoot, fs })
  if (inspected.status !== 'present') return inspected
  const unlinked = await attempt(() => fs.unlink(inspected.realFile))
  if (unlinked.error) return { ...classifyFsError(unlinked.error), entries: [] }
  return { status: 'deleted', entries: [entryOf(inspected.stat)], realParent: inspected.realParent }
}

const inspectTarget = async ({ target, realRoot, fs }) => {
  const parent = await attempt(() => fs.realpath(path.dirname(target)))
  if (parent.error) return { ...classifyFsError(parent.error), entries: [] }
  const realFile = path.join(parent.value, path.basename(target))
  if (!isSafeTarget({ realFile, realRoot })) {
    return { status: 'failed', error: 'The library file is outside the library folder, so it was left alone', entries: [] }
  }
  const stat = await attempt(() => fs.lstat(realFile))
  if (stat.error) return { ...classifyFsError(stat.error), entries: [] }
  if (!stat.value.isFile()) {
    return { status: 'failed', error: 'The library file is not a regular file, so it was left alone', entries: [] }
  }
  return { status: 'present', realFile, realParent: parent.value, stat: stat.value, entries: [] }
}

const removeEmptyFolders = async ({ dir, realRoot, fs }) => {
  let current = dir
  for (let level = 0; level < EMPTY_FOLDER_LEVELS && isInside(current, realRoot); level++) {
    const removed = await attempt(() => fs.rmdir(current))
    if (removed.error) return
    current = path.dirname(current)
  }
}

const removeFromTvh = async ({ row, tvh, fs }) => {
  if (row.deleted_from_tvh_at) return { status: 'already_removed', entries: [] }
  const source = tvh.sourcePathFor?.(row) || null
  const sourceStat = source ? (await attempt(() => fs.lstat(source))).value : null
  const removed = await attempt(() => tvh.remove(row.recording_id))
  if (removed.error) {
    return { status: 'failed', error: `TVHeadend did not remove the recording: ${removed.error.message}`, entries: [] }
  }
  const entries = removed.value === 'removed' && sourceStat?.isFile() ? [entryOf(sourceStat)] : []
  return { status: removed.value, entries }
}

const previewEntriesOf = async ({ row, roots, tvh, fs }) => {
  const targets = deletionTargets(row, roots)
  const realRoot = targets.root ? await fs.realpath(targets.root).catch(() => null) : null
  const files = realRoot ? [targets.file, ...targets.sidecars].filter(Boolean) : []
  const inspected = []
  for (const target of files) inspected.push(await inspectTarget({ target, realRoot, fs }))
  const present = inspected.filter((outcome) => outcome.status === 'present')
  const missing = Boolean(targets.root) && !(targets.file && inspected[0]?.status === 'present')
  const source = row.deleted_from_tvh_at ? null : tvh.sourcePathFor?.(row) || null
  const sourceStat = source ? (await attempt(() => fs.lstat(source))).value : null
  const entries = [...present.map((outcome) => entryOf(outcome.stat))]
  if (sourceStat?.isFile()) entries.push(entryOf(sourceStat))
  return { entries, missing }
}

const refreshPlex = async ({ kinds, plex }) => {
  const refreshed = {}
  for (const kind of kinds) {
    const outcome = await attempt(() => plex.refresh(kind))
    refreshed[kind] = outcome.error ? { error: outcome.error.message } : outcome.value
  }
  return refreshed
}

const resultOf = ({ row, outcome }) => ({
  recordingId: row.recording_id,
  ok: outcome.library !== 'failed' && outcome.library !== 'skipped' && outcome.tvh !== 'failed',
  library: outcome.library,
  tvh: outcome.tvh,
  bytesFreed: bytesFreed(outcome.entries),
  error: outcome.error ?? null,
})

const libraryStatusOf = ({ main, row }) => {
  if (main.status === 'deleted') return 'deleted'
  return row.library_replacement ? 'kept_replacement' : 'missing'
}

const refusedOutcome = (error) => ({ library: 'skipped', tvh: 'skipped', error, entries: [], libraryChanged: false })

const failedLibrary = (error) => ({ status: 'failed', error, entries: [], changed: false })

const recordingIdsRequestFrom = (ids) => {
  const isIdList = Array.isArray(ids) && ids.length > 0 && ids.every((id) => typeof id === 'string' && id.trim())
  if (!isIdList) return { error: 'recording_ids must be a non-empty list of recording ids' }
  if (ids.length > MAX_RECORDING_IDS) return { error: `send at most ${MAX_RECORDING_IDS} recording ids at a time` }
  return { request: { recordingIds: [...new Set(ids)] } }
}

const labelOf = (row) => {
  const episode = row.season != null && row.episode != null ? ` S${pad(row.season)}E${pad(row.episode)}` : ''
  return `${row.title}${episode}`
}

const pad = (value) => String(value).padStart(2, '0')

const isInside = (child, parent) => {
  const prefix = parent.endsWith(path.sep) ? parent : `${parent}${path.sep}`
  return child !== parent && child.startsWith(prefix)
}

const skipMarkerPathOf = (file) => path.join(path.dirname(file), `${path.basename(file, path.extname(file))}.edl`)

const entryOf = (stat) => ({ dev: stat.dev, ino: stat.ino, size: stat.size, nlink: stat.nlink })

const attempt = async (run) => {
  try {
    return { value: await run() }
  } catch (error) {
    return { error }
  }
}

const ORIG_SUFFIX = '.orig'
const EMPTY_FOLDER_LEVELS = 2
const LIBRARY_DONE = ['deleted', 'missing', 'kept_replacement', 'none']
const TVH_DONE = ['removed', 'missing', 'already_removed']
const FS_ERROR_MESSAGES = {
  EROFS: 'The library folder is read-only',
  EACCES: 'Freetvarr does not have permission to delete the library file',
  EPERM: 'Freetvarr does not have permission to delete the library file',
  EBUSY: 'The library file is in use',
}
