import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

import { anchorAutorecTitle } from '../../src/autorec-match.js'
import { MANIFEST_FILE, cacheDirOf, titlesByKey } from './pack-lib.mjs'

const PORT = Number(process.argv[2] || process.env.FAKE_TVH_PORT || 9987)
const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS
const FIRST_DAY = -1
const LAST_DAY = 8
const DAY_START = '06:00'
const DAY_END = '30:00'
const STAGGER_FROM = '17:00'
const STAGGER_STEPS = [0, 5, 0, -5, 10, 0, 15, 5]
const MIN_SLOT_MINUTES = 15
const SCHEDULE_FROM_HOUR = 17
const RULE_HORIZON_MS = 4.5 * DAY_MS
const GENRE = { film: 0x10, 'one-off': 0x10, sport: 0x40 }
const CONTENT_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }

const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'))
const packDir = cacheDirOf(manifest.version)
const byKey = titlesByKey(manifest)
const nowMs = Date.parse(process.env.FAKE_NOW || manifest.clock)
const offset = manifest.clock.slice(-6)
const clockDate = manifest.clock.slice(0, 10)

const channelUuidOf = (id) => `pack${Buffer.from(id).toString('hex')}`.padEnd(32, '0').slice(0, 32)

const atLocal = ({ dayOffset, time }) => {
  const [hours, minutes] = time.split(':').map(Number)
  const base = Date.parse(`${clockDate}T00:00:00${offset}`)
  return base + dayOffset * DAY_MS + (hours * 60 + minutes) * MINUTE_MS
}

const slotsOfDay = ({ plan, dayOffset }) => {
  const evenings = plan.evenings[((dayOffset % plan.evenings.length) + plan.evenings.length) % plan.evenings.length]
  return [...plan.daytime, ...evenings, ...plan.overnight]
}

const specialsOf = ({ channelId, dayOffset }) => manifest.schedule.specials
  .filter((s) => s.channel === channelId && s.day === dayOffset)

const withSpecials = ({ slots, channelId, dayOffset }) => {
  const specials = specialsOf({ channelId, dayOffset })
  if (!specials.length) return slots
  const covered = (time) => specials.some((s) => time >= s.at && time < s.until)
  return [
    ...slots.filter(([time]) => !covered(time)),
    ...specials.flatMap((s) => [[s.at, s.title], [s.until, slots.filter(([time]) => time <= s.until).at(-1)?.[1]]]),
  ].filter(([, key]) => key).sort(([a], [b]) => a.localeCompare(b))
}

const minutesOf = (time) => {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

const timeOf = (total) => `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`

const staggered = ({ slots, channel, channelIndex, dayOffset }) => {
  let previous = -Infinity
  return slots.map(([time, key], slotIndex) => {
    const planned = minutesOf(time)
    const step = STAGGER_STEPS[Math.abs(channelIndex * 7 + dayOffset * 3 + slotIndex) % STAGGER_STEPS.length]
    const shifted = time >= STAGGER_FROM ? planned + (channel.offsetMinutes ?? 0) + step : planned
    const start = [shifted, planned, previous + MIN_SLOT_MINUTES].find((candidate) => candidate - previous >= MIN_SLOT_MINUTES)
    previous = start
    return [timeOf(start), key]
  })
}

const episodeCounters = new Map()

const nextEpisodeOf = (title) => {
  const count = episodeCounters.get(title.key) ?? 0
  episodeCounters.set(title.key, count + 1)
  const listed = title.episodes ?? []
  if (listed.length) return listed[count % listed.length]
  const season = title.season ?? 1
  return { season, episode: (count % 12) + 1 }
}

const imageOf = ({ title, episode }) => {
  const image = episode?.still ?? title.images.backdrop
  return `pack/${image.file}`
}

const buildEvents = () => {
  const events = []
  let eventId = 7_000_000
  for (const channel of manifest.channels) {
    const plan = manifest.schedule.channels[channel.id]
    for (let dayOffset = FIRST_DAY; dayOffset <= LAST_DAY; dayOffset += 1) {
      const slots = staggered({ slots: withSpecials({ slots: slotsOfDay({ plan, dayOffset }), channelId: channel.id, dayOffset }), channel, channelIndex: manifest.channels.indexOf(channel), dayOffset })
      slots.forEach(([time, key], index) => {
        const title = byKey.get(key)
        if (!title) throw new Error(`schedule uses ${key}, which is not in the manifest`)
        const until = slots[index + 1]?.[0] ?? DAY_END
        const isSeries = title.kind === 'series'
        const episode = isSeries ? nextEpisodeOf(title) : null
        events.push({
          eventId: eventId++,
          channelUuid: channelUuidOf(channel.id),
          channelName: channel.name,
          title: title.title,
          subtitle: episode?.name || undefined,
          description: episode?.synopsis || title.facts?.synopsis || undefined,
          start: atLocal({ dayOffset, time }) / 1000,
          stop: atLocal({ dayOffset, time: until }) / 1000,
          seasonNumber: episode?.season,
          episodeNumber: episode?.episode,
          episodeUri: episode ? `pack://${title.key}/${episode.season}/${episode.episode}` : undefined,
          serieslinkUri: isSeries ? `pack://${title.key}` : undefined,
          genre: GENRE[title.kind] ? [GENRE[title.kind]] : undefined,
          image: imageOf({ title, episode }),
        })
      })
    }
  }
  return events.sort((a, b) => a.start - b.start)
}

const events = buildEvents()
const channels = manifest.channels.map((channel, index) => ({
  uuid: channelUuidOf(channel.id), enabled: true, name: channel.name, number: channel.number,
  services: [`svc-${channel.id}`], icon_public_url: `imagecache/${index}`,
}))
const services = manifest.channels.map((channel) => ({
  uuid: `svc-${channel.id}`, enabled: true, dvb_servicetype: channel.hd ? 0x19 : 0x01, multiplex_uuid: 'mux', multiplex: 'mux',
}))

const ruleEntries = ({ rule, autorec }) => {
  const title = byKey.get(rule.title)
  const seen = new Set()
  return events.filter((e) => e.title === title.title && e.channelUuid === channelUuidOf(rule.channel))
    .filter((e) => e.start * 1000 > nowMs && e.start * 1000 < nowMs + RULE_HORIZON_MS)
    .filter((e) => localHourOf(e.start * 1000) >= SCHEDULE_FROM_HOUR || autorec === '')
    .filter((e) => {
      const key = e.episodeUri ?? e.eventId
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

const localHourOf = (ms) => (new Date(ms).getUTCHours() + 24 + Number(offset.slice(0, 3))) % 24

const autorecs = manifest.rules.series.map((rule, index) => ({
  uuid: `autorec-${index + 1}`, enabled: true, name: byKey.get(rule.title).title, title: anchorAutorecTitle(byKey.get(rule.title).title, [], 'au'),
  channel: channelUuidOf(rule.channel), start_extra: 2, stop_extra: 10, maxcount: 0, comment: 'freetvarr', fulltext: false, mergetext: false,
}))

const entryOf = ({ event, autorec }) => ({
  uuid: `dvr-${event.eventId}`, broadcast: event.eventId, uri: event.episodeUri,
  disp_title: event.title, disp_subtitle: event.subtitle ?? '', disp_description: event.description ?? '',
  channel: event.channelUuid, channelname: event.channelName,
  start: event.start, stop: event.stop, start_real: event.start - 120, stop_real: event.stop + 600,
  sched_status: 'scheduled', status: 'Scheduled for recording', autorec, enabled: true,
  episode_disp: event.seasonNumber != null ? `Season ${event.seasonNumber}.Episode ${event.episodeNumber}` : '',
  comment: 'freetvarr: add to library', image: event.image, errors: 0, data_errors: 0,
})

const upcoming = [
  ...manifest.rules.series.flatMap((rule, index) => ruleEntries({ rule, autorec: `autorec-${index + 1}` }).map((event) => entryOf({ event, autorec: `autorec-${index + 1}` }))),
  ...manifest.rules.oneOffs.flatMap((rule) => ruleEntries({ rule, autorec: '' }).slice(0, 1).map((event) => entryOf({ event, autorec: '' }))),
].sort((a, b) => a.start - b.start)

const scheduledIds = new Map(upcoming.map((entry) => [entry.broadcast, entry.uuid]))
for (const event of events) {
  const uuid = scheduledIds.get(event.eventId)
  if (uuid) Object.assign(event, { dvrState: 'scheduled', dvrUuid: uuid })
}

const tuners = Array.from({ length: manifest.rules.tuners }, (_, i) => ({ uuid: `tuner-${i + 1}`, text: `HDHomeRun DVB-T Tuner #${i}`, leaf: true }))
const inputs = tuners.map((tuner, i) => ({
  uuid: tuner.uuid, input: tuner.text, stream: i === 0 ? 'ABC TV on 226.5MHz' : '', subs: i === 0 ? 1 : 0,
  signal: 60000, signal_scale: 1, snr: 31000, snr_scale: 2, bps: i === 0 ? 8_200_000 : 0, cc: 0, te: 0, unc: 0,
}))

const grid = (entries, url) => {
  const start = Number(url.searchParams.get('start') || 0)
  const limit = Number(url.searchParams.get('limit') || entries.length)
  return { entries: entries.slice(start, start + limit), total: entries.length, totalCount: entries.length }
}

const answer = (url) => {
  const route = url.pathname.replace(/^\/api\//, '')
  if (route === 'serverinfo') return { sw_version: '4.3-2794', api_version: 19, name: 'Tvheadend', capabilities: [] }
  if (route === 'channel/grid') return grid(channels, url)
  if (route === 'mpegts/service/grid') return grid(services, url)
  if (route === 'epg/events/grid') return grid(events, url)
  if (route === 'dvr/entry/grid_upcoming') return grid(upcoming, url)
  if (route === 'dvr/autorec/grid') return grid(autorecs, url)
  if (route === 'status/inputs') return { entries: inputs, totalCount: inputs.length }
  if (route === 'hardware/tree') {
    const uuid = url.searchParams.get('uuid')
    if (uuid === 'root') return [{ uuid: 'hdhr', text: 'HDHomeRun network tuner', leaf: false }]
    return uuid === 'hdhr' ? tuners : []
  }
  if (route === 'epg/events/load') return { entries: events.filter((e) => String(e.eventId) === url.searchParams.get('eventId')) }
  console.error(`[fake-tvh] unknown path ${url.pathname}`)
  return { entries: [], total: 0, totalCount: 0 }
}

const sendFile = (res, file) => {
  const resolved = path.resolve(packDir, file)
  if (!resolved.startsWith(`${packDir}${path.sep}`) || !fs.existsSync(resolved)) {
    res.writeHead(404)
    return res.end()
  }
  res.writeHead(200, { 'content-type': CONTENT_TYPES[path.extname(resolved).toLowerCase()] ?? 'application/octet-stream' })
  res.end(fs.readFileSync(resolved))
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://fake-tvh')
  if (req.method !== 'GET') console.error(`[fake-tvh] ${req.method} ${url.pathname}`)
  if (url.pathname.startsWith('/imagecache/')) {
    const channel = manifest.channels[Number(url.pathname.split('/').pop())]
    return channel ? sendFile(res, channel.logoImage.file) : sendFile(res, '')
  }
  if (url.pathname.startsWith('/pack/')) return sendFile(res, decodeURIComponent(url.pathname.slice('/pack/'.length)))
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify(answer(url)))
}).listen(PORT, '127.0.0.1', () => {
  console.error(`[fake-tvh] ${events.length} events, ${channels.length} channels, ${upcoming.length} scheduled on ${PORT}`)
})
