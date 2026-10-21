import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { SETTINGS_GROUPS, settingsPageOf } from '../src/web/settings-pages.js'

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('SETTINGS_GROUPS: about, preferences, and system in order, with hrefs', () => {
  assert.deepEqual(SETTINGS_GROUPS.map((group) => group.key), ['about', 'preferences', 'system'])
  const health = SETTINGS_GROUPS[2].pages.find((page) => page.id === 'health')
  assert.equal(health.href, '#/settings/system/health')
  assert.equal(SETTINGS_GROUPS[0].pages[0].href, '#/settings/about')
  assert.equal(SETTINGS_GROUPS[1].pages[0].href, '#/settings/storage')
})

test('SETTINGS_GROUPS: Danger zone is the last System page', () => {
  const system = SETTINGS_GROUPS.find((group) => group.key === 'system')
  const last = system.pages.at(-1)
  assert.equal(last.label, 'Danger zone')
  assert.equal(last.href, '#/settings/system/reset')
  assert.equal(SETTINGS_GROUPS[0].pages.length, 1)
})

test('settingsPageOf: preference sections and system pages resolve', () => {
  assert.equal(settingsPageOf({ params: ['plex'] }).section, 'plex')
  assert.equal(settingsPageOf({ params: ['system', 'activity', '42'] }).id, 'activity')
  assert.equal(settingsPageOf({ params: ['system', 'tvheadend'] }).section, 'tvheadend')
})

test('settingsPageOf: old section names still open their page', () => {
  assert.equal(settingsPageOf({ params: ['help'] }).id, 'about')
  assert.equal(settingsPageOf({ params: ['danger-zone'] }).section, 'danger-zone')
  assert.equal(settingsPageOf({ params: ['reset'] }).group, 'system')
  assert.equal(settingsPageOf({ params: ['system', 'reset'] }).section, 'danger-zone')
  assert.equal(settingsPageOf({ params: ['pictures'] }).label, 'Film and TV info')
})

test('settingsPageOf: no page on a phone shows the index, wide screens open About', () => {
  assert.equal(settingsPageOf({ params: [], narrow: true }), null)
  assert.equal(settingsPageOf({ params: [] }).id, 'about')
  assert.equal(settingsPageOf({ params: ['nope'], narrow: true }), null)
})

test('settingsPageOf: the Player page sits in Preferences with its own view', () => {
  const page = settingsPageOf({ params: ['player'] })
  assert.equal(page.view, 'player')
  assert.equal(page.group, 'preferences')
  assert.equal(page.href, '#/settings/player')
})

test('settingsPageOf: the setup page and its drawer links resolve', () => {
  assert.equal(SETTINGS_GROUPS[2].pages[0].href, '#/settings/system/setup')
  assert.equal(settingsPageOf({ params: ['system', 'setup'] }).id, 'setup')
  assert.equal(settingsPageOf({ params: ['system', 'setup', 'channels'] }).id, 'setup')
})

test('SETTINGS_GROUPS: every settings-view page has its section and a rule that shows it', () => {
  const view = ['../src/web/views/settings-view.js', '../src/web/components/tv-apps-panel.js'].map(readSource).join('\n')
  const css = readSource('../src/web/styles/settings.css')
  const sections = SETTINGS_GROUPS.flatMap((group) => group.pages).filter((page) => page.view === 'settings').map((page) => page.section)
  for (const section of sections) {
    assert.match(view, new RegExp(`id="section-${section}"`), section)
    assert.ok(css.includes(`.settings-content[data-settings-section="${section}"] #section-${section}`), section)
  }
})
