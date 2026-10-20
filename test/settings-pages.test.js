import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SETTINGS_GROUPS, settingsPageOf } from '../src/web/settings-pages.js'

test('SETTINGS_GROUPS: preferences, system, and about in order, with hrefs', () => {
  assert.deepEqual(SETTINGS_GROUPS.map((group) => group.key), ['preferences', 'system', 'about'])
  const health = SETTINGS_GROUPS[1].pages.find((page) => page.id === 'health')
  assert.equal(health.href, '#/settings/system/health')
  assert.equal(SETTINGS_GROUPS[0].pages[0].href, '#/settings/storage')
})

test('settingsPageOf: preference sections and system pages resolve', () => {
  assert.equal(settingsPageOf({ params: ['plex'] }).section, 'plex')
  assert.equal(settingsPageOf({ params: ['system', 'activity', '42'] }).id, 'activity')
  assert.equal(settingsPageOf({ params: ['system', 'tvheadend'] }).section, 'tvheadend')
})

test('settingsPageOf: old section names still open their page', () => {
  assert.equal(settingsPageOf({ params: ['help'] }).id, 'about')
  assert.equal(settingsPageOf({ params: ['danger-zone'] }).section, 'danger-zone')
  assert.equal(settingsPageOf({ params: ['pictures'] }).label, 'Film and TV info')
})

test('settingsPageOf: no page on a phone shows the index, wide screens open the first page', () => {
  assert.equal(settingsPageOf({ params: [], narrow: true }), null)
  assert.equal(settingsPageOf({ params: [] }).id, 'storage')
  assert.equal(settingsPageOf({ params: ['nope'], narrow: true }), null)
})

test('settingsPageOf: the Player page sits in Preferences with its own view', () => {
  const page = settingsPageOf({ params: ['player'] })
  assert.equal(page.view, 'player')
  assert.equal(page.group, 'preferences')
  assert.equal(page.href, '#/settings/player')
})

test('settingsPageOf: the setup page and its drawer links resolve', () => {
  assert.equal(SETTINGS_GROUPS[1].pages[0].href, '#/settings/system/setup')
  assert.equal(settingsPageOf({ params: ['system', 'setup'] }).id, 'setup')
  assert.equal(settingsPageOf({ params: ['system', 'setup', 'channels'] }).id, 'setup')
})
