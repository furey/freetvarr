import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-sync-start-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const { getActiveSyncId, onSyncFinished, startSync } = await import('../src/sync.js')

let server

before(async () => {
  server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ entries: [] }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  await db.migrate.latest()
  await db('settings').insert([
    { key: 'tvh_url', value: `http://127.0.0.1:${server.address().port}` },
    { key: 'recordings_root', value: path.join(tmpDir, 'recordings') },
    { key: 'media_root', value: path.join(tmpDir, 'media') },
  ])
})

after(async () => {
  await db.destroy()
  await new Promise((resolve) => server.close(resolve))
  await fs.rm(tmpDir, { recursive: true, force: true })
})

const syncFinished = () => new Promise((resolve) => {
  const stop = onSyncFinished(() => {
    stop()
    resolve()
  })
})

test('startSync: calls in the same moment start one sync and share its id', async () => {
  const finished = syncFinished()
  const results = await Promise.all([
    startSync({ trigger: 'recording-finished' }),
    startSync({ trigger: 'cron' }),
    startSync({ trigger: 'manual' }),
  ])
  assert.equal(new Set(results.map((r) => r.syncId)).size, 1)
  assert.deepEqual(results.map((r) => r.alreadyRunning), [false, true, true])
  assert.equal(Number((await db('syncs').count({ count: 'id' }).first()).count), 1)
  await finished
  assert.equal(getActiveSyncId(), null)
})

test('startSync: a finish listener that throws does not stop the listeners after it', async () => {
  const stopThrowing = onSyncFinished(() => { throw new Error('listener broke') })
  const finished = syncFinished()
  await startSync({ trigger: 'manual' })
  await finished
  stopThrowing()
})
