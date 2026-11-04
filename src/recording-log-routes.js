import { db } from './db.js'
import { forgetRecordingArtwork } from './sync.js'

export const mountRecordingLogRoutes = ({ app, csrf }) => {
  app.delete('/api/recordings', csrf, async (req, res) => {
    if (req.query.deleted !== 'true') {
      return res.status(400).json({ error: 'refusing bulk delete without ?deleted=true' })
    }
    const ids = await clearableRows().pluck('recording_id')
    if (ids.length) await clearFromLog(ids)
    res.json({ ok: true, deleted: ids.length, ids })
  })

  app.post('/api/recordings/restore', csrf, async (req, res) => {
    const ids = req.body?.ids
    const isIdList = Array.isArray(ids) && ids.length > 0 && ids.every((id) => typeof id === 'string')
    if (!isIdList) return res.status(400).json({ error: 'ids must be a non-empty list of recording ids' })
    const [unpurged, uncleared] = await Promise.all([
      db('recordings')
        .whereIn('recording_id', ids)
        .whereNotNull('deleted_from_tvh_at')
        .whereNotNull('purged_at')
        .update({ purged_at: null }),
      db('recordings')
        .whereIn('recording_id', ids)
        .whereNotNull('log_cleared_at')
        .update({ log_cleared_at: null }),
    ])
    res.json({ ok: true, restored: unpurged + uncleared })
  })

  app.delete('/api/recordings/:recording_id', csrf, async (req, res) => {
    const recordingId = req.params.recording_id
    const row = await db('recordings').where({ recording_id: recordingId }).first()
    if (!row) return res.status(404).json({ error: 'recording not found' })
    const isUnimported = UNIMPORTED_STATUSES.includes(row.status)
    if (!row.deleted_from_tvh_at && !isUnimported) {
      return res.status(409).json({ error: 'recording still in TVHeadend. Remove it there first.' })
    }
    await clearFromLog([recordingId])
    if (!row.deleted_from_tvh_at) await forgetPicture(recordingId)
    res.json({ ok: true })
  })
}

export const whereInLog = (q) => q.whereNull('recordings.purged_at').whereNull('recordings.log_cleared_at')

export const clearableRows = () => db('recordings')
  .whereNotNull('deleted_from_tvh_at')
  .whereNull('purged_at')
  .whereNull('log_cleared_at')

const clearFromLog = async (ids) => {
  const now = new Date().toISOString()
  await db('recordings').whereIn('recording_id', ids).whereIn('status', IMPORTED_STATUSES)
    .update({ log_cleared_at: now })
  await db('recordings').whereIn('recording_id', ids).whereNotIn('status', IMPORTED_STATUSES)
    .update({ purged_at: now })
}

const forgetPicture = async (recordingId) => {
  await forgetRecordingArtwork(recordingId)
  await db('recordings').where({ recording_id: recordingId }).update({ image_path: null, image_checked_at: null })
}

const IMPORTED_STATUSES = ['done', 'partial']
const UNIMPORTED_STATUSES = ['failed', 'skipped', 'not_imported']
