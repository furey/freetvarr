import { test } from 'node:test'
import assert from 'node:assert/strict'

import { authorizationFor, createChallengeCache, parseChallenge } from '../src/http-auth.js'

const rfc2617Challenge =
  'Digest realm="testrealm@host.com", qop="auth,auth-int", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"'

test('parseChallenge: reads quoted and bare values', () => {
  assert.deepEqual(parseChallenge('Digest realm="tvheadend", qop=auth, nonce="a+b=", stale=FALSE'), {
    realm: 'tvheadend',
    qop: 'auth',
    nonce: 'a+b=',
    stale: 'FALSE',
  })
})

test('authorizationFor: matches the RFC 2617 digest example', () => {
  const header = authorizationFor({
    challenge: rfc2617Challenge,
    method: 'GET',
    uri: '/dir/index.html',
    username: 'Mufasa',
    password: 'Circle Of Life',
    cnonce: '0a4f113b',
  })
  assert.match(header, /^Digest /)
  assert.match(header, /response="6629fae49393a05397450978507c4ef1"/)
  assert.match(header, /opaque="5ccc069c403ebaf9f0171e9517f40e41"/)
  assert.match(header, /qop=auth, nc=00000001, cnonce="0a4f113b"/)
})

test('authorizationFor: answers a Basic challenge with Basic credentials', () => {
  const header = authorizationFor({
    challenge: 'Basic realm="tvheadend"',
    method: 'GET',
    uri: '/api/serverinfo',
    username: 'user',
    password: 'pass word',
  })
  assert.equal(header, `Basic ${Buffer.from('user:pass word').toString('base64')}`)
})

test('authorizationFor: ignores an unknown scheme', () => {
  assert.equal(authorizationFor({ challenge: 'Bearer realm="x"', method: 'GET', uri: '/', username: 'u', password: 'p' }), null)
})

test('authorizationFor: signs the given nonce count in hex', () => {
  const header = authorizationFor({
    challenge: rfc2617Challenge,
    method: 'GET',
    uri: '/dir/index.html',
    username: 'Mufasa',
    password: 'Circle Of Life',
    nonceCount: 26,
    cnonce: '0a4f113b',
  })
  assert.match(header, /nc=0000001a/)
  assert.doesNotMatch(header, /response="6629fae49393a05397450978507c4ef1"/)
})

test('createChallengeCache: counts each use of a remembered challenge', () => {
  const cache = createChallengeCache()
  assert.equal(cache.next('tvh'), null)
  cache.remember('tvh', rfc2617Challenge)
  assert.deepEqual(cache.next('tvh'), { challenge: rfc2617Challenge, nonceCount: 1 })
  assert.deepEqual(cache.next('tvh'), { challenge: rfc2617Challenge, nonceCount: 2 })
})

test('createChallengeCache: a fresh challenge restarts the count', () => {
  const cache = createChallengeCache()
  cache.remember('tvh', 'Digest nonce="a"')
  cache.next('tvh')
  cache.remember('tvh', 'Digest nonce="b"')
  assert.deepEqual(cache.next('tvh'), { challenge: 'Digest nonce="b"', nonceCount: 1 })
})

test('createChallengeCache: drops a challenge left idle past the limit', () => {
  let clock = 0
  const cache = createChallengeCache({ maxIdleMs: 1000, now: () => clock })
  cache.remember('tvh', rfc2617Challenge)
  clock = 900
  assert.equal(cache.next('tvh').nonceCount, 1)
  clock = 1800
  assert.equal(cache.next('tvh').nonceCount, 2)
  clock = 2801
  assert.equal(cache.next('tvh'), null)
})

test('createChallengeCache: forget clears a challenge', () => {
  const cache = createChallengeCache()
  cache.remember('tvh', rfc2617Challenge)
  cache.forget('tvh')
  assert.equal(cache.next('tvh'), null)
})
