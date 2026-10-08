import { test } from 'node:test'
import assert from 'node:assert/strict'

import { revealStepMs, isStepResolved, pacedSteps, SECURE_REVEAL_PACING } from '../src/web/paced-reveal.js'

const steps = (...statuses) => statuses.map((status, i) => ({ id: `s${i}`, label: `Step ${i}`, status }))

test('revealStepMs: spreads 2200 ms across the steps', () => {
  assert.equal(revealStepMs(10), 220)
})

test('revealStepMs: caps a short list at 260 ms a step', () => {
  assert.equal(revealStepMs(3), 260)
  assert.equal(revealStepMs(0), 260)
})

test('revealStepMs: floors a long list at 80 ms a step', () => {
  assert.equal(revealStepMs(100), 80)
})

test('revealStepMs: secure pacing gives nine steps about 444 ms each', () => {
  const ms = revealStepMs(9, SECURE_REVEAL_PACING)
  assert.ok(ms >= 350 && ms <= 500)
  assert.ok(Math.abs(ms * 9 - 4000) < 1)
})

test('revealStepMs: secure pacing keeps every step between 350 and 500 ms', () => {
  assert.equal(revealStepMs(3, SECURE_REVEAL_PACING), 500)
  assert.equal(revealStepMs(100, SECURE_REVEAL_PACING), 350)
})

test('isStepResolved: true only for done and failed', () => {
  assert.equal(isStepResolved({ status: 'done' }), true)
  assert.equal(isStepResolved({ status: 'failed' }), true)
  assert.equal(isStepResolved({ status: 'running' }), false)
  assert.equal(isStepResolved({ status: 'pending' }), false)
  assert.equal(isStepResolved(undefined), false)
})

test('pacedSteps: shows the first step running before any is revealed', () => {
  const shown = pacedSteps({ steps: steps('done', 'done', 'done'), revealed: 0 })
  assert.deepEqual(shown.map((s) => s.status), ['running', 'pending', 'pending'])
})

test('pacedSteps: keeps revealed steps as the server reported them', () => {
  const shown = pacedSteps({ steps: steps('done', 'failed', 'pending'), revealed: 2 })
  assert.deepEqual(shown.map((s) => s.status), ['done', 'failed', 'running'])
})

test('pacedSteps: shows every step as reported once all are revealed', () => {
  const shown = pacedSteps({ steps: steps('done', 'done'), revealed: 2 })
  assert.deepEqual(shown.map((s) => s.status), ['done', 'done'])
})

test('pacedSteps: does not change the input', () => {
  const input = steps('done', 'done')
  pacedSteps({ steps: input, revealed: 0 })
  assert.equal(input[0].status, 'done')
})
