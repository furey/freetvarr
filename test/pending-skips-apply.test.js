import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-pending-skips-apply-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const { withPendingSkipsApplied } = await import('../src/epg.js')

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

const START = Date.UTC(2026, 9, 28, 1, 0, 0)

const skipOf = (programId, startDate) => ({ programId, channelId: 'nine', name: `Show ${programId}`, startDate, endDate: startDate + 3_600_000 })

const entryOf = (uuid, skip) => ({
  uuid,
  programId: skip.programId,
  channelId: skip.channelId,
  name: skip.name,
  startDate: skip.startDate,
  enabled: true,
  schedStatus: 'scheduled',
})

test('withPendingSkipsApplied: one failed save keeps that skip and still applies the others', async () => {
  const failing = skipOf('1', START)
  const working = skipOf('2', START + 3_600_000)
  const state = { futureRecordings: [entryOf('u1', failing), entryOf('u2', working)], repeatRecordings: [] }
  const forgotten = []
  const reloaded = { futureRecordings: [], repeatRecordings: [], reloaded: true }
  const result = await withPendingSkipsApplied({
    state,
    pendingSkips: [failing, working],
    skipEntry: async ({ uuid }) => {
      if (uuid === 'u1') throw new Error('idnode/save failed')
    },
    forgetSkip: async (programId) => { forgotten.push(programId) },
    reloadState: async () => reloaded,
  })
  assert.equal(result.state, reloaded)
  assert.deepEqual(result.pendingSkips, [failing])
  assert.deepEqual(forgotten, ['2'])
})

test('withPendingSkipsApplied: when every save fails, the loaded state comes back unchanged', async () => {
  const failing = skipOf('1', START)
  const state = { futureRecordings: [entryOf('u1', failing)], repeatRecordings: [] }
  const result = await withPendingSkipsApplied({
    state,
    pendingSkips: [failing],
    skipEntry: async () => { throw new Error('offline') },
    forgetSkip: async () => assert.fail('a failed skip is kept'),
    reloadState: async () => assert.fail('no reload when nothing changed'),
  })
  assert.equal(result.state, state)
  assert.deepEqual(result.pendingSkips, [failing])
})
