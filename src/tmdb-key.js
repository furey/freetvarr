import { getSetting, setSetting } from './db.js'
import { TMDB_KEY_SETTING, validateTmdbKey } from './fallback-artwork.js'

export const tmdbKeyMessageOf = (result) => (result.ok ? 'TMDB accepted the key.' : TMDB_FAILURE_MESSAGES[result.reason] || TMDB_FAILURE_MESSAGES.unreachable)

export const tmdbKeyFrom = (raw) => {
  const key = typeof raw === 'string' ? raw.trim() : ''
  return key && key.length <= MAX_KEY_LENGTH && /^[\w.-]+$/.test(key) ? key : null
}

export const mountTmdbKey = ({ app, csrf, limiter, validate = validateTmdbKey }) => {
  const storedKey = async () => String((await getSetting(TMDB_KEY_SETTING)) || '').trim()

  app.get('/api/artwork/tmdb', async (req, res) => {
    res.json({ key_set: Boolean(await storedKey()) })
  })

  app.post('/api/artwork/tmdb/test', limiter, csrf, async (req, res) => {
    const typed = req.body?.key
    const apiKey = typed ? tmdbKeyFrom(typed) : await storedKey()
    if (!apiKey) return res.status(400).json({ ok: false, error: typed ? INVALID_SHAPE : 'Paste a TMDB API key first.' })
    const result = await validate({ apiKey })
    res.json({ ok: result.ok, message: tmdbKeyMessageOf(result) })
  })

  app.put('/api/artwork/tmdb', limiter, csrf, async (req, res) => {
    const apiKey = tmdbKeyFrom(req.body?.key)
    if (!apiKey) return res.status(400).json({ error: INVALID_SHAPE })
    const result = await validate({ apiKey })
    if (!result.ok && result.reason !== 'unreachable') return res.status(400).json({ error: tmdbKeyMessageOf(result) })
    await setSetting(TMDB_KEY_SETTING, apiKey)
    res.json({ ok: true, key_set: true, checked: result.ok })
  })

  app.delete('/api/artwork/tmdb', csrf, async (req, res) => {
    await setSetting(TMDB_KEY_SETTING, '')
    res.json({ ok: true, key_set: false })
  })
}

const TMDB_FAILURE_MESSAGES = {
  invalid: 'TMDB did not accept this key. Copy the API key or the API read access token from your TMDB account settings.',
  unexpected: 'TMDB sent an unexpected answer. Try again later.',
  unreachable: 'Freetvarr could not reach TMDB. Check the internet connection and try again.',
  empty: 'Paste a TMDB API key first.',
}

const INVALID_SHAPE = 'That does not look like a TMDB API key or read access token.'
const MAX_KEY_LENGTH = 1024
