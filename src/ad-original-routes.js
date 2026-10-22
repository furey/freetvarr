import path from 'path'

import { db } from './db.js'
import { restoreOriginal, startManualAdScan } from './commercials.js'
import { rootFor } from './library-delete.js'
import { refreshPlexSection } from './library-delete-routes.js'
import { getMediaRoot, getMoviesRoot, getOneOffRoot } from './sync.js'

export const mountAdOriginalRoutes = ({ app, csrf, limiter, isFilePresent }) => {
  app.post('/api/recordings/:recording_id/ad-scan', limiter, csrf, async (req, res) => {
    const recordingId = req.params.recording_id
    const row = await db('recordings').where({ recording_id: recordingId }).first()
    const refusal = await adJobRefusalOf({ row, isFilePresent })
    if (refusal) return res.status(refusal.status).json({ error: refusal.error })
    const show = row.show_id ? await db('shows').where({ id: row.show_id }).first() : null
    const mode = adScanModeOf(show?.ad_removal)
    const started = startManualAdScan({
      filePath: row.file_path,
      mode,
      recordingId,
      onDone: (result) => (result.status === 'cut' || result.restored ? refreshPlexFor(row.file_path) : null),
    })
    if (!started) return res.status(409).json({ error: 'an ad scan is already running' })
    res.status(202).json({ started: true, mode })
  })

  app.post('/api/recordings/:recording_id/restore-original', limiter, csrf, async (req, res) => {
    const recordingId = req.params.recording_id
    const row = await db('recordings').where({ recording_id: recordingId }).first()
    const refusal = await adJobRefusalOf({ row, isFilePresent })
    if (refusal) return res.status(refusal.status).json({ error: refusal.error })
    const roots = await libraryRoots()
    if (!isRestorablePath({ filePath: row.file_path, roots })) {
      return res.status(409).json({ error: 'The episode file is outside the library folders.' })
    }
    const result = await restoreOriginal({ recordingId, filePath: path.resolve(row.file_path) })
    if (result.error === 'busy') return res.status(409).json({ error: RESTORE_ERRORS.busy })
    if (result.error === 'gone') return res.status(409).json({ error: RESTORE_ERRORS.gone })
    const plex = await refreshPlexFor(row.file_path)
    res.json({ ok: true, uncut: result.uncut, size: result.size, plex })
  })
}

export const adScanModeOf = (showAdRemoval) => (!showAdRemoval || showAdRemoval === 'off' ? 'detect' : showAdRemoval)

export const isRestorablePath = ({ filePath, roots }) =>
  typeof filePath === 'string' && path.isAbsolute(filePath) && Boolean(rootFor(filePath, roots))

export const RESTORE_ERRORS = {
  busy: 'Freetvarr is working on this episode\'s ads. Try again when it finishes.',
  gone: 'The original is gone. Freetvarr deletes it when its keep period ends.',
}

const adJobRefusalOf = async ({ row, isFilePresent }) => {
  if (!row) return { status: 404, error: 'recording not found' }
  if (row.status !== 'done') return { status: 409, error: 'recording is not imported' }
  if (!row.file_path) return { status: 409, error: 'recording has no file path' }
  if (!(await isFilePresent(row.file_path))) {
    return { status: 409, error: 'the library file is gone. Something outside Freetvarr replaced or removed it.' }
  }
  return null
}

const libraryRoots = async () => {
  const [tv, oneOff, film] = await Promise.all([getMediaRoot(), getOneOffRoot(), getMoviesRoot()])
  return { tv, oneOff, film }
}

const refreshPlexFor = async (filePath) => {
  try {
    const found = rootFor(filePath, await libraryRoots())
    return found ? await refreshPlexSection(found.kind) : { skipped: true, reason: 'outside the library folders' }
  } catch (err) {
    return { skipped: true, reason: err.message }
  }
}
