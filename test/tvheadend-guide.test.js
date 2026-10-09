import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import http from 'node:http'

import {
  applyGuideSetup,
  countUpcomingProgrammes,
  createProgrammeCounter,
  fetchProgrammeCounts,
  guessGuideChannel,
  linkChannelsByHand,
  matchGuideChannels,
  parseFeedChannels,
  parseXmltvTime,
  planGuideRelinks,
  findTimeshifts,
  readGuideLinks,
  suggestGuide,
  waitForNewListings,
} from '../src/tvheadend-guide.js'

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/tvh-setup/${name}.json`, import.meta.url)))
const feedXml = readFileSync(new URL('./fixtures/tvh-setup/mjh-sydney-channels.xml', import.meta.url), 'utf8')
const CONN = { url: 'http://tvh.test:9981', username: 'freetvarr', password: 'x' }
const FEED_URL = 'https://i.mjh.nz/au/Sydney/epg.xml'
const ABC_KIDS_FAMILY = 'f95a5b6372bfd2e4baa91e24bdba4290'

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

test('matchGuideChannels links by service LCN, then by name, and links both feeds of a time-shared LCN', () => {
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
  const timeShared = links.filter((l) => l.channelId === ABC_KIDS_FAMILY).map((l) => names.get(l.guideId))
  assert.deepEqual(timeShared.sort(), ['ABC Family', 'ABC Kids'])
  assert.equal(links.length, 31)
  assert.equal(links.filter((l) => l.by === 'number').length, 25)
  assert.deepEqual(unmatched.map((c) => c.name).sort(), ['10 HD +1', 'ABCTV', 'Extra', 'SBS ONE', 'SBS WorldWatch'])
})

test('matchGuideChannels adds the missing feed of a time-shared LCN and keeps other existing links', () => {
  const { guideChannels } = liveGuide()
  const names = new Map(guideChannels.map((g) => [g.id, g.name]))
  const idOf = (name) => guideChannels.find((g) => g.name === name).id
  const matchWith = (linkedNames) => matchGuideChannels({
    channels: liveChannels().filter((c) => c.id === ABC_KIDS_FAMILY).map((c) => ({ ...c, guide: linkedNames.map(idOf) })),
    guideChannels,
    feedChannels: parseFeedChannels(feedXml),
    serviceLcns: liveServiceLcns(),
  }).links.map((l) => names.get(l.guideId))
  assert.deepEqual(matchWith(['ABC Family']), ['ABC Kids'])
  assert.deepEqual(matchWith(['ABC Family', 'ABC Kids']), [])
  assert.deepEqual(matchWith(['ABC TV']), [], 'a hand-picked guide stays the only link')
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
  extraGuideChannels = [],
}) => {
  const writes = []
  let gridReads = 0
  const moduleId = 'mod-url'
  const feedEntries = [
    { uuid: 'g-seven', modid: '/usr/bin/tv_grab_url', id: 'mjh-seven-syd', name: 'Seven', channels: [] },
    { uuid: 'g-abc', modid: '/usr/bin/tv_grab_url', id: 'mjh-abc-syd', name: 'ABC TV', channels: [] },
    ...extraGuideChannels,
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

const noCounts = async () => null

test('applyGuideSetup turns on the feed, keeps the guide saved, waits for it, and links by number', async () => {
  const http = fakeTvheadend({})
  const result = await applyGuideSetup({ http, conn: CONN, url: FEED_URL, fetchFeed: feed, countProgrammes: noCounts, pollMs: 0, ...clock() })
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
  const result = await applyGuideSetup({ http, conn: CONN, url: FEED_URL, fetchFeed: feed, countProgrammes: noCounts, pollMs: 0, ...clock() })
  assert.deepEqual(result.unmatched.map(({ id, guess }) => [id, guess]), [
    ['cx', null],
    ['c70', 'g-seven'],
    ['c14', null],
  ])
})

test('applyGuideSetup leaves a running feed and the user\'s save settings alone', async () => {
  const http = fakeTvheadend({ grabber: { enabled: true, args: FEED_URL }, periodicSave: 6, saveAfterImport: true })
  const result = await applyGuideSetup({ http, conn: CONN, url: FEED_URL, fetchFeed: feed, countProgrammes: noCounts, pollMs: 0, ...clock() })
  assert.equal(result.ok, true)
  assert.deepEqual(http.writes.map((w) => w.path), [
    'epggrab/internal/rerun',
    'idnode/save',
    'idnode/save',
    'epggrab/internal/rerun',
  ])
})

test('applyGuideSetup marks guide channels with no shows and lists them last', async () => {
  const http = fakeTvheadend({})
  const countProgrammes = async () => new Map([['mjh-abc-syd', 12]])
  const result = await applyGuideSetup({
    http, conn: CONN, url: FEED_URL, fetchFeed: feed, countProgrammes, pollMs: 0, ...clock(),
  })
  assert.deepEqual(result.options.map((o) => [o.name, Boolean(o.empty)]), [['ABC TV', false], ['Seven', true]])
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
    http, conn: CONN, url: FEED_URL, fetchFeed: feed, pollMs: 0, limitMs: 5000, countProgrammes: noCounts, ...clock(),
  })
  assert.equal(result.code, 'download-timeout')
  assert.equal(result.failedStep, 'download')
})

const SHIFTED_FEED_URL = 'http://127.0.0.1:3733/guide/xmltv.xml'

const tenFeed = async () => [...await feed(), { id: 'mjh-10-syd', names: ['10'], lcn: 10 }]

const withTenPlusOne = () => fakeTvheadend({
  extraChannels: [
    { uuid: 'c10', name: '10 HD', number: 10, services: [] },
    { uuid: 'c14', name: '10 HD +1', number: 14, services: [] },
  ],
  extraGuideChannels: [
    { uuid: 'g-ten', modid: '/usr/bin/tv_grab_url', id: 'mjh-10-syd', name: '10', channels: [] },
    { uuid: 'g-ten-plus1', modid: '/usr/bin/tv_grab_url', id: 'mjh-10-syd.plus1', name: '10 HD +1', channels: [] },
  ],
})

const shiftedFeedReached = (reached) => {
  const sources = []
  return {
    sources,
    url: SHIFTED_FEED_URL,
    useSource: async (url) => { sources.push(url) },
    waitForRequest: async () => reached,
  }
}

const grabberArgs = (writes) => writes
  .filter((w) => w.path === 'idnode/save' && JSON.parse(w.form.node).uuid === 'mod-url')
  .map((w) => JSON.parse(w.form.node).args)

test('applyGuideSetup points TVHeadend at the shifted feed and links a +1 channel to its own listings', async () => {
  const http = withTenPlusOne()
  const shiftedFeed = shiftedFeedReached(true)
  const counted = []
  const result = await applyGuideSetup({
    http,
    conn: CONN,
    url: FEED_URL,
    fetchFeed: tenFeed,
    countProgrammes: async (url) => { counted.push(url); return null },
    shiftedFeed,
    pollMs: 0,
    ...clock(),
  })
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(result.grabberUrl, SHIFTED_FEED_URL)
  assert.deepEqual(shiftedFeed.sources, [FEED_URL])
  assert.deepEqual(grabberArgs(http.writes), [SHIFTED_FEED_URL])
  assert.deepEqual(counted, [SHIFTED_FEED_URL])
  assert.deepEqual(result.unmatched.map((c) => c.id), ['cx'])
  const tenPlusOne = http.writes.find((w) => w.form.node && JSON.parse(w.form.node).uuid === 'g-ten-plus1')
  assert.deepEqual(JSON.parse(tenPlusOne.form.node).channels, ['c14'])
})

test('applyGuideSetup goes back to the guide address when TVHeadend never asks for the shifted feed', async () => {
  const http = withTenPlusOne()
  const result = await applyGuideSetup({
    http,
    conn: CONN,
    url: FEED_URL,
    fetchFeed: tenFeed,
    countProgrammes: noCounts,
    shiftedFeed: shiftedFeedReached(false),
    pollMs: 0,
    ...clock(),
  })
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(result.grabberUrl, FEED_URL)
  assert.deepEqual(grabberArgs(http.writes), [SHIFTED_FEED_URL, FEED_URL])
  assert.deepEqual(result.unmatched.map((c) => [c.id, c.guess]), [['cx', null], ['c14', null]])
})

test('applyGuideSetup uses the guide address directly when no channel is a +1 channel', async () => {
  const http = fakeTvheadend({})
  const shiftedFeed = shiftedFeedReached(true)
  const result = await applyGuideSetup({
    http, conn: CONN, url: FEED_URL, fetchFeed: feed, countProgrammes: noCounts, shiftedFeed, pollMs: 0, ...clock(),
  })
  assert.equal(result.grabberUrl, FEED_URL)
  assert.deepEqual(shiftedFeed.sources, [])
  assert.deepEqual(grabberArgs(http.writes), [FEED_URL])
})

test('findTimeshifts gives 10 HD +1 the listings of 10, one hour later', () => {
  const shifts = findTimeshifts({
    channels: liveChannels(),
    guideChannels: linkedGuide(),
    feedChannels: parseFeedChannels(feedXml),
  })
  assert.deepEqual(shifts, [{ id: 'mjh-10-nsw.plus1', baseId: 'mjh-10-nsw', hours: 1, names: ['10 HD +1'], lcn: 14 }])
})

test('findTimeshifts reads the hours from the name and uses the guide of a linked channel with the same name', () => {
  const shifts = findTimeshifts({
    channels: [
      { id: 'c9', name: 'Nine HD', number: 9, guide: [] },
      { id: 'c92', name: 'Nine HD +2', number: 92, guide: [] },
    ],
    guideChannels: [{ id: 'g-wide-bay', xmltvId: 'mjh-nine-wide-bay', name: 'Channel 9', channels: ['c9'] }],
    feedChannels: [
      { id: 'mjh-nine-wide-bay', names: ['Channel 9'], lcn: 91 },
      { id: 'mjh-nine-mackay', names: ['Channel 9'], lcn: 81 },
    ],
  })
  assert.deepEqual(shifts.map(({ baseId, hours, lcn }) => [baseId, hours, lcn]), [['mjh-nine-wide-bay', 2, 92]])
})

test('findTimeshifts leaves a +1 channel the feed already carries', () => {
  const channels = [{ id: 'c14', name: '10 HD +1', number: 14, guide: [] }]
  const tenFeedChannel = { id: 'mjh-10', names: ['10'], lcn: 10 }
  const byNumber = [tenFeedChannel, { id: 'mjh-10-plus', names: ['10 Plus One'], lcn: 14 }]
  const byName = [tenFeedChannel, { id: 'mjh-10-plus', names: ['10 +1'], lcn: null }]
  assert.deepEqual(findTimeshifts({ channels, guideChannels: [], feedChannels: byNumber }), [])
  assert.deepEqual(findTimeshifts({ channels, guideChannels: [], feedChannels: byName }), [])
  assert.equal(findTimeshifts({ channels, guideChannels: [], feedChannels: [tenFeedChannel] }).length, 1)
})

test('findTimeshifts puts two +1 channels of one network on one shifted guide channel', () => {
  const shifts = findTimeshifts({
    channels: [
      { id: 'c14', name: '10 HD +1', number: 14, guide: [] },
      { id: 'c15', name: '10 +1', number: 15, guide: [] },
    ],
    guideChannels: [],
    feedChannels: [{ id: 'mjh-10', names: ['10'], lcn: 10 }],
  })
  assert.deepEqual(shifts, [{ id: 'mjh-10.plus1', baseId: 'mjh-10', hours: 1, names: ['10 HD +1', '10 +1'], lcn: 14 }])
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
  const links = await readGuideLinks({ http: fixtureTvheadend(), conn: CONN, countProgrammes: async () => null })
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

test('readGuideLinks lists both guide channels of a time-shared channel', async () => {
  const http = fixtureTvheadend()
  const grid = fixture('epggrab-channel-grid')
  const kids = grid.entries.find((g) => g.name === 'ABC Kids')
  kids.channels = [...kids.channels, ABC_KIDS_FAMILY]
  http.get = async (path) => (path === 'epggrab/channel/grid' ? grid : fixtureTvheadend().get(path))
  const links = await readGuideLinks({ http, conn: CONN, countProgrammes: async () => null })
  const names = new Map(links.options.map((o) => [o.id, o.name]))
  const { guideIds } = links.channels.find((c) => c.id === ABC_KIDS_FAMILY)
  assert.deepEqual(guideIds.map((id) => names.get(id)), ['ABC Family', 'ABC Kids'])
})

test('linkChannelsByHand replaces a link, then re-runs the guide grabber', async () => {
  const http = fixtureTvheadend()
  const result = await linkChannelsByHand({
    http,
    conn: CONN,
    links: [{ channelId: SBS_ONE, guideId: GUIDE_SBS_FOOD }],
  })
  assert.deepEqual(result, { linked: 1, saved: 2, loading: [SBS_ONE] })
  assert.deepEqual(http.writes.map((w) => w.path), ['idnode/save', 'idnode/save', 'idnode/save', 'epggrab/internal/rerun'])
  assert.deepEqual(JSON.parse(http.writes[0].form.node), { uuid: GUIDE_SBS, channels: [SBS_ONE_HD] })
  assert.deepEqual(JSON.parse(http.writes[2].form.node), { uuid: SBS_ONE, epgauto: false, epg_parent: 'none' })
})

test('linkChannelsByHand drops the old listings for No listings and waits for nothing new', async () => {
  const http = fixtureTvheadend()
  const result = await linkChannelsByHand({ http, conn: CONN, links: [{ channelId: SBS_ONE, guideId: '' }] })
  assert.deepEqual(result, { linked: 0, saved: 1, loading: [] })
  assert.deepEqual(http.writes.map((w) => JSON.parse(w.form.node ?? '{}').uuid ?? w.path), [
    GUIDE_SBS,
    SBS_ONE,
    'epggrab/internal/rerun',
  ])
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
  assert.deepEqual(result, { linked: 1, saved: 0, loading: [] })
  assert.deepEqual(http.writes, [])
})

const twinTens = () => {
  const writes = []
  const sd = { uuid: 'ten-sd', name: '10', number: 1, services: [] }
  const hd = { uuid: 'ten-hd', name: '10', number: 10, services: [] }
  const reads = {
    'epggrab/module/list': () => ({ entries: [{ uuid: 'mod-url', title: 'Internal: XMLTV: XMLTV URL grabber' }] }),
    'idnode/load': () => ({ entries: [{ params: [{ id: 'enabled', value: true }, { id: 'path', value: 'url' }, { id: 'args', value: 'http://feed.test/epg.xml' }] }] }),
    'epggrab/channel/grid': () => ({
      entries: [
        { uuid: 'g-ten', modid: 'url', id: 'mjh-10', name: '10', channels: ['ten-sd', 'ten-hd'] },
        { uuid: 'g-news', modid: 'url', id: 'mjh-abc-news', name: 'ABC NEWS', channels: [] },
      ],
    }),
    'channel/grid': () => ({ entries: [sd, hd] }),
  }
  return {
    writes,
    get: async (path) => reads[path](),
    post: async (path, form) => {
      writes.push({ path, node: form.node ? JSON.parse(form.node) : null })
      return {}
    },
  }
}

test('linkChannelsByHand moves only the picked one of two channels with the same name', async () => {
  const http = twinTens()
  const result = await linkChannelsByHand({ http, conn: CONN, links: [{ channelId: 'ten-hd', guideId: 'g-news' }] })
  assert.deepEqual(result.loading, ['ten-hd'])
  assert.deepEqual(http.writes.map((w) => w.node), [
    { uuid: 'g-ten', channels: ['ten-sd'] },
    { uuid: 'g-news', channels: ['ten-hd'] },
    { uuid: 'ten-hd', epgauto: false, epg_parent: 'none' },
    null,
  ])
})

test('readGuideLinks marks guide channels with no upcoming shows and lists them last', async () => {
  const counts = new Map([['mjh-10', 40]])
  const links = await readGuideLinks({ http: twinTens(), conn: CONN, countProgrammes: async () => counts })
  assert.deepEqual(links.options, [
    { id: 'g-ten', name: '10' },
    { id: 'g-news', name: 'ABC NEWS', empty: true },
  ])
})

test('readGuideLinks offers every guide channel when the feed cannot be counted', async () => {
  const links = await readGuideLinks({
    http: twinTens(),
    conn: CONN,
    countProgrammes: async () => { throw new Error('offline') },
  })
  assert.ok(links.options.every((o) => !o.empty))
})

const NOW = Date.UTC(2026, 9, 9, 1, 0)

const programme = ({ channel, stop }) =>
  `<programme start="20261009000000 +0000" stop="${stop}" channel="${channel}"><title>x</title></programme>\n`

test('countUpcomingProgrammes counts each guide channel\'s shows that have not ended', () => {
  const xml = [
    programme({ channel: 'mjh-10', stop: '20261009120000 +1100' }),
    programme({ channel: 'mjh-10', stop: '20261009130000 +1100' }),
    programme({ channel: 'mjh-old', stop: '20261009110000 +1100' }),
    programme({ channel: 'a/b', stop: '20261010000000 +0000' }),
  ].join('')
  assert.deepEqual([...countUpcomingProgrammes({ xml, nowMs: NOW })], [['mjh-10', 1], ['a#b', 1]])
})

test('parseXmltvTime reads the offset, and reads a time with no offset as UTC', () => {
  assert.equal(parseXmltvTime('20261009120000 +1100'), NOW)
  assert.equal(parseXmltvTime('20261009010000'), NOW)
  assert.equal(parseXmltvTime('20261008200000 -0500'), NOW)
  assert.equal(parseXmltvTime(''), null)
})

test('fetchProgrammeCounts counts a feed that arrives in small pieces', async () => {
  const body = `<tv><channel id="mjh-10"><display-name>10</display-name></channel>\n${
    Array.from({ length: 50 }, () => programme({ channel: 'mjh-10', stop: '20261010000000 +0000' })).join('')
  }</tv>`
  const server = await serve(body)
  try {
    const counts = await fetchProgrammeCounts(`http://127.0.0.1:${server.port}/epg.xml`, { nowMs: NOW })
    assert.equal(counts.get('mjh-10'), 50)
  } finally {
    server.close()
  }
})

test('createProgrammeCounter downloads once per address and gives up waiting without losing the count', async () => {
  let finish
  let downloads = 0
  const counter = createProgrammeCounter({
    count: () => {
      downloads += 1
      return new Promise((resolve) => { finish = resolve })
    },
    waitMs: 5,
  })
  assert.equal(await counter('u'), null)
  finish(new Map([['a', 1]]))
  assert.deepEqual([...await counter('u')], [['a', 1]])
  assert.equal(downloads, 1)
})

const eventCounts = (sequence) => {
  let read = 0
  return {
    get: async (path, params) => {
      assert.equal(path, 'epg/events/grid')
      return { totalCount: sequence[Math.min(read++, sequence.length - 1)][params.channel] }
    },
  }
}

test('waitForNewListings waits until the new listings stop growing', async () => {
  const http = eventCounts([{ c: 0 }, { c: 120 }, { c: 170 }, { c: 170 }])
  assert.equal(await waitForNewListings({ http, conn: CONN, channelIds: ['c'], pollMs: 0 }), true)
})

test('waitForNewListings gives up when nothing arrives in time', async () => {
  let t = 0
  const http = eventCounts([{ c: 0 }])
  const arrived = await waitForNewListings({ http, conn: CONN, channelIds: ['c'], pollMs: 0, limitMs: 3000, now: () => (t += 1000) })
  assert.equal(arrived, false)
})

const serve = (body) => new Promise((resolve) => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/xml' })
    const pieces = body.match(/[\s\S]{1,37}/g)
    const next = () => {
      if (!pieces.length) return res.end()
      res.write(pieces.shift())
      setImmediate(next)
    }
    next()
  })
  server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, close: () => server.close() }))
})
