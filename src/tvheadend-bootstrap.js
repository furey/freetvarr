import os from 'os'
import net from 'net'
import crypto from 'crypto'

export const detectFreshInstance = async ({ http, url }) => {
  const anonymous = anonymousConnection(url)
  const access = await http.get('access/entry/grid', { limit: GRID_LIMIT }, anonymous).catch(refusedOrThrow)
  if (access === REFUSED) return { fresh: false, reason: 'secured', accessEntries: null }
  const accessEntries = access?.entries || []
  const passwords = await http.get('passwd/entry/grid', { limit: GRID_LIMIT }, anonymous).catch(refusedOrThrow)
  const passwordEntries = passwords === REFUSED ? null : passwords?.entries || []
  const fresh = isFreshAccessList({ accessEntries, passwordEntries })
  return {
    fresh,
    reason: fresh ? 'open-default-entry' : 'has-users',
    accessEntries: accessEntries.length,
    defaultEntryId: fresh ? accessEntries[0].uuid : null,
  }
}

export const isFreshAccessList = ({ accessEntries, passwordEntries }) =>
  Array.isArray(accessEntries)
  && accessEntries.length === 1
  && isOpenDefaultEntry(accessEntries[0])
  && Array.isArray(passwordEntries)
  && passwordEntries.length === 0

export const isOpenDefaultEntry = (entry) =>
  entry?.username === ANYONE && entry?.comment === DEFAULT_ENTRY_COMMENT && entry?.admin === true

export const findOpenAdminEntries = (entries = []) =>
  entries.filter((e) => e.enabled !== false && e.username === ANYONE && e.admin === true)

export const planBootstrap = ({ lanPrefixes, adminUsername }) => {
  const prefix = lanPrefixes.join(',')
  return {
    prefix,
    steps: [
      { id: 'check-fresh', label: 'Check TVHeadend is open to anyone' },
      { id: 'create-admin', label: 'Make your admin login', user: adminUsername },
      { id: 'create-freetvarr', label: "Make Freetvarr's own login", user: FREETVARR_USERNAME },
      { id: 'verify-freetvarr', label: "Test Freetvarr's login", user: FREETVARR_USERNAME },
      { id: 'verify-admin', label: 'Test your admin login', user: adminUsername },
      { id: 'back-up-open-entry', label: 'Keep a copy of the open access settings, in case you undo' },
      { id: 'save-connection', label: "Save Freetvarr's login" },
      { id: 'remove-open-entry', label: 'Turn off open access' },
      { id: 'confirm-locked', label: 'Check TVHeadend now asks for a login' },
    ],
  }
}

export const applyBootstrap = async ({
  http,
  store,
  url,
  adminUsername,
  adminPassword,
  prefixes,
  onProgress = () => {},
  generatePassword = randomPassword,
  attempts = VERIFY_ATTEMPTS,
  delayMs = VERIFY_DELAY_MS,
}) => {
  const plan = planBootstrap({ lanPrefixes: prefixes, adminUsername })
  const progress = createProgress({ steps: plan.steps, onProgress })
  const anonymous = anonymousConnection(url)
  const freetvarr = { url, username: FREETVARR_USERNAME, password: generatePassword() }
  const admin = { url, username: adminUsername, password: adminPassword }
  const created = []
  const retry = (check) => retryUntil({ check, attempts, delayMs })
  const fail = async ({ stepId, err, rollback }) => {
    progress.fail(stepId)
    if (rollback) await removeCreated({ http, conn: anonymous, uuids: created })
    return {
      ok: false,
      failedStep: stepId,
      code: err?.code || null,
      rolledBack: Boolean(rollback),
      error: err?.message || String(err),
      steps: progress.steps(),
    }
  }
  const run = async (stepId, action) => {
    progress.start(stepId)
    await action()
    progress.done(stepId)
  }
  let defaultEntryId
  try {
    await run('check-fresh', async () => {
      const status = await detectFreshInstance({ http, url })
      if (!status.fresh) throw new BootstrapError('TVHeadend already has logins.', 'not-fresh')
      defaultEntryId = status.defaultEntryId
    })
  } catch (err) {
    return fail({ stepId: 'check-fresh', err })
  }
  for (const { stepId, conn } of [
    { stepId: 'create-admin', conn: admin },
    { stepId: 'create-freetvarr', conn: freetvarr },
  ]) {
    try {
      await run(stepId, () => createUser({ http, anonymous, user: conn, prefix: plan.prefix, created }))
    } catch (err) {
      return fail({ stepId, err, rollback: true })
    }
  }
  for (const { stepId, conn } of [
    { stepId: 'verify-freetvarr', conn: freetvarr },
    { stepId: 'verify-admin', conn: admin },
  ]) {
    try {
      await run(stepId, async () => {
        const signedIn = await retry(() => http.verifyLogin(conn).then((r) => r.ok, () => false))
        if (!signedIn) throw new BootstrapError(`TVHeadend did not accept the ${conn.username} login.`, 'login')
      })
    } catch (err) {
      return fail({ stepId, err, rollback: true })
    }
  }
  let backup
  try {
    await run('back-up-open-entry', async () => {
      backup = await loadEntryBackup({ http, conn: freetvarr, uuid: defaultEntryId })
      await store.saveOpenEntryBackup(backup)
    })
  } catch (err) {
    return fail({ stepId: 'back-up-open-entry', err, rollback: true })
  }
  try {
    await run('save-connection', () => store.saveConnection(freetvarr))
  } catch (err) {
    return fail({ stepId: 'save-connection', err, rollback: true })
  }
  try {
    await run('remove-open-entry', () => http.post('idnode/delete', { uuid: backup.uuid }, freetvarr))
  } catch (err) {
    return fail({ stepId: 'remove-open-entry', err })
  }
  try {
    await run('confirm-locked', async () => {
      const locked = await retry(() => http.get('serverinfo', {}, anonymous).then(() => false, (e) => e.status === 401))
      if (!locked) throw new BootstrapError('TVHeadend still answers without a login.', 'still-open')
    })
  } catch (err) {
    return fail({ stepId: 'confirm-locked', err })
  }
  return { ok: true, username: FREETVARR_USERNAME, adminUsername, prefix: plan.prefix, steps: progress.steps() }
}

export const undoBootstrap = async ({ http, conn, backup }) => {
  if (!backup) throw new BootstrapError('There is no saved open entry to restore.', 'no-backup')
  const { uuid, index, ...entry } = backup
  const body = await http.post('access/entry/create', { conf: JSON.stringify(entry) }, conn)
  return { ok: true, uuid: body?.uuid || null }
}

export const suggestLanPrefixes = (interfaces = os.networkInterfaces()) => {
  const networks = Object.values(interfaces || {})
    .flat()
    .filter((i) => i && (i.family === 'IPv4' || i.family === 4) && !i.internal)
    .map((i) => i.address)
    .filter((address) => !address.startsWith('169.254.'))
    .map(slash24)
  return [...new Set([...networks, LOOPBACK_PREFIX])]
}

export const parsePrefixes = (input) => {
  const items = Array.isArray(input) ? input : String(input ?? '').split(/[\s,]+/)
  const prefixes = [...new Set(items.map((p) => String(p).trim()).filter(Boolean))]
  const invalid = prefixes.filter((p) => !isCidr(p))
  return { prefixes, invalid }
}

export const validateBootstrapInput = ({ adminUsername, adminPassword, prefixes }) => {
  const username = String(adminUsername ?? '').trim()
  const parsed = parsePrefixes(prefixes)
  if (!username) return { error: 'Choose a username for the TVHeadend admin.' }
  if (username === ANYONE || username === FREETVARR_USERNAME) {
    return { error: `Choose an admin username other than ${username}.` }
  }
  if (/[\s,]/.test(username)) return { error: 'The admin username cannot contain spaces or commas.' }
  if (String(adminPassword ?? '').length < MIN_PASSWORD_LENGTH) {
    return { error: `Use an admin password of at least ${MIN_PASSWORD_LENGTH} characters.` }
  }
  if (parsed.invalid.length) {
    return { error: `${parsed.invalid.join(', ')} is not a network like 192.168.1.0/24.` }
  }
  if (!parsed.prefixes.length) return { error: 'Enter at least one allowed network, like 192.168.1.0/24.' }
  return { adminUsername: username, adminPassword: String(adminPassword), prefixes: parsed.prefixes }
}

export class BootstrapError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'BootstrapError'
    this.code = code
  }
}

export const FREETVARR_USERNAME = 'freetvarr'

const createUser = async ({ http, anonymous, user, prefix, created }) => {
  const access = await http.post('access/entry/create', {
    conf: JSON.stringify({ ...USER_RIGHTS, username: user.username, prefix, comment: CREATED_COMMENT }),
  }, anonymous)
  if (access?.uuid) created.push(access.uuid)
  const password = await http.post('passwd/entry/create', {
    conf: JSON.stringify({ enabled: true, username: user.username, password: user.password }),
  }, anonymous)
  if (password?.uuid) created.push(password.uuid)
  if (!access?.uuid || !password?.uuid) {
    throw new BootstrapError(`TVHeadend did not confirm the ${user.username} login.`, 'no-uuid')
  }
}

const removeCreated = async ({ http, conn, uuids }) => {
  for (const uuid of uuids) await http.post('idnode/delete', { uuid }, conn).catch(() => null)
}

const loadEntryBackup = async ({ http, conn, uuid }) => {
  const body = await http.get('idnode/load', { uuid, grid: 1 }, conn)
  const entry = body?.entries?.[0]
  if (!isOpenDefaultEntry(entry)) {
    throw new BootstrapError('The open entry changed while Freetvarr worked.', 'entry-changed')
  }
  return entry
}

const createProgress = ({ steps, onProgress }) => {
  const state = steps.map((s) => ({ id: s.id, label: s.label, status: 'pending' }))
  const set = (id, status) => {
    const step = state.find((s) => s.id === id)
    if (step) step.status = status
    onProgress(snapshot())
  }
  const snapshot = () => state.map((s) => ({ ...s }))
  return {
    start: (id) => set(id, 'running'),
    done: (id) => set(id, 'done'),
    fail: (id) => set(id, 'failed'),
    steps: snapshot,
  }
}

const retryUntil = async ({ check, attempts, delayMs }) => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (await check()) return true
    if (attempt < attempts) await sleep(delayMs)
  }
  return false
}

const refusedOrThrow = (err) => {
  if (err?.code === 'auth') return REFUSED
  throw err
}

const anonymousConnection = (url) => ({ url, username: '', password: '' })

const randomPassword = () => crypto.randomBytes(24).toString('base64url')

const slash24 = (address) => `${address.split('.').slice(0, 3).join('.')}.0/24`

const isCidr = (value) => {
  const [address, bits, ...rest] = value.split('/')
  if (rest.length || bits === undefined || !/^\d{1,3}$/.test(bits)) return false
  const version = net.isIP(address)
  if (version === 4) return Number(bits) <= 32
  if (version === 6) return Number(bits) <= 128
  return false
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const REFUSED = Symbol('refused')
const ANYONE = '*'
const DEFAULT_ENTRY_COMMENT = 'Default access entry'
const CREATED_COMMENT = 'Created by Freetvarr'
const LOOPBACK_PREFIX = '127.0.0.0/8'
const GRID_LIMIT = 100
const MIN_PASSWORD_LENGTH = 8
const VERIFY_ATTEMPTS = 11
const VERIFY_DELAY_MS = 1000
const USER_RIGHTS = {
  enabled: true,
  admin: true,
  webui: true,
  streaming: ['basic', 'advanced', 'htsp'],
  dvr: ['basic', 'htsp', 'all', 'all_rw', 'failed'],
}
