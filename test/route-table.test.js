import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveRoute, activeDestinationOf, recordingsPageOf } from '../src/web/route-table.js'

test('resolveRoute: an empty or unknown hash opens home', () => {
  assert.deepEqual(resolveRoute(''), { view: 'home', params: [], section: '', canonicalHash: null })
  assert.equal(resolveRoute('#/nowhere').view, 'home')
  assert.equal(resolveRoute('#/').view, 'home')
})

test('resolveRoute: the five destinations and the wizard resolve to themselves', () => {
  for (const view of ['home', 'live', 'guide', 'recordings', 'settings', 'welcome']) {
    const resolved = resolveRoute(`#/${view}`)
    assert.equal(resolved.view, view)
    assert.equal(resolved.canonicalHash, null)
  }
})

test('resolveRoute: old top-level routes canonicalise to their new homes', () => {
  assert.equal(resolveRoute('#/dashboard').canonicalHash, '#/home')
  assert.equal(resolveRoute('#/series').canonicalHash, '#/settings/system/series')
  assert.equal(resolveRoute('#/syncs').canonicalHash, '#/settings/system/activity')
  assert.equal(resolveRoute('#/doctor').canonicalHash, '#/settings/system/health')
  assert.equal(resolveRoute('#/DASHBOARD').view, 'home')
})

test('resolveRoute: old deep links keep their parameter as the section', () => {
  const sync = resolveRoute('#/syncs/42')
  assert.equal(sync.canonicalHash, '#/settings/system/activity/42')
  assert.deepEqual(sync.params, ['system', 'activity', '42'])
  assert.equal(sync.section, '42')
  const doctor = resolveRoute('#/doctor/tvheadend')
  assert.equal(doctor.canonicalHash, '#/settings/system/health/tvheadend')
  assert.equal(doctor.section, 'tvheadend')
})

test('resolveRoute: a series or shows link with a key opens the show page', () => {
  assert.equal(resolveRoute('#/series/the-block').canonicalHash, '#/recordings/show/the-block')
  assert.equal(resolveRoute('#/shows/the-block').canonicalHash, '#/recordings/show/the-block')
})

test('resolveRoute: settings sections stay as the section, tvheadend moves under system', () => {
  assert.equal(resolveRoute('#/settings/plex').section, 'plex')
  assert.equal(resolveRoute('#/settings/plex').canonicalHash, null)
  const tvh = resolveRoute('#/settings/tvheadend')
  assert.equal(tvh.canonicalHash, '#/settings/system/tvheadend')
  assert.equal(tvh.section, 'tvheadend')
  assert.equal(resolveRoute('#/settings/system/health').section, '')
})

test('resolveRoute: show keys keep their case and decode', () => {
  const show = resolveRoute('#/recordings/show/Hello%20There')
  assert.deepEqual(show.params, ['show', 'Hello There'])
  assert.equal(show.canonicalHash, null)
})

test('resolveRoute: aliases keep their query string when rewritten', () => {
  assert.equal(resolveRoute('#/settings/log?status=failed&since=7d').canonicalHash, '#/settings/system/log?status=failed&since=7d')
  assert.equal(resolveRoute('#/syncs?show=fails').canonicalHash, '#/settings/system/activity?show=fails')
  assert.equal(resolveRoute('#/dashboard?').canonicalHash, '#/home?')
  assert.equal(resolveRoute('#/settings/system/log?status=failed').canonicalHash, null)
})

test('resolveRoute: old recordings links with admin filters open the recording log', () => {
  const log = resolveRoute('#/recordings?status=failed&since=7d')
  assert.equal(log.canonicalHash, '#/settings/system/log?status=failed&since=7d')
  assert.deepEqual(log.params, ['system', 'log'])
  assert.equal(resolveRoute('#/recordings?sort=size&dir=desc').canonicalHash, '#/settings/system/log?sort=size&dir=desc')
  assert.equal(resolveRoute('#/recordings?utm=x').canonicalHash, null)
  assert.equal(resolveRoute('#/recordings').canonicalHash, null)
  assert.equal(resolveRoute('#/recordings/scheduled?status=failed').canonicalHash, null)
})

test('activeDestinationOf: only the five destinations light up', () => {
  assert.equal(activeDestinationOf('recordings'), 'recordings')
  assert.equal(activeDestinationOf('welcome'), null)
})

test('recordingsPageOf: library by default, scheduled and show pages by segment', () => {
  assert.deepEqual(recordingsPageOf([]), { page: 'library' })
  assert.deepEqual(recordingsPageOf(['scheduled']), { page: 'scheduled' })
  assert.deepEqual(recordingsPageOf(['show', 'the-block']), { page: 'show', showKey: 'the-block' })
  assert.deepEqual(recordingsPageOf(['show']), { page: 'library' })
})

test('resolveRoute: the For you page keeps Home selected in the nav', () => {
  const resolved = resolveRoute('#/for-you')
  assert.equal(resolved.view, 'for-you')
  assert.equal(resolved.canonicalHash, null)
  assert.equal(activeDestinationOf('for-you'), 'home')
})
