import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-reset-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db, setSetting } = await import('../src/db.js')
const { resetFreetvarrData } = await import('../src/reset.js')
const { resetConfirm } = await import('../src/web/confirm-copy.js')

const server = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8')

before(async () => {
  await db.migrate.latest()
})

after(async () => {
  await db.destroy()
})

test('resetFreetvarrData: keeps the TV login record, the open-access backup, and Allowed hostnames, and deletes the other settings', async () => {
  await setSetting('tvh_url', 'http://tvh:9981')
  await setSetting('tv_login_username', 'tv')
  await setSetting('tv_login_password', 'pw')
  await setSetting('tv_login_auth_code', 'P.code')
  await setSetting('tvh_open_entry_backup', '{"uuid":"a1"}')
  await setSetting('allowed_hosts', 'tv.example.com')
  await db('shows').insert({ show_pattern: 'The Block', dest_folder: 'The Block' })
  await resetFreetvarrData(db)
  const keys = (await db('settings').select('key').orderBy('key')).map((row) => row.key)
  assert.deepEqual(keys, ['allowed_hosts', 'tv_login_auth_code', 'tv_login_password', 'tv_login_username', 'tvh_open_entry_backup'])
  assert.equal((await db('shows').count({ n: '*' }).first()).n, 0)
})

test('reset route: uses resetFreetvarrData, and the dialog says the TV login and open-access backup stay', () => {
  const route = server.slice(server.indexOf("app.post('/api/reset'"), server.indexOf("app.post('/api/discover-plex'"))
  assert.match(route, /await resetFreetvarrData\(db\)/)
  const line = resetConfirm({ mediaRoot: '' }).body.find((text) => /keeps the TV login it made/.test(text))
  assert.equal(line, 'Freetvarr keeps the TV login it made. You can still delete it, or restore open access, after setup.')
  assert.ok(line.split(/\s+/).length <= 25)
  assert.ok(resetConfirm({ mediaRoot: '' }).body.includes('Freetvarr also keeps the Allowed hostnames.'))
})
