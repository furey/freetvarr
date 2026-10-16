import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  isNotableSync, syncOutcome, syncResult, firstSyncError, syncStrip, syncStripLabel, groupSyncsByDay,
} from '../src/web/sync-row.js'

const sync = ({ id = 1, status = 'ok', ...summary } = {}) => ({ id, status, summary })

test('syncOutcome: maps sync statuses to the four row icons', () => {
  assert.equal(syncOutcome(sync({ status: 'running' })), 'running')
  assert.equal(syncOutcome(sync({ status: 'ok' })), 'ok')
  assert.equal(syncOutcome(sync({ status: 'partial' })), 'partial')
  assert.equal(syncOutcome(sync({ status: 'error' })), 'failed')
})

test('syncResult: lists failures, imports, then removals', () => {
  const result = syncResult(sync({ status: 'partial', failed: 1, imported: 2, delete: { triggered: true, removed: [1, 2, 3] } }))
  assert.deepEqual(result.map((p) => p.text), ['1 failed', '2 imported', '3 removed'])
})

test('syncResult: a quiet sync says nothing new, a running one says syncing', () => {
  assert.deepEqual(syncResult(sync({ imported: 0, skipped: 12 })), [{ tone: 'quiet', text: 'nothing new' }])
  assert.deepEqual(syncResult({ id: 2, status: 'running', summary: null }), [{ tone: 'running', text: 'syncing…' }])
})

test('syncResult: an errored sync with no counts says failed', () => {
  assert.deepEqual(syncResult(sync({ status: 'error', errors: ['TVHeadend did not answer'] })), [{ tone: 'failed', text: 'failed' }])
})

test('isNotableSync: imports, failures, and removals are notable; quiet and running syncs are not', () => {
  assert.equal(isNotableSync(sync({ imported: 1 })), true)
  assert.equal(isNotableSync(sync({ delete: { triggered: true, removed: [] } })), true)
  assert.equal(isNotableSync(sync({ status: 'error' })), true)
  assert.equal(isNotableSync(sync({ imported: 0 })), false)
  assert.equal(isNotableSync({ id: 1, status: 'running', summary: null }), false)
})

test('firstSyncError: returns the first error or an empty string', () => {
  assert.equal(firstSyncError(sync({ errors: ['a', 'b'] })), 'a')
  assert.equal(firstSyncError({ id: 1, status: 'running', summary: null }), '')
})

test('syncStrip: puts the newest sync last and pads to the strip size', () => {
  const syncs = [sync({ id: 3, status: 'running' }), sync({ id: 2, imported: 1 }), sync({ id: 1, status: 'error' })]
  const strip = syncStrip({ syncs, size: 5 })
  assert.deepEqual(strip.map((s) => s.mark), ['none', 'none', 'failed', 'changed', 'running'])
})

test('syncStrip: shows only the newest syncs that fit', () => {
  const syncs = [sync({ id: 3 }), sync({ id: 2 }), sync({ id: 1, imported: 1 })]
  assert.deepEqual(syncStrip({ syncs, size: 2 }).map((s) => s.key), [2, 3])
})

test('syncStripLabel: counts changes and failures for screen readers', () => {
  const syncs = [sync({ id: 2, imported: 1 }), sync({ id: 1, status: 'partial', failed: 1 })]
  assert.equal(syncStripLabel({ syncs, size: 12 }), 'Last 2 syncs: 1 with changes, 1 failed')
  assert.equal(syncStripLabel({ syncs: [sync()], size: 12 }), 'Last 1 sync: 0 with changes, 0 failed')
})

test('groupSyncsByDay: groups neighbouring syncs that share a day', () => {
  const syncs = [{ id: 3, day: 'Today' }, { id: 2, day: 'Today' }, { id: 1, day: 'Yesterday' }]
  const groups = groupSyncsByDay({ syncs, dayOf: (s) => s.day })
  assert.deepEqual(groups.map((g) => [g.day, g.syncs.map((s) => s.id)]), [['Today', [3, 2]], ['Yesterday', [1]]])
})
