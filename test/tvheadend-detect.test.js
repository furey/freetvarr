import { test } from 'node:test'
import assert from 'node:assert/strict'

import { rankCandidates, detectServers } from '../src/tvheadend.js'

const iface = (address, internal = false) => [{ family: 'IPv4', address, internal }]

test('rankCandidates: browser-facing address comes first, then LAN, then fallbacks', () => {
  const urls = rankCandidates({
    hintAddress: '::ffff:192.168.1.5',
    interfaces: {
      lo: iface('127.0.0.1', true),
      en0: iface('192.168.1.5'),
      en1: iface('10.0.0.7'),
    },
  })
  assert.deepEqual(urls, [
    'http://192.168.1.5:9981',
    'http://10.0.0.7:9981',
    'http://tvheadend:9981',
    'http://host.docker.internal:9981',
    'http://127.0.0.1:9981',
  ])
})

test('rankCandidates: skips docker bridges, link-local, IPv6, and a loopback hint', () => {
  const urls = rankCandidates({
    hintAddress: '127.0.0.1',
    interfaces: {
      docker0: iface('172.17.0.1'),
      awdl0: iface('169.254.3.3'),
      en0: [{ family: 'IPv6', address: 'fe80::1', internal: false }, ...iface('192.168.0.2')],
    },
  })
  assert.deepEqual(urls.slice(0, 2), ['http://192.168.0.2:9981', 'http://tvheadend:9981'])
  assert.equal(urls.at(-1), 'http://127.0.0.1:9981')
})

test('rankCandidates: public addresses rank after private ones', () => {
  const urls = rankCandidates({
    interfaces: { a: iface('203.0.113.9'), b: iface('192.168.9.9') },
  })
  assert.deepEqual(urls.slice(0, 2), ['http://192.168.9.9:9981', 'http://203.0.113.9:9981'])
})

test('detectServers: TVH_URL short-circuits probing', async () => {
  const r = await detectServers({ env: { TVH_URL: 'http://tvh.lan:9981/' } })
  assert.equal(r.source, 'env')
  assert.deepEqual(r.candidates.map((c) => c.url), ['http://tvh.lan:9981'])
})
