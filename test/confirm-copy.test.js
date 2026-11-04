import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  clearSyncHistoryConfirm,
  deleteSyncConfirm,
  isResetConfirmed,
  RESET_CONFIRM_BODY,
  RESET_REFUSED_MESSAGE,
  resetConfirm,
  restoreOpenAccessConfirm,
} from '../src/web/confirm-copy.js'

const dialogs = [
  deleteSyncConfirm({ syncId: 12 }),
  clearSyncHistoryConfirm({ syncRunning: false }),
  restoreOpenAccessConfirm(),
  resetConfirm({ mediaRoot: '/data/media/tv' }),
]

test('every confirm is dangerous and has no dismiss button; the close button backs out', () => {
  for (const dialog of dialogs) {
    assert.equal(dialog.keepLabel, undefined)
    assert.equal(dialog.danger, true)
  }
})

test('deleteSyncConfirm: names the sync and keeps the recordings', () => {
  const dialog = deleteSyncConfirm({ syncId: 12 })
  assert.equal(dialog.title, 'Delete sync #12')
  assert.match(dialog.body[1], /stay in your library/)
})

test('clearSyncHistoryConfirm: says the running sync stays', () => {
  assert.equal(clearSyncHistoryConfirm({ syncRunning: true }).body[0],
    'Every sync row leaves the history, except the sync running now.')
  assert.equal(clearSyncHistoryConfirm({ syncRunning: false }).body[0], 'Every sync row leaves the history.')
})

test('resetConfirm: names the media root and falls back to /media/tv', () => {
  assert.match(resetConfirm({ mediaRoot: '/data/media/tv' }).body[1], /^Your video files in \/data\/media\/tv /)
  assert.match(resetConfirm({ mediaRoot: '' }).body[1], /^Your video files in \/media\/tv /)
  assert.equal(resetConfirm({ mediaRoot: '' }).body[2], 'The first sync after setup imports the recordings still in TVHeadend again.')
})

test('RESET_REFUSED_MESSAGE: tells the reader what to do in plain words', () => {
  assert.equal(RESET_REFUSED_MESSAGE, 'Freetvarr did not reset. Reload the page, then press Reset again.')
})

test('isResetConfirmed: a reset needs the confirm body the Settings dialog sends', () => {
  assert.equal(isResetConfirmed(RESET_CONFIRM_BODY), true)
  assert.equal(isResetConfirmed({ confirm: 'reset' }), true)
  for (const body of [undefined, null, {}, { confirm: 'yes' }, { confirm: true }]) {
    assert.equal(isResetConfirmed(body), false, JSON.stringify(body))
  }
})
