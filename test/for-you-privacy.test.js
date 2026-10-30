import { test } from 'node:test'
import assert from 'node:assert/strict'
import { privacyLookupTextOf } from '../src/web/for-you-privacy.js'

test('privacy copy names the title lookups while genre lookups are on', () => {
  assert.equal(privacyLookupTextOf({ genreLookup: true }), 'To find genres, Freetvarr sends show titles to TVmaze and Wikidata, and nothing else.')
})

test('privacy copy says genre lookups are off once they are off', () => {
  assert.equal(privacyLookupTextOf({ genreLookup: false }), 'Genre lookups on TVmaze and Wikidata are off.')
})

test('privacy copy assumes genre lookups are on by default', () => {
  assert.equal(privacyLookupTextOf(), privacyLookupTextOf({ genreLookup: true }))
})
