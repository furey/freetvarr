import { test } from 'node:test'
import assert from 'node:assert/strict'

import { wizardSkipConfirm } from '../src/web/wizard-skip.js'

test('wizardSkipConfirm: warns that recording needs TVHeadend when it is not connected', () => {
  assert.deepEqual(wizardSkipConfirm({ tvhConnected: false }).body, [
    'Setup is not finished. Freetvarr keeps what you saved so far and opens SETTINGS.',
    'Freetvarr cannot record until it connects to TVHeadend.',
    'To finish later, open SETTINGS → HELP → REOPEN WIZARD.',
  ])
})

test('wizardSkipConfirm: leaves out the recording warning once TVHeadend is connected', () => {
  const dialog = wizardSkipConfirm({ tvhConnected: true })
  assert.equal(dialog.body.length, 2)
  assert.equal(dialog.confirmLabel, 'FINISH LATER')
  assert.equal(dialog.keepLabel, undefined)
})
