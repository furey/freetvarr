import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import zlib from 'node:zlib'

import knexFactory from 'knex'

import { up } from '../migrations/0047_title_aliases.js'
import {
  MERGED_GUIDE_FILE,
  buildMergedGuide,
  createGuideMerge,
  episodeNumsOf,
  mapChannels,
  mergeChannelProgrammes,
  planSources,
  writeMergedGuide,
} from '../src/guide-merge.js'
import { serviceKeyOf } from '../src/tvheadend.js'
import { createMjhAu } from '../src/guide-sources/mjh-au.js'
import { parseProgrammeElement } from '../src/guide-sources/xmltv.js'
import { VARIANT_CANDIDATE, createTitleAliases } from '../src/title-aliases.js'
import { parseFeedChannels } from '../src/tvheadend-guide.js'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const NOW = Date.parse('2026-11-10T00:00:00Z')

const cleanups = []
after(() => Promise.all(cleanups.map((cleanup) => cleanup())))

const tempDir = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-guide-merge-'))
  cleanups.push(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))
  return dir
}

const memoryAliases = async () => {
  const database = knexFactory({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true })
  await up(database)
  cleanups.push(() => database.destroy())
  return { database, aliases: createTitleAliases({ database, now: () => NOW }) }
}

const slot = ({ title, at, minutes = 60, ...fields }) => ({
  title,
  start: NOW + at * MINUTE,
  stop: NOW + (at + minutes) * MINUTE,
  subTitle: null,
  desc: null,
  categories: [],
  rating: null,
  icon: null,
  episodeNums: [],
  extras: [],
  ...fields,
})

const fakeSource = ({ id, channels, listings, horizonDays = 9, feeds = null, prefix = 'freeview' }) => ({
  id,
  countries: ['au'],
  channelIdPrefix: prefix,
  horizonDays,
  feeds,
  regionOf: () => 'region',
  regionOfUrl: () => null,
  channels: async () => {
    if (channels instanceof Error) throw channels
    return channels
  },
  listings: async ({ channel }) => (listings[channel] ?? []).map((programme) => ({ ...programme, channel })),
})

const collect = async (build) => {
  const out = new PassThrough()
  const chunks = []
  out.on('data', (chunk) => chunks.push(chunk))
  const stats = await build(out)
  out.end()
  return { stats, xml: Buffer.concat(chunks).toString('utf8') }
}

const programmesOf = (xml) => [...xml.matchAll(/<programme\b[\s\S]*?<\/programme>/g)].map(([element]) => parseProgrammeElement(element))

test('slot merge: a primary slot with an agreeing title at start ±5 min takes the primary times and fills empty fields from mjh', () => {
  const merged = mergeChannelProgrammes({
    channel: 'mjh-7mate-syd',
    primary: [slot({ title: 'American Pickers', at: 4, minutes: 59, subTitle: 'Bad Mother Shucker', season: 6, episode: 11, crid: 'APIC6_011', categories: ['Entertainment'] })],
    secondary: [slot({
      title: 'American Pickers',
      at: 0,
      minutes: 63,
      desc: 'Mike meets a deer.',
      rating: 'PG',
      icon: 'https://example.test/pickers.jpg',
      categories: ['Special Interest'],
      episodeNums: [{ system: 'SxxExx', value: 'S06E11' }, { system: 'original-air-date', value: '2026-11-10' }],
      extras: ['<star-rating>\n      <value>7/10</value>\n    </star-rating>'],
    })],
  })
  assert.deepEqual(merged.counts, { matched: 1, primaryOnly: 0, secondaryKept: 0, secondaryDropped: 0, titleRewrites: 0 })
  const [programme] = merged.xml.map(parseProgrammeElement)
  assert.equal(programme.start, NOW + 4 * MINUTE)
  assert.equal(programme.stop, NOW + 63 * MINUTE)
  assert.equal(programme.subTitle, 'Bad Mother Shucker')
  assert.equal(programme.desc, 'Mike meets a deer.')
  assert.equal(programme.rating, 'PG')
  assert.equal(programme.icon, 'https://example.test/pickers.jpg')
  assert.deepEqual(programme.categories, ['Special Interest'])
  assert.equal(programme.extras.length, 1)
})

test('slot merge: a start more than 5 min away, or a title that does not agree, is no match; overlapped mjh slots drop and gaps keep mjh', () => {
  const merged = mergeChannelProgrammes({
    channel: 'c',
    primary: [
      slot({ title: 'The Chase', at: 0 }),
      slot({ title: 'Cricket', at: 120, minutes: 60 }),
    ],
    secondary: [
      slot({ title: 'The Chase', at: 6, minutes: 54 }),
      slot({ title: 'Movie: Jaws', at: 60, minutes: 60 }),
      slot({ title: 'Seinfeld', at: 118, minutes: 62 }),
    ].map((programme) => ({ ...programme, xml: `<programme>${programme.title}</programme>` })),
  })
  assert.deepEqual(merged.counts, { matched: 0, primaryOnly: 2, secondaryKept: 1, secondaryDropped: 2, titleRewrites: 0 })
  assert.deepEqual(merged.xml.map((xml) => xml.match(/<title>([^<]*)|<programme>([^<]*)/).slice(1).find(Boolean)), ['The Chase', 'Movie: Jaws', 'Cricket'])
  assert.equal(merged.xml[1], '<programme>Movie: Jaws</programme>')
})

test('alias rewrite: when both sources agree on a slot with different titles, mjh\'s title is written and the pair is kept; later slots use it', () => {
  const merged = mergeChannelProgrammes({
    channel: 'c',
    primary: [slot({ title: 'Tipping Point Australia', at: 0 }), slot({ title: 'Tipping Point Australia', at: 24 * 60 })],
    secondary: [slot({ title: 'Tipping Point', at: 1 })],
    aliasOf: (title) => (title === 'Tipping Point Australia' ? 'Tipping Point' : null),
  })
  assert.deepEqual(merged.aliases, [{ sourceTitle: 'Tipping Point Australia', title: 'Tipping Point' }])
  assert.deepEqual(merged.xml.map((xml) => parseProgrammeElement(xml).title), ['Tipping Point', 'Tipping Point'])
  assert.equal(merged.counts.titleRewrites, 2)
  assert.deepEqual(merged.primaryTitles, [])
})

test('episode numbers: a matched slot keeps mjh numbers plus the Freeview CRID; Freeview season and episode fill only when mjh has none', () => {
  const mjh = [
    { system: 'SxxExx', value: 'S2026E224' },
    { system: 'xmltv_ns', value: '2025.223.' },
    { system: 'original-air-date', value: '2026-11-10' },
    { system: 'dd_progid', value: 'EP123' },
  ]
  assert.deepEqual(episodeNumsOf({ primary: { season: 4, episode: 230, crid: 'LOISAU08_10_B' }, secondary: { episodeNums: mjh } }), [
    { system: 'SxxExx', value: 'S2026E224' },
    { system: 'xmltv_ns', value: '2025.223.' },
    { system: 'crid', value: 'LOISAU08_10_B' },
    { system: 'original-air-date', value: '2026-11-10' },
    { system: 'dd_progid', value: 'EP123' },
  ])
  assert.deepEqual(episodeNumsOf({ primary: { season: null, episode: 23, crid: null }, secondary: { episodeNums: mjh } }), mjh)
  const datesOnly = [{ system: 'original-air-date', value: '2026-11-10' }]
  assert.deepEqual(episodeNumsOf({ primary: { season: 8, episode: 10, crid: null }, secondary: { episodeNums: datesOnly } }), [
    { system: 'xmltv_ns', value: '7.9.' },
    { system: 'SxxExx', value: 'S08E10' },
    ...datesOnly,
  ])
  assert.deepEqual(episodeNumsOf({ primary: { season: null, episode: 23, crid: null } }), [{ system: 'xmltv_ns', value: '.22.' }])
  assert.deepEqual(episodeNumsOf({ primary: { season: null, episode: null, crid: null } }), [])
})

test('channels: Freeview maps to mjh ids by DVB triplet first, then LCN; unknown channels get freeview.<triplet>', () => {
  const channels = mapChannels({
    primaryChannels: [
      { id: '1013:0502:0521', names: ['7HD'], lcn: 71 },
      { id: '1013:0502:0520', names: ['Seven'], lcn: 7 },
      { id: '1012:0420:0421', names: ['9HD'], lcn: 9 },
    ],
    secondaryChannels: [
      { id: 'mjh-seven-syd', names: ['Seven'], lcn: 71 },
      { id: 'mjh-channel-9-nsw', names: ['Channel 9'], lcn: 91 },
      { id: 'mjh-bbc-news-fast', names: ['BBC News'], lcn: null },
    ],
    channelTriplets: new Map([['mjh-channel-9-nsw', ['1012:0420:0421']]]),
    tvChannels: SEVEN_SD_UNLINKED,
    prefix: 'freeview',
  })
  assert.deepEqual(channels.map(({ id, primaryId, secondaryId }) => [id, primaryId, secondaryId]), [
    ['mjh-seven-syd', '1013:0502:0521', 'mjh-seven-syd'],
    ['mjh-channel-9-nsw', '1012:0420:0421', 'mjh-channel-9-nsw'],
    ['mjh-bbc-news-fast', null, 'mjh-bbc-news-fast'],
    ['freeview.1013:0502:0520', '1013:0502:0520', null],
  ])
  assert.deepEqual(channels.at(-1).names, ['7 Sydney SD'])
})

test('channels: a Freeview-only channel is written only for a TV channel with no mjh guide link, so TVHeadend cannot link it twice', () => {
  const freeviewOnly = (tvChannels, savedChannels = null) => mapChannels({
    primaryChannels: [{ id: '1013:0502:0520', names: ['Seven'], lcn: 7 }],
    secondaryChannels: [{ id: 'mjh-bbc-news-fast', names: ['BBC News'], lcn: null }],
    tvChannels,
    savedChannels,
    prefix: 'freeview',
  }).map((channel) => channel.id)
  assert.deepEqual(freeviewOnly(new Map([['1013:0502:0520', [{ id: 'c70', name: '7 Sydney', guideIds: ['mjh-seven-syd'] }]]])), ['mjh-bbc-news-fast'])
  assert.deepEqual(freeviewOnly(new Map([['1013:0502:0520', [{ id: 'c70', name: '7 Sydney', guideIds: ['freeview.1013:0502:0520'] }]]])), ['mjh-bbc-news-fast', 'freeview.1013:0502:0520'])
  assert.deepEqual(freeviewOnly(new Map()), ['mjh-bbc-news-fast'])
  assert.deepEqual(freeviewOnly(null), ['mjh-bbc-news-fast'])
  const saved = [{ id: 'freeview.1013:0502:0520', names: ['7 Sydney'], lcn: 7, primaryId: '1013:0502:0520', secondaryId: null }]
  assert.deepEqual(freeviewOnly(null, saved), ['mjh-bbc-news-fast', 'freeview.1013:0502:0520'])
})

test('channels: with mjh down, the saved channel list keeps the mjh ids for Freeview channels', () => {
  const channels = mapChannels({
    primaryChannels: [{ id: '1013:0502:0521', names: ['7HD'], lcn: 71 }, { id: '1013:0502:0520', names: ['Seven'], lcn: 7 }],
    secondaryChannels: null,
    savedChannels: [
      { id: 'mjh-seven-syd', names: ['Seven'], lcn: 71, icon: null, primaryId: '1013:0502:0521', secondaryId: 'mjh-seven-syd' },
      { id: 'mjh-bbc-news-fast', names: ['BBC News'], lcn: null, icon: null, primaryId: null, secondaryId: 'mjh-bbc-news-fast' },
    ],
    tvChannels: SEVEN_SD_UNLINKED,
    prefix: 'freeview',
  })
  assert.deepEqual(channels.map(({ id, primaryId, secondaryId }) => [id, primaryId, secondaryId]), [
    ['mjh-seven-syd', '1013:0502:0521', null],
    ['freeview.1013:0502:0520', '1013:0502:0520', null],
  ])
})

const SEVEN_SD_UNLINKED = new Map([['1013:0502:0520', [{ id: 'c70', name: '7 Sydney SD', guideIds: [] }]]])

const sydneySources = ({ mjhChannels = [{ id: 'mjh-seven-syd', names: ['Seven'], lcn: 71 }], freeviewChannels = [{ id: '1013:0502:0521', names: ['7HD'], lcn: 71 }, { id: '1013:0502:0520', names: ['Seven'], lcn: 7 }] } = {}) => ({
  primary: {
    region: 'region_nsw_sydney',
    source: fakeSource({
      id: 'freeview-au',
      channels: freeviewChannels,
      listings: {
        '1013:0502:0521': [slot({ title: 'Better Homes and Gardens', at: 0, season: 2026, episode: 40 }), slot({ title: 'Brand New Show', at: 60 })],
        '1013:0502:0520': [slot({ title: 'Better Homes and Gardens', at: 0 })],
      },
    }),
  },
  secondary: {
    region: 'Sydney',
    source: fakeSource({
      id: 'mjh-au',
      feeds: [{ region: 'Sydney', url: 'https://i.mjh.nz/au/Sydney/epg.xml' }],
      channels: mjhChannels,
      listings: {
        'mjh-seven-syd': [
          slot({ title: 'Better Homes And Gardens', at: 1, desc: 'Johanna cooks.' }),
          slot({ title: 'Home and Away', at: 10 * DAY / MINUTE }),
        ],
      },
    }),
  },
})

test('build: channels keep mjh ids, Freeview-only channels are added, mjh fills days past the Freeview horizon, aliases and variant candidates are saved', async () => {
  const { database, aliases } = await memoryAliases()
  const { stats, xml } = await collect((out) => buildMergedGuide({ ...sydneySources(), tvChannels: SEVEN_SD_UNLINKED, aliases, now: () => NOW, out }))
  assert.deepEqual(parseFeedChannels(xml).map((c) => c.id), ['mjh-seven-syd', 'freeview.1013:0502:0520'])
  const programmes = programmesOf(xml)
  assert.deepEqual(programmes.map((p) => [p.channel, p.title]), [
    ['mjh-seven-syd', 'Better Homes And Gardens'],
    ['mjh-seven-syd', 'Brand New Show'],
    ['mjh-seven-syd', 'Home and Away'],
    ['freeview.1013:0502:0520', 'Better Homes And Gardens'],
  ])
  assert.equal(programmes[0].desc, 'Johanna cooks.')
  assert.deepEqual(programmes[0].episodeNums, [{ system: 'xmltv_ns', value: '2025.39.' }, { system: 'SxxExx', value: 'S2026E40' }])
  assert.equal(stats.programmes, 4)
  assert.equal(stats.aliases, 1)
  assert.equal(stats.candidates, 1)
  const rows = await database('title_aliases').orderBy('source_title').select('source_title', 'title', 'kind')
  assert.deepEqual(rows, [
    { source_title: 'Better Homes and Gardens', title: 'Better Homes And Gardens', kind: 'alias' },
    { source_title: 'Brand New Show', title: null, kind: VARIANT_CANDIDATE },
  ])
})

test('build: a variant candidate seen later in mjh is dropped', async () => {
  const { database, aliases } = await memoryAliases()
  await aliases.save({ source: 'freeview-au', candidates: ['Home and Away'] })
  await collect((out) => buildMergedGuide({ ...sydneySources(), tvChannels: SEVEN_SD_UNLINKED, aliases, now: () => NOW, out }))
  assert.deepEqual(await database('title_aliases').where({ kind: VARIANT_CANDIDATE }).pluck('source_title'), ['Brand New Show'])
})

test('last good file: a build where every source fails keeps the earlier merged file', async () => {
  const dir = await tempDir()
  const sources = sydneySources()
  const first = await writeMergedGuide({ dir, ...sources, tvChannels: SEVEN_SD_UNLINKED, now: () => NOW })
  assert.equal(first.programmes, 4)
  const before = await fs.readFile(path.join(dir, MERGED_GUIDE_FILE))
  const down = new Error('HTTP 503')
  const failing = {
    primary: { ...sources.primary, source: { ...sources.primary.source, channels: async () => { throw down } } },
    secondary: { ...sources.secondary, source: { ...sources.secondary.source, channels: async () => { throw down } } },
  }
  await assert.rejects(writeMergedGuide({ dir, ...failing, now: () => NOW }), /every guide source failed/)
  assert.deepEqual(await fs.readFile(path.join(dir, MERGED_GUIDE_FILE)), before)
  assert.deepEqual((await fs.readdir(dir)).sort(), ['channels.json', MERGED_GUIDE_FILE, 'merged.json'].sort())
})

test('last good file: mjh down with no saved channel list keeps the earlier file; with the saved list Freeview still writes mjh ids', async () => {
  const dir = await tempDir()
  const sources = sydneySources()
  const mjhDown = { ...sources, secondary: { ...sources.secondary, source: { ...sources.secondary.source, channels: async () => { throw new Error('HTTP 502') } } } }
  await assert.rejects(writeMergedGuide({ dir, ...mjhDown, tvChannels: SEVEN_SD_UNLINKED, now: () => NOW }), /no earlier channel list/)
  await writeMergedGuide({ dir, ...sources, tvChannels: SEVEN_SD_UNLINKED, now: () => NOW })
  const stats = await writeMergedGuide({ dir, ...mjhDown, tvChannels: SEVEN_SD_UNLINKED, now: () => NOW })
  assert.equal(stats.secondaryOk, false)
  const xml = zlib.gunzipSync(await fs.readFile(path.join(dir, MERGED_GUIDE_FILE))).toString('utf8')
  assert.deepEqual(parseFeedChannels(xml).map((c) => c.id), ['mjh-seven-syd', 'freeview.1013:0502:0520'])
  assert.deepEqual(programmesOf(xml).map((p) => p.title), ['Better Homes and Gardens', 'Brand New Show', 'Better Homes and Gardens'])
})

test('plan: Australia merges Freeview with the time-zone mjh feed; a pinned mjh address picks its region; another address is served as is', () => {
  const ranked = [
    { id: 'freeview-au', regionOf: () => 'region_nsw_sydney' },
    createMjhAu({ download: async () => '' }),
  ]
  const plan = planSources({ ranked, timeZone: 'Australia/Sydney' })
  assert.deepEqual([plan.primary.region, plan.secondary.region], ['region_nsw_sydney', 'Sydney'])
  assert.equal(planSources({ ranked, timeZone: 'Australia/Sydney', url: 'https://i.mjh.nz/au/Perth/epg.xml' }).secondary.region, 'Perth')
  assert.equal(planSources({ ranked, timeZone: 'Australia/Sydney', url: 'https://example.test/my-guide.xml' }), null)
  assert.equal(planSources({ ranked: [], timeZone: 'Europe/Berlin' }), null)
})

test('scheduler: one build at a time, a request during a build runs once more after it, and the file is servable only while the plan applies', async () => {
  const dir = await tempDir()
  const sources = sydneySources()
  let builds = 0
  const countingSecondary = { ...sources.secondary.source, channels: async () => { builds += 1; return sources.secondary.source.channels() } }
  const merge = createGuideMerge({
    dir,
    sources: { forCountry: (country) => (country === 'au' ? [sources.primary.source, countingSecondary] : []) },
    timeZone: () => 'Australia/Sydney',
    isServing: async () => serving,
    channelTriplets: async () => ({ linked: new Map(), tvChannels: SEVEN_SD_UNLINKED }),
    now: () => NOW,
    log: { log: () => {}, warn: () => {} },
  })
  let serving = true
  assert.equal(await merge.servablePath(), null)
  const first = merge.requestBuild()
  merge.requestBuild()
  merge.requestBuild()
  await first
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(builds, 2)
  assert.equal(await merge.servablePath(), path.join(dir, MERGED_GUIDE_FILE))
  assert.equal(merge.latest().programmes, 4)
  serving = false
  assert.equal(await merge.servablePath(), null, 'the file is built but not served until guide_merged_feed is on')
})

test('migration 0047: title_aliases is unique per source title, and down drops it', async () => {
  const { database, aliases } = await memoryAliases()
  await aliases.save({ source: 'freeview-au', aliases: [{ sourceTitle: 'Hell\'s Kitchen', title: 'Hells Kitchen' }] })
  await aliases.save({ source: 'freeview-au', aliases: [{ sourceTitle: 'Hell\'s Kitchen', title: 'Hell\'s Kitchen USA' }] })
  assert.deepEqual(await database('title_aliases').select('source_title', 'title'), [{ source_title: 'Hell\'s Kitchen', title: 'Hell\'s Kitchen USA' }])
  assert.deepEqual([...(await aliases.load('freeview-au'))], [['hell\'s kitchen', 'Hell\'s Kitchen USA']])
  const { down } = await import('../migrations/0047_title_aliases.js')
  await down(database)
  assert.equal(await database.schema.hasTable('title_aliases'), false)
})

test('categories: mjh categories stay when present; Freeview genres fill a slot mjh left without one', () => {
  const merged = mergeChannelProgrammes({
    channel: 'c',
    primary: [slot({ title: 'Gruen', at: 0, categories: ['Entertainment'] }), slot({ title: 'Hard Quiz', at: 60, categories: ['Entertainment'] })],
    secondary: [slot({ title: 'Gruen', at: 0, categories: ['Comedy'] }), slot({ title: 'Hard Quiz', at: 60 })],
  })
  assert.deepEqual(merged.xml.map((xml) => parseProgrammeElement(xml).categories), [['Comedy'], ['Entertainment']])
})

test('built regions: the build records its regions, so a repoint knows when the file is for another mjh region', async () => {
  const dir = await tempDir()
  const sources = sydneySources()
  let url = null
  const merge = createGuideMerge({
    dir,
    sources: { forCountry: () => [sources.primary.source, sources.secondary.source] },
    timeZone: () => 'Australia/Sydney',
    sourceUrl: async () => url,
    now: () => NOW,
    log: { log: () => {}, warn: () => {} },
  })
  sources.secondary.source.regionOf = () => 'Sydney'
  sources.primary.source.regionOf = () => 'region_nsw_sydney'
  sources.secondary.source.regionOfUrl = (address) => (address === 'https://i.mjh.nz/au/Sydney/epg.xml' ? 'Sydney' : address === 'https://i.mjh.nz/au/Perth/epg.xml' ? 'Perth' : null)
  assert.equal(await merge.matchesPlan(), false)
  assert.equal(await merge.buildForPlan(), true)
  assert.deepEqual(await merge.builtRegions(), { primaryRegion: 'region_nsw_sydney', secondaryRegion: 'Sydney' })
  url = 'https://i.mjh.nz/au/Perth/epg.xml'
  assert.equal(await merge.matchesPlan(), false)
})

test('mapChannels: a Freeview NZ channel with no TSID maps to the mjh channel whose TVHeadend service has the same network and service ids', () => {
  const channels = mapChannels({
    primaryChannels: [{ id: '222a::0514', names: ['Three'], lcn: 13 }],
    secondaryChannels: [{ id: 'mjh-three', names: ['Three'], lcn: 3 }],
    channelTriplets: new Map([['mjh-three', ['222a:0019:0514', serviceKeyOf('222a:0019:0514')]]]),
    prefix: 'freeview',
  })
  assert.equal(channels.length, 1)
  assert.equal(channels[0].primaryId, '222a::0514')
})
