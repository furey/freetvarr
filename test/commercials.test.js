import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  parseEdl,
  computeKeepSegments,
  cutVerificationTolerance,
  comskipScanTimeout,
  resolveComskipIni,
  shouldQueueAutoDelete,
  expectedScanMs,
  computeScanPercent,
} from '../src/commercials.js'

test('parseEdl: happy path with tab-separated action 0 rows', () => {
  const edl = '0.00\t120.50\t0\n900.25\t1080.00\t0\n'
  assert.deepEqual(parseEdl(edl), [
    { start: 0, end: 120.5, action: 0 },
    { start: 900.25, end: 1080, action: 0 },
  ])
})

test('parseEdl: tolerates blank lines and space-separated columns', () => {
  const edl = '\n10 20 0\n\n  30   40   3  \n\n'
  assert.deepEqual(parseEdl(edl), [
    { start: 10, end: 20, action: 0 },
    { start: 30, end: 40, action: 3 },
  ])
})

test('parseEdl: drops malformed rows', () => {
  const edl = 'garbage\n10 20\n10 abc 0\n10 20 0\n'
  assert.deepEqual(parseEdl(edl), [{ start: 10, end: 20, action: 0 }])
})

test('parseEdl: keeps only actions 0 and 3', () => {
  const edl = '10 20 0\n30 40 1\n50 60 2\n70 80 3\n'
  assert.deepEqual(parseEdl(edl).map((b) => b.action), [0, 3])
})

test('parseEdl: drops rows with negative start or end <= start', () => {
  const edl = '-5 10 0\n20 20 0\n30 25 0\n40 50 0\n'
  assert.deepEqual(parseEdl(edl), [{ start: 40, end: 50, action: 0 }])
})

test('parseEdl: empty or null input returns empty list', () => {
  assert.deepEqual(parseEdl(''), [])
  assert.deepEqual(parseEdl(null), [])
})

test('computeKeepSegments: no breaks returns single full segment', () => {
  assert.deepEqual(
    computeKeepSegments({ breaks: [], duration: 3600 }),
    [{ start: 0, end: 3600 }],
  )
})

test('computeKeepSegments: mid-file break splits into two keeps', () => {
  assert.deepEqual(
    computeKeepSegments({ breaks: [{ start: 600, end: 780 }], duration: 3600 }),
    [{ start: 0, end: 600 }, { start: 780, end: 3600 }],
  )
})

test('computeKeepSegments: break at start omits leading keep segment', () => {
  assert.deepEqual(
    computeKeepSegments({ breaks: [{ start: 0, end: 90 }], duration: 3600 }),
    [{ start: 90, end: 3600 }],
  )
})

test('computeKeepSegments: break at end omits trailing keep segment', () => {
  assert.deepEqual(
    computeKeepSegments({ breaks: [{ start: 3500, end: 3600 }], duration: 3600 }),
    [{ start: 0, end: 3500 }],
  )
})

test('computeKeepSegments: overlapping breaks merge', () => {
  assert.deepEqual(
    computeKeepSegments({
      breaks: [{ start: 600, end: 800 }, { start: 700, end: 900 }],
      duration: 3600,
    }),
    [{ start: 0, end: 600 }, { start: 900, end: 3600 }],
  )
})

test('computeKeepSegments: adjacent breaks merge without zero-length keep', () => {
  assert.deepEqual(
    computeKeepSegments({
      breaks: [{ start: 600, end: 700 }, { start: 700, end: 800 }],
      duration: 3600,
    }),
    [{ start: 0, end: 600 }, { start: 800, end: 3600 }],
  )
})

test('computeKeepSegments: unsorted breaks are handled', () => {
  assert.deepEqual(
    computeKeepSegments({
      breaks: [{ start: 2000, end: 2100 }, { start: 600, end: 700 }],
      duration: 3600,
    }),
    [
      { start: 0, end: 600 },
      { start: 700, end: 2000 },
      { start: 2100, end: 3600 },
    ],
  )
})

test('computeKeepSegments: break past duration is clamped', () => {
  assert.deepEqual(
    computeKeepSegments({ breaks: [{ start: 3500, end: 9999 }], duration: 3600 }),
    [{ start: 0, end: 3500 }],
  )
})

test('computeKeepSegments: break with negative start is clamped', () => {
  assert.deepEqual(
    computeKeepSegments({ breaks: [{ start: -10, end: 90 }], duration: 3600 }),
    [{ start: 90, end: 3600 }],
  )
})

test('computeKeepSegments: breaks covering entire file return empty keep list', () => {
  assert.deepEqual(
    computeKeepSegments({ breaks: [{ start: 0, end: 3600 }], duration: 3600 }),
    [],
  )
})

test('computeKeepSegments: break entirely outside duration is dropped', () => {
  assert.deepEqual(
    computeKeepSegments({ breaks: [{ start: 4000, end: 4200 }], duration: 3600 }),
    [{ start: 0, end: 3600 }],
  )
})

test('cutVerificationTolerance: floor of 5 seconds', () => {
  assert.equal(cutVerificationTolerance(0), 5)
  assert.equal(cutVerificationTolerance(1), 5)
  assert.equal(cutVerificationTolerance(2), 5)
})

test('cutVerificationTolerance: scales at 2s per boundary above the floor', () => {
  assert.equal(cutVerificationTolerance(3), 6)
  assert.equal(cutVerificationTolerance(4), 8)
  assert.equal(cutVerificationTolerance(10), 20)
})

test('comskipScanTimeout: floors at 60 minutes for short recordings', () => {
  assert.equal(comskipScanTimeout({ duration: 0 }), 60 * 60 * 1000)
  assert.equal(comskipScanTimeout({ duration: 1200 }), 60 * 60 * 1000)
  assert.equal(comskipScanTimeout({ duration: 2400 }), 60 * 60 * 1000)
})

test('comskipScanTimeout: scales at 1.5x realtime between the bounds', () => {
  assert.equal(comskipScanTimeout({ duration: 3600 }), 3600 * 1500)
  assert.equal(comskipScanTimeout({ duration: 4431 }), 4431 * 1500)
})

test('comskipScanTimeout: caps at 6 hours for very long recordings', () => {
  assert.equal(comskipScanTimeout({ duration: 14511 }), 6 * 60 * 60 * 1000)
  assert.equal(comskipScanTimeout({ duration: 99999 }), 6 * 60 * 60 * 1000)
})

test('expectedScanMs: scales duration by the realtime factor and floors', () => {
  assert.equal(expectedScanMs({ durationSeconds: 0 }), 0)
  assert.equal(expectedScanMs({ durationSeconds: 4500 }), 4500 * 0.5 * 1000)
  assert.equal(expectedScanMs({ durationSeconds: 4431 }), Math.floor(4431 * 0.5 * 1000))
})

test('computeScanPercent: 0 at start, 50 at midpoint', () => {
  assert.equal(computeScanPercent({ elapsedMs: 0, expectedScanMs: 1_000_000 }), 0)
  assert.equal(computeScanPercent({ elapsedMs: 500_000, expectedScanMs: 1_000_000 }), 50)
})

test('computeScanPercent: caps at 99 when the scan over-runs the estimate', () => {
  assert.equal(computeScanPercent({ elapsedMs: 1_000_000, expectedScanMs: 1_000_000 }), 99)
  assert.equal(computeScanPercent({ elapsedMs: 5_000_000, expectedScanMs: 1_000_000 }), 99)
})

test('computeScanPercent: null when the expected duration is unknown', () => {
  assert.equal(computeScanPercent({ elapsedMs: 5000, expectedScanMs: 0 }), null)
  assert.equal(computeScanPercent({ elapsedMs: 5000, expectedScanMs: -1 }), null)
})

test('resolveComskipIni: config override wins', () => {
  const p = resolveComskipIni({ configIniExists: true })
  assert.notEqual(p.includes('assets'), true)
  assert.match(p, /comskip\.ini$/)
})

test('resolveComskipIni: falls back to bundled default', () => {
  const p = resolveComskipIni({ configIniExists: false })
  assert.match(p, /assets[/\\]comskip\.ini$/)
})

test('resolveComskipIni: override and default are different paths', () => {
  assert.notEqual(
    resolveComskipIni({ configIniExists: true }),
    resolveComskipIni({ configIniExists: false }),
  )
})

test('shouldQueueAutoDelete: non-cut modes always allow delete', () => {
  for (const ad_removal of ['off', 'detect']) {
    for (const status of ['cut', 'no_breaks', 'detected', 'cut_failed', 'detect_failed', undefined]) {
      const adResult = status === undefined ? null : { status }
      assert.equal(
        shouldQueueAutoDelete({ show: { ad_removal }, adResult }),
        true,
        `${ad_removal} × ${status}`,
      )
    }
  }
})

test('shouldQueueAutoDelete: cut mode allows delete only on cut or no_breaks', () => {
  const show = { ad_removal: 'cut' }
  assert.equal(shouldQueueAutoDelete({ show, adResult: { status: 'cut' } }), true)
  assert.equal(shouldQueueAutoDelete({ show, adResult: { status: 'no_breaks' } }), true)
  assert.equal(shouldQueueAutoDelete({ show, adResult: { status: 'detected' } }), false)
  assert.equal(shouldQueueAutoDelete({ show, adResult: { status: 'cut_failed' } }), false)
  assert.equal(shouldQueueAutoDelete({ show, adResult: { status: 'detect_failed' } }), false)
  assert.equal(shouldQueueAutoDelete({ show, adResult: null }), false)
})
