import fs from 'fs/promises'

export const checkRecordingsFolder = async ({ recordingsPath, mediaRoot }) => {
  const probePath = (recordingsPath || '').trim()
  if (!probePath) return { ok: false, error: 'path is required' }
  if (!probePath.startsWith('/')) return { ok: false, error: 'path must be absolute (start with /)' }
  let stat
  try {
    stat = await fs.stat(probePath)
    await fs.access(probePath, fs.constants.R_OK)
  } catch (err) {
    return { ok: false, error: describeAccessError({ err, probePath, need: 'readable' }) }
  }
  if (!stat.isDirectory()) return { ok: false, error: `${probePath} exists but is not a directory` }
  const mediaStat = await fs.stat(mediaRoot).catch(() => null)
  return {
    ok: true,
    path: probePath,
    sameFilesystem: mediaStat ? mediaStat.dev === stat.dev : null,
  }
}

export const checkMediaRoot = async (mediaRoot) => {
  const probePath = (mediaRoot || '').trim()
  if (!probePath) return { ok: false, error: 'path is required' }
  if (!probePath.startsWith('/')) return { ok: false, error: 'path must be absolute (start with /)' }
  let stat
  try {
    stat = await fs.stat(probePath)
  } catch (err) {
    return { ok: false, error: describeAccessError({ err, probePath, need: 'writable' }) }
  }
  if (!stat.isDirectory()) return { ok: false, error: `${probePath} exists but is not a directory` }
  try {
    await fs.access(probePath, fs.constants.W_OK)
  } catch (err) {
    return { ok: false, ownerUid: stat.uid, error: describeAccessError({ err, probePath, need: 'writable' }) }
  }
  return { ok: true, path: probePath, ownerUid: stat.uid }
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

const describeAccessError = ({ err, probePath, need }) => {
  if (err.code === 'ENOENT') return `${probePath} does not exist inside the container`
  if (err.code === 'EACCES') return `${probePath} is not ${need} by the container user`
  return `${err.code || 'error'}: ${err.message}`
}

const trimTrailingSlash = (value) => {
  const trimmed = String(value || '').trim()
  return trimmed.length > 1 ? trimmed.replace(/\/+$/, '') : trimmed
}
