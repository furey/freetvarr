import { localDayNumber } from './guide-time.js'
import { formatClock } from './time-format.js'
import { canRecordSeriesOf, recordWordingOf } from './record-wording.js'
import { showKeyOf } from './show-key.js'
import { artworkStamps, showImageUrlOf } from './artwork-stamps.js'
import { artUrlKeyOf, pickDistinctArt } from './hero-art.js'
import { forYouItemSlideOf, identityOf as suggestionIdentityOf, topRatedItemSlideOf } from './for-you.js'
import { episodeCodeOf, minutesLeftOf, watchedFractionOf, showHrefOf } from './home-feed.js'
import { hourlyOrderOf } from './hero-remix.js'

export const HERO_SLIDE_LIMIT = 5
export const HERO_SLIDES_PER_KIND = 2
export const HOME_HERO_URL = '/api/home/hero'
export const MOVIES_URL =`/api/library/episodes?state=unwatched&kind=movie&limit=${HERO_SLIDES_PER_KIND}`

export const HERO_SRCSET_WIDTHS = [768, 1280, 1920]
export const HERO_SIZES = [
  '(min-width: 1280px) and (min-height: 501px) calc(100vw - 168px)',
  '(min-width: 768px) and (min-height: 501px) calc(100vw - 152px)',
  'calc(100vw - 32px)',
].join(', ')

export const heroSrcsetOf = (url) => (url
  ? HERO_SRCSET_WIDTHS.map((width) => `${withHeroWidth(url, width)} ${width}w`).join(', ')
  : null)

export const withHeroWidth = (url, width) => {
  const [path, query = ''] = String(url).split('?')
  const kept = query.split('&').filter((part) => part && !part.startsWith('w='))
  return `${path}?${[...kept, `w=${width}`].join('&')}`
}

export const heroSlidesOf = ({ candidates = [], limit = HERO_SLIDE_LIMIT, remix = true, isCurrent = () => true, nowMs, timeZone }) => {
  const ranked = onePerShow(candidates
    .filter((candidate) => !hasEnded({ candidate, nowMs }) && isCurrent(candidate))
    .map((candidate) => slideOf(candidate, { nowMs, timeZone }))
    .filter((slide) => slide?.art.images?.length), heroShowKeyOf)
  const ordered = remix ? hourlyOrderOf({ candidates: ranked, nowMs, timeZone }) : ranked
  return arrangeHero({ chosen: ordered.slice(0, limit), waiting: ordered.slice(limit), limit })
    .map(withChosenPicture)
}

export const heroShowKeyOf = (slide) => slide.showKey ?? showKeyOf(slide.art?.title || slide.title || '')

export const slideOf = (candidate, { nowMs, timeZone }) => {
  const build = slideBuildersOf()[candidate?.type]
  if (!build || !candidate.source) return null
  const slide = build({ ...candidate.source, nowMs, timeZone })
  return slide && { ...slide, art: { ...slide.art, ...candidate.art } }
}

export const currentCandidateTestOf = ({
  inProgress = [],
  newEpisodes = [],
  movies = [],
  upcoming = [],
  activeProgramIds = [],
  hiddenKeys = new Set(),
}) => {
  const recordingIds = (list) => new Set(list.map((item) => item.recordingId))
  const listed = { continue: recordingIds(inProgress), new: recordingIds(newEpisodes), movie: recordingIds(movies) }
  const scheduled = new Set(upcoming.map((item) => String(item.programId)))
  const active = new Set(activeProgramIds.map(String))
  return ({ type, source = {} }) => {
    if (listed[type]) return listed[type].has((source.episode ?? source.movie)?.recordingId)
    if (type === 'upcoming') return scheduled.has(String(source.item?.programId)) && !active.has(String(source.item?.programId))
    if (type === 'for-you' || type === 'top-rated') return !hiddenKeys.has(suggestionIdentityOf(source.item ?? {}))
    return true
  }
}

export const hasEnded =({ candidate, nowMs }) => candidate.endsAt != null && candidate.endsAt <= nowMs

export const heroCandidatesOf = ({
  inProgress = [],
  newEpisodes = [],
  shows = [],
  recordingNow = [],
  nowEntries = [],
  upcoming = [],
  activeProgramIds = [],
  watchlist = [],
  movies = [],
  forYou = null,
  topRated = null,
  nowMs,
  timeZone,
  stampUrl = artworkStamps.stampUrl,
}) => {
  const recording = activeRecordingOf({ active: recordingNow, nowMs })
  const channel = recording && channelFor({ channelId: recording.channelId, name: recording.channelName, nowEntries })
  const ranked = [
    ...firstOfKind(inProgress).map((episode) => continueSlideOf({ episode, stampUrl })),
    ...newEpisodeSlidesOf({ newEpisodes, shows, inProgress, nowMs, timeZone, stampUrl }),
    recording && recordingNowSlideOf({ recording, channel, nowMs, timeZone, stampUrl }),
    forYou,
    topRated,
    onNowSlideOf({ entries: nowEntries, recording, nowMs, timeZone, stampUrl }),
    ...upcomingSlidesOf({ upcoming, activeProgramIds, shows, nowMs, timeZone, stampUrl }),
    ...watchlistSlidesOf({ items: watchlist, nowMs, timeZone, stampUrl }),
    ...firstOfKind(movies).map((movie) => movieSlideOf({ movie, nowMs, timeZone, stampUrl })),
  ]
  return withoutRepeats(ranked.filter(Boolean))
}

export const reusedArtSlidesOf = ({ slides, identityOf = slideArtIdentityOf(slides) }) => {
  const seen = new Set()
  return slides.filter((slide) => {
    const identity = identityOf(slide.art.image)
    if (seen.has(identity)) return true
    seen.add(identity)
    return false
  })
}

export const slideArtIdentityOf = (slides) => {
  const identities = new Map()
  for (const image of slides.flatMap((slide) => slide.art?.images ?? [])) {
    if (image.identity) identities.set(artUrlKeyOf(image.url), image.identity)
  }
  return (url) => identities.get(artUrlKeyOf(url)) ?? artUrlKeyOf(url)
}

const arrangeHero = ({ chosen, waiting, limit }) => {
  const identityOf = slideArtIdentityOf([...chosen, ...waiting])
  const picked = pickDistinctArt({ slides: chosen, candidatesFor: provenUrlsOf, identityOf })
  const dropped = [...picked.unplaceable, ...reusedArtSlidesOf({ slides: picked.slides, identityOf })]
  if (!dropped.length) return picked.slides
  const droppedKeys = new Set(dropped.map((slide) => slide.key))
  const kept = chosen.filter((slide) => !droppedKeys.has(slide.key))
  const refill = waiting.slice(0, limit - kept.length)
  return arrangeHero({ chosen: [...kept, ...refill], waiting: waiting.slice(refill.length), limit })
}

const provenUrlsOf = (slide) => (slide.art.images ?? []).map((image) => image.url)

const withChosenPicture = (slide) => {
  const picture = slide.art.images.find((image) => image.url === slide.art.image) ?? slide.art.images[0]
  return {
    ...slide,
    art: { ...slide.art, image: picture.url, srcset: picture.srcset ?? heroSrcsetOf(picture.url), focus: picture.focus ?? null },
  }
}

const slideBuildersOf = () => ({
  continue: continueSlideOf,
  new: newEpisodeSlideOf,
  recording: recordingNowSlideOf,
  'on-now': onNowEntrySlideOf,
  upcoming: upcomingSlideOf,
  watchlist: watchlistSlideOf,
  movie: movieSlideOf,
  'for-you': forYouItemSlideOf,
  'top-rated': topRatedItemSlideOf,
})

export const showImageOf = ({ title, stampUrl = artworkStamps.stampUrl }) =>
  stampUrl(showImageUrlOf({ title, width: HERO_IMAGE_WIDTH }))

export const heroRecordingIdsOf = (slides) =>
  new Set(slides.map((slide) => slide.recordingId).filter(Boolean))

export const heroProgramIdsOf = (slides) =>
  new Set(slides.filter((slide) => slide.type === 'upcoming').map((slide) => String(slide.programId)))

export const liveGenreOf = (genre) => (genre == null ? null : LIVE_GENRES[Number(genre) >> 4] ?? null)

export const durationText = (seconds) => {
  const minutes = Math.round((seconds ?? 0) / 60)
  if (minutes < 60) return `${minutes} min`
  const rest = minutes % 60
  return rest ? `${Math.floor(minutes / 60)} h ${rest} min` : `${minutes / 60} h`
}

export const recordedWhenOf = ({ ms, nowMs, timeZone }) => {
  if (!ms) return ''
  const daysAgo = localDayNumber({ ms: nowMs, timeZone }) - localDayNumber({ ms, timeZone })
  if (daysAgo <= 0) return 'Recorded today'
  if (daysAgo === 1) return hourOf({ ms, timeZone }) >= 18 ? 'Recorded last night' : 'Recorded yesterday'
  if (daysAgo < 7) return `Recorded ${weekdayOf({ ms, timeZone })}`
  return `Recorded ${dateFormat({ day: 'numeric', month: 'short', timeZone }).format(ms)}`
}

export const airingWhenOf = ({ ms, nowMs, timeZone }) => {
  const daysAhead = localDayNumber({ ms, timeZone }) - localDayNumber({ ms: nowMs, timeZone })
  const clock = formatClock(ms, timeZone)
  if (daysAhead <= 0) return `Today ${clock}`
  if (daysAhead === 1) return `Tomorrow ${clock}`
  return `${weekdayOf({ ms, timeZone })} ${clock}`
}

export const recordingWhenEyebrowOf = ({ startMs, nowMs, timeZone }) => {
  const daysAhead = localDayNumber({ ms: startMs, timeZone }) - localDayNumber({ ms: nowMs, timeZone })
  if (daysAhead <= 0) return hourOf({ ms: startMs, timeZone }) >= TONIGHT_FROM_HOUR ? 'Recording tonight' : 'Recording today'
  if (daysAhead === 1) return 'Recording tomorrow'
  return `Recording ${dateFormat({ weekday: 'long', timeZone }).format(startMs)}`
}

export const nextUpcomingOf = ({ upcoming = [], activeProgramIds = [], nowMs }) =>
  soonestUpcomingOf({ upcoming, activeProgramIds, nowMs })[0] ?? null

export const soonestUpcomingOf = ({ upcoming = [], activeProgramIds = [], nowMs }) => {
  const active = new Set(activeProgramIds.map(String))
  return upcoming
    .filter((u) => u.startDate > nowMs && !active.has(String(u.programId)))
    .sort((a, b) => a.startDate - b.startDate)
}

export const watchedShowKeysOf = ({ shows = [], inProgress = [] }) => new Set([
  ...shows.filter((show) => show.counts && show.counts.total > show.counts.unwatched).map((show) => show.key),
  ...inProgress.map((episode) => episode.showKey),
])

export const activeRecordingOf = ({ active = [], nowMs }) => active
  .filter((r) => !r.failed && r.start <= nowMs && nowMs < r.stop)
  .sort((a, b) => a.start - b.start)[0] ?? null

const continueSlideOf = ({ episode, stampUrl }) => ({
  ...recordingSlideBase({ type: 'continue', episode, stampUrl }),
  eyebrow: 'Continue watching',
  meta: joinMeta([episodeCodeOf(episode), episode.episodeTitle, episode.channelName, `${minutesLeftOf(episode)} min left`]),
  metaShort: joinMeta([episodeCodeOf(episode), `${minutesLeftOf(episode)} min left`]),
  progress: { percent: Math.round(watchedFractionOf(episode) * 100), live: false, label: 'Watched' },
  primary: { action: 'play', label: 'Resume', icon: 'play' },
  secondary: { label: 'Episodes', href: showHrefOf(episode) },
  source: { episode },
})

const newEpisodeSlidesOf = ({ newEpisodes, shows, inProgress, nowMs, timeZone, stampUrl }) => {
  const watched = watchedShowKeysOf({ shows, inProgress })
  const continuing = new Set(firstOfKind(inProgress).map((e) => e.recordingId))
  const episodes = newEpisodes.filter((e) => e.kind === 'show' && watched.has(e.showKey) && !continuing.has(e.recordingId))
  return firstOfKind(onePerShow(episodes)).map((episode) => newEpisodeSlideOf({ episode, nowMs, timeZone, stampUrl }))
}

const newEpisodeSlideOf = ({ episode, nowMs, timeZone, stampUrl }) => {
  const recorded = recordedWhenOf({ ms: episode.airedAt, nowMs, timeZone })
  return {
    ...recordingSlideBase({ type: 'new', episode, stampUrl }),
    eyebrow: 'New episode',
    meta: joinMeta([episodeCodeOf(episode), recorded, episode.channelName, episode.durationS && durationText(episode.durationS)]),
    metaShort: joinMeta([episodeCodeOf(episode), recorded]),
    progress: null,
    primary: { action: 'play', label: 'Play', icon: 'play' },
    secondary: { label: 'Episodes', href: showHrefOf(episode) },
    source: { episode },
  }
}

const recordingNowSlideOf = ({ recording, channel, nowMs, timeZone, stampUrl }) => {
  const canStartOver = Boolean(recording.canPlayFromStart && recording.dvrUuid)
  const left = minutesUntil({ ms: recording.stop, nowMs })
  const lead = episodeCodeOf(recording) || recording.episodeTitle
  return {
    key: `recording:${recording.dvrUuid ?? recording.uuid}`,
    type: 'recording',
    eyebrow: 'Recording now',
    badge: 'REC',
    title: recording.title,
    meta: joinMeta([lead, recording.channelName, `until ${formatClock(recording.stop, timeZone)}`, `${left} min left`]),
    metaShort: joinMeta([recording.channelName, `${left} min left`]),
    progress: { percent: percentBetween({ start: recording.start, end: recording.stop, nowMs }), live: true, label: 'Recorded so far' },
    art: { image: showImageOf({ title: recording.title, stampUrl }), title: recording.title },
    primary: canStartOver
      ? { action: 'from-start', label: 'Watch from the start', icon: 'start-over' }
      : { action: 'watch-live', label: 'Watch live', icon: 'play' },
    secondary: canStartOver ? { action: 'watch-live', label: 'Watch live' } : null,
    programId: recording.programId ?? null,
    target: { recording, channel },
    source: { recording, channel },
    endsAt: recording.stop,
  }
}

const onNowSlideOf = ({ entries, recording, nowMs, timeZone, stampUrl }) => {
  const entry = entries.find((e) => e.channel?.pinned
    && !e.channel.offAir
    && e.now
    && e.now.start <= nowMs
    && e.now.end > nowMs
    && liveGenreOf(e.now.genre)
    && String(e.channel.id) !== String(recording?.channelId))
  if (!entry) return null
  return onNowEntrySlideOf({ channel: entry.channel, program: entry.now, nowMs, timeZone, stampUrl })
}

const onNowEntrySlideOf = ({ channel, program, nowMs, timeZone, stampUrl }) => {
  const genre = liveGenreOf(program.genre)
  const left = minutesUntil({ ms: program.end, nowMs })
  return {
    key: `on-now:${channel.id}:${program.program_id}`,
    type: 'on-now',
    eyebrow: `Live ${genre} on ${channel.name}`,
    badge: 'LIVE',
    title: program.title,
    meta: joinMeta([GENRE_WORDS[genre], channel.name, `until ${formatClock(program.end, timeZone)}`, `${left} min left`]),
    metaShort: joinMeta([channel.name, `${left} min left`]),
    progress: { percent: percentBetween({ start: program.start, end: program.end, nowMs }), live: true, label: 'Progress' },
    art: { image: programmeImageOf({ program, stampUrl }), title: program.title },
    primary: { action: 'watch-live', label: 'Watch live', icon: 'play' },
    secondary: { action: 'record', label: 'Record' },
    programId: program.program_id,
    target: { channel: liveChannelFrom(channel), program: { ...program, channelId: channel.id } },
    source: { channel, program },
    endsAt: program.end,
  }
}

const upcomingSlidesOf = ({ upcoming, activeProgramIds, shows, nowMs, timeZone, stampUrl }) => {
  const items = onePerShow(soonestUpcomingOf({ upcoming, activeProgramIds, nowMs }), (item) => showKeyOf(item.name))
  const ruled = new Set(shows.filter((show) => show.rule).map((show) => show.key))
  return firstOfKind(items).map((item) => upcomingSlideOf({ item, hasRule: ruled.has(showKeyOf(item.name)), nowMs, timeZone, stampUrl }))
}

const upcomingSlideOf = ({ item, hasRule, nowMs, timeZone, stampUrl }) => {
  const showKey = showKeyOf(item.name)
  const code = episodeCodeOf({ season: item.season ?? item.seriesNo ?? null, episode: item.episodeNo ?? null })
  return {
    key: `upcoming:${item.programId}`,
    type: 'upcoming',
    eyebrow: recordingWhenEyebrowOf({ startMs: item.startDate, nowMs, timeZone }),
    badge: null,
    title: item.name,
    meta: joinMeta([formatClock(item.startDate, timeZone), item.channelName, code, hasRule ? 'Records every new episode' : recordWordingOf({ kind: item.kind }).scheduledMeta]),
    metaShort: joinMeta([formatClock(item.startDate, timeZone), item.channelName]),
    progress: null,
    art: { image: showImageOf({ title: item.name, stampUrl }), title: item.name },
    primary: hasRule
      ? { action: 'options', label: 'Recording options', icon: null }
      : { action: 'upcoming', label: 'Details', icon: null },
    secondary: { label: 'Scheduled', href: '#/recordings/scheduled' },
    programId: item.programId,
    target: { upcoming: item, showKey },
    source: { item, hasRule },
    endsAt: item.startDate,
  }
}

const watchlistSlidesOf = ({ items, nowMs, timeZone, stampUrl }) => firstOfKind(
  items.filter((i) => i.mode === 'notify' && !i.fulfilledAt && i.nextMatch && i.nextMatch.end > nowMs),
).map((item) => watchlistSlideOf({ item, nowMs, timeZone, stampUrl }))

const watchlistSlideOf = ({ item, nowMs, timeZone, stampUrl }) => {
  const match = item.nextMatch
  return {
    key: `watchlist:${item.id}`,
    type: 'watchlist',
    eyebrow: 'Now in the guide',
    badge: null,
    title: item.title,
    meta: joinMeta([airingWhenOf({ ms: match.start, nowMs, timeZone }), match.channelName, 'On your watchlist']),
    metaShort: joinMeta([airingWhenOf({ ms: match.start, nowMs, timeZone }), match.channelName]),
    progress: null,
    art: { image: programmeImageOf({ program: match, stampUrl }), title: item.title },
    primary: canRecordSeriesOf(match)
      ? { action: 'record-series', label: 'Record series', icon: null }
      : { action: 'record', label: 'Record', icon: null },
    secondary: { action: 'guide', label: 'Details' },
    programId: match.program_id ?? null,
    target: { channel: { id: match.channelId }, program: match },
    source: { item },
    endsAt: match.end,
  }
}

const movieSlideOf = ({ movie, nowMs, timeZone, stampUrl }) => {
  const resumes = (movie.positionS ?? 0) > 0
  return {
    ...recordingSlideBase({ type: 'movie', episode: movie, stampUrl }),
    eyebrow: 'Unwatched movie',
    meta: joinMeta(['Movie', movie.durationS && durationText(movie.durationS), recordedWhenOf({ ms: movie.airedAt, nowMs, timeZone }), movie.channelName]),
    metaShort: joinMeta(['Movie', movie.durationS && durationText(movie.durationS)]),
    progress: null,
    primary: { action: 'play', label: resumes ? 'Resume' : 'Play', icon: 'play' },
    secondary: { label: 'Details', href: showHrefOf(movie) },
    source: { movie },
  }
}

const recordingSlideBase = ({ type, episode, stampUrl = artworkStamps.stampUrl }) => ({
  key: `${type}:${episode.recordingId}`,
  type,
  badge: null,
  title: episode.title,
  showKey: episode.showKey ?? showKeyOf(episode.title),
  art: episode.artChosen
    ? { image: stampUrl(heroSizedOf(episode.image)), title: episode.title, chosen: true }
    : { image: episode.image || showImageOf({ title: episode.title, stampUrl }), title: episode.title },
  recordingId: episode.recordingId,
  target: { episode },
})

const withoutRepeats = (slides) => {
  const seen = new Set()
  return slides.filter((slide) => {
    const id = slide.recordingId ?? slide.key
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

const firstOfKind = (items) => items.slice(0, HERO_SLIDES_PER_KIND)

const onePerShow = (items, showKeyFor = (item) => item.showKey) => {
  const seen = new Set()
  return items.filter((item) => {
    const key = showKeyFor(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const channelFor = ({ channelId, name, nowEntries }) => {
  const channel = nowEntries.find((e) => String(e.channel?.id) === String(channelId))?.channel
  return channel ? liveChannelFrom(channel) : { id: channelId, name, number: null, hasLogo: false }
}

const liveChannelFrom = (channel) => ({
  id: channel.id,
  name: channel.name,
  number: channel.number ?? null,
  hasLogo: Boolean(channel.hasLogo),
})

const heroSizedOf = (url) => String(url).replace(/([?&])w=\d+/, `$1w=${HERO_IMAGE_WIDTH}`)

const programmeImageOf = ({ program, stampUrl }) => (program.has_image && program.program_id != null
  ? `/api/epg/image/${encodeURIComponent(program.program_id)}`
  : showImageOf({ title: program.title, stampUrl }))

const minutesUntil = ({ ms, nowMs }) => Math.max(1, Math.ceil((ms - nowMs) / 60_000))

const percentBetween = ({ start, end, nowMs }) => (end > start
  ? Math.min(100, Math.max(0, Math.round(((nowMs - start) / (end - start)) * 100)))
  : 0)

const joinMeta = (parts) => parts.filter(Boolean).join(' · ')

const hourOf = ({ ms, timeZone }) => Number(dateFormat({ hour: 'numeric', hourCycle: 'h23', timeZone }).format(ms))

const weekdayOf = ({ ms, timeZone }) => dateFormat({ weekday: 'short', timeZone }).format(ms)

const dateFormat = (options) => new Intl.DateTimeFormat('en-AU', options)

const HERO_IMAGE_WIDTH = 768
const TONIGHT_FROM_HOUR = 17
const LIVE_GENRES = { 2: 'news', 4: 'sport' }
const GENRE_WORDS = { news: 'News', sport: 'Sport' }
