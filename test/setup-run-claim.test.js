import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { claimRun } from '../src/setup-runs.js'

const server = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8')

const slot = (initial = null) => {
  let run = initial
  return { getRun: () => run, setRun: (next) => { run = next }, current: () => run }
}

test('claimRun: a second press while TVHeadend is still being read is refused, so only one run starts', async () => {
  const runs = slot()
  let finishRead = null
  const reads = []
  const prepare = () => {
    reads.push('readChannelSetup')
    return new Promise((resolve) => { finishRead = () => resolve({ steps: [{ id: 'network' }] }) })
  }
  const first = claimRun({ ...runs, prepare })
  const second = await claimRun({ ...runs, prepare })
  assert.deepEqual(second, { claimed: false })
  finishRead()
  const started = await first
  assert.equal(started.claimed, true)
  assert.deepEqual(started.steps, [{ id: 'network' }])
  assert.deepEqual(reads, ['readChannelSetup'])
  assert.deepEqual(runs.current(), { running: true, steps: [{ id: 'network' }], result: null })
})

test('claimRun: a refusal hands the earlier run back', async () => {
  const earlier = { running: false, steps: [], result: { ok: true } }
  const runs = slot(earlier)
  const outcome = await claimRun({ ...runs, prepare: async () => ({ refusal: { status: 400, body: { error: 'Choose a transmitter.' } } }) })
  assert.equal(outcome.refusal.status, 400)
  assert.equal(runs.current(), earlier)
})

test('claimRun: a throw while preparing hands the run back and answers 500, so setup is not locked', async () => {
  const runs = slot()
  const outcome = await claimRun({ ...runs, prepare: async () => { throw new TypeError("Cannot read properties of undefined (reading 'find')") } })
  assert.equal(outcome.refusal.status, 500)
  assert.equal(runs.current(), null)
  const again = await claimRun({ ...runs, prepare: async () => ({ steps: [] }) })
  assert.equal(again.claimed, true)
})

test('server: channel and guide setup both start through claimRun', () => {
  assert.equal(server.match(/await claimRun\(\{/g)?.length, 2)
})
