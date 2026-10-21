import {
  getRecordingPlexLink,
  getShowPlexLink,
  refreshShowArtwork,
  setShowWatched,
} from './library-actions.js'
import { TvheadendError } from './tvheadend.js'
import {
  EPISODE_KINDS,
  EPISODE_STATES,
  episodeLimitFrom,
  getLibraryEpisodes,
  getLibraryShow,
  getLibraryShows,
  moveRecordingsToShow,
  rulePatchFrom,
  setRecordingWatched,
  showMoveFrom,
  updateShowRule,
} from './library.js'

export const mountLibraryRoutes = ({ app, csrf, ruleLimiter, watchedLimiter, playbackSourceResolver, forgetLookups = async () => {} }) => {
  app.get('/api/library/shows', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json(await getLibraryShows())
  })

  app.get('/api/library/shows/:key', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const show = await getLibraryShow({ key: req.params.key, resolvePlayable: await playbackSourceResolver() })
    if (!show) return res.status(404).json({ error: 'show not found' })
    res.json(show)
  })

  app.patch('/api/library/shows/:key/rule', ruleLimiter, csrf, async (req, res) => {
    const { patch, error } = rulePatchFrom(req.body || {})
    if (error) return res.status(400).json({ error })
    try {
      const result = await updateShowRule({ key: req.params.key, patch })
      if (!result) return res.status(404).json({ error: 'show has no series recording' })
      res.json({ ok: true, uuids: result.uuids })
    } catch (err) {
      tvheadendFailure({ res, err })
    }
  })

  app.post('/api/library/shows/:key/watched', watchedLimiter, csrf, async (req, res) => {
    const { watched, through_recording_id: through } = req.body || {}
    if (typeof watched !== 'boolean') return res.status(400).json({ error: 'watched must be true or false' })
    if (through != null && typeof through !== 'string') {
      return res.status(400).json({ error: 'through_recording_id must be a recording id' })
    }
    const result = await setShowWatched({ key: req.params.key, watched, throughRecordingId: through })
    if (!result) return res.status(404).json({ error: 'show not found' })
    if (result.missingThrough) return res.status(404).json({ error: 'recording not found in this show' })
    res.json({ ok: true, ...result })
  })

  app.post('/api/library/shows/:key/refresh-artwork', ruleLimiter, csrf, async (req, res) => {
    const result = await refreshShowArtwork({ key: req.params.key, forgetLookups })
    if (!result) return res.status(404).json({ error: 'show not found' })
    res.json({ ok: true, ...result })
  })

  app.post('/api/library/recordings/show', ruleLimiter, csrf, async (req, res) => {
    const { ids, title, error } = showMoveFrom(req.body || {})
    if (error) return res.status(400).json({ error })
    const result = await moveRecordingsToShow({ ids, title })
    if (!result) return res.status(404).json({ error: 'recording not found' })
    res.json({ ok: true, title, ...result })
  })

  app.get('/api/library/recordings/:recording_id/plex-link', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const result = await getRecordingPlexLink({ recordingId: req.params.recording_id })
    if (!result) return res.status(404).json({ error: 'recording not found' })
    res.json(result)
  })

  app.get('/api/library/shows/:key/plex-link', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const result = await getShowPlexLink({ key: req.params.key })
    if (!result) return res.status(404).json({ error: 'show not found' })
    res.json(result)
  })

  app.get('/api/library/episodes', async (req, res) => {
    const state = req.query.state ?? 'unwatched'
    if (!EPISODE_STATES.includes(state)) {
      return res.status(400).json({ error: `state must be one of ${EPISODE_STATES.join(', ')}` })
    }
    const limit = episodeLimitFrom(req.query.limit)
    if (limit == null) return res.status(400).json({ error: 'limit must be a whole number from 1 to 50' })
    const kind = req.query.kind ?? null
    if (kind != null && !EPISODE_KINDS.includes(kind)) {
      return res.status(400).json({ error: `kind must be one of ${EPISODE_KINDS.join(', ')}` })
    }
    res.setHeader('Cache-Control', 'no-store')
    res.json(await getLibraryEpisodes({ state, limit, kind }))
  })

  app.post('/api/recordings/:recording_id/watched', watchedLimiter, csrf, async (req, res) => {
    const watched = req.body?.watched
    if (typeof watched !== 'boolean') return res.status(400).json({ error: 'watched must be true or false' })
    const result = await setRecordingWatched({ recordingId: req.params.recording_id, watched })
    if (!result) return res.status(404).json({ error: 'recording not found' })
    res.json({ ok: true, ...result })
  })
}

const tvheadendFailure = ({ res, err }) => {
  const stage = err instanceof TvheadendError ? err.stage : 'unknown'
  const code = err instanceof TvheadendError ? err.code : undefined
  console.error(`[library] rule update failed (stage ${stage}): ${err.message}`)
  if (code === 'not-found') return res.status(404).json({ ok: false, error: err.message, stage, code })
  res.status(502).json({ ok: false, error: err.message, stage, code })
}
