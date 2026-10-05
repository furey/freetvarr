import { test } from 'node:test'
import assert from 'node:assert/strict'

import { tvhRead, tvhWrite, verifyLogin } from '../../src/tvheadend.js'
import { applyBootstrap, detectFreshInstance, undoBootstrap } from '../../src/tvheadend-bootstrap.js'
import { anonymousStatus, dockerAvailable, eventually, startTvheadend } from './tvheadend-container.js'

test('bootstrap secures a fresh TVHeadend container, refuses a secured one, and undoes', { timeout: 300_000 }, async (t) => {
  if (!(await dockerAvailable())) return t.skip('docker is not available')
  const tvh = await startTvheadend()
  t.after(() => tvh.stop())
  const http = { get: tvhRead, post: tvhWrite, verifyLogin }
  const { url } = tvh
  const anonymous = { url, username: '', password: '' }

  assert.equal((await detectFreshInstance({ http, url })).fresh, true)

  const outsider = await applyBootstrap({
    http,
    store: memoryStore(),
    url,
    adminUsername: 'admin',
    adminPassword: ADMIN_PASSWORD,
    prefixes: ['203.0.113.0/24'],
    attempts: 3,
  })
  assert.equal(outsider.ok, false)
  assert.equal(outsider.failedStep, 'verify-freetvarr')
  assert.equal(outsider.rolledBack, true)
  assert.equal((await detectFreshInstance({ http, url })).fresh, true, 'a failed verify leaves TVHeadend fresh')
  assert.equal(await anonymousStatus(anonymous), 200)

  const store = memoryStore()
  const result = await applyBootstrap({
    http,
    store,
    url,
    adminUsername: 'admin',
    adminPassword: ADMIN_PASSWORD,
    prefixes: ['0.0.0.0/0'],
  })
  assert.equal(result.ok, true, JSON.stringify(result))
  const freetvarr = store.saved.connection
  assert.equal(freetvarr.username, 'freetvarr')
  assert.ok(freetvarr.password.length >= 24)
  assert.equal(store.saved.backup.comment, 'Default access entry')

  assert.equal(await anonymousStatus(anonymous), 401)
  assert.equal(await eventually(() => verifyLogin(freetvarr).then((r) => r.ok)), true)
  assert.equal(await eventually(() => verifyLogin({ url, username: 'admin', password: ADMIN_PASSWORD }).then((r) => r.ok)), true)
  assert.equal((await verifyLogin({ ...freetvarr, password: 'wrong-password' })).status, 403)
  const grid = await tvhRead('access/entry/grid', {}, freetvarr)
  assert.deepEqual(grid.entries.map((e) => e.username).sort(), ['admin', 'freetvarr'])

  const again = await applyBootstrap({
    http,
    store: memoryStore(),
    url,
    adminUsername: 'admin',
    adminPassword: ADMIN_PASSWORD,
    prefixes: ['0.0.0.0/0'],
  })
  assert.equal(again.ok, false)
  assert.equal(again.failedStep, 'check-fresh')
  assert.equal(again.code, 'not-fresh')

  await undoBootstrap({ http, conn: freetvarr, backup: store.saved.backup })
  assert.equal(await eventually(() => anonymousStatus(anonymous).then((s) => s === 200)), true)
  const restored = await detectFreshInstance({ http, url })
  assert.equal(restored.fresh, false)
  assert.equal(restored.reason, 'has-users')

  const afterUndo = await applyBootstrap({
    http,
    store: memoryStore(),
    url,
    adminUsername: 'admin',
    adminPassword: ADMIN_PASSWORD,
    prefixes: ['0.0.0.0/0'],
  })
  assert.equal(afterUndo.failedStep, 'check-fresh')
})

const memoryStore = () => {
  const saved = {}
  return {
    saved,
    saveConnection: async (conn) => { saved.connection = conn },
    saveOpenEntryBackup: async (backup) => { saved.backup = backup },
  }
}

const ADMIN_PASSWORD = 'integration-admin-pw'
