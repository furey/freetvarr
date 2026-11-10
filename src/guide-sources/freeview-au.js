import {
  FREEVIEW_API_HOST,
  FREEVIEW_WINDOW_MS,
  freeviewClient,
  freeviewRegionOf,
  listingImagesOf,
  placeholderImagesOf,
  windowStartOf,
} from '../freeview-au.js'

export const createFreeviewAuSource = ({
  client = freeviewClient,
  now = Date.now,
  nearTtlMs = NEAR_TTL_MS,
  farTtlMs = FAR_TTL_MS,
  nearMs = NEAR_MS,
  failureBackoffMs = FAILURE_BACKOFF_MS,
  maxPages = MAX_PAGES,
  onWindow = () => {},
  maxWindows = MAX_WINDOWS,
} = {}) => {
  const windows = new Map()
  const failures = new Map()
  let counts = emptyCounts()

  const channels = async (region) => {
    const body = await client.getJson({
      url: `${API_ORIGIN}/content/v1/channels/region/${region}`,
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

  const listings = async ({ channel, from, to }) => {
    prune(from)
    const programmes = new Map()
    for (let start = windowStartOf(from); start < to; start += FREEVIEW_WINDOW_MS) {
      const window = await windowListings({ triplet: channel, start })
      if (window === CHANNEL_REFUSED) break
      for (const programme of window) {
        if (programme.stop > from && programme.start < to) programmes.set(programme.id, programme)
      }
    }
    prune(from)
    return [...programmes.values()].sort((a, b) => a.start - b.start).map((programme) => ({ ...programme, channel }))
  }

  const prune = (from) => {
    for (const map of [windows, failures]) {
      for (const key of map.keys()) {
        if (Number(key.split('|')[1]) + FREEVIEW_WINDOW_MS <= from) map.delete(key)
      }
      while (map.size > maxWindows) map.delete(map.keys().next().value)
    }
  }

  const windowListings = async ({ triplet, start }) => {
    counts.windowsRead += 1
    const key = `${triplet}|${start}`
    const cached = windows.get(key)
    if (cached && cached.expiresAt > now()) return cached.programmes
    if ((failures.get(key)?.until ?? 0) > now()) {
      counts.failedWindows += 1
      return cached?.programmes ?? []
    }
    try {
      const listings = await fetchSpan({ triplet, start, end: start + FREEVIEW_WINDOW_MS, canSplit: true })
      onWindow({ triplet, windowStart: start, listings })
      const placeholders = placeholderImagesOf(listings)
      const programmes = listings.map((listing) => freeviewProgrammeOf({ listing, placeholders })).filter(Boolean)
      const ttlMs = start - now() < nearMs ? nearTtlMs : farTtlMs
      windows.delete(key)
      windows.set(key, { programmes, expiresAt: now() + ttlMs })
      failures.delete(key)
      return programmes
    } catch (error) {
      counts.failedWindows += 1
      if (error?.code === 'rejected') return CHANNEL_REFUSED
      const count = (failures.get(key)?.count ?? 0) + 1
      failures.set(key, { count, until: now() + failureBackoffMs[Math.min(count, failureBackoffMs.length) - 1] })
      return cached?.programmes ?? []
    }
  }

  const fetchSpan = async ({ triplet, start, end, canSplit }) => {
    try {
      return await fetchPages({ triplet, start, end })
    } catch (error) {
      if (!canSplit || error?.status !== GATEWAY_TIMEOUT) throw error
      counts.splitWindows += 1
      const middle = start + (end - start) / 2
      const halves = [
        await fetchSpan({ triplet, start, end: middle, canSplit: false }),
        await fetchSpan({ triplet, start: middle, end, canSplit: false }),
      ]
      return [...new Map(halves.flat().map((listing) => [listing.id, listing])).values()]
    }
  }

  const fetchPages = async ({ triplet, start, end }) => {
    const raw = []
    for (let page = 0; page < maxPages; page += 1) {
      counts.requests += 1
      const body = await client.getJson({
        url: `${API_ORIGIN}/content/v1/epgs/${triplet.toUpperCase()}`,
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
    id: 'freeview-au',
    label: 'Freeview',
    countries: ['au'],
    channelIdPrefix: 'freeview',
    horizonDays: HORIZON_DAYS,
    regionOf: freeviewRegionOf,
    channels,
    listings,
    stats,
    resetStats,
    hostLimits: { [FREEVIEW_API_HOST]: { concurrency: 1, gapMs: 500 } },
  }
}

export const freeviewProgrammeOf = ({ listing, placeholders = new Set() }) => {
  const start = Date.parse(listing?.start)
  const stop = Date.parse(listing?.end)
  const title = String(listing?.title ?? '').trim()
  if (!Number.isFinite(start) || !Number.isFinite(stop) || stop <= start || !title || PLACEHOLDER_TITLE.test(title)) return null
  const episode = listing.related?.episodes?.[0] ?? null
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
    categories: uniqueOf(tags.get('genres') ?? []),
    rating: (tags.get('classification') ?? []).find((label) => RATING_LABELS.has(label)) ?? null,
    icon: images.episode ?? images.show ?? null,
    season: positiveNumberOf(tags.get('season_number')?.[0]),
    episode: positiveNumberOf(episode?.episode_number),
    crid: tags.get('crid_value')?.[0] ?? null,
    episodeNums: [],
    extras: [],
  }
}

const isEpisodeTitle = ({ episode, episodeTitle, title }) => Boolean(episodeTitle)
  && episodeTitle.toLowerCase() !== title.toLowerCase()
  && (episode?.tags ?? []).includes(EPISODE_SUBTYPE)

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

const uniqueOf = (values) => {
  const seen = new Set()
  return values.filter((value) => {
    const key = value.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const positiveNumberOf = (value) => {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : null
}

const isoOf = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')

const emptyCounts = () => ({ requests: 0, failedWindows: 0, splitWindows: 0, windowsRead: 0 })

const API_ORIGIN = `https://${FREEVIEW_API_HOST}`
const TRIPLET = /^[0-9a-f]{4}:[0-9a-f]{4}:[0-9a-f]{4}$/
const EPISODE_SUBTYPE = 'onapi-subtype:episode'
const RATING_LABELS = new Set(['G', 'PG', 'M', 'MA15+', 'AV15+', 'R18+', 'C', 'P'])
const GATEWAY_TIMEOUT = 504
const CHANNEL_REFUSED = Symbol('channel refused')
const NO_CONTENT = 'bad-content'
const PLACEHOLDER_TITLE = /^(to be (advised|confirmed|announced)|tba|tbc)$/i
const PAGE_SIZE = 100
const MAX_WINDOWS = 4000
const MAX_PAGES = 3
const HOUR_MS = 60 * 60_000
const HORIZON_DAYS = 9
const NEAR_MS = 2 * 24 * HOUR_MS
const NEAR_TTL_MS = 5.5 * HOUR_MS
const FAR_TTL_MS = 23.5 * HOUR_MS
const FAILURE_BACKOFF_MS = [15 * 60_000, HOUR_MS, 6 * HOUR_MS]
const LISTINGS_TIMEOUT_MS = 15_000
