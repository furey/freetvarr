import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  EPISODE_MENU,
  SHOW_PAGE_MENU,
  adActionLabelOf,
  adConfirmOf,
  adMenuItemOf,
  adsOfRecording,
  restoreConfirmOf,
  restoreMenuItemOf,
  restoredToastOf,
} from '../src/web/ad-confirm.js'
import { episodeMenuOf } from '../src/web/library-menus.js'
import { dialogBlocksOf } from '../src/web/dialog-blocks.js'

const FILE = '/data/media/tv/The Block/Season 22/The Block - S22E35.ts'
const NOW = Date.parse('2026-10-22T01:00:00Z')
const TZ = 'Australia/Sydney'

const ads = (overrides = {}) => ({ status: null, breakCount: 0, showMode: 'cut', cut: false, backup: null, progress: null, ...overrides })

const episode = (adsOverrides = {}, overrides = {}) => ({
  recordingId: 'r1',
  status: 'done',
  filePath: FILE,
  durationS: 3600,
  libraryState: null,
  ads: ads(adsOverrides),
  ...overrides,
})

const confirm = (adsOverrides, overrides) =>
  adConfirmOf({ episode: episode(adsOverrides, overrides), retentionDays: '7', timeZone: TZ, nowMs: NOW })

test('adActionLabelOf: Find ads when the show only finds ads, Remove ads, then Remove ads again', () => {
  assert.equal(adActionLabelOf(ads({ showMode: 'off' })), 'Find ads')
  assert.equal(adActionLabelOf(ads({ showMode: 'detect' })), 'Find ads')
  assert.equal(adActionLabelOf(ads()), 'Remove ads')
  assert.equal(adActionLabelOf(ads({ cut: true })), 'Remove ads again')
})

test('adMenuItemOf: a running job shows its progress and cannot be chosen', () => {
  assert.deepEqual(adMenuItemOf(episode({ status: 'scanning', progress: { phase: 'scanning', percent: 42 } })), {
    key: 'remove-ads', label: 'Removing ads…', icon: 'ads', detail: '42%', disabled: true,
  })
  assert.equal(adMenuItemOf(episode({ showMode: 'off', status: 'scanning' })).label, 'Finding ads…')
  assert.equal(adMenuItemOf(episode({ status: 'scanning' })).detail, '')
})

test('restoreMenuItemOf: only while a backup exists and no job runs', () => {
  assert.equal(restoreMenuItemOf(episode()), null)
  assert.deepEqual(restoreMenuItemOf(episode({ cut: true, backup: { keptUntil: '2026-10-29T01:00:00Z', uncut: true } })), {
    key: 'restore-original', label: 'Put the original back', icon: 'restart',
  })
  assert.equal(restoreMenuItemOf(episode({ cut: true, backup: { keptUntil: null, uncut: false } })).label, 'Put the previous version back')
  assert.equal(restoreMenuItemOf(episode({ status: 'scanning', backup: { keptUntil: null, uncut: true } })), null)
})

test('episodeMenuOf: labels follow the ad state, and the original can be put back', () => {
  const groups = episodeMenuOf({
    episode: episode({ cut: true, backup: { keptUntil: '2026-10-29T01:00:00Z', uncut: true } }, { playable: true }),
    adRemovalEnabled: true,
  })
  const items = groups.flat()
  assert.equal(items.find((item) => item.key === 'remove-ads').label, 'Remove ads again')
  assert.equal(items.find((item) => item.key === 'restore-original').label, 'Put the original back')
  const missing = episodeMenuOf({ episode: episode({ backup: { keptUntil: null, uncut: true } }, { libraryState: 'not_in_library' }), adRemovalEnabled: true })
  assert.ok(!missing.flat().some((item) => ['remove-ads', 'restore-original'].includes(item.key)))
})

test('adConfirmOf: first Remove ads keeps the original until a date and says how to undo', () => {
  const copy = confirm()
  assert.equal(copy.title, 'Remove ads?')
  assert.equal(copy.goLabel, 'Remove ads')
  assert.equal(copy.danger, false)
  assert.deepEqual(copy.changes.map(({ icon, title }) => ({ icon, title })), [{ icon: 'ads', title: 'This episode' }])
  assert.match(copy.changes[0].detail, /without the ad breaks/i)
  assert.match(copy.changes[0].detail, /quality/i)
  assert.doesNotMatch(copy.changes[0].detail, /starts again/i)
  assert.deepEqual(copy.stays.map(({ icon, title }) => ({ icon, title })), [{ icon: 'check', title: 'The original with ads' }])
  assert.ok(copy.stays[0].detail.includes('Thu 29 Oct'))
  assert.ok(copy.stays[0].detail.includes('The Block - S22E35.ts.orig'))
  assert.doesNotMatch(copy.stays[0].detail, /gone/i)
  assert.match(copy.note, /\b30 minutes\b/)
  assert.match(copy.note, /or more/i)
  assert.match(copy.note, /processor/i)
  assert.match(copy.undo, /undo/i)
  assert.ok(copy.undo.includes('Put the original back'))
  assert.ok(copy.undo.includes(EPISODE_MENU))
  assert.ok(copy.undo.includes('Thu 29 Oct'))
})

test('adConfirmOf: Remove ads again starts from the original and keeps its first date', () => {
  const copy = confirm({ cut: true, backup: { keptUntil: '2026-10-25T01:00:00Z', uncut: true } })
  assert.equal(copy.title, 'Remove ads again?')
  assert.match(copy.changes[0].detail, /starts again from the original/i)
  assert.ok(copy.stays[0].detail.includes('Sun 25 Oct'))
  assert.ok(copy.stays[0].detail.includes('The Block - S22E35.ts.orig'))
  assert.ok(copy.undo.includes('Put the original back'))
  assert.ok(copy.undo.includes('Sun 25 Oct'))
  assert.doesNotMatch(copy.undo, /29 Oct/)
})

test('adConfirmOf: once the original is gone, the current episode becomes the backup and the copy says so', () => {
  const copy = confirm({ cut: true })
  assert.deepEqual(copy.stays.map(({ icon, title }) => ({ icon, title })), [{ icon: 'check', title: 'This episode as it is now' }])
  assert.ok(copy.stays[0].detail.includes('Thu 29 Oct'))
  assert.ok(copy.stays[0].detail.includes('The Block - S22E35.ts.orig'))
  assert.match(copy.stays[0].detail, /original.*gone/i)
  assert.ok(copy.undo.includes('Put the previous version back'))
  assert.ok(!copy.undo.includes('Put the original back'))
})

test('adConfirmOf: Find ads writes the .edl and leaves the episode file alone', () => {
  const copy = confirm({ showMode: 'off' })
  assert.equal(copy.title, 'Find ads?')
  assert.equal(copy.goLabel, 'Find ads')
  assert.equal(copy.changes[0].title, 'The Block - S22E35.edl')
  assert.match(copy.changes[0].detail, /Media players that read it skip the ads/)
  assert.deepEqual(copy.stays.map(({ icon, title }) => ({ icon, title })), [{ icon: 'check', title: 'This episode' }])
  assert.match(copy.stays[0].detail, /stays/i)
  assert.match(copy.note, /\b30 minutes\b/)
  assert.doesNotMatch(copy.note, /or more/i)
  assert.match(copy.note, /processor/i)
  assert.equal(copy.undo, '')
})

test('adConfirmOf: no length means no time estimate', () => {
  const note = confirm({}, { durationS: null }).note
  assert.match(note, /processor/i)
  assert.doesNotMatch(note, /\d|minute|undefined|null|NaN/)
})

test('restoreConfirmOf: names what changes and what stays', () => {
  const copy = restoreConfirmOf({ episode: episode({ cut: true, backup: { keptUntil: null, uncut: true } }) })
  assert.equal(copy.title, 'Put the original back?')
  assert.equal(copy.goLabel, 'Put the original back')
  assert.equal(copy.danger, false)
  assert.match(copy.changes[0].detail, /original/i)
  assert.match(copy.changes[0].detail, /with the ads/i)
  assert.ok(copy.changes[0].detail.includes('The Block - S22E35.ts.orig'))
  assert.equal(copy.stays[0].title, 'The episode in your library')
  const previous = restoreConfirmOf({ episode: episode({ cut: true, backup: { keptUntil: null, uncut: false } }) })
  assert.equal(previous.title, 'Put the previous version back?')
  assert.equal(previous.undo, '')
  assert.ok(previous.changes[0].detail.includes('The Block - S22E35.ts.orig'))
  assert.doesNotMatch(previous.changes[0].detail, /original/i)
})

test('restoredToastOf and adsOfRecording', () => {
  assert.equal(restoredToastOf({ uncut: true, heading: 'E35' }).title, 'E35 is the original again')
  assert.deepEqual(adsOfRecording({
    ad_status: 'cut', show_ad_removal: 'cut', ad_cut_at: '2026-10-20 01:00:00',
    ad_backup_saved_at: '2026-10-20 01:00:00', ad_backup_kept_until: '2026-10-27T01:00:00.000Z', ad_backup_uncut: 1,
  }), {
    status: 'cut', breakCount: 0, showMode: 'cut', cut: true,
    backup: { keptUntil: '2026-10-27T01:00:00.000Z', uncut: true }, progress: null,
  })
})

test('dialogBlocksOf: shows only the blocks that have lines, in a fixed order', () => {
  const blocks = dialogBlocksOf({ stays: [{ title: 'b' }], deleted: [{ title: 'a' }] })
  assert.deepEqual(blocks.map((block) => block.heading), ['What gets deleted', 'What stays'])
})

test('adConfirmOf: the Recording log points to the episode menu on the show page', () => {
  const copy = adConfirmOf({ episode: episode(), retentionDays: '7', timeZone: TZ, nowMs: NOW, menuPlace: SHOW_PAGE_MENU })
  assert.ok(copy.undo.includes(SHOW_PAGE_MENU))
  assert.match(copy.undo, /show page/i)
  assert.ok(!copy.undo.includes(EPISODE_MENU))
  assert.ok(copy.undo.includes('Put the original back'))
  assert.ok(copy.undo.includes('Thu 29 Oct'))
})
