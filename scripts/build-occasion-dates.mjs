import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT = path.join(REPO_ROOT, 'src', 'data', 'occasion-dates.json')
const FIRST_YEAR = 2026
const LAST_YEAR = 2040

export const buildOccasionDates = ({ Holidays, firstYear = FIRST_YEAR, lastYear = LAST_YEAR }) => {
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, offset) => firstYear + offset)
  const calendar = calendarHolidaysOf(Holidays)
  const newZealand = new Holidays('NZ')
  return {
    source: 'scripts/build-occasion-dates.mjs',
    credit: 'Lunar New Year, Eid al-Fitr, Hanukkah, and Matariki dates from date-holidays (https://github.com/commenthol/date-holidays), data CC BY-SA 3.0. Diwali dates from the new moon (Meeus, Astronomical Algorithms, chapter 49) in India Standard Time.',
    years: [firstYear, lastYear],
    dates: {
      'lunar-new-year': years.flatMap((year) => datesNamed({ holidays: calendar, year, name: 'lunar-new-year' })),
      'eid-al-fitr': years.flatMap((year) => datesNamed({ holidays: calendar, year, name: 'eid-al-fitr' })),
      hanukkah: years.flatMap((year) => datesNamed({ holidays: calendar, year, name: 'hanukkah' })),
      diwali: years.map(diwaliOf),
      matariki: years.flatMap((year) => newZealand.getHolidays(year).filter((holiday) => holiday.name === 'Matariki').map(isoDateOf)),
    },
  }
}

export const diwaliOf = (year) => {
  const conjunctions = newMoonsNear(year).map((ms) => isoDateOf({ date: new Date(ms + IST_OFFSET_MS - AMAVASYA_EVENING_MS) }))
  return conjunctions.find((date) => date >= `${year}-10-17` && date <= `${year}-11-15`)
}

export const newMoonMsOf = (k) => {
  const t = k / 1236.85
  const e = 1 - 0.002516 * t - 0.0000074 * t * t
  const sun = radiansOf(2.5534 + 29.1053567 * k - 0.0000014 * t * t)
  const moon = radiansOf(201.5643 + 385.81693528 * k + 0.0107582 * t * t + 0.00001238 * t ** 3)
  const latitude = radiansOf(160.7108 + 390.67050284 * k - 0.0016118 * t * t - 0.00000227 * t ** 3)
  const node = radiansOf(124.7746 - 1.56375588 * k + 0.0020672 * t * t)
  const mean = 2451550.09766 + 29.530588861 * k + 0.00015437 * t * t - 0.00000015 * t ** 3
  const correction = -0.4072 * Math.sin(moon)
    + 0.17241 * e * Math.sin(sun)
    + 0.01608 * Math.sin(2 * moon)
    + 0.01039 * Math.sin(2 * latitude)
    + 0.00739 * e * Math.sin(moon - sun)
    - 0.00514 * e * Math.sin(moon + sun)
    + 0.00208 * e * e * Math.sin(2 * sun)
    - 0.00111 * Math.sin(moon - 2 * latitude)
    - 0.00057 * Math.sin(moon + 2 * latitude)
    + 0.00056 * e * Math.sin(2 * moon + sun)
    - 0.00042 * Math.sin(3 * moon)
    + 0.00042 * e * Math.sin(sun + 2 * latitude)
    + 0.00038 * e * Math.sin(sun - 2 * latitude)
    - 0.00024 * e * Math.sin(2 * moon - sun)
    - 0.00017 * Math.sin(node)
  return (mean + correction - UNIX_EPOCH_JD) * DAY_MS
}

const newMoonsNear = (year) => {
  const first = Math.floor((year + 0.75 - 2000) * 12.3685)
  return [first - 1, first, first + 1, first + 2].map(newMoonMsOf)
}

const calendarHolidaysOf = (Holidays) => {
  const holidays = new Holidays()
  holidays.setHoliday('chinese 01-0-01', { name: 'lunar-new-year', type: 'observance' })
  holidays.setHoliday('1 Shawwal', { name: 'eid-al-fitr', type: 'observance' })
  holidays.setHoliday('25 Kislev', { name: 'hanukkah', type: 'observance' })
  return holidays
}

const datesNamed = ({ holidays, year, name }) => holidays.getHolidays(year).filter((holiday) => holiday.name === name).map(isoDateOf)

const isoDateOf = (holiday) => (typeof holiday.date === 'string' ? holiday.date.slice(0, 10) : holiday.date.toISOString().slice(0, 10))

const radiansOf = (degrees) => (degrees % 360) * Math.PI / 180

const DAY_MS = 24 * 60 * 60 * 1000
const UNIX_EPOCH_JD = 2440587.5
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
const AMAVASYA_EVENING_MS = 18 * 60 * 60 * 1000

const isCli = process.argv[1] === fileURLToPath(import.meta.url)
if (isCli) {
  const require = createRequire(path.join(path.resolve(process.argv[2] || REPO_ROOT), 'package.json'))
  const Holidays = require('date-holidays')
  const table = buildOccasionDates({ Holidays })
  await fs.writeFile(OUTPUT, `${JSON.stringify(table, null, 2)}\n`)
  console.log(`Wrote ${path.relative(REPO_ROOT, OUTPUT)}`)
}
