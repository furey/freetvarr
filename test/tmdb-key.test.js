import { test } from 'node:test'
import assert from 'node:assert/strict'

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
