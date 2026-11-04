import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-engine-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { createLatestRun } = await import('../src/for-you-engine.js')
const { db } = await import('../src/db.js')

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test('a suggestion level change during an embed run starts a second run with the new model', async () => {
  let wanted = 'standard-model'
  const runs = []
  const latest = createLatestRun({
    run: async () => {
      const model = wanted
      runs.push(model)
      if (runs.length === 1) wanted = 'plus-model'
      return { model }
    },
    currentId: async () => wanted,
  })
  const [first, joined] = [latest.start(), latest.start()]
  assert.equal(first, joined)
  assert.deepEqual(await first, { model: 'plus-model' })
  assert.deepEqual(runs, ['standard-model', 'plus-model'])
  assert.equal(latest.isRunning(), false)
})

test('an embed run whose model is still current runs once', async () => {
  let runs = 0
  const latest = createLatestRun({
    run: async () => {
      runs += 1
      return { model: 'standard-model' }
    },
    currentId: async () => 'standard-model',
  })
  await latest.start()
  assert.equal(runs, 1)
})

test('a second embed run uses the time it starts, not the time of the first run', async () => {
  let wanted = 'standard-model'
  const times = []
  const latest = createLatestRun({
    run: async ({ nowMs }) => {
      times.push(nowMs)
      const model = wanted
      wanted = 'plus-model'
      return { model }
    },
    currentId: async () => wanted,
    now: () => 5_000,
  })
  await latest.start({ nowMs: 1_000 })
  assert.deepEqual(times, [1_000, 5_000])
})
