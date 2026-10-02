import { test } from 'node:test'
import assert from 'node:assert/strict'

import { detectLiveEncoder } from '../src/live-encoder.js'

const openable = async () => null
const passes = async () => null

test('detectLiveEncoder: auto picks low-power VAAPI when the test encode passes', async () => {
  const encoder = await detectLiveEncoder({ canOpen: openable, probe: passes })
  assert.equal(encoder.kind, 'vaapi')
  assert.equal(encoder.lowPower, true)
})

test('detectLiveEncoder: falls back to full-power VAAPI when low-power fails', async () => {
  const probe = async ({ lowPower }) => (lowPower ? 'no low-power entrypoint' : null)
  const encoder = await detectLiveEncoder({ canOpen: openable, probe })
  assert.deepEqual({ kind: encoder.kind, lowPower: encoder.lowPower }, { kind: 'vaapi', lowPower: false })
})

test('detectLiveEncoder: falls back to software when every test encode fails', async () => {
  const encoder = await detectLiveEncoder({ canOpen: openable, probe: async () => 'driver missing' })
  assert.equal(encoder.kind, 'software')
  assert.match(encoder.reason, /driver missing/)
})

test('detectLiveEncoder: falls back to software when the device cannot be opened', async () => {
  let probed = false
  const encoder = await detectLiveEncoder({
    canOpen: async () => 'not found; pass /dev/dri into the container',
    probe: async () => { probed = true },
  })
  assert.equal(encoder.kind, 'software')
  assert.match(encoder.reason, /pass \/dev\/dri/)
  assert.equal(probed, false)
})

test('detectLiveEncoder: copy and software modes skip the hardware check', async () => {
  const fail = async () => { throw new Error('must not run') }
  assert.equal((await detectLiveEncoder({ mode: 'copy', canOpen: fail, probe: fail })).kind, 'copy')
  assert.equal((await detectLiveEncoder({ mode: 'software', canOpen: fail, probe: fail })).kind, 'software')
})

test('detectLiveEncoder: an unknown mode falls back to software and names the valid modes', async () => {
  const encoder = await detectLiveEncoder({ mode: 'gpu' })
  assert.equal(encoder.kind, 'software')
  assert.match(encoder.reason, /auto, hardware, software, copy/)
})
