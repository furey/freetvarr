import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createGuideSources, xmltvFeedsOf } from '../src/guide-sources/index.js'
import { createFreeviewAuSource, freeviewProgrammeOf } from '../src/guide-sources/freeview-au.js'
import { MJH_AU_FEEDS, createMjhAu } from '../src/guide-sources/mjh-au.js'
import { MJH_NZ_FEEDS, createMjhNz } from '../src/guide-sources/mjh-nz.js'
import { indexFeed } from '../src/guide-sources/mjh-feed.js'
import { parseProgrammeElement, programmeXml } from '../src/guide-sources/xmltv.js'
import { OutboundError } from '../src/outbound-http.js'

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

const contractCases = () => [
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
  for (const { source, timeZone } of cases) {
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
    const programmes = await source.listings({ region, channel: channels[0].id, from: NOW - HOUR, to: NOW + 6 * HOUR })
    assert.ok(programmes.length, source.id)
    for (const programme of programmes) {
      assert.equal(programme.channel, channels[0].id, source.id)
      assert.ok(Number.isFinite(programme.start) && programme.stop > programme.start, source.id)
      assert.ok(programme.title, source.id)
      assert.ok(Array.isArray(programme.categories) && Array.isArray(programme.episodeNums) && Array.isArray(programme.extras), source.id)
    }
    assert.deepEqual(programmes.map((p) => p.start), [...programmes].map((p) => p.start).sort((a, b) => a - b), source.id)
  }
})

test('registry: Australia ranks Freeview before mjh, New Zealand has mjh only, and the feed list comes from the mjh source', () => {
  const sources = createGuideSources()
  assert.deepEqual(sources.forCountry('au').map((s) => s.id), ['freeview-au', 'mjh-au'])
  assert.deepEqual(sources.forCountry('nz').map((s) => s.id), ['mjh-nz'])
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

test('freeview: a 504 on a six-hour window reads it again as two three-hour halves', async () => {
  const client = fakeFreeviewClient(({ url, params }) => {
    if (url.includes('/channels/region/')) return freeviewAnswer({ url })
    const hours = (Date.parse(params.end) - Date.parse(params.start)) / HOUR
    if (hours === 6) throw new OutboundError('fvau-api-prod.switch.tv HTTP 504', { code: 'unavailable', status: 504 })
    const listing = freeviewListing({ id: params.start, start: params.start, end: new Date(Date.parse(params.start) + HOUR).toISOString() })
    return { data: [listing], meta: { pagination: { more: false } } }
  })
  const source = createFreeviewAuSource({ client, now: () => NOW })
  const programmes = await source.listings({ channel: TRIPLET, from: NOW, to: NOW + 6 * HOUR })
  assert.equal(programmes.length, 2)
  const windows = client.calls.map(({ params }) => [params.start, params.end])
  assert.deepEqual(windows, [
    ['2026-11-10T00:00:00Z', '2026-11-10T06:00:00Z'],
    ['2026-11-10T00:00:00Z', '2026-11-10T03:00:00Z'],
    ['2026-11-10T03:00:00Z', '2026-11-10T06:00:00Z'],
  ])
  assert.deepEqual({ ...source.stats(), windows: 0, failures: 0 }, { requests: 3, failedWindows: 0, splitWindows: 1, windows: 0, failures: 0 })
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
  assert.deepEqual({ ...source.stats(), windows: 0, failures: 0 }, { requests: 1, failedWindows: 0, splitWindows: 0, windows: 0, failures: 0 })
})

test('freeview: a "To Be Advised" placeholder is left out, so mjh fills the slot', () => {
  assert.equal(freeviewProgrammeOf({ listing: freeviewListing({ title: 'To Be Advised' }) }), null)
  assert.equal(freeviewProgrammeOf({ listing: freeviewListing({ title: 'TBA' }) }), null)
})

test('freeview: each window read hands its raw listings to onWindow, so the picture job can reuse it', async () => {
  const seen = []
  const source = createFreeviewAuSource({ client: fakeFreeviewClient(freeviewAnswer), now: () => NOW, onWindow: (window) => seen.push(window) })
  await source.listings({ channel: TRIPLET, from: NOW, to: NOW + HOUR })
  assert.deepEqual(seen.map(({ triplet, windowStart, listings }) => [triplet, windowStart, listings.length]), [[TRIPLET, NOW, 1]])
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
  await source.listings({ channel: TRIPLET, from: NOW, to: NOW + 24 * HOUR })
  assert.equal(source.stats().windows, 3)
  clock.ms += 24 * HOUR
  await source.listings({ channel: TRIPLET, from: clock.ms, to: clock.ms + 6 * HOUR })
  assert.equal(source.stats().windows, 1)
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
