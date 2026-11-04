import { db } from './db.js'
import { removeRecordings, TvheadendError } from './tvheadend.js'
import { libraryChoicePatchOf, libraryStateOf } from './library-files.js'
import { libraryRootReadyFor } from './library-roots.js'
import { startSync as startSyncDefault } from './sync.js'

export const mountRecordingTvhRoutes = ({ app, csrf, limiter, startSync = startSyncDefault }) => {
  app.post('/api/recordings/:recording_id/delete-from-tvh', limiter, csrf, async (req, res) => {
    const recordingId = req.params.recording_id
    const row = await db('recordings').where({ recording_id: recordingId }).first()
    if (!row) return res.status(404).json({ error: 'recording not found' })
    if (row.deleted_from_tvh_at) {
      return res.status(409).json({ error: 'recording already marked removed from TVHeadend' })
    }
    if (row.status !== 'done') return res.status(409).json({ error: NOT_IMPORTED })
    try {
      await removeIfStillThere(recordingId)
      const now = new Date().toISOString()
      await db('recordings')
        .where({ recording_id: recordingId })
        .update({ deleted_from_tvh_at: now, tvh_remove_pending_at: null })
      res.json({ ok: true, deleted_from_tvh_at: now })
    } catch (err) {
      const stage = err instanceof TvheadendError ? err.stage : 'unknown'
      const code = err instanceof TvheadendError ? err.code : undefined
      console.error(`[tvheadend] delete-from-tvh failed for ${recordingId} (stage ${stage}): ${err.message}`)
      res.status(502).json({ ok: false, error: err.message, stage, code })
    }
  })

  app.post('/api/recordings/:recording_id/library', limiter, csrf, async (req, res) => {
    const recordingId = req.params.recording_id
    const choice = req.body?.choice
    if (!LIBRARY_CHOICES.includes(choice)) {
      return res.status(400).json({ error: `choice must be one of ${LIBRARY_CHOICES.join(', ')}` })
    }
    const row = await db('recordings').where({ recording_id: recordingId }).first()
    if (!row) return res.status(404).json({ error: 'recording not found' })
    const { state } = await libraryStateOf(row)
    if (row.status === 'importing' || (row.status === 'done' && state !== 'not_in_library')) {
      return res.status(409).json({ error: 'recording is already in the library' })
    }
    if (choice === 'include' && row.deleted_from_tvh_at) return res.status(409).json({ error: NOT_IN_TVHEADEND })
    if (choice === 'include' && row.file_path && !(await libraryRootReadyFor(row.file_path))) {
      return res.status(409).json({ error: LIBRARY_FOLDER_NOT_READY })
    }
    await db('recordings').where({ recording_id: recordingId }).update(libraryChoicePatchOf(choice))
    const sync = choice === 'include' ? await startSync({ trigger: 'manual:import', followUp: true }) : null
    res.json({ ok: true, choice, syncId: sync?.syncId ?? null })
  })
}

const removeIfStillThere = async (recordingId) => {
  try {
    await removeRecordings({ recordingIds: [recordingId] })
  } catch (err) {
    if (err instanceof TvheadendError && err.code === 'not-found') return
    throw err
  }
}

const LIBRARY_CHOICES = ['include', 'exclude']
const LIBRARY_FOLDER_NOT_READY = 'The library folder for this recording is missing or empty. Check that the media share is mounted, then try again. If you emptied the folder yourself, delete its recordings in Freetvarr first.'
const NOT_IMPORTED = 'Freetvarr removes a recording from TVHeadend only after it imports the file. Import it first.'
const NOT_IN_TVHEADEND = 'This recording is no longer in TVHeadend, so there is nothing to import.'
