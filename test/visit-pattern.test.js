import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createVisitPattern, decayedBinsOf, hourOfWeekOf, isVisitRequest } from '../src/visit-pattern.js'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const patternWith = ({ clock, saved = null, writes = [] }) => createVisitPattern({
  load: async () => saved,
  save: async (text) => { writes.push(text) },
  now: () => clock.ms,
})

const settle = () => new Promise((resolve) => setImmediate(resolve))

test('isVisitRequest: counts UI reads, not pictures, streams, health, the Doctor, or writes', () => {
  assert.equal(isVisitRequest({ method: 'GET', path: '/api/library/shows' }), true)
  assert.equal(isVisitRequest({ method: 'GET', path: '/api/epg/guide' }), true)
  assert.equal(isVisitRequest({ method: 'GET', path: '/api/epg/image/42' }), false)
  assert.equal(isVisitRequest({ method: 'GET', path: '/api/epg/show-image' }), false)
  assert.equal(isVisitRequest({ method: 'GET', path: '/api/recordings/7/image' }), false)
  assert.equal(isVisitRequest({ method: 'GET', path: '/api/library/shows/abc/art-pool' }), false)
  assert.equal(isVisitRequest({ method: 'GET', path: '/api/activity/stream' }), false)
  assert.equal(isVisitRequest({ method: 'GET', path: '/api/health-summary' }), false)
  assert.equal(isVisitRequest({ method: 'GET', path: '/api/doctor' }), false)
  assert.equal(isVisitRequest({ method: 'POST', path: '/api/epg/record' }), false)
})

test('noteRequest: a visit is the first UI read after 20 minutes idle', async () => {
  const clock = { ms: new Date(2026, 10, 9, 19, 5).getTime() }
  const writes = []
  const visits = patternWith({ clock, writes })
  assert.equal(visits.noteRequest({ method: 'GET', path: '/api/home/hero' }), true)
  clock.ms += 5 * MINUTE
  assert.equal(visits.noteRequest({ method: 'GET', path: '/api/library/shows' }), false)
  clock.ms += 19 * MINUTE
  assert.equal(visits.noteRequest({ method: 'GET', path: '/api/library/shows' }), false)
  clock.ms += 15 * MINUTE
  assert.equal(visits.noteRequest({ method: 'GET', path: '/api/epg/image/1' }), false)
  clock.ms += 10 * MINUTE
  assert.equal(visits.noteRequest({ method: 'GET', path: '/api/epg/guide' }), true)
  await settle()
  assert.equal(writes.length, 2)
  assert.equal(JSON.parse(writes.at(-1)).visits, 2)
})

test('nextWindowAt: warms 45 minutes before an hour with a recent visit, a week later', async () => {
  const visitAt = new Date(2026, 10, 9, 19, 10).getTime()
  const clock = { ms: visitAt }
  const visits = patternWith({ clock })
  visits.noteRequest({ method: 'GET', path: '/api/home/hero' })
  await settle()
  clock.ms = visitAt + DAY
  assert.equal(visits.nextWindowAt(), new Date(2026, 10, 16, 18, 15).getTime())
  assert.equal(hourOfWeekOf(new Date(2026, 10, 16, 19, 0).getTime()), hourOfWeekOf(visitAt))
})

test('nextWindowAt: one visit decays below the threshold after the 14-day half-life', async () => {
  const visitAt = new Date(2026, 10, 9, 19, 10).getTime()
  const clock = { ms: visitAt }
  const visits = patternWith({ clock })
  visits.noteRequest({ method: 'GET', path: '/api/home/hero' })
  await settle()
  clock.ms = visitAt + 13 * DAY
  assert.notEqual(visits.nextWindowAt(), null)
  clock.ms = visitAt + 15 * DAY
  assert.equal(visits.nextWindowAt(), null)
})

test('decayedBinsOf halves every weight after one half-life', () => {
  assert.deepEqual(decayedBinsOf({ bins: [4, 2, 0], fromMs: 0, toMs: 14 * DAY, halfLifeMs: 14 * DAY }), [2, 1, 0])
  assert.deepEqual(decayedBinsOf({ bins: [4], fromMs: 10, toMs: 5, halfLifeMs: DAY }), [4])
})

test('modeAt: quiet after 3 days without a visit, dormant after 14, and the next visit resets it', async () => {
  const start = new Date(2026, 10, 1, 20, 0).getTime()
  const clock = { ms: start }
  const visits = patternWith({ clock })
  assert.equal(visits.modeAt(), 'active')
  visits.noteRequest({ method: 'GET', path: '/api/home/hero' })
  await settle()
  clock.ms = start + 2 * DAY
  assert.equal(visits.modeAt(), 'active')
  clock.ms = start + 3 * DAY
  assert.equal(visits.modeAt(), 'quiet')
  clock.ms = start + 14 * DAY
  assert.equal(visits.modeAt(), 'dormant')
  visits.noteRequest({ method: 'GET', path: '/api/home/hero' })
  await settle()
  assert.equal(visits.modeAt(), 'active')
})

test('ready: loads the saved pattern and ignores a damaged one', async () => {
  const lastVisitAt = new Date(2026, 10, 1, 20, 0).getTime()
  const bins = Array(168).fill(0)
  bins[hourOfWeekOf(lastVisitAt)] = 3
  const clock = { ms: lastVisitAt + 4 * DAY }
  const visits = patternWith({ clock, saved: JSON.stringify({ bins, decayedAt: lastVisitAt, lastVisitAt, visits: 3 }) })
  await visits.ready()
  assert.equal(visits.modeAt(), 'quiet')
  assert.equal(visits.nextWindowAt(), new Date(2026, 10, 8, 19, 15).getTime())
  const damaged = patternWith({ clock, saved: '{"bins":[1,2]' })
  await damaged.ready()
  assert.equal(damaged.modeAt(), 'active')
  assert.equal(damaged.nextWindowAt(), null)
})
