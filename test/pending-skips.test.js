import { test } from 'node:test'
import assert from 'node:assert/strict'

import { entriesToSkip, matchesPendingSkip, splitPendingSkips } from '../src/pending-skips.js'

const START = Date.UTC(2026, 9, 28, 1, 0, 0)

const skip = { programId: '476702', channelId: 'nine', name: '1 Euro House', startDate: START, endDate: START + 3_600_000 }

const entry = (extra = {}) => ({
  uuid: 'u1',
  programId: '476702',
  channelId: 'nine',
  name: '1 Euro House',
  startDate: START,
  enabled: true,
  schedStatus: 'scheduled',
  ...extra,
})

test('matchesPendingSkip: matches on channel and start plus programme id or title', () => {
  assert.equal(matchesPendingSkip({ skip, entry: entry() }), true)
  assert.equal(matchesPendingSkip({ skip, entry: entry({ programId: '999' }) }), true)
  assert.equal(matchesPendingSkip({ skip, entry: entry({ name: 'Other' }) }), true)
  assert.equal(matchesPendingSkip({ skip, entry: entry({ programId: '999', name: 'Other' }) }), false)
  assert.equal(matchesPendingSkip({ skip, entry: entry({ channelId: 'seven' }) }), false)
  assert.equal(matchesPendingSkip({ skip, entry: entry({ programId: '999', startDate: START + 10 * 60_000 }) }), false)
})

test('matchesPendingSkip: the same event still matches after the guide moves its start', () => {
  assert.equal(matchesPendingSkip({ skip, entry: entry({ startDate: START + 15 * 60_000 }) }), true)
  assert.equal(matchesPendingSkip({ skip, entry: entry({ programId: '999', startDate: START + 60_000 }) }), true)
  assert.equal(matchesPendingSkip({ skip, entry: entry({ programId: '999', channelId: 'seven', startDate: START + 60_000 }) }), false)
})

test('splitPendingSkips: a skip holds the nearest airing of that title, not the next one', () => {
  const near = { ...entry({ programId: '1', startDate: START + 60_000 }), source: 'series' }
  const far = { ...entry({ programId: '2', startDate: START + 90_000 }), source: 'series' }
  const titleSkip = { ...skip, programId: 'gone' }
  const { skipped } = splitPendingSkips({ upcoming: [far, near], pendingSkips: [titleSkip] })
  assert.deepEqual(skipped.map((e) => e.programId), ['1'])
})

test('entriesToSkip: picks only enabled entries still waiting to record', () => {
  const entries = [
    entry(),
    entry({ uuid: 'u2', enabled: false }),
    entry({ uuid: 'u3', schedStatus: 'recording' }),
    entry({ uuid: 'u4', channelId: 'seven' }),
  ]
  assert.deepEqual(entriesToSkip({ entries, pendingSkips: [skip] }).map(({ entry: e }) => e.uuid), ['u1'])
  assert.deepEqual(entriesToSkip({ entries, pendingSkips: [] }), [])
})

test('splitPendingSkips: moves a skipped expected episode out of upcoming', () => {
  const expected = entry({ source: 'series' })
  const timer = entry({ source: 'timer', programId: '1', channelId: 'ten', name: 'Big Brother' })
  const { upcoming, skipped } = splitPendingSkips({ upcoming: [timer, expected], pendingSkips: [skip] })
  assert.deepEqual(upcoming, [timer])
  assert.deepEqual(skipped, [{ ...expected, skipped: true }])
})
