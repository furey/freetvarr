import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createGuideSources, xmltvFeedsOf } from '../src/guide-sources/index.js'
import { createFreeviewAuSource, freeviewProgrammeOf } from '../src/guide-sources/freeview-au.js'
import { MJH_AU_FEEDS, createMjhAu } from '../src/guide-sources/mjh-au.js'
import { MJH_NZ_FEEDS, createMjhNz } from '../src/guide-sources/mjh-nz.js'
import { NZ_RATING_LABELS, createFreeviewNzSource } from '../src/guide-sources/freeview-nz.js'
import { countryForTimeZone } from '../src/zone-countries.js'
import { readFileSync } from 'node:fs'
import { indexFeed } from '../src/guide-sources/mjh-feed.js'
import { parseProgrammeElement, programmeXml } from '../src/guide-sources/xmltv.js'
import { OutboundError } from '../src/outbound-http.js'
import { WINDOW_FORMAT } from '../src/guide-sources/freeview-au.js'
import { createWindowStore } from '../src/guide-sources/window-store.js'
import { up as upWindows } from '../migrations/0055_guide_source_windows.js'
import knexFactory from 'knex'

const HOUR = 60 * 60_000
const NOW = Date.parse('2026-11-10T00:00:00Z')
const TRIPLET = '1013:0502:0527'

const mjhFeed = (channelId) => `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="${channelId}">
    <display-name>7mate</display-name>
    <lcn>74</lcn>
    <icon src="https://i.mjh.nz/.images/7mate.png"/>
  </channel>
  <programme start="20261110010000 +0000" stop="20261110020000 +0000" channel="${channelId}">
    <title>Aussie Gold Hunters</title>
    <sub-title>Episode 6</sub-title>
    <desc>Kellie &amp; Henri dig.</desc>
    <category>Special Interest</category>
    <icon src="https://example.test/gold.jpg"/>
    <episode-num system="SxxExx">S01E06</episode-num>
    <episode-num system="xmltv_ns">0.5.</episode-num>
    <episode-num system="original-air-date">2026-11-10</episode-num>
    <rating>
      <value>PG</value>
    </rating>
    <star-rating>
      <value>7/10</value>
    </star-rating>
  </programme>
  <programme start="20261110000000 +0000" stop="20261110010000 +0000" channel="${channelId}">
    <title>American Pickers</title>
  </programme>
</tv>
`

const freeviewListing = ({ id = 'l1', title = 'American Pickers', start = '2026-11-10T00:04:00+00:00', end = '2026-11-10T01:03:00+00:00', episode = {} } = {}) => ({
  id,
  title,
  start,
  end,
  tags: ['captioned'],
  related: {
    episodes: [{
      title: 'Bad Mother Shucker',
      synopsis: 'Mike meets a deer.',
      episode_number: '11',
      tags: ['onapi-progtype:series', 'onapi-subtype:episode'],
      categories: ['genres/Entertainment', 'classification/PG', 'season_number/6', 'crid_value/APIC6_011'],
      related: { images: [{ url: 'http://img-store-prod.switch.tv/images/ep.jpg' }] },
      ...episode,
    }],
    shows: [{ synopsis: 'Pickers travel.', related: { images: [{ url: 'http://img-store-prod.switch.tv/images/show.jpg' }] } }],
  },
})

const fakeFreeviewClient = (answer) => {
  const calls = []
  return {
    calls,
    getJson: async (request) => {
      calls.push(request)
      return answer(request)
    },
  }
}

const freeviewAnswer = ({ url }) => {
  if (url.includes('/channels/region/')) return { data: [{ dvb_triplet: TRIPLET.toUpperCase(), lcn: 74, channel_name: '7mate HD' }, { dvb_triplet: 'bad' }] }
  return { data: [freeviewListing()], meta: { pagination: { more: false } } }
}

const nzFixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/freeview-nz/${name}.json`, import.meta.url), 'utf8'))
const NZ_NOW = Date.parse('2026-11-11T04:00:00Z')

const freeviewNzAnswer = ({ url }) => {
  if (url.endsWith('/content/v1/channels')) return nzFixture('channels')
  if (url.endsWith('/epgs/222A::0514')) return nzFixture('epgs-three')
  return { data: [], meta: { pagination: { more: false } } }
}

const contractCases = () => [
  {
    source: createFreeviewNzSource({ client: fakeFreeviewClient(freeviewNzAnswer), now: () => NZ_NOW }),
    timeZone: 'Pacific/Auckland',
    channel: '222a::0514',
    from: NZ_NOW,
  },
  {
    source: createFreeviewAuSource({ client: fakeFreeviewClient(freeviewAnswer), now: () => NOW }),
    timeZone: 'Australia/Sydney',
  },
  { source: createMjhAu({ download: async () => mjhFeed('mjh-7mate-syd') }), timeZone: 'Australia/Sydney' },
  { source: createMjhNz({ download: async () => mjhFeed('mjh-tvnz-1') }), timeZone: 'Pacific/Auckland' },
]

test('every guide source passes the adapter contract', async () => {
  const cases = contractCases()
  assert.deepEqual(cases.map(({ source }) => source.id).sort(), createGuideSources().all().map((source) => source.id).sort())
  for (const { source, timeZone, channel: wanted, from } of cases) {
    assert.equal(typeof source.id, 'string', source.id)
    assert.ok(Array.isArray(source.countries) && source.countries.length, source.id)
    assert.ok(Object.keys(source.hostLimits).length, `${source.id} names its hosts`)
    for (const limits of Object.values(source.hostLimits)) assert.ok(limits.concurrency >= 1, source.id)
    assert.equal(source.regionOf('Europe/Berlin'), null, `${source.id} has no region outside its countries`)
    const region = source.regionOf(timeZone)
    assert.ok(region, `${source.id} has a region for ${timeZone}`)
    const channels = await source.channels(region)
    assert.ok(channels.length, source.id)
    for (const channel of channels) {
      assert.equal(typeof channel.id, 'string', source.id)
      assert.ok(Array.isArray(channel.names), source.id)
      assert.ok(channel.lcn === null || Number.isInteger(channel.lcn), source.id)
    }
    const channel = wanted ?? channels[0].id
    assert.ok(channels.some((candidate) => candidate.id === channel), source.id)
    const programmes = await source.listings({ region, channel, from: (from ?? NOW) - HOUR, to: (from ?? NOW) + 6 * HOUR })
    assert.ok(programmes.length, source.id)
    for (const programme of programmes) {
      assert.equal(programme.channel, channel, source.id)
      assert.ok(Number.isFinite(programme.start) && programme.stop > programme.start, source.id)
      assert.ok(programme.title, source.id)
      assert.ok(Array.isArray(programme.categories) && Array.isArray(programme.episodeNums) && Array.isArray(programme.extras), source.id)
    }
    assert.deepEqual(programmes.map((p) => p.start), [...programmes].map((p) => p.start).sort((a, b) => a - b), source.id)
  }
})

test('registry: Australia and New Zealand rank Freeview before mjh, and the feed list comes from the mjh source', () => {
  const sources = createGuideSources()
  assert.deepEqual(sources.forCountry('au').map((s) => s.id), ['freeview-au', 'mjh-au'])
  assert.deepEqual(sources.forCountry('nz').map((s) => s.id), ['freeview-nz', 'mjh-nz'])
  assert.deepEqual(sources.forCountry('de'), [])
  assert.deepEqual(xmltvFeedsOf('au'), MJH_AU_FEEDS)
  assert.deepEqual(xmltvFeedsOf('nz'), MJH_NZ_FEEDS)
  assert.equal(MJH_AU_FEEDS.find((feed) => feed.region === 'Sydney').url, 'https://i.mjh.nz/au/Sydney/epg.xml')
})

test('mjh: one download per region serves channels and listings, filtered by time and sorted', async () => {
  let downloads = 0
  const source = createMjhAu({ download: async () => { downloads += 1; return mjhFeed('mjh-7mate-syd') } })
  assert.equal(source.regionOf('Australia/Sydney'), 'Sydney')
  assert.equal(source.regionOfUrl('https://i.mjh.nz/au/Perth/epg.xml'), 'Perth')
  assert.equal(source.regionOfUrl('https://example.test/epg.xml'), null)
  const [channel] = await source.channels('Sydney')
  assert.deepEqual(channel, { id: 'mjh-7mate-syd', names: ['7mate'], lcn: 74, icon: 'https://i.mjh.nz/.images/7mate.png' })
  const all = await source.listings({ region: 'Sydney', channel: 'mjh-7mate-syd' })
  assert.deepEqual(all.map((p) => p.title), ['American Pickers', 'Aussie Gold Hunters'])
  const later = await source.listings({ region: 'Sydney', channel: 'mjh-7mate-syd', from: NOW + HOUR + 1, to: Infinity })
  assert.deepEqual(later.map((p) => p.title), ['Aussie Gold Hunters'])
  assert.equal(downloads, 1)
})

test('xmltv: a parsed programme keeps every field and writes back the same facts', () => {
  const { programmes } = indexFeed(mjhFeed('mjh-7mate-syd'))
  const parsed = parseProgrammeElement(programmes.get('mjh-7mate-syd')[1].xml)
  assert.equal(parsed.title, 'Aussie Gold Hunters')
  assert.equal(parsed.desc, 'Kellie & Henri dig.')
  assert.equal(parsed.rating, 'PG')
  assert.deepEqual(parsed.episodeNums.map((n) => n.system), ['SxxExx', 'xmltv_ns', 'original-air-date'])
  assert.equal(parsed.extras.length, 1)
  assert.match(parsed.extras[0], /^<star-rating>/)
  const again = parseProgrammeElement(programmeXml(parsed))
  for (const field of ['channel', 'start', 'stop', 'title', 'subTitle', 'desc', 'categories', 'rating', 'icon', 'episodeNums', 'extras']) {
    assert.deepEqual(again[field], parsed[field], field)
  }
})

test('freeview: a listing becomes a programme with season, episode, CRID, rating, genres, and the episode picture', () => {
  const programme = freeviewProgrammeOf({ listing: freeviewListing() })
  assert.equal(programme.title, 'American Pickers')
  assert.equal(programme.subTitle, 'Bad Mother Shucker')
  assert.equal(programme.desc, 'Mike meets a deer.')
  assert.deepEqual(programme.categories, ['Entertainment'])
  assert.equal(programme.rating, 'PG')
  assert.equal(programme.season, 6)
  assert.equal(programme.episode, 11)
  assert.equal(programme.crid, 'APIC6_011')
  assert.equal(programme.icon, 'https://img-store-prod.switch.tv/images/ep.jpg')
  assert.equal(programme.stop - programme.start, 59 * 60_000)
})

test('freeview: a series-level entry has no sub-title, and NC is not a rating', () => {
  const programme = freeviewProgrammeOf({
    listing: freeviewListing({
      title: '9News',
      episode: { title: '9News', tags: ['onapi-subtype:series'], categories: ['classification/NC'], episode_number: null },
    }),
  })
  assert.equal(programme.subTitle, null)
  assert.equal(programme.rating, null)
  assert.equal(programme.season, null)
  assert.equal(programme.episode, null)
})

test('freeview: a 504 on a 12 h window reads it again as two six-hour halves', async () => {
  const client = fakeFreeviewClient(({ url, params }) => {
    if (url.includes('/channels/region/')) return freeviewAnswer({ url })
    const hours = (Date.parse(params.end) - Date.parse(params.start)) / HOUR
    if (hours === 12) throw new OutboundError('fvau-api-prod.switch.tv HTTP 504', { code: 'unavailable', status: 504 })
    const listing = freeviewListing({ id: params.start, start: params.start, end: new Date(Date.parse(params.start) + HOUR).toISOString() })
    return { data: [listing], meta: { pagination: { more: false } } }
  })
  const source = createFreeviewAuSource({ client, now: () => NOW })
  const programmes = await source.listings({ channel: TRIPLET, from: NOW, to: NOW + 12 * HOUR })
  assert.equal(programmes.length, 2)
  const windows = client.calls.map(({ params }) => [params.start, params.end])
  assert.deepEqual(windows, [
    ['2026-11-10T00:00:00Z', '2026-11-10T12:00:00Z'],
    ['2026-11-10T00:00:00Z', '2026-11-10T06:00:00Z'],
    ['2026-11-10T06:00:00Z', '2026-11-10T12:00:00Z'],
  ])
  assert.deepEqual({ ...source.stats(), windows: 0, failures: 0 }, { requests: 3, failedWindows: 0, splitWindows: 1, windowsRead: 1, pendingWindows: 0, windows: 0, failures: 0 })
})

test('freeview: a 12 h window over the size limit reads it again as two six-hour halves', async () => {
  const client = fakeFreeviewClient(({ params }) => {
    if ((Date.parse(params.end) - Date.parse(params.start)) / HOUR === 12) throw new OutboundError('fvau-api-prod.switch.tv sent more than 2097152 bytes', { code: 'too-large' })
    return { data: [freeviewListing({ id: params.start, start: params.start, end: new Date(Date.parse(params.start) + HOUR).toISOString() })], meta: { pagination: { more: false } } }
  })
  const source = createFreeviewAuSource({ client, now: () => NOW })
  assert.equal((await source.listings({ channel: TRIPLET, from: NOW, to: NOW + 12 * HOUR })).length, 2)
  assert.equal(source.stats().splitWindows, 1)
})

test('freeview: a 12 h window that needs more pages than a six-hour one is still read to the end', async () => {
  const client = fakeFreeviewClient(({ params }) => {
    const page = params.offset / params.limit
    return { data: [freeviewListing({ id: `p${page}`, start: new Date(NOW + page * HOUR).toISOString(), end: new Date(NOW + (page + 1) * HOUR).toISOString() })], meta: { pagination: { more: page < 4 } } }
  })
  const source = createFreeviewAuSource({ client, now: () => NOW })
  const programmes = await source.listings({ channel: TRIPLET, from: NOW, to: NOW + 12 * HOUR })
  assert.equal(client.calls.length, 5)
  assert.equal(programmes.length, 5)
})

test('freeview: a failed window is empty, backs off, and is not read again until the backoff ends', async () => {
  const clock = { ms: NOW }
  const client = fakeFreeviewClient(() => {
    throw new OutboundError('fvau-api-prod.switch.tv did not answer', { code: 'unavailable' })
  })
  const source = createFreeviewAuSource({ client, now: () => clock.ms })
  assert.deepEqual(await source.listings({ channel: TRIPLET, from: NOW, to: NOW + HOUR }), [])
  assert.deepEqual(await source.listings({ channel: TRIPLET, from: NOW, to: NOW + HOUR }), [])
  assert.equal(client.calls.length, 1)
  clock.ms += 16 * 60_000
  await source.listings({ channel: TRIPLET, from: NOW, to: NOW + HOUR })
  assert.equal(client.calls.length, 2)
})

test('freeview: near windows are read again after about 6 h, far windows after about a day', async () => {
  const clock = { ms: NOW }
  const client = fakeFreeviewClient(freeviewAnswer)
  const source = createFreeviewAuSource({ client, now: () => clock.ms })
  const far = NOW + 5 * 24 * HOUR
  await source.listings({ channel: TRIPLET, from: NOW, to: NOW + HOUR })
  await source.listings({ channel: TRIPLET, from: far, to: far + HOUR })
  clock.ms += 6 * HOUR
  await source.listings({ channel: TRIPLET, from: NOW, to: NOW + HOUR })
  await source.listings({ channel: TRIPLET, from: far, to: far + HOUR })
  assert.equal(client.calls.length, 3)
})

test('freeview: a window past the horizon (204, no JSON) is empty, not a failure', async () => {
  const client = fakeFreeviewClient(() => {
    throw new OutboundError('fvau-api-prod.switch.tv sent no content type', { code: 'bad-content' })
  })
  const source = createFreeviewAuSource({ client, now: () => NOW })
  assert.deepEqual(await source.listings({ channel: TRIPLET, from: NOW, to: NOW + HOUR }), [])
  assert.deepEqual({ ...source.stats(), windows: 0, failures: 0 }, { requests: 1, failedWindows: 0, splitWindows: 0, windowsRead: 1, pendingWindows: 0, windows: 0, failures: 0 })
})

test('freeview: a "To Be Advised" placeholder is left out, so mjh fills the slot', () => {
  assert.equal(freeviewProgrammeOf({ listing: freeviewListing({ title: 'To Be Advised' }) }), null)
  assert.equal(freeviewProgrammeOf({ listing: freeviewListing({ title: 'TBA' }) }), null)
})

test('freeview: each 12 h read goes to onWindow as two six-hour windows with pictures and expiry, so the picture job can reuse it', async () => {
  const seen = []
  const source = createFreeviewAuSource({ client: fakeFreeviewClient(freeviewAnswer), now: () => NOW, onWindow: (window) => seen.push(window) })
  await source.listings({ channel: TRIPLET, from: NOW, to: NOW + HOUR })
  assert.deepEqual(seen.map(({ triplet, windowStart, listings, expiresAt }) => [triplet, windowStart, listings.length, expiresAt]), [
    [TRIPLET, NOW, 1, NOW + 5.5 * HOUR],
    [TRIPLET, NOW + 6 * HOUR, 0, NOW + 5.5 * HOUR],
  ])
  const [picture] = seen[0].listings
  assert.equal(picture.title, 'American Pickers')
  assert.equal(Date.parse(picture.start), Date.parse('2026-11-10T00:04:00Z'))
  assert.equal(picture.related.shows[0].related.images[0].url, 'https://img-store-prod.switch.tv/images/show.jpg')
  assert.equal(picture.related.episodes[0].related.images[0].url, 'https://img-store-prod.switch.tv/images/ep.jpg')
})

test('freeview: far windows expire at a random time between half and one and a half of the far lifetime, so rebuilds share the re-reads', async () => {
  const clock = { ms: NOW }
  const draws = [0, 0.999, 0.999]
  const client = fakeFreeviewClient(freeviewAnswer)
  const source = createFreeviewAuSource({ client, now: () => clock.ms, random: () => draws.shift() })
  const far = NOW + 5 * 24 * HOUR
  const readFar = async () => {
    await source.listings({ channel: TRIPLET, from: far, to: far + HOUR })
    await source.listings({ channel: '1013:0502:0528', from: far, to: far + HOUR })
  }
  await readFar()
  assert.equal(client.calls.length, 2)
  clock.ms = NOW + 11.5 * HOUR
  await readFar()
  assert.equal(client.calls.length, 2)
  clock.ms = NOW + 12 * HOUR
  await readFar()
  assert.deepEqual(client.calls.slice(2).map(({ url }) => url.split('/').pop()), [TRIPLET.toUpperCase()])
  clock.ms = NOW + 35.5 * HOUR
  await readFar()
  assert.deepEqual(client.calls.slice(3).map(({ url }) => url.split('/').pop()), ['1013:0502:0528'.toUpperCase()])
})

test('freeview: a far window that comes within two days is read again once it is older than the near lifetime', async () => {
  const clock = { ms: NOW }
  const client = fakeFreeviewClient(freeviewAnswer)
  const source = createFreeviewAuSource({ client, now: () => clock.ms, random: () => 0.999 })
  const day3 = NOW + 3 * 24 * HOUR
  await source.listings({ channel: TRIPLET, from: day3, to: day3 + HOUR })
  clock.ms = NOW + 25 * HOUR
  await source.listings({ channel: TRIPLET, from: day3, to: day3 + HOUR })
  assert.equal(client.calls.length, 2)
})

test('freeview: windows past fetchUntil are read only from memory, stale ones count as pending, and prefetch reads windows in time order across channels', async () => {
  const clock = { ms: NOW }
  const client = fakeFreeviewClient(freeviewAnswer)
  const source = createFreeviewAuSource({ client, now: () => clock.ms, random: () => 0 })
  const channels = [TRIPLET, '1013:0502:0528']
  await source.prefetch({ channels, from: NOW, to: NOW + 24 * HOUR })
  assert.deepEqual(client.calls.map(({ url, params }) => [url.split('/').pop(), params.start]), [
    [TRIPLET.toUpperCase(), '2026-11-10T00:00:00Z'],
    ['1013:0502:0528'.toUpperCase(), '2026-11-10T00:00:00Z'],
    [TRIPLET.toUpperCase(), '2026-11-10T12:00:00Z'],
    ['1013:0502:0528'.toUpperCase(), '2026-11-10T12:00:00Z'],
  ])
  const programmes = await source.listings({ channel: TRIPLET, from: NOW, to: NOW + 36 * HOUR, fetchUntil: NOW + 24 * HOUR })
  assert.equal(programmes.length, 1)
  assert.equal(client.calls.length, 4)
  assert.equal(source.stats().pendingWindows, 1)
  clock.ms = NOW + 6 * HOUR
  source.resetStats()
  const stale = await source.listings({ channel: TRIPLET, from: NOW, to: NOW + 12 * HOUR, fetchUntil: NOW })
  assert.equal(stale.length, 1, 'a stale window is still served while it waits for its re-read')
  assert.equal(source.stats().pendingWindows, 1)
  assert.equal(client.calls.length, 4)
})

test('freeview: requests use the upper-case triplet the API needs, and a 400 stops that channel instead of every later window', async () => {
  const client = fakeFreeviewClient(({ url }) => {
    if (!url.endsWith('1012:0420:042A')) throw new Error(`unexpected ${url}`)
    throw new OutboundError('fvau-api-prod.switch.tv HTTP 400', { code: 'rejected', status: 400 })
  })
  const source = createFreeviewAuSource({ client, now: () => NOW })
  assert.deepEqual(await source.listings({ channel: '1012:0420:042a', from: NOW, to: NOW + 2 * 24 * HOUR }), [])
  assert.equal(client.calls.length, 1)
})

test('freeview: windows that ended before the read start are pruned, and the window memory is capped', async () => {
  const clock = { ms: NOW }
  const source = createFreeviewAuSource({ client: fakeFreeviewClient(freeviewAnswer), now: () => clock.ms, maxWindows: 3 })
  await source.listings({ channel: TRIPLET, from: NOW, to: NOW + 48 * HOUR })
  assert.equal(source.stats().windows, 3)
  clock.ms += 24 * HOUR
  await source.listings({ channel: TRIPLET, from: clock.ms, to: clock.ms + 12 * HOUR })
  assert.equal(source.stats().windows, 2)
})

test('freeview: windows persist across a restart with their fetch time, and a stored format change is read again', async () => {
  const database = knexFactory({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true })
  await upWindows(database)
  const store = createWindowStore({ database })
  const first = createFreeviewAuSource({ client: fakeFreeviewClient(freeviewAnswer), now: () => NOW, store, random: () => 0.5 })
  const before = await first.listings({ channel: TRIPLET, from: NOW, to: NOW + 24 * HOUR })
  const offline = fakeFreeviewClient(() => {
    throw new Error('no request after a restart')
  })
  const seen = []
  const restarted = createFreeviewAuSource({ client: offline, now: () => NOW + HOUR, store, onWindow: (window) => seen.push(window) })
  assert.deepEqual(await restarted.listings({ channel: TRIPLET, from: NOW, to: NOW + 24 * HOUR }), before)
  assert.equal(offline.calls.length, 0)
  assert.deepEqual(seen.map(({ windowStart, expiresAt }) => [windowStart, expiresAt]), [
    [NOW, NOW + 5.5 * HOUR],
    [NOW + 6 * HOUR, NOW + 5.5 * HOUR],
    [NOW + 12 * HOUR, NOW + 5.5 * HOUR],
    [NOW + 18 * HOUR, NOW + 5.5 * HOUR],
  ])
  await database('guide_source_windows').update({ format: WINDOW_FORMAT + 1 })
  const reread = fakeFreeviewClient(freeviewAnswer)
  const upgraded = createFreeviewAuSource({ client: reread, now: () => NOW + HOUR, store })
  await upgraded.listings({ channel: TRIPLET, from: NOW, to: NOW + 24 * HOUR })
  assert.equal(reread.calls.length, 2)
  assert.deepEqual(await database('guide_source_windows').distinct('format').pluck('format'), [WINDOW_FORMAT])
  await upgraded.prefetch({ channels: [TRIPLET], from: NOW + 13 * HOUR, to: NOW + 13 * HOUR })
  assert.deepEqual(await database('guide_source_windows').pluck('window_start'), [NOW + 12 * HOUR])
  await database.destroy()
})

test('xmltv: a written programme keeps the XMLTV DTD element order, extras included', () => {
  const xml = programmeXml({
    channel: 'c',
    start: NOW,
    stop: NOW + HOUR,
    title: 'Gruen',
    desc: 'Ads.',
    categories: ['Comedy'],
    icon: 'https://example.test/g.jpg',
    episodeNums: [{ system: 'xmltv_ns', value: '0.1.' }],
    rating: 'M',
    extras: ['<star-rating><value>8/10</value></star-rating>', '<video><quality>HDTV</quality></video>', '<country>AU</country>', '<date>2026</date>'],
  })
  const names = [...xml.matchAll(/^ {4}<([a-z-]+)/gm)].map((m) => m[1])
  assert.deepEqual(names, ['title', 'desc', 'date', 'category', 'icon', 'country', 'episode-num', 'video', 'rating', 'star-rating'])
})

test('suggested feeds: each country gets its own third-party feeds, and city feeds only for the time-zone city', async () => {
  const { suggestedFeedsOf, suggestionsOf } = await import('../src/guide-sources/suggested-feeds.js')
  const uk = suggestionsOf({ country: 'uk', timeZone: 'Europe/London' })
  assert.equal(uk.country, 'the United Kingdom')
  assert.equal(uk.checked, '2026-11-10')
  assert.deepEqual(uk.feeds.map((feed) => feed.provider), ['epgshare01', 'epg.pw'])
  const perth = suggestedFeedsOf({ country: 'au', timeZone: 'Australia/Perth' })
  assert.deepEqual(perth.filter((feed) => feed.provider === 'xmltv.net').map((feed) => feed.url), ['https://xmltv.net/xml_files/Perth.xml'])
  assert.equal(suggestedFeedsOf({ country: 'au', timeZone: 'Australia/Lord_Howe' }).some((feed) => feed.provider === 'xmltv.net'), false)
  assert.deepEqual(suggestedFeedsOf({ country: 'xx' }), [])
  assert.equal(suggestionsOf({ country: '' }).country, null)
})

test('suggested feeds: every entry names a country, an https feed address, a provider, and the page that documents it', async () => {
  const { default: data } = await import('../src/data/suggested-guide-feeds.json', { with: { type: 'json' } })
  assert.match(data.checked, /^\d{4}-\d{2}-\d{2}$/)
  const urls = new Set()
  for (const feed of data.feeds) {
    assert.ok(data.countries[feed.country], `${feed.url} has a known country`)
    assert.match(feed.url, /^https:\/\/\S+\.xml(\.gz)?$/)
    assert.match(feed.source, /^https:\/\//)
    assert.ok(feed.provider && feed.name)
    assert.ok(!urls.has(feed.url), `${feed.url} is listed once`)
    urls.add(feed.url)
  }
})

test('country routing: the time zone picks the ranked sources, and every other country is broadcast-only', () => {
  const sources = createGuideSources()
  const idsFor = (timeZone) => sources.forCountry(countryForTimeZone(timeZone)).map((source) => source.id)
  assert.deepEqual(idsFor('Australia/Perth'), ['freeview-au', 'mjh-au'])
  assert.deepEqual(idsFor('Pacific/Auckland'), ['freeview-nz', 'mjh-nz'])
  assert.deepEqual(idsFor('Pacific/Chatham'), ['freeview-nz', 'mjh-nz'])
  for (const zone of ['Europe/London', 'Europe/Berlin', 'America/New_York', 'Africa/Johannesburg', 'Etc/UTC']) assert.deepEqual(idsFor(zone), [], zone)
  const nz = sources.forCountry('nz')[0]
  assert.equal(nz.regionOf('Pacific/Auckland'), 'nz')
  assert.equal(nz.regionOf('Australia/Sydney'), null)
  assert.deepEqual(Object.keys(nz.hostLimits), ['fvnz-capi-prod.switch.tv'])
})

test('freeview-nz: channels keep the empty-TSID triplet, and a listing takes its own episode, not the first one', async () => {
  const client = fakeFreeviewClient(freeviewNzAnswer)
  const source = createFreeviewNzSource({ client, now: () => NZ_NOW })
  const channels = await source.channels('nz')
  assert.deepEqual(channels.map((channel) => channel.id), ['222a::1772', '222a::0514', '222a::04b0'])
  assert.equal(channels.find((channel) => channel.id === '222a::0514').lcn, 3)
  const [bondi, news, hotSeat] = await source.listings({ region: 'nz', channel: '222a::0514', from: NZ_NOW, to: NZ_NOW + 3 * HOUR })
  assert.equal(bondi.title, 'Bondi Rescue')
  assert.equal(bondi.episode, 4)
  assert.equal(bondi.subTitle, null)
  assert.equal(bondi.rating, 'PG')
  assert.deepEqual(bondi.categories, ['Reality'])
  assert.match(bondi.icon, /^https:\/\/img-store-prod\.switch\.tv\//)
  assert.deepEqual(news.categories, ['News'])
  assert.equal(news.subTitle, 'Wednesday 11 November 2026')
  assert.equal(hotSeat.rating, 'G')
  assert.ok(client.calls.every(({ url }) => url.startsWith('https://fvnz-capi-prod.switch.tv/')))
  assert.ok(client.calls.some(({ url }) => url.endsWith('/epgs/222A::0514')))
  assert.ok(NZ_RATING_LABELS.has('16') && NZ_RATING_LABELS.has('18'))
})

test('freeview: an impossible season number is dropped, not written to the guide', () => {
  const listing = freeviewListing({ episode: { categories: ['genres/Entertainment', 'season_number/1039546'] } })
  assert.equal(freeviewProgrammeOf({ listing }).season, null)
})
