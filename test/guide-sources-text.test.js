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

test('the use dialog says what the merged guide changes, that series recordings keep matching, and how to stop', async () => {
  const { useMergedGuideDialogOf } = await import('../src/web/guide-sources-text.js')
  const dialog = useMergedGuideDialogOf({ repoint: {
    feedUrl: 'http://192.168.1.10:3733/guide/xmltv.xml',
    added: ['ABC ME', '10 Peach'],
    channels: 40,
    days: [{ label: 'Freeview', days: 9 }, { label: 'i.mjh.nz', days: 19 }],
  } })
  assert.equal(dialog.confirmLabel, 'Use the merged guide')
  assert.match(dialog.body[0], /at http:\/\/192\.168\.1\.10:3733\/guide\/xmltv\.xml\.$/)
  assert.match(dialog.body[1], /gains 2 channels that only Freeview lists: ABC ME and 10 Peach\./)
  assert.equal(dialog.body[2], 'Days ahead: Freeview: 9 days · i.mjh.nz: 19 days.')
  assert.ok(dialog.body.some((line) => /Series recordings keep matching/.test(line)))
  assert.ok(dialog.body.some((line) => /puts the grabber, the channel links, and the save settings back/.test(line)))
  assert.match(dialog.body.at(-1), /SETTINGS → GUIDE/)
})

test('the stop dialog names what TVHeadend reads after, the channels that lose their guide, and the days ahead after', async () => {
  const { stopMergedGuideDialogOf } = await import('../src/web/guide-sources-text.js')
  const url = 'http://192.168.1.10:3733/guide/xmltv.xml'
  const sources = [{ id: 'freeview-au', label: 'Freeview', horizonDays: 9 }, { id: 'mjh-au', label: 'i.mjh.nz', horizonDays: 19 }]
  const same = stopMergedGuideDialogOf({ plan: { sameUrl: true, grabberUrl: url, enabled: true, primaryChannelNames: ['ABC ME'], restoresLinks: 0 }, sources, secondaryId: 'mjh-au' })
  assert.equal(same.confirmLabel, 'Stop using the merged guide')
  assert.equal(same.body[0], `TVHeadend keeps reading ${url} with the merged content off.`)
  assert.equal(same.body[1], 'These channels lose their guide, because only Freeview lists them: ABC ME.')
  assert.equal(same.body[2], 'Days ahead afterwards: i.mjh.nz: 19 days.')
  const moved = stopMergedGuideDialogOf({ plan: { sameUrl: false, grabberUrl: url, afterUrl: 'https://i.mjh.nz/au/Sydney/epg.xml', enabled: true, primaryChannelNames: [], restoresLinks: 2 }, sources, secondaryId: 'mjh-au' })
  assert.equal(moved.body[0], "TVHeadend's guide grabber will read https://i.mjh.nz/au/Sydney/epg.xml again.")
  assert.match(moved.body[1], /puts back the guide links of 2 channels/)
})
