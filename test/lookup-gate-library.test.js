import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-lookup-gate-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const { createKnownTitles, createLookupGate, libraryLookupTitles } = await import('../src/lookup-gate.js')

before(async () => {
  await db.migrate.latest()
})

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

const libraryRow = (row) => ({ part_id: `${row.rating_key}-1`, section_id: '1', seen_at: 1, ...row })

test('a title only in the Plex library passes the lookup gate after the budget is spent', async () => {
  await db('library_items').insert([
    libraryRow({ rating_key: '1', kind: 'movie', title: 'Library Film' }),
    libraryRow({ rating_key: '2', kind: 'episode', show_title: 'Library Show', title: 'Pilot' }),
  ])
  assert.deepEqual((await libraryLookupTitles({ database: db })).sort(), ['Library Film', 'Library Show'])
  const gate = createLookupGate({
    isKnownTitle: createKnownTitles({ loadTitles: () => libraryLookupTitles({ database: db }) }),
    budget: 0,
  })
  assert.equal(await gate.allows('Library Film'), true)
  assert.equal(await gate.allows('Library Show'), true)
  assert.equal(await gate.allows('Unknown Thing'), false)
})
