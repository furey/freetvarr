import { test } from 'node:test'
import assert from 'node:assert/strict'

import { revealStepMs, isStepResolved, pacedSteps, shownJob, STEP_PACING, STEP_MIN_MS } from '../src/web/paced-reveal.js'

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

test('STEP_MIN_MS: is one second', () => {
  assert.equal(STEP_MIN_MS, 1000)
})

test('revealStepMs: step pacing holds every step for exactly the minimum, whatever the count', () => {
  for (const count of [0, 1, 3, 9, 100]) assert.equal(revealStepMs(count, STEP_PACING), STEP_MIN_MS)
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

test('shownJob: an absent job shows nothing', () => {
  assert.deepEqual(shownJob({ job: null, revealed: 0 }), { steps: [], running: false, result: null })
})

test('shownJob: a finished job holds back its result until every step is revealed', () => {
  const job = { running: false, steps: steps('done', 'done', 'done'), result: { ok: true } }
  const early = shownJob({ job, revealed: 1 })
  assert.equal(early.running, true)
  assert.equal(early.result, null)
  assert.deepEqual(early.steps.map((s) => s.status), ['done', 'running', 'pending'])
  const late = shownJob({ job, revealed: 3 })
  assert.equal(late.running, false)
  assert.deepEqual(late.result, { ok: true })
})

test('shownJob: a running job stays running after every step is revealed', () => {
  const job = { running: true, steps: steps('done'), result: null }
  assert.equal(shownJob({ job, revealed: 1 }).running, true)
})
