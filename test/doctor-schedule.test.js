import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scheduleDoctorChecks } from '../src/doctor.js'

test('scheduleDoctorChecks runs once after the first delay, then on every interval', async () => {
  let runs = 0
  const stop = scheduleDoctorChecks({ firstDelayMs: 5, everyMs: 20, run: async () => { runs += 1 } })
  await new Promise((resolve) => setTimeout(resolve, 55))
  stop()
  const settled = runs
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.ok(settled >= 2, `ran ${settled} times`)
  assert.equal(runs, settled)
})

test('scheduleDoctorChecks keeps going after a failed run', async () => {
  let runs = 0
  const stop = scheduleDoctorChecks({ firstDelayMs: 1, everyMs: 10, run: async () => { runs += 1; throw new Error('boom') } })
  await new Promise((resolve) => setTimeout(resolve, 35))
  stop()
  assert.ok(runs >= 2)
})
