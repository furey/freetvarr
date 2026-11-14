import OCCASION_TABLE from './data/occasion-dates.json' with { type: 'json' }

export const SEASONAL_PREFIX = 'seasonal-'
export const SEASONAL_MIN_ITEMS = 4
export const SEASONAL_MIN_TITLES = 3
export const SEASONAL_PER_TITLE = 2
export const OCCASION_PROTOTYPE_FLOOR = 0.35

export const seasonalKeyOf = (occasionKey) => `${SEASONAL_PREFIX}${occasionKey}`

export const isSeasonalKey = (key) => String(key || '').startsWith(SEASONAL_PREFIX)

export const occasionKeyOf = (seasonalKey) => String(seasonalKey || '').slice(SEASONAL_PREFIX.length)

export const occasionsFor = (country = '') => OCCASIONS.filter((occasion) => !occasion.countries || occasion.countries.includes(country))

export const occasionOf = ({ key, country = '' }) => occasionsFor(country).find((occasion) => occasion.key === occasionKeyOf(key) || occasion.key === key) || null

export const dayNumberOf = ({ year, month, day }) => Date.UTC(year, month - 1, day) / DAY_MS

export const datePartsOf = (dayNumber) => {
  const date = new Date(dayNumber * DAY_MS)
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

export const easterOf = (year) => {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return dayNumberOf({ year, month, day })
}

export const nthWeekdayOf = ({ year, month, weekday, nth }) => {
  const first = dayNumberOf({ year, month, day: 1 })
  const offset = (weekday - weekdayOf(first) + 7) % 7
  return first + offset + (nth - 1) * 7
}

export const tableDatesOf = ({ key, year }) => (OCCASION_TABLE.dates[key] || [])
  .filter((iso) => Number(iso.slice(0, 4)) === year)
  .map((iso) => dayNumberOf({ year, month: Number(iso.slice(5, 7)), day: Number(iso.slice(8, 10)) }))

export const occasionDaysOf = ({ occasion, country = '', year }) => [occasion.dayOf({ year, country })].flat().filter(Number.isFinite)

export const windowsOf = ({ occasion, country = '', fromYear, toYear = fromYear }) => {
  const windows = []
  for (let year = fromYear; year <= toYear; year += 1) {
    for (const day of occasionDaysOf({ occasion, country, year })) windows.push({ day, start: day - occasion.before, end: day + occasion.after })
  }
  return windows.sort((a, b) => a.start - b.start)
}

export const activeOccasionsOf = ({ country = '', today }) => {
  const { year } = datePartsOf(today)
  return occasionsFor(country)
    .flatMap((occasion) => windowsOf({ occasion, country, fromYear: year - 1, toYear: year + 1 })
      .filter((window) => window.start <= today && today <= window.end)
      .map((window) => ({ occasion, ...window })))
    .sort((a, b) => Math.abs(a.day - today) - Math.abs(b.day - today) || b.day - a.day)
}

export const mutedUntilOf = ({ occasion, country = '', mutedDay }) => {
  const { year } = datePartsOf(mutedDay)
  return windowsOf({ occasion, country, fromYear: year, toYear: year + 2 }).find((window) => window.start > mutedDay)?.start ?? null
}

export const isOccasionMuted = ({ occasion, country = '', mutedAt, nowMs, timeZone }) => {
  if (mutedAt == null) return false
  return localDayOf({ ms: nowMs, timeZone }) < muteEndDayOf({ occasion, country, mutedAt, timeZone })
}

export const localDayOf = ({ ms, timeZone }) => {
  const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(new Date(Number(ms)))
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, Number(part.value)]))
  return dayNumberOf(parts)
}

export const localMidnightMsOf = ({ day, timeZone }) => {
  const wall = day * DAY_MS
  const guess = wall - offsetAt({ ms: wall, timeZone })
  let ms = wall - offsetAt({ ms: guess, timeZone })
  while (localDayOf({ ms, timeZone }) < day) ms += DST_STEP_MS
  return ms
}

export const occasionMatchOf = ({ occasion, programme, channelName = '', kind = 'unknown', news = false, vector = null, prototypes = [] }) => {
  if (SHOPPING_CHANNEL.test(channelName) || kind === 'sport') return null
  if (occasion.commemoration && kind === 'kids') return null
  const clean = (text) => String(text || '').replace(occasion.negatives ?? NO_MATCH, ' ')
  if (occasion.words.test(clean(programme.title))) return 'title'
  const episode = clean(programme.episode_title)
  const describes = isDescription(episode)
  if (!describes && occasion.words.test(episode)) return 'episode'
  const synopsis = describes ? `${episode} ${clean(programme.synopsis)}` : clean(programme.synopsis)
  if (news || !occasion.words.test(synopsis) || distinctTermsOf({ text: synopsis, occasion }) + supportingTermsOf({ text: synopsis, occasion }) < SYNOPSIS_TERMS) return null
  if (!vector || !prototypes.length) return 'synopsis'
  return Math.max(...prototypes.map((prototype) => dotOf(vector, prototype))) >= OCCASION_PROTOTYPE_FLOOR ? 'synopsis' : null
}

export const occasionPrototypeTextsOf = (country = '') => occasionsFor(country).flatMap((occasion) => occasion.prototypes)

export const seasonalSettingsOf = ({ country = '', off = new Set(), mutes = new Map(), nowMs, timeZone }) => occasionsFor(country).map((occasion) => ({
  key: seasonalKeyOf(occasion.key),
  title: occasion.title,
  seasonal: true,
  on: !off.has(seasonalKeyOf(occasion.key)) && !isOccasionMuted({ occasion, country, mutedAt: mutes.get(seasonalKeyOf(occasion.key)), nowMs, timeZone }),
}))

export const hiddenOccasionsOf = ({ country = '', mutes = new Map(), nowMs, timeZone }) => occasionsFor(country)
  .filter((occasion) => isOccasionMuted({ occasion, country, mutedAt: mutes.get(seasonalKeyOf(occasion.key)), nowMs, timeZone }))
  .map((occasion) => {
    const key = seasonalKeyOf(occasion.key)
    const hiddenAt = mutes.get(key)
    const until = muteEndDayOf({ occasion, country, mutedAt: hiddenAt, timeZone })
    return { seriesKey: `category:${key}`, categoryKey: key, title: occasion.title, category: true, seasonal: true, hiddenAt, until: until * DAY_MS }
  })

const isDescription = (text) => text.length > DESCRIPTION_LENGTH || /[a-z]{2}[.!?]\s+[A-Z]/.test(text)

const muteEndDayOf = ({ occasion, country, mutedAt, timeZone }) => {
  const mutedDay = localDayOf({ ms: mutedAt, timeZone })
  return mutedUntilOf({ occasion, country, mutedDay }) ?? mutedDay + UNDATED_MUTE_DAYS
}

const weekdayOf = (dayNumber) => (dayNumber + 4) % 7

const fixed = (month, day) => ({ year }) => dayNumberOf({ year, month, day })

const byCountry = (rules) => ({ year, country }) => rules[country]?.(year) ?? null

const distinctTermsOf = ({ text, occasion }) => new Set([...String(text).matchAll(globalWordsOf(occasion))].map((match) => match[0].toLowerCase().replace(/[’']/g, ''))).size

const supportingTermsOf = ({ text, occasion }) => (occasion.supporting?.test(text) ? 1 : 0)

const globalWordsOf = (occasion) => {
  if (!globalWords.has(occasion.key)) globalWords.set(occasion.key, new RegExp(occasion.words.source, 'gi'))
  return globalWords.get(occasion.key)
}

const globalWords = new Map()

const dotOf = (a, b) => {
  let sum = 0
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i]
  return sum
}

const formatterFor = (timeZone) => {
  const zone = timeZone || 'UTC'
  if (!formatters.has(zone)) {
    formatters.set(zone, new Intl.DateTimeFormat('en-AU', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric' }))
  }
  return formatters.get(zone)
}

const formatters = new Map()

const offsetAt = ({ ms, timeZone }) => {
  const parts = Object.fromEntries(clockFormatterFor(timeZone).formatToParts(new Date(ms))
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, Number(part.value)]))
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - (ms - (ms % 60_000))
}

const clockFormatterFor = (timeZone) => {
  const zone = timeZone || 'UTC'
  if (!clockFormatters.has(zone)) {
    clockFormatters.set(zone, new Intl.DateTimeFormat('en-AU', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }))
  }
  return clockFormatters.get(zone)
}

const clockFormatters = new Map()

const SUNDAY = 0
const THURSDAY = 4
const DAY_MS = 24 * 60 * 60 * 1000
const SYNOPSIS_TERMS = 2
const UNDATED_MUTE_DAYS = 365
const DST_STEP_MS = 15 * 60 * 1000
const DESCRIPTION_LENGTH = 80
const NO_MATCH = /$^/g
const SHOPPING_CHANNEL = /shop|tvsn|qvc|\bhsn\b|gemporia|jewel(le)?ry|ideal world|gems? tv|shopping/i
const FIRST_SUNDAY_JULY = (year) => nthWeekdayOf({ year, month: 7, weekday: SUNDAY, nth: 1 })

const OCCASIONS = [
  {
    key: 'lunar-new-year',
    title: 'Lunar New Year',
    dayOf: ({ year }) => tableDatesOf({ key: 'lunar-new-year', year }),
    before: 5,
    after: 1,
    words: /\b(lunar new year|chinese new year|vietnamese new year|seollal|t[eế]t festival|year of the (rat|ox|tiger|rabbit|dragon|snake|horse|goat|sheep|monkey|rooster|dog|pig))\b/i,
    prototypes: ['Lunar New Year celebrations with family feasts, dumplings, red envelopes, lion dances and fireworks for the Chinese New Year.'],
  },
  {
    key: 'waitangi-day',
    title: 'Waitangi Day',
    countries: ['nz'],
    commemoration: true,
    dayOf: fixed(2, 6),
    before: 3,
    after: 0,
    words: /\bwaitangi\b/i,
    prototypes: ['Waitangi Day marks the signing of the Treaty of Waitangi between Māori chiefs and the Crown in 1840.'],
  },
  {
    key: 'eid-al-fitr',
    title: 'Eid al-Fitr',
    dayOf: ({ year }) => tableDatesOf({ key: 'eid-al-fitr', year }),
    before: 5,
    after: 1,
    words: /\b(eid al-fitr|eid ul-fitr|eid|ramadan|iftar)\b/i,
    prototypes: ['Muslim families break the Ramadan fast and celebrate Eid al-Fitr with prayers, feasts and gifts.'],
  },
  {
    key: 'easter',
    title: 'Easter',
    dayOf: ({ year }) => easterOf(year),
    before: 7,
    after: 1,
    words: /\b(easter|good friday|palm sunday|hot cross buns?)\b/i,
    negatives: /\beaster island\b/gi,
    prototypes: ['An Easter special with chocolate eggs, the Easter bunny, hot cross buns and the Easter story.'],
  },
  {
    key: 'anzac-day',
    title: 'Anzac Day',
    countries: ['au', 'nz'],
    commemoration: true,
    dayOf: fixed(4, 25),
    before: 3,
    after: 0,
    words: /\b(anzacs?|gallipoli|dawn service)\b/i,
    prototypes: ['Anzac Day commemorates the Australian and New Zealand soldiers who served and died at Gallipoli and in later wars.'],
  },
  {
    key: 'mothers-day',
    title: "Mother's Day",
    countries: ['au', 'nz', 'uk', 'us'],
    dayOf: byCountry({
      au: (year) => nthWeekdayOf({ year, month: 5, weekday: SUNDAY, nth: 2 }),
      nz: (year) => nthWeekdayOf({ year, month: 5, weekday: SUNDAY, nth: 2 }),
      us: (year) => nthWeekdayOf({ year, month: 5, weekday: SUNDAY, nth: 2 }),
      uk: (year) => easterOf(year) - 21,
    }),
    before: 3,
    after: 0,
    words: /\b(mother[’']?s day|mothering sunday)\b/i,
    prototypes: ["A Mother's Day special celebrating mums with gifts, breakfast in bed and family."],
  },
  {
    key: 'fathers-day',
    title: "Father's Day",
    countries: ['au', 'nz', 'uk', 'us'],
    dayOf: byCountry({
      au: (year) => nthWeekdayOf({ year, month: 9, weekday: SUNDAY, nth: 1 }),
      nz: (year) => nthWeekdayOf({ year, month: 9, weekday: SUNDAY, nth: 1 }),
      uk: (year) => nthWeekdayOf({ year, month: 6, weekday: SUNDAY, nth: 3 }),
      us: (year) => nthWeekdayOf({ year, month: 6, weekday: SUNDAY, nth: 3 }),
    }),
    before: 3,
    after: 0,
    words: /\bfather[’']?s day\b/i,
    prototypes: ["A Father's Day special celebrating dads with gifts and family."],
  },
  {
    key: 'fourth-of-july',
    title: 'Fourth of July',
    countries: ['us'],
    dayOf: fixed(7, 4),
    before: 3,
    after: 0,
    words: /\b(fourth of july|4th of july|independence day)\b/i,
    prototypes: ['Fourth of July Independence Day fireworks, parades and barbecues across America.'],
  },
  {
    key: 'naidoc-week',
    title: 'NAIDOC Week',
    countries: ['au'],
    commemoration: true,
    dayOf: ({ year }) => FIRST_SUNDAY_JULY(year),
    before: 0,
    after: 7,
    words: /\bnaidoc\b/i,
    prototypes: ['NAIDOC Week recognises the history, culture and achievements of Aboriginal and Torres Strait Islander peoples.'],
  },
  {
    key: 'matariki',
    title: 'Matariki',
    countries: ['nz'],
    dayOf: ({ year }) => tableDatesOf({ key: 'matariki', year }),
    before: 7,
    after: 0,
    words: /\b(matariki|puanga)\b/i,
    prototypes: ['Matariki, the Māori New Year, when the Matariki star cluster rises and people remember the dead and plan for the year ahead.'],
  },
  {
    key: 'halloween',
    title: 'Halloween',
    countries: ['au', 'nz', 'uk', 'us'],
    dayOf: fixed(10, 31),
    before: 7,
    after: 0,
    words: /\b(halloween|hallowe[’']?en|trick[- ]or[- ]treat(ing)?)\b/i,
    prototypes: ['A spooky Halloween special with costumes, trick or treating, pumpkins and haunted houses.'],
  },
  {
    key: 'diwali',
    title: 'Diwali',
    dayOf: ({ year }) => tableDatesOf({ key: 'diwali', year }),
    before: 5,
    after: 1,
    words: /\b(diwali|deepavali|divali)\b/i,
    supporting: /\bfestival of lights?\b/i,
    prototypes: ['Diwali, the Hindu festival of lights, celebrated with lamps, sweets, fireworks and family feasts.'],
  },
  {
    key: 'bonfire-night',
    title: 'Bonfire Night',
    countries: ['uk'],
    dayOf: fixed(11, 5),
    before: 4,
    after: 0,
    words: /\b(bonfire night|guy fawkes|gunpowder plot)\b/i,
    prototypes: ['Bonfire Night remembers Guy Fawkes and the Gunpowder Plot with bonfires and fireworks.'],
  },
  {
    key: 'remembrance-day',
    title: 'Remembrance Day',
    countries: ['au', 'nz', 'uk'],
    commemoration: true,
    dayOf: byCountry({
      au: (year) => dayNumberOf({ year, month: 11, day: 11 }),
      nz: (year) => dayNumberOf({ year, month: 11, day: 11 }),
      uk: (year) => nthWeekdayOf({ year, month: 11, weekday: SUNDAY, nth: 2 }),
    }),
    before: 3,
    after: 0,
    words: /\b(remembrance|armistice|lest we forget|cenotaph|poppy appeal|poppies|11th (day|hour) of the 11th month|eleventh hour of the eleventh day)\b/i,
    prototypes: ['Remembrance Day honours the service personnel who died in war, with a minute of silence at the eleventh hour.'],
  },
  {
    key: 'thanksgiving',
    title: 'Thanksgiving',
    countries: ['us'],
    dayOf: ({ year }) => nthWeekdayOf({ year, month: 11, weekday: THURSDAY, nth: 4 }),
    before: 7,
    after: 0,
    words: /\bthanksgiving\b/i,
    prototypes: ['A Thanksgiving special with family, turkey dinner, pumpkin pie and football.'],
  },
  {
    key: 'hanukkah',
    title: 'Hanukkah',
    dayOf: ({ year }) => tableDatesOf({ key: 'hanukkah', year }),
    before: 1,
    after: 7,
    words: /\b(hanukkah|chanukah|hanukah|chanukkah|menorah|dreidels?)\b/i,
    supporting: /\bfestival of lights?\b/i,
    prototypes: ['Hanukkah, the Jewish festival of lights, with the menorah, dreidels, latkes and eight nights of candles.'],
  },
  {
    key: 'christmas',
    title: 'Christmas',
    dayOf: fixed(12, 25),
    before: 24,
    after: 1,
    words: /\b(christmas|xmas|santa claus|santa[’']s|santa(?! (clarita|monica|barbara|fe|cruz|ana|carla|rosa|maria|catalina|teresa|anita|lucia)\b)|father christmas|yuletide|nativity|reindeer|mistletoe|north pole|carols|festive season)\b/i,
    negatives: /\bchristmas (in (june|july)|island)\b/gi,
    prototypes: ['A Christmas special with Santa, presents, carols, the Christmas tree and family gathered for the festive season.'],
  },
  {
    key: 'new-years-eve',
    title: "New Year's Eve",
    dayOf: fixed(12, 31),
    before: 4,
    after: 1,
    words: /\b(new year[’']?s eve|new year[’']?s day|hogmanay|new year countdown)\b/i,
    prototypes: ["New Year's Eve countdown to midnight with fireworks, concerts and parties to welcome the new year."],
  },
]
