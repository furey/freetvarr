import { test } from 'node:test'
import assert from 'node:assert/strict'

import { RETRY_MIN_MS, canSaveSettings, loadSettingsWith, settingsTvhTestBodyOf } from '../src/web/settings-load.js'
import { OFFLINE_MESSAGE, reachServer, responseErrorOf } from '../src/web/shared/request-errors.js'

test('loadSettingsWith: a rejected GET /api/settings fills nothing, keeps Save off, and says why', async () => {
  const filled = []
  const outcome = await loadSettingsWith({
    fetchSettings: async () => { throw responseErrorOf({ status: 500, data: { error: 'database is locked' } }) },
    fill: (settings) => filled.push(settings),
  })
  assert.deepEqual(outcome, { loaded: false, error: 'Could not load settings: database is locked' })
  assert.deepEqual(filled, [])
  assert.equal(canSaveSettings({ loaded: outcome.loaded, saving: false }), false)
})

test('loadSettingsWith: an offline failure shows the offline message alone, with no doubled "Could not"', async () => {
  const outcome = await loadSettingsWith({
    fetchSettings: () => reachServer(async () => { throw new TypeError('Load failed') }),
    fill: () => {},
  })
  assert.equal(outcome.error, OFFLINE_MESSAGE)
})

test('loadSettingsWith: a good load fills the page and turns Save on', async () => {
  const filled = []
  const outcome = await loadSettingsWith({ fetchSettings: async () => ({ tvh_url: 'http://tvh:9981' }), fill: (s) => filled.push(s) })
  assert.deepEqual(outcome, { loaded: true, error: '' })
  assert.deepEqual(filled, [{ tvh_url: 'http://tvh:9981' }])
  assert.equal(canSaveSettings({ loaded: true, saving: false }), true)
  assert.equal(canSaveSettings({ loaded: true, saving: true }), false)
})

test('settingsTvhTestBodyOf: the Settings test asks the server not to save, and sends a typed password', () => {
  assert.deepEqual(settingsTvhTestBodyOf({ url: 'http://tvh:9981', username: 'admin', password: 'pw' }), {
    tvh_url: 'http://tvh:9981',
    tvh_username: 'admin',
    tvh_password: 'pw',
    persist: false,
  })
  assert.equal('tvh_password' in settingsTvhTestBodyOf({ url: 'u', username: 'a', password: '' }), false)
})

test('loadSettingsWith: Try again holds its busy state for the minimum time', async () => {
  const holds = []
  await loadSettingsWith({
    fetchSettings: async () => ({}),
    fill: () => {},
    minMs: RETRY_MIN_MS,
    hold: async ({ task, minMs }) => { holds.push(minMs); return task() },
  })
  assert.deepEqual(holds, [800])
})
