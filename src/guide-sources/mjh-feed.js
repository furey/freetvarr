import zlib from 'node:zlib'

import axios from 'axios'

import { countryForTimeZone } from '../zone-countries.js'
import { parseChannelElements, parseProgrammeElement, parseXmltvTime } from './xmltv.js'

export const MJH_HOSTS = {
  'i.mjh.nz': { concurrency: 1, gapMs: 0 },
  'raw.githubusercontent.com': { concurrency: 1, gapMs: 0 },
}

export const createMjhSource = ({
  id,
  countries,
  feeds,
  regionOf,
  download = downloadFeed,
  now = Date.now,
  ttlMs = FEED_TTL_MS,
}) => {
  const loaded = new Map()

  const feedOf = (region) => feeds.find((feed) => feed.region === region) ?? null

  const load = (region) => {
    const cached = loaded.get(region)
    if (cached && cached.expiresAt > now()) return cached.feed
    const feed = feedOf(region)
    if (!feed) return Promise.reject(new Error(`${id} has no feed for ${region}`))
    const loading = download(feed.url).then(indexFeed)
    loaded.set(region, { feed: loading, expiresAt: now() + ttlMs })
    loading.catch(() => loaded.delete(region))
    return loading
  }

  const channels = async (region) => (await load(region)).channels

  const listings = async ({ region, channel, from = -Infinity, to = Infinity }) => {
    const { programmes } = await load(region)
    return (programmes.get(channel) ?? [])
      .filter((entry) => entry.stop > from && entry.start < to)
      .map((entry) => parseProgrammeElement(entry.xml))
      .filter(Boolean)
  }

  const regionInCountry = (timeZone) => (countries.includes(countryForTimeZone(timeZone)) ? regionOf(timeZone) : null)

  const regionOfUrl = (url) => feeds.find((feed) => feed.url === url)?.region ?? null

  const forget = () => loaded.clear()

  return { id, countries, feeds, regionOf: regionInCountry, regionOfUrl, channels, listings, forget, hostLimits: MJH_HOSTS }
}

export const cityRegionOf = ({ feeds, timeZone }) => {
  const city = String(timeZone ?? '').split('/').pop().replace(/_/g, ' ').toLowerCase()
  return feeds.find((feed) => feed.region.toLowerCase() === city)?.region ?? (feeds.length === 1 ? feeds[0].region : null)
}

export const indexFeed = (xml) => {
  const text = String(xml)
  const firstProgramme = text.indexOf(PROGRAMME_TAG)
  const channels = parseChannelElements(firstProgramme < 0 ? text : text.slice(0, firstProgramme))
  const programmes = new Map()
  for (const [element, attributes] of text.matchAll(PROGRAMME_ELEMENT)) {
    const channel = attributes.match(CHANNEL_ATTRIBUTE)?.[1]
    const start = parseXmltvTime(attributes.match(START_ATTRIBUTE)?.[1])
    const stop = parseXmltvTime(attributes.match(STOP_ATTRIBUTE)?.[1])
    if (!channel || start === null || stop === null) continue
    const id = decodeAttribute(channel)
    if (!programmes.has(id)) programmes.set(id, [])
    programmes.get(id).push({ start, stop, xml: element })
  }
  for (const list of programmes.values()) list.sort((a, b) => a.start - b.start)
  return { channels, programmes }
}

export const downloadFeed = async (url, { timeoutMs = DOWNLOAD_TIMEOUT_MS, maxBytes = MAX_FEED_BYTES } = {}) => {
  const response = await axios.get(url, {
    responseType: 'stream',
    timeout: timeoutMs,
    signal: AbortSignal.timeout(timeoutMs),
    maxRedirects: 5,
    headers: { 'Accept-Encoding': 'gzip' },
    decompress: true,
  })
  const stream = GZIP_URL.test(url) ? response.data.pipe(zlib.createGunzip()) : response.data
  return readAll({ stream, maxBytes })
}

const readAll = ({ stream, maxBytes }) => new Promise((resolve, reject) => {
  const chunks = []
  let size = 0
  stream.on('data', (chunk) => {
    size += chunk.length
    if (size > maxBytes) {
      stream.destroy()
      reject(new Error(`the feed is larger than ${maxBytes} bytes`))
      return
    }
    chunks.push(chunk)
  })
  stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  stream.on('error', reject)
})

const decodeAttribute = (value) => value
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&')

const PROGRAMME_TAG = '<programme'
const PROGRAMME_ELEMENT = /<programme\b([^>]*?)(?:\/>|>[\s\S]*?<\/programme>)/g
const CHANNEL_ATTRIBUTE = /\bchannel="([^"]*)"/
const START_ATTRIBUTE = /\bstart="([^"]*)"/
const STOP_ATTRIBUTE = /\bstop="([^"]*)"/
const GZIP_URL = /\.gz(?:$|\?)/i
const FEED_TTL_MS = 60 * 60_000
const DOWNLOAD_TIMEOUT_MS = 120_000
const MAX_FEED_BYTES = 128 * 1024 * 1024
