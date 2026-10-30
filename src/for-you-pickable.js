import { CATEGORY_LABELS, categoriesOfEtsi, isFilmAiring, keywordCategoriesOf } from './genre-enrichment.js'
import { isInfomercial } from './for-you.js'
import { showKeyOf } from './web/show-key.js'

export const MAX_PICKABLE = 48

export const pickableShowsOf = ({ programmes = [], genresByKey = new Map(), pinnedChannelIds = [], nowMs = Date.now(), limit = MAX_PICKABLE, hourOf = (ms) => new Date(ms).getHours() }) => {
  const pinned = new Set(pinnedChannelIds.map(String))
  const byKey = new Map()
  for (const programme of programmes) {
    if (!(Number(programme.end) > nowMs) || Number(programme.start) > nowMs + WEEK_MS) continue
    if (isInfomercial(programme) || isFilmAiring({ programme, record: genresByKey.get(showKeyOf(programme.title)) })) continue
    const key = showKeyOf(programme.title)
    const categories = [...new Set([...(genresByKey.get(key)?.categories || []), ...categoriesOfEtsi(programme.genre), ...keywordCategoriesOf(programme.title)])]
    if (categories.some((category) => SKIPPED.has(category))) continue
    const hour = hourOf(Number(programme.start))
    const weight = (hour >= 18 && hour < 22 ? 2 : 0.3) + (pinned.has(String(programme.channel_id)) ? 1 : 0)
    const known = byKey.get(key)
    if (known) {
      known.weight += weight
      known.airings += 1
      if (!known.programme.image && programme.image) known.programme = programme
      continue
    }
    byKey.set(key, { key, programme, categories, weight, airings: 1 })
  }
  return [...byKey.values()]
    .filter((entry) => entry.programme.image)
    .map((entry) => ({ ...entry, rank: Math.min(entry.weight, CAP_WEIGHT) + (entry.programme.episode_no === 1 ? 1 : 0) }))
    .sort((a, b) => b.rank - a.rank || a.programme.title.localeCompare(b.programme.title))
    .slice(0, limit)
    .map((entry) => ({
      seriesKey: entry.key,
      title: entry.programme.title,
      image: `/api/epg/image/${encodeURIComponent(entry.programme.program_id)}`,
      genres: entry.categories.filter((category) => category !== 'movie').map((category) => CATEGORY_LABELS[category] || category),
    }))
}

const SKIPPED = new Set(['news'])
const CAP_WEIGHT = 8
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
