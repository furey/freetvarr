import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { db } from './db.js'
import { createKnownAs, loadKnownAs } from './known-as.js'
import { normaliseSearchText } from './web/search-text.js'
import { showKeyOf } from './web/show-key.js'

export const nicknameFrom = (raw) => {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim()
  if (!name || name.length > MAX_NICKNAME_LENGTH) return null
  const nameKey = normaliseSearchText(name)
  return nameKey.length >= 2 ? { name, nameKey } : null
}

export const showCatalogueOf = (rows = []) => {
  const shows = new Map()
  for (const row of rows) {
    if (!row.title) continue
    const key = showKeyOf(row.title)
    const show = shows.get(key) || { key, title: row.title, recordingCount: 0 }
    show.recordingCount += Number(row.count) || 0
    shows.set(key, show)
  }
  return [...shows.values()]
}

export const loadSearchAliases = () => {
  aliasesLoad ??= Promise.all([loadCurated(), loadNicknameAliases(), loadKnownAs()])
    .then(([curated, nicknames, knownAs]) => ({ curated, aliases: [...nicknames, ...knownAs] }))
    .catch((err) => {
      aliasesLoad = null
      throw err
    })
  return aliasesLoad
}

export const invalidateSearchAliases = () => { aliasesLoad = null }

export const knownAs = createKnownAs({ onChange: invalidateSearchAliases })

export const rememberKnownAsFromTvmaze = (found) => knownAs.fromTvmazeShow(found)

export const rememberKnownAsFromWikidata = (found) => knownAs.fromWikidataFilm(found)

export const mountSearchRoutes = ({ app, csrf, limiter = passThrough }) => {
  app.get('/api/search/catalogue', async (req, res) => {
    try {
      const [rows, { curated, aliases }] = await Promise.all([
        db('recordings').whereNull('purged_at').whereNotNull('title').select('title').count({ count: 'recording_id' }).groupBy('title'),
        loadSearchAliases(),
      ])
      res.json({ shows: showCatalogueOf(rows), curated, aliases })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.get('/api/show-nicknames/:key', async (req, res) => {
    try {
      res.json({ nicknames: await nicknamesOf(req.params.key) })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.post('/api/show-nicknames/:key', limiter, csrf, async (req, res) => {
    const nickname = nicknameFrom(req.body?.name)
    if (!nickname) return res.status(400).json({ error: `name is required (up to ${MAX_NICKNAME_LENGTH} characters)` })
    try {
      const showKey = req.params.key
      const existing = await db('show_nicknames').where({ show_key: showKey, name_key: nickname.nameKey }).first()
      if (!existing) {
        const count = await db('show_nicknames').where({ show_key: showKey }).count({ count: 'id' }).first()
        if (Number(count?.count) >= MAX_NICKNAMES) return res.status(400).json({ error: `up to ${MAX_NICKNAMES} names per show` })
        await db('show_nicknames').insert({ show_key: showKey, name: nickname.name, name_key: nickname.nameKey, created_at: Date.now() })
        invalidateSearchAliases()
      }
      res.status(existing ? 200 : 201).json({ ok: true, nicknames: await nicknamesOf(showKey) })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.delete('/api/show-nicknames/:key/:id', limiter, csrf, async (req, res) => {
    try {
      const removed = await db('show_nicknames').where({ show_key: req.params.key, id: Number(req.params.id) }).delete()
      if (!removed) return res.status(404).json({ error: 'name not found' })
      invalidateSearchAliases()
      res.json({ ok: true, nicknames: await nicknamesOf(req.params.key) })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })
}

const nicknamesOf = async (showKey) => (await db('show_nicknames').where({ show_key: showKey }).orderBy('id').select('id', 'name'))
  .map((row) => ({ id: row.id, name: row.name }))

const loadNicknameAliases = async () => (await db('show_nicknames').select('show_key', 'name'))
  .map((row) => ({ key: row.show_key, name: row.name, source: 'user' }))

const loadCurated = async () => {
  curatedLoad ??= fs.readFile(CURATED_PATH, 'utf8').then((text) => JSON.parse(text)).catch(() => [])
  return curatedLoad
}

const passThrough = (req, res, next) => next()

let aliasesLoad = null
let curatedLoad = null

const CURATED_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'show-aliases.json')
const MAX_NICKNAME_LENGTH = 60
const MAX_NICKNAMES = 20
