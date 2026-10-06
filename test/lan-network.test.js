import { test } from 'node:test'
import assert from 'node:assert/strict'

import { withBrowserNetwork } from '../src/web/lan-network.js'

test('withBrowserNetwork: adds the browser network a Docker VM guess misses', () => {
  const prefixes = withBrowserNetwork({ prefixes: ['192.168.139.0/24', '127.0.0.0/8'], host: '192.168.86.246' })
  assert.deepEqual(prefixes, ['192.168.86.0/24', '192.168.139.0/24', '127.0.0.0/8'])
})

test('withBrowserNetwork: keeps the guess when it already covers the browser', () => {
  const prefixes = ['192.168.86.0/24', '127.0.0.0/8']
  assert.deepEqual(withBrowserNetwork({ prefixes, host: '192.168.86.254' }), prefixes)
})

test('withBrowserNetwork: ignores hostnames, loopback, and public addresses', () => {
  const prefixes = ['10.0.0.0/24']
  assert.deepEqual(withBrowserNetwork({ prefixes, host: 'freetvarr.lan' }), prefixes)
  assert.deepEqual(withBrowserNetwork({ prefixes, host: '127.0.0.1' }), prefixes)
  assert.deepEqual(withBrowserNetwork({ prefixes, host: '203.0.113.5' }), prefixes)
})
