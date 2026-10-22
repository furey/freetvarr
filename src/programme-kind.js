import { db } from './db.js'

export const MOVIE = 'movie'
export const NOT_MOVIE = 'not-movie'
export const KIND_OVERRIDES = [MOVIE, NOT_MOVIE]

export const kindOverrideFrom = (body) => (KIND_OVERRIDES.includes(body?.kind) ? body.kind : null)

export const titleFrom = (body) => {
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  return title && title.length <= MAX_TITLE_LENGTH ? title : null
}

export const overrideListOf = ({ rows, titles = new Map() }) => [...rows]
  .sort((a, b) => Number(b.updated_at) - Number(a.updated_at))
  .map((row) => ({ showKey: row.show_key, kind: row.kind, title: row.title || titles.get(row.show_key) || row.show_key }))

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

export const mountProgrammeKindRoutes = ({ app, csrf, limiter = passThrough, onChange = () => {}, titlesFor = async () => new Map() }) => {
  app.get('/api/programme-kind', limiter, async (req, res) => {
    try {
      const rows = await db('programme_kind_overrides').select('show_key', 'kind', 'title', 'updated_at')
      const untitled = rows.filter((row) => !row.title).map((row) => row.show_key)
      const titles = untitled.length ? await titlesFor(untitled).catch(() => new Map()) : new Map()
      res.json({ overrides: overrideListOf({ rows, titles }) })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.put('/api/programme-kind/:showKey', limiter, csrf, async (req, res) => {
    const showKey = showKeyFrom(req.params.showKey)
    if (!showKey) return res.status(400).json({ error: SHOW_KEY_ERROR })
    const kind = kindOverrideFrom(req.body)
    if (!kind) return res.status(400).json({ error: KIND_ERROR })
    const title = titleFrom(req.body)
    try {
      await db('programme_kind_overrides')
        .insert({ show_key: showKey, kind, title, updated_at: Date.now() })
        .onConflict('show_key')
        .merge(title ? ['kind', 'title', 'updated_at'] : ['kind', 'updated_at'])
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
const MAX_TITLE_LENGTH = 200
const SHOW_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SHOW_KEY_ERROR = 'showKey must be a show key'
const KIND_ERROR = `kind must be one of ${KIND_OVERRIDES.join(', ')}`
