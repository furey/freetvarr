import { artKindHintOf, showImageUrlOf } from './web/artwork-stamps.js'
import { withWidth } from './art-warmer.js'

export const HERO_WIDTHS = [768, 1280, 1920]
export const CARD_WIDTHS = [384, 768]
export const CELL_WIDTH = 192
export const LIST_WIDTH = 384
export const SHOW_HERO_WIDTH = 768
export const DETAIL_POSTER_WIDTH = 192
export const FRAME_BACKFILL_LIMIT = 500

export const createWarmUrls = ({
  loadHero = async () => null,
  loadEpisodes = async () => [],
  loadOnNow = async () => [],
  loadForYou = async () => null,
  loadShows = async () => [],
  loadGuideProgrammes = async () => [],
  loadUpcoming = async () => [],
  loadFrameRecordings = async () => [],
  now = Date.now,
}) => {
  const tiers = {
    home: async () => [
      ...heroUrlsOf(await safely(loadHero, null)),
      ...episodeUrlsOf(await safely(loadEpisodes, [])),
      ...onNowUrlsOf(await safely(loadOnNow, [])),
    ],
    'for-you': async () => forYouUrlsOf(await safely(loadForYou, null)),
    recordings: async () => shelfUrlsOf(await safely(loadShows, [])),
    'guide-today': async () => guideUrlsOf({ programmes: await safely(loadGuideProgrammes, []), fromMs: now(), toMs: now() + DAY_MS }),
    scheduled: async () => scheduledUrlsOf(await safely(loadUpcoming, [])),
    'show-heroes': async () => showHeroUrlsOf(await safely(loadShows, [])),
    'show-posters': async () => detailPosterUrlsOf(await safely(loadShows, [])),
    'guide-week': async () => guideUrlsOf({ programmes: await safely(loadGuideProgrammes, []), fromMs: now() + DAY_MS, toMs: Infinity }),
    frames: async () => frameUrlsOf(await safely(loadFrameRecordings, [])),
  }
  return async (tier) => unique(await (tiers[tier] ?? (async () => []))())
}

export const heroUrlsOf = (hero) => (hero?.candidates ?? [])
  .map((candidate) => candidate?.art?.image)
  .filter(Boolean)
  .flatMap((url) => HERO_WIDTHS.map((width) => withWidth(url, width)))

export const episodeUrlsOf = (episodes = []) => episodes.map((episode) => episode?.picture ?? episode?.image).filter(Boolean)

export const programmeUrlsOf = ({ program, widths }) => {
  if (!program?.title && program?.program_id == null) return []
  const url = program.has_image && program.program_id != null
    ? `/api/epg/image/${encodeURIComponent(program.program_id)}`
    : showImageUrlOf({ title: program.title })
  return widths.map((width) => withWidth(url, width))
}

export const onNowUrlsOf = (entries = []) => entries
  .filter((entry) => !entry?.channel?.offAir)
  .flatMap((entry) => programmeUrlsOf({ program: entry?.now, widths: CARD_WIDTHS }))

export const forYouUrlsOf = (result) => [result?.topPick, ...(result?.sections ?? []).flatMap((section) => section.items ?? [])]
  .filter(Boolean)
  .flatMap((item) => CARD_WIDTHS.map((width) => withWidth(item.image || showImageUrlOf({ title: item.title }), width)))

export const shelfUrlsOf = (shows = []) => shows.flatMap((show) => [
  show.poster ? withWidth(show.poster, LIST_WIDTH) : null,
  show.image || showImageUrlOf({ title: show.title, width: LIST_WIDTH, kind: artKindHintOf(show.kind) }),
]).filter(Boolean)

export const showHeroUrlsOf = (shows = []) => shows
  .map((show) => showImageUrlOf({ title: show.title, width: SHOW_HERO_WIDTH, kind: artKindHintOf(show.kind) }))

export const detailPosterUrlsOf = (shows = []) => shows.map((show) => show.poster && withWidth(show.poster, DETAIL_POSTER_WIDTH)).filter(Boolean)

export const guideUrlsOf = ({ programmes = [], fromMs, toMs }) => programmes
  .filter((programme) => programme.image && programme.program_id != null && programme.end > fromMs && programme.start < toMs)
  .sort((a, b) => a.start - b.start)
  .map((programme) => `/api/epg/image/${encodeURIComponent(programme.program_id)}?w=${CELL_WIDTH}`)

export const scheduledUrlsOf = (upcoming = []) => upcoming.map((entry) => (entry.hasImage && entry.programId != null
  ? `/api/epg/image/${encodeURIComponent(entry.programId)}?w=${LIST_WIDTH}`
  : showImageUrlOf({ title: entry.name, width: LIST_WIDTH })))

export const frameUrlsOf = (recordings = []) => recordings
  .slice(0, FRAME_BACKFILL_LIMIT)
  .map((row) => `/api/recordings/${encodeURIComponent(row.recording_id)}/image?w=${LIST_WIDTH}`)

const unique = (urls) => [...new Set(urls)]

const safely = (load, fallback) => Promise.resolve().then(load).then((value) => value ?? fallback, () => fallback)

const DAY_MS = 24 * 60 * 60 * 1000
