import { ARR_APPS } from './arr-client.js'
import { findArr, loadArrSettings, loadDiscoveryHosts, saveArrSettings, testArr } from './arr-store.js'

export const mountArrRoutes = ({ app, csrf, limiter, onChange = () => {} }) => {
  app.get('/api/arr', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json(arrBodyOf(await loadArrSettings()))
  })

  app.put('/api/arr', limiter, csrf, async (req, res) => {
    const patch = arrPatchFrom(req.body)
    if (patch.error) return res.status(400).json({ error: patch.error })
    const saved = await saveArrSettings(patch)
    onChange()
    res.json(arrBodyOf(saved))
  })

  app.post('/api/arr/find', limiter, csrf, async (req, res) => {
    res.json(await findArr({ hosts: await loadDiscoveryHosts() }))
  })

  app.post('/api/arr/:app/test', limiter, csrf, async (req, res) => {
    if (!ARR_APPS.includes(req.params.app)) return res.status(404).json({ error: 'unknown app' })
    res.json(await testArr(req.params.app))
  })
}

export const arrBodyOf = (settings) => ({
  ...Object.fromEntries(ARR_APPS.map((app) => [app, {
    url: settings[app].url,
    hasKey: Boolean(settings[app].apiKey),
    keySource: settings[app].keySource,
    configFound: settings[app].configFound,
  }])),
  unmonitorOnDelete: settings.unmonitorOnDelete,
})

export const arrPatchFrom = (body = {}) => {
  const patch = {}
  for (const app of ARR_APPS) {
    const entry = body?.[app]
    if (entry == null) continue
    if (typeof entry !== 'object') return { error: `${app} must be an object` }
    const next = {}
    if (entry.url !== undefined) {
      const url = String(entry.url ?? '').trim()
      if (url && !isHttpUrl(url)) return { error: `${app}.url must start with http:// or https://` }
      next.url = url.replace(/\/+$/, '')
    }
    if (entry.api_key !== undefined) {
      const key = String(entry.api_key ?? '').trim()
      if (key && !/^[A-Za-z0-9]{16,64}$/.test(key)) return { error: `${app}.api_key must be the 32-character key from ${app === 'sonarr' ? 'Sonarr' : 'Radarr'} → Settings → General` }
      next.apiKey = key
    }
    patch[app] = next
  }
  if (body?.unmonitor_on_delete !== undefined) {
    if (typeof body.unmonitor_on_delete !== 'boolean') return { error: 'unmonitor_on_delete must be true or false' }
    patch.unmonitorOnDelete = body.unmonitor_on_delete
  }
  if (!Object.keys(patch).length) return { error: 'send sonarr, radarr, or unmonitor_on_delete' }
  return patch
}

const isHttpUrl = (text) => {
  try {
    const url = new URL(text)
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
  } catch {
    return false
  }
}
