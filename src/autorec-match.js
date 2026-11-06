export const escapeAutorecTitle = (title) => String(title ?? '').replace(REGEX_SYNTAX, '\\$&')

export const anchorAutorecTitle = (title, variants = []) => {
  const titles = distinctTitlesOf([title, ...variants])
  const body = titles.length === 1 ? escapeAutorecTitle(titles[0]) : `(${titles.map(escapeAutorecTitle).join('|')})`
  return `^${body}${SAME_SHOW_SUFFIX}`
}

export const literalTitleOf = (pattern) => anchoredLiteralOf(pattern) ?? plainLiteralOf(pattern)

export const anchoredLiteralOf = (pattern) => anchoredTitlesOf(pattern)?.titles[0] ?? null

export const anchoredTitlesOf = (pattern) => {
  const source = String(pattern ?? '')
  const suffix = [SAME_SHOW_SUFFIX, FOREIGN_EDITIONS_SUFFIX].find((candidate) => source.endsWith(candidate))
  if (!source.startsWith('^') || !suffix) return null
  const foreignEditions = suffix === FOREIGN_EDITIONS_SUFFIX
  const titles = titlesOfBody({ body: source.slice(1, -suffix.length), variantsAllowed: !foreignEditions })
  return titles ? { titles, foreignEditions } : null
}

export const isCurrentAnchor = (pattern) => anchoredTitlesOf(pattern)?.foreignEditions === false

export const isSameShowTitle = ({ title, show, foreignEditions = false }) => {
  const text = String(title ?? '').toLowerCase()
  const wanted = String(show ?? '').toLowerCase()
  if (!wanted || !text.startsWith(wanted)) return false
  const rest = SAME_SHOW_REST.exec(text.slice(wanted.length))
  if (!rest) return false
  return foreignEditions || rest[1] == null || !FOREIGN_EDITION_REST.test(rest[1])
}

const distinctTitlesOf = (titles) => {
  const seen = new Set()
  return titles.map((title) => String(title ?? '').trim()).filter((title) => {
    const key = title.toLowerCase()
    if (!title || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const titlesOfBody = ({ body, variantsAllowed }) => {
  const single = plainLiteralOf(body)
  if (single) return [single]
  if (!variantsAllowed || !body.startsWith('(') || !body.endsWith(')') || isEscapedAt(body, body.length - 1)) return null
  const titles = unescapedPartsOf(body.slice(1, -1)).map(plainLiteralOf)
  return titles.length > 1 && titles.every(Boolean) ? titles : null
}

const unescapedPartsOf = (source) => {
  const parts = ['']
  for (let at = 0; at < source.length; at++) {
    const char = source[at]
    if (char === '|') {
      parts.push('')
      continue
    }
    parts[parts.length - 1] += char
    if (char === '\\' && at + 1 < source.length) parts[parts.length - 1] += source[++at]
  }
  return parts
}

const plainLiteralOf = (pattern) => {
  const source = String(pattern ?? '')
  let literal = ''
  for (let at = 0; at < source.length; at++) {
    const char = source[at]
    if (char === '\\') {
      const escaped = source[++at]
      if (escaped === undefined || !REGEX_SYNTAX_CHARS.includes(escaped)) return null
      literal += escaped
    } else if (REGEX_SYNTAX_CHARS.includes(char)) {
      return null
    } else {
      literal += char
    }
  }
  return literal
}

export const autorecMatchFieldsOf = (raw = {}) => ({
  title: raw.title || '',
  fulltext: Boolean(raw.fulltext),
  weekdays: Array.isArray(raw.weekdays) ? raw.weekdays.map(Number) : ALL_WEEKDAYS,
  start: minutesOfClock(raw.start),
  startWindow: minutesOfClock(raw.start_window),
  minDuration: Number(raw.minduration) || 0,
  maxDuration: Number(raw.maxduration) || 0,
  serieslink: raw.serieslink || '',
  unsupported: UNSUPPORTED_FIELDS.some((field) => isSet(raw[field])),
})

export const autorecMatchesAiring = ({ autorec, programme, channelId }) => {
  const match = autorec?.match
  if (!match || autorec.enabled === false || match.unsupported) return false
  if (!match.title && !match.serieslink) return false
  if (autorec.channelId && String(autorec.channelId) !== String(channelId ?? programme.channel_id)) return false
  if (match.title && !titleMatches({ match, programme })) return false
  if (match.serieslink && match.serieslink !== programme.serieslink_uri) return false
  const start = new Date(Number(programme.start))
  if (!match.weekdays.includes(weekdayOf(start))) return false
  if (!isInStartWindow({ match, start })) return false
  return isInDuration({ match, seconds: (Number(programme.end) - Number(programme.start)) / 1000 })
}

export const matchingAutorecOf = ({ autorecs = [], programme, channelId }) =>
  autorecs.find((autorec) => autorecMatchesAiring({ autorec, programme, channelId })) || null

const titleMatches = ({ match, programme }) => {
  const matcher = matcherOf(match.title)
  const texts = match.fulltext
    ? [programme.title, programme.episode_title, programme.synopsis]
    : [programme.title]
  return texts.some((text) => Boolean(text) && matcher(String(text).slice(0, MAX_MATCHED_TEXT_LENGTH)))
}

const matcherOf = (title) => {
  if (!compiled.has(title)) compiled.set(title, buildMatcher(title))
  return compiled.get(title)
}

const buildMatcher = (title) => {
  const anchored = anchoredTitlesOf(title)
  if (anchored) {
    const { titles, foreignEditions } = anchored
    return (text) => titles.some((show) => isSameShowTitle({ title: text, show, foreignEditions }))
  }
  const literal = plainLiteralOf(title)
  if (literal != null) {
    const wanted = literal.toLowerCase()
    return (text) => text.toLowerCase().includes(wanted)
  }
  const pattern = safeRegexOf(title)
  return pattern ? (text) => pattern.test(text) : () => false
}

const safeRegexOf = (title) => {
  const source = withoutRedundantWildcards(title)
  if (!isLinearEnough(source)) {
    console.warn(`[autorec] not matching a series rule with a slow pattern: ${title.slice(0, 80)}`)
    return null
  }
  try {
    return new RegExp(source, 'i')
  } catch {
    return null
  }
}

const withoutRedundantWildcards = (source) => {
  let trimmed = source
  while (trimmed.startsWith('.*')) trimmed = trimmed.slice(2)
  while (trimmed.endsWith('.*') && !isEscapedAt(trimmed, trimmed.length - 2)) trimmed = trimmed.slice(0, -2)
  return trimmed
}

const isEscapedAt = (source, at) => {
  let slashes = 0
  for (let before = at - 1; before >= 0 && source[before] === '\\'; before--) slashes++
  return slashes % 2 === 1
}

const isLinearEnough = (source) => {
  if (source.length > MAX_PATTERN_LENGTH) return false
  const groups = [newGroup()]
  let lastGroup = null
  let paths = 1
  for (let at = 0; at < source.length; at++) {
    const char = source[at]
    const quantifier = quantifierAt(source, at)
    if (quantifier) {
      if (quantifier.repeats && lastGroup?.variable) return false
      paths *= quantifier.choices
      groups.at(-1).variable = true
      at = quantifier.end
      lastGroup = null
      continue
    }
    lastGroup = null
    if (char === '\\') {
      if (/[1-9k]/.test(source[at + 1] ?? '')) return false
      at++
    } else if (char === '[') {
      at = classEndOf(source, at)
    } else if (char === '(') {
      groups.push(newGroup())
      at += groupPrefixAt(source, at).length
    } else if (char === ')' && groups.length > 1) {
      lastGroup = groups.pop()
      paths *= lastGroup.branches
      lastGroup.variable ||= lastGroup.branches > 1
      groups.at(-1).variable ||= lastGroup.variable
    } else if (char === '|') {
      groups.at(-1).branches++
    }
  }
  return paths * groups[0].branches * MAX_MATCHED_TEXT_LENGTH <= MAX_MATCH_STEPS
}

const newGroup = () => ({ branches: 1, variable: false })

const quantifierAt = (source, at) => {
  const char = source[at]
  const lazyEnd = (end) => (source[end + 1] === '?' ? end + 1 : end)
  if (char === '*' || char === '+') return { repeats: true, choices: MAX_MATCHED_TEXT_LENGTH, end: lazyEnd(at) }
  if (char === '?') return { repeats: false, choices: 2, end: lazyEnd(at) }
  if (char !== '{') return null
  const range = /^\{(\d+)(,(\d*))?\}/.exec(source.slice(at))
  if (!range) return null
  const least = Number(range[1])
  const most = range[2] ? (range[3] === '' ? Infinity : Number(range[3])) : least
  const choices = Math.min(MAX_MATCHED_TEXT_LENGTH, most - least + 1)
  return { repeats: most > 1, choices, end: lazyEnd(at + range[0].length - 1) }
}

const groupPrefixAt = (source, at) => /^\?(<[^>=!]*>|<=|<!|[:=!])/.exec(source.slice(at + 1))?.[0] ?? ''

const classEndOf = (source, at) => {
  for (let end = at + 1; end < source.length; end++) {
    if (source[end] === '\\') end++
    else if (source[end] === ']' && end > at + 1) return end
  }
  return source.length
}

const weekdayOf = (date) => ((date.getDay() + 6) % 7) + 1

const isInStartWindow = ({ match, start }) => {
  if (match.start == null || match.startWindow == null) return true
  const minute = start.getHours() * 60 + start.getMinutes() + start.getSeconds() / 60
  return match.start <= match.startWindow
    ? minute >= match.start && minute <= match.startWindow
    : minute >= match.start || minute <= match.startWindow
}

const isInDuration = ({ match, seconds }) => {
  if (match.minDuration > 0 && seconds < match.minDuration) return false
  return !(match.maxDuration > 0 && seconds > match.maxDuration)
}

const minutesOfClock = (value) => {
  const clock = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim())
  if (!clock) return null
  const minutes = Number(clock[1]) * 60 + Number(clock[2])
  return minutes < 24 * 60 ? minutes : null
}

const isSet = (value) => Array.isArray(value) ? value.length > 0 : Boolean(value) && value !== '0'

const compiled = new Map()

const notAnyOfPattern = (words) => {
  const root = { children: new Map(), terminal: false }
  for (const word of words) {
    let node = root
    for (const char of word.toUpperCase()) {
      if (!node.children.has(char)) node.children.set(char, { children: new Map(), terminal: false })
      node = node.children.get(char)
    }
    node.terminal = true
  }
  return trieComplementOf(root)
}

const trieComplementOf = (node) => {
  const chars = [...node.children.keys()]
  const branches = [
    chars.length ? `[^${chars.map(bothCasesOf).join('')}].*` : '.+',
    ...[...node.children].map(([char, child]) => `${literalOf(char)}${trieComplementOf(child)}`),
  ]
  if (branches.length === 1) return branches[0]
  return node.terminal ? `(${branches.join('|')})` : `(${branches.join('|')})?`
}

const bothCasesOf = (char) => (char.toLowerCase() === char ? char : `${char}${char.toLowerCase()}`)

const literalOf = (char) => (REGEX_SYNTAX_CHARS.includes(char) ? `\\${char}` : char)

const FOREIGN_EDITION_TAGS = ['UK', 'US', 'USA']
const FOREIGN_EDITION_FORMS = FOREIGN_EDITION_TAGS.flatMap((tag) => [tag, `${tag})`, ` ${tag}`, ` ${tag})`])
const FOREIGN_EDITION_REST = new RegExp(`^ ?(${FOREIGN_EDITION_TAGS.join('|')})\\)?$`, 'i')
const FOREIGN_EDITIONS_SUFFIX = '( ?[:(-].*)?$'
const SAME_SHOW_REST = /^(?: ?[:(-](.*))?$/s
const REGEX_SYNTAX_CHARS = '.*+?^${}()|[]\\'
const REGEX_SYNTAX = /[.*+?^${}()|[\]\\]/g
export const SAME_SHOW_SUFFIX = `( ?[:(-]${notAnyOfPattern(FOREIGN_EDITION_FORMS)})?$`
const MAX_PATTERN_LENGTH = 200
const MAX_MATCHED_TEXT_LENGTH = 500
const MAX_MATCH_STEPS = 1_000_000

const ALL_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7]

const UNSUPPORTED_FIELDS = ['tag', 'content_type', 'cat1', 'cat2', 'cat3', 'star_rating', 'btype', 'brand', 'season']
