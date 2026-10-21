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
  const pattern = regexOf(match.title)
  if (!pattern) return false
  const texts = match.fulltext
    ? [programme.title, programme.episode_title, programme.synopsis]
    : [programme.title]
  return texts.some((text) => Boolean(text) && pattern.test(text))
}

const regexOf = (title) => {
  if (!compiled.has(title)) compiled.set(title, compileCaseless(title))
  return compiled.get(title)
}

const compileCaseless = (title) => {
  try {
    return new RegExp(title, 'i')
  } catch {
    return null
  }
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

const ALL_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7]

const UNSUPPORTED_FIELDS = ['tag', 'content_type', 'cat1', 'cat2', 'cat3', 'star_rating', 'btype', 'brand', 'season']
