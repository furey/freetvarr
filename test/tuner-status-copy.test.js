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

const NO_PLACEHOLDER = /undefined|null|NaN|\[object/

test('measuredText: one message for a choice within the measurement', () => {
  const hardware = measuredText({ benchmark: MEASURED, chosen: 2, clockText })
  assert.match(hardware, /\b2 live streams\b/)
  assert.match(hardware, /hardware/)
  assert.ok(hardware.includes('20 Oct 5:55pm'))
  assert.doesNotMatch(hardware, /stutter|chose/i)
  const software = measuredText({ benchmark: { ...MEASURED, encoder: 'software', estimated: 1 }, chosen: 1, clockText })
  assert.match(software, /\b1 live stream\b/)
  assert.match(software, /software/)
  assert.doesNotMatch(software, /hardware|stutter/)
  assert.doesNotMatch(`${hardware}${software}`, NO_PLACEHOLDER)
})

test('measuredText: a choice above the measurement says what may stutter', () => {
  const second = measuredText({ benchmark: { ...MEASURED, estimated: 1 }, chosen: 2, clockText })
  assert.match(second, /chose 2\b/)
  assert.match(second, /managed 1\b/)
  assert.match(second, /second picture may stutter/)
  assert.match(second, /measure again/i)
  const none = measuredText({ benchmark: { ...MEASURED, estimated: 0 }, chosen: 1, clockText })
  assert.match(none, /chose 1\b/)
  assert.doesNotMatch(none, /managed \d|second/)
  assert.match(none, /the picture may stutter/)
  assert.match(none, /measure again/i)
  assert.doesNotMatch(`${second}${none}`, NO_PLACEHOLDER)
})

test('measuredText: unmeasured and pass-through', () => {
  const unmeasured = measuredText({ benchmark: null, chosen: 1, clockText })
  assert.match(unmeasured, /not measured/i)
  const passThrough = measuredText({ benchmark: { encoder: 'copy', estimated: 4 }, chosen: 2, clockText })
  assert.match(passThrough, /without converting/i)
  assert.doesNotMatch(`${unmeasured}${passThrough}`, /\d|stutter|measured:/i)
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
  assert.equal(capacityText(streams), measuredText({ benchmark: streams, chosen: 2, clockText: null }))
  assert.match(capacityText(streams), /\b2 live streams\b.*hardware/)
  assert.doesNotMatch(capacityText(streams), /plays/)
  const spare = capacityText({ ...streams, max: 1, estimated: 4 })
  assert.match(spare, /\b4 live streams\b.*hardware/)
  assert.match(spare, /plays 1 live stream\b/)
  const over = capacityText({ ...streams, estimated: 1 })
  assert.match(over, /chose 2\b.*managed 1\b.*second picture may stutter/)
  assert.doesNotMatch(over, /measure again/i)
  const unmeasured = capacityText({ max: 2, encoder: 'vaapi', estimated: null })
  assert.match(unmeasured, /plays up to 2\b/)
  assert.doesNotMatch(unmeasured, /measured|convert/i)
  const passThrough = capacityText({ max: 2, encoder: 'copy', estimated: 4 })
  assert.match(passThrough, /without converting/i)
  assert.match(passThrough, /plays up to 2\b/)
  assert.doesNotMatch(passThrough, /\b4\b/)
})

test('tunerExplainerOf: ends with the capacity message', () => {
  const streams = { max: 2, encoder: 'vaapi', estimated: 4 }
  const lines = tunerExplainerOf({ total: 2, muxSharing: false, streams })
  assert.equal(lines.at(-1), capacityText(streams))
  assert.match(lines.at(-1), /\b4 live streams\b.*plays up to 2\b/)
})

test('streamsHintOf: explains the phone cap and names a tuner count below 4', () => {
  assert.match(streamsHintOf({ tunerCount: 4 }), /up to 2 on a phone/)
  assert.doesNotMatch(streamsHintOf({ tunerCount: 4 }), /Choices|tuner/)
  assert.match(streamsHintOf({ tunerCount: 3 }), /Choices stop at your 3 tuners\.$/)
  assert.match(streamsHintOf({ tunerCount: 1 }), /your 1 tuner\.$/)
  assert.doesNotMatch(streamsHintOf({ tunerCount: null }), /Choices/)
})

test('streamChoicesOf: marks choices above the measurement', () => {
  const choices = streamChoicesOf({ choices: [1, 2, 3, 4], benchmark: { ...MEASURED, estimated: 3 } })
  assert.deepEqual(choices.map((c) => c.tooMany), [false, false, false, true])
})
