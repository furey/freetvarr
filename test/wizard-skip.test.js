import { test } from 'node:test'
import assert from 'node:assert/strict'

import { wizardSkipConfirm } from '../src/web/wizard-skip.js'

test('wizardSkipConfirm: warns that recording needs TVHeadend when it is not connected', () => {
  const body = wizardSkipConfirm({ tvhConnected: false }).body
  assert.equal(body.length, 3)
  assert.match(body[0], /not finished/i)
  assert.match(body[1], /cannot record/i)
  assert.match(body[1], /TVHeadend/)
  assert.match(body[2], /Settings → SYSTEM → Setup/)
  assert.deepEqual([body[0], body[2]], wizardSkipConfirm({ tvhConnected: true }).body)
})

test('wizardSkipConfirm: leaves out the recording warning once TVHeadend is connected', () => {
  const dialog = wizardSkipConfirm({ tvhConnected: true })
  assert.equal(dialog.body.length, 2)
  assert.doesNotMatch(dialog.body.join(' '), /cannot record/i)
  assert.equal(dialog.confirmLabel, 'Finish later')
  assert.equal(dialog.keepLabel, undefined)
})
