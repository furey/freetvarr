import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const view = readFileSync(new URL('../src/web/views/for-you-view.js', import.meta.url), 'utf8')

test('For you: a failed reload keeps the last suggestions with a note, and "not ready yet" shows only with nothing loaded', () => {
  assert.match(view, /\} catch \{\n\s*if \(payload\.value\) refreshFailed\.value = true\n\s*else missing\.value = true/)
  assert.match(view, /<p v-if="refreshFailed" class="status-readout err for-you-refresh-note" role="status">Could not refresh suggestions\. These are the last ones that loaded\.<\/p>/)
  assert.match(view, /refreshFailed\.value = false\n\s*forYouStore\.keep\(fresh\)/)
})

test('For you: a failed save of picks shows why, with a settings link for the history-off 409', () => {
  assert.match(view, /picksError\.value = \{ text: `Could not save your picks\. \$\{err\.message\}`, needsSettings: err\.status === 409 \}/)
  assert.match(view, /<p v-if="picksError" class="status-readout err for-you-picks-error" role="alert">\{\{ picksError\.text \}\}<template v-if="picksError\.needsSettings"> <a :href="suggestionsHref">Open For you settings<\/a><\/template><\/p>/)
})
