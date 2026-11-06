import { MIN_SEARCH_LENGTH, buildSearchIndex, searchIndex } from './web/search-index.js'
import { normaliseSearchText, startsAtWord } from './web/search-text.js'
import { programmeIdOf, seriesLinkOfProgramme } from './web/programme-state.js'
import { showKeyOf } from './web/show-key.js'

export const GUIDE_RESULT_CAP = 100

export const buildGuideSearch = ({ guide, curated = [], aliases = [] }) => {
  const byKey = new Map()
  const episodes = []
  for (const [epgId, rows] of Object.entries(guide?.programsByChannel || {})) {
    for (const programme of rows || []) {
      if (!programme?.title) continue
      const key = showKeyOf(programme.title)
      const airing = { programme, epgId }
      const entry = byKey.get(key) || { key, title: programme.title, nextStart: Infinity, recordingCount: 0, airings: [] }
      entry.airings.push(airing)
      entry.nextStart = Math.min(entry.nextStart, Number(programme.start) || Infinity)
      byKey.set(key, entry)
      if (programme.episode_title) episodes.push({ ...airing, key, norm: normaliseSearchText(programme.episode_title) })
    }
  }
  const entries = [...byKey.values()]
  return { index: buildSearchIndex({ entries, curated, aliases }), byKey, episodes }
}

export const GUIDE_GROUP_RANK = { scheduled: 0, series: 1, 'for-you': 2, guide: 3 }

export const guideGroupOf = ({ programme, scheduledIds = new Set(), seriesLinks = new Set(), forYouIds = new Set() }) => {
  if (scheduledIds.has(programmeIdOf(programme))) return 'scheduled'
  if (seriesLinkOfProgramme({ programme, seriesLinks })) return 'series'
  if (forYouIds.has(String(programme.program_id))) return 'for-you'
  return 'guide'
}

export const searchGuideListings = ({ built, channels = [], query, nowMs = Date.now(), toProgramme = (p) => p, cap = GUIDE_RESULT_CAP, scheduledIds, seriesLinks, forYouIds }) => {
  const needle = normaliseSearchText(query)
  if (needle.length < MIN_SEARCH_LENGTH) return []
  const channelsByEpgId = new Map(channels.map((channel) => [String(channel.epgId), channel]))
  const isListed = ({ programme, epgId }) => programme.end > nowMs && channelsByEpgId.has(String(epgId))
  const titleMatches = searchIndex({ index: built.index, query })
  const matchedKeys = new Set(titleMatches.filter((match) => match.reason !== 'fuzzy').map((match) => match.entry.key))
  const episodeHits = built.episodes
    .filter((episode) => !matchedKeys.has(episode.key) && isListed(episode) && startsAtWord({ haystack: episode.norm, needle }))
    .map((episode) => ({ airing: episode, score: EPISODE_SCORE, reason: 'episode' }))
  const usableTitleMatches = episodeHits.length ? titleMatches.filter((match) => match.reason !== 'fuzzy') : titleMatches
  const titleHits = usableTitleMatches.flatMap((match) => match.entry.airings
    .filter(isListed)
    .map((airing) => ({ airing, score: match.score, reason: match.reason, matchedName: match.matchedName })))
  return [...titleHits, ...episodeHits]
    .map((hit) => ({ ...hit, group: guideGroupOf({ programme: hit.airing.programme, scheduledIds, seriesLinks, forYouIds }) }))
    .sort((a, b) => GUIDE_GROUP_RANK[a.group] - GUIDE_GROUP_RANK[b.group]
      || b.score - a.score
      || a.airing.programme.start - b.airing.programme.start)
    .slice(0, cap)
    .map(({ airing, score, reason, matchedName, group }) => {
      const channel = channelsByEpgId.get(String(airing.epgId))
      return {
        ...toProgramme(airing.programme),
        channelId: channel.id,
        channelName: channel.name,
        score: Math.round(score),
        reason,
        group,
        ...(matchedName ? { matchedName } : {}),
      }
    })
}

export const createGuideSearchCache = ({ build = buildGuideSearch } = {}) => {
  let cached = { guide: null, aliases: null, built: null }
  return ({ guide, aliases }) => {
    if (cached.guide !== guide || cached.aliases !== aliases) {
      cached = { guide, aliases, built: build({ guide, ...aliases }) }
    }
    return cached.built
  }
}

const EPISODE_SCORE = 50
