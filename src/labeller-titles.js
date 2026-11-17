import { titleFactsOf } from './for-you-categories.js'
import { genreTagsLookupOf } from './for-you.js'
import { classificationTitleKey } from './classification-labels.js'
import { GENRE_TAG_LABELS, genreTagsOfEtsi } from './genre-enrichment.js'
import { labellerInputOf } from './labeller.js'
import { showKeyOf } from './web/show-key.js'

export const labellerTitlesOf = ({ programmes, channels = [], records, guideGenres = new Map(), index, kindOf = () => null, hourOf = (ms) => new Date(ms).getHours() }) => {
  const channelNames = new Map(channels.map((channel) => [String(channel.id), channel.name]))
  const airings = new Map()
  for (const programme of programmes) airings.set(showKeyOf(programme.title), (airings.get(showKeyOf(programme.title)) || 0) + 1)
  const genreTagsOf = genreTagsLookupOf({ records, airings, country: index.country })
  const guideGenresOf = (title) => guideGenres.get(classificationTitleKey(title)) || []
  const titles = titleFactsOf({
    programmes,
    keyOf: showKeyOf,
    genreTagsOf,
    recordOf: (key) => records.get(key),
    channelNames,
    guideGenresOf,
    isFilm: (programme) => kindOf(programme) === 'movie' || genreTagsOf(programme).includes('movie'),
    hourOf,
  })
  const byKey = programmesByKey(programmes)
  return [...titles.values()]
    .filter((facts) => !facts.film && !facts.override && !facts.labeller)
    .map((facts) => {
      const airingsOfTitle = byKey.get(facts.key) ?? []
      return {
        key: facts.key,
        input: labellerInputOf({
          title: facts.title,
          programmes: airingsOfTitle,
          channelNames,
          guideGenres: guideGenresOf(facts.title),
          genreByte: genreByteOf({ genre: facts.genre, country: index.country }),
          country: index.country,
        }),
      }
    })
}

export const genreByteOf = ({ genre, country }) => {
  const code = Number(genre)
  if (!Number.isInteger(code) || code <= 0) return null
  const name = genreTagsOfEtsi(code, country).map((tag) => GENRE_TAG_LABELS[tag]).find(Boolean)
  return [`0x${code.toString(16).padStart(2, '0')}`, name].filter(Boolean).join(' ')
}

const programmesByKey = (programmes) => {
  const byKey = new Map()
  for (const programme of programmes) {
    const key = showKeyOf(programme.title)
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push(programme)
  }
  return byKey
}
