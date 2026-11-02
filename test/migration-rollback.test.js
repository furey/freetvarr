import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-rollback-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test('every migration rolls back and re-applies without losing rows or show links', async () => {
  await db.migrate.latest()
  await seedLinkedLibrary()
  const links = await showLinks()
  const showIds = await idsOf('shows')
  while (await hasRollbackAboveInitial()) {
    const name = await lastAppliedName()
    const countsBefore = await rowCounts()
    await db.migrate.down()
    const countsAfter = await rowCounts()
    assert.deepEqual(await showLinks(), links, `rolling back ${name} kept every recording's show`)
    assert.deepEqual(countsAfter, pickTables(countsBefore, Object.keys(countsAfter)), `rolling back ${name} kept every row`)
    assert.deepEqual(await foreignKeyViolations(), [], `rolling back ${name} left no broken foreign keys`)
  }
  await db.migrate.latest()
  assert.deepEqual(await showLinks(), links)
  assert.deepEqual(await idsOf('shows'), showIds)
  assert.deepEqual(await foreignKeyViolations(), [])
})

const seedLinkedLibrary = async () => {
  await db('shows').insert([
    { id: 1, show_pattern: 'The Block', dest_folder: 'The Block', identity_state: 'none', origin: 'user' },
    { id: 2, show_pattern: 'Gruen', dest_folder: 'Gruen', identity_state: 'none', origin: 'auto' },
  ])
  await db('recordings').insert([
    { recording_id: 'block-1', show_id: 1, title: 'The Block', status: 'done' },
    { recording_id: 'block-2', show_id: 1, title: 'The Block', status: 'done' },
    { recording_id: 'gruen-1', show_id: 2, title: 'Gruen', status: 'done' },
    { recording_id: 'film-1', show_id: null, title: 'Heat', status: 'done' },
  ])
}

const showLinks = async () => Object.fromEntries((await db('recordings').select('recording_id', 'show_id'))
  .map((row) => [row.recording_id, row.show_id]))

const idsOf = async (table) => (await db(table).orderBy('id').select('id')).map((row) => row.id)

const lastAppliedName = async () => (await db.migrate.list())[0].at(-1).name

const hasRollbackAboveInitial = async () => (await db.migrate.list())[0].length > 1

const tableNames = async () => (await db.raw("select name from sqlite_master where type = 'table'"))
  .map((row) => row.name)
  .filter((name) => !name.startsWith('sqlite_') && !name.startsWith('knex_'))

const rowCounts = async () => Object.fromEntries(await Promise.all((await tableNames())
  .map(async (name) => [name, Number((await db(name).count({ n: '*' }))[0].n)])))

const pickTables = (counts, names) => Object.fromEntries(names.map((name) => [name, counts[name]]))

const foreignKeyViolations = async () => db.raw('PRAGMA foreign_key_check')
