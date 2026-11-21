import { airingLooksLikeFilm, movieChoiceOf } from './genre-enrichment.js'
import { showKeyOf } from './web/show-key.js'
import { isSportOneOff } from './series-kind.js'
import { KIND_SOURCES, ONE_OFF_KIND, requestKindOf } from './title-kinds.js'

export const airingKindOf = ({ programme, record = null, airingsInWeek = 1, evidence = null }) => {
  if (airingLooksLikeFilm({ programme, record, airingsInWeek })) return 'movie'
  if (isSportOneOff({ title: programme?.title, recordings: [{ genre: programme?.genre ?? null }], evidence })) return 'one-off'
  if (isKnownTvShow(record) || hasEpisodeDetails(programme)) return 'series'
  return airingsInWeek >= SERIES_MIN_AIRINGS ? 'series' : 'one-off'
}

export const displayKindOf = ({ programme, record = null, airingsInWeek = 1, evidence = null }) => {
  const airingKind = airingKindOf({ programme, record, airingsInWeek, evidence })
  return requestKindOf({ row: record?.titleKind ?? null, hint: airingKind }) ?? airingKind
}

export const createDisplayKinds = ({ programmes = [], recordsByKey = new Map(), evidence = new Map(), kindOf = displayKindOf }) => {
  const airings = airingsByTitleOf(programmes)
  return (programme) => {
    const key = showKeyOf(programme?.title)
    return kindOf({
      programme,
      record: recordsByKey.get(key) || null,
      airingsInWeek: airings.get(key) || 1,
      evidence: evidence.get(key) ?? null,
    })
  }
}

export const isConfirmedOneOff = ({ programme, record = null, evidence = null }) => {
  const row = record?.titleKind ?? null
  if (row?.kind === ONE_OFF_KIND && (CONFIRMING_SOURCES.has(row.source) || row.evidence?.guide?.sport)) return true
  return isSportOneOff({ title: programme?.title, recordings: [{ genre: programme?.genre ?? null }], evidence })
}

export const createConfirmedOneOffs = ({ recordsByKey = new Map(), evidence = new Map() }) => (programme) => {
  const key = showKeyOf(programme?.title)
  return isConfirmedOneOff({ programme, record: recordsByKey.get(key) || null, evidence: evidence.get(key) ?? null })
}

export const createAiringKinds = (inputs) => createDisplayKinds({ ...inputs, kindOf: airingKindOf })

export const withDisplayKinds = ({ programmes, kindOf, confirmedOneOffOf = () => false }) => programmes.map((programme) => {
  const kind = kindOf(programme)
  const movieChoice = guideMovieChoiceOf({ programme, kind })
  const confirmed = kind === ONE_OFF_KIND && confirmedOneOffOf(programme)
  return {
    ...programme,
    kind,
    ...(movieChoice && { movieChoice }),
    ...(confirmed && { one_off_confirmed: true }),
  }
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
const CONFIRMING_SOURCES = new Set([KIND_SOURCES.override, KIND_SOURCES.library])
