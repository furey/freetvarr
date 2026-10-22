import { db } from './db.js'

export const MOVIE = 'movie'
export const NOT_MOVIE = 'not-movie'
export const KIND_OVERRIDES = [MOVIE, NOT_MOVIE]

export const kindOverrideFrom = (body) => (KIND_OVERRIDES.includes(body?.kind) ? body.kind : null)

export const showKeyFrom = (raw) => {
  const key = String(raw ?? '')
  return key.length <= MAX_SHOW_KEY_LENGTH && SHOW_KEY.test(key) ? key : null
}

export const withKindOverrides = ({ records, overrides }) => {
  const merged = new Map(records)
  for (const [key, kindOverride] of overrides) {
    merged.set(key, { categories: [], genres: [], source: null, ...merged.get(key), kindOverride })
  }
  return merged
}

export const libraryKindWith = ({ kind, override }) => {
  if (override === MOVIE) return 'movie'
  if (override === NOT_MOVIE && kind === 'movie') return 'oneoff'
  return kind
}

export const loadKindOverrides = async () => new Map(
  (await db('programme_kind_overrides').select('show_key', 'kind')).map((row) => [row.show_key, row.kind]),
)

export const mountProgrammeKindRoutes = ({ app, csrf, limiter = passThrough, onChange = () => {} }) => {
  app.put('/api/programme-kind/:showKey', limiter, csrf, async (req, res) => {
    const showKey = showKeyFrom(req.params.showKey)
    if (!showKey) return res.status(400).json({ error: SHOW_KEY_ERROR })
    const kind = kindOverrideFrom(req.body)
    if (!kind) return res.status(400).json({ error: KIND_ERROR })
    try {
      await db('programme_kind_overrides')
        .insert({ show_key: showKey, kind, updated_at: Date.now() })
        .onConflict('show_key')
        .merge()
      onChange()
      res.json({ ok: true, showKey, kind })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.delete('/api/programme-kind/:showKey', limiter, csrf, async (req, res) => {
    const showKey = showKeyFrom(req.params.showKey)
    if (!showKey) return res.status(400).json({ error: SHOW_KEY_ERROR })
    try {
      const removed = await db('programme_kind_overrides').where({ show_key: showKey }).delete()
      if (removed) onChange()
      res.json({ ok: true, showKey, kind: null })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })
}

const passThrough = (req, res, next) => next()

const MAX_SHOW_KEY_LENGTH = 200
const SHOW_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SHOW_KEY_ERROR = 'showKey must be a show key'
const KIND_ERROR = `kind must be one of ${KIND_OVERRIDES.join(', ')}`
