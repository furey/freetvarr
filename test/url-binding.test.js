import { test } from 'node:test'
import assert from 'node:assert/strict'

import { hostOf, isThisMachineHost, isThisMachineUrl, portOf, sameOrigin } from '../src/url-binding.js'

const interfaces = {
  lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
  eth0: [
    { address: '192.168.1.10', family: 'IPv4', internal: false },
    { address: 'fe80::1', family: 'IPv6', internal: false },
  ],
}

test('sameOrigin matches scheme, host, and port and ignores path and trailing slash', () => {
  assert.equal(sameOrigin('http://nas:9981', 'http://nas:9981/'), true)
  assert.equal(sameOrigin('http://NAS:9981/tvh', 'http://nas:9981'), true)
  assert.equal(sameOrigin('http://nas', 'http://nas:80'), true)
  assert.equal(sameOrigin('https://nas', 'https://nas:443/'), true)
})

test('sameOrigin rejects a different scheme, host, or port', () => {
  assert.equal(sameOrigin('http://nas:9981', 'https://nas:9981'), false)
  assert.equal(sameOrigin('http://nas:9981', 'http://other:9981'), false)
  assert.equal(sameOrigin('http://nas:9981', 'http://nas:9982'), false)
})

test('sameOrigin rejects empty, malformed, and non-http values', () => {
  assert.equal(sameOrigin('', ''), false)
  assert.equal(sameOrigin('http://nas:9981', ''), false)
  assert.equal(sameOrigin(null, 'http://nas:9981'), false)
  assert.equal(sameOrigin('not a url', 'not a url'), false)
  assert.equal(sameOrigin('file:///etc', 'file:///etc'), false)
})

test('isThisMachineHost accepts loopback, the Docker host alias, and local interface addresses', () => {
  for (const host of ['localhost', '127.0.0.1', '127.0.1.1', '::1', '[::1]', 'host.docker.internal', '192.168.1.10', 'fe80::1']) {
    assert.equal(isThisMachineHost(host, { interfaces }), true, host)
  }
})

test('isThisMachineHost rejects other hosts', () => {
  for (const host of ['192.168.1.11', 'example.com', 'plex', '', null]) {
    assert.equal(isThisMachineHost(host, { interfaces }), false, String(host))
  }
})

test('isThisMachineUrl reads the host from a URL', () => {
  assert.equal(isThisMachineUrl('http://127.0.0.1:32400', { interfaces }), true)
  assert.equal(isThisMachineUrl('http://192.168.1.10:32400/', { interfaces }), true)
  assert.equal(isThisMachineUrl('http://192.168.1.99:32400', { interfaces }), false)
  assert.equal(isThisMachineUrl('garbage', { interfaces }), false)
})

test('hostOf and portOf read a URL with default ports filled in', () => {
  assert.equal(hostOf('http://Sonarr:8989/'), 'sonarr')
  assert.equal(portOf('http://sonarr:8989'), '8989')
  assert.equal(portOf('http://sonarr'), '80')
  assert.equal(portOf('https://sonarr'), '443')
  assert.equal(hostOf('nope'), '')
  assert.equal(portOf('nope'), '')
})
