import crypto from 'node:crypto'

export const createTvLogin = async ({ http, conn, username, fallbackPrefix, generatePassword = randomPassword }) => {
  const name = validTvLoginName(username)
  const accessEntries = await gridEntries({ http, conn, path: 'access/entry/grid' })
  if (accessEntries.some((e) => e.username === name)) {
    throw new TvLoginError(`TVHeadend already has a login called ${name}. Choose another name.`, 'taken')
  }
  const prefix = accessEntries.find((e) => e.username === conn.username)?.prefix || fallbackPrefix
  const password = generatePassword()
  const created = []
  try {
    const access = await http.post('access/entry/create', {
      conf: JSON.stringify({ ...WATCH_ONLY_RIGHTS, username: name, prefix, comment: CREATED_COMMENT }),
    }, conn)
    if (access?.uuid) created.push(access.uuid)
    const entry = await http.post('passwd/entry/create', {
      conf: JSON.stringify({ enabled: true, username: name, password, auth: ['enable'], comment: CREATED_COMMENT }),
    }, conn)
    if (entry?.uuid) created.push(entry.uuid)
    const authCode = await readAuthCode({ http, conn, username: name })
    if (!access?.uuid || !entry?.uuid || !authCode) {
      throw new TvLoginError(`TVHeadend did not confirm the ${name} login.`, 'no-confirm')
    }
    return { username: name, password, authCode }
  } catch (err) {
    for (const uuid of created) await http.post('idnode/delete', { uuid }, conn).catch(() => null)
    throw err
  }
}

export const deleteTvLogin = async ({ http, conn, username }) => {
  const name = validTvLoginName(username)
  const [accessEntries, passwordEntries] = await Promise.all([
    gridEntries({ http, conn, path: 'access/entry/grid' }),
    gridEntries({ http, conn, path: 'passwd/entry/grid' }),
  ])
  const uuids = [...accessEntries, ...passwordEntries]
    .filter((entry) => isMadeByFreetvarr({ entry, username: name }))
    .map((entry) => entry.uuid)
  for (const uuid of uuids) await http.post('idnode/delete', { uuid }, conn)
  return { username: name, removed: uuids }
}

export const deleteTvLoginRoute = ({ http, resolveConnection, readLogin, clearLogin }) => async (req, res) => {
  const stored = await readLogin()
  const requested = String(req.body?.username ?? '').trim()
  if (!stored.username) return res.status(404).json({ ok: false, error: 'There is no TV login to delete.' })
  if (requested !== stored.username) {
    return res.status(409).json({ ok: false, error: `The TV login is ${stored.username}, not ${requested || 'blank'}.` })
  }
  try {
    const result = await deleteTvLogin({ http, conn: await resolveConnection(), username: stored.username })
    await clearLogin()
    console.log(`[tv-login] deleted the watch-only TVHeadend login ${result.username}`)
    res.json({ ok: true, ...result })
  } catch (err) {
    if (err instanceof TvLoginError) return res.status(400).json({ ok: false, error: err.message, code: err.code })
    res.status(502).json({ ok: false, error: `TVHeadend did not delete the TV login: ${err.message}` })
  }
}

export const validTvLoginName = (username) => {
  const name = String(username ?? '').trim()
  if (!name) throw new TvLoginError('Enter a name for the TV login.', 'invalid')
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    throw new TvLoginError('Use only letters, numbers, dots, dashes, and underscores in the login name.', 'invalid')
  }
  return name
}

export class TvLoginError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'TvLoginError'
    this.code = code
  }
}

const readAuthCode = async ({ http, conn, username }) => {
  const entries = await gridEntries({ http, conn, path: 'passwd/entry/grid' })
  return entries.find((e) => e.username === username)?.authcode || ''
}

const isMadeByFreetvarr = ({ entry, username }) =>
  Boolean(entry.uuid) && entry.username === username && entry.comment === CREATED_COMMENT

const gridEntries = async ({ http, conn, path }) => {
  const body = await http.get(path, { limit: GRID_LIMIT }, conn)
  return body?.entries || []
}

const randomPassword = () => crypto.randomBytes(12).toString('base64url')

const GRID_LIMIT = 500
const CREATED_COMMENT = 'TV apps login, created by Freetvarr'
const WATCH_ONLY_RIGHTS = {
  enabled: true,
  change: ['change_rights'],
  admin: false,
  webui: false,
  streaming: ['basic', 'advanced', 'htsp'],
  dvr: [],
}
