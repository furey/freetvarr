import { test } from 'node:test'
import assert from 'node:assert/strict'

import { isTrustworthyRequest, trustworthyOriginHeaders } from '../src/trustworthy-origin-headers.js'

const headersFor = (req) => {
  const headers = {}
  let nextCalled = false
  trustworthyOriginHeaders()(req, { setHeader: (name, value) => { headers[name] = value } }, () => { nextCalled = true })
  assert.equal(nextCalled, true)
  return headers
}

test('trustworthy origins: HTTPS and loopback hosts are trustworthy; a plain HTTP LAN host is not', () => {
  assert.equal(isTrustworthyRequest({ secure: true, hostname: 'nas' }), true)
  for (const hostname of ['localhost', 'app.localhost', '127.0.0.1', '[::1]', '::1']) {
    assert.equal(isTrustworthyRequest({ secure: false, hostname }), true, hostname)
  }
  for (const hostname of ['nas', '192.168.1.10', 'tv.example.com', 'localhost.example.com', '']) {
    assert.equal(isTrustworthyRequest({ secure: false, hostname }), false, hostname)
  }
})

test('trustworthy origins: HTTPS gets the opener policy and origin keying together', () => {
  assert.deepEqual(headersFor({ secure: true, hostname: 'tv.example.com' }), {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Origin-Agent-Cluster': '?1',
  })
})

test('trustworthy origins: plain HTTP on the LAN gets neither header, so the browser logs no warning', () => {
  assert.deepEqual(headersFor({ secure: false, hostname: '192.168.1.10' }), {})
})
