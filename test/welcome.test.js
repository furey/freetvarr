import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-welcome-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const { isWelcomeDismissed, setWelcomeDismissed } = await import('../src/welcome.js')

before(async () => {
  await db.migrate.latest()
})

after(async () => {
  await db.destroy()
})

test('welcome is not dismissed on a fresh install', async () => {
  assert.equal(await isWelcomeDismissed(), false)
})

test('dismissal persists in the settings table', async () => {
  await setWelcomeDismissed(true)
  assert.equal(await isWelcomeDismissed(), true)
  const row = await db('settings').where({ key: 'welcome_dismissed' }).first()
  assert.equal(row.value, 'true')
})

test('reopening the wizard clears the dismissal', async () => {
  await setWelcomeDismissed(true)
  await setWelcomeDismissed(false)
  assert.equal(await isWelcomeDismissed(), false)
})

test('reset wipes the dismissal with the rest of the settings', async () => {
  await setWelcomeDismissed(true)
  await db('settings').delete()
  assert.equal(await isWelcomeDismissed(), false)
})
