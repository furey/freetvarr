import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createTvLogin, validTvLoginName } from '../src/tv-login.js'

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
