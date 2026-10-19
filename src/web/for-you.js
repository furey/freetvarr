import { airingWhenOf, durationText } from './home-hero.js'
import { localDayNumber } from './guide-time.js'
import { showKeyOf } from './show-key.js'

export const FOR_YOU_URL = '/api/for-you'
export const FOR_YOU_HREF = '#/for-you'
export const SUGGESTIONS_HREF = '#/settings/suggestions'
export const HOME_ROW_LIMIT = 12
export const CHOOSER_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000
export const MAX_SHOWN_EVENTS = 50

export const SECTION_ORDER = ['coming-up', 'new-seasons', 'might-like', 'movies', 'premieres']

export const SECTION_TITLES = {
  'coming-up': 'Coming up this week for you',
  'new-seasons': 'New seasons and returning',
  'might-like': 'You might like',
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
  const seen = new Set()
  return orderedSections(payload?.sections)
    .map((section) => {
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
        rows: rowsOf(scheduledLast({ items, scheduledKeys })),
      }
    })
    .filter((section) => section.rows.length)
}

export const homeRowOf = ({ payload, scheduledKeys = new Set(), hiddenKeys = new Set(), limit = HOME_ROW_LIMIT }) => {
  if (!payload || payload.enabled === false) return null
  const items = sectionsOf({ payload, scheduledKeys, hiddenKeys })
    .flatMap((section) => section.rows.flatMap((row) => row.items))
    .filter((item) => !isMovie(item))
  if (!items.length) return null
  return {
    title: payload.coldStart ? 'New this week' : 'For you',
    items: scheduledLast({ items, scheduledKeys }).slice(0, limit),
  }
}

export const badgeOf = ({ item, scheduled = false }) => {
  if (scheduled) return { label: 'Recording', tone: 'rec' }
  if (item.onNow) return { label: 'LIVE', tone: 'live' }
  const label = KIND_BADGES[kindOf(item)]
  return label ? { label, tone: 'plain' } : null
}

export const cardMetaOf = ({ item, nowMs, timeZone, withLead = false }) => {
  const start = msOf(item.start)
  const stop = msOf(item.stop)
  if (item.onNow && stop) {
    return joinMeta(['On now', item.channelName, `${Math.max(1, Math.ceil((stop - nowMs) / 60_000))} min left`])
  }
  const lead = withLead ? KIND_BADGES[kindOf(item)] : ''
  return joinMeta([lead, start && airingWhenOf({ ms: start, nowMs, timeZone }), item.channelName])
}

export const reasonOf = (item) => {
  if (item.reason) return item.reason
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

export const cardLabelOf = ({ item, meta, reason, badge }) =>
  [item.title, badge?.tone === 'live' ? 'on now' : badge?.label, meta, reason].filter(Boolean).join(', ')

export const tapActionOf = ({ item, scheduled = false }) => {
  if (scheduled) return 'show'
  if (item.onNow) return 'watch-live'
  const kind = kindOf(item)
  if ((kind === 'new-season' || kind === 'returning') && item.canRecordSeries) return 'record-series'
  if (kind === 'premiere' || kind === 'new-show') return 'notify'
  return 'record-episode'
}

export const sheetFocusOf = (action) => SHEET_FOCUS[action] ?? ''

export const menuOf = ({ item, scheduled = false, nowMs, timeZone }) => {
  const start = msOf(item.start)
  const actions = [
    item.onNow && { key: 'watch-live', label: 'Watch live', icon: 'play', detail: item.channelName || '' },
    !scheduled && {
      key: 'record-episode',
      label: 'Record this episode',
      icon: 'record',
      detail: item.onNow ? 'From now' : (start ? airingWhenOf({ ms: start, nowMs, timeZone }) : ''),
    },
    !scheduled && item.canRecordSeries && { key: 'record-series', label: 'Record series', icon: 'series' },
    scheduled && { key: 'show', label: 'Go to show', icon: 'options' },
    { key: 'notify', label: 'Notify me', icon: 'bell' },
  ].filter(Boolean)
  const more = [
    { key: 'not-interested', label: `Not interested in ${item.title}`, icon: 'hide' },
    { key: 'why', label: 'Why this?', icon: 'info' },
  ]
  return { actions, more }
}

export const menuMetaOf = ({ item, nowMs, timeZone }) => cardMetaOf({ item, nowMs, timeZone, withLead: true })

export const programOf = (item) => ({
  program_id: item.programId ?? item.id,
  title: item.title,
  subtitle: item.episodeTitle || '',
  summary: item.synopsis || '',
  start: msOf(item.start),
  end: msOf(item.stop),
  channelId: item.channelId,
  series_link: item.seriesLink ?? null,
  has_image: false,
})

export const guideHandoffOf = ({ item, action, nowMs, timeZone, returnTo }) => ({
  channelId: item.channelId,
  program: programOf(item),
  focus: sheetFocusOf(action),
  dayOffset: dayOffsetOf({ ms: msOf(item.start) ?? nowMs, nowMs, timeZone }),
  returnTo,
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

export const shownBatchesOf = ({ items, source, size = MAX_SHOWN_EVENTS }) => {
  const events = items.map((item) => feedbackOf({ kind: 'suggestion_shown', item, source }))
  const batches = []
  for (let i = 0; i < events.length; i += size) batches.push({ events: events.slice(i, i + size) })
  return batches
}

export const forYouSlideOf = ({ payload, scheduledKeys = new Set(), hiddenKeys = new Set(), nowMs, timeZone }) => {
  if (!payload || payload.enabled === false || payload.coldStart) return null
  const item = sectionsOf({ payload, scheduledKeys, hiddenKeys })
    .flatMap((section) => section.rows.flatMap((row) => row.items))
    .find((candidate) => !isScheduled({ item: candidate, scheduledKeys }) && msOf(candidate.stop) > nowMs)
  if (!item) return null
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
    art: { image: item.image || showImageOf(item.title), title: item.title },
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
  }
}

export const carouselReasonOf = (item) => item.reason || CAROUSEL_REASONS[kindOf(item)] || 'Picked for you'

export const pageIntroOf = ({ coldStart }) => (coldStart
  ? 'Suggestions start after you watch a few shows. Until then, here is what\'s new this week.'
  : 'Picked from the next 7 days of the guide, based on what you watch and record.')

export const chooserShownOf = ({ coldStart, pickable = [], skippedAt = null, picked = false, nowMs }) => {
  if (!coldStart || picked || !pickable.length) return false
  return !(skippedAt && nowMs - skippedAt < CHOOSER_SNOOZE_MS)
}

export const doneLabelOf = (count) => (count ? `Done · ${count} picked` : 'Done')

export const hiddenToastOf = (title) => `${title} is hidden from For you`

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
  if (!count) return 'Removes your viewing history and your thumbs up and down. Suggestions start again from new.'
  const entries = count === 1 ? '1 history entry' : `${count.toLocaleString('en-AU')} history entries`
  return `Removes ${entries}, including your thumbs up and down. Suggestions start again from new.`
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

const orderedSections = (sections = []) => [...sections].sort((a, b) => rankOf(a.key) - rankOf(b.key))

const rankOf = (key) => {
  const index = SECTION_ORDER.indexOf(key)
  return index < 0 ? SECTION_ORDER.length : index
}

const scheduledLast = ({ items, scheduledKeys }) => [
  ...items.filter((item) => !isScheduled({ item, scheduledKeys })),
  ...items.filter((item) => isScheduled({ item, scheduledKeys })),
]

const rowsOf = (items) => [
  { shape: 'card', items: items.filter((item) => !isMovie(item)) },
  { shape: 'poster', items: items.filter(isMovie) },
].filter((row) => row.items.length)

const showImageOf = (title) => `/api/epg/show-image?title=${encodeURIComponent(title)}&w=768`

const joinMeta = (parts) => parts.filter(Boolean).join(' · ')

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
  notify: 'notify',
}
