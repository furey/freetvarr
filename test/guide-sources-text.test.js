import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  addedChannelsOf,
  channelStateOf,
  channelsChangeOf,
  listedChannelsOf,
  listingChoicesOf,
  listingModeHintOf,
  pinnableChannelsOf,
  sourceMetaOf,
} from '../src/web/guide-sources-text.js'

const SOURCES = [{ id: 'freeview-au', label: 'Freeview' }, { id: 'mjh-au', label: 'i.mjh.nz' }]

test('listings source: Automatic first, then each source by name, with a hint for each choice', () => {
  assert.deepEqual(listingChoicesOf(SOURCES).map((choice) => choice.label), ['Automatic', 'Freeview', 'i.mjh.nz'])
  assert.match(listingModeHintOf({ mode: 'auto', sources: SOURCES }), /^Freeview first\. .* uses i\.mjh\.nz until Freeview recovers/)
  assert.match(listingModeHintOf({ mode: 'mjh-au', sources: SOURCES }), /^i\.mjh\.nz first .* Health warns you/)
})

test('confirm step text: channel counts before and after, and a short list of added channels', () => {
  assert.equal(channelsChangeOf({ added: ['ABC ME'], currentChannels: 175, channels: 189 }), '175 now, 189 after')
  assert.equal(channelsChangeOf({ added: [], currentChannels: 175, channels: 175 }), '175')
  assert.equal(addedChannelsOf({ names: ['A', 'B'] }), 'A and B')
  assert.equal(addedChannelsOf({ names: ['A', 'B', 'C', 'D', 'E', 'F'] }), 'A, B, C, D, and 2 more')
})

test('source and channel lines: unmeasured sources say so; fallbacks and pins explain the source in use', () => {
  assert.match(sourceMetaOf({ source: { measured: false } }), /Not measured yet/)
  assert.equal(sourceMetaOf({ source: { measured: true, score: 96, horizonDays: 9, lastSuccessAt: 1 }, clockOf: () => '10:30' }), '96% of channels healthy · 9 days ahead · last read 10:30')
  const fallback = { id: 'seven', name: 'Seven', sources: ['freeview-au', 'mjh-au'], pin: null, lead: 'mjh-au', fallback: true, degraded: ['freeview-au'] }
  const pinned = { id: 'nine', name: 'Nine', lcn: 9, sources: ['freeview-au', 'mjh-au'], pin: 'freeview-au', lead: 'freeview-au', fallback: false, degraded: ['freeview-au'] }
  const plain = { id: 'ten', name: 'Ten', lcn: 10, sources: ['freeview-au', 'mjh-au'], pin: null, lead: 'freeview-au', fallback: false, degraded: [] }
  const fallbackState = channelStateOf({ channel: fallback, sources: SOURCES })
  assert.match(fallbackState, /i\.mjh\.nz.*Freeview/)
  assert.match(fallbackState, /degraded/i)
  assert.doesNotMatch(fallbackState, /pinned/i)
  const pinnedState = channelStateOf({ channel: pinned, sources: SOURCES })
  assert.match(pinnedState, /pinned/i)
  assert.match(pinnedState, /Freeview/)
  assert.match(pinnedState, /degraded/i)
  assert.doesNotMatch(pinnedState, /i\.mjh\.nz/)
  const plainState = channelStateOf({ channel: plain, sources: SOURCES })
  assert.match(plainState, /Freeview/)
  assert.doesNotMatch(plainState, /degraded|pinned|i\.mjh\.nz/i)
  assert.deepEqual(listedChannelsOf([fallback, pinned, plain]).map((channel) => channel.id), ['seven', 'nine'])
  assert.deepEqual(pinnableChannelsOf([fallback, pinned, plain, { ...plain, id: 'sbs', sources: ['mjh-au'] }]).map((channel) => channel.id), ['ten', 'seven'])
})

test('a failed undo retries the undo and hides keep my grabber; a failed switch retries the switch', async () => {
  const { failedRunActionsOf } = await import('../src/web/guide-sources-text.js')
  assert.deepEqual(failedRunActionsOf({ kind: 'unmerge', ok: false }), { retry: 'unmerge', showKeep: false })
  assert.deepEqual(failedRunActionsOf({ kind: 'repoint', ok: false }), { retry: 'repoint', showKeep: true })
  assert.deepEqual(failedRunActionsOf({ ok: false }), { retry: 'repoint', showKeep: true })
})

test('the use dialog leads with the merged guide and lists the address, days ahead, gained channels, and series recordings', async () => {
  const { useMergedGuideDialogOf } = await import('../src/web/guide-sources-text.js')
  const dialog = useMergedGuideDialogOf({ repoint: {
    feedUrl: 'http://192.168.1.10:3733/guide/xmltv.xml',
    added: ['ABC ME', '10 Peach'],
    channels: 40,
    days: [{ label: 'Freeview', days: 8 }, { label: 'i.mjh.nz', days: 19 }],
  } })
  assert.equal(dialog.confirmLabel, 'Use the merged guide')
  assert.match(dialog.lead, /TVHeadend/)
  assert.match(dialog.lead, /merged guide/i)
  assert.deepEqual(dialog.rows, [
    { label: 'Guide address', detail: 'http://192.168.1.10:3733/guide/xmltv.xml' },
    { label: 'Days ahead', value: 'Freeview 8 · i.mjh.nz 19' },
    { label: 'Channels that gain a guide', detail: 'ABC ME, 10 Peach' },
    { label: 'Series recordings', value: 'Keep matching' },
  ])
  assert.match(dialog.note, /fails/i)
  assert.match(dialog.note, /back/i)
  assert.equal(dialog.body, undefined)
})

test('the use dialog omits gained channels and days ahead when there are none, and shows the first build when it rebuilds', async () => {
  const { useMergedGuideDialogOf } = await import('../src/web/guide-sources-text.js')
  const dialog = useMergedGuideDialogOf({ repoint: { feedUrl: 'http://nas:3733/guide/xmltv.xml', added: [], channels: 40, days: [], rebuild: true, region: 'Sydney' } })
  assert.deepEqual(dialog.rows.map((row) => row.label), ['Guide address', 'First build', 'Series recordings'])
  assert.equal(dialog.rows[1].value, 'About 15 minutes')
})

test('the stop dialog leads with the guide TVHeadend goes back to and lists days ahead, lost channels, put-back links, and the address', async () => {
  const { stopMergedGuideDialogOf } = await import('../src/web/guide-sources-text.js')
  const url = 'http://192.168.1.10:3733/guide/xmltv.xml'
  const sources = [{ id: 'freeview-au', label: 'Freeview', horizonDays: 9 }, { id: 'mjh-au', label: 'i.mjh.nz', horizonDays: 19 }]
  const same = stopMergedGuideDialogOf({ plan: { sameUrl: true, grabberUrl: url, enabled: true, primaryChannelNames: ['ABC ME', '10 Peach', 'SBS WorldWatch'], restoresLinks: 0 }, sources, secondaryId: 'mjh-au' })
  assert.equal(same.confirmLabel, 'Stop using the merged guide')
  assert.match(same.lead, /i\.mjh\.nz/)
  assert.doesNotMatch(same.lead, /Freeview|undefined/)
  assert.deepEqual(same.rows, [
    { label: 'Days ahead', value: '19 days' },
    { label: 'Channels that lose their guide', detail: 'ABC ME, 10 Peach, SBS WorldWatch' },
    { label: 'Guide address', detail: `No change: ${url}` },
  ])
  assert.match(same.note, /merged guide/i)
  assert.match(same.note, /back/i)
  const moved = stopMergedGuideDialogOf({ plan: { sameUrl: false, grabberUrl: url, afterUrl: 'https://i.mjh.nz/au/Sydney/epg.xml', enabled: true, primaryChannelNames: [], restoresLinks: 2 }, sources, secondaryId: 'mjh-au' })
  assert.deepEqual(moved.rows, [
    { label: 'Days ahead', value: '19 days' },
    { label: 'Guide links put back', value: '2 channels' },
    { label: 'Guide address', detail: 'https://i.mjh.nz/au/Sydney/epg.xml' },
  ])
})

test('the stop dialog keeps the address and disabled-grabber leads when it has no secondary guide', async () => {
  const { stopMergedGuideDialogOf } = await import('../src/web/guide-sources-text.js')
  const disabled = stopMergedGuideDialogOf({ plan: { sameUrl: false, grabberUrl: 'http://nas:3733/guide/xmltv.xml', enabled: false, primaryChannelNames: [], restoresLinks: 1 } })
  assert.match(disabled.lead, /stops/i)
  assert.deepEqual(disabled.rows, [{ label: 'Guide links put back', value: '1 channel' }])
  const same = stopMergedGuideDialogOf({ plan: { sameUrl: true, grabberUrl: 'http://nas:3733/guide/xmltv.xml', enabled: true } })
  assert.match(same.lead, /same address/i)
  assert.doesNotMatch(same.lead, /stops/i)
  assert.doesNotMatch(disabled.lead, /same address/i)
  assert.notEqual(same.lead, disabled.lead)
})
