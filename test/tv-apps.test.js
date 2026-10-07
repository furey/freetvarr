import { test } from 'node:test'
import assert from 'node:assert/strict'

import { tvAppsAddresses, tvAppsHost } from '../src/web/tv-apps.js'

test('tvAppsHost: keeps a LAN address TV apps can reach', () => {
  assert.equal(tvAppsHost({ tvhUrl: 'http://192.168.86.254:9981', browserHost: 'freetvarr.lan' }), '192.168.86.254')
})

test('tvAppsHost: swaps an address only Freetvarr can reach for the browser host', () => {
  for (const tvhUrl of ['http://127.0.0.1:9981', 'http://localhost:9981', 'http://tvheadend:9981', 'http://host.docker.internal:9981', 'http://[::1]:9981']) {
    assert.equal(tvAppsHost({ tvhUrl, browserHost: '192.168.86.254' }), '192.168.86.254', tvhUrl)
  }
})

test('tvAppsHost: leaves the host blank when the browser is on the same computer', () => {
  assert.equal(tvAppsHost({ tvhUrl: 'http://127.0.0.1:9981', browserHost: 'localhost' }), '')
})

test('tvAppsHost: gives nothing without a TVHeadend URL', () => {
  assert.equal(tvAppsHost({ tvhUrl: '', browserHost: '192.168.86.254' }), '')
})

test('tvAppsAddresses: builds the playlist, guide, and Kodi details', () => {
  const addresses = tvAppsAddresses({ tvhUrl: 'http://127.0.0.1:9981/', host: '192.168.86.254', authCode: 'P.a+b' })
  assert.deepEqual(addresses, {
    playlist: 'http://192.168.86.254:9981/playlist/auth/channels.m3u?auth=P.a%2Bb',
    guide: 'http://192.168.86.254:9981/xmltv/channels?auth=P.a%2Bb',
    host: '192.168.86.254',
    httpPort: '9981',
    htspPort: '9982',
  })
})

test('tvAppsAddresses: keeps a TVHeadend web root', () => {
  const addresses = tvAppsAddresses({ tvhUrl: 'http://nas.lan:9981/tvh', host: 'nas.lan', authCode: 'c' })
  assert.equal(addresses.playlist, 'http://nas.lan:9981/tvh/playlist/auth/channels.m3u?auth=c')
})

test('tvAppsAddresses: gives nothing until there is a host and a code', () => {
  assert.equal(tvAppsAddresses({ tvhUrl: 'http://nas.lan:9981', host: ' ', authCode: 'c' }), null)
  assert.equal(tvAppsAddresses({ tvhUrl: 'http://nas.lan:9981', host: 'nas.lan', authCode: '' }), null)
})
