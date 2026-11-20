import { test } from 'node:test'
import assert from 'node:assert/strict'

import { AIRING_MEMORY_ENTRIES, createAiringMemory, forgetAiringsOnArtChanges } from '../src/airing-memory.js'
import { createArtFeed } from '../src/art-feed.js'

const answerOf = (origin) => ({ depth: 1, result: { stage: 'own', origin, transform: 'none', pending: false } })

const rememberAiring = (memory, { eventId, showKey = 'bluey' }) =>
  memory.remember({ key: `event|${eventId}`, fingerprint: `f${eventId}`, showKey, answer: answerOf(`https://img/${eventId}.jpg`) })

test('airing memory holds at most its entry limit and drops the least recently used airing first', () => {
  const memory = createAiringMemory({ maxEntries: 3 })
  for (const eventId of [1, 2, 3]) rememberAiring(memory, { eventId })
  assert.equal(memory.recall('event|1').answer.result.origin, 'https://img/1.jpg')
  rememberAiring(memory, { eventId: 4 })
  assert.equal(memory.size(), 3)
  assert.equal(memory.recall('event|2'), null)
  assert.deepEqual(['event|1', 'event|3', 'event|4'].map((key) => Boolean(memory.recall(key))), [true, true, true])
})

test('airing memory keeps a full week of guide airings by default', () => {
  assert.ok(AIRING_MEMORY_ENTRIES >= 2 * 8446)
})

test('airing memory gives back the fingerprint it stored, so a caller can reject an airing whose sources changed', () => {
  const memory = createAiringMemory()
  rememberAiring(memory, { eventId: 7 })
  assert.equal(memory.recall('event|7').fingerprint, 'f7')
  memory.remember({ key: 'event|7', fingerprint: 'g7', showKey: 'bluey', answer: answerOf('https://img/new.jpg') })
  assert.deepEqual(memory.recall('event|7'), { fingerprint: 'g7', answer: answerOf('https://img/new.jpg') })
  assert.equal(memory.size(), 1)
})

test('airing memory forgets every airing of a show at once, and only that show', () => {
  const memory = createAiringMemory()
  rememberAiring(memory, { eventId: 1, showKey: 'bluey' })
  rememberAiring(memory, { eventId: 2, showKey: 'bluey' })
  rememberAiring(memory, { eventId: 3, showKey: 'gruen' })
  memory.forgetShows(['bluey'])
  assert.equal(memory.recall('event|1'), null)
  assert.equal(memory.recall('event|2'), null)
  assert.ok(memory.recall('event|3'))
})

test('a new picture stamp on the art stream forgets that show\'s airings; a stream reset forgets them all', () => {
  const feed = createArtFeed({ size: 4 })
  const memory = createAiringMemory()
  forgetAiringsOnArtChanges({ feed, memory })
  rememberAiring(memory, { eventId: 1, showKey: 'bluey' })
  rememberAiring(memory, { eventId: 2, showKey: 'gruen' })
  feed.publish({ key: 'bluey', kind: 'programme', stamp: 'abc' })
  assert.equal(memory.recall('event|1'), null)
  assert.ok(memory.recall('event|2'))
  rememberAiring(memory, { eventId: 3, showKey: 'bluey' })
  feed.reset()
  assert.equal(memory.size(), 0)
})
