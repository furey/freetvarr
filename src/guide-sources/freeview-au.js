import {
  FREEVIEW_API_HOST,
  FREEVIEW_API_PACE,
  FREEVIEW_WINDOW_MS,
  freeviewClient,
  freeviewRegionOf,
  listingEpisodeOf,
  listingImagesOf,
  dropFarthestWindows,
  placeholderImagesOf,
} from '../freeview-au.js'

export const WINDOW_FORMAT = 1

export const AU_RATING_LABELS = new Set(['G', 'PG', 'M', 'MA15+', 'AV15+', 'R18+', 'C', 'P'])

export const createFreeviewAuSource = (options = {}) => createFreeviewSource({
  id: 'freeview-au',
  countries: ['au'],
  host: FREEVIEW_API_HOST,
  regionOf: freeviewRegionOf,
  channelsPath: (region) => `/content/v1/channels/region/${region}`,
  ratingLabels: AU_RATING_LABELS,
  horizonDays: AU_HORIZON_DAYS,
  ...options,
})

export const createFreeviewSource = ({
  id,
  countries,
  host,
  regionOf,
  channelsPath,
  ratingLabels,
  horizonDays,
  client = freeviewClient,
  now = Date.now,
  random = Math.random,
  nearTtlMs = NEAR_TTL_MS,
  farTtlMs = FAR_TTL_MS,
  nearMs = NEAR_MS,
  staleLimitMs = STALE_LIMIT_MS,
  failureBackoffMs = FAILURE_BACKOFF_MS,
  maxPages = MAX_PAGES,
  onWindow = () => {},
  maxWindows = MAX_WINDOWS,
  store = null,
} = {}) => {
  const origin = `https://${host}`
  const windows = new Map()
  const failures = new Map()
  const refused = new Map()
  const halfWindowTriplets = new Map()
  let restored = null
  let counts = emptyCounts()

  const channels = async (region) => {
    const body = await client.getJson({
      url: `${origin}${channelsPath(region)}`,
      params: { limit: 100, offset: 0 },
      isBackground: true,
    })
    return (body?.data ?? [])
      .map((channel) => ({
        id: String(channel.dvb_triplet ?? '').toLowerCase(),
        names: [channel.channel_name ?? channel.channel_code].filter(Boolean),
        lcn: Number(channel.lcn) || null,
      }))
      .filter((channel) => TRIPLET.test(channel.id))
  }

  const listings = async ({ channel, from, to, fetchUntil = Infinity }) => {
    await restore()
    prune(from)
    const programmes = new Map()
    for (let start = requestWindowStartOf(from); start < to; start += REQUEST_WINDOW_MS) {
      const window = start < fetchUntil
        ? await windowListings({ triplet: channel, start })
        : deferredListings({ triplet: channel, start })
      if (window === CHANNEL_REFUSED) break
      for (const programme of window) {
        if (programme.stop > from && programme.start < to) programmes.set(programme.id, programme)
      }
    }
    prune(from)
    return [...programmes.values()].sort((a, b) => a.start - b.start).map((programme) => ({ ...programme, channel }))
  }

  const prefetch = async ({ channels: triplets, from, to }) => {
    await restore()
    prune(from)
    await store?.prune({ source: id, before: requestWindowStartOf(from) }).catch(() => {})
    for (let start = requestWindowStartOf(from); start < to; start += REQUEST_WINDOW_MS) {
      for (const triplet of triplets) {
        if (isRefused(triplet) || isBackingOff(keyOf(triplet, start))) continue
        if (isFresh({ entry: windows.get(keyOf(triplet, start)), start })) continue
        await fetchWindow({ triplet, start })
      }
    }
  }

  const restore = () => {
    if (!store) return null
    restored ??= store.load({ source: id, format: WINDOW_FORMAT })
      .then((rows) => rows.filter(isServable).forEach((row) => remember({ triplet: row.triplet, start: row.windowStart, entry: row })))
      .catch(() => {})
    return restored
  }

  const prune = (from) => {
    for (const map of [windows, failures]) {
      for (const key of map.keys()) {
        if (Number(key.split('|')[1]) + REQUEST_WINDOW_MS <= from) map.delete(key)
      }
      dropFarthestWindows({ map, max: maxWindows })
    }
    for (const map of [refused, halfWindowTriplets]) {
      for (const [triplet, until] of map) if (until <= now()) map.delete(triplet)
    }
  }

  const windowListings = async ({ triplet, start }) => {
    counts.windowsRead += 1
    const key = keyOf(triplet, start)
    const cached = windows.get(key)
    if (isRefused(triplet)) return countedFailure(CHANNEL_REFUSED)
    if (isFresh({ entry: cached, start })) return cached.programmes
    if (isBackingOff(key)) return countedFailure(servableProgrammesOf(cached))
    const fetched = await fetchWindow({ triplet, start })
    if (fetched === CHANNEL_REFUSED) return countedFailure(CHANNEL_REFUSED)
    if (!fetched) return countedFailure(servableProgrammesOf(cached))
    return fetched.partial ? countedFailure(fetched.programmes) : fetched.programmes
  }

  const deferredListings = ({ triplet, start }) => {
    counts.windowsRead += 1
    const cached = windows.get(keyOf(triplet, start))
    if (isFresh({ entry: cached, start })) return cached.programmes
    counts.pendingWindows += 1
    return servableProgrammesOf(cached)
  }

  const isServable = (entry) => Boolean(entry) && now() - entry.fetchedAt < staleLimitMs

  const servableProgrammesOf = (entry) => (isServable(entry) ? entry.programmes : [])

  const countedFailure = (result) => {
    counts.failedWindows += 1
    return result
  }

  const fetchWindow = async ({ triplet, start }) => {
    const key = keyOf(triplet, start)
    try {
      const { listings, partial } = await fetchWindowSpan({ triplet, start, end: start + REQUEST_WINDOW_MS })
      const placeholders = placeholderImagesOf(listings)
      const programmes = listings.map((listing) => freeviewProgrammeOf({ listing, placeholders, ratingLabels })).filter(Boolean)
      const entry = { programmes, fetchedAt: now(), expiresAt: now() + (partial ? failureBackoffMs[0] : ttlFor(start)) }
      remember({ triplet, start, entry })
      failures.delete(key)
      await store?.save({ source: id, format: WINDOW_FORMAT, triplet, windowStart: start, ...entry }).catch(() => {})
      return { programmes, partial }
    } catch (error) {
      if (error?.code === 'rejected') {
        refused.set(triplet, now() + failureBackoffMs[0])
        return CHANNEL_REFUSED
      }
      const count = (failures.get(key)?.count ?? 0) + 1
      failures.set(key, { count, until: now() + failureBackoffMs[Math.min(count, failureBackoffMs.length) - 1] })
      return null
    }
  }

  const remember = ({ triplet, start, entry }) => {
    const key = keyOf(triplet, start)
    windows.delete(key)
    windows.set(key, { programmes: entry.programmes, fetchedAt: entry.fetchedAt, expiresAt: entry.expiresAt })
    shareWindow({ triplet, start, entry })
  }

  const shareWindow = ({ triplet, start, entry }) => {
    const expiresAt = isNear(start) ? Math.min(entry.expiresAt, entry.fetchedAt + nearTtlMs) : entry.expiresAt
    if (expiresAt <= now()) return
    for (let windowStart = start; windowStart < start + REQUEST_WINDOW_MS; windowStart += FREEVIEW_WINDOW_MS) {
      const inWindow = entry.programmes.filter((programme) => programme.stop > windowStart && programme.start < windowStart + FREEVIEW_WINDOW_MS)
      onWindow({ triplet, windowStart, listings: inWindow.map(pictureListingOf), expiresAt })
    }
  }

  const isNear = (start) => start - now() < nearMs

  const isFresh = ({ entry, start }) => Boolean(entry)
    && entry.expiresAt > now()
    && !(isNear(start) && now() - entry.fetchedAt >= nearTtlMs)

  const isBackingOff = (key) => (failures.get(key)?.until ?? 0) > now()

  const isRefused = (triplet) => (refused.get(triplet) ?? 0) > now()

  const ttlFor = (start) => (isNear(start) ? nearTtlMs : Math.round(farTtlMs * (0.5 + random())))

  const fetchWindowSpan = async ({ triplet, start, end }) => {
    if (!halfWindowTriplets.has(triplet)) {
      try {
        return { listings: await fetchPages({ triplet, start, end, noRetryStatuses: SPLIT_STATUSES }), partial: false }
      } catch (error) {
        if (!isSplittable(error)) throw error
        halfWindowTriplets.set(triplet, now() + HALF_WINDOW_MEMORY_MS)
      }
    }
    return fetchHalves({ triplet, start, end })
  }

  const fetchHalves = async ({ triplet, start, end }) => {
    counts.splitWindows += 1
    const middle = start + (end - start) / 2
    const halves = []
    for (const [from, to] of [[start, middle], [middle, end]]) {
      halves.push(await fetchPages({ triplet, start: from, end: to }).then((listings) => ({ listings }), (error) => ({ error })))
    }
    const read = halves.filter((half) => !half.error)
    if (!read.length) throw halves[0].error
    const listings = [...new Map(read.flatMap((half) => half.listings).map((listing) => [listing.id, listing])).values()]
    return { listings, partial: read.length < halves.length }
  }

  const fetchPages = async ({ triplet, start, end, noRetryStatuses = [] }) => {
    const raw = []
    const pageLimit = Math.ceil((maxPages * (end - start)) / FREEVIEW_WINDOW_MS)
    for (let page = 0; page < pageLimit; page += 1) {
      counts.requests += 1
      const body = await client.getJson({
        url: `${origin}/content/v1/epgs/${triplet.toUpperCase()}`,
        params: {
          start: isoOf(start),
          end: isoOf(end),
          sort: 'start',
          related_entity_types: 'episodes.images,shows.images',
          related_levels: 2,
          include_related: 1,
          expand_related: 'full',
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        },
        timeoutMs: LISTINGS_TIMEOUT_MS,
        isBackground: true,
        noRetryStatuses,
      }).catch((error) => {
        if (error?.code === NO_CONTENT) return null
        throw error
      })
      raw.push(...(body?.data ?? []))
      if (!body?.meta?.pagination?.more) break
    }
    return raw
  }

  const stats = () => ({ ...counts, windows: windows.size, failures: failures.size })

  const resetStats = () => {
    counts = emptyCounts()
  }

  return {
    id,
    label: 'Freeview',
    countries,
    channelIdPrefix: 'freeview',
    horizonDays,
    regionOf,
    channels,
    listings,
    prefetch,
    stats,
    resetStats,
    hostLimits: { [host]: FREEVIEW_API_PACE },
  }
}

export const requestWindowStartOf = (ms) => Math.floor(ms / REQUEST_WINDOW_MS) * REQUEST_WINDOW_MS

export const pictureListingOf = (programme) => {
  const episodeIcon = programme.icon && programme.icon !== programme.showIcon ? programme.icon : null
  return {
    title: programme.title,
    start: isoOf(programme.start),
    related: {
      shows: programme.showIcon ? [imagesOf(programme.showIcon)] : [],
      episodes: episodeIcon ? [imagesOf(episodeIcon)] : [],
    },
  }
}

const imagesOf = (url) => ({ related: { images: [{ url }] } })

const keyOf = (triplet, start) => `${triplet}|${start}`

const isSplittable = (error) => error?.status === GATEWAY_TIMEOUT || error?.code === TOO_LARGE

export const freeviewProgrammeOf = ({ listing, placeholders = new Set(), ratingLabels = AU_RATING_LABELS }) => {
  const start = Date.parse(listing?.start)
  const stop = Date.parse(listing?.end)
  const title = String(listing?.title ?? '').trim()
  if (!Number.isFinite(start) || !Number.isFinite(stop) || stop <= start || !title || PLACEHOLDER_TITLE.test(title)) return null
  const episode = listingEpisodeOf(listing)
  const show = listing.related?.shows?.[0] ?? null
  const tags = categoryTagsOf(episode ?? show)
  const images = listingImagesOf({ listing, placeholders })
  const episodeTitle = String(episode?.title ?? '').trim()
  return {
    id: String(listing.id ?? `${start}|${title}`),
    start,
    stop,
    title,
    subTitle: isEpisodeTitle({ episode, episodeTitle, title }) ? episodeTitle : null,
    desc: String(episode?.synopsis || show?.synopsis || '').trim() || null,
    categories: uniqueOf((tags.get('genres') ?? []).map(genreLabelOf)),
    rating: (tags.get('classification') ?? []).find((label) => ratingLabels.has(label)) ?? null,
    icon: images.episode ?? images.show ?? null,
    showIcon: images.show ?? null,
    season: positiveNumberOf(tags.get('season_number')?.[0], MAX_SEASON),
    episode: positiveNumberOf(episode?.episode_number, MAX_EPISODE),
    crid: tags.get('crid_value')?.[0] ?? null,
    episodeNums: [],
    extras: [],
  }
}

const isEpisodeTitle = ({ episode, episodeTitle, title }) => Boolean(episodeTitle)
  && episodeTitle.toLowerCase() !== title.toLowerCase()
  && !NUMBERED_EPISODE_TITLE.test(episodeTitle)
  && (episode?.tags ?? [EPISODE_SUBTYPE]).includes(EPISODE_SUBTYPE)

const categoryTagsOf = (entity) => {
  const tags = new Map()
  for (const category of entity?.categories ?? []) {
    const cut = String(category).indexOf('/')
    if (cut < 1) continue
    const [name, value] = [category.slice(0, cut), category.slice(cut + 1).trim()]
    if (!value) continue
    if (!tags.has(name)) tags.set(name, [])
    tags.get(name).push(value)
  }
  return tags
}

const genreLabelOf = (genre) => {
  if (!GENRE_SLUG.test(genre)) return genre
  const words = genre.split('/').pop().replace(/-and-/g, ' & ').replace(/-/g, ' ')
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`
}

const uniqueOf = (values) => {
  const seen = new Set()
  return values.filter((value) => {
    const key = value.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const positiveNumberOf = (value, max) => {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 && number <= max ? number : null
}

const isoOf = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')

const emptyCounts = () => ({ requests: 0, failedWindows: 0, splitWindows: 0, windowsRead: 0, pendingWindows: 0 })

const TRIPLET = /^[0-9a-f]{4}:(?:[0-9a-f]{4})?:[0-9a-f]{4}$/
const GENRE_SLUG = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/
const NUMBERED_EPISODE_TITLE = /^episode\s+\d+$/i
const MAX_SEASON = 9999
const MAX_EPISODE = 99999
const EPISODE_SUBTYPE = 'onapi-subtype:episode'
const GATEWAY_TIMEOUT = 504
const SPLIT_STATUSES = [GATEWAY_TIMEOUT]
const TOO_LARGE = 'too-large'
const CHANNEL_REFUSED = Symbol('channel refused')
const NO_CONTENT = 'bad-content'
const PLACEHOLDER_TITLE = /^(to be (advised|confirmed|announced)|tba|tbc)$/i
const PAGE_SIZE = 100
const MAX_WINDOWS = 4000
const MAX_PAGES = 3
const HOUR_MS = 60 * 60_000
const AU_HORIZON_DAYS = 9
const NEAR_MS = 2 * 24 * HOUR_MS
const NEAR_TTL_MS = 5.5 * HOUR_MS
const FAR_TTL_MS = 23.5 * HOUR_MS
const STALE_LIMIT_MS = 3 * 24 * HOUR_MS
const REQUEST_WINDOW_MS = 12 * HOUR_MS
const HALF_WINDOW_MEMORY_MS = 24 * HOUR_MS
const FAILURE_BACKOFF_MS = [15 * 60_000, HOUR_MS, 6 * HOUR_MS]
const LISTINGS_TIMEOUT_MS = 15_000
