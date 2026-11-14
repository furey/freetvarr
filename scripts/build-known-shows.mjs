import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const truthOf = (entry) => {
  const mark = entry.mark
  if (mark?.ok) return labelKeysOf({ labels: [mark.theme], entry })
  if (mark && mark.note !== 'lookup') return labelKeysOf({ labels: mark.right.split(' + '), entry })
  if (mark || TRUSTED_CONFIDENCE.has(entry.lookup?.confidence)) return labelKeysOf({ labels: entry.lookup?.labels ?? [], entry })
  return null
}

export const knownShowEntryOf = ({ entry, truth }) => {
  const format = truth.find((key) => FORMATS.has(key)) ?? null
  const topics = truth.filter((key) => !FORMATS.has(key) && !SPORT_CODES.has(key)).slice(0, 2)
  if (!format && !topics.length) return null
  if (format === 'news' && !topics.length) return null
  const origin = originOf(entry)
  return { ...(format && { format }), ...(topics.length && { topics }), ...(origin && { origin }) }
}

export const originOf = (entry) => originOfText(entry.lookup?.text)
  ?? entry.tvmaze?.country?.toLowerCase()
  ?? entry.wikidata?.countries?.[0]?.toLowerCase()
  ?? null

const originOfText = (text = '') => DEMONYMS
  .map(([pattern, code]) => ({ code, at: String(text || '').search(pattern) }))
  .filter((match) => match.at >= 0)
  .sort((a, b) => a.at - b.at)[0]?.code

export const fixtureEntryOf = (entry) => ({
  key: entry.key,
  title: entry.title,
  film: entry.kind === 'film',
  channels: entry.channels,
  guide: entry.guide,
  genre: entry.genre ?? null,
  tvmaze: entry.tvmaze ?? null,
  wikidata: entry.wikidata ?? null,
  airings: entry.airings,
  filmGenres: entry.filmGenres ?? [],
  truth: truthOf(entry),
})

export const buildFromExport = (exported) => {
  const entries = [...exported.titles].sort((a, b) => a.key.localeCompare(b.key))
  const shows = {}
  for (const entry of entries) {
    if (entry.kind === 'film') continue
    const truth = truthOf(entry)
    const show = truth && knownShowEntryOf({ entry, truth })
    if (show) shows[entry.key] = show
  }
  return {
    knownShows: { version: KNOWN_SHOWS_VERSION, built: exported.built, shows },
    fixture: { built: exported.built, country: exported.country, titles: entries.map(fixtureEntryOf) },
  }
}

const labelKeysOf = ({ labels, entry }) => {
  const keys = keysOfLabels({ labels, entry })
  if (keys.length) return keys
  const fallback = keysOfLabels({ labels: entry.lookup?.labels ?? [], entry })
  return fallback.length ? fallback : null
}

const keysOfLabels = ({ labels, entry }) => [...new Set(labels.flatMap((label) => keysOfLabel({ label, entry })))]

const keysOfLabel = ({ label, entry }) => {
  if (DROPPED.has(label)) return []
  if (label === 'Science and health') return [SCIENCE_AND_HEALTH_SPLIT[entry.key] ?? 'science-and-technology']
  const key = LABEL_KEYS[label]
  if (!key) throw new Error(`No category key for label "${label}" (${entry.key})`)
  return [key]
}

const main = async () => {
  const [exportPath] = process.argv.slice(2)
  if (!exportPath) throw new Error('Usage: node scripts/build-known-shows.mjs <audit-export.json>')
  const { knownShows, fixture } = buildFromExport(JSON.parse(await fs.readFile(exportPath, 'utf8')))
  await fs.writeFile(path.join(REPO_ROOT, 'src', 'data', 'known-shows.json'), `${JSON.stringify(knownShows, null, 1)}\n`)
  await fs.writeFile(path.join(REPO_ROOT, 'test', 'fixtures', 'category-audit.json'), `${JSON.stringify(fixture)}\n`)
  console.log(`wrote ${Object.keys(knownShows.shows).length} known shows and ${fixture.titles.length} fixture titles`)
}

const KNOWN_SHOWS_VERSION = 1
const TRUSTED_CONFIDENCE = new Set(['high', 'medium'])
const DROPPED = new Set(['Special interest', 'Other', 'None'])

const LABEL_KEYS = {
  Reality: 'reality',
  'Quiz and game shows': 'quiz',
  Comedy: 'comedy',
  Drama: 'drama',
  'Crime drama': 'crime-drama',
  Documentaries: 'documentaries',
  'Talk shows': 'talk-shows',
  'Morning shows': 'talk-shows',
  Kids: 'kids',
  Animation: 'kids',
  News: 'news',
  Cooking: 'cooking',
  'Home and property': 'home',
  Gardening: 'gardening',
  'Politics and current affairs': 'politics',
  'True crime': 'true-crime',
  'Police and rescue': 'police-rescue',
  Medical: 'medical',
  Health: 'health-and-lifestyle',
  Lifestyle: 'health-and-lifestyle',
  'Health and lifestyle': 'health-and-lifestyle',
  Fitness: 'health-and-lifestyle',
  Science: 'science-and-technology',
  Technology: 'science-and-technology',
  'Science and technology': 'science-and-technology',
  'Nature and animals': 'nature',
  Travel: 'travel',
  History: 'history',
  War: 'military-and-war',
  'Military and war': 'military-and-war',
  'Life in Australia': 'local-life',
  'Music and arts': 'music-arts',
  'Entertainment news': 'entertainment-news',
  'Mystery and paranormal': 'mystery-and-paranormal',
  'Engineering and machines': 'engineering-and-machines',
  'Business and money': 'business-and-money',
  Motoring: 'motoring',
  Fishing: 'fishing',
  Antiques: 'antiques',
  Shopping: 'shopping',
  Religion: 'religion',
  Sport: 'other-sport',
  Watersports: 'other-sport',
  'Australian rules': 'afl',
  'Rugby league': 'rugby-league',
  'Rugby union': 'rugby-union',
  Cricket: 'cricket',
  'Football (soccer)': 'soccer',
  'American football': 'american-football',
  Tennis: 'tennis',
  Motorsport: 'motorsport',
  'Horse racing': 'horse-racing',
  'Greyhound racing': 'greyhound-racing',
  Rodeo: 'rodeo',
  Golf: 'golf',
  Netball: 'netball',
  Basketball: 'basketball',
  Baseball: 'baseball',
  'Ice hockey': 'ice-hockey',
  Cycling: 'cycling',
  'Combat sports': 'combat-sports',
  Surfing: 'surfing',
  Swimming: 'swimming',
}

const SCIENCE_AND_HEALTH_SPLIT = {
  botched: 'medical',
  'dr-pimple-popper': 'medical',
  'the-surgery-ship': 'medical',
  '24-hours-in-emergency': 'medical',
  'medical-emergency': 'medical',
  'house-calls-to-the-rescue': 'medical',
  'healthy-wealthy-wise': 'health-and-lifestyle',
  'house-of-wellness': 'health-and-lifestyle',
  'gen-well': 'health-and-lifestyle',
  'sex-unlimited': 'health-and-lifestyle',
}

const FORMATS = new Set(['reality', 'quiz', 'comedy', 'drama', 'crime-drama', 'documentaries', 'talk-shows', 'kids', 'news'])

const SPORT_CODES = new Set(Object.values(LABEL_KEYS).filter((key) => ![
  ...FORMATS, 'cooking', 'home', 'gardening', 'politics', 'true-crime', 'police-rescue', 'medical', 'health-and-lifestyle',
  'science-and-technology', 'nature', 'travel', 'history', 'military-and-war', 'local-life', 'music-arts', 'entertainment-news',
  'mystery-and-paranormal', 'engineering-and-machines', 'business-and-money', 'motoring', 'fishing', 'antiques', 'shopping', 'religion',
].includes(key)))

const DEMONYMS = [
  [/\bAmerican\b/, 'us'],
  [/\b(British|English|Scottish|Welsh)\b/, 'gb'],
  [/\bAustralian\b/, 'au'],
  [/\bNew Zealand\b/, 'nz'],
  [/\bCanadian\b/, 'ca'],
  [/\bIrish\b/, 'ie'],
  [/\bFrench\b/, 'fr'],
  [/\bGerman\b/, 'de'],
  [/\bDanish\b/, 'dk'],
  [/\bSwedish\b/, 'se'],
  [/\bNorwegian\b/, 'no'],
  [/\bJapanese\b/, 'jp'],
  [/\b(South )?Korean\b/, 'kr'],
  [/\bItalian\b/, 'it'],
  [/\bSpanish\b/, 'es'],
  [/\bDutch\b/, 'nl'],
  [/\bBelgian\b/, 'be'],
  [/\bIcelandic\b/, 'is'],
  [/\bFinnish\b/, 'fi'],
  [/\bIndian\b/, 'in'],
  [/\bChinese\b/, 'cn'],
  [/\bMalaysian\b/, 'my'],
  [/\bFilipino\b/, 'ph'],
]

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
