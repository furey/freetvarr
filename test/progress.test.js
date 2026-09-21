import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  setProgress,
  getProgress,
  clearProgress,
  snapshotProgress,
  makeImportProgress,
} from '../src/progress.js'

test('setProgress/getProgress: round-trips a shallow-merged entry', () => {
  setProgress('rt-1', { phase: 'importing', percent: 20 })
  setProgress('rt-1', { percent: 55, detail: '10 MB/s' })
  const entry = getProgress('rt-1')
  assert.equal(entry.phase, 'importing')
  assert.equal(entry.percent, 55)
  assert.equal(entry.detail, '10 MB/s')
  assert.equal(typeof entry.updatedAt, 'number')
  clearProgress('rt-1')
})

test('clearProgress: removes the entry', () => {
  setProgress('cl-1', { phase: 'scanning', percent: 5 })
  assert.notEqual(getProgress('cl-1'), null)
  clearProgress('cl-1')
  assert.equal(getProgress('cl-1'), null)
})

test('snapshotProgress: returns only present, fresh ids', () => {
  setProgress('snap-a', { phase: 'importing', percent: 12 })
  const snap = snapshotProgress(['snap-a', 'snap-missing'])
  assert.equal(snap['snap-a'].percent, 12)
  assert.equal('snap-missing' in snap, false)
  clearProgress('snap-a')
})

test('getProgress: returns null and evicts once the entry is stale', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 0 })
  setProgress('stale-1', { phase: 'scanning', percent: 10 })
  assert.equal(getProgress('stale-1').percent, 10)
  t.mock.timers.tick(31_000)
  assert.equal(getProgress('stale-1'), null)
  assert.equal(snapshotProgress(['stale-1'])['stale-1'], undefined)
})

test('makeImportProgress: reports percent and monotonically decreasing etaSeconds', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 0 })
  const bar = makeImportProgress('dl-1')
  bar.setTotal(1000)
  assert.equal(bar.getTotal(), 1000)

  t.mock.timers.tick(1000)
  bar.update(200, { speed: '200 B' })
  const first = getProgress('dl-1')
  assert.equal(first.phase, 'importing')
  assert.equal(first.percent, 20)
  assert.equal(first.detail, '200 B/s')
  assert.equal(first.etaSeconds, null)

  t.mock.timers.tick(1000)
  bar.update(600)
  const second = getProgress('dl-1')
  assert.equal(second.percent, 60)
  assert.ok(second.etaSeconds > 0)

  t.mock.timers.tick(1000)
  bar.update(900)
  const third = getProgress('dl-1')
  assert.equal(third.percent, 90)
  assert.ok(third.etaSeconds < second.etaSeconds)

  bar.stop()
  assert.equal(getProgress('dl-1'), null)
})

test('makeImportProgress: clamps percent to 100 and omits detail without a speed', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 0 })
  const bar = makeImportProgress('dl-2')
  bar.setTotal(1000)
  t.mock.timers.tick(1000)
  bar.update(1200)
  const entry = getProgress('dl-2')
  assert.equal(entry.percent, 100)
  assert.equal(entry.detail, null)
  bar.stop()
})

test('makeImportProgress: treats an N/A speed as no detail', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 0 })
  const bar = makeImportProgress('dl-3')
  bar.setTotal(1000)
  bar.update(0, { speed: 'N/A' })
  assert.equal(getProgress('dl-3').detail, null)
  bar.stop()
})
