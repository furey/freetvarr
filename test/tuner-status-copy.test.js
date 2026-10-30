import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  capacityText,
  isOverMeasured,
  measuredText,
  streamChoicesOf,
  streamsHintOf,
  tunerExplainerOf,
} from '../src/web/tuner-status.js'

const MEASURED = { encoder: 'vaapi', speed: 3.6, estimated: 2, measuredAt: 1000 }
const clockText = () => '20 Oct 5:55pm'

test('measuredText: one message for a choice within the measurement', () => {
  assert.equal(
    measuredText({ benchmark: MEASURED, chosen: 2, clockText }),
    'Measured: this NAS can convert 2 live streams at once (hardware, measured 20 Oct 5:55pm).',
  )
  assert.equal(
    measuredText({ benchmark: { ...MEASURED, encoder: 'software', estimated: 1 }, chosen: 1, clockText }),
    'Measured: this NAS can convert 1 live stream at once (software, measured 20 Oct 5:55pm).',
  )
})

test('measuredText: a choice above the measurement says what may stutter', () => {
  assert.equal(
    measuredText({ benchmark: { ...MEASURED, estimated: 1 }, chosen: 2, clockText }),
    'You chose 2. The last measurement managed 1 smoothly, so the second picture may stutter. Measure again.',
  )
  assert.equal(
    measuredText({ benchmark: { ...MEASURED, estimated: 0 }, chosen: 1, clockText }),
    'You chose 1. The last measurement could not convert even 1 smoothly, so the picture may stutter. Measure again.',
  )
})

test('measuredText: unmeasured and pass-through', () => {
  assert.equal(measuredText({ benchmark: null, chosen: 1, clockText }), 'Not measured yet.')
  assert.equal(measuredText({ benchmark: { encoder: 'copy', estimated: 4 }, chosen: 2, clockText }), 'This NAS sends live TV without converting it.')
})

test('isOverMeasured and streamChoicesOf: mark only choices above the measurement', () => {
  assert.equal(isOverMeasured({ benchmark: { ...MEASURED, estimated: 1 }, chosen: 2 }), true)
  assert.equal(isOverMeasured({ benchmark: MEASURED, chosen: 2 }), false)
  assert.equal(isOverMeasured({ benchmark: { encoder: 'copy', estimated: 0 }, chosen: 2 }), false)
  assert.deepEqual(
    streamChoicesOf({ choices: [1, 2], benchmark: { ...MEASURED, estimated: 0 } }).map((c) => c.tooMany),
    [true, true],
  )
})

test('capacityText: agrees with the settings message', () => {
  const streams = { max: 2, inUse: 0, estimated: 2, encoder: 'vaapi', speed: 3.6, measuredAt: 1000 }
  assert.equal(capacityText(streams), 'Measured: this NAS can convert 2 live streams at once (hardware).')
  assert.equal(
    capacityText({ ...streams, max: 1, estimated: 4 }),
    'Measured: this NAS can convert 4 live streams at once (hardware). Freetvarr plays 1 live stream at a time.',
  )
  assert.equal(
    capacityText({ ...streams, estimated: 1 }),
    'You chose 2. The last measurement managed 1 smoothly, so the second picture may stutter.',
  )
  assert.equal(capacityText({ max: 2, encoder: 'vaapi', estimated: null }), 'Freetvarr plays up to 2 at once.')
  assert.equal(capacityText({ max: 2, encoder: 'copy', estimated: 4 }), 'This NAS sends live TV without converting it. Freetvarr plays up to 2 at once.')
})

test('tunerExplainerOf: ends with the capacity message', () => {
  const lines = tunerExplainerOf({ total: 2, muxSharing: false, streams: { max: 2, encoder: 'vaapi', estimated: 4 } })
  assert.equal(lines.at(-1), 'Measured: this NAS can convert 4 live streams at once (hardware). Freetvarr plays up to 2 at once.')
})

test('streamsHintOf: explains the phone cap and names a tuner count below 4', () => {
  assert.equal(streamsHintOf({ tunerCount: 4 }), 'Multiview shows this many pictures on a tablet or computer, and up to 2 on a phone.')
  assert.match(streamsHintOf({ tunerCount: 3 }), /Choices stop at your 3 tuners\.$/)
  assert.match(streamsHintOf({ tunerCount: 1 }), /your 1 tuner\.$/)
  assert.doesNotMatch(streamsHintOf({ tunerCount: null }), /Choices/)
})

test('streamChoicesOf: marks choices above the measurement', () => {
  const choices = streamChoicesOf({ choices: [1, 2, 3, 4], benchmark: { ...MEASURED, estimated: 3 } })
  assert.deepEqual(choices.map((c) => c.tooMany), [false, false, false, true])
})
