import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  applyBootstrap,
  detectFreshInstance,
  findOpenAdminEntries,
  isFreshAccessList,
  parsePrefixes,
  planBootstrap,
  suggestLanPrefixes,
  undoBootstrap,
  validateBootstrapInput,
} from '../src/tvheadend-bootstrap.js'

const URL = 'http://tvh.test:9981'

const defaultEntry = () => ({
  uuid: 'default-uuid',
  index: 1,
  enabled: true,
  username: '*',
  prefix: '0.0.0.0/0,::/0',
  admin: true,
  webui: true,
  streaming: ['basic', 'advanced', 'htsp'],
  dvr: ['basic', 'htsp', 'all', 'all_rw', 'failed'],
  comment: 'Default access entry',
})

const authError = (status) => Object.assign(new Error(`HTTP ${status}`), { code: 'auth', status })

const fakeTvheadend = ({ access = [defaultEntry()], passwords = [], failOn = {}, refuseLogin = [] } = {}) => {
  const state = { access: [...access], passwords: [...passwords], calls: [], nextId: 1 }
  const isOpen = () => state.access.some((e) => e.username === '*' && e.enabled !== false)
  const knows = (conn) => state.passwords.some((p) => p.username === conn.username && p.password === conn.password)
  const allowed = (conn) => (conn.username ? knows(conn) || isOpen() : isOpen())
  const guard = (conn) => {
    if (!allowed(conn)) throw authError(conn.username ? 403 : 401)
  }
  const get = async (path, params, conn) => {
    state.calls.push({ method: 'get', path, params, conn })
    guard(conn)
    if (path === 'access/entry/grid') return { entries: state.access, total: state.access.length }
    if (path === 'passwd/entry/grid') return { entries: state.passwords, total: state.passwords.length }
    if (path === 'serverinfo') return { sw_version: '4.3', api_version: 20 }
    if (path === 'idnode/load') return { entries: state.access.filter((e) => e.uuid === params.uuid) }
    throw new Error(`unexpected GET ${path}`)
  }
  const post = async (path, form, conn) => {
    state.calls.push({ method: 'post', path, form, conn })
    guard(conn)
    if (failOn[path]) throw new Error(failOn[path])
    const uuid = `uuid-${state.nextId++}`
    if (path === 'access/entry/create') state.access.push({ uuid, ...JSON.parse(form.conf) })
    else if (path === 'passwd/entry/create') state.passwords.push({ uuid, ...JSON.parse(form.conf) })
    else if (path === 'idnode/delete') {
      state.access = state.access.filter((e) => e.uuid !== form.uuid)
      state.passwords = state.passwords.filter((e) => e.uuid !== form.uuid)
      return {}
    } else throw new Error(`unexpected POST ${path}`)
    return { uuid }
  }
  const verifyLogin = async (conn) => {
    state.calls.push({ method: 'verify', conn })
    return { ok: knows(conn) && !refuseLogin.includes(conn.username) }
  }
  return { http: { get, post, verifyLogin }, state }
}

const memoryStore = () => {
  const saved = {}
  return {
    saved,
    saveConnection: async (conn) => { saved.connection = conn },
    saveOpenEntryBackup: async (backup) => { saved.backup = backup },
  }
}

const runApply = ({ http, store, ...overrides }) => applyBootstrap({
  http,
  store,
  url: URL,
  adminUsername: 'admin',
  adminPassword: 'correct-horse',
  prefixes: ['192.168.86.0/24', '127.0.0.0/8'],
  generatePassword: () => 'generated-password-0123456789',
  attempts: 3,
  delayMs: 0,
  ...overrides,
})

const statusOf = (result, id) => result.steps.find((s) => s.id === id).status

test('detectFreshInstance: one default entry and no passwords is fresh', async () => {
  const { http } = fakeTvheadend()
  assert.deepEqual(await detectFreshInstance({ http, url: URL }), {
    fresh: true,
    reason: 'open-default-entry',
    accessEntries: 1,
    defaultEntryId: 'default-uuid',
  })
})

test('detectFreshInstance: a 401 on the access grid means TVHeadend is secured', async () => {
  const { http } = fakeTvheadend({ access: [] })
  assert.deepEqual(await detectFreshInstance({ http, url: URL }), { fresh: false, reason: 'secured', accessEntries: null })
})

test('detectFreshInstance: an extra entry or a password entry is not fresh', async () => {
  const extra = fakeTvheadend({ access: [defaultEntry(), { uuid: 'x', username: 'bob', admin: true }] })
  assert.equal((await detectFreshInstance({ http: extra.http, url: URL })).fresh, false)
  const withPassword = fakeTvheadend({ passwords: [{ uuid: 'p', username: 'bob', password: 'pw' }] })
  const status = await detectFreshInstance({ http: withPassword.http, url: URL })
  assert.equal(status.fresh, false)
  assert.equal(status.reason, 'has-users')
})

test('isFreshAccessList: rejects a lone entry that is not the default open entry', () => {
  const edited = { ...defaultEntry(), comment: 'mine' }
  assert.equal(isFreshAccessList({ accessEntries: [edited], passwordEntries: [] }), false)
  assert.equal(isFreshAccessList({ accessEntries: [{ ...defaultEntry(), admin: false }], passwordEntries: [] }), false)
  assert.equal(isFreshAccessList({ accessEntries: [defaultEntry()], passwordEntries: null }), false)
  assert.equal(isFreshAccessList({ accessEntries: [defaultEntry()], passwordEntries: [] }), true)
})

test('planBootstrap: verifies both logins before it removes the open entry', () => {
  const plan = planBootstrap({ lanPrefixes: ['192.168.1.0/24', '127.0.0.0/8'], adminUsername: 'boss' })
  assert.equal(plan.prefix, '192.168.1.0/24,127.0.0.0/8')
  const ids = plan.steps.map((s) => s.id)
  assert.deepEqual(ids, [
    'check-fresh',
    'create-admin',
    'create-freetvarr',
    'verify-freetvarr',
    'verify-admin',
    'back-up-open-entry',
    'save-connection',
    'remove-open-entry',
    'confirm-locked',
  ])
  assert.ok(ids.indexOf('verify-admin') < ids.indexOf('remove-open-entry'))
  assert.equal(plan.steps[1].label, 'Make your admin login')
})

test('applyBootstrap: creates both users, saves the login and backup, and removes the open entry', async () => {
  const { http, state } = fakeTvheadend()
  const store = memoryStore()
  const progress = []
  const result = await runApply({ http, store, onProgress: (steps) => progress.push(steps) })
  assert.equal(result.ok, true)
  assert.ok(result.steps.every((s) => s.status === 'done'))
  assert.deepEqual(state.access.map((e) => e.username), ['admin', 'freetvarr'])
  assert.deepEqual(state.passwords.map((e) => [e.username, e.password]), [
    ['admin', 'correct-horse'],
    ['freetvarr', 'generated-password-0123456789'],
  ])
  for (const entry of state.access) {
    assert.equal(entry.prefix, '192.168.86.0/24,127.0.0.0/8')
    assert.equal(entry.admin, true)
    assert.equal(entry.webui, true)
    assert.deepEqual(entry.streaming, ['basic', 'advanced', 'htsp'])
    assert.deepEqual(entry.dvr, ['basic', 'htsp', 'all', 'all_rw', 'failed'])
  }
  assert.deepEqual(store.saved.connection, { url: URL, username: 'freetvarr', password: 'generated-password-0123456789' })
  assert.equal(store.saved.backup.uuid, 'default-uuid')
  assert.equal(store.saved.backup.comment, 'Default access entry')
  assert.ok(progress.length >= result.steps.length * 2)
  const deleteCall = state.calls.findIndex((c) => c.path === 'idnode/delete')
  const lastVerify = state.calls.map((c) => c.method).lastIndexOf('verify')
  assert.ok(lastVerify < deleteCall)
})

test('applyBootstrap: refuses an instance that already has users and changes nothing', async () => {
  const { http, state } = fakeTvheadend({ access: [defaultEntry(), { uuid: 'x', username: 'bob', admin: true }] })
  const store = memoryStore()
  const result = await runApply({ http, store })
  assert.equal(result.ok, false)
  assert.equal(result.failedStep, 'check-fresh')
  assert.ok(state.calls.every((c) => c.method === 'get'))
  assert.deepEqual(store.saved, {})
})

test('applyBootstrap: a refused freetvarr login aborts before the open entry goes, and rolls back', async () => {
  const { http, state } = fakeTvheadend({ refuseLogin: ['freetvarr'] })
  const store = memoryStore()
  const result = await runApply({ http, store })
  assert.equal(result.ok, false)
  assert.equal(result.failedStep, 'verify-freetvarr')
  assert.equal(result.rolledBack, true)
  assert.equal(statusOf(result, 'remove-open-entry'), 'pending')
  assert.equal(state.calls.filter((c) => c.method === 'verify').length, 3)
  assert.deepEqual(state.access.map((e) => e.uuid), ['default-uuid'])
  assert.deepEqual(state.passwords, [])
  assert.deepEqual(store.saved, {})
  assert.equal((await detectFreshInstance({ http, url: URL })).fresh, true)
})

test('applyBootstrap: a refused admin login aborts and keeps TVHeadend open', async () => {
  const { http, state } = fakeTvheadend({ refuseLogin: ['admin'] })
  const result = await runApply({ http, store: memoryStore() })
  assert.equal(result.failedStep, 'verify-admin')
  assert.equal(statusOf(result, 'verify-freetvarr'), 'done')
  assert.deepEqual(state.access.map((e) => e.uuid), ['default-uuid'])
})

test('applyBootstrap: a failed create rolls back what it made', async () => {
  const { http, state } = fakeTvheadend({ failOn: { 'passwd/entry/create': 'boom' } })
  const result = await runApply({ http, store: memoryStore() })
  assert.equal(result.failedStep, 'create-admin')
  assert.equal(result.error, 'boom')
  assert.deepEqual(state.access.map((e) => e.uuid), ['default-uuid'])
})

test('applyBootstrap: a TVHeadend that still answers anonymously fails the last step', async () => {
  const { http } = fakeTvheadend()
  const stubborn = { ...http, get: (path, params, conn) => (path === 'serverinfo' ? Promise.resolve({}) : http.get(path, params, conn)) }
  const result = await runApply({ http: stubborn, store: memoryStore() })
  assert.equal(result.failedStep, 'confirm-locked')
  assert.equal(statusOf(result, 'remove-open-entry'), 'done')
})

test('undoBootstrap: recreates the open entry from the backup without its uuid', async () => {
  const { http, state } = fakeTvheadend()
  const store = memoryStore()
  await runApply({ http, store })
  const result = await undoBootstrap({ http, conn: store.saved.connection, backup: store.saved.backup })
  assert.equal(result.ok, true)
  const restored = state.access.find((e) => e.username === '*')
  assert.equal(restored.comment, 'Default access entry')
  assert.equal(restored.prefix, '0.0.0.0/0,::/0')
  assert.notEqual(restored.uuid, 'default-uuid')
  assert.equal('index' in restored, false)
  await assert.rejects(undoBootstrap({ http, conn: store.saved.connection, backup: null }), /no saved open entry/)
})

test('suggestLanPrefixes: one /24 per LAN address plus loopback, de-duplicated', () => {
  const interfaces = {
    lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
    eth0: [{ family: 'IPv4', address: '192.168.86.254', internal: false }, { family: 'IPv6', address: 'fe80::1', internal: false }],
    eth1: [{ family: 'IPv4', address: '192.168.86.10', internal: false }],
    eth2: [{ family: 4, address: '10.0.5.7', internal: false }],
    eth3: [{ family: 'IPv4', address: '169.254.1.2', internal: false }],
  }
  assert.deepEqual(suggestLanPrefixes(interfaces), ['192.168.86.0/24', '10.0.5.0/24', '127.0.0.0/8'])
})

test('parsePrefixes: splits on commas and spaces and flags bad networks', () => {
  assert.deepEqual(parsePrefixes('192.168.1.0/24, 127.0.0.0/8 ::1/128'), {
    prefixes: ['192.168.1.0/24', '127.0.0.0/8', '::1/128'],
    invalid: [],
  })
  assert.deepEqual(parsePrefixes(['192.168.1.0/33', '192.168.1.0', 'lan/24']).invalid, ['192.168.1.0/33', '192.168.1.0', 'lan/24'])
})

test('validateBootstrapInput: plain-language errors for each bad field', () => {
  const ok = { adminUsername: ' admin ', adminPassword: 'long-enough', prefixes: '192.168.1.0/24' }
  assert.deepEqual(validateBootstrapInput(ok), { adminUsername: 'admin', adminPassword: 'long-enough', prefixes: ['192.168.1.0/24'] })
  assert.match(validateBootstrapInput({ ...ok, adminUsername: '' }).error, /Choose a username/)
  assert.match(validateBootstrapInput({ ...ok, adminUsername: 'freetvarr' }).error, /other than freetvarr/)
  assert.match(validateBootstrapInput({ ...ok, adminPassword: 'short' }).error, /at least 8 characters/)
  assert.match(validateBootstrapInput({ ...ok, prefixes: 'home' }).error, /home is not a network/)
  assert.match(validateBootstrapInput({ ...ok, prefixes: '' }).error, /at least one allowed network/)
})

test('findOpenAdminEntries: only enabled * entries with admin rights', () => {
  const entries = [
    defaultEntry(),
    { ...defaultEntry(), uuid: 'off', enabled: false },
    { ...defaultEntry(), uuid: 'viewer', admin: false },
    { ...defaultEntry(), uuid: 'named', username: 'admin' },
  ]
  assert.deepEqual(findOpenAdminEntries(entries).map((e) => e.uuid), ['default-uuid'])
})
