import { airingWhenOf, durationText } from './home-hero.js'
import { failureText } from './shared/request-errors.js'
import { localDayNumber } from './guide-time.js'
import { showKeyOf } from './show-key.js'
import { artworkStamps, showImageUrlOf } from './artwork-stamps.js'
import { recordWordingOf } from './record-wording.js'
import { movieKindRowOf } from './movie-choice.js'

export const FOR_YOU_URL = '/api/for-you'

export const forYouReadyOf = ({ settings, payload }) => settings?.enabled !== false
  && payload?.enabled !== false
  && payload?.coldStart === false
export const FOR_YOU_HREF = '#/for-you'
export const SUGGESTIONS_HREF = '#/settings/for-you'
export const HOME_ROW_LIMIT = 12
export const HOME_TOP_RATED_SLOTS = [2, 6]
export const HOME_OTHER_LANGUAGE_LIMITS = { all: Infinity, few: 2, none: 0 }
export const CHOOSER_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000
export const MAX_SHOWN_EVENTS = 50

export const SECTION_ORDER = [
  'ready-to-watch', 'finish-started', 'coming-up', 'new-seasons', 'tonight-movies',
  'might-like', 'top-rated-series', 'top-rated', 'movies', 'premieres',
]
export const TOP_RATED_SECTION = 'top-rated'
export const READY_SECTION = 'ready-to-watch'
export const OTHER_LANGUAGE_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'few', label: 'A few' },
  { key: 'none', label: 'None' },
]

export const SECTION_TITLES = {
  'ready-to-watch': 'Ready to watch',
  'finish-started': 'Finish what you started',
  'coming-up': 'Coming up this week for you',
  'new-seasons': 'New seasons and returning',
  'might-like': 'You might like',
  'tonight-movies': 'Movies worth recording tonight',
  'top-rated-series': 'Top rated series this week',
  'top-rated': 'Top rated movies this week',
  movies: 'Movies for you',
  premieres: 'Premieres and movies this week',
}

export const TIER_LABELS = { basic: 'Basic', standard: 'Standard', plus: 'Plus' }

export const TIER_OVERRIDES = [
  { key: 'auto', label: 'Auto' },
  { key: 'basic', label: 'Basic' },
  { key: 'standard', label: 'Standard' },
  { key: 'plus', label: 'Plus' },
]

export const msOf = (value) => {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return null
  return number < 1e11 ? number * 1000 : number
}

export const kindOf = (item) => String(item?.kind ?? '').toLowerCase().replace(/[\s_]+/g, '-')

export const isMovie = (item) => kindOf(item) === 'movie'

export const identityOf = (item) => item.seriesKey || showKeyOf(item.title)

export const scheduleKeyOf = ({ channelId, startMs }) => `${channelId}@${Math.round(startMs / 60_000)}`

export const scheduledKeysOf = (upcoming = []) => new Set(upcoming
  .filter((u) => u.channelId != null && msOf(u.startDate))
  .map((u) => scheduleKeyOf({ channelId: u.channelId, startMs: msOf(u.startDate) })))

export const isScheduled = ({ item, scheduledKeys }) => Boolean(scheduledKeys?.has(scheduleKeyOf({
  channelId: item.channelId,
  startMs: msOf(item.start) ?? 0,
})))

export const sectionsOf = ({ payload, scheduledKeys = new Set(), hiddenKeys = new Set() }) => {
  const seenAirings = new Set()
  const seenRecordings = new Set()
  return orderedSections(payload?.sections)
    .map((section) => {
      const seen = section.key === READY_SECTION ? seenRecordings : seenAirings
      const items = (section.items ?? []).filter((item) => {
        const identity = identityOf(item)
        if (hiddenKeys.has(identity) || seen.has(identity)) return false
        seen.add(identity)
        return true
      })
      return {
        key: section.key,
        title: section.title || SECTION_TITLES[section.key] || 'For you',
        sortedByAirTime: section.key === 'coming-up',
        credit: creditOf(section.credit),
        rows: rowsOf(scheduledLast({ items, scheduledKeys })),
      }
    })
    .filter((section) => section.rows.length)
}

export const suggestionCountOf = ({ payload, scheduledKeys = new Set(), hiddenKeys = new Set() }) => {
  if (!payload || payload.enabled === false) return 0
  return sectionsOf({ payload, scheduledKeys, hiddenKeys }).reduce((sum, section) => sum + sectionItemsOf(section).length, 0)
}

export const homeRowOf = ({ payload, scheduledKeys = new Set(), hiddenKeys = new Set(), limit = HOME_ROW_LIMIT }) => {
  if (!payload || payload.enabled === false) return null
  const sections = sectionsOf({ payload, scheduledKeys, hiddenKeys })
  const otherLimit = HOME_OTHER_LANGUAGE_LIMITS[payload.otherLanguageFilms] ?? HOME_OTHER_LANGUAGE_LIMITS.few
  const films = withinOtherLanguageLimit({
    items: scheduledLast({ items: topRatedItemsOf(sections), scheduledKeys }),
    limit: otherLimit,
  }).slice(0, HOME_TOP_RATED_SLOTS.length)
  const spread = withinOtherLanguageLimit({
    items: scheduledLast({ items: interleaved(spreadLanesOf(sections)), scheduledKeys }),
    limit: otherLimit - films.filter(isOtherLanguageItem).length,
  }).slice(0, Math.max(0, limit - films.length))
  const items = withFilmsAt({ items: spread, films, slots: HOME_TOP_RATED_SLOTS }).slice(0, limit).map(withoutScore)
  if (!items.length) return null
  return { title: payload.coldStart ? 'New this week' : 'For you', items }
}

export const isReadyItem = (item) => kindOf(item) === 'ready'

export const badgeOf = ({ item, scheduled = false }) => {
  if (scheduled) return { label: 'Recording', tone: 'rec' }
  if (item.onNow) return { label: 'LIVE', tone: 'live' }
  const label = KIND_BADGES[kindOf(item)]
  return label ? { label, tone: 'plain' } : null
}

export const cardMetaOf = ({ item, nowMs, timeZone, withLead = false }) => {
  if (isReadyItem(item)) return joinMeta([item.episodeLabel, item.episodeTitle || (item.durationS && durationText(item.durationS))])
  const start = msOf(item.start)
  const stop = msOf(item.stop)
  if (item.onNow && stop) {
    return joinMeta(['On now', item.channelName, `${Math.max(1, Math.ceil((stop - nowMs) / 60_000))} min left`])
  }
  const lead = withLead ? KIND_BADGES[kindOf(item)] : ''
  return joinMeta([lead, start && airingWhenOf({ ms: start, nowMs, timeZone }), item.channelName])
}

export const cardRatingOf = (item) => {
  const score = Number(item?.rating?.score)
  if (!(score > 0)) return null
  return { label: score.toFixed(1), spoken: `rated ${score.toFixed(1)} out of 10` }
}

export const reasonOf = (item) => {
  if (item.reason) return item.reason
  if (cardRatingOf(item)) return ''
  const start = msOf(item.start)
  const stop = msOf(item.stop)
  if (isMovie(item)) return joinMeta(['Movie', start && stop && durationText((stop - start) / 1000)])
  return FALLBACK_REASONS[kindOf(item)] ?? ''
}

export const liveProgressOf = ({ item, nowMs }) => {
  const start = msOf(item.start)
  const stop = msOf(item.stop)
  if (!item.onNow || !start || !stop || stop <= start) return null
  return Math.min(100, Math.max(0, Math.round(((nowMs - start) / (stop - start)) * 100)))
}

export const cardLabelOf = ({ item, meta, reason, badge, rating = null }) =>
  [item.title, badge?.tone === 'live' ? 'on now' : badge?.label, rating?.spoken, meta, reason].filter(Boolean).join(', ')

export const tapActionOf = ({ item, scheduled = false }) => {
  if (isReadyItem(item)) return 'play-recording'
  if (scheduled) return 'show'
  if (item.onNow) return 'watch-live'
  const kind = kindOf(item)
  const seriesKinds = ['new-season', 'returning', 'premiere', 'new-show']
  if (seriesKinds.includes(kind) && item.canRecordSeries) return 'record-series'
  return 'record-episode'
}

export const sheetFocusOf = (action) => SHEET_FOCUS[action] ?? ''

export const menuOf = ({ item, scheduled = false, nowMs, timeZone }) => {
  if (isReadyItem(item)) return readyMenuOf(item)
  const start = msOf(item.start)
  const actions = [
    item.onNow && { key: 'watch-live', label: 'Watch live', icon: 'play', detail: item.channelName || '' },
    !scheduled && {
      key: 'record-episode',
      label: recordWordingOf({ kind: item.programmeKind }).menuLabel,
      icon: 'record',
      detail: item.onNow ? 'From now' : (start ? airingWhenOf({ ms: start, nowMs, timeZone }) : ''),
    },
    !scheduled && item.canRecordSeries && { key: 'record-series', label: 'Record series', icon: 'series' },
    scheduled && { key: 'show', label: 'Go to show', icon: 'options' },
    { key: 'programme-info', label: 'Programme info', icon: 'info' },
  ].filter(Boolean)
  const more = [
    { key: 'not-interested', label: `Not interested in ${item.title}`, icon: 'hide' },
    movieKindRowOf(item.movieChoice),
    { key: 'why', label: 'Why this?', icon: 'why' },
  ].filter(Boolean)
  return { actions, more }
}

const readyMenuOf = (item) => ({
  actions: [
    { key: 'play-recording', label: 'Play', icon: 'play', detail: item.episodeLabel || '' },
    { key: 'show', label: 'Go to show', icon: 'options' },
  ],
  more: [
    { key: 'not-interested', label: `Not interested in ${item.title}`, icon: 'hide' },
    { key: 'why', label: 'Why this?', icon: 'why' },
  ],
})

export const menuMetaOf = ({ item, nowMs, timeZone }) => cardMetaOf({ item, nowMs, timeZone, withLead: true })

export const programOf = (item) => ({
  program_id: item.programId ?? item.id,
  title: item.title,
  episode_title: item.episodeTitle || null,
  synopsis: item.synopsis || null,
  kind: item.programmeKind ?? null,
  start: msOf(item.start),
  end: msOf(item.stop),
  channelId: item.channelId,
  series_link: item.seriesLink ?? null,
  movieChoice: item.movieChoice ?? null,
  has_image: String(item.image || '').startsWith('/api/epg/image/'),
})

export const sheetRequestOf = ({ item, action, nowMs, timeZone }) => ({
  channelId: item.channelId,
  programme: programOf(item),
  channelHint: { name: item.channelName || '', hasLogo: true },
  focus: sheetFocusOf(action),
  dayOffset: dayOffsetOf({ ms: msOf(item.start) ?? nowMs, nowMs, timeZone }),
})

export const dayOffsetOf = ({ ms, nowMs, timeZone }) =>
  Math.max(0, localDayNumber({ ms, timeZone }) - localDayNumber({ ms: nowMs, timeZone }))

export const liveChannelOfItem = (item) => ({
  id: item.channelId,
  name: item.channelName || '',
  number: null,
  hasLogo: true,
})

export const feedbackOf = ({ kind, item, source }) => ({
  kind,
  series_key: identityOf(item),
  title: item.title,
  ...(msOf(item.start) ? { programme_start: Math.round(msOf(item.start)) } : {}),
  ...(item.channelId != null ? { channel_id: String(item.channelId) } : {}),
  source,
})

export const thumbToggleOf = ({ current, direction }) => (current === direction
  ? { next: null, kind: 'thumb_clear' }
  : { next: direction, kind: direction === 'up' ? 'thumb_up' : 'thumb_down' })

export const programmeOpenedOf = ({ programme, channelId }) => feedbackOf({
  kind: 'programme_opened',
  item: { title: programme.title, start: programme.start, channelId },
  source: 'sheet',
})

export const shownBatchesOf = ({ items, source, size = MAX_SHOWN_EVENTS }) => {
  const events = items.map((item) => feedbackOf({ kind: 'suggestion_shown', item, source }))
  const batches = []
  for (let i = 0; i < events.length; i += size) batches.push({ events: events.slice(i, i + size) })
  return batches
}

export const forYouSlideOf = ({ payload, scheduledKeys = new Set(), hiddenKeys = new Set(), nowMs, timeZone, stampUrl = artworkStamps.stampUrl }) => {
  if (!payload || payload.enabled === false || payload.coldStart) return null
  const item = sectionsOf({ payload, scheduledKeys, hiddenKeys })
    .filter((section) => section.key !== TOP_RATED_SECTION && section.key !== READY_SECTION)
    .flatMap((section) => section.rows.flatMap((row) => row.items))
    .find((candidate) => !isScheduled({ item: candidate, scheduledKeys }) && msOf(candidate.stop) > nowMs)
  return item ? forYouItemSlideOf({ item, nowMs, timeZone, stampUrl }) : null
}

export const forYouItemSlideOf = ({ item, nowMs, timeZone, stampUrl = artworkStamps.stampUrl }) => {
  const when = msOf(item.start) && airingWhenOf({ ms: msOf(item.start), nowMs, timeZone })
  return {
    key: `for-you:${item.id}`,
    type: 'for-you',
    eyebrowAccent: 'For you',
    eyebrow: carouselReasonOf(item),
    badge: null,
    title: item.title,
    meta: joinMeta([KIND_BADGES[kindOf(item)], item.episodeTitle, when, item.channelName]),
    metaShort: joinMeta([when, item.channelName]),
    progress: null,
    art: { image: item.image ? stampUrl(item.image) : stampUrl(showImageUrlOf({ title: item.title, width: 768 })), title: item.title },
    primary: item.canRecordSeries
      ? { action: 'record-series', label: 'Record series', icon: 'record' }
      : { action: 'record', label: 'Record', icon: 'record' },
    secondary: { action: 'guide', label: 'Details' },
    programId: item.id,
    target: {
      item,
      channel: { id: item.channelId },
      program: programOf(item),
      dayOffset: dayOffsetOf({ ms: msOf(item.start) ?? nowMs, nowMs, timeZone }),
    },
    source: { item },
    endsAt: msOf(item.stop),
  }
}

export const topRatedSlideOf = ({ payload, scheduledKeys = new Set(), hiddenKeys = new Set(), nowMs, timeZone, besides = null }) => {
  if (!payload || payload.enabled === false) return null
  const otherLanguageTaken = payload.otherLanguageFilms !== 'all' && Boolean(besides?.target?.item?.otherLanguage)
  const item = (sectionsOf({ payload, scheduledKeys, hiddenKeys })
    .find((section) => section.key === TOP_RATED_SECTION)?.rows ?? [])
    .flatMap((row) => row.items)
    .find((candidate) => hasWidePicture(candidate)
      && !isScheduled({ item: candidate, scheduledKeys })
      && msOf(candidate.start) > nowMs
      && candidate.id !== besides?.target?.item?.id
      && !(otherLanguageTaken && candidate.otherLanguage))
  return item ? topRatedItemSlideOf({ item, nowMs, timeZone }) : null
}

export const topRatedItemSlideOf = ({ item, nowMs, timeZone }) => {
  const when = airingWhenOf({ ms: msOf(item.start), nowMs, timeZone })
  return {
    key: `top-rated:${item.id}`,
    type: 'top-rated',
    eyebrow: 'Top rated this week',
    badge: null,
    title: item.title,
    meta: joinMeta([when, item.channelName]),
    metaShort: joinMeta([when, item.channelName]),
    progress: null,
    art: { image: item.image, title: item.title },
    primary: item.canRecordSeries
      ? { action: 'record-series', label: 'Record series', icon: 'record' }
      : { action: 'record', label: 'Record', icon: 'record' },
    secondary: { action: 'guide', label: 'Details' },
    programId: item.id,
    target: {
      item,
      channel: { id: item.channelId },
      program: programOf(item),
      dayOffset: dayOffsetOf({ ms: msOf(item.start) ?? nowMs, nowMs, timeZone }),
    },
    source: { item },
    endsAt: msOf(item.start),
  }
}

export const hasWidePicture = (item) => String(item?.image || '').startsWith('/api/epg/image/')

export const carouselReasonOf = (item) => item.reason || CAROUSEL_REASONS[kindOf(item)] || 'Picked for you'

export const pageIntroOf = ({ coldStart }) => (coldStart
  ? 'Suggestions start after you watch a few shows. Until then, here is what\'s new this week.'
  : 'Picked from the next 7 days of the guide, based on what you watched and recorded.')

export const chooserShownOf = ({ coldStart, pickable = [], skippedAt = null, picked = false, nowMs }) => {
  if (!coldStart || picked || !pickable.length) return false
  return !(skippedAt && nowMs - skippedAt < CHOOSER_SNOOZE_MS)
}

export const doneLabelOf = (count) => (count ? `Done · ${count} picked` : 'Done')

export const hiddenToastOf = (title) => `${title} is hidden from For you`

export const movieKindToastOf = ({ title, kind }) => (kind === 'movie'
  ? `${title} is now listed as a movie`
  : `${title} is no longer listed as a movie`)

export const undoneMovieKindToastOf = ({ title, kind }) => (kind === 'not-movie'
  ? `${title} is listed as a movie again`
  : `${title} is no longer listed as a movie`)

export const tierLabelOf = (tier) => TIER_LABELS[tier] ?? 'Basic'

export const tierSummaryOf = (settings) => {
  const tier = tierLabelOf(settings?.tier)
  const override = settings?.tierOverride
  return override && override !== 'auto' ? `${tier}, set by you` : `${tier}, detected on this box`
}

export const tierReasonOf = (settings) => {
  const probe = settings?.probe
  const reason = settings?.tierReason || probe?.reason || probe?.autoReason
  if (reason) return reason
  if (!probe) return 'Freetvarr has not checked this box yet.'
  const ramMb = probe.ramMb ?? probe.memory?.totalMb
  const memory = ramMb ? `${Math.round(ramMb / 1024)} GB memory` : ''
  const cores = probe.cores ? `${probe.cores} cores` : ''
  return joinParts([cores, memory, probe.arch]) || 'Freetvarr could not read this box\'s hardware.'
}

export const historyClearCopyOf = (count) => {
  if (!count) return 'Removes your viewing history, your thumbs up and down, and your hidden shows. Suggestions start again from new.'
  const entries = count === 1 ? '1 history entry' : `${count.toLocaleString('en-AU')} history entries`
  return `Removes ${entries}, including your thumbs up and down and your hidden shows. Suggestions start again from new.`
}

export const whyRowsOf = (why) => {
  const reasons = [...(why?.reasons ?? [])].filter((reason) => reason?.text)
  const top = Math.max(0, ...reasons.map((reason) => Number(reason.weight) || 0))
  return reasons
    .sort((a, b) => (Number(b.weight) || 0) - (Number(a.weight) || 0))
    .map((reason) => ({
      text: reason.text,
      icon: whyIconOf(reason.text),
      percent: top > 0 ? Math.round(((Number(reason.weight) || 0) / top) * 100) : null,
    }))
}

export const whyIconOf = (text) => {
  const lower = String(text).toLowerCase()
  if (/genre|similar|like/.test(lower)) return 'tag'
  if (/often|evening|morning|night|usually|time/.test(lower)) return 'clock'
  if (/season|premiere|new|return/.test(lower)) return 'tv'
  return 'history'
}

export const pickableOf = (payload) => (Array.isArray(payload) ? payload : payload?.items ?? [])

export const hiddenShowsOf = (payload) => (Array.isArray(payload) ? payload : payload?.items ?? payload?.shows ?? [])

export const forYouLoadFailureOf = ({ hasPayload }) => (hasPayload
  ? { missing: false, refreshFailed: true }
  : { missing: true, refreshFailed: false })

export const picksErrorOf = (err) => ({
  text: failureText({ action: 'Could not save your picks', err }),
  needsSettings: err?.status === 409,
})

const orderedSections = (sections = []) => [...sections].sort((a, b) => rankOf(a.key) - rankOf(b.key))

const rankOf = (key) => {
  const index = SECTION_ORDER.indexOf(key)
  return index < 0 ? SECTION_ORDER.length : index
}

const scheduledLast = ({ items, scheduledKeys }) => [
  ...items.filter((item) => !isScheduled({ item, scheduledKeys })),
  ...items.filter((item) => isScheduled({ item, scheduledKeys })),
]

const sectionItemsOf = (section) => section.rows.flatMap((row) => row.items)

const topRatedItemsOf = (sections) => {
  const section = sections.find((candidate) => candidate.key === TOP_RATED_SECTION)
  return section ? sectionItemsOf(section) : []
}

const spreadLanesOf = (sections) => sections
  .filter((section) => section.key !== TOP_RATED_SECTION && section.key !== READY_SECTION)
  .map(sectionItemsOf)

const interleaved = (lanes) => {
  const longest = Math.max(0, ...lanes.map((lane) => lane.length))
  return Array.from({ length: longest }, (_, i) => lanes.map((lane) => lane[i]))
    .flat()
    .filter(Boolean)
}

const isOtherLanguageItem = (item) => Boolean(item.otherLanguage)

const withinOtherLanguageLimit = ({ items, limit }) => {
  let others = 0
  return items.filter((item) => {
    if (!isOtherLanguageItem(item)) return true
    others += 1
    return others <= limit
  })
}

const withFilmsAt = ({ items, films, slots }) => films.reduce((row, film, i) => {
  const at = Math.min(slots[i], row.length)
  return [...row.slice(0, at), film, ...row.slice(at)]
}, items)

const withoutScore = (item) => (item.rating ? { ...item, rating: null } : item)

const rowsOf = (items) => [
  { shape: 'card', items: items.filter((item) => !isMovie(item)) },
  { shape: 'poster', items: items.filter(isMovie) },
].filter((row) => row.items.length)

const joinMeta = (parts) => parts.filter(Boolean).join(' · ')

const creditOf = (credit) => (credit?.source && /^https:\/\//.test(credit.href || '') ? { source: credit.source, href: credit.href } : null)

const joinParts = (parts) => parts.filter(Boolean).join(', ')

const KIND_BADGES = {
  'new-season': 'New season',
  returning: 'Returning',
  premiere: 'Premiere',
  'new-show': 'Premiere',
}

const FALLBACK_REASONS = {
  premiere: 'New show this week',
  'new-show': 'New show this week',
  'new-season': 'New season this week',
  returning: 'Back this week',
}

const CAROUSEL_REASONS = {
  premiere: 'New this week',
  'new-show': 'New this week',
  movie: 'A movie you might like',
  liked: 'A show you liked',
}

const SHEET_FOCUS = {
  'record-episode': 'episode',
  'record-series': 'series',
}
