import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getSetting, setSetting } from './db.js'
import { TIER_OVERRIDES } from './for-you-capability.js'
import { SETTINGS, currentTier, readEmbedRun, readProbe, runEmbeddings, runProbe, isEmbedding } from './for-you-engine.js'
import { getForYou, getHiddenShows, getPickable, isForYouEnabled, startForYou, titlesForKeys, unhideShow } from './for-you-service.js'
import { GENRE_LOOKUP_KEY, genreLookupEnabledFrom } from './genre-enrichment.js'
import { FALLBACK_ATTRIBUTION } from './web/data-credits.js'
import { isViewingHistoryEnabled, logUserEvent, setViewingHistoryEnabled } from './user-events-log.js'

export const mountForYou = ({ app, csrf, limiter = passThrough, start = true }) => {
  app.get('/api/for-you', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    if (!(await isForYouEnabled())) return res.json({ enabled: false, tier: (await currentTier()).tier, coldStart: false, generatedAt: Date.now(), topPick: null, sections: [] })
    try {
      const result = await getForYou()
      res.json(publicResultOf({ result, limit: limitFrom(req.query.limit) }))
    } catch (err) {
      res.status(503).json({ error: `Suggestions are not available right now: ${err.message}` })
    }
  })

  app.get('/api/for-you/why/:id', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      const explanation = (await getForYou()).explanations.get(String(req.params.id))
      if (!explanation) return res.status(404).json({ error: 'That programme is not in your suggestions' })
      res.json(explanation)
    } catch (err) {
      res.status(503).json({ error: err.message })
    }
  })

  app.get('/api/for-you/pickable', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      res.json(await getPickable())
    } catch (err) {
      res.status(503).json({ error: err.message })
    }
  })

  app.post('/api/for-you/picks', limiter, csrf, async (req, res) => {
    const { seriesKeys, error } = picksFrom(req.body)
    if (error) return res.status(400).json({ error })
    if (!(await isViewingHistoryEnabled())) return res.status(409).json({ error: 'Turn on viewing history to save picks' })
    const titles = await titlesForKeys(seriesKeys)
    const logged = seriesKeys
      .filter((seriesKey) => logUserEvent({ kind: 'thumb_up', series_key: seriesKey, title: titles.get(seriesKey) || null, source: 'for-you-picks' }))
      .length
    res.status(202).json({ ok: true, logged })
  })

  app.get('/api/for-you/hidden', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json(await getHiddenShows())
  })

  app.delete('/api/for-you/hidden/:seriesKey', limiter, csrf, async (req, res) => {
    const seriesKey = String(req.params.seriesKey || '')
    if (!SERIES_KEY.test(seriesKey)) return res.status(400).json({ error: 'seriesKey must be a show key' })
    res.json(await unhideShow({ seriesKey }))
  })

  app.get('/api/for-you/settings', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json(await settingsPayload())
  })

  app.put('/api/for-you/settings', limiter, csrf, async (req, res) => {
    const { changes, error } = settingsChangesFrom(req.body)
    if (error) return res.status(400).json({ error })
    if (changes.enabled !== undefined) await setSetting(SETTINGS.enabled, String(changes.enabled))
    if (changes.genreLookup !== undefined) await setSetting(GENRE_LOOKUP_KEY, String(changes.genreLookup))
    if (changes.tierOverride !== undefined) await setSetting(SETTINGS.tierOverride, changes.tierOverride)
    if (changes.ollamaUrl !== undefined) await setSetting(SETTINGS.ollamaUrl, changes.ollamaUrl)
    if (changes.ollamaModel !== undefined) await setSetting(SETTINGS.ollamaModel, changes.ollamaModel)
    if (changes.historyEnabled !== undefined) await setViewingHistoryEnabled(changes.historyEnabled)
    if (changes.tierOverride !== undefined) runEmbeddings().catch((err) => console.warn(`[for-you] embedding failed: ${err.message}`))
    res.json(await settingsPayload())
  })

  app.post('/api/for-you/probe', limiter, csrf, async (req, res) => {
    try {
      await runProbe({ version: await appVersion() })
      runEmbeddings().catch((err) => console.warn(`[for-you] embedding failed: ${err.message}`))
      res.json(await settingsPayload())
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  if (start) appVersion().then((version) => startForYou({ version })).catch(() => {})
}

export const limitFrom = (value) => {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1) return DEFAULT_LIMIT
  return Math.min(number, MAX_LIMIT)
}

export const publicResultOf = ({ result, limit }) => ({
  enabled: true,
  tier: result.tier,
  coldStart: result.coldStart,
  generatedAt: result.generatedAt,
  similarity: result.similarity,
  computeMs: result.computeMs,
  topPick: result.topPick ? publicItemOf(result.topPick) : null,
  sections: result.sections.map((section) => ({ ...section, items: section.items.slice(0, limit).map(publicItemOf) })),
})

export const picksFrom = (body) => {
  const keys = body?.seriesKeys
  if (!Array.isArray(keys) || !keys.length || keys.length > MAX_PICKS) return { error: `seriesKeys must list 1 to ${MAX_PICKS} shows` }
  if (!keys.every((key) => typeof key === 'string' && SERIES_KEY.test(key))) return { error: 'each series key must be a show key' }
  return { seriesKeys: [...new Set(keys)] }
}

export const settingsChangesFrom = (body = {}) => {
  const changes = {}
  for (const field of ['enabled', 'genreLookup', 'historyEnabled']) {
    if (body[field] === undefined) continue
    if (typeof body[field] !== 'boolean') return { error: `${field} must be true or false` }
    changes[field] = body[field]
  }
  if (body.tierOverride !== undefined) {
    if (!TIER_OVERRIDES.includes(body.tierOverride)) return { error: `tierOverride must be one of ${TIER_OVERRIDES.join(', ')}` }
    changes.tierOverride = body.tierOverride
  }
  if (body.ollamaUrl !== undefined) {
    const url = String(body.ollamaUrl ?? '').trim()
    if (url && !/^https?:\/\/[^\s]+$/i.test(url)) return { error: 'ollamaUrl must be an http or https address' }
    changes.ollamaUrl = url.replace(/\/$/, '')
  }
  if (body.ollamaModel !== undefined) {
    const model = String(body.ollamaModel ?? '').trim()
    if (model.length > 100) return { error: 'ollamaModel must be up to 100 characters' }
    changes.ollamaModel = model
  }
  return { changes }
}

const publicItemOf = ({ categories, seasonNumber, episodeNumber, ...item }) => item

const settingsPayload = async () => {
  const [enabled, genreLookup, tier, probe, embeddings, historyEnabled, ollamaUrl, ollamaModel] = await Promise.all([
    isForYouEnabled(),
    getSetting(GENRE_LOOKUP_KEY).then(genreLookupEnabledFrom),
    currentTier(),
    readProbe(),
    readEmbedRun(),
    isViewingHistoryEnabled(),
    getSetting(SETTINGS.ollamaUrl),
    getSetting(SETTINGS.ollamaModel),
  ])
  return {
    enabled,
    genreLookup,
    tier: tier.tier,
    tierReason: tier.reason,
    tierOverride: tier.override,
    probe: probe ? probeSummaryOf(probe) : null,
    embeddings: embeddings ? { ...embeddings, running: isEmbedding() } : { running: isEmbedding() },
    historyEnabled,
    ollamaUrl: ollamaUrl || '',
    ollamaModel: ollamaModel || '',
    attribution: ATTRIBUTION,
  }
}

const probeSummaryOf = (probe) => {
  const { capability = {}, onnx, bench, dailyTexts, ollama } = probe.inputs || {}
  return {
    at: probe.at,
    version: probe.version,
    autoTier: probe.auto?.tier,
    autoReason: probe.auto?.reason,
    arch: capability.arch,
    cores: capability.cores,
    cpuFlags: capability.flags,
    memory: {
      totalMb: capability.totalMb ?? null,
      availableMb: capability.availableMb ?? null,
      cgroupHeadroomMb: capability.cgroupMb ?? null,
      headroomMb: capability.headroomMb ?? null,
    },
    onnx,
    bench,
    dailyTexts,
    ollama,
  }
}

const appVersion = async () => {
  versionPromise ??= fs.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')
    .then((text) => JSON.parse(text).version)
  return versionPromise
}

const passThrough = (req, res, next) => next()

let versionPromise = null

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 20
const MAX_PICKS = 30
const SERIES_KEY = /^[a-z0-9-]{1,200}$/
const ATTRIBUTION = FALLBACK_ATTRIBUTION
