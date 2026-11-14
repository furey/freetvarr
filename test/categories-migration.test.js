import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-categories-migration-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

const migrateTo = async (name) => {
  for (;;) {
    const [done, pending] = await db.migrate.list()
    if (done.some((migration) => migration.name === name)) return
    if (!pending.some((migration) => migration.file === name)) throw new Error(`migration ${name} does not exist`)
    await db.migrate.up()
  }
}

const event = (kind, seriesKey, ts) => ({ kind, series_key: seriesKey, title: seriesKey, source: 'for-you', ts })

test('migration 0052: clears old theme hides and switches, keeps show hides, and adds the override table', async () => {
  await migrateTo('0051_picture_check_marks.js')
  await db('user_events').insert([
    event('theme_muted', 'theme-cooking', 1),
    event('theme_unmuted', 'theme-cooking', 2),
    event('theme_boosted', 'theme-science', 3),
    event('theme_unboosted', 'theme-science', 4),
    event('not_interested', 'the-block', 5),
    event('thumb_down', 'gruen', 6),
    event('record_request', 'bluey', 7),
  ])
  await db('settings').insert([
    { key: 'for_you_themes_off', value: '["cooking","science"]' },
    { key: 'for_you_enabled', value: 'true' },
  ])
  await migrateTo('0052_categories.js')
  assert.deepEqual((await db('user_events').orderBy('ts').select('kind')).map((row) => row.kind), ['not_interested', 'thumb_down', 'record_request'])
  assert.deepEqual((await db('settings').orderBy('key').select('key')).map((row) => row.key), ['for_you_enabled'])
  await db('programme_category_overrides').insert({ show_key: 'shark-tank', format: 'reality', topics_json: '["business-and-money"]', updated_at: 8 })
  assert.deepEqual(await db('programme_category_overrides').select('show_key', 'format', 'topics_json'), [
    { show_key: 'shark-tank', format: 'reality', topics_json: '["business-and-money"]' },
  ])
})

test('migration 0052 rolls back the schema only: the override table goes and deleted rows stay deleted', async () => {
  await db.migrate.down()
  assert.equal(await db.schema.hasTable('programme_category_overrides'), false)
  assert.deepEqual((await db('user_events').orderBy('ts').select('kind')).map((row) => row.kind), ['not_interested', 'thumb_down', 'record_request'])
  assert.equal(await db('settings').where({ key: 'for_you_themes_off' }).first(), undefined)
})
