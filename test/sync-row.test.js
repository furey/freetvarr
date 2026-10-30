import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  syncOutcome, syncResult, firstSyncError, groupSyncsByDay,
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

test('firstSyncError: returns the first error or an empty string', () => {
  assert.equal(firstSyncError(sync({ errors: ['a', 'b'] })), 'a')
  assert.equal(firstSyncError({ id: 1, status: 'running', summary: null }), '')
})

test('groupSyncsByDay: groups neighbouring syncs that share a day', () => {
  const syncs = [{ id: 3, day: 'Today' }, { id: 2, day: 'Today' }, { id: 1, day: 'Yesterday' }]
  const groups = groupSyncsByDay({ syncs, dayOf: (s) => s.day })
  assert.deepEqual(groups.map((g) => [g.day, g.syncs.map((s) => s.id)]), [['Today', [3, 2]], ['Yesterday', [1]]])
})
