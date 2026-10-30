import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createKnownTitles, createLookupGate, lookupAllowed, useLookupGate } from '../src/lookup-gate.js'

test('the lookup gate always allows known titles and spends a small hourly budget on unknown ones', async () => {
  const clock = { ms: 0 }
  const gate = createLookupGate({ isKnownTitle: async (key) => key === 'seinfeld', budget: 2, windowMs: 1000, now: () => clock.ms })
  for (let index = 0; index < 5; index += 1) assert.equal(await gate.allows('Seinfeld'), true)
  assert.equal(await gate.allows('Junk 1'), true)
  assert.equal(await gate.allows('Junk 2'), true)
  assert.equal(await gate.allows('Junk 3'), false)
  assert.equal(await gate.allows('Junk 1'), true)
  assert.equal(await gate.allows(''), false)
  clock.ms = 1001
  assert.equal(await gate.allows('Junk 3'), true)
})

test('createKnownTitles loads title keys once per ttl and matches by show title key', async () => {
  const clock = { ms: 0 }
  let loads = 0
  const isKnown = createKnownTitles({
    loadTitles: async () => { loads += 1; return ['The Block', 'Law & Order', null] },
    ttlMs: 100,
    now: () => clock.ms,
  })
  assert.equal(await isKnown('block'), true)
  assert.equal(await isKnown('law and order'), true)
  assert.equal(await isKnown('seinfeld'), false)
  assert.equal(loads, 1)
  clock.ms = 150
  await isKnown('block')
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(loads, 2)
})

test('lookupAllowed uses the shared gate and refuses when the gate throws', async () => {
  useLookupGate({ allows: async () => { throw new Error('db gone') } })
  assert.equal(await lookupAllowed('Seinfeld'), false)
  useLookupGate(null)
  assert.equal(await lookupAllowed('Seinfeld'), true)
})
