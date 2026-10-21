import { showKeyOf as rawShowKeyOf } from './web/show-key.js'
import { airingCoverCheckOf, airingIdentityOf, coveredProgrammeIdsOf, preferredAiringsOf } from './airing-identity.js'
import { orderChannels } from './channel-order.js'
import {
  CATEGORY_LABELS,
  categoriesOfEtsi,
  isFilmAiring,
  keywordCategoriesOf,
  tvmazeFactsOf,
} from './genre-enrichment.js'
import {
  DISMISS_WINDOW_DAYS,
  affinitySourceOf,
  channelHabitOf,
  createKeyResolver,
  engagedShowCountOf,
  hourHabitOf,
  likedShowsOf,
  localHourOf,
  profileOf,
} from './for-you-profile.js'
import {
  SIMILARITY_SCALES,
  bm25VectorsOf,
  dotProduct,
  meanVectorOf,
  nearestLikedOf,
  similarityScoreOf,
  sparseCosine,
  unitVectorOf,
} from './for-you-similarity.js'
import { embedTextOf, textHashOf } from './for-you-texts.js'
import {
  TOP_RATED_LIMIT,
  hasRealScore,
  isOtherLanguage,
  otherLanguageChoiceFrom,
  otherLanguageLimitOf,
  weightedScoreOf,
  withinLanguageLimit,
} from './top-rated.js'

export const COLD_START_SHOWS = 5
export const DEFAULT_LIMIT = 10
export const SECTION_TITLES = {
  'coming-up': 'Coming up from your shows',
  'new-seasons': 'New seasons and returns',
  'might-like': 'You might like',
  'top-rated': 'Top rated movies this week',
  movies: 'Movies this week',
  premieres: 'Premieres this week',
}

export const buildForYou = ({
  nowMs = Date.now(),
  programmes = [],
  history = [],
  channels = [],
  events = [],
  recordings = [],
  scheduledProgramIds = new Set(),
  ruleKeys = new Set(),
  genresByKey = new Map(),
  vectorsByHash = null,
  pinnedChannelIds = [],
  limit = DEFAULT_LIMIT,
  horizonMs = WEEK_MS,
  hourOf = localHourOf,
  tier = 'basic',
  filmFacts = new Map(),
  otherLanguageFilms = 'few',
  channelPrefs = null,
  autorecs = [],
}) => {
  const listedChannels = channelPrefs ? orderChannels({ channels, ...channelPrefs }) : channels
  const candidates = programmes.filter((programme) => isCandidateAiring({ programme, nowMs, horizonMs }))
  const identity = airingIdentityOf({ programmes: candidates, channels: listedChannels })
  const preferred = new Set(preferredAiringsOf({ identity, nowMs }).map((airing) => airing.programme))
  const upcoming = candidates.filter((programme) => preferred.has(programme))
  const records = recordsOf(genresByKey)
  const airings = airingCountsOf(upcoming)
  const knownKeys = new Set([...upcoming, ...history].map((programme) => showKeyOf(programme.title)))
  for (const event of events) if (event.series_key) knownKeys.add(event.series_key)
  const keyOf = createKeyResolver(knownKeys)
  const profile = profileOf({ events, recordings, nowMs, keyOf, hourOf })
  const coldStart = engagedShowCountOf(profile) < COLD_START_SHOWS
  const channelNames = new Map(channels.map((channel) => [String(channel.id), channel.name]))
  const context = {
    nowMs,
    hourOf,
    profile,
    channelNames,
    pinned: new Set(pinnedChannelIds.map(String)),
    coldStart,
    categoriesOf: categoriesLookupOf({ records, airings }),
    isPremiere: premiereCheckOf({ upcoming, history, records, nowMs, channelNames: new Map(channels.map((channel) => [String(channel.id), channel.name])) }),
    recorded: recordedEpisodesOf({ recordings, keyOf }),
    scheduledProgramIds: new Set([...scheduledProgramIds].map(String)),
    coveredProgramIds: coveredProgrammeIdsOf({ identity, isCovered: airingCoverCheckOf({ scheduledProgramIds, autorecs }) }),
    ruleKeys,
    filmFactsOf: (programme) => filmFacts.get(programme.title) || null,
  }
  context.genreShares = genreSharesOf({ profile, categoriesOf: context.categoriesOf, programmes: [...upcoming, ...history] })
  context.similarity = similarityContextOf({ profile, upcoming, history, recordings, keyOf, vectorsByHash, tier })

  const scored = upcoming
    .filter((programme) => !isExcluded({ programme, context }))
    .map((programme) => scoreAiring({ programme, context }))
    .filter(Boolean)
  const best = bestAiringPerShow(scored)
  const otherLimit = otherLanguageLimitOf(otherLanguageFilms)
  const topRated = topRatedOf({ upcoming, context })
  const sections = coldStart
    ? coldStartSections({ items: best, topRated, limit, otherLimit })
    : sectionsOf({ items: best, topRated, limit, nowMs, genreShares: context.genreShares, otherLimit })
  const explanations = new Map(scored.map((entry) => [entry.item.id, explanationOf({ entry, context })]))
  for (const entry of sections.find((section) => section.key === 'top-rated')?.entries || []) {
    explanations.set(entry.item.id, topRatedExplanationOf(entry))
  }
  return {
    tier,
    coldStart,
    otherLanguageFilms: otherLanguageChoiceFrom(otherLanguageFilms),
    similarity: context.similarity.method,
    generatedAt: nowMs,
    topPick: topPickOf(sections),
    sections: sections.map(({ key, entries }) => ({ key, title: SECTION_TITLES[key], items: entries.map((entry) => entry.item) })),
    explanations,
  }
}

export const isInfomercial = ({ title = '', synopsis = '' }) => INFOMERCIAL_TITLE.test(String(title).trim())
  || INFOMERCIAL_TEXT.test(`${title} ${synopsis}`)

export const isRepeatChannel = (name) => REPEAT_CHANNEL.test(String(name || ''))

export const premiereCheckOf = ({ upcoming = [], history = [], records = new Map(), channelNames = new Map(), nowMs = Date.now() }) => {
  const stats = new Map()
  const statFor = (key) => {
    if (!stats.has(key)) stats.set(key, { airings: 0, seasons: new Set(), inHistory: false, historySeasons: new Set() })
    return stats.get(key)
  }
  for (const programme of upcoming) {
    const stat = statFor(showKeyOf(programme.title))
    stat.airings += 1
    if (isSeasonNumber(programme.series_no)) stat.seasons.add(Number(programme.series_no))
  }
  for (const programme of history) {
    if (!(Number(programme.end) <= nowMs)) continue
    const stat = statFor(showKeyOf(programme.title))
    stat.inHistory = true
    if (isSeasonNumber(programme.series_no)) stat.historySeasons.add(Number(programme.series_no))
  }
  return (programme) => {
    const key = showKeyOf(programme.title)
    const stat = stats.get(key)
    const season = Number(programme.series_no)
    if (Number(programme.episode_no) !== 1 || !isSeasonNumber(season)) return false
    if (!stat || stat.airings > MAX_PREMIERE_AIRINGS) return false
    if ([...stat.seasons].some((other) => other !== season)) return false
    const newerThanHistory = stat.historySeasons.size > 0 && [...stat.historySeasons].every((other) => other < season)
    if (stat.inHistory && !newerThanHistory) return false
    const record = records.get(key)
    if (!String(record?.source || '').startsWith('tvmaze:')) return false
    const facts = tvmazeFactsOf(record)
    if (facts.ended) return false
    const recentDebut = Boolean(facts.premiered) && nowMs - facts.premiered <= PREMIERE_MAX_AGE_MS
    if (season === 1) return recentDebut
    return !isRepeatChannel(channelNames.get(String(programme.channel_id)))
  }
}

export const timeLabelOf = ({ ms, hourOf = localHourOf, minuteOf = (value) => new Date(value).getMinutes() }) => {
  const hour = hourOf(ms)
  const minutes = minuteOf(ms)
  const suffix = hour < 12 ? 'am' : 'pm'
  const twelve = hour % 12 || 12
  return minutes ? `${twelve}.${String(minutes).padStart(2, '0')} ${suffix}` : `${twelve} ${suffix}`
}

export const diversify = ({ entries, limit, maxPerGenre = MAX_PER_GENRE, explorationSlots = EXPLORATION_SLOTS, genreShares = new Map(), seed = 0 }) => {
  const picked = []
  const perGenre = new Map()
  const used = new Set()
  const exploration = entries
    .filter((entry) => !(genreShares.get(entry.primaryGenre) > 0) && !UNEXPLORED.has(entry.primaryGenre) && entry.item.image && entry.score >= MIN_EXPLORE_SCORE)
    .sort((a, b) => hashOf(`${seed}|${a.item.seriesKey}`) - hashOf(`${seed}|${b.item.seriesKey}`))
  const takeExploration = () => {
    const next = exploration.find((entry) => !used.has(entry.item.seriesKey))
    if (!next) return null
    used.add(next.item.seriesKey)
    return { ...next, item: { ...next.item, reason: 'Something different this week' }, explored: true }
  }
  const remaining = entries.filter(Boolean)
  while (picked.length < limit) {
    const slot = picked.length % 10
    if (explorationSlots.includes(slot)) {
      const explored = takeExploration()
      if (explored) {
        picked.push(explored)
        continue
      }
    }
    const index = remaining.findIndex((entry) => !used.has(entry.item.seriesKey)
      && (perGenre.get(entry.primaryGenre) || 0) < maxPerGenre * Math.ceil((picked.length + 1) / 10))
    if (index < 0) break
    const [entry] = remaining.splice(index, 1)
    used.add(entry.item.seriesKey)
    perGenre.set(entry.primaryGenre, (perGenre.get(entry.primaryGenre) || 0) + 1)
    picked.push(entry)
  }
  return picked
}

const isCandidateAiring = ({ programme, nowMs, horizonMs }) => {
  const start = Number(programme.start)
  const end = Number(programme.end ?? programme.stop)
  if (!(end > nowMs) || !(start < nowMs + horizonMs)) return false
  if (end - start < MIN_LENGTH_MS) return false
  if (!String(programme.title || '').trim()) return false
  return !isInfomercial(programme)
}

const isExcluded = ({ programme, context }) => {
  if (programme.dvr_state || programme.dvr_uuid) return true
  if (context.scheduledProgramIds.has(String(programme.program_id))) return true
  if (context.coveredProgramIds?.has(String(programme.program_id))) return true
  const key = showKeyOf(programme.title)
  if (context.ruleKeys.has(key)) return true
  const show = context.profile.shows.get(key)
  if (show?.hidden) return true
  return context.recorded.has(`${key}|${programme.series_no}x${programme.episode_no}`)
    || context.recorded.has(`${key}|${programme.start}`)
}

const recordedEpisodesOf = ({ recordings, keyOf }) => {
  const keys = new Set()
  for (const row of recordings) {
    const key = keyOf(row.title)
    if (row.season != null && row.episode != null) keys.add(`${key}|${row.season}x${row.episode}`)
    if (row.aired_at) keys.add(`${key}|${row.aired_at}`)
  }
  return keys
}

const categoriesLookupOf = ({ records, airings }) => (programme) => {
  const key = showKeyOf(programme.title)
  const record = records.get(key)
  const film = isFilmAiring({ programme, record, airingsInWeek: airings.get(key) || 1 })
  const found = new Set([
    ...(record?.categories || []),
    ...categoriesOfEtsi(programme.genre),
    ...keywordCategoriesOf(programme.title),
  ].filter((category) => (film ? category.startsWith('movie') || record?.categories?.includes(category) : !category.startsWith('movie'))))
  if (film) found.add('movie')
  return [...found]
}

const recordsOf = (genresByKey) => new Map([...genresByKey].map(([key, value]) => [
  key,
  Array.isArray(value) ? { categories: value, genres: [], source: null } : value,
]))

const airingCountsOf = (upcoming) => {
  const counts = new Map()
  for (const programme of upcoming) {
    const key = showKeyOf(programme.title)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return counts
}

const isSeasonNumber = (value) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) < 1900

const genreSharesOf = ({ profile, categoriesOf, programmes }) => {
  const sampleByKey = new Map()
  for (const programme of programmes) {
    const key = showKeyOf(programme.title)
    if (!sampleByKey.has(key)) sampleByKey.set(key, programme)
  }
  const shares = new Map()
  let total = 0
  for (const show of profile.shows.values()) {
    if (!(show.affinity > 0)) continue
    total += show.affinity
    const categories = categoriesOf(sampleByKey.get(show.key) || { title: show.key })
    for (const category of categories) shares.set(category, (shares.get(category) || 0) + show.affinity)
  }
  if (total) for (const [category, weight] of shares) shares.set(category, weight / total)
  return shares
}

const similarityContextOf = ({ profile, upcoming, history, recordings, keyOf, vectorsByHash, tier }) => {
  const liked = likedShowsOf(profile).slice(0, MAX_ANCHORS)
  const textsByKey = new Map()
  const addText = (key, item) => {
    const text = embedTextOf(item)
    if (!text) return
    if (!textsByKey.has(key)) textsByKey.set(key, new Map())
    const texts = textsByKey.get(key)
    if (texts.size < MAX_TEXTS_PER_SHOW) texts.set(textHashOf(text), text)
  }
  for (const row of recordings) addText(keyOf(row.title), row)
  for (const programme of [...history, ...upcoming]) addText(showKeyOf(programme.title), programme)
  const useEmbeddings = tier !== 'basic' && vectorsByHash?.size > 0
  if (useEmbeddings) {
    const keyVectors = new Map()
    const keyVector = (key) => {
      if (!keyVectors.has(key)) keyVectors.set(key, unitVectorOf(meanVectorOf([...(textsByKey.get(key)?.keys() || [])].map((hash) => vectorsByHash.get(hash)))))
      return keyVectors.get(key)
    }
    const anchors = liked
      .map((show) => ({ key: show.key, title: show.title, affinity: show.affinity, vector: keyVector(show.key) }))
      .filter((anchor) => anchor.vector)
    const vectorOf = (programme) => {
      const text = embedTextOf(programme)
      return (text && vectorsByHash.get(textHashOf(text))) || keyVector(showKeyOf(programme.title))
    }
    return { method: 'embedding', anchors, vectorOf, cosine: dotProduct, scale: SIMILARITY_SCALES.embedding, cache: new Map() }
  }
  const docs = new Map([...textsByKey].map(([key, texts]) => [key, [...texts.values()].join(' ')]))
  const vectors = bm25VectorsOf({ docs })
  const anchors = liked
    .map((show) => ({ key: show.key, title: show.title, affinity: show.affinity, vector: vectors.get(show.key) }))
    .filter((anchor) => anchor.vector?.size)
  return {
    method: 'bm25',
    anchors,
    vectorOf: (programme) => vectors.get(showKeyOf(programme.title)),
    cosine: sparseCosine,
    scale: SIMILARITY_SCALES.bm25,
    cache: new Map(),
  }
}

const scoreAiring = ({ programme, context }) => {
  const { nowMs, profile, hourOf } = context
  const key = showKeyOf(programme.title)
  const show = profile.shows.get(key)
  const title = programme.title
  const liked = Boolean(show && show.affinity >= LIKED && !show.abandoned)
  const categories = context.categoriesOf(programme)
  const movie = categories.includes('movie')
  const channelId = String(programme.channel_id)
  const channelName = context.channelNames.get(channelId) || null
  const hour = hourOf(Number(programme.start))
  const contributions = []
  const add = (feature, weight, text) => {
    if (weight > 0.001) contributions.push({ feature, weight, text })
  }

  const source = affinitySourceOf(show)
  if (source) add(source === 'interest' ? 'interest' : 'affinity', W.affinity * show.affinity, affinityReasonOf({ source, title: show.title || title }))
  const newSeason = liked && show.maxSeason != null && Number(programme.series_no) > show.maxSeason
  const finished = Boolean(show && show.episodesCompleted >= 2 && show.completionRatio >= FINISHED_RATIO)
  if (newSeason) add('new-season', W.newSeason, finished ? 'New season of a show you finished' : `New season of ${show.title || title}`)
  const back = liked && !newSeason && show.lastActivityTs && nowMs - show.lastActivityTs > BREAK_MS
  if (back) add('back', W.back, 'Back after a break')
  const premiere = context.isPremiere(programme)
  if (premiere && !liked) add('premiere', W.premiere, 'A premiere this week')

  const habit = channelHabitOf({ habits: profile.habits, channelId, hour })
  const enoughHabits = profile.habits.sessions >= MIN_HABIT_HISTORY
  if (habit.sessions >= MIN_HABIT_SESSIONS && channelName) {
    const habitScore = Math.min(1, habit.sessions / HABIT_SESSIONS) * 0.7 + Math.min(1, habit.channelShare * 2) * 0.3
    add('habit', W.habit * habitScore, `You often watch ${channelName} at ${timeLabelOf({ ms: hourStartOf(Number(programme.start)), hourOf, minuteOf: () => 0 })}`)
  }
  if (enoughHabits) add('hour', W.hour * hourHabitOf({ habits: profile.habits, hour }), 'On at a time you usually watch')

  const genre = topGenreOf({ categories, shares: context.genreShares })
  if (genre && !liked) add('genre', W.genre * genre.score, `Because you like ${(CATEGORY_LABELS[genre.category] || genre.category).toLowerCase()}`)

  const nearest = similarOf({ programme, key, context })
  if (nearest && !liked) add('similar', W.similar * nearest.score, `Similar to ${nearest.title}`)

  if (context.pinned.has(channelId)) add('pinned', W.pinned, 'On one of your favourite channels')
  if ((context.coldStart || movie) && hour >= PRIME_START && hour < PRIME_END) add('prime', W.prime, 'On in prime time')
  if (context.coldStart && programme.image) add('image', W.image, 'Has artwork')

  const multiplier = penaltyOf({ show, nowMs })
  const total = contributions.reduce((sum, contribution) => sum + contribution.weight, 0) * multiplier
  if (!(total > 0)) return null
  contributions.sort((a, b) => b.weight - a.weight)
  const top = reasonOf(contributions)
  const kind = kindOf({ liked, movie, newSeason, back, premiere, top })
  return {
    key,
    score: total,
    liked,
    movie,
    premiere,
    newSeason,
    back,
    nearest,
    habit,
    genre,
    multiplier,
    show,
    contributions,
    primaryGenre: categories.find((category) => category !== 'movie') || (movie ? 'movie' : 'other'),
    otherLanguage: movie && isOtherLanguage(context.filmFactsOf(programme)),
    item: airingItemOf({ programme, context, movie, categories, kind, reason: top.text, score: total }),
  }
}

export const airingItemOf = ({ programme, context, movie, categories, kind, reason, score }) => {
  const channelId = String(programme.channel_id)
  const title = programme.title
  return {
    id: String(programme.program_id),
    programmeKey: `${channelId}:${programme.start}`,
    seriesKey: showKeyOf(title),
    title,
    episodeTitle: programme.episode_title || null,
    synopsis: programme.synopsis || '',
    image: programme.image
      ? `/api/epg/image/${encodeURIComponent(programme.program_id)}`
      : showImageUrlOf({ title, isFilm: movie || programme.kind === 'movie' }),
    channelId,
    channelName: context.channelNames.get(channelId) || null,
    start: Number(programme.start),
    stop: Number(programme.end ?? programme.stop),
    onNow: Number(programme.start) <= context.nowMs && Number(programme.end ?? programme.stop) > context.nowMs,
    kind,
    programmeKind: programme.kind ?? null,
    reason,
    score: Math.round(score * 1000) / 1000,
    canRecordSeries: Boolean(programme.series_link) && !movie,
    seasonNumber: programme.series_no ?? null,
    episodeNumber: programme.episode_no ?? null,
    categories,
    ...(movie && isOtherLanguage(context.filmFactsOf(programme)) && { otherLanguage: true }),
  }
}

export const topRatedOf = ({ upcoming, context }) => {
  const byKey = new Map()
  for (const programme of upcoming) {
    if (!(Number(programme.start) >= context.nowMs) || isExcluded({ programme, context })) continue
    const facts = context.filmFactsOf(programme)
    if (!hasRealScore(facts)) continue
    const categories = context.categoriesOf(programme)
    if (!categories.includes('movie') && programme.kind !== 'movie') continue
    const key = showKeyOf(programme.title)
    if (context.profile.shows.get(key)?.episodesCompleted > 0) continue
    const known = byKey.get(key)
    if (known && known.item.start <= Number(programme.start)) continue
    const rank = weightedScoreOf(facts)
    byKey.set(key, {
      key,
      rank,
      facts,
      otherLanguage: isOtherLanguage(facts),
      item: {
        ...airingItemOf({ programme, context, movie: true, categories, kind: 'movie', reason: '', score: rank / 10 }),
        rating: { score: Number(facts.score), votes: facts.votes ?? null },
      },
    })
  }
  return [...byKey.values()].sort((a, b) => b.rank - a.rank || a.item.start - b.item.start)
}

const showImageUrlOf = ({ title, isFilm }) =>
  `/api/epg/show-image?title=${encodeURIComponent(title)}${isFilm ? '&kind=movie' : ''}`

const affinityReasonOf = ({ source, title }) => {
  if (source === 'liked') return `More like ${title}`
  if (source === 'watched') return `Because you watched ${title}`
  if (source === 'recorded') return `Because you recorded ${title}`
  return ''
}

const reasonOf = (contributions) => {
  const leading = contributions.find((contribution) => LEADING_FEATURES.has(contribution.feature))
  if (leading) return leading
  const top = contributions.find((contribution) => REASON_FEATURES.has(contribution.feature))
    || contributions.find((contribution) => contribution.text)
    || contributions[0]
  const similar = contributions.find((contribution) => contribution.feature === 'similar')
  return top.feature === 'genre' && similar && similar.weight >= top.weight * SIMILAR_REASON_RATIO ? similar : top
}

const similarOf = ({ programme, key, context }) => {
  const { anchors, vectorOf, cosine, scale, cache } = context.similarity
  if (!anchors.length) return null
  const vector = vectorOf(programme)
  if (!vector) return null
  if (cache.has(vector)) return cache.get(vector)
  const [nearest] = nearestLikedOf({ vector, anchors, cosine, excludeKey: key, topK: 1 })
  const score = nearest ? similarityScoreOf({ similarity: nearest.similarity, ...scale }) * (0.5 + 0.5 * nearest.affinity) : 0
  const result = score > 0 ? { ...nearest, score } : null
  cache.set(vector, result)
  return result
}

const showKeyOf = (title) => {
  const text = String(title ?? '')
  const known = showKeys.get(text)
  if (known) return known
  if (showKeys.size > MAX_SHOW_KEYS) showKeys.clear()
  const key = rawShowKeyOf(text)
  showKeys.set(text, key)
  return key
}

const showKeys = new Map()

const topGenreOf = ({ categories, shares }) => {
  const peak = Math.max(0, ...shares.values())
  if (!peak) return null
  const ranked = categories
    .filter((category) => shares.get(category) > 0 && (category !== 'movie' || categories.length === 1))
    .map((category) => ({ category, share: shares.get(category), score: shares.get(category) / peak }))
    .sort((a, b) => b.score - a.score)
  return ranked[0] || null
}

const penaltyOf = ({ show, nowMs }) => {
  if (!show) return 1
  const recentDismissals = show.dismissed.filter((ts) => nowMs - ts < DISMISS_WINDOW_DAYS * DAY_MS).length
  const recentShown = show.shown.filter((ts) => nowMs - ts < SHOWN_WINDOW_MS).length
  const ignored = recentShown >= IGNORED_SHOWN && !show.accepted.some((ts) => nowMs - ts < SHOWN_WINDOW_MS)
  const thumbsDown = show.thumbsDown.length ? 0.2 : 1
  return DISMISS_FACTOR ** recentDismissals * (ignored ? IGNORED_FACTOR : 1) * thumbsDown * (show.abandoned ? 0.5 : 1)
}

const kindOf = ({ liked, movie, newSeason, back, premiere, top }) => {
  if (liked) {
    if (newSeason || back) return 'returning'
    return top.feature === 'habit' ? 'habit' : 'liked'
  }
  if (movie) return 'movie'
  if (top.feature === 'premiere' || (premiere && top.feature !== 'similar')) return 'premiere'
  if (top.feature === 'habit') return 'habit'
  return 'similar'
}

const bestAiringPerShow = (scored) => {
  const byKey = new Map()
  for (const entry of scored) {
    const known = byKey.get(entry.key)
    if (!known || entry.score > known.score + 1e-9 || (Math.abs(entry.score - known.score) < 1e-9 && entry.item.start < known.item.start)) {
      byKey.set(entry.key, entry)
    }
  }
  return [...byKey.values()].sort((a, b) => b.score - a.score || a.item.start - b.item.start)
}

const sectionsOf = ({ items, topRated, limit, nowMs, genreShares, otherLimit }) => {
  const used = new Set()
  const take = (entries) => {
    for (const entry of entries) used.add(entry.key)
    return entries
  }
  const fresh = (entry) => !used.has(entry.key)
  const newSeasons = take(items.filter((entry) => entry.liked && (entry.newSeason || entry.back)).slice(0, limit))
  const capped = (entries) => withinLanguageLimit({ entries, isOther: (entry) => entry.otherLanguage, limit: otherLimit })
  const comingUp = take(capped(items.filter((entry) => fresh(entry) && entry.liked))
    .slice(0, limit)
    .sort((a, b) => a.item.start - b.item.start))
  const mightLike = take(diversify({
    entries: items.filter((entry) => fresh(entry) && !entry.liked && !entry.movie && entry.score >= MIN_SUGGEST_SCORE),
    limit,
    genreShares,
    seed: Math.floor(nowMs / DAY_MS),
  }))
  const best = take(capped(topRated.filter(fresh)).slice(0, TOP_RATED_LIMIT))
  const movies = take(capped(items.filter((entry) => fresh(entry) && entry.movie)).slice(0, limit))
  const premieres = take(items
    .filter((entry) => fresh(entry) && isPremiereSuggestion(entry))
    .slice(0, limit)
    .sort((a, b) => a.item.start - b.item.start))
  return [
    { key: 'coming-up', entries: comingUp },
    { key: 'new-seasons', entries: newSeasons },
    { key: 'might-like', entries: mightLike },
    { key: 'top-rated', entries: best },
    { key: 'movies', entries: movies },
    { key: 'premieres', entries: premieres },
  ].filter((section) => section.entries.length)
}

const coldStartSections = ({ items, topRated, limit, otherLimit }) => {
  const premieres = items
    .filter(isPremiereSuggestion)
    .slice(0, limit)
    .sort((a, b) => a.item.start - b.item.start)
  const capped = (entries) => withinLanguageLimit({ entries, isOther: (entry) => entry.otherLanguage, limit: otherLimit })
  const best = capped(topRated).slice(0, TOP_RATED_LIMIT)
  const bestKeys = new Set(best.map((entry) => entry.key))
  const movies = capped(items.filter((entry) => entry.movie && !bestKeys.has(entry.key))).slice(0, limit)
  return [
    { key: 'premieres', entries: premieres },
    { key: 'top-rated', entries: best },
    { key: 'movies', entries: movies },
  ].filter((section) => section.entries.length)
}

const isPremiereSuggestion = (entry) => entry.premiere && !entry.movie
  && !entry.item.categories.some((category) => category === 'news' || category === 'sport')

const topPickOf = (sections) => {
  const order = ['new-seasons', 'coming-up', 'might-like', 'premieres', 'movies']
  const candidates = order
    .flatMap((key) => (sections.find((section) => section.key === key)?.entries || []).map((entry) => ({ entry, key })))
    .filter(({ entry }) => !entry.explored)
  const withImage = candidates.find(({ entry }) => entry.item.image?.startsWith('/api/epg/image/')) || candidates[0]
  return withImage ? { ...withImage.entry.item, section: withImage.key } : null
}

const explanationOf = ({ entry, context }) => {
  const { show, item } = entry
  const signals = []
  if (show?.episodesStarted) {
    signals.push(show.episodesCompleted
      ? `You watched ${show.episodesCompleted} of ${show.episodesStarted} episodes of ${show.title || item.title}`
      : `You watched part of ${plural(show.episodesStarted, 'episode')} of ${show.title || item.title}`)
  }
  if (show?.recordings) signals.push(`You recorded ${plural(show.recordings, 'episode')} of ${show.title || item.title}`)
  if (show?.requests.some((request) => request.type === 'series')) signals.push(`You set up a series recording for ${show.title || item.title}`)
  if (show?.thumbsUp.length) signals.push(`You pressed More like this for ${show.title || item.title}`)
  if (affinitySourceOf(show) === 'interest') signals.push(`You looked at ${show.title || item.title} recently`)
  if (entry.newSeason) signals.push(`Season ${item.seasonNumber} is airing; you last recorded season ${show.maxSeason}`)
  if (entry.back) signals.push(`You last watched or recorded it ${Math.round((context.nowMs - show.lastActivityTs) / DAY_MS)} days ago`)
  if (entry.premiere) signals.push(item.episodeNumber === 1 ? 'Episode 1 airs this week' : 'Billed as a premiere')
  if (entry.habit.sessions >= MIN_HABIT_SESSIONS && item.channelName) {
    signals.push(`You watched ${item.channelName} around ${timeLabelOf({ ms: hourStartOf(item.start), hourOf: context.hourOf, minuteOf: () => 0 })} about ${Math.round(entry.habit.sessions)} times recently`)
  }
  if (entry.genre) {
    signals.push(`${CATEGORY_LABELS[entry.genre.category] || entry.genre.category} is ${Math.round(entry.genre.share * 100)}% of what you watched and recorded`)
  }
  if (entry.nearest) signals.push(`Its description is close to ${entry.nearest.title}, which you watched or recorded`)
  const dismissals = show?.dismissed.filter((ts) => context.nowMs - ts < DISMISS_WINDOW_DAYS * DAY_MS).length || 0
  if (dismissals) signals.push(`You dismissed it ${plural(dismissals, 'time')} recently`)
  if (context.pinned.has(item.channelId)) signals.push(`${item.channelName || 'The channel'} is one of your favourite channels`)
  const total = entry.contributions.reduce((sum, contribution) => sum + contribution.weight, 0) || 1
  return {
    title: item.title,
    reasons: entry.contributions.filter((contribution) => contribution.text).map((contribution) => ({
      text: contribution.text,
      weight: Math.round((contribution.weight / total) * 100) / 100,
    })),
    signals,
  }
}

const topRatedExplanationOf = ({ item, facts }) => ({
  title: item.title,
  reasons: [{ text: 'Top rated by TMDB users', weight: 1 }],
  signals: [facts.votes
    ? `TMDB users rate it ${Number(facts.score).toFixed(1)} out of 10 from ${Number(facts.votes).toLocaleString('en-AU')} votes`
    : `TMDB users rate it ${Number(facts.score).toFixed(1)} out of 10`],
})

const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`

const hourStartOf = (ms) => ms - (ms % (60 * 60 * 1000))

const hashOf = (text) => {
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const W = {
  affinity: 0.45,
  newSeason: 0.3,
  back: 0.18,
  premiere: 0.15,
  habit: 0.15,
  hour: 0.04,
  genre: 0.16,
  similar: 0.26,
  pinned: 0.03,
  prime: 0.05,
  image: 0.02,
}

const SIMILAR_REASON_RATIO = 0.5
const LEADING_FEATURES = new Set(['new-season', 'back'])
const REASON_FEATURES = new Set(['affinity', 'new-season', 'back', 'premiere', 'habit', 'genre', 'similar', 'pinned', 'prime'])
const LIKED = 0.25
const FINISHED_RATIO = 0.6
const HABIT_SESSIONS = 4
const MIN_HABIT_SESSIONS = 2
const PRIME_START = 18
const PRIME_END = 22
const MAX_ANCHORS = 12
const MAX_SHOW_KEYS = 50000
const MAX_TEXTS_PER_SHOW = 6
const MAX_PER_GENRE = 3
const EXPLORATION_SLOTS = [4, 9]
const MIN_SUGGEST_SCORE = 0.03
const MIN_EXPLORE_SCORE = 0.1
const UNEXPLORED = new Set(['news', 'kids', 'other'])
const MIN_HABIT_HISTORY = 5
const DISMISS_FACTOR = 0.6
const IGNORED_SHOWN = 5
const IGNORED_FACTOR = 0.85
const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS
const BREAK_MS = 45 * DAY_MS
const SHOWN_WINDOW_MS = 14 * DAY_MS
const MIN_LENGTH_MS = 10 * 60 * 1000
const INFOMERCIAL_TITLE = /^(infomercials?|paid programming|home shopping|shopping|global shop direct|tvsn|brand power|danoz direct|to be advised|tba|programs? (will )?resume.*|station close|close|test pattern|off air|religious programming|this is opshop)$/i
const INFOMERCIAL_TEXT = /\binfomercials?\b|\bpaid programming\b|\bhome shopping\b/i
const MAX_PREMIERE_AIRINGS = 4
const REPEAT_CHANNEL = /9go|9gem|9life|9rush|7two|7mate|7flix|7bravo|10 ?bold|10 ?peach|10 ?drama|10 ?comedy|\bbold\b|\bpeach\b|viceland|world movies|sbs food|sbs ?2|nitv|abc kids|abc family|abc entertains|abc tv plus|abc me\b|sky ?racing|racing\.com|tvsn|openshop/i
const PREMIERE_MAX_AGE_MS = 60 * DAY_MS
