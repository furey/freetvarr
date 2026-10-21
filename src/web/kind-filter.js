export const kindOfQuery = (query) => KIND_WORDS.get(normalisedQuery(query)) ?? null

export const kindFilterChoicesOf = ({ query, nameLabel }) => {
  const kind = kindOfQuery(query)
  if (!kind) return []
  return [
    { key: 'kind', label: KIND_CHOICE_LABELS[kind], icon: 'kind' },
    { key: 'name', label: nameLabel(String(query).trim()), icon: 'name' },
  ]
}

export const airingPairOf = ({ programmes = [], nowMs }) => {
  let now = null
  let next = null
  for (const programme of programmes) {
    if (programme.start <= nowMs && programme.end > nowMs) now = programme
    else if (programme.start > nowMs && (!next || programme.start < next.start)) next = programme
  }
  return { now, next }
}

export const airsKindNowOrNext = ({ now, next, kind }) => now?.kind === kind || next?.kind === kind

export const showsMovieChip = (programme) => programme?.kind === 'movie'

export const MOVIE_CHIP_TEXT = 'Movie'

const normalisedQuery = (query) => String(query ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

const KIND_WORDS = new Map([
  ['film', 'movie'],
  ['films', 'movie'],
  ['movie', 'movie'],
  ['movies', 'movie'],
  ['series', 'series'],
  ['show', 'series'],
  ['shows', 'series'],
  ['one-off', 'one-off'],
  ['one off', 'one-off'],
  ['oneoff', 'one-off'],
])

const KIND_CHOICE_LABELS = {
  movie: 'Movies showing now or next',
  series: 'Series showing now or next',
  'one-off': 'One-offs showing now or next',
}
