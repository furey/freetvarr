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
  assert.equal(channelStateOf({ channel: fallback, sources: SOURCES }), 'Uses i.mjh.nz, because its Freeview listings are degraded.')
  assert.equal(channelStateOf({ channel: pinned, sources: SOURCES }), 'Pinned to Freeview, which is degraded on this channel.')
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
  assert.equal(dialog.lead, 'TVHeadend reads the merged guide from Freetvarr.')
  assert.deepEqual(dialog.rows, [
    { label: 'Guide address', detail: 'http://192.168.1.10:3733/guide/xmltv.xml' },
    { label: 'Days ahead', value: 'Freeview 8 · i.mjh.nz 19' },
    { label: 'Channels that gain a guide', detail: 'ABC ME, 10 Peach' },
    { label: 'Series recordings', value: 'Keep matching' },
  ])
  assert.equal(dialog.note, 'If a step fails, Freetvarr puts everything back. You can stop using it later.')
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
  assert.equal(same.lead, 'TVHeadend goes back to the i.mjh.nz guide.')
  assert.deepEqual(same.rows, [
    { label: 'Days ahead', value: '19 days' },
    { label: 'Channels that lose their guide', detail: 'ABC ME, 10 Peach, SBS WorldWatch' },
    { label: 'Guide address', detail: `No change: ${url}` },
  ])
  assert.equal(same.note, 'If TVHeadend does not reload, Freetvarr puts the merged guide back. You can switch again later.')
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
  assert.equal(disabled.lead, 'TVHeadend stops downloading a guide by address, as before you switched.')
  assert.deepEqual(disabled.rows, [{ label: 'Guide links put back', value: '1 channel' }])
  const same = stopMergedGuideDialogOf({ plan: { sameUrl: true, grabberUrl: 'http://nas:3733/guide/xmltv.xml', enabled: true } })
  assert.equal(same.lead, 'TVHeadend keeps reading the same address with the merged content off.')
})
