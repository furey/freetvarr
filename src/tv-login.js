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
