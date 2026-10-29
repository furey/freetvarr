import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { SETTINGS_GROUPS } from '../src/web/settings-pages.js'
import { SETTINGS_INDEX, searchSettings, settingLabelOf } from '../src/web/settings-index.js'

const readSource = (path) => readFileSync(new URL(`../src/web/${path}`, import.meta.url), 'utf8')

const SETTINGS_VIEW_FILES = [
  'views/settings-view.js',
  'components/tv-apps-panel.js',
  'components/tmdb-key-setting.js',
  'components/movie-corrections.js',
  'components/live-streams-settings.js',
  'components/plex-watch-setting.js',
]

const PAGE_FILES = {
  settings: SETTINGS_VIEW_FILES,
  player: ['views/player-settings-view.js', 'components/controls-hide-setting.js', 'components/live-streams-settings.js'],
  'for-you': ['views/suggestions-settings-view.js'],
  channels: ['views/channels-settings-view.js'],
  diagram: ['views/system-diagram-view.js'],
  series: ['views/series-view.js'],
  folders: ['views/series-view.js'],
  log: ['views/recordings-view.js'],
  health: ['views/doctor-view.js'],
  activity: ['views/syncs-view.js'],
  setup: ['views/setup-settings-view.js'],
}

const LABELLED_FILES = [
  ...SETTINGS_VIEW_FILES,
  'views/player-settings-view.js',
  'views/suggestions-settings-view.js',
  'views/channels-settings-view.js',
  'components/controls-hide-setting.js',
]

const ALL_PAGES = SETTINGS_GROUPS.flatMap((group) => group.pages)

const pageSourceOf = (page) => (PAGE_FILES[page.view === 'system' ? page.id : page.view] ?? []).map(readSource).join('\n')

const LABEL_ELEMENT = /<(\w+)[^>]*class="[^"]*\b(?:settings-row-title|field-label|ui-group-label)\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/g

const labelTextOf = (inner) => inner
  .replace(/<[^>]+>/g, '')
  .replace(/\([^)]*\)/g, '')
  .replace(/\s+/g, ' ')
  .trim()

const staticLabelsIn = (source) => [...source.matchAll(LABEL_ELEMENT)]
  .filter(([, , inner]) => !inner.includes('{{'))
  .map(([, , inner]) => labelTextOf(inner))
  .filter(Boolean)

const hasEntryFor = (text) => SETTINGS_INDEX.some(({ label }) => {
  const wanted = text.toLowerCase()
  const name = label.toLowerCase()
  return wanted === name || wanted.startsWith(`${name} `)
})

test('SETTINGS_INDEX: covers the pages and their settings', () => {
  assert.ok(SETTINGS_INDEX.length >= 90, `${SETTINGS_INDEX.length} entries`)
  for (const page of ALL_PAGES) assert.ok(SETTINGS_INDEX.some((entry) => entry.page === page.id && entry.isPage), page.id)
})

test('SETTINGS_INDEX: every entry names a page in SETTINGS_GROUPS, with a description and tags', () => {
  for (const entry of SETTINGS_INDEX) {
    assert.ok(ALL_PAGES.some((page) => page.id === entry.page), entry.label)
    assert.ok(entry.description.endsWith('.'), entry.label)
    assert.ok(Array.isArray(entry.tags) && entry.tags.length, entry.label)
  }
})

test('SETTINGS_INDEX: every setting target exists in its page source', () => {
  for (const entry of SETTINGS_INDEX.filter(({ setting }) => setting)) {
    const page = ALL_PAGES.find(({ id }) => id === entry.page)
    assert.ok(pageSourceOf(page).includes(`data-setting="${entry.setting}"`), `${entry.label}: ${entry.setting}`)
  }
})

test('SETTINGS_INDEX: every label in the settings views has an entry', () => {
  const labels = [...new Set(LABELLED_FILES.map(readSource).flatMap(staticLabelsIn))]
  assert.ok(labels.length > 40, `${labels.length} labels`)
  const missing = labels.filter((text) => !hasEntryFor(text))
  assert.deepEqual(missing, [])
})

test('SETTINGS_INDEX: a setting path names its group and page', () => {
  const streams = SETTINGS_INDEX.find(({ label }) => label === 'Live streams at once')
  assert.equal(streams.path, 'Watching → Playback')
  assert.equal(streams.href, '#/settings/player')
  assert.equal(streams.setting, 'live-streams')
  const library = SETTINGS_INDEX.find(({ label }) => label === 'Media library')
  assert.equal(library.path, 'Recording')
  assert.equal(library.href, '#/settings/storage')
})

test('searchSettings: sample queries put the expected result first', () => {
  const expected = {
    ads: 'Ad removal',
    plex: 'Plex',
    tuner: 'Live streams at once',
    faces: 'Keep faces in view',
    'TMDB key': 'TMDB key',
    'recording folders': 'Media library',
    schedule: 'Schedule',
    'time and syncs': 'Schedule',
    'library and plex': 'Plex',
    player: 'Playback',
    jellyfin: 'Jellyfin',
    genres: 'Genres',
  }
  for (const [query, label] of Object.entries(expected)) assert.equal(searchSettings(query)[0]?.label, label, query)
})

test('searchSettings: ranks label matches before description and tag matches', () => {
  const labels = searchSettings('ads').map(({ label }) => label)
  assert.ok(labels.includes('Enable ad removal'))
  assert.ok(searchSettings('tuner').some(({ label }) => label === 'Tuners'))
  assert.equal(searchSettings('Movie corrections')[0].page, 'film-tv-info')
})

test('searchSettings: ignores case, accents, and spacing; an empty query finds nothing', () => {
  assert.deepEqual(searchSettings('  PLEX  ').map(({ label }) => label), searchSettings('plex').map(({ label }) => label))
  assert.equal(searchSettings('fáces')[0].label, 'Keep faces in view')
  assert.deepEqual(searchSettings(''), [])
  assert.deepEqual(searchSettings('   '), [])
  assert.deepEqual(searchSettings('sleep'), [])
})

test('settingLabelOf: names a setting by its key', () => {
  assert.equal(settingLabelOf('live-streams'), 'Live streams at once')
  assert.equal(settingLabelOf('nope'), '')
})
