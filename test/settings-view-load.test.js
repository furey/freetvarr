import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const view = readFileSync(new URL('../src/web/views/settings-view.js', import.meta.url), 'utf8')

const functionBody = (name) => {
  const start = view.indexOf(`const ${name} = async () => {`)
  return view.slice(start, view.indexOf('\n    }\n', start))
}

test('settings: a failed load shows the error with Try again, and Save stays off until a load works', () => {
  assert.match(view, /<span v-if="loadError" class="status-readout err" role="alert">Could not load settings: \{\{ loadError \}\}<\/span>/)
  assert.match(view, /<button v-if="loadError" type="button"[^>]*@click="loadSettings">/)
  assert.match(view, /<button v-else type="submit" form="settings-form"[^>]*:disabled="saving \|\| !loaded"/)
  const load = functionBody('loadSettings')
  assert.match(load, /fillFrom\(await fetchSettings\(\)\)\n\s*loaded\.value = true/)
  assert.match(load, /catch \(err\) \{\n\s*loadError\.value = err\.message/)
  assert.match(functionBody('save'), /^const save = async \(\) => \{\n\s*if \(!loaded\.value\) return/)
})

test('settings: Test connection does not save the address and keeps the typed password for Save', () => {
  const testTvh = functionBody('testTvh')
  assert.match(testTvh, /persist: false/)
  assert.doesNotMatch(testTvh, /tvhPassword\.value = ''/)
})
