import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { HIDE_SD_COPY, hideSdBodyOf, hideSdPrefsOf, hideSdSwitchesOf } from '../src/web/hide-sd.js'
import { settingsPageOf } from '../src/web/settings-pages.js'

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('hideSdSwitchesOf: both off leaves both switches off and unlocked', () => {
  const switches = hideSdSwitchesOf({})
  assert.equal(switches.simulcastsOn, false)
  assert.equal(switches.simulcastsLocked, false)
  assert.equal(switches.channelsOn, false)
})

test('hideSdSwitchesOf: Hide SD simulcasts alone stays changeable', () => {
  const switches = hideSdSwitchesOf({ hideSdSimulcasts: true })
  assert.equal(switches.simulcastsOn, true)
  assert.equal(switches.simulcastsLocked, false)
  assert.equal(switches.channelsOn, false)
})

test('hideSdSwitchesOf: Hide SD channels turns on and locks Hide SD simulcasts ', () => {
  const switches = hideSdSwitchesOf({ hideSdSimulcasts: false, hideSdChannels: true })
  assert.equal(switches.simulcastsOn, true)
  assert.equal(switches.simulcastsLocked, true)
  assert.equal(switches.channelsOn, true)
})

test('the Hide SD simulcasts copy is one fixed text for every state', () => {
  assert.ok(HIDE_SD_COPY.simulcasts.meta.endsWith(' Hide SD channels hides these too.'))
  assert.equal(Object.keys(hideSdSwitchesOf({ hideSdChannels: true })).some((key) => key.endsWith('Meta')), false)
})

test('hideSdBodyOf: sends only the settings given, in the server field names', () => {
  assert.deepEqual(hideSdBodyOf({ hideSdSimulcasts: true }), { hide_sd_simulcasts: true })
  assert.deepEqual(hideSdBodyOf({ hideSdChannels: false }), { hide_sd_channels: false })
  assert.deepEqual(hideSdBodyOf({}), {})
})

test('hideSdPrefsOf: reads the two settings from a channel-prefs reply', () => {
  assert.deepEqual(hideSdPrefsOf({ pinnedIds: ['1'], hideSdSimulcasts: true }), { hideSdSimulcasts: true, hideSdChannels: false })
  assert.deepEqual(hideSdPrefsOf(), { hideSdSimulcasts: false, hideSdChannels: false })
})

test('the Channels settings page sits in Watching with its own view', () => {
  const page = settingsPageOf({ params: ['channels'] })
  assert.equal(page.view, 'channels')
  assert.equal(page.group, 'watching')
  assert.equal(page.href, '#/settings/channels')
})

test('the Channels window and the Channels settings page show the same hide SD copy', () => {
  for (const file of ['../src/web/components/channels-modal.js', '../src/web/views/channels-settings-view.js']) {
    const source = readSource(file)
    assert.match(source, /from '\/hide-sd\.js'/, file)
    assert.match(source, /copy\.simulcasts\.title/, file)
    assert.match(source, /copy\.channels\.title/, file)
    assert.match(source, /copy\.channels\.meta/, file)
    assert.match(source, /copy\.simulcasts\.meta/, file)
    assert.doesNotMatch(source, /simulcastsMeta|lockedNote|already hides/, file)
    assert.doesNotMatch(source, /HD twin is in the lineup/, file)
  }
})
