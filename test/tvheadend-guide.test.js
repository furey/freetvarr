import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  applyGuideSetup,
  guessGuideChannel,
  linkChannelsByHand,
  matchGuideChannels,
  parseFeedChannels,
  planGuideRelinks,
  readGuideLinks,
  suggestGuide,
} from '../src/tvheadend-guide.js'

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/tvh-setup/${name}.json`, import.meta.url)))
const feedXml = readFileSync(new URL('./fixtures/tvh-setup/mjh-sydney-channels.xml', import.meta.url), 'utf8')
const CONN = { url: 'http://tvh.test:9981', username: 'freetvarr', password: 'x' }
const FEED_URL = 'https://i.mjh.nz/au/Sydney/epg.xml'

const liveGuide = () => {
  const raw = fixture('epggrab-channel-grid').entries
  return {
    raw,
    guideChannels: raw.map((g) => ({ id: g.uuid, moduleId: g.modid, xmltvId: g.id, name: g.name, channels: [] })),
    handLinks: raw.reduce((map, g) => {
      for (const c of g.channels) map.set(c, [...(map.get(c) || []), g.uuid])
      return map
    }, new Map()),
  }
}

const liveChannels = () => fixture('channel-grid').entries
  .filter((c) => c.enabled !== false)
  .map((c) => ({ id: c.uuid, name: c.name, number: Number(c.number) || null, services: c.services, guide: [] }))

const liveServiceLcns = () => new Map(fixture('service-grid').entries
  .filter((s) => s.lcn > 0)
  .map((s) => [s.uuid, s.lcn]))

test('parseFeedChannels reads ids, display names, and LCNs from the feed head', () => {
  const feed = parseFeedChannels(feedXml)
  assert.equal(feed.length, 120)
  assert.deepEqual(feed[0], { id: 'mjh-seven-syd', names: ['Seven'], lcn: 71 })
  assert.equal(parseFeedChannels('<channel id="a&amp;b"><display-name>A &amp; B</display-name></channel>')[0].names[0], 'A & B')
})

test('matchGuideChannels links by service LCN, then by name, and agrees with the author\'s hand links', () => {
  const { guideChannels, handLinks } = liveGuide()
  const { links, unmatched } = matchGuideChannels({
    channels: liveChannels(),
    guideChannels,
    feedChannels: parseFeedChannels(feedXml),
    serviceLcns: liveServiceLcns(),
  })
  const wrong = links.filter((l) => !(handLinks.get(l.channelId) || []).includes(l.guideId))
  const names = new Map(guideChannels.map((g) => [g.id, g.name]))
  assert.deepEqual(wrong.map((l) => names.get(l.guideId)), ['ABC Kids'], 'only the time-shared LCN adds a second feed')
  assert.equal(links.length, 31)
  assert.equal(links.filter((l) => l.by === 'number').length, 25)
  assert.deepEqual(unmatched.map((c) => c.name).sort(), ['10 HD +1', 'ABCTV', 'Extra', 'SBS ONE', 'SBS WorldWatch'])
})

test('matchGuideChannels falls back to names with no wrong links when no channel has a number', () => {
  const { guideChannels, handLinks } = liveGuide()
  const channels = liveChannels().map((c) => ({ ...c, number: null, services: [] }))
  const { links } = matchGuideChannels({ channels, guideChannels, feedChannels: parseFeedChannels(feedXml) })
  assert.ok(links.length >= 25)
  assert.ok(links.every((l) => l.by === 'name'))
  assert.deepEqual(links.filter((l) => !(handLinks.get(l.channelId) || []).includes(l.guideId)), [])
})

test('matchGuideChannels leaves channels that already have a guide alone', () => {
  const { guideChannels } = liveGuide()
  const channels = liveChannels()
  const linked = guideChannels.map((g, i) => (i === 0 ? { ...g, channels: channels.map((c) => c.id) } : g))
  const { links, unmatched } = matchGuideChannels({
    channels,
    guideChannels: linked,
    feedChannels: parseFeedChannels(feedXml),
    serviceLcns: liveServiceLcns(),
  })
  assert.deepEqual(links, [])
  assert.deepEqual(unmatched, [])
})

test('suggestGuide picks the feed for the time zone city and keeps a feed the user set', () => {
  const inspection = { module: { enabled: false, url: '' }, channels: [{}, {}], linked: 0 }
  assert.equal(suggestGuide({ inspection, timeZone: 'Australia/Sydney' }).url, FEED_URL)
  assert.equal(suggestGuide({ inspection, timeZone: 'Australia/Broken_Hill' }).url, '')
  assert.equal(suggestGuide({ inspection, timeZone: 'Pacific/Auckland' }).url, 'https://i.mjh.nz/nz/epg.xml')
  assert.equal(suggestGuide({ inspection, timeZone: 'Europe/London' }).feeds.length, 0)
  const custom = { module: { enabled: true, url: 'http://example.test/guide.xml' }, channels: [{}], linked: 1 }
  const kept = suggestGuide({ inspection: custom, timeZone: 'Australia/Sydney' })
  assert.equal(kept.url, 'http://example.test/guide.xml')
  assert.equal(kept.state, 'has-guide')
})

const fakeTvheadend = ({
  grabber = { enabled: false, args: '' },
  periodicSave = 0,
  saveAfterImport = false,
  loadAfter = 1,
  extraChannels = [],
}) => {
  const writes = []
  let gridReads = 0
  const moduleId = 'mod-url'
  const feedEntries = [
    { uuid: 'g-seven', modid: '/usr/bin/tv_grab_url', id: 'mjh-seven-syd', name: 'Seven', channels: [] },
    { uuid: 'g-abc', modid: '/usr/bin/tv_grab_url', id: 'mjh-abc-syd', name: 'ABC TV', channels: [] },
  ]
  const reads = {
    'epggrab/module/list': () => ({ entries: [{ uuid: moduleId, title: 'Internal: XMLTV: XMLTV URL grabber' }] }),
    'idnode/load': () => ({
      entries: [{
        params: [
          { id: 'enabled', value: grabber.enabled },
          { id: 'args', value: grabber.args },
          { id: 'path', value: '/usr/bin/tv_grab_url' },
        ],
      }],
    }),
    'epggrab/config/load': () => ({
      entries: [{ params: [{ id: 'epgdb_periodicsave', value: periodicSave }, { id: 'epgdb_saveafterimport', value: saveAfterImport }] }],
    }),
    'epggrab/channel/grid': () => ({ entries: gridReads++ >= loadAfter ? feedEntries : [] }),
    'channel/grid': () => ({
      entries: [
        { uuid: 'c7', name: '7 Sydney', number: 7, services: ['s7'] },
        { uuid: 'cabc', name: 'ABC TV', number: 2, services: ['s2'] },
        { uuid: 'cx', name: 'Shopping', number: 99, services: [] },
        ...extraChannels,
      ],
    }),
    'mpegts/service/grid': () => ({ entries: [{ uuid: 's7', lcn: 71 }, { uuid: 's2', lcn: 21 }] }),
  }
  return {
    writes,
    get: async (path) => reads[path](),
    post: async (path, form) => {
      writes.push({ path, form })
      return {}
    },
  }
}

const feed = async () => [
  { id: 'mjh-seven-syd', names: ['Seven'], lcn: 71 },
  { id: 'mjh-abc-syd', names: ['ABC TV'], lcn: 21 },
]

const clock = () => {
  let t = 0
  return { now: () => (t += 1000) }
}

test('applyGuideSetup turns on the feed, keeps the guide saved, waits for it, and links by number', async () => {
  const http = fakeTvheadend({})
  const result = await applyGuideSetup({ http, conn: CONN, url: FEED_URL, fetchFeed: feed, pollMs: 0, ...clock() })
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(result.linked, 2)
  assert.equal(result.total, 3)
  assert.deepEqual(result.unmatched, [{ id: 'cx', name: 'Shopping', number: 99, guess: null }])
  assert.deepEqual(result.options.map((o) => o.name), ['ABC TV', 'Seven'])
  const [grabber, config, rerun, ...rest] = http.writes
  const links = rest.slice(0, -1)
  assert.deepEqual(JSON.parse(grabber.form.node), { uuid: 'mod-url', enabled: true, args: FEED_URL, priority: 3 })
  assert.deepEqual(JSON.parse(config.form.node), { epgdb_periodicsave: 1, epgdb_saveafterimport: true })
  assert.equal(rerun.path, 'epggrab/internal/rerun')
  assert.equal(rest.at(-1).path, 'epggrab/internal/rerun')
  assert.deepEqual(links.map((l) => JSON.parse(l.form.node)).sort((a, b) => a.uuid.localeCompare(b.uuid)), [
    { uuid: 'g-abc', channels: ['cabc'] },
    { uuid: 'g-seven', channels: ['c7'] },
  ])
})

test('applyGuideSetup pre-selects the guide of a simulcast and leaves a timeshift channel without one', async () => {
  const http = fakeTvheadend({
    extraChannels: [
      { uuid: 'c70', name: '7 Sydney', number: 70, services: [] },
      { uuid: 'c14', name: '10 HD +1', number: 14, services: [] },
    ],
  })
  const result = await applyGuideSetup({ http, conn: CONN, url: FEED_URL, fetchFeed: feed, pollMs: 0, ...clock() })
  assert.deepEqual(result.unmatched.map(({ id, guess }) => [id, guess]), [
    ['cx', null],
    ['c70', 'g-seven'],
    ['c14', null],
  ])
})

test('applyGuideSetup leaves a running feed and the user\'s save settings alone', async () => {
  const http = fakeTvheadend({ grabber: { enabled: true, args: FEED_URL }, periodicSave: 6, saveAfterImport: true })
  const result = await applyGuideSetup({ http, conn: CONN, url: FEED_URL, fetchFeed: feed, pollMs: 0, ...clock() })
  assert.equal(result.ok, true)
  assert.deepEqual(http.writes.map((w) => w.path), [
    'epggrab/internal/rerun',
    'idnode/save',
    'idnode/save',
    'epggrab/internal/rerun',
  ])
})

test('applyGuideSetup stops before any write when the feed cannot be downloaded', async () => {
  const http = fakeTvheadend({})
  const result = await applyGuideSetup({
    http, conn: CONN, url: FEED_URL, fetchFeed: async () => { throw new Error('ENOTFOUND') },
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'feed-unreachable')
  assert.deepEqual(http.writes, [])
})

test('applyGuideSetup reports a guide that never loads', async () => {
  const http = fakeTvheadend({ loadAfter: Infinity })
  const result = await applyGuideSetup({
    http, conn: CONN, url: FEED_URL, fetchFeed: feed, pollMs: 0, limitMs: 5000, ...clock(),
  })
  assert.equal(result.code, 'download-timeout')
  assert.equal(result.failedStep, 'download')
})

const guessFor = (name, guideNames) => guessGuideChannel({
  channel: { name },
  candidates: guideNames.map((n, i) => ({ id: `g${i}`, name: n, feed: null })),
})

test('guessGuideChannel matches a name after normalising case, spaces, punctuation, HD, and region', () => {
  assert.equal(guessFor('ABCTV', ['SBS', 'ABC TV']), 'g1')
  assert.equal(guessFor('Nine HD', ['Nine']), 'g0')
  assert.equal(guessFor('7mate', ['7Mate Sydney']), 'g0')
  assert.equal(guessFor('SBS-One', ['SBS One']), 'g0')
})

test('guessGuideChannel matches the tuner name SBS ONE to the guide name SBS', () => {
  assert.equal(guessFor('SBS ONE', ['SBS', 'SBS2', 'SBS Food']), 'g0')
  assert.equal(guessFor('SBS ONE', ['SBS One', 'SBS']), 'g0')
})

test('guessGuideChannel never guesses a timeshift channel', () => {
  assert.equal(guessFor('10 HD +1', ['10 HD +1', '10']), null)
  assert.equal(guessFor('Nine +2', ['Nine']), null)
})

test('guessGuideChannel skips a name that matches no guide channel or several', () => {
  assert.equal(guessFor('Extra', ['SBS', 'ABC TV']), null)
  assert.equal(guessFor('ABC', ['ABC Sydney', 'ABC Melbourne']), null)
})

const SYDNEY_FEED = [
  'Seven', '7two', '7mate', '7flix', '7Bravo', 'Channel 9', '9Gem', '9Go!', '9Life', '9Rush',
  '10', '10 Drama', '10 Comedy', 'ABC TV', 'ABC Kids/ABC Family', 'ABC Entertains', 'ABC NEWS',
  'SBS', 'SBS2', 'SBS Food', 'SBS World Movies',
]

const sydneyGuess = (name, linked = []) => guessGuideChannel({
  channel: { name },
  candidates: SYDNEY_FEED.map((n) => ({ id: n, name: n, feed: null })),
  linked,
})

test('guessGuideChannel picks the network\'s main feed channel for a big five simulcast', () => {
  assert.equal(sydneyGuess('7 Sydney'), 'Seven')
  assert.equal(sydneyGuess('7 HD Sydney'), 'Seven')
  assert.equal(sydneyGuess('Nine HD'), 'Channel 9')
  assert.equal(sydneyGuess('9 Sydney'), 'Channel 9')
  assert.equal(sydneyGuess('TEN HD'), '10')
  assert.equal(sydneyGuess('10 HD'), '10')
  assert.equal(sydneyGuess('ABCTV'), 'ABC TV')
  assert.equal(sydneyGuess('ABC HD'), 'ABC TV')
  assert.equal(sydneyGuess('SBS ONE'), 'SBS')
  assert.equal(sydneyGuess('SBS HD'), 'SBS')
})

test('guessGuideChannel keeps each multichannel on its own feed channel', () => {
  assert.equal(sydneyGuess('7two'), '7two')
  assert.equal(sydneyGuess('7mate HD'), '7mate')
  assert.equal(sydneyGuess('7flix Sydney'), '7flix')
  assert.equal(sydneyGuess('9Gem HD'), '9Gem')
  assert.equal(sydneyGuess('9Go!'), '9Go!')
  assert.equal(sydneyGuess('10 Drama'), '10 Drama')
  assert.equal(sydneyGuess('ABC NEWS'), 'ABC NEWS')
  assert.equal(sydneyGuess('SBS Food'), 'SBS Food')
})

test('guessGuideChannel gives no guide to a channel the feed does not carry', () => {
  assert.equal(sydneyGuess('Extra'), null)
  assert.equal(sydneyGuess('10 HD +1'), null)
  assert.equal(sydneyGuess('7 Sydney +1', [{ name: '7 Sydney', guideId: 'Seven' }]), null)
  assert.equal(sydneyGuess('7plus'), null)
})

test('guessGuideChannel gives a channel the guide of a linked channel with the same name', () => {
  const candidates = [{ id: 'g-seven', name: 'Seven', feed: null }, { id: 'g-7two', name: '7two', feed: null }]
  const guess = (name, linked) => guessGuideChannel({ channel: { name }, candidates, linked })
  assert.equal(guess('Prime7 Sydney', [{ name: 'Prime7', guideId: 'g-seven' }]), 'g-seven')
  assert.equal(guess('Prime7', [{ name: 'Prime7 HD', guideId: 'g-seven' }, { name: 'Prime 7', guideId: 'g-7two' }]), null)
  assert.equal(guess('Prime7', [{ name: 'Prime7 Two', guideId: 'g-7two' }]), null)
})

test('guessGuideChannel matches the network name in either form', () => {
  assert.equal(guessFor('Seven', ['7 Sydney']), 'g0')
  assert.equal(guessFor('Channel 9', ['Nine']), 'g0')
  assert.equal(guessFor('10', ['TEN']), 'g0')
  assert.equal(guessFor('7 Sydney', ['Seven Sydney', 'Seven Melbourne']), null)
})

const SBS_ONE = 'e52f8028f3bbf341a4f0569d3048c652'
const SBS_ONE_HD = 'd99743202e23fc6b31e6178a6b4f6660'
const SBS_FOOD_TUNER = 'f0fea174eab751be6f9ed01979f532ee'
const GUIDE_SBS = '372852f9071bc5e13cca726b90ac1e83'
const GUIDE_SBS_FOOD = '8227ec4eaed70a97feb2aef3065116ae'

const linkedGuide = () => fixture('epggrab-channel-grid').entries
  .map((g) => ({ id: g.uuid, moduleId: g.modid, xmltvId: g.id, name: g.name, channels: g.channels }))

const relink = (links, guideChannels = linkedGuide()) => planGuideRelinks({ guideChannels, links })

test('planGuideRelinks moves a channel from one guide channel to another', () => {
  assert.deepEqual(relink([{ channelId: SBS_ONE, guideId: GUIDE_SBS_FOOD }]), [
    { guideId: GUIDE_SBS, channels: [SBS_ONE_HD] },
    { guideId: GUIDE_SBS_FOOD, channels: [SBS_FOOD_TUNER, SBS_ONE] },
  ])
})

test('planGuideRelinks removes the link for No guide', () => {
  assert.deepEqual(relink([{ channelId: SBS_ONE, guideId: '' }]), [{ guideId: GUIDE_SBS, channels: [SBS_ONE_HD] }])
})

test('planGuideRelinks saves nothing when the pick is the current link', () => {
  assert.deepEqual(relink([{ channelId: SBS_ONE, guideId: GUIDE_SBS }]), [])
})

test('planGuideRelinks lets an SD and HD pair share one guide channel', () => {
  const saves = relink([
    { channelId: SBS_ONE, guideId: GUIDE_SBS_FOOD },
    { channelId: SBS_ONE_HD, guideId: GUIDE_SBS_FOOD },
  ])
  assert.deepEqual(saves, [
    { guideId: GUIDE_SBS, channels: [] },
    { guideId: GUIDE_SBS_FOOD, channels: [SBS_FOOD_TUNER, SBS_ONE, SBS_ONE_HD] },
  ])
})

test('planGuideRelinks collapses a channel linked to two guide channels to the one picked', () => {
  const guideChannels = linkedGuide()
    .map((g) => (g.id === GUIDE_SBS_FOOD ? { ...g, channels: [...g.channels, SBS_ONE] } : g))
  assert.deepEqual(relink([{ channelId: SBS_ONE, guideId: GUIDE_SBS }], guideChannels), [
    { guideId: GUIDE_SBS_FOOD, channels: [SBS_FOOD_TUNER] },
  ])
})

const fixtureTvheadend = () => {
  const writes = []
  const reads = {
    'epggrab/module/list': () => fixture('epggrab-module-list'),
    'idnode/load': () => fixture('epggrab-url-module'),
    'epggrab/channel/grid': () => fixture('epggrab-channel-grid'),
    'channel/grid': () => fixture('channel-grid'),
  }
  return {
    writes,
    get: async (path) => reads[path](),
    post: async (path, form) => {
      writes.push({ path, form })
      return {}
    },
  }
}

test('readGuideLinks lists every enabled channel with its guide links and the guide options', async () => {
  const links = await readGuideLinks({ http: fixtureTvheadend(), conn: CONN })
  assert.equal(links.channels.length, 35)
  assert.deepEqual(links.channels.find((c) => c.id === SBS_ONE), {
    id: SBS_ONE,
    name: 'SBS ONE',
    number: 3,
    guideIds: [GUIDE_SBS],
  })
  assert.deepEqual(links.channels.find((c) => c.name === 'Extra').guideIds, [])
  assert.equal(links.options.length, 175)
  assert.deepEqual(Object.keys(links.options[0]), ['id', 'name'])
  assert.ok(links.options.every((o, i) => i === 0 || links.options[i - 1].name.localeCompare(o.name) <= 0))
})

test('linkChannelsByHand replaces a link, then re-runs the guide grabber', async () => {
  const http = fixtureTvheadend()
  const result = await linkChannelsByHand({
    http,
    conn: CONN,
    links: [{ channelId: SBS_ONE, guideId: GUIDE_SBS_FOOD }],
  })
  assert.deepEqual(result, { linked: 1, saved: 2 })
  assert.deepEqual(http.writes.map((w) => w.path), ['idnode/save', 'idnode/save', 'epggrab/internal/rerun'])
  assert.deepEqual(JSON.parse(http.writes[0].form.node), { uuid: GUIDE_SBS, channels: [SBS_ONE_HD] })
})

test('linkChannelsByHand skips unknown channels and guide channels, and writes nothing unchanged', async () => {
  const http = fixtureTvheadend()
  const result = await linkChannelsByHand({
    http,
    conn: CONN,
    links: [
      { channelId: SBS_ONE, guideId: GUIDE_SBS },
      { channelId: 'nope', guideId: GUIDE_SBS },
      { channelId: SBS_ONE_HD, guideId: 'unknown-guide' },
    ],
  })
  assert.deepEqual(result, { linked: 1, saved: 0 })
  assert.deepEqual(http.writes, [])
})
