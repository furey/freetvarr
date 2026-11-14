import { KIDS, LIFESTYLE, NEWS, SPORT, categoryCatalogueOf } from './for-you-category-catalogue.js'
import { dotProduct, meanVectorOf, unitVectorOf } from './for-you-similarity.js'
import { embedTextOf, textHashOf } from './for-you-texts.js'
import { decayOf } from './for-you-profile.js'

export const CATEGORY_FLOOR = 0.3
export const CATEGORY_FULL = 0.45
export const CATEGORY_MEMBER = 0.42
export const SECOND_MARGIN = 0.08
export const ROW_SHARE = 0.04
export const MIN_ROW_ITEMS = 4
export const MIN_TITLES = 3
export const MIN_SPORT_TITLES = 1
export const MAX_CATEGORY_ROWS = 3
export const SPORT_AIRINGS_PER_TITLE = 3
export const TITLE_CAP = 0.3
export const FACET_SHARE = 0.25
export const MUTE_DAYS = 90
export const MUTE_FACTOR = 0.2
export const BOOST_FACTOR = 1.5
export const EVENT_WEIGHTS = { record: 3, watch: 2, accepted: 1, opened: 0.5 }
export const SPORT_ROW_KEY = 'sport'
export const SPORT_ROW_TITLE = 'Sport this week'
export const CATEGORY_MUTED = 'category_muted'
export const CATEGORY_UNMUTED = 'category_unmuted'
export const CATEGORY_BOOSTED = 'category_boosted'
export const CATEGORY_UNBOOSTED = 'category_unboosted'
export const CATEGORY_KINDS = new Set([CATEGORY_MUTED, CATEGORY_UNMUTED, CATEGORY_BOOSTED, CATEGORY_UNBOOSTED])

export const categorySectionKeyOf = (group) => (group === SPORT_ROW_KEY ? SPORT_ROW_KEY : `category-${group}`)

export const categoryMuteKeyOf = (group) => `category-${group}`

export const groupOfMuteKey = (seriesKey) => String(seriesKey || '').replace(/^category-/, '')

export const createCategoryIndex = ({ country = '' } = {}) => {
  const catalogue = categoryCatalogueOf({ country })
  const facets = new Map()
  const groups = new Map()
  for (const category of catalogue) {
    for (const facet of category.facets) {
      const group = groupKeyOf({ category, facet })
      facets.set(facet.key, { ...facet, category, group, kinds: facet.kinds ?? category.kinds })
      if (!groups.has(group)) groups.set(group, groupInfoOf({ category, facet, group }))
    }
  }
  return { country, catalogue, facets, groups }
}

export const titleKindOf = ({ film = false, genreTags = [], tvmazeType = null, channelNames = [], guideGenres = [], genre = null, kidsSlotsOnly = null }) => {
  if (film) return 'film'
  const cats = new Set(genreTags)
  const guide = new Set([...guideGenres].map((category) => String(category).toLowerCase()))
  const names = [...channelNames].filter(Boolean)
  if ((Number(genre) >> 4) === KIDS_ETSI_GROUP || cats.has('kids') || [...guide].some((category) => KIDS_GUIDE.has(category))) return 'kids'
  if (kidsSlotsOnly ?? (names.length > 0 && names.every((name) => KIDS_CHANNEL.test(name) && !FAMILY_CHANNEL.test(name)))) return 'kids'
  if (tvmazeType === 'Sports' || cats.has('sport') || [...guide].some((category) => SPORT_GUIDE.has(category))) return 'sport'
  if (tvmazeType === 'Scripted') return 'fiction'
  if (tvmazeType && tvmazeType !== 'Animation') return 'factual'
  const factual = [...cats].some((category) => FACTUAL_GENRE_TAGS.has(category)) || [...guide].some((category) => FACTUAL_GUIDE.has(category))
  const fiction = [...cats].some((category) => FICTION_GENRE_TAGS.has(category)) || [...guide].some((category) => FICTION_GUIDE.has(category))
  if (fiction && !factual) return 'fiction'
  if (factual) return 'factual'
  return 'unknown'
}

export const sportCodeOf = ({ title = '', channelNames = [], guideGenres = [], country = '' }) => {
  const text = [title, ...channelNames].filter(Boolean).join(' | ')
  const found = SPORT_KEYWORDS.find(([, pattern]) => pattern.test(text))
  if (found) return found[0]
  const guided = guideSportCodeOf(guideGenres)
  if (guided) return guided
  if (!PLAIN_FOOTBALL.test(title)) return null
  return PLAIN_FOOTBALL_CODES[country] === undefined ? 'soccer' : PLAIN_FOOTBALL_CODES[country]
}

export const isFishingTitle = (title) => FISHING.test(String(title || ''))


export const prototypeVectorsOf = ({ index, vectorsByHash }) => {
  const vectors = new Map()
  if (!vectorsByHash?.size) return vectors
  for (const facet of index.facets.values()) {
    const found = facet.prototypes.map((text) => vectorsByHash.get(textHashOf(text))).filter(Boolean)
    if (found.length) vectors.set(facet.key, found)
  }
  return vectors
}

export const tagTitle = ({ index, facts, titleVector = null, prototypes = new Map() }) => {
  const kind = titleKindOf(facts)
  if (kind === 'film') return { kind, sportCode: null, bulletin: false, entries: [] }
  if (kind === 'kids') return { kind, sportCode: null, bulletin: false, entries: [fullEntry({ index, facet: 'kids-shows' })] }
  const keyword = keywordTagsOf({ index, facts, kind })
  if (keyword) return keyword
  const scored = titleVector && prototypes.size ? embeddingEntriesOf({ index, kind, titleVector, prototypes }) : ruleEntriesOf({ index, facts, kind })
  return {
    kind,
    sportCode: null,
    bulletin: scored[0]?.category === NEWS || (!titleVector && new Set(facts.genreTags || []).has('news')),
    entries: scored,
  }
}

export const householdEpisodesOf = ({ events = [], recordings = [], keyOf, programmeAt = () => null, nowMs }) => {
  const byKey = new Map()
  const recordingEpisodes = new Map()
  const note = ({ key, episode, kind, ts }) => {
    if (!key || !episode) return
    if (!byKey.has(key)) byKey.set(key, new Map())
    const episodes = byKey.get(key)
    if (!episodes.has(episode)) episodes.set(episode, new Map())
    const kinds = episodes.get(episode)
    kinds.set(kind, Math.max(kinds.get(kind) ?? 0, Number(ts) || 0))
  }
  for (const row of recordings) {
    const episode = episodeIdOf({ season: row.season, episode: row.episode, episodeTitle: row.episode_title, at: row.aired_at })
    recordingEpisodes.set(String(row.recording_id), episode)
    note({ key: keyOf(row.show_title_override ?? row.title), episode, kind: 'record', ts: Number(row.aired_at) || nowMs })
  }
  for (const event of events) {
    const kind = EVENT_KINDS[event.kind]
    if (!kind || !event.title) continue
    const programme = programmeAt({ channelId: event.channel_id, start: event.programme_start })
    const episode = (event.recording_id && recordingEpisodes.get(String(event.recording_id)))
      || episodeIdOf({ season: programme?.series_no, episode: programme?.episode_no, episodeTitle: programme?.episode_title, at: event.programme_start ?? event.ts })
    note({ key: keyOf(event.title), episode, kind, ts: event.ts })
  }
  const weights = new Map()
  for (const [key, episodes] of byKey) {
    let total = 0
    for (const kinds of episodes.values()) for (const [kind, ts] of kinds) total += EVENT_WEIGHTS[kind] * decayOf({ ts, nowMs })
    weights.set(key, { weight: total, episodes: episodes.size })
  }
  return weights
}

export const householdCategoriesOf = ({ index, weights, tagsByKey, mutes = new Map(), boosts = new Set(), off = new Set(), nowMs }) => {
  let total = 0
  const groups = new Map()
  for (const [key, { weight }] of weights) {
    const tags = tagsByKey.get(key)
    if (!tags || tags.bulletin || !(weight > 0)) continue
    const offWeight = tags.entries.filter((entry) => entry.weight > 0 && isOff({ off, group: entry.group, index })).reduce((sum, entry) => sum + entry.weight, 0)
    total += weight * Math.max(0, 1 - offWeight)
    for (const entry of tags.entries) {
      if (!(entry.weight > 0) || isOff({ off, group: entry.group, index })) continue
      const group = entry.group
      if (!groups.has(group)) groups.set(group, { group, titles: new Map(), facets: new Map() })
      const known = groups.get(group)
      known.titles.set(key, (known.titles.get(key) || 0) + weight * entry.weight)
      known.facets.set(entry.facet, (known.facets.get(entry.facet) || 0) + weight * entry.weight)
    }
  }
  const result = new Map()
  for (const { group, titles, facets } of groups.values()) {
    const info = index.groups.get(group)
    const raw = [...titles.values()].reduce((sum, value) => sum + value, 0)
    const cap = info?.row === 'sport' ? Infinity : raw * TITLE_CAP
    const capped = [...titles.values()].reduce((sum, value) => sum + Math.min(value, cap), 0)
    const mute = mergedMuteOf([muteOf({ mutes, group, nowMs }), ...(info?.row === 'sport' ? [muteOf({ mutes, group: SPORT_ROW_KEY, nowMs })] : [])])
    const boosted = boosts.has(group) || (info?.row === 'sport' && boosts.has(SPORT_ROW_KEY))
    const weight = capped * (mute.applies ? MUTE_FACTOR : 1) * (boosted && !mute.applies ? BOOST_FACTOR : 1)
    const facetTotal = [...facets.values()].reduce((sum, value) => sum + value, 0) || 1
    result.set(group, {
      group,
      info,
      share: total ? weight / total : 0,
      titles: titles.size,
      muted: mute.hidden,
      boosted,
      facets: new Map([...facets].map(([key, value]) => [key, value / facetTotal])),
    })
  }
  const hidden = new Set([...[...mutes.keys()].filter((group) => muteOf({ mutes, group, nowMs }).hidden), ...off])
  return { total, groups: result, hidden }
}

export const categoryMutesOf = (events = []) => categoryChoicesOf(events).mutes

export const categoryChoicesOf = (events = []) => {
  const mutes = new Map()
  const boosts = new Set()
  const boostedBeforeMute = new Set()
  for (const event of [...events].sort((a, b) => Number(a.ts) - Number(b.ts))) {
    if (!CATEGORY_KINDS.has(event.kind)) continue
    const group = groupOfMuteKey(event.series_key)
    if (event.kind === CATEGORY_MUTED) {
      mutes.set(group, Number(event.ts))
      if (boosts.delete(group)) boostedBeforeMute.add(group)
    }
    if (event.kind === CATEGORY_UNMUTED) {
      mutes.delete(group)
      if (boostedBeforeMute.delete(group)) boosts.add(group)
    }
    if (event.kind === CATEGORY_BOOSTED) {
      mutes.delete(group)
      boostedBeforeMute.delete(group)
      boosts.add(group)
    }
    if (event.kind === CATEGORY_UNBOOSTED) boosts.delete(group)
  }
  return { mutes, boosts }
}

export const hiddenCategoriesOf = ({ index, mutes, nowMs }) => [...mutes]
  .filter(([group, ts]) => nowMs - ts < MUTE_DAYS * DAY_MS && (index.groups.has(group) || group === SPORT_ROW_KEY))
  .map(([group, ts]) => ({
    seriesKey: `category:${group}`,
    categoryKey: group,
    title: index.groups.get(group)?.title ?? SPORT_ROW_TITLE,
    category: true,
    hiddenAt: ts,
    until: ts + MUTE_DAYS * DAY_MS,
  }))

export const categorySettingsOf = ({ index, mutes = new Map(), off = new Set(), nowMs }) => [...index.groups.values()]
  .filter((info) => info.row !== 'none' && info.code !== 'other-sport')
  .map((info) => ({
    key: info.group,
    title: info.title,
    sport: info.row === 'sport',
    on: !off.has(info.group)
      && !muteOf({ mutes, group: info.group, nowMs }).hidden
      && !(info.row === 'sport' && muteOf({ mutes, group: SPORT_ROW_KEY, nowMs }).hidden),
  }))

export const selectCategoryGroups = ({ household, itemCounts }) => {
  const usable = [...household.groups.values()]
    .filter((entry) => entry.info?.row === 'category' || entry.info?.row === 'facet')
    .filter((entry) => !entry.muted && !household.hidden?.has(entry.group) && entry.titles >= MIN_TITLES && (itemCounts.get(entry.group) || 0) >= MIN_ROW_ITEMS)
    .sort((a, b) => b.share - a.share)
  return usable.filter((entry) => entry.share >= ROW_SHARE).slice(0, MAX_CATEGORY_ROWS)
}

export const selectSportCodes = ({ household, itemCounts }) => {
  if (household.hidden?.has(SPORT_ROW_KEY)) return []
  return [...household.groups.values()]
    .filter((entry) => entry.info?.row === 'sport' && entry.info.code !== 'other-sport')
    .filter((entry) => !entry.muted && !household.hidden?.has(entry.group) && entry.titles >= MIN_SPORT_TITLES && entry.share >= ROW_SHARE && (itemCounts.get(entry.group) || 0) >= MIN_ROW_ITEMS)
    .sort((a, b) => b.share - a.share)
}

export const rankCategoryCandidates = ({ candidates, entry }) => {
  const qualified = new Map([...entry.facets].filter(([, share]) => share >= FACET_SHARE))
  return candidates
    .filter((candidate) => !qualified.size || !candidate.facet || qualified.has(candidate.facet))
    .map((candidate) => ({ ...candidate, facetShare: qualified.get(candidate.facet) || 0 }))
    .sort((a, b) => b.facetShare - a.facetShare || b.score - a.score || a.start - b.start)
}

export const rankSportCandidates = (candidates, { perTitle = SPORT_AIRINGS_PER_TITLE } = {}) => {
  const counts = new Map()
  const episodes = new Set()
  return [...candidates]
    .sort((a, b) => sportRankOf(a) - sportRankOf(b) || a.start - b.start)
    .filter((candidate) => {
      const episode = `${candidate.key}|${candidate.programme?.episode_title || candidate.start}`
      if (episodes.has(episode)) return false
      episodes.add(episode)
      counts.set(candidate.key, (counts.get(candidate.key) || 0) + 1)
      return counts.get(candidate.key) <= perTitle
    })
}

export const sportAiringKindOf = ({ title = '', episodeTitle = '', synopsis = '' }) => {
  if (SPORT_REPLAY.test(`${title} ${episodeTitle || ''}`)) return 'replay'
  if (SPORT_SHOW.test(`${title} ${episodeTitle || ''}`)) return 'show'
  if (SPORT_MATCH.test(`${title} | ${episodeTitle || ''}`) || SPORT_MATCH_TEXT.test(String(synopsis || '').slice(0, 160))) return 'match'
  return 'show'
}

export const dedupeCategoryRow = ({ ranked, used, limit, keyOf = (candidate) => candidate.key }) => {
  const top = ranked.slice(0, limit)
  const repeated = top.filter((candidate) => used.has(keyOf(candidate))).length
  if (repeated > top.length / 2) return []
  const fresh = ranked.filter((candidate) => !used.has(keyOf(candidate))).slice(0, limit)
  return fresh.length >= MIN_ROW_ITEMS ? fresh : []
}

export const tagsForTitles = ({ index, titles, vectorsByHash }) => {
  const prototypes = prototypeVectorsOf({ index, vectorsByHash })
  const memo = prototypes.size ? memoFor({ vectorsByHash, index }) : null
  const tags = new Map()
  for (const facts of titles.values()) {
    const signature = memo && signatureOf(facts)
    if (memo?.has(signature)) {
      tags.set(facts.key, memo.get(signature))
      continue
    }
    const titleVector = prototypes.size ? unitVectorOf(meanVectorOf([...facts.hashes].map((hash) => vectorsByHash.get(hash)))) : null
    const tagged = tagTitle({ index, facts, titleVector, prototypes })
    memo?.set(signature, tagged)
    tags.set(facts.key, tagged)
  }
  return tags
}

export const isKidsSlot = ({ channelName, start, hourOf = (ms) => new Date(ms).getHours() }) => KIDS_CHANNEL.test(channelName || '')
  && (!FAMILY_CHANNEL.test(channelName) || hourOf(Number(start)) < FAMILY_EVENING_HOUR)

export const titleFactsOf = ({ programmes = [], recordings = [], keyOf, genreTagsOf, recordOf = () => null, channelNames = new Map(), guideGenresOf = () => [], isFilm = () => false, hourOf }) => {
  const titles = new Map()
  const factsFor = (key, title) => {
    if (!titles.has(key)) titles.set(key, { key, title, hashes: new Set(), genreTags: new Set(), channelNames: new Set(), guideGenres: new Set(guideGenresOf(title)), genre: null, tvmazeType: null, film: false, airings: 0, kidsAirings: 0 })
    return titles.get(key)
  }
  for (const programme of programmes) {
    const facts = factsFor(keyOf(programme.title), programme.title)
    addText(facts, programme)
    for (const category of genreTagsOf(programme)) facts.genreTags.add(category)
    const channelName = channelNames.get(String(programme.channel_id))
    if (channelName) facts.channelNames.add(channelName)
    facts.airings += 1
    if (isKidsSlot({ channelName, start: programme.start, hourOf })) facts.kidsAirings += 1
    if (programme.genre != null && facts.genre == null) facts.genre = programme.genre
    if (isFilm(programme)) facts.film = true
  }
  for (const row of recordings) {
    const title = row.show_title_override ?? row.title
    const facts = factsFor(keyOf(title), title)
    addText(facts, { title: row.title, synopsis: row.synopsis })
  }
  for (const facts of titles.values()) {
    facts.kidsSlotsOnly = facts.airings > 0 && facts.kidsAirings === facts.airings
    const record = recordOf(facts.key)
    facts.tvmazeType = (record?.genres || []).find((genre) => String(genre).startsWith('type:'))?.slice(5) || null
    for (const category of record?.genreTags || []) if (!category.startsWith('movie')) facts.genreTags.add(category)
  }
  return titles
}

const addText = (facts, item) => {
  if (facts.hashes.size >= MAX_TEXTS_PER_TITLE) return
  const text = embedTextOf(item)
  if (text) facts.hashes.add(textHashOf(text))
}

const groupKeyOf = ({ category, facet }) => (category.row === 'facet' || category.row === 'sport' ? facet.key : category.key)

const groupInfoOf = ({ category, facet, group }) => {
  if (category.row === 'facet') return { group, row: 'facet', title: facet.title, phrase: facet.title.toLowerCase(), category: category.key }
  if (category.row === 'sport') return { group, row: 'sport', title: facet.title, phrase: facet.title, code: facet.key, category: category.key }
  return { group, row: category.row, title: category.title, phrase: category.phrase, category: category.key }
}

const fullEntry = ({ index, facet }) => {
  const known = index.facets.get(facet)
  return { category: known.category.key, slot: known.category.slot, facet, group: known.group, score: 1, weight: 1, member: true }
}

const keywordTagsOf = ({ index, facts, kind }) => {
  if (kind !== 'sport') return null
  if (isFishingTitle(facts.title)) return { kind, sportCode: null, bulletin: false, entries: [fullEntry({ index, facet: 'fishing' })] }
  const code = sportCodeOf({ title: facts.title, channelNames: [...(facts.channelNames || [])], guideGenres: [...(facts.guideGenres || [])], country: index.country })
  return code ? { kind, sportCode: code, bulletin: false, entries: [fullEntry({ index, facet: code })] } : null
}

const embeddingEntriesOf = ({ index, kind, titleVector, prototypes }) => {
  const best = { format: null, topic: null }
  for (const [key, vectors] of prototypes) {
    const facet = index.facets.get(key)
    if (!facet.kinds.includes(kind) || facet.category.key === SPORT) continue
    const score = Math.max(...vectors.map((vector) => dotProduct(titleVector, vector)))
    const slot = facet.category.slot
    if (!best[slot] || score > best[slot].score) best[slot] = { facet, score }
  }
  return entriesFrom([best.format, best.topic].filter(Boolean))
}

const entriesFrom = (picks) => {
  const top = Math.max(0, ...picks.map((pick) => pick.score))
  const ramped = picks
    .filter((pick) => top - pick.score <= SECOND_MARGIN + 1e-9)
    .map(({ facet, score }) => ({ facet, score, ramp: rampOf(score) }))
    .filter((pick) => pick.ramp > 0)
  const sum = ramped.reduce((total, pick) => total + pick.ramp, 0)
  return ramped
    .map(({ facet, score, ramp }) => ({
      category: facet.category.key,
      slot: facet.category.slot,
      facet: facet.key,
      group: facet.group,
      score,
      weight: ramp / Math.max(1, sum),
      member: score >= CATEGORY_MEMBER,
    }))
    .sort((a, b) => b.score - a.score)
}

const rampOf = (score) => Math.max(0, Math.min(1, (score - CATEGORY_FLOOR) / (CATEGORY_FULL - CATEGORY_FLOOR)))

const ruleEntriesOf = ({ index, facts, kind }) => {
  if (kind === 'sport') return []
  const text = String(facts.title || '')
  const cats = new Set(facts.genreTags || [])
  const guide = new Set([...(facts.guideGenres || [])].map((category) => String(category).toLowerCase()))
  const format = formatRuleOf({ text, cats, guide, kind, type: facts.tvmazeType })
  const topic = kind === 'fiction' ? null : TOPIC_RULES.find(([, test]) => test({ text, cats, guide, kind }))?.[0] ?? null
  return [format, topic].filter(Boolean).map((facet) => withRuleFacet(fullEntry({ index, facet })))
}

const withRuleFacet = (entry) => (entry.group === entry.facet || EXACT_RULE_FACETS.has(entry.facet) ? entry : { ...entry, facet: null })

const formatRuleOf = ({ text, cats, guide, kind, type }) => {
  if (kind === 'fiction' || kind === 'unknown') {
    if (cats.has('crime')) return kind === 'fiction' ? 'crime-drama-procedural' : null
    if (cats.has('comedy') && kind === 'fiction') return 'comedy-sitcom'
    if ((cats.has('drama') || cats.has('sci-fi')) && kind === 'fiction') return 'drama-family'
  }
  if (DATING.test(text)) return 'reality-dating'
  if (type === 'Reality' || cats.has('reality') || REALITY_GUIDE.some((category) => guide.has(category))) return 'reality-competition'
  if (type === 'Game Show' || cats.has('quiz')) return 'quiz-trivia'
  if (type === 'Panel Show') return 'comedy-panel'
  return null
}

const EXACT_RULE_FACETS = new Set(['reality-dating'])

const TOPIC_RULES = [
  ['news-bulletins', ({ cats }) => cats.has('news')],
  ['home-renovation', ({ text, cats, guide }) => cats.has('home') || guide.has('house & garden') || HOME.test(text)],
  ['cooking-recipes', ({ text, cats, guide }) => cats.has('food') || guide.has('food & cooking') || COOKING.test(text)],
  ['true-crime-cases', ({ cats, guide, kind }) => guide.has('true crime') || (kind === 'factual' && cats.has('crime'))],
  ['police-patrol', ({ text }) => POLICE.test(text)],
  ['nature-wildlife', ({ text, guide }) => guide.has('nature') || guide.has('animals') || NATURE.test(text)],
  ['travel-destinations', ({ cats, guide }) => cats.has('travel') || guide.has('travel')],
  ['history-war', ({ guide }) => guide.has('history')],
  ['science-space', ({ guide }) => guide.has('science')],
  ['music-live', ({ guide }) => guide.has('music')],
  ['fishing', ({ text }) => FISHING.test(text)],
  ['motoring', ({ text }) => MOTORING.test(text)],
]

const episodeIdOf = ({ season, episode, episodeTitle, at }) => {
  if (season != null && episode != null) return `s${season}e${episode}`
  if (episodeTitle && !GENERIC_EPISODE.test(episodeTitle)) return `t:${String(episodeTitle).trim().toLowerCase()}`
  const ms = Number(at)
  return Number.isFinite(ms) && ms > 0 ? `at:${Math.round(ms / 60_000)}` : null
}

const muteOf = ({ mutes, group, nowMs }) => {
  const ts = mutes.get(group)
  if (ts == null) return { applies: false, hidden: false }
  const active = nowMs - ts < MUTE_DAYS * DAY_MS
  return { applies: active, hidden: active }
}

const sportRankOf = (candidate) => SPORT_RANKS[candidate.sportKind] ?? SPORT_RANKS.show

const isOff = ({ off, group, index }) => off.has(group) || (index.groups.get(group)?.row === 'sport' && off.has(SPORT_ROW_KEY))

const mergedMuteOf = (mutes) => ({ applies: mutes.some((mute) => mute.applies), hidden: mutes.some((mute) => mute.hidden) })

const memoFor = ({ vectorsByHash, index }) => {
  if (!tagMemos.has(vectorsByHash)) tagMemos.set(vectorsByHash, new Map())
  const byCountry = tagMemos.get(vectorsByHash)
  if (!byCountry.has(index.country)) byCountry.set(index.country, new Map())
  return byCountry.get(index.country)
}

const signatureOf = (facts) => JSON.stringify([
  facts.key, [...facts.hashes].sort(), [...facts.genreTags].sort(), facts.tvmazeType, facts.film, facts.genre, facts.kidsSlotsOnly,
  [...facts.channelNames].sort(), [...facts.guideGenres].sort(),
])

const tagMemos = new WeakMap()

const EVENT_KINDS = {
  record_request: 'record',
  watch_start: 'watch',
  watch_end: 'watch',
  suggestion_accepted: 'accepted',
  programme_opened: 'opened',
}

const SPORT_KEYWORDS = [
  ['soccer', /\b(barclays wsl|wsl football|women['’]?s super league)\b/i],
  ['rugby-league', /\b(nrlw?|rugby league|state of origin|super league|league tonight|nrl 360|matty johns)\b/i],
  ['afl', /\b(aflw?|sanfl|wafl|vfl|aussie rules|australian rules|footy show|footy classified|afl 360|brownlow|talking w)\b/i],
  ['rugby-union', /\b(rugby union|super rugby|wallabies|all blacks|springboks|six nations|rugby championship|bledisloe|rugby)\b/i],
  ['american-football', /\b(nfl|super bowl|college football|american football)\b/i],
  ['cricket', /\b(cricket|big bash|bbl|wbbl|the ashes|ipl|t20|odis?|sheffield shield|test match)\b/i],
  ['soccer', /\b(soccer|a-league|premier league|champions league|europa league|fifa|uefa|la liga|bundesliga|serie a|mls|socceroos|matildas|fa cup|world cup|football \(soccer\))\b/i],
  ['tennis', /\b(tennis|wimbledon|roland garros|atp|wta|davis cup|billie jean king cup)\b/i],
  ['motorsport', /\b(supercars|superbikes?|supercross|motocross|formula (1|one)|f1|motogp|moto ?gp|grand prix|bathurst|nascar|indycar|rally|speedway|motorsport|motor racing)\b/i],
  ['greyhound-racing', /\b(greyhounds?|dogs racing)\b/i],
  ['rodeo', /\b(rodeos?|bull ?riding|pbr|campdraft(ing)?|barrel racing)\b/i],
  ['combat-sports', /\b(ufc|mma|boxing(?! day)|kickboxing|bare knuckle)\b/i],
  ['surfing', /\b(wsl surfing|world surf league|surfing|surf league)\b/i],
  ['swimming', /\b(swim gp|swimming|diving championships?)\b/i],
  ['cycling', /\b(cycling|tour de france|giro d'italia|vuelta)\b/i],
  ['horse-racing', /\b(horse racing|giddy ?up|racing|races|race ?day|racenight|melbourne cup|thoroughbreds?|harness|trots|pacing cup)\b/i],
  ['golf', /\b(golf|pga|lpga|liv golf)\b/i],
  ['netball', /\bnetball\b/i],
  ['basketball', /\b(basketball|nba|nbl|wnba|wnbl|euroleague)\b/i],
  ['baseball', /\b(baseball|mlb|world series)\b/i],
  ['ice-hockey', /\b(ice hockey|nhl)\b/i],
]

const guideSportCodeOf = (guideGenres) => [...guideGenres]
  .map((category) => GUIDE_SPORT_CODES[String(category).toLowerCase()])
  .find(Boolean) ?? null

const PLAIN_FOOTBALL = /\bfootball\b/i
const PLAIN_FOOTBALL_CODES = { au: null, us: 'american-football', ca: 'american-football' }
const FISHING = /\b((i|spear)?fish(ing)?|angl(er|ers|ing)|tackle)\b/i
const SPORT_REPLAY = /\b(replays?|classics?|highlights|flashback|encore|rewind|best of|retro|in review)\b/i
const SPORT_MATCH = /\b(v|vs\.?|versus)\b|\blive\b|grand final|semi[- ]finals?|qualifying final|\bfinal\b|\bround \d+|\brace \d+|\bday \d+|qualifying|\bgrand prix\b|\btest\b|\bmatch\b|\bgame \d+/i
const SPORT_MATCH_TEXT = /\b(take on|takes on|face off|against|clash|kick-?off|live coverage|live from)\b/i
const SPORT_SHOW = /\b(pre[- ]?game|post[- ]?game|pre[- ]?match|post[- ]?match|preview|wrap|review|magazine|panel|360|talk|tonight)\b/i
const SPORT_RANKS = { match: 0, show: 1, replay: 2 }
const DATING = /\b(love island|married at first sight|bachelor(ette)?|first dates|dating|farmer wants a wife)\b/i
const HOME = /\b(the block|renovat\w*|reno|house rules|grand designs|property|real estate|better homes|dream home|house hunt\w*)\b/i
const COOKING = /\b(kitchen|cook\w*|chefs?|recipes?|bake\w*|masterchef)\b/i
const POLICE = /\b(police|cops|highway patrol|border security|border force|paramedics?|emergency|coastwatch|lifeguards?)\b/i
const NATURE = /\b(vets?|zoo|wildlife|animals?|pets?|safari)\b/i
const MOTORING = /\b(cars|motoring|garage|wheeler dealers|top gear)\b/i
const GENERIC_EPISODE = /^(episode \d+|episode \d+ of season \d+|part \d+|new|tba)$/i
const KIDS_ETSI_GROUP = 0x5
const KIDS_CHANNEL = /kids|nickelodeon|cbeebies|cartoon|disney junior|nick jr/i
const FAMILY_CHANNEL = /family/i
const FAMILY_EVENING_HOUR = 19
const KIDS_GUIDE = new Set(['kids', 'children', 'kids & family', 'children & family', 'animation'])
const GUIDE_SPORT_CODES = {
  'australian rules football': 'afl',
  'rugby league': 'rugby-league',
  'rugby union': 'rugby-union',
  cricket: 'cricket',
  soccer: 'soccer',
  tennis: 'tennis',
  'horse racing': 'horse-racing',
  'greyhound racing': 'greyhound-racing',
  rodeo: 'rodeo',
  golf: 'golf',
  netball: 'netball',
  basketball: 'basketball',
  baseball: 'baseball',
  'ice hockey': 'ice-hockey',
  cycling: 'cycling',
}
const SPORT_GUIDE = new Set(['sports', 'sport', 'australian rules football', 'golf', 'rugby league', 'sports other', 'other sport'])
const FACTUAL_GENRE_TAGS = new Set(['reality', 'documentary', 'lifestyle', 'food', 'home', 'travel', 'quiz', 'news'])
const FICTION_GENRE_TAGS = new Set(['drama', 'comedy', 'crime', 'sci-fi'])
const FACTUAL_GUIDE = new Set(['documentary', 'factual', 'reality', 'reality series', 'lifestyle', 'food & cooking', 'nature', 'true crime', 'news', 'news/current affairs', 'house & garden', 'unscripted competition', 'science', 'history', 'animals', 'documentary series', 'other documentary series', 'society documentary', 'other reality television'])
const FICTION_GUIDE = new Set(['drama', 'comedy', 'movies', 'crime', 'action', 'horror', 'thriller', 'romance', 'drama serial', 'action & adventure', 'family drama series', 'crime/law & order series', 'mystery'])
const REALITY_GUIDE = ['reality', 'reality series', 'unscripted competition', 'other reality television']
const MAX_TEXTS_PER_TITLE = 6
const DAY_MS = 24 * 60 * 60 * 1000

export { KIDS, LIFESTYLE, NEWS, SPORT }
