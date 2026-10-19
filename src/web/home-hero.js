import { localDayNumber } from './guide-time.js'
import { formatClock } from './time-format.js'
import { showKeyOf } from './show-key.js'
import { episodeCodeOf, minutesLeftOf, watchedFractionOf, showHrefOf } from './home-feed.js'

export const HERO_SLIDE_LIMIT = 5
export const MOVIES_URL = '/api/library/episodes?state=unwatched&kind=movie&limit=1'

export const heroSlidesOf = ({
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
  nowMs,
  timeZone,
}) => {
  const continueEpisode = inProgress[0] ?? null
  const recording = activeRecordingOf({ active: recordingNow, nowMs })
  const ranked = [
    continueSlideOf({ episode: continueEpisode }),
    newEpisodeSlideOf({ newEpisodes, shows, inProgress, nowMs, timeZone }),
    recording && recordingNowSlideOf({ recording, nowEntries, nowMs, timeZone }),
    forYou,
    onNowSlideOf({ entries: nowEntries, recording, nowMs, timeZone }),
    upcomingSlideOf({ upcoming, activeProgramIds, shows, nowMs, timeZone }),
    watchlistSlideOf({ items: watchlist, nowMs, timeZone }),
    movieSlideOf({ movie: movies[0] ?? null, nowMs, timeZone }),
  ]
  return arrangeByArt({ slides: withoutRepeats(ranked.filter(Boolean)), limit: HERO_SLIDE_LIMIT })
}

export const sharesArt = (a, b) => artKeyOf(a.art.image) === artKeyOf(b.art.image) || showKeyOf(a.art.title) === showKeyOf(b.art.title)

export const arrangeByArt = ({ slides, limit = HERO_SLIDE_LIMIT }) => {
  const pool = [...slides]
  const arranged = []
  while (arranged.length < limit) {
    const previous = arranged.at(-1)
    const pick = pool.findIndex((slide) => !previous || !sharesArt(previous, slide))
    if (pick < 0) break
    arranged.push(...pool.splice(pick, 1))
  }
  return withoutWrapClash({ arranged, pool })
}

const withoutWrapClash = ({ arranged, pool }) => {
  const result = [...arranged]
  while (result.length > 1 && sharesArt(result.at(-1), result[0])) {
    result.pop()
    const previous = result.at(-1)
    const pick = pool.findIndex((slide) => !sharesArt(previous, slide) && !sharesArt(slide, result[0]))
    if (pick >= 0) result.push(...pool.splice(pick, 1))
  }
  return result
}

const artKeyOf = (url) => {
  const [path, query = ''] = String(url ?? '').toLowerCase().split('?')
  const params = new URLSearchParams(query)
  params.delete('w')
  params.sort()
  return `${path}?${params}`
}

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

export const nextUpcomingOf = ({ upcoming = [], activeProgramIds = [], nowMs }) => {
  const active = new Set(activeProgramIds.map(String))
  return upcoming
    .filter((u) => u.startDate > nowMs && !active.has(String(u.programId)))
    .sort((a, b) => a.startDate - b.startDate)[0] ?? null
}

export const watchedShowKeysOf = ({ shows = [], inProgress = [] }) => new Set([
  ...shows.filter((show) => show.counts && show.counts.total > show.counts.unwatched).map((show) => show.key),
  ...inProgress.map((episode) => episode.showKey),
])

export const activeRecordingOf = ({ active = [], nowMs }) => active
  .filter((r) => !r.failed && r.start <= nowMs && nowMs < r.stop)
  .sort((a, b) => a.start - b.start)[0] ?? null

const continueSlideOf = ({ episode }) => {
  if (!episode) return null
  return {
    ...recordingSlideBase({ type: 'continue', episode }),
    eyebrow: 'Continue watching',
    meta: joinMeta([episodeCodeOf(episode), episode.episodeTitle, episode.channelName, `${minutesLeftOf(episode)} min left`]),
    metaShort: joinMeta([episodeCodeOf(episode), `${minutesLeftOf(episode)} min left`]),
    progress: { percent: Math.round(watchedFractionOf(episode) * 100), live: false, label: 'Watched' },
    primary: { action: 'play', label: 'Resume', icon: 'play' },
    secondary: { label: 'Episodes', href: showHrefOf(episode) },
  }
}

const newEpisodeSlideOf = ({ newEpisodes, shows, inProgress, nowMs, timeZone }) => {
  const watched = watchedShowKeysOf({ shows, inProgress })
  const continuing = inProgress[0]?.recordingId
  const episode = newEpisodes.find((e) => e.kind === 'show' && watched.has(e.showKey) && e.recordingId !== continuing)
  if (!episode) return null
  const recorded = recordedWhenOf({ ms: episode.airedAt, nowMs, timeZone })
  return {
    ...recordingSlideBase({ type: 'new', episode }),
    eyebrow: 'New episode',
    meta: joinMeta([episodeCodeOf(episode), recorded, episode.channelName, episode.durationS && durationText(episode.durationS)]),
    metaShort: joinMeta([episodeCodeOf(episode), recorded]),
    progress: null,
    primary: { action: 'play', label: 'Play', icon: 'play' },
    secondary: { label: 'Episodes', href: showHrefOf(episode) },
  }
}

const recordingNowSlideOf = ({ recording, nowEntries, nowMs, timeZone }) => {
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
    art: { image: showImageOf(recording.title), title: recording.title },
    primary: canStartOver
      ? { action: 'from-start', label: 'Watch from the start', icon: 'start-over' }
      : { action: 'watch-live', label: 'Watch live', icon: 'play' },
    secondary: canStartOver ? { action: 'watch-live', label: 'Watch live' } : null,
    programId: recording.programId ?? null,
    target: { recording, channel: channelFor({ channelId: recording.channelId, name: recording.channelName, nowEntries }) },
  }
}

const onNowSlideOf = ({ entries, recording, nowMs, timeZone }) => {
  const entry = entries.find((e) => e.channel?.pinned
    && !e.channel.offAir
    && e.now
    && e.now.start <= nowMs
    && e.now.end > nowMs
    && liveGenreOf(e.now.genre)
    && String(e.channel.id) !== String(recording?.channelId))
  if (!entry) return null
  const { channel, now: program } = entry
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
    art: { image: programmeImageOf(program), title: program.title },
    primary: { action: 'watch-live', label: 'Watch live', icon: 'play' },
    secondary: { action: 'record', label: 'Record' },
    programId: program.program_id,
    target: { channel: liveChannelFrom(channel), program: { ...program, channelId: channel.id } },
  }
}

const upcomingSlideOf = ({ upcoming, activeProgramIds, shows, nowMs, timeZone }) => {
  const item = nextUpcomingOf({ upcoming, activeProgramIds, nowMs })
  if (!item) return null
  const showKey = showKeyOf(item.name)
  const show = shows.find((s) => s.key === showKey)
  const hasRule = Boolean(show?.rule)
  const code = episodeCodeOf({ season: item.season ?? item.seriesNo ?? null, episode: item.episodeNo ?? null })
  return {
    key: `upcoming:${item.programId}`,
    type: 'upcoming',
    eyebrow: recordingWhenEyebrowOf({ startMs: item.startDate, nowMs, timeZone }),
    badge: null,
    title: item.name,
    meta: joinMeta([formatClock(item.startDate, timeZone), item.channelName, code, hasRule ? 'Records every new episode' : 'Records this episode']),
    metaShort: joinMeta([formatClock(item.startDate, timeZone), item.channelName]),
    progress: null,
    art: { image: showImageOf(item.name), title: item.name },
    primary: hasRule
      ? { action: 'options', label: 'Recording options', icon: null }
      : { action: 'upcoming', label: 'Details', icon: null },
    secondary: { label: 'Scheduled', href: '#/recordings/scheduled' },
    programId: item.programId,
    target: { upcoming: item, showKey },
  }
}

const watchlistSlideOf = ({ items, nowMs, timeZone }) => {
  const item = items.find((i) => i.mode === 'notify' && !i.fulfilledAt && i.nextMatch && i.nextMatch.end > nowMs)
  if (!item) return null
  const match = item.nextMatch
  return {
    key: `watchlist:${item.id}`,
    type: 'watchlist',
    eyebrow: 'Now in the guide',
    badge: null,
    title: item.title,
    meta: joinMeta([airingWhenOf({ ms: match.start, nowMs, timeZone }), match.channelName, 'You are watching for this']),
    metaShort: joinMeta([airingWhenOf({ ms: match.start, nowMs, timeZone }), match.channelName]),
    progress: null,
    art: { image: programmeImageOf(match), title: item.title },
    primary: match.series_link
      ? { action: 'record-series', label: 'Record series', icon: null }
      : { action: 'record', label: 'Record', icon: null },
    secondary: { action: 'guide', label: 'Details' },
    programId: match.program_id ?? null,
    target: { channel: { id: match.channelId }, program: match },
  }
}

const movieSlideOf = ({ movie, nowMs, timeZone }) => {
  if (!movie) return null
  const resumes = (movie.positionS ?? 0) > 0
  return {
    ...recordingSlideBase({ type: 'movie', episode: movie }),
    eyebrow: 'Unwatched movie',
    meta: joinMeta(['Movie', movie.durationS && durationText(movie.durationS), recordedWhenOf({ ms: movie.airedAt, nowMs, timeZone }), movie.channelName]),
    metaShort: joinMeta(['Movie', movie.durationS && durationText(movie.durationS)]),
    progress: null,
    primary: { action: 'play', label: resumes ? 'Resume' : 'Play', icon: 'play' },
    secondary: { label: 'Details', href: showHrefOf(movie) },
  }
}

const recordingSlideBase = ({ type, episode }) => ({
  key: `${type}:${episode.recordingId}`,
  type,
  badge: null,
  title: episode.title,
  art: { image: episode.image || showImageOf(episode.title), title: episode.title },
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

const showImageOf = (title) => `/api/epg/show-image?title=${encodeURIComponent(title)}&w=768`

const programmeImageOf = (program) => (program.has_image && program.program_id != null
  ? `/api/epg/image/${encodeURIComponent(program.program_id)}`
  : showImageOf(program.title))

const minutesUntil = ({ ms, nowMs }) => Math.max(1, Math.ceil((ms - nowMs) / 60_000))

const percentBetween = ({ start, end, nowMs }) => (end > start
  ? Math.min(100, Math.max(0, Math.round(((nowMs - start) / (end - start)) * 100)))
  : 0)

const joinMeta = (parts) => parts.filter(Boolean).join(' · ')

const hourOf = ({ ms, timeZone }) => Number(dateFormat({ hour: 'numeric', hourCycle: 'h23', timeZone }).format(ms))

const weekdayOf = ({ ms, timeZone }) => dateFormat({ weekday: 'short', timeZone }).format(ms)

const dateFormat = (options) => new Intl.DateTimeFormat('en-AU', options)

const TONIGHT_FROM_HOUR = 17
const LIVE_GENRES = { 2: 'news', 4: 'sport' }
const GENRE_WORDS = { news: 'News', sport: 'Sport' }
