import { db, getSetting } from './db.js'
import {
  getActiveSyncId,
  getMediaRoot,
  getMoviesRoot,
  getOneOffRoot,
  getRecordingsRoot,
  getTvhRecordingsPath,
  localPathFor,
} from './sync.js'
import { listActiveRecordings, removeRecordings, resolveConnection, TvheadendError } from './tvheadend.js'
import { notifyPlexSectionRefresh } from './plex.js'
import { showKeyOf } from './web/show-key.js'
import {
  blockedReasonOf,
  deletionRequestFrom,
  expectedCountFrom,
  previewDeletion,
  runDeletion,
  summarise,
} from './library-delete.js'

export const mountLibraryDeleteRoutes = ({ app, csrf, limiter }) => {
  app.post('/api/library/delete/preview', limiter, csrf, async (req, res) => {
    const { request, error } = deletionRequestFrom(req.body)
    if (error) return res.status(400).json({ error })
    const rows = await loadDeletionRows(request)
    res.setHeader('Cache-Control', 'no-store')
    res.json(await previewDeletion({ rows, ...(await deletionContext()) }))
  })

  app.post('/api/library/delete', limiter, csrf, async (req, res) => {
    const { request, error } = deletionRequestFrom(req.body)
    if (error) return res.status(400).json({ error })
    const expectedCount = expectedCountFrom(req.body)
    if (expectedCount == null) return res.status(400).json({ error: 'expected_count must be a whole number' })
    const rows = await loadDeletionRows(request)
    const blocked = blockedReasonOf({ rows, syncing: getActiveSyncId() != null })
    if (blocked) return res.status(409).json({ error: blocked })
    if (rows.length !== expectedCount) {
      return res.status(409).json({
        error: 'The episodes changed since you checked. Review the list and try again.',
        count: rows.length,
      })
    }
    const outcome = await runDeletion({ rows, ...(await deletionContext()), save: saveDeletion })
    res.status(summarise(outcome.results).httpStatus).json(outcome)
  })
}

const loadDeletionRows = async ({ recordingIds, showKey, scope }) => {
  if (recordingIds) return db('recordings').whereIn('recording_id', recordingIds).whereNull('purged_at')
  const rows = await db('recordings')
    .whereNull('purged_at')
    .where((q) => q.whereIn('status', ['done', 'partial']).orWhereNull('deleted_from_tvh_at'))
    .modify((q) => { if (scope === 'watched') q.whereNotNull('watched_at') })
    .orderBy([{ column: 'season' }, { column: 'episode' }, { column: 'aired_at' }])
  return rows.filter((row) => showKeyOf(row.title) === showKey)
}

const deletionContext = async () => {
  const [mediaRoot, oneOffRoot, moviesRoot, recordingsRoot, tvhRecordingsPath, activeIds] = await Promise.all([
    getMediaRoot(),
    getOneOffRoot(),
    getMoviesRoot(),
    getRecordingsRoot(),
    getTvhRecordingsPath(),
    loadActiveIds(),
  ])
  return {
    roots: { tv: mediaRoot, oneOff: oneOffRoot, film: moviesRoot },
    tvh: {
      activeIds,
      remove: removeFromTvheadend,
      sourcePathFor: (row) => (row.tvh_filename
        ? localPathFor({ tvhFilename: row.tvh_filename, tvhRecordingsPath, recordingsRoot })
        : null),
    },
    plex: { refresh: refreshPlexSection },
  }
}

const loadActiveIds = async () => {
  try {
    const active = await listActiveRecordings(await resolveConnection())
    return new Set(active.map((recording) => recording.uuid))
  } catch {
    return new Set()
  }
}

const removeFromTvheadend = async (recordingId) => {
  try {
    await removeRecordings({ recordingIds: [recordingId] })
    return 'removed'
  } catch (err) {
    if (err instanceof TvheadendError && err.code === 'not-found') return 'missing'
    throw err
  }
}

const refreshPlexSection = async (kind) => {
  if (kind === 'tv') return notifyPlexSectionRefresh()
  const sectionId = await getSetting(PLEX_SECTION_SETTINGS[kind])
  if (!sectionId) return { skipped: true, reason: 'no Plex library chosen for these recordings' }
  return notifyPlexSectionRefresh({ sectionId })
}

const saveDeletion = ({ row, patch }) => db('recordings').where({ recording_id: row.recording_id }).update(patch)

const PLEX_SECTION_SETTINGS = { oneOff: 'plex_oneoff_section_id', film: 'plex_movies_section_id' }
