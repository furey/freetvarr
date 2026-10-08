import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { APPLIED_SETTING, applyDefaultFavourites, pickBigFive } from '../src/default-favourites.js'

const grid = JSON.parse(readFileSync(new URL('./fixtures/tvh-setup/channel-grid.json', import.meta.url)))

const lineup = (rows) => rows.map(([number, name]) => ({ id: `${number}-${name}`, number, name }))

const pickedNames = (channels) => pickBigFive(channels).map((c) => `${c.number} ${c.name}`)

const SYDNEY = lineup([
  [1, '10'], [2, 'ABC TV'], [3, 'SBS ONE'], [7, '7 Sydney'], [9, '9HD Sydney'], [10, '10 HD'],
  [11, '10 comedy'], [12, '10 drama'], [13, 'Nickelodeon'], [14, '10 HD +1'], [16, 'you.tv'],
  [17, 'gecko'], [20, 'ABCTV'], [22, 'ABC Kids/ABC Family'], [23, 'ABC Entertains'],
  [24, 'ABC NEWS'], [30, 'SBS ONE HD'], [31, 'SBS2'], [32, 'SBS World Movies'], [33, 'SBS Food'],
  [34, 'NITV HD'], [35, 'SBS WorldWatch'], [36, 'NITV'], [70, '7 Sydney'], [72, '7two Sydney'],
  [74, '7mate Sydney'], [75, '7Bravo Sydney'], [76, '7flix Sydney'], [77, 'TVSN'],
  [78, 'RACING.COM'], [91, 'Channel 9 Sydney'], [92, '9GemHD Sydney'], [93, '9Go!HD Sydney'],
  [94, '9LifeHD Sydney'], [96, '9Rush Sydney'], [97, 'Extra'],
])

test('pickBigFive: Sydney (confirmed) picks the HD channel of each network in order', () => {
  assert.deepEqual(pickedNames(SYDNEY), ['20 ABCTV', '7 7 Sydney', '9 9HD Sydney', '10 10 HD', '30 SBS ONE HD'])
})

test('pickBigFive: the TVHeadend fixture from Sydney (confirmed) picks the same networks', () => {
  const channels = grid.entries.map((c) => ({ id: c.uuid, number: c.number, name: c.name }))
  assert.deepEqual(
    pickBigFive(channels).map((c) => c.name),
    ['ABCTV', '7 Sydney', '9HD Sydney', '10 HD', 'SBS ONE HD'],
  )
})

const MELBOURNE = lineup([
  [1, '10'], [2, 'ABC TV'], [3, 'SBS ONE'], [7, '7HD Melbourne'], [9, '9HD Melbourne'],
  [10, '10 HD'], [11, '10 comedy'], [20, 'ABC TV HD'], [21, 'ABC TV'], [22, 'ABC Kids/ABC Family'],
  [24, 'ABC NEWS'], [30, 'SBS ONE HD'], [31, 'SBS2'], [70, '7HD Melbourne'], [72, '7two Melbourne'],
  [90, '9HD Melbourne'], [91, 'Channel 9 Melbourne'], [92, '9GemHD Melbourne'],
])

const SOUTHERN_NSW = lineup([
  [2, 'ABC TV'], [3, 'SBS ONE'], [5, '10 HD'], [6, '7 Regional'], [8, '9HD'], [20, 'ABC TV HD'],
  [24, 'ABC NEWS'], [30, 'SBS ONE HD'], [50, '10 HD'], [51, '10 HD'], [52, '10 comedy'],
  [60, '7 Regional'], [62, '7two Regional'], [64, '7mate Regional'], [80, '9HD'], [82, '9Gem'],
  [83, '9Go!'],
])

const TASMANIA = lineup([
  [2, 'ABC TV HD'], [3, 'SBS ONE HD'], [5, '10 HD'], [6, '7HD Tasmania'], [8, '9HD'],
  [21, 'ABC TV'], [22, 'ABC Kids/ABC Family'], [30, 'SBS ONE'], [31, 'SBS2'], [50, '10 HD'],
  [51, '10 Tasmania'], [60, '7HD Tasmania'], [62, '7two Tasmania'], [80, '9HD'], [82, '9Gem'],
])

const REGIONAL_WA = lineup([
  [2, 'ABC TV'], [3, 'SBS ONE'], [5, '10 HD'], [6, '7 Regional WA'], [8, '9HD'], [20, 'ABC TV HD'],
  [30, 'SBS ONE HD'], [52, '10 comedy'], [62, '7two Regional WA'], [80, '9HD'], [82, '9Gem'],
])

const DARWIN = lineup([
  [1, '10 DDT'], [2, 'ABC TV'], [3, 'SBS ONE'], [7, '7HD Darwin'], [9, 'Nine'], [10, '10 HD DDT'],
  [11, '10 DDT'], [20, 'ABCTV HD'], [30, 'SBS ONE HD'], [70, '7HD Darwin'], [72, '7two Darwin'],
  [90, '9HD Darwin'], [91, 'Nine'], [92, '9Gem Darwin'],
])

test('pickBigFive: Melbourne (researched) picks the HD channels', () => {
  assert.deepEqual(pickedNames(MELBOURNE), ['20 ABC TV HD', '7 7HD Melbourne', '90 9HD Melbourne', '10 10 HD', '30 SBS ONE HD'])
})

test('pickBigFive: southern NSW (researched) uses the regional numbers 6, 8, and 5', () => {
  assert.deepEqual(pickedNames(SOUTHERN_NSW), ['20 ABC TV HD', '6 7 Regional', '80 9HD', '50 10 HD', '30 SBS ONE HD'])
})

test('pickBigFive: Tasmania (researched) takes HD ABC and SBS from 2 and 3', () => {
  assert.deepEqual(pickedNames(TASMANIA), ['2 ABC TV HD', '6 7HD Tasmania', '80 9HD', '50 10 HD', '3 SBS ONE HD'])
})

test('pickBigFive: regional WA (researched) picks GWN7, WOW, and West Digital', () => {
  assert.deepEqual(pickedNames(REGIONAL_WA), ['20 ABC TV HD', '6 7 Regional WA', '80 9HD', '5 10 HD', '30 SBS ONE HD'])
})

test('pickBigFive: Darwin (researched) skips the SD Nine on 9', () => {
  assert.deepEqual(pickedNames(DARWIN), ['20 ABCTV HD', '7 7HD Darwin', '90 9HD Darwin', '10 10 HD DDT', '30 SBS ONE HD'])
})

test('pickBigFive: falls back to the SD channel when a network has no HD channel', () => {
  const channels = lineup([[2, 'ABC TV'], [3, 'SBS'], [7, '7 Sydney'], [1, '10']])
  assert.deepEqual(pickedNames(channels), ['2 ABC TV', '7 7 Sydney', '1 10', '3 SBS'])
})

test('pickBigFive: skips a network the scan did not find', () => {
  assert.deepEqual(pickedNames(lineup([[20, 'ABC TV HD'], [30, 'SBS HD']])), ['20 ABC TV HD', '30 SBS HD'])
  assert.deepEqual(pickBigFive([]), [])
})

test('pickBigFive: ignores off-air channels and time-shifted copies', () => {
  const channels = [
    { id: 'off', number: 10, name: '10 HD', offAir: true },
    { id: 'plus', number: 14, name: '10 HD +1' },
    { id: 'sd', number: 1, name: '10' },
  ]
  assert.deepEqual(pickBigFive(channels).map((c) => c.id), ['sd'])
})

const settingsStore = (initial = {}) => {
  const values = { ...initial }
  return {
    values,
    getSetting: async (key) => values[key] ?? null,
    setSetting: async (key, value) => { values[key] = value },
  }
}

const prefsStore = (pinnedIds = []) => {
  const prefs = { pinnedIds }
  return {
    prefs,
    getChannelPrefs: async () => ({ ...prefs }),
    setChannelPrefs: async ({ pinnedIds: next }) => { prefs.pinnedIds = next },
  }
}

const runApply = ({ country = 'au', settings = settingsStore(), prefs = prefsStore() } = {}) =>
  applyDefaultFavourites({ country, listChannels: async () => SYDNEY, ...settings, ...prefs })

test('applyDefaultFavourites: pins the big five once in Australia and returns their names', async () => {
  const settings = settingsStore()
  const prefs = prefsStore()
  const favourites = await runApply({ settings, prefs })
  assert.deepEqual(favourites.map((f) => f.name), ['ABCTV', '7 Sydney', '9HD Sydney', '10 HD', 'SBS ONE HD'])
  assert.deepEqual(prefs.prefs.pinnedIds, favourites.map((f) => f.id))
  assert.equal(settings.values[APPLIED_SETTING], '1')
})

test('applyDefaultFavourites: a second scan does not pin them again', async () => {
  const settings = settingsStore({ [APPLIED_SETTING]: '1' })
  const prefs = prefsStore()
  assert.deepEqual(await runApply({ settings, prefs }), [])
  assert.deepEqual(prefs.prefs.pinnedIds, [])
})

test('applyDefaultFavourites: never replaces favourites the user already has', async () => {
  const prefs = prefsStore(['mine'])
  assert.deepEqual(await runApply({ prefs }), [])
  assert.deepEqual(prefs.prefs.pinnedIds, ['mine'])
})

test('applyDefaultFavourites: does nothing outside Australia', async () => {
  const prefs = prefsStore()
  assert.deepEqual(await runApply({ country: 'nz', prefs }), [])
  assert.deepEqual(await runApply({ country: '', prefs }), [])
  assert.deepEqual(prefs.prefs.pinnedIds, [])
})
