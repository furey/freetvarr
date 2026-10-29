export const SHOW = 'show'
export const ONE_OFF = 'oneoff'
export const FILM = 'movie'

export const seriesKindOf = ({
  title = '',
  override = null,
  hasRule = false,
  isFilm = false,
  recordings = [],
  evidence = null,
}) => {
  if (override === 'show') return SHOW
  if (override === 'one-off') return ONE_OFF
  if (override === 'movie') return FILM
  if (hasRule) return SHOW
  if (isFilm && override !== 'not-movie') return FILM
  if (localDaysOf(recordings) >= MIN_DAYS) return SHOW
  const facts = mergeSeriesFacts(evidence, seriesFactsOf(recordings))
  if (facts.recurs || facts.realSeason) return SHOW
  if (isEventTitle(title) || facts.awardShow) return ONE_OFF
  if (facts.minDatedEpisode >= 2) return SHOW
  if (facts.minDatedEpisode != null && !facts.sports) return SHOW
  return ONE_OFF
}

export const seriesFactsOf = (airings = []) => {
  const firstDayByKey = new Map()
  const facts = { ...NO_FACTS }
  for (const airing of airings) {
    const key = episodeKeyOf(airing)
    const day = localDayOf(airing.start)
    if (key && day && !firstDayByKey.has(key)) firstDayByKey.set(key, day)
    if (isSportsGenre(airing)) facts.sports = true
    if (airing.season == null) continue
    if (!isYearSeason({ season: airing.season, start: airing.start })) {
      facts.realSeason = true
      continue
    }
    if (airing.episode != null) facts.minDatedEpisode = minOf(facts.minDatedEpisode, Number(airing.episode))
  }
  facts.recurs = firstDayByKey.size >= MIN_DAYS && new Set(firstDayByKey.values()).size >= MIN_DAYS
  return facts
}

export const mergeSeriesFacts = (a, b) => ({
  recurs: Boolean(a?.recurs || b?.recurs),
  realSeason: Boolean(a?.realSeason || b?.realSeason),
  sports: Boolean(a?.sports || b?.sports),
  awardShow: Boolean(a?.awardShow || b?.awardShow),
  minDatedEpisode: minOf(a?.minDatedEpisode ?? null, b?.minDatedEpisode ?? null),
})

export const rowAiringOf = (row) => ({
  start: Number(row.aired_at) || Date.parse(row.imported_at ?? '') || null,
  season: row.season ?? null,
  episode: row.episode ?? null,
  episodeTitle: row.episode_title ?? null,
  genres: parseGenres(row.genres_json),
})

export const isYearSeason = ({ season, start }) => {
  const value = Number(season)
  if (!Number.isInteger(value)) return false
  if (value >= 1900 && value <= 2100) return true
  const year = new Date(Number(start) || Date.now()).getFullYear() % 100
  return Math.abs(value - year) <= 1
}

export const isEventTitle = (title) => EVENT_TITLE.test(String(title || ''))

export const localDayOf = (ms) => {
  const value = Number(ms)
  if (!Number.isFinite(value) || value <= 0) return null
  const date = new Date(value)
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

const localDaysOf = (recordings) => new Set(recordings.map((r) => localDayOf(r.start)).filter(Boolean)).size

const episodeKeyOf = ({ season, episode, episodeTitle }) => {
  if (episode != null) return `${season ?? ''}x${episode}`
  const subtitle = String(episodeTitle || '').trim().toLowerCase()
  return subtitle ? `t:${subtitle}` : null
}

const isSportsGenre = ({ genre, genres }) => [genre, ...(genres || [])]
  .some((code) => Number.isInteger(Number(code)) && Number(code) >> 4 === SPORTS_GROUP)

const parseGenres = (json) => {
  try {
    const genres = JSON.parse(json || '[]')
    return Array.isArray(genres) ? genres.map(Number) : []
  } catch {
    return []
  }
}

const minOf = (a, b) => {
  if (a == null) return b
  if (b == null) return a
  return Math.min(a, b)
}

const NO_FACTS = { recurs: false, realSeason: false, sports: false, awardShow: false, minDatedEpisode: null }
const MIN_DAYS = 2
const SPORTS_GROUP = 0x4
const EVENT_TITLE = new RegExp([
  '\\bgrand final\\b',
  '\\bawards?\\b',
  '\\blogies\\b',
  '\\btelethon\\b',
  '\\bcarols\\b',
  '\\bconcert\\b',
  '^live:',
  '\\bmelbourne cup\\b',
  '\\bderby day\\b',
  '^special:',
  '\\bceremony\\b',
  '\\belection\\b',
  '\\bvotes\\b',
].join('|'), 'i')
