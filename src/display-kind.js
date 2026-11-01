import { isFilmAiring, movieChoiceOf } from './genre-enrichment.js'
import { showKeyOf } from './web/show-key.js'
import { isSportOneOff } from './series-kind.js'

export const displayKindOf = ({ programme, record = null, airingsInWeek = 1, evidence = null }) => {
  if (isFilmAiring({ programme, record, airingsInWeek })) return 'movie'
  if (isSportOneOff({ title: programme?.title, recordings: [{ genre: programme?.genre ?? null }], evidence })) return 'one-off'
  if (isKnownTvShow(record) || hasEpisodeDetails(programme)) return 'series'
  return airingsInWeek >= SERIES_MIN_AIRINGS ? 'series' : 'one-off'
}

export const createDisplayKinds = ({ programmes = [], recordsByKey = new Map(), evidence = new Map() }) => {
  const airings = airingsByTitleOf(programmes)
  return (programme) => {
    const key = showKeyOf(programme?.title)
    return displayKindOf({
      programme,
      record: recordsByKey.get(key) || null,
      airingsInWeek: airings.get(key) || 1,
      evidence: evidence.get(key) ?? null,
    })
  }
}

export const withDisplayKinds = ({ programmes, kindOf }) => programmes.map((programme) => {
  const kind = kindOf(programme)
  const movieChoice = guideMovieChoiceOf({ programme, kind })
  return movieChoice ? { ...programme, kind, movieChoice } : { ...programme, kind }
})

export const guideMovieChoiceOf = ({ programme, kind }) => (kind === 'series'
  ? null
  : movieChoiceOf({ programme, film: kind === 'movie' }))

const isKnownTvShow = (record) => String(record?.source || '').startsWith('tvmaze:')

const hasEpisodeDetails = (programme) =>
  programme?.series_no != null || programme?.episode_no != null || Boolean(programme?.episode_title)

const airingsByTitleOf = (programmes) => {
  const airings = new Map()
  for (const programme of programmes) {
    const key = showKeyOf(programme.title)
    airings.set(key, (airings.get(key) || 0) + 1)
  }
  return airings
}

const SERIES_MIN_AIRINGS = 3
