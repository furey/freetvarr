import fs from 'fs/promises'
import path from 'path'

export const checkRecordingsFolder = async ({ recordingsPath, mediaRoot }) => {
  const probePath = (recordingsPath || '').trim()
  if (!probePath) return { ok: false, problem: 'empty', error: 'path is required' }
  if (!probePath.startsWith('/')) return { ok: false, problem: 'relative', error: 'path must be absolute (start with /)' }
  let stat
  try {
    stat = await fs.stat(probePath)
    await fs.access(probePath, fs.constants.R_OK)
  } catch (err) {
    return { ok: false, ...describeAccessError({ err, probePath, need: 'readable' }) }
  }
  if (!stat.isDirectory()) return { ok: false, problem: 'not-folder', error: `${probePath} exists but is not a directory` }
  const link = await probeHardlink({ from: probePath, to: mediaRoot })
  return { ok: true, path: probePath, hardlinks: link.hardlinks, sameDevice: link.sameDevice }
}

export const probeHardlink = async ({ from, to }) => {
  const [fromStat, toStat] = await Promise.all([fs.stat(from).catch(() => null), fs.stat(to).catch(() => null)])
  const sameDevice = fromStat && toStat ? fromStat.dev === toStat.dev : null
  if (!fromStat || !toStat) return { hardlinks: null, sameDevice }
  const name = `.freetvarr-link-probe-${process.pid}-${Date.now()}`
  const source = path.join(from, name)
  const target = path.join(to, name)
  try {
    await fs.writeFile(source, '')
  } catch {
    return { hardlinks: null, sameDevice }
  }
  try {
    await fs.link(source, target)
    return { hardlinks: true, sameDevice }
  } catch (err) {
    return { hardlinks: err.code === 'EXDEV' ? false : null, sameDevice, code: err.code }
  } finally {
    await Promise.all([fs.rm(source, { force: true }), fs.rm(target, { force: true })])
  }
}

export const checkMediaRoot = async (mediaRoot) => {
  const probePath = (mediaRoot || '').trim()
  if (!probePath) return { ok: false, problem: 'empty', error: 'path is required' }
  if (!probePath.startsWith('/')) return { ok: false, problem: 'relative', error: 'path must be absolute (start with /)' }
  let stat
  try {
    stat = await fs.stat(probePath)
  } catch (err) {
    return { ok: false, ...describeAccessError({ err, probePath, need: 'writable' }) }
  }
  if (!stat.isDirectory()) return { ok: false, problem: 'not-folder', error: `${probePath} exists but is not a directory` }
  try {
    await fs.access(probePath, fs.constants.W_OK)
  } catch (err) {
    return { ok: false, ownerUid: stat.uid, ...describeAccessError({ err, probePath, need: 'writable' }) }
  }
  return { ok: true, path: probePath, ownerUid: stat.uid }
}

export const ROOT_SETTING_KEYS = ['media_root', 'oneoff_root', 'movies_root', 'recordings_root', 'tvh_recordings_path']

export const rootSettingsProblem = async ({ body, current, configDir }) => {
  for (const key of ROOT_SETTING_KEYS) {
    if (body[key] === undefined) continue
    const value = String(body[key]).trim()
    if (!value || value === String(current[key] ?? '').trim()) continue
    const error = key === 'tvh_recordings_path'
      ? tvhPathProblem(value)
      : await localRootProblem({ key, value, configDir })
    if (error) return { field: key, error }
  }
  return null
}

export const compareRecordingPaths = ({ configured, tvhStorage }) => {
  const tvhPath = trimTrailingSlash(tvhStorage)
  const configuredPath = trimTrailingSlash(configured)
  return {
    tvhPath,
    configured: configuredPath,
    matches: Boolean(tvhPath) && tvhPath === configuredPath,
  }
}

export const codedErrorText = ({ code, message = '' }) => {
  const prefix = `${code || 'error'}: `
  return message.startsWith(prefix) ? message : `${prefix}${message}`
}

const tvhPathProblem = (value) => {
  const label = ROOT_LABELS.tvh_recordings_path
  if (!value.startsWith('/')) return `${label} must be a full path that starts with /.`
  if (path.resolve(value) === '/') return `${label} cannot be /.`
  return null
}

const localRootProblem = async ({ key, value, configDir }) => {
  const label = ROOT_LABELS[key]
  if (!value.startsWith('/')) return `${label} must be a full path that starts with /.`
  const resolved = path.resolve(value)
  const candidates = [resolved, await fs.realpath(resolved).catch(() => resolved)]
  const system = candidates.find(isSystemFolder)
  if (system) return `${label} cannot be ${system}, a system folder.`
  if (configDir && candidates.some((folder) => touchesConfigFolder({ folder, configDir }))) {
    return `${label} cannot be the Freetvarr config folder, a folder inside it, or a folder that holds it.`
  }
  const stat = await fs.stat(resolved).catch(() => null)
  if (!stat) return `${label} ${value} does not exist inside the Freetvarr container.`
  if (!stat.isDirectory()) return `${label} ${value} is not a folder.`
  return null
}

const isSystemFolder = (folder) => folder === '/' || RESERVED_TREES.some((tree) => isAtOrInside({ folder, tree }))

const touchesConfigFolder = ({ folder, configDir }) => {
  const config = path.resolve(configDir)
  return isAtOrInside({ folder, tree: config }) || isAtOrInside({ folder: config, tree: folder })
}

const isAtOrInside = ({ folder, tree }) => folder === tree || folder.startsWith(`${tree}/`)

const ROOT_LABELS = {
  media_root: 'Media root',
  oneoff_root: 'One-off folder',
  movies_root: 'Movies folder',
  recordings_root: 'Recordings folder (as Freetvarr sees it)',
  tvh_recordings_path: 'Recordings folder (as TVHeadend sees it)',
}

const RESERVED_TREES = ['/etc', '/proc', '/sys', '/dev', '/app', '/private/etc']

const describeAccessError = ({ err, probePath, need }) => {
  if (err.code === 'ENOENT') return { problem: 'missing', error: `${probePath} does not exist inside the container` }
  if (err.code === 'EACCES') return { problem: 'denied', error: `${probePath} is not ${need} by the container user` }
  return { problem: 'error', error: codedErrorText(err) }
}

const trimTrailingSlash = (value) => {
  const trimmed = String(value || '').trim()
  return trimmed.length > 1 ? trimmed.replace(/\/+$/, '') : trimmed
}
