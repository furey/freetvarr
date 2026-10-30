import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-query-load-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db, deleteInChunks, getSetting, setSetting } = await import('../src/db.js')
const { createVectorPruner } = await import('../src/for-you-engine.js')
const pendingSkipsIndex = await import('../migrations/0031_pending_skips_end_index.js')

const DAY = 24 * 60 * 60 * 1000
const NOW = 1000 * DAY

before(async () => {
  await db.migrate.latest()
})

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

const vectorRow = ({ hash, model, createdAt = NOW }) => ({ text_hash: hash, model_id: model, dims: 1, vector: Buffer.alloc(4), created_at: createdAt })

const hashesOf = async () => (await db('text_embeddings').select('text_hash', 'model_id').orderBy('text_hash'))
  .map((row) => `${row.model_id}:${row.text_hash}`)

test('deleteInChunks removes every matching row across several chunks and keeps the rest', async () => {
  await db('pending_skips').delete()
  await db('pending_skips').insert(Array.from({ length: 7 }, (_, i) => ({
    program_id: String(i),
    channel_id: 'c',
    title: `Show ${i}`,
    start_ms: i,
    end_ms: i < 5 ? NOW - 1 : NOW + 1,
    created_at: NOW,
  })))
  const removed = await deleteInChunks({ table: 'pending_skips', where: (query) => query.where('end_ms', '<=', NOW), chunkSize: 2 })
  assert.equal(removed, 5)
  assert.deepEqual((await db('pending_skips').select('program_id').orderBy('program_id')).map((row) => row.program_id), ['5', '6'])
})

test('the vector pruner drops other models only when the model changes and expires old vectors', async () => {
  await db('text_embeddings').delete()
  await db('text_embeddings').insert([
    vectorRow({ hash: 'a', model: 'm1' }),
    vectorRow({ hash: 'b', model: 'm1', createdAt: NOW - 90 * DAY }),
    vectorRow({ hash: 'c', model: 'm0' }),
    vectorRow({ hash: 'd', model: 'm2' }),
  ])
  const prune = createVectorPruner()
  await prune({ modelId: 'm1', nowMs: NOW })
  assert.deepEqual(await hashesOf(), ['m1:a'])
  await db('text_embeddings').insert(vectorRow({ hash: 'e', model: 'm0' }))
  await prune({ modelId: 'm1', nowMs: NOW })
  assert.deepEqual(await hashesOf(), ['m1:a', 'm0:e'])
  await prune({ modelId: 'm0', nowMs: NOW })
  assert.deepEqual(await hashesOf(), ['m0:e'])
})

test('setSetting inserts a new key and replaces an existing value', async () => {
  await setSetting('query_load_test', 'one')
  await setSetting('query_load_test', 'two')
  assert.equal(await getSetting('query_load_test'), 'two')
  assert.equal(Number((await db('settings').where({ key: 'query_load_test' }).count({ count: '*' }).first()).count), 1)
})

test('the pending skips index migration runs twice without error and the expiry delete uses it', async () => {
  await pendingSkipsIndex.up(db)
  await pendingSkipsIndex.up(db)
  const plan = await db.raw('explain query plan delete from pending_skips where end_ms <= ?', [NOW])
  assert.match(plan.map((row) => row.detail).join(' '), /pending_skips_end_ms_index/)
})
