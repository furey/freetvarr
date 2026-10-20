import { foldText, normaliseSearchText, withoutAccents, withoutRegionWords } from './search-text.js'

export const SEARCH_SCORES = { title: 100, contains: 90, alias: 85, yours: 85, 'known-as': 80, initials: 70, fuzzy: 60 }

export const MIN_SEARCH_LENGTH = 2

export const buildSearchIndex = ({ entries = [], curated = [], aliases = [] }) => {
  const curatedByKey = curatedNamesByKey(curated)
  const aliasesByKey = aliasNamesByKey(aliases)
  const items = entries.filter((entry) => entry?.title).map((entry) => {
    const norm = normaliseSearchText(entry.title)
    return {
      entry,
      norm,
      spaced: ` ${norm}`,
      words: norm.split(' '),
      names: [...(curatedByKey.get(norm) || []), ...(aliasesByKey.get(entry.key) || [])]
        .filter((name) => name.norm && name.norm !== norm),
    }
  })
  return { items, byInitials: initialsIndexOf(items), byTrigram: trigramIndexOf(items) }
}

export const searchIndex = ({ index, query, limit = Infinity }) => {
  const needle = normaliseSearchText(query)
  if (needle.length < MIN_SEARCH_LENGTH) return []
  const regionless = withoutRegionWords(needle)
  const probe = probeOf({ needle, regionless })
  const direct = index.items.map((item) => directMatchOf({ item, probe })).filter(Boolean)
  if (direct.length >= INITIALS_BELOW) return rankMatches(direct).slice(0, limit)
  const matchedKeys = new Set(direct.map((match) => match.entry.key))
  const initials = initialsMatchesOf({ index, query }).filter((match) => !matchedKeys.has(match.entry.key))
  const found = [...rankMatches(direct), ...rankMatches(initials).slice(0, MAX_INITIALS)]
  if (found.length) return rankMatches(found).slice(0, limit)
  return fuzzyMatchesOf({ index, needle: regionless || needle }).slice(0, limit)
}

export const rankMatches = (matches) => [...matches].sort(compareMatches)

export const compareMatches = (a, b) => b.score - a.score
  || soonnessOf(a.entry) - soonnessOf(b.entry)
  || (b.entry.recordingCount || 0) - (a.entry.recordingCount || 0)
  || (a.position ?? 0) - (b.position ?? 0)
  || a.entry.title.length - b.entry.title.length
  || a.entry.title.localeCompare(b.entry.title)

export const curatedKeysOf = (title) => [...new Set([
  normaliseSearchText(title),
  normaliseSearchText(String(title ?? '').replace(/\([^)]*\)/g, ' ')),
])]

export const initialsOf = (title) => {
  const words = casedWordsOf(title)
  const variants = new Set()
  const regionlessLength = regionlessLengthOf(words)
  const lengths = regionlessLength === words.length ? [words.length] : [words.length, regionlessLength]
  for (const length of lengths) {
    const parts = { all: '', significant: '', kept: '' }
    for (const word of words.slice(0, length)) {
      parts.all += word[0]
      if (STOP_WORDS.has(word.toLowerCase())) continue
      parts.significant += word[0]
      parts.kept += KEPT_TOKEN.test(word) ? word : word[0]
    }
    for (const variant of Object.values(parts)) if (variant.length >= 2) variants.add(variant.toUpperCase())
  }
  return [...variants]
}

export const isInitialsQuery = (query) => {
  const trimmed = String(query ?? '').trim()
  if (/\s/.test(trimmed)) return false
  return compactOf(trimmed).replace(/[0-9]/g, '').length >= MIN_INITIALS_LETTERS
}

export const typoDistance = (a, b) => {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j += 1) rows[0][j] = j
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1)
    }
  }
  return rows[a.length][b.length]
}

export const allowedTypos = (length) => {
  if (length >= 6) return 2
  if (length >= 4) return 1
  return 0
}

export const trigramsOf = (norm) => {
  const padded = `  ${norm} `
  const grams = new Set()
  for (let i = 0; i < padded.length - 2; i += 1) grams.add(trigramCodeAt(padded, i))
  return grams
}

const directMatchOf = ({ item, probe }) => {
  const titleMatch = titleMatchOf({ item, probe })
  const best = item.names.reduce((top, name) => {
    const candidate = nameMatchOf({ name, probe })
    return candidate && candidate.score > (top?.score ?? -1) ? candidate : top
  }, titleMatch)
  return best && { entry: item.entry, ...best }
}

const titleMatchOf = ({ item, probe }) => {
  const wordPosition = item.spaced.indexOf(probe.spacedNeedle)
  if (wordPosition >= 0) return { score: SEARCH_SCORES.title, reason: 'title', position: wordPosition }
  const position = probe.regionless ? item.norm.indexOf(probe.regionless) : -1
  return position >= 0 ? { score: SEARCH_SCORES.contains, reason: 'contains', position } : null
}

const nameMatchOf = ({ name, probe }) => {
  const matches = name.spaced.includes(probe.spacedNeedle) || (probe.regionless && name.spaced.includes(probe.spacedRegionless))
  if (!matches) return null
  const isExactNickname = name.norm === probe.needle && name.reason !== 'known-as'
  const score = isExactNickname ? SEARCH_SCORES.title + EXACT_NICKNAME_BONUS : SEARCH_SCORES[name.reason]
  return { score, reason: name.reason, matchedName: name.name, position: 0 }
}

const probeOf = ({ needle, regionless }) => ({ needle, regionless, spacedNeedle: ` ${needle}`, spacedRegionless: ` ${regionless}` })

const initialsMatchesOf = ({ index, query }) => {
  if (!isInitialsQuery(query)) return []
  const items = index.byInitials.get(compactOf(query).toUpperCase()) || []
  return items.map((item) => ({ entry: item.entry, score: SEARCH_SCORES.initials, reason: 'initials', position: 0 }))
}

const fuzzyMatchesOf = ({ index, needle }) => {
  const needleGrams = trigramsOf(needle)
  const needleWords = needle.split(' ')
  const shared = new Uint16Array(index.items.length)
  for (const gram of needleGrams) for (const position of index.byTrigram.get(gram) || []) shared[position] += 1
  const shortlist = []
  shared.forEach((count, position) => {
    const containment = count / needleGrams.size
    if (containment >= MIN_CONTAINMENT) shortlist.push({ item: index.items[position], containment })
  })
  return shortlist
    .sort((a, b) => b.containment - a.containment)
    .slice(0, FUZZY_SHORTLIST)
    .filter(({ item }) => needleWords.every((word) => item.words.some((titleWord) => isNearWord({ word, titleWord }))))
    .map(({ item, containment }) => ({ entry: item.entry, score: SEARCH_SCORES.fuzzy * containment, reason: 'fuzzy', position: 0 }))
    .sort(compareMatches)
    .slice(0, MAX_FUZZY)
}

const isNearWord = ({ word, titleWord }) => {
  if (titleWord.startsWith(word)) return true
  const allowed = allowedTypos(word.length)
  if (!allowed) return false
  return typoDistance(word, titleWord) <= allowed || typoDistance(word, titleWord.slice(0, word.length)) <= allowed
}

const trigramIndexOf = (items) => {
  const byTrigram = new Map()
  items.forEach((item, position) => {
    const padded = `  ${item.norm} `
    for (let i = 0; i < padded.length - 2; i += 1) {
      const gram = trigramCodeAt(padded, i)
      const postings = byTrigram.get(gram)
      if (!postings) byTrigram.set(gram, [position])
      else if (postings.at(-1) !== position) postings.push(position)
    }
  })
  return byTrigram
}

const trigramCodeAt = (text, i) => (text.charCodeAt(i) << 16) | (text.charCodeAt(i + 1) << 8) | text.charCodeAt(i + 2)

const initialsIndexOf = (items) => {
  const byInitials = new Map()
  for (const item of items) {
    for (const variant of initialsOf(item.entry.title)) {
      if (!byInitials.has(variant)) byInitials.set(variant, [])
      byInitials.get(variant).push(item)
    }
  }
  return byInitials
}

const curatedNamesByKey = (curated) => {
  const byKey = new Map()
  for (const { title, aliases = [] } of curated) {
    const names = aliases.map((name) => nameOf({ name, reason: 'alias' }))
    for (const key of curatedKeysOf(title)) byKey.set(key, [...(byKey.get(key) || []), ...names])
  }
  return byKey
}

const aliasNamesByKey = (aliases) => {
  const byKey = new Map()
  for (const { key, name, source } of aliases) {
    byKey.set(key, [...(byKey.get(key) || []), nameOf({ name, reason: source === 'user' ? 'yours' : 'known-as' })])
  }
  return byKey
}

const nameOf = ({ name, reason }) => {
  const norm = normaliseSearchText(name)
  return { name, reason, norm, spaced: ` ${norm}` }
}

const casedWordsOf = (title) => (withoutAccents(String(title ?? '')).replace(/[’'`]/g, '').match(/[A-Za-z0-9]+|[&+]/g) || [])
  .map((word) => (word === '&' || word === '+' ? 'and' : word))

const regionlessLengthOf = (words) => {
  let length = words.length
  while (length > 1 && REGION_SUFFIXES.has(words[length - 1].toLowerCase())) length -= 1
  return length
}

const compactOf = (text) => foldText(text).replace(/[^a-z0-9]/g, '')

const soonnessOf = (entry) => (Number.isFinite(entry.nextStart) ? entry.nextStart : Infinity)

const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'and', 'at', 'in', 'on', 'to', 'with', 'for'])
const REGION_SUFFIXES = new Set(['au', 'aus', 'australia', 'nz', 'uk', 'us'])
const KEPT_TOKEN = /^(?:[0-9]+|[A-Z0-9]{2,})$/
const EXACT_NICKNAME_BONUS = 1
const INITIALS_BELOW = 3
const MAX_INITIALS = 3
const MIN_INITIALS_LETTERS = 3
const MIN_CONTAINMENT = 0.6
const FUZZY_SHORTLIST = 50
const MAX_FUZZY = 3
