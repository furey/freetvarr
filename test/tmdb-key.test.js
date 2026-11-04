import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { tmdbKeyFrom, tmdbKeyMessageOf } from '../src/tmdb-key.js'
import { saveOnEnterOf } from '../src/web/tmdb-key-field.js'

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

test('saveOnEnterOf: Enter in the key field saves a typed key, and does nothing while empty or busy', () => {
  assert.equal(saveOnEnterOf({ typedKey: '0123abcd', busy: '' }), true)
  assert.equal(saveOnEnterOf({ typedKey: '  ', busy: '' }), false)
  assert.equal(saveOnEnterOf({ typedKey: '0123abcd', busy: 'save' }), false)
})

test('TMDB key field: Enter is caught on the field, so it does not submit the Settings form', () => {
  const component = readFileSync(new URL('../src/web/components/tmdb-key-setting.js', import.meta.url), 'utf8')
  assert.match(component, /@keydown\.enter\.prevent="saveOnEnterOf\(/)
})
