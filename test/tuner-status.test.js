import { test } from 'node:test'
import assert from 'node:assert/strict'

import { channelCosts, describeTuners, recordingsForConflicts } from '../src/tuner-status.js'

const INPUTS = [
  { input: 'Tuner A', mux: '177.5MHz in DVB-T' },
  { input: 'Tuner B', mux: '191.5MHz in DVB-T' },
  { input: 'Tuner C', mux: null },
]

const SUBSCRIPTIONS = [
  { title: 'DVR: The Block', channel: 'Nine', service: 'Tuner A/177.5MHz/Nine' },
  { title: 'Freetvarr-live/abc', channel: '9Go!', service: 'Tuner A/177.5MHz/9Go!' },
  { title: 'Freetvarr-live/def', channel: '7mate', service: 'Tuner B/191.5MHz/7mate' },
]

test('describeTuners: names each tuned tuner, recording first, then free ones', () => {
  assert.deepEqual(describeTuners({ inputs: INPUTS, subscriptions: SUBSCRIPTIONS, tunerCount: 3 }), {
    total: 3,
    inUse: 2,
    recording: 1,
    free: 1,
    tuners: [
      { name: 'Tuner A', inUseBy: 'recording', label: 'Recording The Block' },
      { name: 'Tuner B', inUseBy: 'live', label: 'Watching 7mate' },
      { name: null, inUseBy: null, label: 'Free' },
    ],
  })
})

test('describeTuners: never reports fewer tuners than are tuned', () => {
  const report = describeTuners({ inputs: INPUTS, subscriptions: [], tunerCount: 1 })
  assert.equal(report.total, 2)
  assert.equal(report.free, 0)
  assert.equal(report.tuners[0].label, 'In use')
})

const MUXES = new Map([
  ['s-nine', { muxName: '177.5MHz in DVB-T', enabled: true }],
  ['s-seven', { muxName: '191.5MHz in DVB-T', enabled: true }],
  ['s-abc', { muxName: '226.5MHz in DVB-T', enabled: true }],
  ['s-off', { muxName: '999MHz in DVB-T', enabled: false }],
])

const CHANNELS = [
  { id: 'nine', serviceIds: ['s-nine'] },
  { id: 'abc', serviceIds: ['s-abc'] },
  { id: 'off', serviceIds: ['s-off'] },
]

test('channelCosts: same multiplex costs no tuner, another needs a free one', () => {
  const costs = channelCosts({ channels: CHANNELS, muxes: MUXES, inputs: INPUTS, tunerCount: 3, now: 0 })
  assert.deepEqual(costs.map((c) => [c.channelId, c.cost, c.reason]), [
    ['nine', 'no-extra-tuner', null],
    ['abc', 'free-tuner', null],
    ['off', 'unavailable', 'off-air'],
  ])
})

test('channelCosts: every tuner busy elsewhere is unavailable', () => {
  const costs = channelCosts({ channels: CHANNELS.slice(0, 2), muxes: MUXES, inputs: INPUTS, tunerCount: 2, now: 0 })
  assert.deepEqual(costs.map((c) => c.cost), ['no-extra-tuner', 'unavailable'])
})

test('channelCosts: without multiplex data nothing is claimed as free of cost', () => {
  const costs = channelCosts({ channels: CHANNELS.slice(0, 2), muxes: new Map(), inputs: INPUTS, tunerCount: 3, now: 0 })
  assert.deepEqual(costs.map((c) => c.cost), ['free-tuner', 'free-tuner'])
})

test('channelCosts: a recording due within the hour that would lack a tuner is a conflict hint', () => {
  const recordings = recordingsForConflicts([
    { name: 'Gruen', channelId: 'nine', startDate: 1000, endDate: 5000, schedStatus: 'scheduled' },
  ])
  const costs = channelCosts({
    channels: CHANNELS.slice(0, 2),
    muxes: MUXES,
    inputs: [{ input: 'Tuner A', mux: null }],
    tunerCount: 1,
    recordings,
    now: 0,
  })
  assert.deepEqual(costs[1], { channelId: 'abc', cost: 'free-tuner', reason: null, conflict: { title: 'Gruen', startsAt: 1000 } })
})
