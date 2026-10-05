import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { findHdSimulcast, isHdChannelName } from '../src/web/simulcast.js'

const grid = JSON.parse(readFileSync(new URL('./fixtures/tvh-setup/channel-grid.json', import.meta.url)))
const START = Date.parse('2026-10-06T19:30:00+11:00')
const HOUR = 60 * 60 * 1000

const channels = [
  ...grid.entries.map((c) => ({ id: c.uuid, name: c.name })),
  { id: 'seven-hd', name: '7HD Sydney' },
  { id: 'abc-hd', name: 'ABC TV HD' },
]
const idOf = (name) => channels.find((c) => c.name === name).id

const airing = ({ title = 'Home and Away', start = START, id, series_link = null }) =>
  ({ title, start, end: start + HOUR, program_id: id, epg_program_id: id, series_link })

const guideWith = (rows) => {
  const programsByChannel = {}
  for (const [name, program] of rows) programsByChannel[idOf(name)] = [program]
  return programsByChannel
}

const lookup = ({ pressedName, rows, needsSeriesLink }) => {
  const programsByChannel = guideWith(rows)
  const channelId = idOf(pressedName)
  return findHdSimulcast({
    program: programsByChannel[channelId][0],
    channelId,
    channels,
    programsByChannel,
    needsSeriesLink,
  })
}

test('isHdChannelName reads a standalone or trailing HD token', () => {
  for (const name of ['7HD Sydney', 'ABC TV HD', '10 HD', 'SBS ONE HD', '9HD Sydney', '9GemHD Sydney']) {
    assert.equal(isHdChannelName(name), true, name)
  }
  for (const name of ['7 Sydney', 'ABC TV', 'ABCTV', '10', 'Channel 9 Sydney', 'Orchard TV', 'HDTV Shop']) {
    assert.equal(isHdChannelName(name), false, name)
  }
})

test('7 Sydney offers 7HD Sydney for the same programme', () => {
  const hd = lookup({
    pressedName: '7 Sydney',
    rows: [['7 Sydney', airing({ id: 1 })], ['7HD Sydney', airing({ id: 2 })]],
  })
  assert.equal(hd.channel.name, '7HD Sydney')
  assert.equal(hd.program.program_id, 2)
})

test('ABC TV offers ABC TV HD with a trimmed, case-different title', () => {
  const hd = lookup({
    pressedName: 'ABC TV',
    rows: [
      ['ABC TV', airing({ title: 'Gardening Australia', id: 1 })],
      ['ABC TV HD', airing({ title: ' gardening australia ', start: START + 60 * 1000, id: 2 })],
    ],
  })
  assert.equal(hd.channel.name, 'ABC TV HD')
})

test('the best name match wins when several HD channels carry the programme', () => {
  const hd = lookup({
    pressedName: 'Channel 9 Sydney',
    rows: [
      ['Channel 9 Sydney', airing({ title: 'Movie', id: 1 })],
      ['9GemHD Sydney', airing({ title: 'Movie', id: 2 })],
      ['9HD Sydney', airing({ title: 'Movie', id: 3 })],
    ],
  })
  assert.equal(hd.channel.name, '9HD Sydney')
})

test('an HD channel gets no offer', () => {
  const hd = lookup({
    pressedName: '7HD Sydney',
    rows: [['7 Sydney', airing({ id: 1 })], ['7HD Sydney', airing({ id: 2 })]],
  })
  assert.equal(hd, null)
})

test('a programme on no other channel gets no offer', () => {
  const hd = lookup({
    pressedName: '7 Sydney',
    rows: [['7 Sydney', airing({ id: 1 })], ['7HD Sydney', airing({ title: 'Seven News', id: 2 })]],
  })
  assert.equal(hd, null)
})

test('a different start time gets no offer', () => {
  const hd = lookup({
    pressedName: '10',
    rows: [['10', airing({ id: 1 })], ['10 HD', airing({ start: START + 5 * 60 * 1000, id: 2 })], ['10 HD +1', airing({ start: START + HOUR, id: 3 })]],
  })
  assert.equal(hd, null)
})

test('a series offer needs a series link on the HD airing', () => {
  const rows = [['SBS ONE', airing({ id: 1, series_link: 's1' })], ['SBS ONE HD', airing({ id: 2 })]]
  assert.equal(lookup({ pressedName: 'SBS ONE', rows, needsSeriesLink: true }), null)
  assert.equal(lookup({ pressedName: 'SBS ONE', rows }).channel.name, 'SBS ONE HD')
})
