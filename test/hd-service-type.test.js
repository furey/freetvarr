import { test } from 'node:test'
import assert from 'node:assert/strict'

import { isHdChannel } from '../src/tvheadend.js'
import { sdSimulcastIds } from '../src/epg.js'
import { findHdSimulcast } from '../src/web/simulcast.js'

const services = new Map([
  ['ten-sd', { enabled: true, serviceType: 1 }],
  ['ten-hd', { enabled: true, serviceType: 25 }],
  ['mpeg2-hd', { enabled: true, serviceType: 17 }],
  ['hevc', { enabled: true, serviceType: 31 }],
  ['adv-sd', { enabled: true, serviceType: 22 }],
  ['off-hd', { enabled: false, serviceType: 25 }],
  ['radio', { enabled: true, serviceType: 2 }],
  ['untyped', { enabled: true }],
])

const hd = (name, serviceIds) => isHdChannel({ name, serviceIds, services })

test('HD service types make a channel HD', () => {
  assert.equal(hd('10', ['ten-hd']), true)
  assert.equal(hd('x', ['mpeg2-hd']), true)
  assert.equal(hd('x', ['hevc']), true)
})

test('SD service types make a channel SD even when the name ends in HD', () => {
  assert.equal(hd('10', ['ten-sd']), false)
  assert.equal(hd('7flix', ['adv-sd']), false)
  assert.equal(hd('Odd HD', ['ten-sd']), false)
})

test('one HD service among several makes the channel HD', () => {
  assert.equal(hd('7 Sydney', ['ten-sd', 'ten-hd']), true)
})

test('a disabled HD service is ignored', () => {
  assert.equal(hd('10', ['off-hd', 'ten-sd']), false)
})

test('unknown or missing types fall back to the name rule', () => {
  assert.equal(hd('ABC HD', ['radio']), true)
  assert.equal(hd('ABC', ['untyped']), false)
  assert.equal(hd('ABC HD', []), true)
  assert.equal(hd('ABC', ['missing']), false)
})

const sdTen = { id: 'sd', name: '10', hd: false }
const hdTen = { id: 'hd', name: '10', hd: true }

test('Hide SD simulcasts hides the SD channel of two identically named channels', () => {
  assert.deepEqual([...sdSimulcastIds([sdTen, hdTen])], ['sd'])
})

test('findHdSimulcast offers the identically named HD channel', () => {
  const start = Date.parse('2026-10-06T19:30:00+11:00')
  const program = { title: 'News', start }
  const offer = findHdSimulcast({
    program,
    channelId: 'sd',
    channels: [sdTen, hdTen],
    programsByChannel: { hd: [{ title: 'News', start }] },
  })
  assert.equal(offer.channel.id, 'hd')
  const reverse = findHdSimulcast({
    program,
    channelId: 'hd',
    channels: [sdTen, hdTen],
    programsByChannel: { sd: [program] },
  })
  assert.equal(reverse, null)
})
