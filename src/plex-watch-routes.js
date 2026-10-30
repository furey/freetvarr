export const mountPlexWatchRoutes = ({ app, csrf, limiter, sync, loadConfig, loadToggles, saveToggles, loadStatus }) => {
  const statusBody = async () => {
    const [config, toggles, status] = await Promise.all([loadConfig(), loadToggles(), loadStatus()])
    return plexWatchStatusOf({ configured: Boolean(config), toggles, status, running: sync.isRunning() })
  }

  app.get('/api/plex/watch-sync', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json(await statusBody())
  })

  app.put('/api/plex/watch-sync', limiter, csrf, async (req, res) => {
    const patch = togglePatchFrom(req.body)
    if (patch.error) return res.status(400).json({ error: patch.error })
    const before = await loadToggles()
    const after = await saveToggles(patch)
    if ((!before.fromPlex && after.fromPlex) || (!before.toPlex && after.toPlex)) sync.request({ trigger: 'settings' })
    res.json(await statusBody())
  })

  app.post('/api/plex/watch-sync/run', limiter, csrf, async (req, res) => {
    if (!(await loadConfig())) return res.status(409).json({ error: 'Plex is not set up', ...(await statusBody()) })
    try {
      await sync.run({ trigger: 'manual', full: true })
      res.json({ ok: true, ...(await statusBody()) })
    } catch (err) {
      res.status(502).json({ ok: false, error: err.message, ...(await statusBody()) })
    }
  })
}

export const plexWatchStatusOf = ({ configured, toggles, status, running }) => ({
  configured,
  fromPlex: toggles.fromPlex,
  toPlex: toggles.toPlex,
  running,
  lastRunAt: status.lastRunAt ?? null,
  lastFullAt: status.lastFullAt ?? null,
  matched: status.matched ?? null,
  unmatched: status.unmatched ?? null,
  ambiguous: status.ambiguous ?? null,
  error: status.error ?? null,
  errorKind: status.errorKind ?? null,
  lastErrorAt: status.lastErrorAt ?? null,
  nextAttemptAt: status.nextAttemptAt ?? null,
})

export const togglePatchFrom = (body = {}) => {
  const patch = {}
  for (const [name, key] of [['from_plex', 'fromPlex'], ['to_plex', 'toPlex']]) {
    if (body?.[name] === undefined) continue
    if (typeof body[name] !== 'boolean') return { error: `${name} must be true or false` }
    patch[key] = body[name]
  }
  if (!Object.keys(patch).length) return { error: 'send from_plex or to_plex' }
  return patch
}
