import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  adScanConfirm,
  adScanModeOf,
  clearListConfirm,
  clearRowConfirm,
  fileNameOf,
  removeFromTvhConfirm,
  scanMinutesOf,
} from '../src/web/recording-confirm.js'

const FILE = '/data/media/tv/The Block/Season 21/The Block - S21E01.ts'

const recording = (overrides = {}) => ({
  title: 'The Block',
  file_path: FILE,
  duration_s: 5400,
  library_file_present: true,
  deleted_from_tvh_at: null,
  ad_status: null,
  ad_breaks_json: null,
  show_ad_removal: 'detect',
  ...overrides,
})

test('ad scan confirms have no dismiss button; the close button backs out', () => {
  const base = recording()
  assert.equal(adScanConfirm({ recording: base }).keepLabel, undefined)
  assert.equal(adScanConfirm({ recording: { ...base, show_ad_removal: 'cut' } }).keepLabel, undefined)
})

test('every other recording confirm names what its dismiss button keeps', () => {
  const base = recording({ deleted_from_tvh_at: '2026-10-01' })
  assert.equal(removeFromTvhConfirm({ recording: base }).keepLabel, 'KEEP IN TVHEADEND')
  assert.equal(clearRowConfirm({ recording: base, undoSeconds: 10 }).keepLabel, 'KEEP IN LIST')
  assert.equal(clearRowConfirm({ recording: recording(), undoSeconds: 10 }).keepLabel, 'KEEP IN LIST')
  assert.equal(clearListConfirm({ count: 2, undoSeconds: 10 }).keepLabel, 'KEEP IN LIST')
})

test('adScanModeOf: CUT only when the show cuts; OFF and one-offs detect', () => {
  assert.equal(adScanModeOf({ show_ad_removal: 'cut' }), 'cut')
  assert.equal(adScanModeOf({ show_ad_removal: 'detect' }), 'detect')
  assert.equal(adScanModeOf({ show_ad_removal: 'off' }), 'detect')
  assert.equal(adScanModeOf({ show_ad_removal: null }), 'detect')
})

test('scanMinutesOf: half the recording length, never under a minute', () => {
  assert.equal(scanMinutesOf(5400), 45)
  assert.equal(scanMinutesOf(30), 1)
  assert.equal(scanMinutesOf(null), null)
  assert.equal(scanMinutesOf(0), null)
})

test('fileNameOf: the last path part', () => {
  assert.equal(fileNameOf(FILE), 'The Block - S21E01.ts')
  assert.equal(fileNameOf(null), '')
})

test('adScanConfirm: detect names the .edl file, the time, and keeps the file', () => {
  const dialog = adScanConfirm({ recording: recording(), retentionDays: '7' })
  assert.equal(dialog.title, 'Find ads')
  assert.equal(dialog.confirmLabel, 'FIND ADS')
  assert.equal(dialog.danger, false)
  assert.match(dialog.body[0], /The Block - S21E01\.edl beside the recording/)
  assert.match(dialog.body[0], /The recording file stays as it is\./)
  assert.equal(dialog.body[1], 'Finding the ads takes about 45 minutes and uses a lot of processor time.')
  assert.equal(dialog.body.length, 2)
})

test('adScanConfirm: detect says it replaces the last result', () => {
  const found = adScanConfirm({ recording: recording({ ad_status: 'detected', ad_breaks_json: '[{"start":1,"end":2},{"start":3,"end":4}]' }) })
  assert.equal(found.body.at(-1), 'This replaces the last result: 2 breaks found.')
  const none = adScanConfirm({ recording: recording({ ad_status: 'no_breaks' }) })
  assert.equal(none.body.at(-1), 'This replaces the last result: no ad breaks found.')
})

test('adScanConfirm: cut names the backup, its retention, and is styled as danger', () => {
  const dialog = adScanConfirm({ recording: recording({ show_ad_removal: 'cut' }), retentionDays: '3' })
  assert.equal(dialog.title, 'Cut ads')
  assert.equal(dialog.confirmLabel, 'CUT ADS')
  assert.equal(dialog.danger, true)
  assert.match(dialog.body[1], /The Block - S21E01\.ts\.orig for 3 days, then deletes it\./)
  assert.match(dialog.body[2], /^Finding the ads takes about 45 minutes, and saving the cut/)
})

test('adScanConfirm: a second cut warns that the backup is replaced', () => {
  const dialog = adScanConfirm({ recording: recording({ show_ad_removal: 'cut', ad_status: 'cut' }), retentionDays: '7' })
  assert.match(dialog.body.at(-1), /already cut.*replaces the backup.*full original is lost\./)
})

test('adScanConfirm: unknown length says several minutes; bad retention falls back to 7 days', () => {
  const dialog = adScanConfirm({ recording: recording({ show_ad_removal: 'cut', duration_s: null }), retentionDays: 'x' })
  assert.match(dialog.body[1], /for 7 days/)
  assert.match(dialog.body[2], /^Finding the ads takes several minutes,/)
})

test('removeFromTvhConfirm: library copy stays, history kept, cannot undo', () => {
  const dialog = removeFromTvhConfirm({ recording: recording() })
  assert.equal(dialog.title, 'Remove from TVHeadend')
  assert.equal(dialog.confirmLabel, 'REMOVE FROM TVHEADEND')
  assert.equal(dialog.danger, true)
  assert.deepEqual(dialog.body, [
    'TVHeadend deletes its copy of the recording.',
    `Your library copy stays at ${FILE}, and your media player still plays it.`,
    'TVHeadend keeps a note that it recorded this episode, so a series recording does not record it again.'
      + ' TVHeadend also deletes any re-record it has scheduled for this episode.',
    'This takes a few seconds. You cannot undo it.',
  ])
})

test('removeFromTvhConfirm: warns when the library copy is already gone', () => {
  const dialog = removeFromTvhConfirm({ recording: recording({ library_file_present: false }) })
  assert.equal(dialog.body[1], `Freetvarr cannot find your library copy at ${FILE}.`)
})

test('clearRowConfirm: a row not in TVHeadend keeps the file and offers UNDO', () => {
  const dialog = clearRowConfirm({ recording: recording({ deleted_from_tvh_at: '2026-10-01' }), undoSeconds: 10 })
  assert.equal(dialog.title, 'Clear from the list')
  assert.equal(dialog.confirmLabel, 'CLEAR FROM LIST')
  assert.equal(dialog.body[0], `The row leaves this list. Your library copy stays at ${FILE}, and your media player still plays it.`)
  assert.equal(dialog.body[2], 'For 10 seconds, UNDO puts the row back.')
})

test('clearRowConfirm: a row TVHeadend still has comes back at the next sync', () => {
  const dialog = clearRowConfirm({ recording: recording({ file_path: null }), undoSeconds: 10 })
  assert.deepEqual(dialog.body, [
    'The row leaves this list. TVHeadend keeps the recording.',
    'While TVHeadend has the recording, the next sync adds the row back and decides again whether to import it.',
  ])
})

test('clearListConfirm: plural wording', () => {
  const dialog = clearListConfirm({ count: 12, undoSeconds: 10 })
  assert.equal(dialog.title, 'Clear 12 recordings from the list')
  assert.deepEqual(dialog.body, [
    'TVHeadend no longer has these recordings. Their rows leave this list, on every page and filter.',
    'The files stay in your library, and your media player still shows them.'
      + ' To delete them for good, delete them in your media player or from your library folder.',
    'For 10 seconds, UNDO puts the rows back. Without a clear, rows like these leave the list 30 days after TVHeadend removed them.',
  ])
})

test('clearListConfirm: singular wording', () => {
  const dialog = clearListConfirm({ count: 1, undoSeconds: 10 })
  assert.equal(dialog.title, 'Clear 1 recording from the list')
  assert.match(dialog.body[0], /^TVHeadend no longer has this recording\. Its row leaves this list/)
  assert.match(dialog.body[1], /^The file stays in your library, and your media player still shows it\. To delete it for good, delete it/)
  assert.match(dialog.body[2], /^For 10 seconds, UNDO puts the row back\./)
})
