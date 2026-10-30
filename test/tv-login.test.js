import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createTvLogin, deleteTvLogin, deleteTvLoginRoute, validTvLoginName } from '../src/tv-login.js'

const CONN = { url: 'http://tvh.test:9981', username: 'freetvarr', password: 'secret' }

const fakeTvheadend = ({ access = [{ uuid: 'a1', username: 'freetvarr', prefix: '192.168.86.0/24' }], failOn = {}, authcode = 'P.code' } = {}) => {
  const state = { access: [...access], passwords: [], deleted: [], nextId: 1 }
  const get = async (path) => {
    if (path === 'access/entry/grid') return { entries: state.access }
    if (path === 'passwd/entry/grid') return { entries: state.passwords }
    throw new Error(`unexpected GET ${path}`)
  }
  const post = async (path, form) => {
    if (failOn[path]) throw new Error(failOn[path])
    if (path === 'idnode/delete') {
      state.deleted.push(form.uuid)
      return {}
    }
    const uuid = `uuid-${state.nextId++}`
    const conf = JSON.parse(form.conf)
    if (path === 'access/entry/create') state.access.push({ uuid, ...conf })
    if (path === 'passwd/entry/create') {
      const enabled = conf.auth?.includes('enable')
      state.passwords.push({ uuid, ...conf, ...(enabled ? { authcode } : {}) })
    }
    return { uuid }
  }
  return { http: { get, post }, state }
}

test('createTvLogin: makes a watch-only login with a persistent code on the Freetvarr networks', async () => {
  const { http, state } = fakeTvheadend()
  const login = await createTvLogin({ http, conn: CONN, username: ' tv ', fallbackPrefix: '10.0.0.0/24', generatePassword: () => 'pw' })
  assert.deepEqual(login, { username: 'tv', password: 'pw', authCode: 'P.code' })
  const entry = state.access.find((e) => e.username === 'tv')
  assert.equal(entry.prefix, '192.168.86.0/24')
  assert.equal(entry.admin, false)
  assert.equal(entry.webui, false)
  assert.deepEqual(entry.dvr, [])
  assert.deepEqual(entry.streaming, ['basic', 'advanced', 'htsp'])
  assert.deepEqual(entry.change, ['change_rights'])
  assert.deepEqual(state.passwords[0].auth, ['enable'])
})

test('createTvLogin: uses the fallback networks when Freetvarr has no entry of its own', async () => {
  const { http, state } = fakeTvheadend({ access: [] })
  await createTvLogin({ http, conn: CONN, username: 'tv', fallbackPrefix: '10.0.0.0/24' })
  assert.equal(state.access[0].prefix, '10.0.0.0/24')
})

test('createTvLogin: refuses a name TVHeadend already has', async () => {
  const { http } = fakeTvheadend({ access: [{ uuid: 'a1', username: 'tv' }] })
  await assert.rejects(createTvLogin({ http, conn: CONN, username: 'tv' }), { code: 'taken' })
})

test('createTvLogin: removes what it made when TVHeadend gives no code', async () => {
  const { http, state } = fakeTvheadend({ authcode: null })
  await assert.rejects(createTvLogin({ http, conn: CONN, username: 'tv' }), { code: 'no-confirm' })
  assert.deepEqual(state.deleted, ['uuid-1', 'uuid-2'])
})

test('createTvLogin: removes the access entry when the password fails', async () => {
  const { http, state } = fakeTvheadend({ failOn: { 'passwd/entry/create': 'HTTP 500' } })
  await assert.rejects(createTvLogin({ http, conn: CONN, username: 'tv' }), /HTTP 500/)
  assert.deepEqual(state.deleted, ['uuid-1'])
})

test('validTvLoginName: rejects blanks and spaces', () => {
  assert.throws(() => validTvLoginName('  '), { code: 'invalid' })
  assert.throws(() => validTvLoginName('living room'), { code: 'invalid' })
  assert.equal(validTvLoginName('lounge-tv'), 'lounge-tv')
})

const MADE = 'TV apps login, created by Freetvarr'

const tvheadendWithLogins = () => fakeTvheadend({
  access: [
    { uuid: 'a-own', username: 'freetvarr' },
    { uuid: 'a-tv', username: 'tv', comment: MADE },
    { uuid: 'a-hand', username: 'tv', comment: 'made by hand' },
    { uuid: 'a-other', username: 'kitchen', comment: MADE },
  ],
})

const withPasswords = (fake) => {
  fake.state.passwords.push(
    { uuid: 'p-tv', username: 'tv', comment: MADE },
    { uuid: 'p-own', username: 'freetvarr' },
    { uuid: 'p-other', username: 'tv-2', comment: MADE },
  )
  return fake
}

const fakeResponse = () => {
  const res = { statusCode: 200, body: null }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  return res
}

const routeWith = ({ http, stored = { username: 'tv', password: 'pw', authCode: 'P.code' } }) => {
  const calls = { cleared: 0 }
  const handler = deleteTvLoginRoute({
    http,
    resolveConnection: async () => CONN,
    readLogin: async () => stored,
    clearLogin: async () => { calls.cleared++ },
  })
  const send = async (body) => {
    const res = fakeResponse()
    await handler({ body }, res)
    return res
  }
  return { send, calls }
}

test('deleteTvLogin: deletes only the access and password entries Freetvarr made for that name', async () => {
  const { http, state } = withPasswords(tvheadendWithLogins())
  const result = await deleteTvLogin({ http, conn: CONN, username: 'tv' })
  assert.deepEqual(result, { username: 'tv', removed: ['a-tv', 'p-tv'] })
  assert.deepEqual(state.deleted, ['a-tv', 'p-tv'])
})

test('deleteTvLogin: deletes nothing when TVHeadend no longer has the login', async () => {
  const { http, state } = fakeTvheadend()
  const result = await deleteTvLogin({ http, conn: CONN, username: 'tv' })
  assert.deepEqual(result.removed, [])
  assert.deepEqual(state.deleted, [])
})

test('deleteTvLogin: rejects a name with spaces', async () => {
  const { http } = fakeTvheadend()
  await assert.rejects(deleteTvLogin({ http, conn: CONN, username: 'living room' }), { code: 'invalid' })
})

test('DELETE /api/tv-login: deletes the stored login and clears it', async () => {
  const fake = withPasswords(tvheadendWithLogins())
  const { send, calls } = routeWith({ http: fake.http })
  const res = await send({ username: 'tv' })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { ok: true, username: 'tv', removed: ['a-tv', 'p-tv'] })
  assert.deepEqual(fake.state.deleted, ['a-tv', 'p-tv'])
  assert.equal(calls.cleared, 1)
})

test('DELETE /api/tv-login: refuses a name that is not the stored login', async () => {
  const fake = withPasswords(tvheadendWithLogins())
  const { send, calls } = routeWith({ http: fake.http })
  const res = await send({ username: 'kitchen' })
  assert.equal(res.statusCode, 409)
  assert.deepEqual(fake.state.deleted, [])
  assert.equal(calls.cleared, 0)
})

test('DELETE /api/tv-login: answers 404 when there is no TV login', async () => {
  const fake = tvheadendWithLogins()
  const { send } = routeWith({ http: fake.http, stored: {} })
  const res = await send({ username: 'tv' })
  assert.equal(res.statusCode, 404)
  assert.deepEqual(fake.state.deleted, [])
})

test('DELETE /api/tv-login: keeps the stored login when TVHeadend fails', async () => {
  const fake = withPasswords(tvheadendWithLogins())
  const http = { ...fake.http, post: async () => { throw new Error('HTTP 500') } }
  const { send, calls } = routeWith({ http })
  const res = await send({ username: 'tv' })
  assert.equal(res.statusCode, 502)
  assert.match(res.body.error, /did not delete/)
  assert.equal(calls.cleared, 0)
})
