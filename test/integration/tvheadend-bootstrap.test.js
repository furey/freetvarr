import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

import { tvhRead, tvhWrite, verifyLogin } from '../../src/tvheadend.js'
import { applyBootstrap, detectFreshInstance, undoBootstrap } from '../../src/tvheadend-bootstrap.js'

const run = promisify(execFile)

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

const startTvheadend = async () => {
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-tvh-it-'))
  const port = await freePort()
  const name = `freetvarr-tvh-it-${process.pid}-${port}`
  const ids = process.getuid ? ['-e', `PUID=${process.getuid()}`, '-e', `PGID=${process.getgid()}`] : []
  await run('docker', [
    'run', '-d', '--name', name,
    '-p', `127.0.0.1:${port}:9981`,
    ...ids,
    '-v', `${configDir}:/config`,
    IMAGE,
  ])
  const url = `http://127.0.0.1:${port}`
  const stop = async () => {
    await run('docker', ['rm', '-f', name]).catch(() => null)
    await fs.rm(configDir, { recursive: true, force: true }).catch(() => null)
  }
  const ready = await eventually(() => anonymousStatus({ url }).then((s) => s === 200), { attempts: 120 })
  if (!ready) {
    await stop()
    throw new Error(`TVHeadend did not answer at ${url}`)
  }
  return { url, stop }
}

const anonymousStatus = async ({ url }) => {
  try {
    await tvhRead('serverinfo', {}, { url, username: '', password: '' })
    return 200
  } catch (err) {
    return err.status ?? 0
  }
}

const eventually = async (check, { attempts = 15, delayMs = 1000 } = {}) => {
  for (let i = 0; i < attempts; i += 1) {
    if (await check().catch(() => false)) return true
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  return false
}

const memoryStore = () => {
  const saved = {}
  return {
    saved,
    saveConnection: async (conn) => { saved.connection = conn },
    saveOpenEntryBackup: async (backup) => { saved.backup = backup },
  }
}

const dockerAvailable = () => run('docker', ['version']).then(() => true, () => false)

const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address()
    server.close(() => resolve(port))
  })
})

const IMAGE = 'lscr.io/linuxserver/tvheadend:latest'
const ADMIN_PASSWORD = 'integration-admin-pw'
