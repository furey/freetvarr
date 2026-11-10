import { test } from 'node:test'
import assert from 'node:assert/strict'

import { applyGuideRepoint, planGuideRepoint, planRepointLinks, rollbackGuideRepoint } from '../src/tvheadend-guide.js'
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
import { createGuideSourceService, createMergedFeedSwitch, repointFailureOf } from '../src/guide-source-routes.js'
import { isGuideFeedUrl, noteServedFeed } from '../src/guide-feed.js'
import { withGuideNoticeMeta } from '../src/web-assets.js'

const CONN = { url: 'http://tvh.test:9981' }
const MJH_URL = 'https://i.mjh.nz/au/Sydney/epg.xml'
const FEED_URL = 'http://192.168.1.10:3733/guide/xmltv.xml'

const stubTvheadend = ({ grabber = { enabled: true, args: MJH_URL, priority: 5 }, importChanges = true, saveAfterImport = false } = {}) => {
  const writes = []
  let reruns = 0
  let guideEntries = [
    { uuid: 'g-seven', modid: '/usr/bin/tv_grab_url', id: 'mjh-seven-syd', name: 'Seven', channels: ['c7'] },
  ]
  const afterImport = () => [
    { uuid: 'g-seven', modid: '/usr/bin/tv_grab_url', id: 'mjh-seven-syd', name: 'Seven', channels: ['c7'] },
    { uuid: 'g-abc-me', modid: '/usr/bin/tv_grab_url', id: 'freeview.1010:0202:0222', name: 'ABC ME', channels: ['c7'] },
  ]
  const countFor = (channel) => {
    if (!reruns || !importChanges) return channel === 'c7' ? 120 : 0
    return channel === 'c7' ? 150 : 90
  }
  const reads = {
    'epggrab/module/list': () => ({ entries: [{ uuid: 'mod-url', title: 'Internal: XMLTV: XMLTV URL grabber' }] }),
    'idnode/load': () => ({
      entries: [{
        params: [
          { id: 'enabled', value: grabber.enabled },
          { id: 'args', value: grabber.args },
          { id: 'priority', value: grabber.priority },
          { id: 'path', value: '/usr/bin/tv_grab_url' },
        ],
      }],
    }),
    'epggrab/config/load': () => ({ entries: [{ params: [{ id: 'epgdb_periodicsave', value: 1 }, { id: 'epgdb_saveafterimport', value: saveAfterImport }] }] }),
    'epggrab/channel/grid': () => ({ entries: guideEntries }),
    'channel/grid': () => ({
      entries: [
        { uuid: 'c7', name: '7 Sydney', number: 7, services: ['s7'], epggrab: ['g-seven'] },
        { uuid: 'c22', name: 'ABC ME', number: 22, services: ['s22'] },
      ],
    }),
    'mpegts/service/grid': () => ({ entries: [{ uuid: 's7', lcn: 7 }, { uuid: 's22', lcn: 22 }] }),
    'epg/events/grid': (params) => (params?.channel
      ? { totalCount: countFor(params.channel) }
      : { totalCount: 13_800, entries: [{ stop: 2_000 }] }),
  }
  return {
    writes,
    get: async (path, params) => reads[path](params),
    post: async (path, form) => {
      if (path === 'epggrab/internal/rerun') {
        reruns += 1
        if (reruns === 1) guideEntries = afterImport()
      }
      writes.push({ path, form })
      return {}
    },
  }
}

const TRIPLETS = async () => new Map([['c7', ['1013:0502:0521']], ['c22', ['1010:0202:0222']]])

const mergedFeed = async () => [
  { id: 'mjh-seven-syd', names: ['Seven'], lcn: 7 },
  { id: 'freeview.1010:0202:0222', names: ['ABC ME'], lcn: 22 },
]

const clock = () => {
  let t = 0
  return { now: () => (t += 1000) }
}

const grabberWrites = (writes) => writes
  .filter((w) => w.path === 'idnode/save' && JSON.parse(w.form.node).uuid === 'mod-url')
  .map((w) => JSON.parse(w.form.node))

const guideWrites = (writes, uuid) => writes
  .filter((w) => w.path === 'idnode/save' && JSON.parse(w.form.node).uuid === uuid)
  .map((w) => JSON.parse(w.form.node).channels)

const mergedSwitch = () => {
  const calls = []
  return {
    calls,
    turnOnMerged: async ({ previousUrl, remember }) => {
      await remember({ merged: null, sourceUrl: null })
      calls.push(['on', previousUrl])
      return { merged: null, sourceUrl: null }
    },
    restoreMerged: async (previous) => { calls.push(['off', previous]) },
  }
}

const memoryJournal = () => {
  const saved = []
  let current = null
  return {
    saved,
    current: () => current,
    save: async (undo) => {
      current = JSON.parse(JSON.stringify(undo))
      saved.push(current)
    },
    clear: async () => { current = null },
  }
}

const apply = (overrides = {}) => applyGuideRepoint({
  conn: CONN,
  feedUrl: FEED_URL,
  waitForRequest: async () => true,
  fetchFeed: mergedFeed,
  listTriplets: TRIPLETS,
  pollMs: 0,
  updateLimitMs: 5000,
  ...clock(),
  ...overrides,
})

test('repoint plan: five steps from turning on the merged guide to checking that it updated', () => {
  assert.deepEqual(planGuideRepoint().steps.map((step) => step.id), ['merged', 'point', 'fetch', 'link', 'verify'])
})

test('repoint apply: points the grabber at Freetvarr, links the Freeview-only channel by its DVB triplet, removes the double link TVHeadend made by name, and sees new listings', async () => {
  const http = stubTvheadend()
  const merged = mergedSwitch()
  const journal = memoryJournal()
  const progress = []
  const result = await apply({ http, ...merged, journal, onProgress: (steps) => progress.push(steps.map((step) => step.status).join(',')) })
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(result.previousUrl, MJH_URL)
  assert.equal(result.linked, 1)
  assert.deepEqual(merged.calls, [['on', MJH_URL]])
  assert.deepEqual(grabberWrites(http.writes), [{ uuid: 'mod-url', enabled: true, args: FEED_URL, priority: 3 }])
  assert.deepEqual(guideWrites(http.writes, 'g-abc-me'), [['c22']])
  assert.equal(progress.at(-1), 'done,done,done,done,done')
  assert.equal(journal.saved[0].grabber, null, 'the run is saved before step 1')
  assert.equal(journal.current(), null)
})

test('repoint apply: when TVHeadend never fetches the merged guide, the grabber enabled flag, address, and priority go back, and so do the save settings', async () => {
  const http = stubTvheadend({ saveAfterImport: false })
  const merged = mergedSwitch()
  const result = await apply({ http, ...merged, waitForRequest: async () => false })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'not-fetched')
  assert.equal(result.restored, true)
  assert.deepEqual(grabberWrites(http.writes).at(-1), { uuid: 'mod-url', enabled: true, args: MJH_URL, priority: 5 })
  const configWrites = http.writes.filter((w) => w.path === 'epggrab/config/save').map((w) => JSON.parse(w.form.node))
  assert.deepEqual(configWrites, [{ epgdb_saveafterimport: true }, { epgdb_saveafterimport: false }])
  assert.deepEqual(merged.calls.map(([kind]) => kind), ['on', 'off'])
  assert.match(repointFailureOf(result).error, /earlier guide/)
})

test('repoint apply: listings that do not change fail the check and roll everything back, links included', async () => {
  const http = stubTvheadend({ importChanges: false })
  const merged = mergedSwitch()
  const result = await apply({ http, ...merged })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'not-updated')
  assert.equal(result.failedStep, 'verify')
  assert.equal(result.restored, true)
  assert.deepEqual(guideWrites(http.writes, 'g-abc-me'), [['c22'], []])
  assert.deepEqual(grabberWrites(http.writes).map((node) => node.args), [FEED_URL, MJH_URL])
})

test('repoint apply: a link step that cannot read the feed also puts the grabber and the merged setting back', async () => {
  const http = stubTvheadend()
  const merged = mergedSwitch()
  const result = await apply({ http, ...merged, fetchFeed: async () => { throw new Error('ECONNREFUSED') } })
  assert.equal(result.failedStep, 'link')
  assert.equal(result.restored, true)
  assert.deepEqual(grabberWrites(http.writes).map((node) => node.args), [FEED_URL, MJH_URL])
  assert.deepEqual(guideWrites(http.writes, 'g-abc-me'), [[]], 'the new guide channel loses the link TVHeadend made by name')
  assert.deepEqual(merged.calls.map(([kind]) => kind), ['on', 'off'])
})

test('repoint apply: the merged setting goes back even when TVHeadend refuses the grabber restore, and the journal stays for the next start', async () => {
  const http = stubTvheadend()
  const post = http.post
  http.post = async (path, form) => {
    if (path === 'idnode/save' && JSON.parse(form.node).args === MJH_URL) throw new Error('HTTP 500')
    return post(path, form)
  }
  const merged = mergedSwitch()
  const journal = memoryJournal()
  const result = await apply({ http, ...merged, journal, waitForRequest: async () => false })
  assert.equal(result.restored, false)
  assert.deepEqual(merged.calls.map(([kind]) => kind), ['on', 'off'])
  assert.equal(journal.current().pointed, true)
})

test('repoint rollback after a restart: the saved journal alone puts TVHeadend and the settings back', async () => {
  const http = stubTvheadend()
  const journal = memoryJournal()
  await apply({ http, ...mergedSwitch(), journal, waitForRequest: async () => { throw new Error('restart') } }).catch(() => {})
  const saved = journal.saved.at(-1)
  const fresh = stubTvheadend()
  const restored = []
  const steps = await rollbackGuideRepoint({ http: fresh, conn: CONN, undo: saved, restoreMerged: async (previous) => restored.push(previous) })
  assert.ok(steps.includes('grabber'))
  assert.deepEqual(grabberWrites(fresh.writes), [{ uuid: 'mod-url', enabled: true, args: MJH_URL, priority: 5 }])
  assert.equal(restored.length, 1)
})

test('repoint apply: a TVHeadend with no URL grabber changes nothing', async () => {
  const http = stubTvheadend()
  http.get = async (path) => (path === 'epggrab/module/list' ? { entries: [] } : {})
  const merged = mergedSwitch()
  const result = await apply({ http, ...merged })
  assert.equal(result.code, 'no-grabber')
  assert.deepEqual(http.writes, [])
  assert.deepEqual(merged.calls, [])
})

test('repoint links: a Freeview-only guide channel links to the TV channel with its triplet only when that channel has no mjh link', () => {
  const channels = [
    { id: 'c7', name: '7 Sydney', number: 7, services: [], guide: ['g-seven'] },
    { id: 'c22', name: 'ABC ME', number: 22, services: [], guide: [] },
  ]
  const guideChannels = [
    { id: 'g-seven', xmltvId: 'mjh-seven-syd', name: 'Seven', channels: ['c7'] },
    { id: 'g-seven-fv', xmltvId: 'freeview.1013:0502:0521', name: '7 Sydney', channels: [] },
    { id: 'g-abc-me', xmltvId: 'freeview.1010:0202:0222', name: 'ABC ME', channels: ['c7'] },
  ]
  const triplets = new Map([['c7', ['1013:0502:0521']], ['c22', ['1010:0202:0222']]])
  const saves = planRepointLinks({ channels, guideChannels, feedChannels: [], triplets })
  assert.deepEqual(saves.map(({ guideId, channels: linked }) => [guideId, linked]), [['g-abc-me', ['c22']]])
})

const SAVED_CHANNELS = [
  { id: 'mjh-seven-syd', names: ['Seven'], lcn: 7, primaryId: '0x1010_0x0001_0x0010', secondaryId: 'mjh-seven-syd' },
  { id: 'mjh-sbs', names: ['SBS'], lcn: 3, primaryId: null, secondaryId: 'mjh-sbs' },
  { id: 'freeview.0x1010_0x0202_0x0222', names: ['ABC ME'], lcn: 22, primaryId: '0x1010_0x0202_0x0222', secondaryId: null },
]

const inspection = (url = MJH_URL) => ({ module: { enabled: true, url }, channels: [], guideChannels: [], linked: 0 })

test('repoint plan: shows the grabber change, the channels before and after, the added Freeview channels, and days ahead', () => {
  const base = () => ({
    inspection: inspection(),
    feedUrl: FEED_URL,
    plan: {},
    builtAt: 1,
    savedChannels: SAVED_CHANNELS,
    sources: [{ label: 'Freeview', horizonDays: 9 }, { label: 'i.mjh.nz', horizonDays: 20 }],
    isFeedUrl: isGuideFeedUrl,
    isMergeableUrl: (url) => url === MJH_URL,
  })
  const plan = repointPlanOf(base())
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
    region: null,
    rebuild: false,
  })
  assert.equal(repointPlanOf({ ...base(), region: 'Perth', builtRegion: 'Sydney' }).rebuild, true)
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

const fakeService = ({ settings = new Map(), latestChannels = [], applyRepoint = async () => ({ ok: true, steps: [] }), grabberUrl = MJH_URL, otherBusy = () => false, rollbackRepoint = async () => [], noGrabber = false, plannedSteps } = {}) => {
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
      builtRegions: async () => ({ primaryRegion: 'region_nsw_sydney', secondaryRegion: 'Sydney' }),
      latest: () => null,
      requestBuild: () => builds.push('build'),
    },
    rankedSources: () => [freeview, mjh],
    health: { latest: async () => ({ sources: [], channels: latestChannels }) },
    inspect: async () => (noGrabber ? { module: null, channels: [], guideChannels: [] } : inspection(grabberUrl)),
    feedUrl: async () => FEED_URL,
    isFeedUrl: isGuideFeedUrl,
    applyRepoint,
    plannedSteps,
    otherBusy,
    rollbackRepoint,
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

test('service: a started repoint reports every planned step as pending before the first step runs', async () => {
  const { service } = fakeService({
    plannedSteps: () => [{ id: 'merged', label: 'Turn on the merged guide' }, { id: 'link', label: 'Link the new channels' }],
    applyRepoint: () => new Promise(() => {}),
  })
  const started = await service.startRepoint()
  const pending = [
    { id: 'merged', label: 'Turn on the merged guide', status: 'pending', detail: null },
    { id: 'link', label: 'Link the new channels', status: 'pending', detail: null },
  ]
  assert.deepEqual(started.run.steps, pending)
  assert.deepEqual(service.repointProgress().steps, pending)
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

test('service: the guide setup and the confirm step share one lock', async () => {
  const { service } = fakeService({ otherBusy: () => true })
  assert.deepEqual(await service.startRepoint(), { busy: true })
  let release
  const slow = fakeService({ applyRepoint: () => new Promise((resolve) => { release = () => resolve({ ok: true, steps: [] }) }) })
  const started = await slow.service.startRepoint()
  assert.equal(slow.service.busy(), true)
  release()
  await started.finish
  assert.equal(slow.service.busy(), false)
})

test('service: a run that a restart stopped is rolled back from its journal at start, and the page says what happened', async () => {
  const undo = { grabber: { id: 'mod-url', enabled: true, url: MJH_URL, priority: 5 }, pointed: true, mergedOn: true }
  const settings = new Map([['guide_repoint_run', JSON.stringify(undo)]])
  const rolledBack = []
  const { service } = fakeService({ settings, rollbackRepoint: async (saved) => { rolledBack.push(saved) } })
  assert.match((await service.startRepoint()).problem, /not yet put back/)
  const run = await service.recover()
  assert.deepEqual(rolledBack, [undo])
  assert.equal(run.result.code, 'interrupted')
  assert.match(run.result.error, /stopped while it changed the guide\. TVHeadend reads its earlier guide again/)
  assert.equal(settings.get('guide_repoint_run'), '')
  assert.equal(await service.recover(), null)
  const failing = fakeService({ settings: new Map([['guide_repoint_run', JSON.stringify(undo)]]), rollbackRepoint: async () => { throw new Error('ECONNREFUSED') } })
  assert.match((await failing.service.recover()).result.error, /tries again when it next starts/)
})

test('notice: shown only when TVHeadend reads a feed Freetvarr can replace, and served from a cache for the page', async () => {
  assert.equal((await fakeService().service.notice()).show, true)
  assert.equal((await fakeService({ grabberUrl: 'https://example.test/other.xml' }).service.notice()).show, false)
  assert.equal((await fakeService({ noGrabber: true }).service.notice()).show, false)
  const { service } = fakeService()
  assert.equal(service.cachedNotice(), null)
  await service.notice()
  assert.deepEqual(service.cachedNotice(), { show: true, added: 1 })
})

test('merged feed switch: a grabber on another mjh region rebuilds the merged guide for it before TVHeadend is pointed at it', async () => {
  const settings = new Map([['guide_merged_feed', ''], ['guide_source_url', '']])
  let built = false
  const reports = []
  const remembered = []
  const merge = {
    matchesPlan: async () => built,
    planNow: async () => ({ secondary: { region: settings.get('guide_source_url') ? 'Perth' : 'Sydney' } }),
    buildForPlan: async () => { built = true; return true },
  }
  const { turnOn, restore } = createMergedFeedSwitch({
    getSetting: async (key) => settings.get(key) ?? null,
    setSetting: async (key, value) => { settings.set(key, value) },
    guideMerge: merge,
    isFeedUrl: isGuideFeedUrl,
    mergedKey: 'guide_merged_feed',
    sourceKey: 'guide_source_url',
  })
  const previous = await turnOn({ previousUrl: 'https://i.mjh.nz/au/Perth/epg.xml', report: (detail) => reports.push(detail), remember: async (value) => remembered.push(value) })
  assert.deepEqual(reports, [{ region: 'Perth' }])
  assert.equal(settings.get('guide_merged_feed'), 'on')
  assert.equal(settings.get('guide_source_url'), 'https://i.mjh.nz/au/Perth/epg.xml')
  assert.deepEqual(remembered, [previous])
  await restore(previous)
  assert.deepEqual([settings.get('guide_merged_feed'), settings.get('guide_source_url')], ['', ''])
  merge.buildForPlan = async () => false
  built = false
  await assert.rejects(turnOn({ previousUrl: 'https://i.mjh.nz/au/Perth/epg.xml' }), (err) => err.code === 'build-failed')
})

test('feed requests count only once a 200 response is fully served', () => {
  const notes = []
  const watch = { note: () => notes.push('note') }
  noteServedFeed({ res: { statusCode: 200, writableFinished: true }, watch })
  noteServedFeed({ res: { statusCode: 200, writableFinished: false }, watch })
  noteServedFeed({ res: { statusCode: 502, writableFinished: true }, watch })
  assert.deepEqual(notes, ['note'])
})

test('page meta: the notice state goes into the page, so Home shows it without a shift', () => {
  const html = withGuideNoticeMeta({ html: '<meta charset="utf-8" />', notice: { show: true, added: 14 } })
  assert.match(html, /<meta name="freetvarr-guide-notice" content="\{&quot;show&quot;:true,&quot;added&quot;:14\}" \/>/)
  assert.equal(withGuideNoticeMeta({ html: 'x', notice: null }), 'x')
})
