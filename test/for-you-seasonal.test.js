import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import express from 'express'

process.env.TZ = 'Australia/Sydney'
const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-for-you-seasonal-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { db } = await import('../src/db.js')
const { mountForYou } = await import('../src/for-you-routes.js')
const { buildForYou } = await import('../src/for-you.js')
const {
  activeOccasionsOf,
  dayNumberOf,
  easterOf,
  hiddenOccasionsOf,
  isOccasionMuted,
  localDayOf,
  localMidnightMsOf,
  mutedUntilOf,
  occasionDaysOf,
  occasionMatchOf,
  occasionsFor,
  seasonalSettingsOf,
  tableDatesOf,
  windowsOf,
} = await import('../src/for-you-occasions.js')
const { MATARIKI_OBSERVANCE_DAYS, buildOccasionDates, diwaliOf } = await import('../scripts/build-occasion-dates.mjs')
const { rowMenuOf, sectionsOf, themeGroupsOf, themeMutedToastOf } = await import('../src/web/for-you.js')
const table = JSON.parse(await fs.readFile(new URL('../src/data/occasion-dates.json', import.meta.url), 'utf8'))

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const SYDNEY = 'Australia/Sydney'
const passThrough = (req, res, next) => next()
let appServer
let baseUrl

before(async () => {
  await db.migrate.latest()
  const app = express()
  app.use(express.json())
  mountForYou({ app, csrf: passThrough, start: false })
  appServer = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => appServer.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${appServer.address().port}`
})

after(async () => {
  appServer?.close()
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test('dates: Easter by Computus, 2026 to 2030', () => {
  assert.deepEqual([2026, 2027, 2028, 2029, 2030].map((year) => isoOf(easterOf(year))), ['2026-04-05', '2027-03-28', '2028-04-16', '2029-04-01', '2030-04-21'])
})

test('dates: nth weekdays for Mother\'s Day, Father\'s Day, Thanksgiving, and NAIDOC Week', () => {
  assert.deepEqual(daysOf({ key: 'mothers-day', country: 'au' }), ['2026-05-10', '2027-05-09', '2028-05-14', '2029-05-13', '2030-05-12'])
  assert.deepEqual(daysOf({ key: 'mothers-day', country: 'uk' }), ['2026-03-15', '2027-03-07', '2028-03-26', '2029-03-11', '2030-03-31'])
  assert.deepEqual(daysOf({ key: 'fathers-day', country: 'nz' }), ['2026-09-06', '2027-09-05', '2028-09-03', '2029-09-02', '2030-09-01'])
  assert.deepEqual(daysOf({ key: 'fathers-day', country: 'us' }), ['2026-06-21', '2027-06-20', '2028-06-18', '2029-06-17', '2030-06-16'])
  assert.deepEqual(daysOf({ key: 'thanksgiving', country: 'us' }), ['2026-11-26', '2027-11-25', '2028-11-23', '2029-11-22', '2030-11-28'])
  assert.deepEqual(daysOf({ key: 'naidoc-week', country: 'au' }), ['2026-07-05', '2027-07-04', '2028-07-02', '2029-07-01', '2030-07-07'])
})

test('dates: Remembrance Sunday in the United Kingdom, 11 November in Australia and New Zealand', () => {
  assert.deepEqual(daysOf({ key: 'remembrance-day', country: 'uk' }), ['2026-11-08', '2027-11-14', '2028-11-12', '2029-11-11', '2030-11-10'])
  assert.deepEqual(daysOf({ key: 'remembrance-day', country: 'au' }), ['2026-11-11', '2027-11-11', '2028-11-11', '2029-11-11', '2030-11-11'])
})

test('dates: the lunar table gives Lunar New Year, Eid al-Fitr, Hanukkah, Diwali, and Matariki', () => {
  assert.deepEqual(daysOf({ key: 'lunar-new-year' }), ['2026-02-17', '2027-02-06', '2028-01-26', '2029-02-13', '2030-02-03'])
  assert.deepEqual(daysOf({ key: 'eid-al-fitr' }), ['2026-03-20', '2027-03-09', '2028-02-26', '2029-02-14', '2030-02-04'])
  assert.deepEqual(daysOf({ key: 'hanukkah' }), ['2026-12-05', '2027-12-25', '2028-12-13', '2029-12-02', '2030-12-21'])
  assert.deepEqual(daysOf({ key: 'diwali' }), ['2026-11-08', '2027-10-29', '2028-10-17', '2029-11-05', '2030-10-26'])
  assert.deepEqual(daysOf({ key: 'matariki', country: 'nz' }), ['2026-07-10', '2027-06-25', '2028-07-14', '2029-07-06', '2030-06-21'])
  assert.deepEqual(tableDatesOf({ key: 'eid-al-fitr', year: 2033 }).map(isoOf), ['2033-01-02', '2033-12-23'])
  assert.deepEqual(tableDatesOf({ key: 'diwali', year: 2041 }), [])
})

test('dates: the table covers 2026 to 2040, and its Diwali dates match the new moon script', () => {
  assert.deepEqual(table.years, [2026, 2040])
  for (const key of ['lunar-new-year', 'hanukkah', 'diwali', 'matariki']) assert.equal(table.dates[key].length, 15, key)
  assert.deepEqual(table.dates.diwali, Array.from({ length: 15 }, (_, i) => diwaliOf(2026 + i)))
  const Holidays = function Holidays() {
    return { setHoliday: () => {}, getHolidays: () => [] }
  }
  assert.deepEqual(buildOccasionDates({ Holidays, firstYear: 2026, lastYear: 2027 }).dates.diwali, ['2026-11-08', '2027-10-29'])
})

test('dates: the lunar table is regenerated at least 3 years before it runs out', () => {
  assert.ok(new Date().getUTCFullYear() < table.years[1] - 3, `regenerate src/data/occasion-dates.json with scripts/build-occasion-dates.mjs; it ends in ${table.years[1]}`)
})

test('dates: Matariki comes from Schedule 1 of the Act, and the credit names no CC BY-SA data', () => {
  assert.deepEqual(MATARIKI_OBSERVANCE_DAYS.slice(0, 5), ['2022-06-24', '2023-07-14', '2024-06-28', '2025-06-20', '2026-07-10'])
  assert.equal(MATARIKI_OBSERVANCE_DAYS.at(-1), '2052-06-21')
  assert.deepEqual(table.dates.matariki, MATARIKI_OBSERVANCE_DAYS.filter((iso) => iso >= '2026' && iso < '2041'))
  assert.doesNotMatch(table.credit, /CC BY-SA/)
  assert.match(table.credit, /Te Kāhui o Matariki Public Holiday Act 2022/)
})

test('countries: each install country gets its own list, and an unknown country gets only the all-country rows', () => {
  const keysOf = (country) => occasionsFor(country).map((occasion) => occasion.key)
  const everywhere = ['lunar-new-year', 'eid-al-fitr', 'easter', 'diwali', 'hanukkah', 'christmas', 'new-years-eve']
  assert.deepEqual(keysOf(''), everywhere)
  assert.deepEqual(keysOf('au'), ['lunar-new-year', 'eid-al-fitr', 'easter', 'anzac-day', 'mothers-day', 'fathers-day', 'naidoc-week', 'halloween', 'diwali', 'remembrance-day', 'hanukkah', 'christmas', 'new-years-eve'])
  assert.deepEqual(keysOf('nz'), ['lunar-new-year', 'waitangi-day', 'eid-al-fitr', 'easter', 'anzac-day', 'mothers-day', 'fathers-day', 'matariki', 'halloween', 'diwali', 'remembrance-day', 'hanukkah', 'christmas', 'new-years-eve'])
  assert.deepEqual(keysOf('uk'), ['lunar-new-year', 'eid-al-fitr', 'easter', 'mothers-day', 'fathers-day', 'halloween', 'diwali', 'bonfire-night', 'remembrance-day', 'hanukkah', 'christmas', 'new-years-eve'])
  assert.deepEqual(keysOf('us'), ['lunar-new-year', 'eid-al-fitr', 'easter', 'mothers-day', 'fathers-day', 'fourth-of-july', 'halloween', 'diwali', 'thanksgiving', 'hanukkah', 'christmas', 'new-years-eve'])
  assert.ok(occasionsFor('au').every((occasion) => !['australia-day', 'melbourne-cup', 'mardi-gras'].includes(occasion.key)))
  assert.deepEqual(occasionsFor('au').filter((occasion) => occasion.commemoration).map((occasion) => occasion.title), ['Anzac Day', 'NAIDOC Week', 'Remembrance Day'])
})

test('windows: each occasion opens and closes on its own days', () => {
  const windowOf = ({ key, country = 'au', year = 2026 }) => {
    const [window] = windowsOf({ occasion: occasionOf({ key, country }), country, fromYear: year })
    return `${isoOf(window.start)}..${isoOf(window.end)}`
  }
  assert.equal(windowOf({ key: 'christmas' }), '2026-12-01..2026-12-26')
  assert.equal(windowOf({ key: 'new-years-eve' }), '2026-12-27..2027-01-01')
  assert.equal(windowOf({ key: 'easter' }), '2026-03-29..2026-04-06')
  assert.equal(windowOf({ key: 'halloween' }), '2026-10-24..2026-10-31')
  assert.equal(windowOf({ key: 'mothers-day' }), '2026-05-07..2026-05-10')
  assert.equal(windowOf({ key: 'anzac-day' }), '2026-04-22..2026-04-25')
  assert.equal(windowOf({ key: 'remembrance-day' }), '2026-11-08..2026-11-11')
  assert.equal(windowOf({ key: 'remembrance-day', country: 'uk' }), '2026-11-05..2026-11-08')
  assert.equal(windowOf({ key: 'naidoc-week' }), '2026-07-05..2026-07-12')
  assert.equal(windowOf({ key: 'matariki', country: 'nz' }), '2026-07-03..2026-07-10')
  assert.equal(windowOf({ key: 'waitangi-day', country: 'nz' }), '2026-02-03..2026-02-06')
  assert.equal(windowOf({ key: 'bonfire-night', country: 'uk' }), '2026-11-01..2026-11-05')
  assert.equal(windowOf({ key: 'thanksgiving', country: 'us' }), '2026-11-19..2026-11-26')
  assert.equal(windowOf({ key: 'fourth-of-july', country: 'us' }), '2026-07-01..2026-07-04')
  assert.equal(windowOf({ key: 'eid-al-fitr' }), '2026-03-15..2026-03-21')
  assert.equal(windowOf({ key: 'hanukkah' }), '2026-12-04..2026-12-12')
  assert.equal(windowOf({ key: 'diwali' }), '2026-11-03..2026-11-09')
  assert.equal(windowOf({ key: 'lunar-new-year' }), '2026-02-12..2026-02-18')
})

test('windows: overlapping occasions come nearest date first', () => {
  const activeOn = ({ iso, country = 'au' }) => activeOccasionsOf({ country, today: dayOf(iso) }).map((window) => window.occasion.key)
  assert.deepEqual(activeOn({ iso: '2026-12-05' }), ['hanukkah', 'christmas'])
  assert.deepEqual(activeOn({ iso: '2026-12-04' }), ['hanukkah', 'christmas'])
  assert.deepEqual(activeOn({ iso: '2026-12-03' }), ['christmas'])
  assert.deepEqual(activeOn({ iso: '2026-12-20' }), ['christmas'])
  assert.deepEqual(activeOn({ iso: '2026-11-08' }), ['diwali', 'remembrance-day'])
  assert.deepEqual(activeOn({ iso: '2026-11-10' }), ['remembrance-day'])
  assert.deepEqual(activeOn({ iso: '2026-12-31' }), ['new-years-eve'])
  assert.deepEqual(activeOn({ iso: '2027-01-01' }), ['new-years-eve'])
  assert.deepEqual(activeOn({ iso: '2026-04-24', country: '' }), [])
  assert.deepEqual(activeOn({ iso: '2026-04-24' }), ['anzac-day'])
  assert.deepEqual(activeOn({ iso: '2026-06-01' }), [])
})

test('windows: a day that starts with a daylight saving jump starts at its first real instant', () => {
  const day = dayOf('2026-09-06')
  const start = localMidnightMsOf({ day, timeZone: 'America/Santiago' })
  assert.equal(start, Date.UTC(2026, 8, 6, 4))
  assert.equal(isoOf(localDayOf({ ms: start, timeZone: 'America/Santiago' })), '2026-09-06')
  assert.equal(isoOf(localDayOf({ ms: start - 1, timeZone: 'America/Santiago' })), '2026-09-05')
  assert.equal(localMidnightMsOf({ day: dayOf('2026-09-07'), timeZone: 'America/Santiago' }), Date.UTC(2026, 8, 7, 3))
})

test('windows: local days follow the install time zone', () => {
  const lateUtc = Date.UTC(2026, 10, 30, 14)
  assert.equal(isoOf(localDayOf({ ms: lateUtc, timeZone: SYDNEY })), '2026-12-01')
  assert.equal(isoOf(localDayOf({ ms: lateUtc, timeZone: 'UTC' })), '2026-11-30')
  assert.equal(localMidnightMsOf({ day: dayOf('2026-12-01'), timeZone: SYDNEY }), Date.UTC(2026, 10, 30, 13))
  assert.equal(localMidnightMsOf({ day: dayOf('2026-07-01'), timeZone: SYDNEY }), Date.UTC(2026, 5, 30, 14))
})

test('tagging: a title or episode title hit is enough, and a description needs two different words', () => {
  const christmas = occasionOf({ key: 'christmas' })
  assert.equal(match({ occasion: christmas, title: 'Christmas House Wars', synopsis: 'Three Christmas-obsessed families begin their battle.' }), 'title')
  assert.equal(match({ occasion: christmas, title: 'SpongeBob SquarePants', episode: "Sandy's Country Christmas", kind: 'kids' }), 'episode')
  assert.equal(match({ occasion: christmas, title: 'Rubble & Crew', episode: 'The Crew Builds A North Pole Village', kind: 'kids' }), 'episode')
  assert.equal(match({ occasion: occasionOf({ key: 'diwali' }), title: 'Luke Nguyen\'s India', episode: 'Pondicherry, Chennai & Diwali' }), 'episode')
  assert.equal(match({ occasion: occasionOf({ key: 'diwali' }), title: "Paul O'Grady For The Love Of Dogs: India", episode: 'Episode 4', synopsis: "Paul O'Grady celebrates Diwali, the festival of light, with the people and the animals of one of Delhi's oldest dog shelters." }), 'synopsis')
  assert.equal(match({ occasion: occasionOf({ key: 'remembrance-day' }), title: 'National Memorial Day Concert 2026', episode: 'Wednesday 11 November 2026', synopsis: 'At 11am on the 11th day of the 11th month, we pause to reflect and remember all those who have served our nation. The National Remembrance Day Ceremony from the Australian War Memorial.' }), 'synopsis')
  assert.equal(match({ occasion: occasionOf({ key: 'remembrance-day' }), title: 'The Art Of Remembrance' }), 'title')
})

test('tagging: the false positives from the guide stay out', () => {
  const christmas = occasionOf({ key: 'christmas' })
  assert.equal(match({ occasion: christmas, title: 'The Morning Edit - Find Your Christmas', channel: 'TVSN' }), null)
  assert.equal(match({ occasion: christmas, title: 'Diamonesque Gifts for Christmas', channel: 'TVSN' }), null)
  for (const channel of ['QVC', 'Shop LC', 'Gemporia', 'Ideal World', 'Jewelry Television', 'Openshop']) assert.equal(match({ occasion: christmas, title: 'Christmas Gift Ideas', channel }), null, channel)
  assert.equal(match({ occasion: christmas, title: 'Two And A Half Men', episode: "Warning, It's Dirty", synopsis: "Charlie coaches Jake on the art of infidelity while his girlfriend is away for Christmas. Evelyn brings ailing TV personality, Marty Pepper, to Charlie's Christmas gathering." }), null)
  assert.equal(match({ occasion: christmas, title: 'Breeders', episode: 'Noel', synopsis: "It's been five years since we last saw the Worsleys." }), null)
  assert.equal(match({ occasion: christmas, title: 'The Cook And The Chef', synopsis: 'Preparing for Christmas in June is not the norm for most of us, but for Maggie and Simon it is the ideal time to plan a festive season feast.' }), null)
  assert.equal(match({ occasion: christmas, title: 'Christmas in July Specials' }), null)
  assert.equal(match({ occasion: christmas, title: 'Snapped', synopsis: 'When an eight-year feud between neighbours in Santa Clarita ends in a violent confrontation.' }), null)
  assert.equal(match({ occasion: occasionOf({ key: 'anzac-day' }), title: 'Alaska Gold Diggers', episode: 'Mother Knows Best', synopsis: 'The women return to Gold Run, where a power struggle erupts.' }), null)
  assert.equal(match({ occasion: occasionOf({ key: 'mothers-day' }), title: 'Alaska Gold Diggers', episode: 'Mother Knows Best' }), null)
  assert.equal(match({ occasion: occasionOf({ key: 'remembrance-day' }), title: 'We Bare Bears', episode: 'Poppy Rangers', kind: 'kids' }), null)
  assert.equal(match({ occasion: occasionOf({ key: 'remembrance-day' }), title: "Ben & Holly's Little Kingdom", episode: 'Daisy and Poppy Go Bananas' }), null)
  assert.equal(match({ occasion: occasionOf({ key: 'easter' }), title: 'Secrets Of Easter Island' }), null)
  assert.equal(match({ occasion: christmas, title: 'Better Homes And Gardens', episode: "Joh and Charlie head to Sydney's Northern Beaches. Dr Harry visits WIRES. Juliet helps add some Christmas twinkle to your home." }), null)
  assert.equal(match({ occasion: christmas, title: 'Not Going Out', episode: "Christmas just wouldn't be Christmas without a giant inflatable Santa. Lee and Lucy go on a Christmas Eve mission." }), 'synopsis')
  assert.equal(match({ occasion: christmas, title: 'Kamp Koral', episode: 'The Ho! Ho! Christmas!' }), 'episode')
})

test('tagging: festival of lights never matches alone, and backs up Diwali or Hanukkah only in a description', () => {
  const diwali = occasionOf({ key: 'diwali' })
  const hanukkah = occasionOf({ key: 'hanukkah' })
  const cookUp = { title: 'The Cook Up With Adam Liaw', episode: 'Festival Of Lights', synopsis: 'Adam is celebrating Diwali, the festival of lights, with chefs Gunjan Aylawadi and Nagesh Seethiah.' }
  assert.equal(match({ occasion: diwali, ...cookUp }), 'synopsis')
  assert.equal(match({ occasion: hanukkah, ...cookUp }), null)
  const candles = { title: 'Kitchen Nights', episode: 'Festival Of Lights', synopsis: 'Latkes and doughnuts for Hanukkah, the festival of lights.' }
  assert.equal(match({ occasion: hanukkah, ...candles }), 'synopsis')
  assert.equal(match({ occasion: diwali, ...candles }), null)
  for (const occasion of [diwali, hanukkah]) {
    assert.equal(match({ occasion, title: 'Festival Of Lights' }), null)
    assert.equal(match({ occasion, title: 'City Nights', synopsis: 'The festival of lights fills the harbour with lasers.' }), null)
  }
  assert.equal(match({ occasion: diwali, title: 'Bollywed', synopsis: 'The clock ticks down to Diwali.' }), null)
})

test('tagging: commemorations leave out kids programmes, every occasion leaves out sport and news descriptions', () => {
  assert.equal(match({ occasion: occasionOf({ key: 'anzac-day' }), title: 'Anzac Biscuits Bake-Along', kind: 'kids' }), null)
  assert.equal(match({ occasion: occasionOf({ key: 'christmas' }), title: 'Christmas With Bluey', kind: 'kids' }), 'title')
  assert.equal(match({ occasion: occasionOf({ key: 'anzac-day' }), title: 'AFL Anzac Day Clash', kind: 'sport' }), null)
  assert.equal(match({ occasion: occasionOf({ key: 'anzac-day' }), title: 'Seven News', synopsis: 'Anzac Day dawn service crowds at Gallipoli.', news: true }), null)
  assert.equal(match({ occasion: occasionOf({ key: 'anzac-day' }), title: 'Anzac Day Dawn Service', news: true }), 'title')
})

test('tagging: the MiniLM prototype check confirms description-only hits and leaves title hits alone', () => {
  const easter = occasionOf({ key: 'easter' })
  const fishMarket = { title: 'Inside Sydney Fish Market', synopsis: 'The new market faces its first Good Friday as wild weather threatens Easter supplies.' }
  assert.equal(match({ occasion: easter, ...fishMarket }), 'synopsis')
  assert.equal(match({ occasion: easter, ...fishMarket, vector: axis(0), prototypes: [axis(1)] }), null)
  assert.equal(match({ occasion: easter, ...fishMarket, vector: axis(1), prototypes: [axis(1)] }), 'synopsis')
  assert.equal(match({ occasion: easter, title: 'Easter At The Palace', vector: axis(0), prototypes: [axis(1)] }), 'title')
})

test('row: Christmas shows below the top rows with at most 2 airings a title, as soon as 4 items and 3 titles qualify', () => {
  const result = run({ programmes: christmasGuide() })
  const keys = result.sections.map((section) => section.key)
  const row = result.sections.find((section) => section.key === 'seasonal-christmas')
  assert.equal(row.title, 'Christmas')
  assert.deepEqual(row.theme, { key: 'seasonal-christmas', title: 'Christmas', phrase: 'Christmas', seasonal: true })
  assert.ok(keys.indexOf('seasonal-christmas') > keys.indexOf('coming-up'))
  assert.ok(keys.filter((key) => key.startsWith('theme-')).every((key) => keys.indexOf(key) > keys.indexOf('seasonal-christmas')))
  assert.equal(row.items.filter((item) => item.title === 'Carols In The Domain').length, 2)
  assert.ok(row.items.every((item) => item.channelName !== 'TVSN'))
  assert.ok(!row.items.some((item) => item.title === 'Two And A Half Men'))
  const others = new Set(result.sections.filter((section) => section !== row).flatMap((section) => section.items.map((item) => item.seriesKey)))
  assert.ok(row.items.every((item) => !others.has(item.seriesKey)))
  const why = result.explanations.get(row.items[0].id)
  assert.equal(why.reasons[0].text, 'About Christmas')
  assert.ok(why.signals.includes('Christmas is on Friday 25 December'))
})

test('row: keys match the other rows, so a show you like stays in Coming up and the seasonal row skips it', () => {
  const liked = 'Carols In The Domain'
  const events = [...EVENTS, ...[1, 2, 3].flatMap((i) => [
    { id: 700 + i * 2, kind: 'record_request', title: liked, channel_id: 'seven', programme_start: NOW - i * DAY, ts: NOW - i * DAY, meta_json: '{"type":"episode"}' },
    { id: 701 + i * 2, kind: 'watch_start', title: liked, channel_id: 'seven', programme_start: NOW - i * DAY, ts: NOW - i * DAY },
  ])]
  const programmes = [...christmasGuide(), airing({ title: 'Christmas Lights Live', start: NOW + 10 * HOUR })]
  const result = run({ programmes, events })
  const comingUp = result.sections.find((section) => section.key === 'coming-up')
  const row = seasonalOf(result)
  assert.ok(comingUp.items.some((item) => item.title === liked))
  assert.ok(row.items.every((item) => item.title !== liked))
  assert.ok(row.items.every((item) => !comingUp.items.some((other) => other.seriesKey === item.seriesKey)))
})

test('row: fewer than 4 items or 3 titles shows no seasonal row', () => {
  const guide = christmasGuide()
  const threeItems = guide.filter((programme) => !/carols|santa|christmas/i.test(programme.title) || ['Christmas House Wars', 'The Christmas Movie', 'Santa Claus Lane'].includes(programme.title))
  assert.equal(seasonalOf(run({ programmes: threeItems })), undefined)
  const twoTitles = guide.filter((programme) => !/carols|santa|christmas/i.test(programme.title) || ['Christmas House Wars', 'Carols In The Domain'].includes(programme.title))
  assert.equal(seasonalOf(run({ programmes: twoTitles })), undefined)
})

test('row: no seasonal row outside a window or for an unknown country\'s local occasions', () => {
  assert.equal(seasonalOf(run({ programmes: christmasGuide(), nowMs: Date.UTC(2026, 10, 20, 1) })), undefined)
  const anzac = ['Anzac Day: The March', 'Gallipoli Remembered', 'Anzac Girls', 'Dawn Service From Canberra'].map((title, i) => airing({ title, start: Date.UTC(2026, 3, 23, 8 + i) }))
  const nowMs = Date.UTC(2026, 3, 22, 22)
  assert.equal(seasonalOf(run({ programmes: [...anzac, ...fillers({ nowMs })], nowMs }))?.title, 'Anzac Day')
  assert.equal(seasonalOf(run({ programmes: [...anzac, ...fillers({ nowMs })], nowMs, timeZone: 'UTC' })), undefined)
})

test('row: a commemoration row is plain and leaves kids programmes out', () => {
  const nowMs = Date.UTC(2026, 10, 9, 22)
  const programmes = [
    ...['The Art Of Remembrance', 'Remembrance Day Service', 'Armistice: The Last Day', 'Lest We Forget'].map((title, i) => airing({ title, start: nowMs + (i + 2) * HOUR })),
    airing({ title: 'Peppa Remembrance Day', channel_id: 'kids', start: nowMs + 3 * HOUR }),
    ...fillers({ nowMs }),
  ]
  const row = seasonalOf(run({ programmes, nowMs }))
  assert.equal(row.title, 'Remembrance Day')
  assert.deepEqual(row.theme, { key: 'seasonal-remembrance-day', title: 'Remembrance Day', phrase: 'Remembrance Day', seasonal: true, commemoration: true })
  assert.ok(!row.items.some((item) => item.title.startsWith('Peppa')))
})

test('row: overlapping windows take the nearest date, then fall back to the next one with enough items', () => {
  const nowMs = Date.UTC(2026, 11, 5, 1)
  const hanukkah = ['Hanukkah Lights', 'Chanukah Kitchen', 'The Menorah Story', 'Hanukkah Concert'].map((title, i) => airing({ title, start: nowMs + (i + 2) * HOUR }))
  const christmas = christmasGuide({ nowMs })
  const hanukkahResult = run({ programmes: [...hanukkah, ...christmas], nowMs })
  const hanukkahRow = seasonalOf(hanukkahResult)
  assert.equal(hanukkahRow?.title, 'Hanukkah')
  assert.ok(hanukkahResult.explanations.get(hanukkahRow.items[0].id).signals.includes('Hanukkah runs from Friday 4 December to Saturday 12 December'))
  assert.equal(seasonalOf(run({ programmes: [...hanukkah.slice(0, 2), ...christmas], nowMs }))?.title, 'Christmas')
})

test('row: shows for a new household, and Hide or Settings off removes it until the next window', () => {
  assert.equal(seasonalOf(run({ programmes: christmasGuide(), events: [] }))?.title, 'Christmas')
  const muteAt = (ts) => [{ id: 900, kind: 'theme_muted', series_key: 'theme-seasonal-christmas', title: 'Christmas', ts }]
  assert.equal(seasonalOf(run({ programmes: christmasGuide(), extraEvents: muteAt(NOW - HOUR) })), undefined)
  assert.equal(seasonalOf(run({ programmes: christmasGuide(), extraEvents: muteAt(Date.UTC(2025, 11, 20)) }))?.title, 'Christmas')
  assert.equal(seasonalOf(run({ programmes: christmasGuide(), themesOff: ['seasonal-christmas'] })), undefined)
})

test('mute: a hidden occasion stays hidden until its next window opens', () => {
  const christmas = occasionOf({ key: 'christmas' })
  const mutedAt = Date.UTC(2026, 11, 20)
  assert.equal(isoOf(mutedUntilOf({ occasion: christmas, country: 'au', mutedDay: dayOf('2026-12-20') })), '2027-12-01')
  assert.equal(isOccasionMuted({ occasion: christmas, country: 'au', mutedAt, nowMs: Date.UTC(2026, 11, 24), timeZone: SYDNEY }), true)
  assert.equal(isOccasionMuted({ occasion: christmas, country: 'au', mutedAt, nowMs: Date.UTC(2027, 10, 29), timeZone: SYDNEY }), true)
  assert.equal(isOccasionMuted({ occasion: christmas, country: 'au', mutedAt, nowMs: Date.UTC(2027, 11, 2), timeZone: SYDNEY }), false)
  const mutes = new Map([['seasonal-christmas', mutedAt]])
  const [hidden] = hiddenOccasionsOf({ country: 'au', mutes, nowMs: Date.UTC(2026, 11, 24), timeZone: SYDNEY })
  assert.deepEqual({ ...hidden, until: isoOf(hidden.until / DAY) }, { seriesKey: 'theme:seasonal-christmas', themeKey: 'seasonal-christmas', title: 'Christmas', theme: true, seasonal: true, hiddenAt: mutedAt, until: '2027-12-01' })
  assert.deepEqual(hiddenOccasionsOf({ country: 'au', mutes, nowMs: Date.UTC(2027, 11, 2), timeZone: SYDNEY }), [])
  const diwali = occasionOf({ key: 'diwali' })
  const lastTableMute = Date.UTC(2040, 10, 3)
  assert.equal(mutedUntilOf({ occasion: diwali, country: 'au', mutedDay: dayOf('2040-11-03') }), null)
  assert.equal(isOccasionMuted({ occasion: diwali, country: 'au', mutedAt: lastTableMute, nowMs: Date.UTC(2041, 5, 1), timeZone: SYDNEY }), true)
  assert.equal(isOccasionMuted({ occasion: diwali, country: 'au', mutedAt: lastTableMute, nowMs: Date.UTC(2041, 10, 4), timeZone: SYDNEY }), false)
  const settings = seasonalSettingsOf({ country: 'au', mutes, off: new Set(['seasonal-easter']), nowMs: Date.UTC(2026, 11, 24), timeZone: SYDNEY })
  assert.equal(settings.find((entry) => entry.key === 'seasonal-christmas').on, false)
  assert.equal(settings.find((entry) => entry.key === 'seasonal-easter').on, false)
  assert.equal(settings.find((entry) => entry.key === 'seasonal-anzac-day').on, true)
})

test('web: a seasonal row offers only Hide, keeps two airings of a title, and sits after Coming up', () => {
  const theme = { key: 'seasonal-christmas', title: 'Christmas', phrase: 'Christmas', seasonal: true }
  assert.deepEqual(rowMenuOf(theme), [{ key: 'mute-theme', label: 'Hide Christmas', icon: 'hide' }])
  assert.equal(themeMutedToastOf(theme), 'The Christmas row is hidden until next Christmas')
  assert.equal(themeMutedToastOf({ key: 'cooking', title: 'Cooking' }), 'The Cooking row is hidden for 90 days')
  const item = (id, title) => ({ id, title, seriesKey: title.toLowerCase().replace(/\s+/g, '-'), channelId: 'seven', start: NOW + HOUR, stop: NOW + 2 * HOUR })
  const payload = { sections: [
    { key: 'might-like', title: 'You might like', items: [item('1', 'Other')] },
    { key: 'seasonal-christmas', title: 'Christmas', theme, items: [{ ...item('2', 'Carols'), theme }, { ...item('3', 'Carols'), theme }] },
    { key: 'coming-up', title: 'Coming up', items: [item('4', 'Mine')] },
  ] }
  const sections = sectionsOf({ payload })
  assert.deepEqual(sections.map((section) => section.key), ['coming-up', 'seasonal-christmas', 'might-like'])
  assert.deepEqual(sections[1].rows.flatMap((row) => row.items.map((entry) => entry.id)), ['2', '3'])
  assert.equal(sections[1].theme.seasonal, true)
  const groups = themeGroupsOf([{ key: 'cooking', title: 'Cooking', on: true }, { key: 'afl', title: 'Australian rules', on: true, sport: true }, { key: 'seasonal-christmas', title: 'Christmas', on: true, seasonal: true }])
  assert.deepEqual(groups.map((group) => [group.label, group.themes.map((entry) => entry.key)]), [['Themes', ['cooking']], ['Sport', ['afl']], ['Seasonal', ['seasonal-christmas']]])
})

test('settings: Themes lists a Seasonal switch per install-country occasion, and Hide lists under hidden shows', async () => {
  await db('user_events').delete()
  const themes = (await call('GET', '/api/for-you/themes')).body.themes.filter((theme) => theme.seasonal)
  assert.deepEqual(themes.map((theme) => theme.title), ['Lunar New Year', 'Eid al-Fitr', 'Easter', 'Anzac Day', "Mother's Day", "Father's Day", 'NAIDOC Week', 'Halloween', 'Diwali', 'Remembrance Day', 'Hanukkah', 'Christmas', "New Year's Eve"])
  assert.ok(themes.every((theme) => theme.on))
  const off = (await call('PUT', '/api/for-you/themes/seasonal-halloween', { on: false })).body.themes
  assert.equal(off.find((theme) => theme.key === 'seasonal-halloween').on, false)
  assert.equal((await call('PUT', '/api/for-you/themes/seasonal-halloween', { on: true })).body.themes.find((theme) => theme.key === 'seasonal-halloween').on, true)
  assert.equal((await call('PUT', '/api/for-you/themes/seasonal-thanksgiving', { on: false })).status, 404)
  await db('user_events').insert({ ts: Date.now() - 1000, kind: 'theme_muted', series_key: 'theme-seasonal-christmas', title: 'Christmas' })
  const hidden = (await call('GET', '/api/for-you/hidden')).body
  assert.deepEqual(hidden.map((show) => [show.seriesKey, show.themeKey, show.title]), [['theme:seasonal-christmas', 'seasonal-christmas', 'Christmas']])
  assert.equal((await call('GET', '/api/for-you/themes')).body.themes.find((theme) => theme.key === 'seasonal-christmas').on, false)
  assert.equal((await call('DELETE', '/api/for-you/themes/seasonal-christmas/mute')).status, 200)
  assert.deepEqual((await call('GET', '/api/for-you/hidden')).body, [])
  assert.equal((await call('DELETE', '/api/for-you/themes/seasonal-thanksgiving/mute')).status, 404)
})

const NOW = Date.UTC(2026, 11, 14, 22)

const call = async (method, url, body) => {
  const res = await fetch(`${baseUrl}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

const occasionOf = ({ key, country = 'au' }) => occasionsFor(country).find((occasion) => occasion.key === key)

const dayOf = (iso) => dayNumberOf({ year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)), day: Number(iso.slice(8, 10)) })

const isoOf = (day) => new Date(day * DAY).toISOString().slice(0, 10)

const daysOf = ({ key, country = '' }) => [2026, 2027, 2028, 2029, 2030].flatMap((year) => occasionDaysOf({ occasion: occasionOf({ key, country: country || (key === 'matariki' ? 'nz' : 'au') }), country, year })).map(isoOf)

const match = ({ occasion, title, episode = null, synopsis = '', channel = 'Seven', kind = 'unknown', news = false, vector = null, prototypes = [] }) => occasionMatchOf({
  occasion,
  programme: { title, episode_title: episode, synopsis },
  channelName: channel,
  kind,
  news,
  vector,
  prototypes,
})

const axis = (i) => Float32Array.from({ length: 4 }, (_, j) => (j === i ? 1 : 0))

let nextId = 5000

const airing = ({ title, start, channel_id: channelId = 'seven', ...extra }) => ({
  program_id: nextId++,
  channel_id: channelId,
  title,
  episode_title: null,
  synopsis: `${title} on air`,
  start,
  end: start + HOUR,
  series_no: 1,
  episode_no: 1,
  series_link: `${channelId}|${title.toLowerCase()}`,
  genre: null,
  image: 'https://example.com/i.jpg',
  ...extra,
})

const fillers = ({ nowMs }) => ['Garden Patch', 'Quiz Night', 'Home Fix', 'Kitchen Nights', 'Late News Desk'].map((title, i) => airing({ title, start: nowMs + (i + 1) * 3 * HOUR }))

const christmasGuide = ({ nowMs = NOW } = {}) => [
  ...['Christmas House Wars', 'The Christmas Movie', 'Santa Claus Lane'].map((title, i) => airing({ title, start: nowMs + (i + 2) * HOUR })),
  ...[0, 1, 2].map((i) => airing({ title: 'Carols In The Domain', episode_title: `Part ${i + 1}`, synopsis: `Carols part ${i + 1}`, start: nowMs + (6 + i) * HOUR })),
  airing({ title: 'Diamonesque Gifts for Christmas', channel_id: 'tvsn', start: nowMs + 2 * HOUR }),
  airing({ title: 'Two And A Half Men', synopsis: "Charlie's girlfriend is away for Christmas. Evelyn brings Marty to Charlie's Christmas gathering.", start: nowMs + 9 * HOUR }),
  ...fillers({ nowMs }),
]

const CHANNELS = [{ id: 'seven', name: 'Seven' }, { id: 'tvsn', name: 'TVSN' }, { id: 'kids', name: 'ABC Kids' }]

const EVENTS = ['Garden Patch', 'Quiz Night', 'Home Fix', 'Kitchen Nights', 'Late News Desk', 'Old Favourite'].flatMap((title, i) => [
  { id: i * 2 + 1, kind: 'record_request', title, channel_id: 'seven', programme_start: NOW - (i + 1) * DAY, ts: NOW - (i + 1) * DAY, meta_json: '{"type":"episode"}' },
  { id: i * 2 + 2, kind: 'watch_start', title, channel_id: 'seven', programme_start: NOW - (i + 1) * DAY, ts: NOW - (i + 1) * DAY },
])

const run = ({ programmes, nowMs = NOW, events = EVENTS, extraEvents = [], themesOff = [], timeZone = SYDNEY }) => buildForYou({
  nowMs,
  programmes,
  events: [...events, ...extraEvents],
  channels: CHANNELS,
  timeZone,
  limit: 20,
  themesOff,
})

const seasonalOf = (result) => result.sections.find((section) => section.theme?.seasonal)
