import { test } from 'node:test'
import assert from 'node:assert/strict'
import knexFactory from 'knex'

import { ownValueOf } from '../src/query-lookup.js'

const SINCE = { '1h': '-1 hours', '24h': '-24 hours' }

test('ownValueOf: matches only the map’s own keys', () => {
  assert.equal(ownValueOf(SINCE, '1h'), '-1 hours')
  for (const key of ['constructor', '__proto__', 'toString', 'hasOwnProperty', '', undefined, ['1h']]) {
    assert.equal(ownValueOf(SINCE, key), null, String(key))
  }
})

test('the since filter binds its interval as a query parameter', async () => {
  const db = knexFactory({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true })
  try {
    const raw = db.raw("datetime('now', ?)", [ownValueOf(SINCE, '24h')])
    assert.deepEqual(raw.toSQL().bindings, ['-24 hours'])
    const [{ since }] = await db.select({ since: raw })
    assert.match(since, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  } finally {
    await db.destroy()
  }
})
