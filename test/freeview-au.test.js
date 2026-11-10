import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import http from 'node:http'

import {
  FREEVIEW_WINDOW_MS,
  createFreeviewAu,
  freeviewAiringsOf,
  freeviewCandidatesOf,
  freeviewRegionOf,
  isFreeviewImageSource,
  listingImageOf,
  listingImagesOf,
  matchListing,
  placeholderImagesOf,
  slimListingOf,
  titlesAgree,
  windowStartOf,
  windowsAround,
} from '../src/freeview-au.js'
import { OutboundError } from '../src/outbound-http.js'
import { dvbTripletOf, listChannelTriplets } from '../src/tvheadend.js'

const MINUTE = 60 * 1000
const START = Date.parse('2026-11-10T09:30:00Z')
const TRIPLET = '1013:0502:0520'

const listing = ({ title, start = START, show = null, episode = null }) => ({
  title,
  start: new Date(start).toISOString().replace('.000Z', '+00:00'),
  related: {
    shows: show ? [{ related: { images: [{ url: `http://img-store-prod.switch.tv/images/${show}` }] } }] : [],
    episodes: episode ? [{ related: { images: [{ url: `http://img-store-prod.switch.tv/images/${episode}` }] } }] : [],
  },
})

const fakeClient = (answer) => {
  const calls = []
  return {
    calls,
    getJson: async ({ url, params }) => {
      calls.push({ url, params })
      return answer({ url, params })
    },
  }
}

const channelsBody = { data: [{ dvb_triplet: TRIPLET }, { dvb_triplet: '1014:0602:0625' }] }

test('dvbTripletOf writes the original network, transport stream, and service ids as Freeview hex', () => {
  assert.equal(dvbTripletOf({ onid: 4115, tsid: 1282, sid: 1312 }), TRIPLET)
  assert.equal(dvbTripletOf({ onid: 12802, tsid: 768, sid: 769 }), '3202:0300:0301')
  assert.equal(dvbTripletOf({ onid: null, tsid: 1282, sid: 1312 }), null)
  assert.equal(dvbTripletOf({ onid: 70000, tsid: 1, sid: 1 }), null)
})

test('freeviewRegionOf maps the Australian time zones to Freeview regions and is off outside Australia', () => {
  const table = [
    ['Australia/Sydney', 'region_nsw_sydney'],
    ['Australia/Melbourne', 'region_vic_melbourne'],
    ['Australia/Brisbane', 'region_qld_brisbane'],
    ['Australia/Adelaide', 'region_sa_adelaide'],
    ['Australia/Perth', 'region_wa_perth'],
    ['Australia/Hobart', 'region_tas_hobart'],
    ['Australia/Darwin', 'region_nt_darwin'],
    ['Australia/Canberra', 'region_act_canberra'],
    ['Australia/Broken_Hill', 'region_nsw_broken_hill'],
    ['Australia/Lindeman', 'region_qld_brisbane'],
    ['Australia/Currie', 'region_tas_hobart'],
    ['Australia/Eucla', 'region_wa_perth'],
    ['Australia/Lord_Howe', 'region_nsw_sydney'],
    ['Asia/Tokyo', null],
    ['Pacific/Auckland', null],
    ['Europe/London', null],
    ['', null],
  ]
  for (const [zone, region] of table) assert.equal(freeviewRegionOf(zone), region, zone)
})

test('windows are six hours on UTC boundaries; an airing near a boundary also reads the next window', () => {
  assert.equal(windowStartOf(START), Date.parse('2026-11-10T06:00:00Z'))
  assert.deepEqual(windowsAround(START), [Date.parse('2026-11-10T06:00:00Z')])
  const nearEdge = Date.parse('2026-11-10T11:58:00Z')
  assert.deepEqual(windowsAround(nearEdge), [Date.parse('2026-11-10T06:00:00Z'), Date.parse('2026-11-10T12:00:00Z')])
  assert.equal(FREEVIEW_WINDOW_MS, 6 * 60 * MINUTE)
})

test('matchListing takes a listing within five minutes of the airing start and uses the title to break ties', () => {
  const listings = [
    listing({ title: 'Home and Away', start: START - 3 * MINUTE }),
    listing({ title: 'Seven News', start: START + 2 * MINUTE }),
    listing({ title: 'Seven News', start: START + 30 * MINUTE }),
  ]
  assert.equal(matchListing({ airing: { title: 'Seven News', start: START }, listings }), listings[1])
  assert.equal(matchListing({ airing: { title: 'Home and Away', start: START }, listings }), listings[0])
  assert.equal(matchListing({ airing: { title: 'Seven News', start: START + 10 * MINUTE }, listings }), null)
  assert.equal(matchListing({ airing: { title: 'Garden Academy', start: START }, listings: [listings[0]] }), null)
})

test('titlesAgree accepts the same programme under another spelling and rejects other programmes', () => {
  assert.ok(titlesAgree('pbs news hour', 'pbs newshour'))
  assert.ok(titlesAgree('beverly hills real housewives of', 'real housewives of beverly hills'))
  assert.ok(titlesAgree('bluey', 'bluey'))
  assert.ok(!titlesAgree('home shopping', 'home improvement'))
  assert.ok(!titlesAgree('blaze and monster machines', 'garden academy'))
})

test('listingImageOf prefers the show picture over https and skips an episode picture shared by other titles', () => {
  const shared = listing({ title: 'Morning Show', episode: 'placeholder.png' })
  const other = listing({ title: 'Sunrise', episode: 'placeholder.png' })
  const placeholders = placeholderImagesOf([shared, other])
  assert.equal(listingImageOf({ listing: listing({ title: 'A', show: 'show.jpg', episode: 'ep.jpg' }) }), 'https://img-store-prod.switch.tv/images/show.jpg')
  assert.equal(listingImageOf({ listing: listing({ title: 'A', episode: 'ep.jpg' }) }), 'https://img-store-prod.switch.tv/images/ep.jpg')
  assert.equal(listingImageOf({ listing: shared, placeholders }), null)
  assert.ok(isFreeviewImageSource('https://img-store-prod.switch.tv/images/show.jpg'))
  assert.ok(!isFreeviewImageSource('http://img-store-prod.switch.tv/images/show.jpg'))
})

test('matchAirings matches an airing by DVB triplet and start, reading each six-hour window once', async () => {
  const client = fakeClient(({ url }) => (url.includes('/channels/region/region_nsw_sydney')
    ? channelsBody
    : { data: [listing({ title: 'Seven News', start: START + MINUTE, show: 'news.jpg' })], meta: { pagination: { more: false } } }))
  const freeview = createFreeviewAu({ client, timeZone: () => 'Australia/Sydney' })
  const airings = [
    { key: '1', title: 'Seven News', start: START, triplets: [TRIPLET] },
    { key: '2', title: 'Seven News', start: START + 2 * MINUTE, triplets: ['ffff:ffff:ffff', TRIPLET] },
  ]
  const matches = await freeview.matchAirings(airings)
  assert.deepEqual([...matches], [['1', { episode: null, show: 'https://img-store-prod.switch.tv/images/news.jpg' }], ['2', { episode: null, show: 'https://img-store-prod.switch.tv/images/news.jpg' }]])
  const epgCalls = client.calls.filter((call) => call.url.includes('/epgs/'))
  assert.equal(epgCalls.length, 1)
  assert.equal(epgCalls[0].url, `https://fvau-api-prod.switch.tv/content/v1/epgs/${TRIPLET}`)
  assert.deepEqual([epgCalls[0].params.start, epgCalls[0].params.end], ['2026-11-10T06:00:00Z', '2026-11-10T12:00:00Z'])
})

test('a 504 window backs off: no request until the wait ends, then it asks again', async () => {
  const clock = { ms: START }
  let failing = true
  const client = fakeClient(({ url }) => {
    if (url.includes('/channels/')) return channelsBody
    if (failing) throw new OutboundError('fvau-api-prod.switch.tv HTTP 504', { code: 'unavailable', status: 504 })
    return { data: [] }
  })
  const freeview = createFreeviewAu({ client, timeZone: () => 'Australia/Sydney', now: () => clock.ms, failureBackoffMs: [15 * MINUTE, 60 * MINUTE] })
  const window = { triplet: TRIPLET, windowStart: windowStartOf(START) }
  assert.equal(await freeview.listingsFor(window), null)
  clock.ms += 10 * MINUTE
  assert.equal(await freeview.listingsFor(window), null)
  assert.equal(client.calls.length, 1)
  clock.ms += 6 * MINUTE
  assert.equal(await freeview.listingsFor(window), null)
  assert.equal(client.calls.length, 2)
  clock.ms += 30 * MINUTE
  assert.equal(await freeview.listingsFor(window), null)
  assert.equal(client.calls.length, 2)
  failing = false
  clock.ms += 31 * MINUTE
  assert.deepEqual(await freeview.listingsFor(window), [])
  assert.deepEqual(await freeview.listingsFor(window), [])
  assert.equal(client.calls.length, 3)
})

test('matchAirings gives no match while Freeview fails or backs off, or lists another title, so the guide picture stays', async () => {
  const clock = { ms: START }
  let failing = true
  const client = fakeClient(({ url }) => {
    if (url.includes('/channels/')) return channelsBody
    if (failing) throw new OutboundError('fvau-api-prod.switch.tv HTTP 504', { code: 'unavailable', status: 504 })
    return { data: [listing({ title: 'Home and Away', start: START, show: 'home.jpg' })], meta: { pagination: { more: false } } }
  })
  const freeview = createFreeviewAu({ client, timeZone: () => 'Australia/Sydney', now: () => clock.ms })
  const airings = [{ key: '1', title: 'Seven News', start: START, triplets: [TRIPLET] }]
  assert.equal((await freeview.matchAirings(airings)).size, 0)
  const asked = client.calls.length
  clock.ms += MINUTE
  assert.equal((await freeview.matchAirings(airings)).size, 0)
  assert.equal(client.calls.length, asked)
  failing = false
  clock.ms += 16 * MINUTE
  assert.equal((await freeview.matchAirings(airings)).size, 0)
  assert.ok(client.calls.length > asked)
})

test('slimListingOf keeps only the title, start, and first show and episode images, so cached windows stay small', () => {
  const full = {
    ...listing({ title: 'Gruen', show: 'show.jpg', episode: 'ep.jpg' }),
    synopsis: 'x'.repeat(5000),
    crid: 'crid://abc',
  }
  full.related.shows[0].related.synopsis = 'y'.repeat(5000)
  const slim = slimListingOf(full)
  assert.deepEqual(Object.keys(slim), ['title', 'start', 'related'])
  assert.equal(listingImageOf({ listing: slim }), 'https://img-store-prod.switch.tv/images/show.jpg')
  assert.equal(matchListing({ airing: { title: 'Gruen', start: START }, listings: [slim] }), slim)
  assert.ok(JSON.stringify(slim).length < 300)
})

test('outside Australia the Freeview step is off and makes no request', async () => {
  const client = fakeClient(() => channelsBody)
  const freeview = createFreeviewAu({ client, timeZone: () => 'Europe/London' })
  assert.equal(freeview.isOn(), false)
  assert.equal((await freeview.matchAirings([{ key: '1', title: 'News', start: START, triplets: [TRIPLET] }])).size, 0)
  assert.equal(client.calls.length, 0)
})

test('freeviewAiringsOf takes every coming airing on a channel with a triplet and fetches windows for the next two per title', () => {
  const programmes = [
    { program_id: 1, channel_id: 'ch-a', title: 'Gruen', start: START },
    { program_id: 2, channel_id: 'ch-a', title: 'Gruen', start: START + 60 * MINUTE },
    { program_id: 3, channel_id: 'ch-a', title: 'Gruen', start: START + 120 * MINUTE },
    { program_id: 4, channel_id: 'ch-b', title: 'Other', start: START },
    { program_id: 5, channel_id: 'ch-a', title: 'Gruen', start: START - 3 * 60 * MINUTE },
  ]
  const airings = freeviewAiringsOf({
    programmes,
    titleKeys: new Set(['gruen', 'other']),
    triplets: new Map([['ch-a', [TRIPLET]]]),
    nowMs: START,
  })
  assert.deepEqual(airings.map((airing) => [airing.key, airing.fetch]), [['1', true], ['2', true], ['3', false]])
  const matches = new Map([
    ['2', { episode: 'https://img-store-prod.switch.tv/images/g-ep.jpg', show: 'https://img-store-prod.switch.tv/images/g.jpg' }],
    ['3', { episode: 'https://img-store-prod.switch.tv/images/g-ep3.jpg', show: null }],
  ])
  assert.deepEqual(freeviewCandidatesOf({ airings, matches }).get('gruen').sources, ['https://img-store-prod.switch.tv/images/g.jpg'])
})

test('matchAirings matches later airings only from windows already read, so they add no request', async () => {
  const client = fakeClient(({ url }) => (url.includes('/channels/')
    ? channelsBody
    : { data: [
      listing({ title: 'Gruen', start: START, show: 'g.jpg', episode: 'g1.jpg' }),
      listing({ title: 'Gruen', start: START + 60 * MINUTE, show: 'g.jpg', episode: 'g2.jpg' }),
    ], meta: { pagination: { more: false } } }))
  const freeview = createFreeviewAu({ client, timeZone: () => 'Australia/Sydney' })
  const airings = [
    { key: 'late', title: 'Gruen', start: START + 60 * MINUTE, triplets: [TRIPLET], fetch: false },
    { key: 'far', title: 'Gruen', start: START + 3 * 24 * 60 * MINUTE, triplets: [TRIPLET], fetch: false },
    { key: 'next', title: 'Gruen', start: START, triplets: [TRIPLET], fetch: true },
  ]
  const matches = await freeview.matchAirings(airings)
  assert.deepEqual(matches.get('next'), { episode: 'https://img-store-prod.switch.tv/images/g1.jpg', show: 'https://img-store-prod.switch.tv/images/g.jpg' })
  assert.deepEqual(matches.get('late'), { episode: 'https://img-store-prod.switch.tv/images/g2.jpg', show: 'https://img-store-prod.switch.tv/images/g.jpg' })
  assert.equal(matches.has('far'), false)
  assert.equal(client.calls.filter((call) => call.url.includes('/epgs/')).length, 1)
})

test('listingImagesOf gives the episode picture and the show picture, and skips a shared episode placeholder', () => {
  const shared = listing({ title: 'B', episode: 'slate.jpg' })
  const placeholders = placeholderImagesOf([shared, listing({ title: 'C', episode: 'slate.jpg' })])
  assert.deepEqual(listingImagesOf({ listing: listing({ title: 'A', show: 'show.jpg', episode: 'ep.jpg' }) }), {
    episode: 'https://img-store-prod.switch.tv/images/ep.jpg',
    show: 'https://img-store-prod.switch.tv/images/show.jpg',
  })
  assert.deepEqual(listingImagesOf({ listing: shared, placeholders }), { episode: null, show: null })
})

const setupFixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/tvh-setup/${name}.json`, import.meta.url), 'utf8'))

test('listChannelTriplets reads the service and mux grids and maps each channel to its Freeview triplets', async () => {
  const paths = []
  const grids = { '/api/mpegts/service/grid': setupFixture('service-grid'), '/api/mpegts/mux/grid': setupFixture('mux-grid') }
  const server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://tvh')
    paths.push(pathname)
    res.writeHead(grids[pathname] ? 200 : 404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(grids[pathname] ?? {}))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const services = setupFixture('service-grid').entries
    const seven = services.find((service) => service.sid === 1312)
    const sbs = services.find((service) => service.sid === 769)
    const triplets = await listChannelTriplets({
      channels: [
        { id: 'seven', serviceIds: [seven.uuid] },
        { id: 'sbs', serviceIds: [sbs.uuid] },
        { id: 'none', serviceIds: ['missing'] },
      ],
      conn: { url: `http://127.0.0.1:${server.address().port}`, username: '', password: '' },
    })
    assert.deepEqual([...triplets], [['seven', [TRIPLET]], ['sbs', ['3202:0300:0301']], ['none', []]])
    assert.ok(paths.includes('/api/mpegts/mux/grid'))
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('seedWindow: a window read by the merged guide build answers matchAirings with no request', async () => {
  const client = fakeClient(({ url }) => (url.includes('/channels/region/') ? channelsBody : { data: [] }))
  const freeview = createFreeviewAu({ client, timeZone: () => 'Australia/Sydney', now: () => START })
  freeview.seedWindow({ triplet: TRIPLET, windowStart: windowStartOf(START), listings: [listing({ title: 'Gruen', show: 'gruen.jpg' })] })
  const matches = await freeview.matchAirings([{ key: 'a1', title: 'Gruen', start: START, triplets: [TRIPLET] }])
  assert.equal(matches.get('a1').show, 'https://img-store-prod.switch.tv/images/gruen.jpg')
  assert.equal(client.calls.filter(({ url }) => url.includes('/epgs/')).length, 0)
})
