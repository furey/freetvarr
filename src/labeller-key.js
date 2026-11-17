import { setSetting } from './db.js'
import { LABELLER_KEY_SETTING, labellerStatusOf, resetLabellerKeyState, storedLabellerKey } from './labeller.js'
import { checkJevKey } from './labeller-jev.js'

export const labellerKeyMessageOf = (result) => (result.ok ? 'TypeSafe accepted the key.' : FAILURE_MESSAGES[result.reason] || FAILURE_MESSAGES.unreachable)

export const labellerKeyFrom = (raw) => {
  const key = typeof raw === 'string' ? raw.trim() : ''
  return key && key.length <= MAX_KEY_LENGTH && /^[\w.-]+$/.test(key) ? key : null
}

export const mountLabellerKey = ({ app, csrf, limiter, validate = checkJevKey, status = labellerStatusOf, save = setSetting, reset = resetLabellerKeyState, readKey = storedLabellerKey, onKeySaved = () => {} }) => {
  app.get('/api/labeller', async (req, res) => {
    const state = await status()
    res.json({
      key_set: state.keySet,
      key_rejected: Boolean(state.keySet && state.keyRejected),
      key_no_credit: Boolean(state.keySet && state.noCredit),
      labelled: state.labelled,
      last_run_at: state.lastRun?.at ?? null,
      last_error: state.lastRun?.error ?? null,
    })
  })

  app.post('/api/labeller/test', limiter, csrf, async (req, res) => {
    const typed = req.body?.key
    const apiKey = typed ? labellerKeyFrom(typed) : await readKey()
    if (!apiKey) return res.status(400).json({ ok: false, error: typed ? INVALID_SHAPE : FAILURE_MESSAGES.empty })
    const result = await validate({ apiKey })
    if (!typed && result.ok) await reset()
    if (!typed && result.ok) onKeySaved()
    res.json({ ok: result.ok, message: labellerKeyMessageOf(result) })
  })

  app.put('/api/labeller', limiter, csrf, async (req, res) => {
    const apiKey = labellerKeyFrom(req.body?.key)
    if (!apiKey) return res.status(400).json({ error: INVALID_SHAPE })
    const result = await validate({ apiKey })
    if (!result.ok && result.reason !== 'unreachable') return res.status(400).json({ error: labellerKeyMessageOf(result) })
    await save(LABELLER_KEY_SETTING, apiKey)
    await reset()
    onKeySaved()
    res.json({ ok: true, key_set: true, checked: result.ok })
  })

  app.delete('/api/labeller', csrf, async (req, res) => {
    await save(LABELLER_KEY_SETTING, '')
    await reset()
    res.json({ ok: true, key_set: false })
  })
}

const FAILURE_MESSAGES = {
  invalid: 'TypeSafe did not accept this key. Copy the API key from the TypeSafe console.',
  unreachable: 'Freetvarr could not reach TypeSafe. Check the internet connection and try again.',
  empty: 'Paste a TypeSafe API key first.',
}

const INVALID_SHAPE = 'That does not look like a TypeSafe API key.'
const MAX_KEY_LENGTH = 1024
