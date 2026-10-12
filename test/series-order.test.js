import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sortSeries, filterSeries, filterTitleMatches, titleSortKey, isRecordingNow } from '../src/web/series-order.js'

const NOW = 1_000_000

const make = ({ title, next = null, added = null, recording = true, channels = ['9HD Sydney'], path = '' }) => ({
  key: title.toLowerCase(),
  title,
  recording,
  autorecs: channels.map((name) => name === null
    ? { channelName: null, anyChannel: true }
    : { channelName: name, anyChannel: false }),
  nextAiring: next && { startDate: next[0], endDate: next[1], channelName: channels[0] },
  folder: added ? { created_at: added } : null,
  savesTo: { path },
})

const series = [
  make({ title: 'The Block', next: [NOW + 500, NOW + 900], added: '2026-09-30 08:50:16' }),
  make({ title: 'Chefs Ahoy', next: [NOW - 100, NOW + 100], added: '2026-10-07 09:15:47', path: '/tv/Chefs Ahoy/Season 01' }),
  make({ title: '1 Euro House', added: '2026-10-11 11:43:41', recording: false }),
  make({ title: '10 Hours', next: [NOW + 500, NOW + 600], channels: ['7 Sydney', '7HD Sydney'] }),
  make({ title: 'Ask the Doctor', channels: [null] }),
  make({ title: '9-1-1', next: [NOW + 200, NOW + 300], channels: ['7 Sydney'] }),
]

const titles = (list) => list.map((s) => s.title)

test('A–Z ignores a leading "The" and orders numbers naturally', () => {
  assert.deepEqual(titles(sortSeries({ series, sort: 'az' })),
    ['1 Euro House', '9-1-1', '10 Hours', 'Ask the Doctor', 'The Block', 'Chefs Ahoy'])
})

test('an unknown sort falls back to A–Z', () => {
  assert.deepEqual(sortSeries({ series, sort: 'nope' }), sortSeries({ series, sort: 'az' }))
})

test('NEXT AIRING puts the soonest first, ties A–Z, and series not in the guide last', () => {
  assert.deepEqual(titles(sortSeries({ series, sort: 'next' })),
    ['Chefs Ahoy', '9-1-1', '10 Hours', 'The Block', '1 Euro House', 'Ask the Doctor'])
})

test('RECENTLY ADDED puts the newest first and series with no date last, A–Z', () => {
  assert.deepEqual(titles(sortSeries({ series, sort: 'added' })),
    ['1 Euro House', 'Chefs Ahoy', 'The Block', '9-1-1', '10 Hours', 'Ask the Doctor'])
})

test('sorting leaves the input array unchanged', () => {
  const before = titles(series)
  sortSeries({ series, sort: 'next' })
  assert.deepEqual(titles(series), before)
})

test('the text filter matches title, channel, any channel, and saves-to path words', () => {
  const find = (query) => titles(filterSeries({ series, query, nowMs: NOW }))
  assert.deepEqual(find(''), titles(series))
  assert.deepEqual(find('block'), ['The Block'])
  assert.deepEqual(find('7hd'), ['10 Hours'])
  assert.deepEqual(find('any channel'), ['Ask the Doctor'])
  assert.deepEqual(find('season 01'), ['Chefs Ahoy'])
  assert.deepEqual(find('7 sydney 9'), ['9-1-1'])
  assert.deepEqual(find('zzz'), [])
})

test('status filters pick paused, not in guide, and recording now', () => {
  const pick = (status) => titles(filterSeries({ series, status, nowMs: NOW }))
  assert.deepEqual(pick('all'), titles(series))
  assert.deepEqual(pick('paused'), ['1 Euro House'])
  assert.deepEqual(pick('not-in-guide'), ['1 Euro House', 'Ask the Doctor'])
  assert.deepEqual(pick('recording-now'), ['Chefs Ahoy'])
})

test('text and status filters combine', () => {
  assert.deepEqual(titles(filterSeries({ series, query: 'ask', status: 'paused', nowMs: NOW })), [])
})

test('recording now needs the airing to have started and not ended', () => {
  const at = (startDate, endDate) => isRecordingNow({ series: { nextAiring: { startDate, endDate } }, nowMs: NOW })
  assert.equal(at(NOW, NOW + 1), true)
  assert.equal(at(NOW + 1, NOW + 2), false)
  assert.equal(at(NOW - 2, NOW), false)
  assert.equal(isRecordingNow({ series: { nextAiring: null }, nowMs: NOW }), false)
})

test('title matches filter on pattern and folder, sorted A–Z without "The"', () => {
  const titleMatches = [
    { show_pattern: 'NRL', dest_folder: 'Rugby League', savesTo: { path: '/tv/Rugby League/Season 01' } },
    { show_pattern: 'The Chase', dest_folder: 'The Chase', savesTo: { path: '/tv/The Chase/Season 01' } },
    { show_pattern: 'Ambulance', dest_folder: 'Ambulance', savesTo: { path: null } },
  ]
  const patterns = (query) => filterTitleMatches({ titleMatches, query }).map((t) => t.show_pattern)
  assert.deepEqual(patterns(''), ['Ambulance', 'The Chase', 'NRL'])
  assert.deepEqual(patterns('rugby'), ['NRL'])
  assert.deepEqual(patterns('season'), ['The Chase', 'NRL'])
})

test('the title sort key drops only a leading "The"', () => {
  assert.equal(titleSortKey('The Block'), 'Block')
  assert.equal(titleSortKey('Theodore'), 'Theodore')
  assert.equal(titleSortKey('A Place to Call Home'), 'A Place to Call Home')
  assert.equal(titleSortKey(null), '')
})
