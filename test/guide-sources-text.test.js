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

test('the undo plan says the grabber keeps its address when only the merged setting changes, and counts only linked channels', async () => {
  const { unmergeKeepsUrlTextOf, unmergeLinksTextOf } = await import('../src/web/guide-sources-text.js')
  const url = 'http://192.168.1.10:3733/guide/xmltv.xml'
  assert.equal(unmergeKeepsUrlTextOf({ sameUrl: true, grabberUrl: url }), `TVHeadend keeps reading ${url}; the merged content is turned off.`)
  assert.equal(unmergeKeepsUrlTextOf({ sameUrl: false, grabberUrl: url }), '')
  assert.equal(unmergeLinksTextOf({ primaryChannels: 0, restoresLinks: 0 }), '')
  assert.match(unmergeLinksTextOf({ primaryChannels: 1, restoresLinks: 0 }), /^Unlinks the 1 channel that only Freeview lists\.$/)
})
