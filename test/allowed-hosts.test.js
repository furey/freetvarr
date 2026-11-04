import { test } from 'node:test'
import assert from 'node:assert/strict'

import { allowedHostRowsOf, draftHostOf } from '../src/web/allowed-hosts.js'

test('allowedHostRowsOf: saved names first, then .env names that are not saved too', () => {
  assert.deepEqual(allowedHostRowsOf({ hosts: ['a.example.com', 'b.example.com'], env_hosts: ['b.example.com', 'c.example.com'] }), [
    { name: 'a.example.com', fromEnv: false },
    { name: 'b.example.com', fromEnv: false },
    { name: 'c.example.com', fromEnv: true },
  ])
  assert.deepEqual(allowedHostRowsOf(null), [])
})

test('draftHostOf: pre-fills the name in the address bar only when Freetvarr does not know it', () => {
  assert.equal(draftHostOf({ current: { name: 'tv.example.com', allowed: false } }), 'tv.example.com')
  assert.equal(draftHostOf({ current: { name: '192.168.1.10', allowed: true } }), '')
  assert.equal(draftHostOf(null), '')
})
