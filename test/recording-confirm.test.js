import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
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

test('recording confirms have no dismiss button; the close button backs out', () => {
  const base = recording({ deleted_from_tvh_at: '2026-10-01' })
  const dialogs = [
    removeFromTvhConfirm({ recording: base }),
    clearRowConfirm({ recording: base, undoSeconds: 10 }),
    clearRowConfirm({ recording: recording(), undoSeconds: 10 }),
    clearListConfirm({ count: 2, undoSeconds: 10 }),
  ]
  for (const dialog of dialogs) assert.equal(dialog.keepLabel, undefined)
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

test('removeFromTvhConfirm: library copy stays, history kept, cannot undo', () => {
  const dialog = removeFromTvhConfirm({ recording: recording() })
  assert.equal(dialog.title, 'Remove from TVHeadend')
  assert.equal(dialog.confirmLabel, 'Remove from TVHeadend')
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
  assert.equal(dialog.confirmLabel, 'Clear from list')
  assert.equal(dialog.body[0], `The row leaves this list. Your library copy stays at ${FILE}, and your media player still plays it.`)
  assert.equal(dialog.body[2], 'For 10 seconds, Undo puts the row back.')
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
  assert.equal(dialog.title, 'Clear 12 rows from the log')
  assert.equal(dialog.confirmLabel, 'Clear')
  assert.deepEqual(dialog.body, [
    'TVHeadend no longer has these recordings. Their rows leave this list, on every page and filter.',
    'The files stay in your library, and your media player still shows them.'
      + ' To delete them for good, delete them in your media player or from your library folder.',
    'For 10 seconds, Undo puts the rows back. Without a clear, rows like these leave the list 30 days after TVHeadend removed them.',
  ])
})

test('clearListConfirm: singular wording', () => {
  const dialog = clearListConfirm({ count: 1, undoSeconds: 10 })
  assert.equal(dialog.title, 'Clear 1 row from the log')
  assert.match(dialog.body[0], /^TVHeadend no longer has this recording\. Its row leaves this list/)
  assert.match(dialog.body[1], /^The file stays in your library, and your media player still shows it\. To delete it for good, delete it/)
  assert.match(dialog.body[2], /^For 10 seconds, Undo puts the row back\./)
})
