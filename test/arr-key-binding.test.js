import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-arr-key-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')
process.env.SONARR_CONFIG_PATH = path.join(tmpDir, 'missing-sonarr.xml')
process.env.RADARR_CONFIG_PATH = path.join(tmpDir, 'missing-radarr.xml')

const { db, getSetting, setSetting } = await import('../src/db.js')
const { saveArrSettings } = await import('../src/arr-store.js')

before(async () => {
  await db.migrate.latest()
})

beforeEach(async () => {
  await db('settings').delete()
  await setSetting('sonarr_url', 'http://192.168.1.10:8989')
  await setSetting('sonarr_api_key', 'saved-key')
})

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test('saveArrSettings: drops the saved Sonarr key when the URL changes without one', async () => {
  const saved = await saveArrSettings({ sonarr: { url: 'http://192.0.2.9:8989' } })
  assert.equal(saved.sonarr.url, 'http://192.0.2.9:8989')
  assert.equal(saved.sonarr.apiKey, null)
  assert.equal(await getSetting('sonarr_api_key'), '')
})

test('saveArrSettings: keeps a typed Sonarr key with a new URL', async () => {
  const saved = await saveArrSettings({ sonarr: { url: 'http://192.0.2.9:8989', apiKey: 'new-key' } })
  assert.equal(saved.sonarr.apiKey, 'new-key')
})

test('saveArrSettings: keeps the saved Sonarr key when the URL keeps its origin', async () => {
  const saved = await saveArrSettings({ sonarr: { url: 'http://192.168.1.10:8989/' } })
  assert.equal(saved.sonarr.apiKey, 'saved-key')
})
