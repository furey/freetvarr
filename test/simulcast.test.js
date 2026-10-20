import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { channelFormatsOf, findHdSimulcast, isHdChannelName, sdSimulcastIds, simulcastBaseKey } from '../src/web/simulcast.js'

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

const lineup = [
  { id: 1, name: '10', hd: false },
  { id: 2, name: '10 HD', hd: true },
  { id: 3, name: 'Nine', hd: false },
  { id: 4, name: '9HD', hd: true },
  { id: 5, name: '7flix Sydney', hd: false },
  { id: 6, name: 'SBS ONE', hd: false },
  { id: 7, name: 'SBS ONE HD', hd: false },
  { id: 8, name: '7mate HD', hd: true },
]

test('channelFormatsOf tags every channel HD or SD when both hide settings are off', () => {
  assert.deepEqual([...channelFormatsOf({ channels: lineup })], [
    ['1', 'SD'], ['2', 'HD'], ['3', 'SD'], ['4', 'HD'], ['5', 'SD'], ['6', 'SD'], ['7', 'HD'], ['8', 'HD'],
  ])
})

test('channelFormatsOf tags nothing when either hide setting is on', () => {
  assert.equal(channelFormatsOf({ channels: lineup, hideSdSimulcasts: true }).size, 0)
  assert.equal(channelFormatsOf({ channels: lineup, hideSdChannels: true }).size, 0)
})

test('channelFormatsOf trusts the TVHeadend service type over a name without HD', () => {
  const formats = channelFormatsOf({ channels: [{ id: 20, name: 'ABCTV', hd: true }, { id: 2, name: 'ABC TV', hd: false }] })
  assert.deepEqual([...formats], [['20', 'HD'], ['2', 'SD']])
})

test('simulcastBaseKey ignores spacing, punctuation, HD, and the word Channel', () => {
  assert.equal(simulcastBaseKey('ABCTV'), simulcastBaseKey('ABC TV'))
  assert.equal(simulcastBaseKey('9HD Sydney'), simulcastBaseKey('Channel 9 Sydney'))
  assert.equal(simulcastBaseKey('7HD Sydney'), simulcastBaseKey('7 Sydney'))
  assert.equal(simulcastBaseKey('SBS ONE HD'), simulcastBaseKey('SBS ONE'))
  assert.equal(simulcastBaseKey('Nine'), simulcastBaseKey('9HD'))
})

test('simulcastBaseKey keeps different channels apart', () => {
  assert.notEqual(simulcastBaseKey('10 HD +1'), simulcastBaseKey('10'))
  assert.notEqual(simulcastBaseKey('9GemHD Sydney'), simulcastBaseKey('9HD Sydney'))
  assert.notEqual(simulcastBaseKey('9Go!HD Sydney'), simulcastBaseKey('Channel 9 Sydney'))
})

test('sdSimulcastIds pairs the Sydney twins whose names differ in spacing or HD placement', () => {
  const sydney = [
    { id: 'abc-hd', name: 'ABCTV', hd: true },
    { id: 'abc-sd', name: 'ABC TV', hd: false },
    { id: 'nine-hd', name: '9HD Sydney', hd: true },
    { id: 'nine-sd', name: 'Channel 9 Sydney', hd: false },
    { id: 'gem-hd', name: '9GemHD Sydney', hd: true },
    { id: 'ten-plus', name: '10 HD +1', hd: true },
    { id: 'ten-sd', name: '10', hd: false },
    { id: 'flix', name: '7flix Sydney', hd: false },
  ]
  assert.deepEqual([...sdSimulcastIds(sydney)].sort(), ['abc-sd', 'nine-sd'])
})

test('sdSimulcastIds picks the SD channel of each pair', () => {
  assert.deepEqual([...sdSimulcastIds(lineup)], ['1', '3', '6'])
})
