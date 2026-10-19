import { test } from 'node:test'
import assert from 'node:assert/strict'
import { logFiltersFromHash } from '../src/web/recording-log-filters.js'

test('logFiltersFromHash: reads a failed-recordings deep link', () => {
  assert.deepEqual(logFiltersFromHash('#/settings/system/log?status=failed&since=7d'), { status: 'failed', since: '7d', deleted: 'all' })
})

test('logFiltersFromHash: ignores unknown values and a missing query', () => {
  assert.deepEqual(logFiltersFromHash('#/settings/system/log?status=bogus&deleted=on_tvh'), { status: 'all', since: 'all', deleted: 'on_tvh' })
  assert.deepEqual(logFiltersFromHash('#/settings/system/log'), { status: 'all', since: 'all', deleted: 'all' })
  assert.deepEqual(logFiltersFromHash(), { status: 'all', since: 'all', deleted: 'all' })
})
