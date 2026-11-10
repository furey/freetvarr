import { test } from 'node:test'
import assert from 'node:assert/strict'

import { applyGuideRepoint, planGuideRepoint } from '../src/tvheadend-guide.js'
import {
  REPOINT_CONFIRMED,
  REPOINT_KEPT,
  automaticChoiceOf,
  channelRowsOf,
  noticeOf,
  pinsWith,
  readListingChoice,
  repointPlanOf,
} from '../src/guide-listings.js'
import { createGuideSourceService, repointFailureOf } from '../src/guide-source-routes.js'
import { isGuideFeedUrl } from '../src/guide-feed.js'

const CONN = { url: 'http://tvh.test:9981' }
const MJH_URL = 'https://i.mjh.nz/au/Sydney/epg.xml'
const FEED_URL = 'http://192.168.1.10:3733/guide/xmltv.xml'

const stubTvheadend = ({ grabber = { enabled: true, args: MJH_URL }, epgAfterRerun = { total: 19_000, stop: 2_000 } } = {}) => {
  const writes = []
  let reruns = 0
  const guideEntries = [
    { uuid: 'g-seven', modid: '/usr/bin/tv_grab_url', id: 'mjh-seven-syd', name: 'Seven', channels: ['c7'] },
    { uuid: 'g-abc-me', modid: '/usr/bin/tv_grab_url', id: 'freeview.0x1010_0x0202_0x0222', name: 'ABC ME', channels: [] },
  ]
  const reads = {
    'epggrab/module/list': () => ({ entries: [{ uuid: 'mod-url', title: 'Internal: XMLTV: XMLTV URL grabber' }] }),
    'idnode/load': () => ({
      entries: [{
        params: [
          { id: 'enabled', value: grabber.enabled },
          { id: 'args', value: grabber.args },
          { id: 'path', value: '/usr/bin/tv_grab_url' },
        ],
      }],
    }),
    'epggrab/config/load': () => ({ entries: [{ params: [{ id: 'epgdb_periodicsave', value: 1 }, { id: 'epgdb_saveafterimport', value: true }] }] }),
    'epggrab/channel/grid': () => ({ entries: guideEntries }),
    'channel/grid': () => ({
      entries: [
        { uuid: 'c7', name: '7 Sydney', number: 7, services: ['s7'], epggrab: ['g-seven'] },
        { uuid: 'c22', name: 'ABC ME', number: 22, services: ['s22'] },
      ],
    }),
    'mpegts/service/grid': () => ({ entries: [{ uuid: 's7', lcn: 7 }, { uuid: 's22', lcn: 22 }] }),
    'epg/events/grid': () => (reruns ? { totalCount: epgAfterRerun.total, entries: [{ stop: epgAfterRerun.stop }] } : { totalCount: 13_800, entries: [{ stop: 2_000 }] }),
  }
  return {
    writes,
    get: async (path) => reads[path](),
    post: async (path, form) => {
      if (path === 'epggrab/internal/rerun') reruns += 1
      writes.push({ path, form })
      return {}
    },
  }
}

const mergedFeed = async () => [
  { id: 'mjh-seven-syd', names: ['Seven'], lcn: 7 },
  { id: 'freeview.0x1010_0x0202_0x0222', names: ['ABC ME'], lcn: 22 },
]

const clock = () => {
  let t = 0
  return { now: () => (t += 1000) }
}

const grabberWrites = (writes) => writes
  .filter((w) => w.path === 'idnode/save' && JSON.parse(w.form.node).uuid === 'mod-url')
  .map((w) => JSON.parse(w.form.node))

const mergedSwitch = () => {
  const calls = []
  return {
    calls,
    turnOnMerged: async ({ previousUrl }) => { calls.push(['on', previousUrl]) },
    turnOffMerged: async () => { calls.push(['off']) },
  }
}

test('repoint plan: five steps from turning on the merged guide to checking that it updated', () => {
  assert.deepEqual(planGuideRepoint().steps.map((step) => step.id), ['merged', 'point', 'fetch', 'link', 'verify'])
})

test('repoint apply: turns on the merged guide, points the grabber at Freetvarr, waits for the fetch, links an added Freeview channel, and sees the EPG change', async () => {
  const http = stubTvheadend()
  const merged = mergedSwitch()
  const progress = []
  const result = await applyGuideRepoint({
    http,
    conn: CONN,
    feedUrl: FEED_URL,
    ...merged,
    waitForRequest: async () => true,
    fetchFeed: mergedFeed,
    onProgress: (steps) => progress.push(steps.map((step) => step.status).join(',')),
    pollMs: 0,
    ...clock(),
  })
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(result.previousUrl, MJH_URL)
  assert.equal(result.updated, true)
  assert.equal(result.programmes, 19_000)
  assert.equal(result.linked, 1)
  assert.deepEqual(merged.calls, [['on', MJH_URL]])
  assert.deepEqual(grabberWrites(http.writes), [{ uuid: 'mod-url', enabled: true, args: FEED_URL, priority: 3 }])
  const link = http.writes.find((w) => w.form?.node && JSON.parse(w.form.node).uuid === 'g-abc-me')
  assert.deepEqual(JSON.parse(link.form.node).channels, ['c22'])
  assert.equal(progress.at(-1), 'done,done,done,done,done')
})

test('repoint apply: when TVHeadend never fetches the merged guide, the grabber and the merged setting go back as they were', async () => {
  const http = stubTvheadend()
  const merged = mergedSwitch()
  const result = await applyGuideRepoint({
    http, conn: CONN, feedUrl: FEED_URL, ...merged, waitForRequest: async () => false, fetchFeed: mergedFeed, pollMs: 0, ...clock(),
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'not-fetched')
  assert.equal(result.failedStep, 'fetch')
  assert.equal(result.restored, true)
  assert.deepEqual(grabberWrites(http.writes).map((node) => node.args), [FEED_URL, MJH_URL])
  assert.deepEqual(merged.calls, [['on', MJH_URL], ['off']])
  assert.match(repointFailureOf(result).error, /earlier guide/)
})

test('repoint apply: an EPG that has not changed yet still finishes, marked not updated', async () => {
  const http = stubTvheadend({ epgAfterRerun: { total: 13_800, stop: 2_000 } })
  const result = await applyGuideRepoint({
    http, conn: CONN, feedUrl: FEED_URL, ...mergedSwitch(), waitForRequest: async () => true, fetchFeed: mergedFeed, pollMs: 0, updateLimitMs: 3000, ...clock(),
  })
  assert.equal(result.ok, true)
  assert.equal(result.updated, false)
})

test('repoint apply: a TVHeadend with no URL grabber changes nothing', async () => {
  const http = stubTvheadend()
  http.get = async (path) => (path === 'epggrab/module/list' ? { entries: [] } : {})
  const merged = mergedSwitch()
  const result = await applyGuideRepoint({ http, conn: CONN, feedUrl: FEED_URL, ...merged, waitForRequest: async () => true })
  assert.equal(result.code, 'no-grabber')
  assert.deepEqual(http.writes, [])
  assert.deepEqual(merged.calls, [])
})

const SAVED_CHANNELS = [
  { id: 'mjh-seven-syd', names: ['Seven'], lcn: 7, primaryId: '0x1010_0x0001_0x0010', secondaryId: 'mjh-seven-syd' },
  { id: 'mjh-sbs', names: ['SBS'], lcn: 3, primaryId: null, secondaryId: 'mjh-sbs' },
  { id: 'freeview.0x1010_0x0202_0x0222', names: ['ABC ME'], lcn: 22, primaryId: '0x1010_0x0202_0x0222', secondaryId: null },
]

const inspection = (url = MJH_URL) => ({ module: { enabled: true, url }, channels: [], guideChannels: [], linked: 0 })

test('repoint plan: shows the grabber change, the channels before and after, the added Freeview channels, and days ahead', () => {
  const plan = repointPlanOf({
    inspection: inspection(),
    feedUrl: FEED_URL,
    plan: {},
    builtAt: 1,
    savedChannels: SAVED_CHANNELS,
    sources: [{ label: 'Freeview', horizonDays: 9 }, { label: 'i.mjh.nz', horizonDays: 20 }],
    isFeedUrl: isGuideFeedUrl,
    isMergeableUrl: (url) => url === MJH_URL,
  })
  assert.deepEqual(plan, {
    state: 'pending',
    reason: null,
    pointed: false,
    grabberUrl: MJH_URL,
    feedUrl: FEED_URL,
    channels: 3,
    currentChannels: 2,
    added: ['ABC ME'],
    days: [{ label: 'Freeview', days: 9 }, { label: 'i.mjh.nz', days: 20 }],
  })
  assert.equal(noticeOf({ repoint: plan }).show, true)
  assert.equal(noticeOf({ repoint: plan, hidden: true }).show, false)
  assert.equal(noticeOf({ repoint: { ...plan, state: REPOINT_KEPT } }).show, false)
})

test('repoint plan: reasons stop the confirm step before any change', () => {
  const base = { inspection: inspection(), feedUrl: FEED_URL, plan: {}, builtAt: 1, isFeedUrl: isGuideFeedUrl, isMergeableUrl: (url) => url === MJH_URL }
  assert.equal(repointPlanOf({ ...base, plan: null }).reason, 'no-plan')
  assert.equal(repointPlanOf({ ...base, inspection: null }).reason, 'no-tvheadend')
  assert.equal(repointPlanOf({ ...base, inspection: { module: null } }).reason, 'no-grabber')
  assert.equal(repointPlanOf({ ...base, inspection: inspection('https://example.test/other.xml') }).reason, 'custom-grabber')
  assert.equal(repointPlanOf({ ...base, inspection: inspection(FEED_URL) }).reason, null)
  assert.equal(repointPlanOf({ ...base, builtAt: null }).reason, 'building')
  assert.equal(repointPlanOf({ ...base, inspection: inspection(FEED_URL), mergedOn: true }).pointed, true)
})

test('listing choice: unset reads as Automatic; pins add, change, and clear; Automatic drops only the degraded pins', async () => {
  const settings = new Map()
  assert.deepEqual(await readListingChoice(async (key) => settings.get(key) ?? null), { mode: 'auto', pins: {} })
  settings.set('guide_listings_pins', '{bad json')
  assert.deepEqual((await readListingChoice(async (key) => settings.get(key) ?? null)).pins, {})
  const pins = pinsWith({ pins: pinsWith({ pins: {}, channel: 'seven', source: 'freeview-au' }), channel: 'nine', source: 'mjh-au' })
  assert.deepEqual(pins, { seven: 'freeview-au', nine: 'mjh-au' })
  assert.deepEqual(pinsWith({ pins, channel: 'seven', source: '' }), { nine: 'mjh-au' })
  assert.deepEqual(
    automaticChoiceOf({ choice: { mode: 'freeview-au', pins }, degradedPairs: new Set(['freeview-au|seven']) }),
    { mode: 'auto', pins: { nine: 'mjh-au' } },
  )
})

test('channel rows: a channel on mjh because Freeview is degraded shows as a fallback; a pinned channel shows its pin', () => {
  const rows = channelRowsOf({
    savedChannels: SAVED_CHANNELS,
    latest: {
      channels: [
        { source: 'freeview-au', channel: 'mjh-seven-syd', degraded: true, led: false },
        { source: 'mjh-au', channel: 'mjh-seven-syd', degraded: false, led: true },
      ],
    },
    choice: { mode: 'auto', pins: { 'freeview.0x1010_0x0202_0x0222': 'freeview-au' } },
    primaryId: 'freeview-au',
    secondaryId: 'mjh-au',
  })
  assert.deepEqual(rows[0], { id: 'mjh-seven-syd', name: 'Seven', lcn: 7, sources: ['freeview-au', 'mjh-au'], pin: null, lead: 'mjh-au', fallback: true, degraded: ['freeview-au'] })
  assert.equal(rows[1].fallback, false)
  assert.equal(rows[2].pin, 'freeview-au')
})

const fakeService = ({ settings = new Map(), latestChannels = [], applyRepoint = async () => ({ ok: true, steps: [] }), grabberUrl = MJH_URL } = {}) => {
  const builds = []
  const source = (id, label) => ({ id, label, regionOfUrl: (url) => (url === MJH_URL ? 'Sydney' : null) })
  const freeview = source('freeview-au', 'Freeview')
  const mjh = source('mjh-au', 'i.mjh.nz')
  const service = createGuideSourceService({
    getSetting: async (key) => settings.get(key) ?? null,
    setSetting: async (key, value) => { settings.set(key, value) },
    guideMerge: {
      planNow: async () => ({ primary: { source: freeview }, secondary: { source: mjh } }),
      savedChannels: async () => SAVED_CHANNELS,
      builtAt: async () => 1000,
      latest: () => null,
      requestBuild: () => builds.push('build'),
    },
    rankedSources: () => [freeview, mjh],
    health: { latest: async () => ({ sources: [], channels: latestChannels }) },
    inspect: async () => inspection(grabberUrl),
    feedUrl: async () => FEED_URL,
    isFeedUrl: isGuideFeedUrl,
    applyRepoint,
  })
  return { service, settings, builds }
}

test('service: a mode or pin must name a known source and channel, and each change starts a build', async () => {
  const { service, settings, builds } = fakeService()
  assert.match((await service.setMode('epg.guru')).problem, /Automatic/)
  assert.deepEqual((await service.setMode('freeview-au')).choice, { mode: 'freeview-au', pins: {} })
  assert.match((await service.setPin({ channel: 'nope', source: 'mjh-au' })).problem, /channel/)
  assert.deepEqual((await service.setPin({ channel: 'mjh-seven-syd', source: 'mjh-au' })).choice.pins, { 'mjh-seven-syd': 'mjh-au' })
  assert.equal(settings.get('guide_listings_source'), 'freeview-au')
  assert.equal(builds.length, 2)
})

test('service: the one-tap switch from Health turns on Automatic and drops a pin to a degraded source', async () => {
  const settings = new Map([['guide_listings_source', 'freeview-au'], ['guide_listings_pins', JSON.stringify({ 'mjh-seven-syd': 'freeview-au', 'mjh-sbs': 'mjh-au' })]])
  const { service } = fakeService({ settings, latestChannels: [{ source: 'freeview-au', channel: 'mjh-seven-syd', degraded: true }] })
  assert.deepEqual((await service.switchToAutomatic()).choice, { mode: 'auto', pins: { 'mjh-sbs': 'mjh-au' } })
})

test('service: confirm runs the repoint once, marks the install confirmed, and hides the notice; keep my grabber marks it kept', async () => {
  const { service, settings } = fakeService({ applyRepoint: async ({ feedUrl, onProgress }) => {
    onProgress([{ id: 'merged', status: 'done' }])
    return { ok: true, grabberUrl: feedUrl, steps: [{ id: 'merged', status: 'done' }] }
  } })
  assert.equal((await service.status()).notice.show, true)
  const started = await service.startRepoint()
  assert.deepEqual(await service.startRepoint(), { busy: true })
  const run = await started.finish
  assert.equal(run.result.grabberUrl, FEED_URL)
  assert.equal(settings.get('guide_repoint'), REPOINT_CONFIRMED)
  settings.set('guide_merged_feed', 'on')
  assert.equal((await service.notice()).show, false)
  await service.keepGrabber()
  assert.equal(settings.get('guide_repoint'), REPOINT_KEPT)
})

test('service: a failed repoint keeps the install unconfirmed and says what to do; a custom grabber address is refused before any change', async () => {
  const failing = fakeService({ applyRepoint: async () => ({ ok: false, code: 'not-fetched', restored: true, steps: [] }) })
  const run = await (await failing.service.startRepoint()).finish
  assert.equal(failing.settings.get('guide_repoint'), undefined)
  assert.match(run.result.next, /reach Freetvarr/)
  const custom = fakeService({ grabberUrl: 'https://example.test/other.xml' })
  assert.match((await custom.service.startRepoint()).problem, /does not merge/)
})

test('repoint apply: a link step that never sees the guide channels also puts the grabber and the merged setting back', async () => {
  const http = stubTvheadend()
  const merged = mergedSwitch()
  const result = await applyGuideRepoint({
    http, conn: CONN, feedUrl: FEED_URL, ...merged, waitForRequest: async () => true,
    fetchFeed: async () => { throw new Error('ECONNREFUSED') }, pollMs: 0, ...clock(),
  })
  assert.equal(result.failedStep, 'link')
  assert.equal(result.restored, true)
  assert.deepEqual(grabberWrites(http.writes).map((node) => node.args), [FEED_URL, MJH_URL])
  assert.deepEqual(merged.calls, [['on', MJH_URL], ['off']])
})

test('repoint apply: the merged setting goes back even when TVHeadend refuses the grabber restore', async () => {
  const http = stubTvheadend()
  const post = http.post
  http.post = async (path, form) => {
    if (path === 'idnode/save' && JSON.parse(form.node).args === MJH_URL) throw new Error('HTTP 500')
    return post(path, form)
  }
  const merged = mergedSwitch()
  const result = await applyGuideRepoint({ http, conn: CONN, feedUrl: FEED_URL, ...merged, waitForRequest: async () => false, fetchFeed: mergedFeed, pollMs: 0, ...clock() })
  assert.equal(result.restored, false)
  assert.deepEqual(merged.calls, [['on', MJH_URL], ['off']])
})
