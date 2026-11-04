import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { tmdbKeyFrom, tmdbKeyMessageOf } from '../src/tmdb-key.js'

test('tmdbKeyFrom trims a key and refuses anything that cannot be one', () => {
  assert.equal(tmdbKeyFrom('  0123abcd  '), '0123abcd')
  assert.equal(tmdbKeyFrom('eyJhbGciOi.payload_part-1.sig'), 'eyJhbGciOi.payload_part-1.sig')
  assert.equal(tmdbKeyFrom(''), null)
  assert.equal(tmdbKeyFrom('has space'), null)
  assert.equal(tmdbKeyFrom(42), null)
  assert.equal(tmdbKeyFrom('x'.repeat(2000)), null)
})

test('tmdbKeyMessageOf explains each validation result', () => {
  assert.equal(tmdbKeyMessageOf({ ok: true }), 'TMDB accepted the key.')
  assert.match(tmdbKeyMessageOf({ ok: false, reason: 'invalid' }), /did not accept/)
  assert.match(tmdbKeyMessageOf({ ok: false, reason: 'whatever' }), /could not reach TMDB/)
})

test('TMDB key field: Enter saves the key and does not submit the Settings form', () => {
  const component = readFileSync(new URL('../src/web/components/tmdb-key-setting.js', import.meta.url), 'utf8')
  assert.match(component, /<input v-no-autofill id="settings-tmdb-key"[^>]*@keydown\.enter\.prevent="typedKey && !busy && saveKey\(\)"/)
})
