import { test } from 'node:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { SETTINGS_GROUPS, settingsPageOf } from '../src/web/settings-pages.js'
import { resolveRoute } from '../src/web/route-table.js'

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

const pageAt = (hash) => {
  const { view, params } = resolveRoute(hash)
  return view === 'settings' ? settingsPageOf({ params, narrow: true }) : null
}

const groupOf = (key) => SETTINGS_GROUPS.find((group) => group.key === key)

const labelsOf = (key) => groupOf(key).pages.map((page) => page.label)

const sourceFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name)
  if (entry.isDirectory()) return entry.name === 'vendor' ? [] : sourceFiles(path)
  return entry.name.endsWith('.js') ? [path] : []
})

const settingsLinksInSource = () => {
  const root = fileURLToPath(new URL('../src/', import.meta.url))
  const links = sourceFiles(root).flatMap((file) => readFileSync(file, 'utf8').match(/#\/settings\/[a-z][a-z0-9/-]*/g) ?? [])
  return [...new Set(links)].filter((link) => !link.endsWith('/'))
}

test('SETTINGS_GROUPS: about, watching, recording, and system in order', () => {
  assert.deepEqual(SETTINGS_GROUPS.map((group) => group.key), ['about', 'watching', 'recording', 'system'])
  assert.deepEqual(SETTINGS_GROUPS.map((group) => group.label), ['About', 'Watching', 'Recording', 'System'])
})

test('SETTINGS_GROUPS: each group lists its pages in order', () => {
  assert.deepEqual(labelsOf('about'), ['About Freetvarr', 'System diagram'])
  assert.deepEqual(labelsOf('watching'), ['Channels', 'Player', 'For you', 'Film and TV info', 'Watch on TV'])
  assert.deepEqual(labelsOf('recording'), ['Series rules', 'Title matches', 'Recording log', 'Ad removal', 'Library and Plex', 'Recording folders'])
  assert.deepEqual(labelsOf('system'), ['Health', 'Activity', 'Setup', 'TVHeadend', 'Schedule', 'Danger zone'])
})

test('SETTINGS_GROUPS: About is the first page and Danger zone the last', () => {
  const pages = SETTINGS_GROUPS.flatMap((group) => group.pages)
  assert.equal(pages[0].id, 'about')
  assert.equal(pages.at(-1).label, 'Danger zone')
  assert.equal(pages.at(-1).href, '#/settings/system/reset')
})

test('SETTINGS_GROUPS: every page keeps the address it had before the regrouping', () => {
  const hrefs = Object.fromEntries(SETTINGS_GROUPS.flatMap((group) => group.pages).map((page) => [page.id, page.href]))
  assert.deepEqual(hrefs, {
    about: '#/settings/about',
    diagram: '#/settings/diagram',
    channels: '#/settings/channels',
    player: '#/settings/player',
    'for-you': '#/settings/for-you',
    'film-tv-info': '#/settings/film-tv-info',
    'tv-apps': '#/settings/tv-apps',
    series: '#/settings/system/series',
    folders: '#/settings/system/folders',
    log: '#/settings/system/log',
    'ad-removal': '#/settings/ad-removal',
    plex: '#/settings/plex',
    storage: '#/settings/storage',
    health: '#/settings/system/health',
    activity: '#/settings/system/activity',
    setup: '#/settings/system/setup',
    tvheadend: '#/settings/system/tvheadend',
    schedule: '#/settings/schedule',
    reset: '#/settings/system/reset',
  })
})

test('SETTINGS_GROUPS: every page href is canonical and opens its own page', () => {
  for (const page of SETTINGS_GROUPS.flatMap((group) => group.pages)) {
    assert.equal(resolveRoute(page.href).canonicalHash, null, page.href)
    assert.equal(pageAt(page.href)?.id, page.id, page.href)
  }
})

test('settingsPageOf: old addresses and route aliases open the right page', () => {
  const expected = {
    '#/settings/help': 'about',
    '#/settings/pictures': 'film-tv-info',
    '#/settings/suggestions': 'for-you',
    '#/settings/danger-zone': 'reset',
    '#/settings/reset': 'reset',
    '#/settings/tvheadend': 'tvheadend',
    '#/settings/health': 'health',
    '#/settings/activity': 'activity',
    '#/settings/log': 'log',
    '#/settings/setup': 'setup',
    '#/series': 'series',
    '#/shows': 'series',
    '#/syncs': 'activity',
    '#/syncs/42': 'activity',
    '#/doctor': 'health',
    '#/doctor/tvheadend': 'health',
    '#/setup': 'setup',
    '#/wizard': 'setup',
    '#/welcome/channels': 'setup',
    '#/recordings?status=failed': 'log',
    '#/settings/system/activity/42': 'activity',
    '#/settings/system/setup/channels': 'setup',
    '#/settings/diagram/tvheadend': 'diagram',
    '#/settings/Diagram': 'diagram',
  }
  for (const [hash, id] of Object.entries(expected)) assert.equal(pageAt(hash)?.id, id, hash)
})

test('settingsPageOf: every settings link in the app source opens a page', () => {
  const links = settingsLinksInSource()
  assert.ok(links.length > 10)
  for (const link of links) assert.ok(pageAt(link), link)
})

test('settingsPageOf: no page on a phone shows the index, wide screens open About', () => {
  assert.equal(settingsPageOf({ params: [], narrow: true }), null)
  assert.equal(settingsPageOf({ params: [] }).id, 'about')
  assert.equal(settingsPageOf({ params: ['nope'], narrow: true }), null)
})

test('settingsPageOf: pages carry their view and group', () => {
  assert.equal(settingsPageOf({ params: ['player'] }).view, 'player')
  assert.equal(settingsPageOf({ params: ['player'] }).group, 'watching')
  assert.equal(settingsPageOf({ params: ['system', 'series'] }).group, 'recording')
  assert.equal(settingsPageOf({ params: ['diagram'] }).view, 'diagram')
  assert.equal(settingsPageOf({ params: ['diagram'] }).group, 'about')
  assert.equal(settingsPageOf({ params: ['plex'] }).section, 'plex')
  assert.equal(settingsPageOf({ params: ['system', 'tvheadend'] }).section, 'tvheadend')
  assert.equal(settingsPageOf({ params: ['system', 'reset'] }).section, 'danger-zone')
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
