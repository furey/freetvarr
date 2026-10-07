import { test } from 'node:test'
import assert from 'node:assert/strict'

import { wizardSkipPrompt } from '../src/web/wizard-skip.js'

test('wizardSkipPrompt: warns that recording needs TVHeadend when it is not connected', () => {
  assert.equal(
    wizardSkipPrompt({ tvhConnected: false }),
    'Leave setup now?\n\n'
      + 'Setup is not finished. Freetvarr keeps what you saved so far.\n\n'
      + 'Freetvarr cannot record until it connects to TVHeadend.\n\n'
      + 'To finish later, open Settings → Setup wizard → REOPEN WIZARD.',
  )
})

test('wizardSkipPrompt: leaves out the recording warning once TVHeadend is connected', () => {
  assert.equal(
    wizardSkipPrompt({ tvhConnected: true }),
    'Leave setup now?\n\n'
      + 'Setup is not finished. Freetvarr keeps what you saved so far.\n\n'
      + 'To finish later, open Settings → Setup wizard → REOPEN WIZARD.',
  )
})
