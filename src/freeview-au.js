import { createOutboundClient } from './outbound-http.js'
import { showTitleKey } from './show-artwork.js'
import { currentTimeZone } from './time-zone.js'
import { countryForTimeZone } from './zone-countries.js'

export const FREEVIEW_API_HOST = 'fvau-api-prod.switch.tv'
export const FREEVIEW_IMAGE_HOST = 'img-store-prod.switch.tv'
export const FREEVIEW_WINDOW_MS = 6 * 60 * 60 * 1000
export const FREEVIEW_MATCH_TOLERANCE_MS = 5 * 60 * 1000

export const FREEVIEW_REGIONS = {
  'Australia/Sydney': 'region_nsw_sydney',
  'Australia/NSW': 'region_nsw_sydney',
  'Australia/Melbourne': 'region_vic_melbourne',
  'Australia/Victoria': 'region_vic_melbourne',
  'Australia/Brisbane': 'region_qld_brisbane',
  'Australia/Queensland': 'region_qld_brisbane',
  'Australia/Adelaide': 'region_sa_adelaide',
  'Australia/South': 'region_sa_adelaide',
  'Australia/Perth': 'region_wa_perth',
  'Australia/West': 'region_wa_perth',
  'Australia/Hobart': 'region_tas_hobart',
  'Australia/Tasmania': 'region_tas_hobart',
  'Australia/Darwin': 'region_nt_darwin',
  'Australia/North': 'region_nt_darwin',
  'Australia/Canberra': 'region_act_canberra',
  'Australia/ACT': 'region_act_canberra',
}

export const freeviewRegionOf = (timeZone) => {
  if (countryForTimeZone(timeZone) !== 'au') return null
  return FREEVIEW_REGIONS[timeZone] ?? null
}

export const windowStartOf = (ms) => Math.floor(ms / FREEVIEW_WINDOW_MS) * FREEVIEW_WINDOW_MS

export const windowsAround = (startMs, toleranceMs = FREEVIEW_MATCH_TOLERANCE_MS) =>
  [...new Set([windowStartOf(startMs), windowStartOf(startMs - toleranceMs), windowStartOf(startMs + toleranceMs)])]

export const listingImageOf = ({ listing, placeholders = new Set() }) => {
  const showImage = imageUrlsOf(listing?.related?.shows?.[0]).find(Boolean)
  if (showImage) return showImage
  return imageUrlsOf(listing?.related?.episodes?.[0]).find((url) => url && !placeholders.has(url)) ?? null
}

export const placeholderImagesOf = (listings = []) => {
  const titlesByUrl = new Map()
  for (const listing of listings) {
    for (const url of imageUrlsOf(listing?.related?.episodes?.[0])) {
      const titles = titlesByUrl.get(url) ?? new Set()
      titles.add(showTitleKey(listing.title))
      titlesByUrl.set(url, titles)
    }
  }
  return new Set([...titlesByUrl].filter(([, titles]) => titles.size > 1).map(([url]) => url))
}

export const matchListing = ({ airing, listings, toleranceMs = FREEVIEW_MATCH_TOLERANCE_MS }) => {
  const titleKey = showTitleKey(airing.title)
  const near = listings
    .map((listing) => ({ listing, offset: Math.abs(Date.parse(listing.start) - airing.start) }))
    .filter(({ offset }) => Number.isFinite(offset) && offset <= toleranceMs)
  if (!near.length) return null
  const sameTitle = near.filter(({ listing }) => titlesAgree(showTitleKey(listing.title), titleKey))
  return sameTitle.sort((a, b) => a.offset - b.offset)[0]?.listing ?? null
}

export const titlesAgree = (a, b) => {
  if (!a || !b) return false
  const [compactA, compactB] = [a, b].map((key) => key.replaceAll(' ', ''))
  if (compactA === compactB || a.startsWith(`${b} `) || b.startsWith(`${a} `)) return true
  const [shorter, longer] = [wordsOf(a), wordsOf(b)].sort((x, y) => x.size - y.size)
  const shared = [...shorter].filter((word) => longer.has(word)).length
  return shared >= MIN_SHARED_WORDS && shared / shorter.size >= MIN_SHARED_SHARE
}

export const freeviewAiringsOf = ({ programmes = [], titleKeys, triplets, nowMs, perTitle = AIRINGS_PER_TITLE }) => {
  const taken = new Map()
  const airings = []
  for (const programme of [...programmes].sort((a, b) => a.start - b.start)) {
    const titleKey = showTitleKey(programme.title)
    if (!titleKeys.has(titleKey) || programme.start < nowMs - PAST_AIRING_MS) continue
    if ((taken.get(titleKey) ?? 0) >= perTitle) continue
    const channelTriplets = triplets.get(String(programme.channel_id)) ?? []
    if (!channelTriplets.length) continue
    taken.set(titleKey, (taken.get(titleKey) ?? 0) + 1)
    airings.push({ key: String(programme.program_id), titleKey, title: programme.title, start: programme.start, triplets: channelTriplets })
  }
  return airings
}

export const freeviewCandidatesOf = ({ airings, matches }) => {
  const candidates = new Map()
  for (const airing of airings) {
    const url = matches.get(airing.key)
    if (!url) continue
    const entry = candidates.get(airing.titleKey) ?? { titleKey: airing.titleKey, title: airing.title, sources: [] }
    if (!entry.sources.includes(url)) entry.sources.push(url)
    candidates.set(airing.titleKey, entry)
  }
  return candidates
}

export const createFreeviewAu = ({
  client = freeviewClient,
  timeZone = currentTimeZone,
  now = Date.now,
  listingsTtlMs = LISTINGS_TTL_MS,
  emptyTtlMs = EMPTY_TTL_MS,
  channelsTtlMs = CHANNELS_TTL_MS,
  failureBackoffMs = FAILURE_BACKOFF_MS,
  maxPages = MAX_PAGES,
  maxCached = MAX_CACHED_WINDOWS,
} = {}) => {
  const windows = new Map()
  const failures = new Map()
  let channels = null

  const region = () => freeviewRegionOf(timeZone())

  const isOn = () => Boolean(region())

  const isBackingOff = (key) => (failures.get(key)?.until ?? 0) > now()

  const noteFailure = (key) => {
    const count = (failures.get(key)?.count ?? 0) + 1
    failures.set(key, { count, until: now() + failureBackoffMs[Math.min(count, failureBackoffMs.length) - 1] })
  }

  const regionTriplets = async () => {
    const id = region()
    if (!id) return new Set()
    if (channels?.region === id && channels.expiresAt > now()) return channels.triplets
    const key = `channels:${id}`
    if (isBackingOff(key)) return channels?.region === id ? channels.triplets : new Set()
    try {
      const body = await client.getJson({ url: `${API_ORIGIN}/content/v1/channels/region/${id}`, params: { limit: 100, offset: 0 }, isBackground: true })
      const triplets = new Set((body?.data ?? []).map((channel) => String(channel.dvb_triplet ?? '').toLowerCase()).filter(Boolean))
      channels = { region: id, triplets, expiresAt: now() + channelsTtlMs }
      failures.delete(key)
      return triplets
    } catch {
      noteFailure(key)
      return channels?.region === id ? channels.triplets : new Set()
    }
  }

  const listingsFor = async ({ triplet, windowStart }) => {
    const key = `${triplet}|${windowStart}`
    const cached = windows.get(key)
    if (cached && cached.expiresAt > now()) return cached.listings
    if (isBackingOff(key)) return null
    try {
      const listings = await fetchWindow({ triplet, windowStart })
      remember({ key, listings, ttlMs: listings.length ? listingsTtlMs : emptyTtlMs })
      failures.delete(key)
      return listings
    } catch {
      noteFailure(key)
      return null
    }
  }

  const fetchWindow = async ({ triplet, windowStart }) => {
    const listings = []
    for (let page = 0; page < maxPages; page += 1) {
      const body = await client.getJson({
        url: `${API_ORIGIN}/content/v1/epgs/${triplet}`,
        params: {
          start: isoOf(windowStart),
          end: isoOf(windowStart + FREEVIEW_WINDOW_MS),
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
        if (error?.code === 'bad-content' && page > 0) return null
        if (error?.code === 'bad-content') return { data: [] }
        throw error
      })
      listings.push(...(body?.data ?? []))
      if (!body?.meta?.pagination?.more) break
    }
    return listings
  }

  const remember = ({ key, listings, ttlMs }) => {
    windows.delete(key)
    windows.set(key, { listings, expiresAt: now() + ttlMs })
    while (windows.size > maxCached) windows.delete(windows.keys().next().value)
  }

  const matchAirings = async (airings = []) => {
    const matches = new Map()
    if (!isOn() || !airings.length) return matches
    const known = await regionTriplets()
    for (const airing of airings) {
      const url = await matchOne({ airing, known })
      if (url) matches.set(airing.key, url)
    }
    return matches
  }

  const matchOne = async ({ airing, known }) => {
    for (const triplet of airing.triplets.filter((candidate) => known.has(candidate))) {
      for (const windowStart of windowsAround(airing.start)) {
        const listings = await listingsFor({ triplet, windowStart })
        if (!listings?.length) continue
        const listing = matchListing({ airing, listings })
        const url = listing && listingImageOf({ listing, placeholders: placeholderImagesOf(listings) })
        if (url) return url
      }
    }
    return null
  }

  return { region, isOn, regionTriplets, listingsFor, matchAirings }
}

export const freeviewClient = createOutboundClient({
  hosts: {
    [FREEVIEW_API_HOST]: { concurrency: 1, gapMs: 500 },
    [FREEVIEW_IMAGE_HOST]: { concurrency: 1, gapMs: 250 },
  },
})

export const isFreeviewImageSource = (source) => {
  try {
    const url = new URL(source)
    return url.protocol === 'https:' && url.hostname === FREEVIEW_IMAGE_HOST
  } catch {
    return false
  }
}

const wordsOf = (key) => new Set(key.split(' ').filter((word) => word && !STOP_WORDS.has(word)))

const imageUrlsOf = (entity) => (entity?.related?.images ?? []).map((image) => httpsImageUrlOf(image?.url))

const httpsImageUrlOf = (url) => {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== FREEVIEW_IMAGE_HOST) return null
    parsed.protocol = 'https:'
    return parsed.href
  } catch {
    return null
  }
}

const isoOf = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')

const MIN_SHARED_WORDS = 2
const MIN_SHARED_SHARE = 0.6
const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'and', 'at', 'in', 'on', 'to', 'with'])
const AIRINGS_PER_TITLE = 2
const PAST_AIRING_MS = 60 * 60 * 1000
const API_ORIGIN = `https://${FREEVIEW_API_HOST}`
const PAGE_SIZE = 100
const MAX_PAGES = 3
const HOUR_MS = 60 * 60 * 1000
const LISTINGS_TTL_MS = 6 * HOUR_MS
const EMPTY_TTL_MS = 6 * HOUR_MS
const CHANNELS_TTL_MS = 24 * HOUR_MS
const FAILURE_BACKOFF_MS = [15 * 60 * 1000, HOUR_MS, 6 * HOUR_MS]
const LISTINGS_TIMEOUT_MS = 15_000
const MAX_CACHED_WINDOWS = 2000
