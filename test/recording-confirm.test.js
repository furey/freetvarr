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
  assert.equal(dialog.body.length, 4)
  assert.match(dialog.body[0], /TVHeadend deletes its copy/)
  assert.ok(dialog.body[1].includes(FILE))
  assert.match(dialog.body[1], /stays/)
  assert.match(dialog.body[2], /does not record it again/)
  assert.match(dialog.body[2], /deletes any re-record/)
  assert.match(dialog.body[3], /cannot undo/)
})

test('removeFromTvhConfirm: warns when the library copy is already gone', () => {
  const dialog = removeFromTvhConfirm({ recording: recording({ library_file_present: false }) })
  assert.ok(dialog.body[1].includes(FILE))
  assert.match(dialog.body[1], /cannot find/)
})

test('clearRowConfirm: a row not in TVHeadend keeps the file and offers UNDO', () => {
  const dialog = clearRowConfirm({ recording: recording({ deleted_from_tvh_at: '2026-10-01' }), undoSeconds: 10 })
  assert.equal(dialog.title, 'Clear from the list')
  assert.equal(dialog.confirmLabel, 'Clear from list')
  assert.ok(dialog.body[0].includes(FILE))
  assert.match(dialog.body[0], /stays/)
  assert.match(dialog.body[2], /\b10 seconds\b.*Undo/)
})

test('clearRowConfirm: a row TVHeadend still has comes back at the next sync', () => {
  const dialog = clearRowConfirm({ recording: recording({ file_path: null }), undoSeconds: 10 })
  assert.equal(dialog.body.length, 2)
  assert.match(dialog.body[0], /TVHeadend keeps the recording/)
  assert.match(dialog.body[1], /next sync adds the row back/)
})

test('clearListConfirm: plural wording', () => {
  const dialog = clearListConfirm({ count: 12, undoSeconds: 10 })
  assert.equal(dialog.title, 'Clear 12 rows from the log')
  assert.equal(dialog.confirmLabel, 'Clear')
  assert.equal(dialog.body.length, 3)
  assert.match(dialog.body[0], /these recordings.*rows leave/)
  assert.match(dialog.body[1], /files stay in your library/)
  assert.match(dialog.body[2], /\b10 seconds\b.*Undo puts the rows back/)
})

test('clearListConfirm: singular wording', () => {
  const dialog = clearListConfirm({ count: 1, undoSeconds: 10 })
  assert.equal(dialog.title, 'Clear 1 row from the log')
  assert.match(dialog.body[0], /this recording.*row leaves/)
  assert.match(dialog.body[1], /file stays in your library/)
  assert.match(dialog.body[2], /\b10 seconds\b.*Undo puts the row back\b/)
})
