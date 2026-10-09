import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  fulfillJson, keepRequestsRoutable, refuseUnknownGet, refuseWrites, reportServerWrites, isServerWrite,
} from './capture-demo-api.mjs'

export const TVH_URL = 'http://192.168.86.20:9981'
export const ADMIN_PASSWORD = 'roof-aerial-42'

export const prepareWizardContext = async ({ context, timeZone, simNow = Date.now() }) => {
  const sim = await wizardSimulation({ timeZone, simNow })
  const serverWrites = []
  await context.addInitScript(keepRequestsRoutable)
  context.on('response', (response) => {
    reportServerWrites(response)
    if (isServerWrite(response)) serverWrites.push(`${response.request().method()} ${response.url()}`)
  })
  await context.route('**/api/**', refuseUnknownGet)
  await context.route('**/*', refuseWrites)
  await context.route('**/api/**', wizardApi(sim))
  return { serverWrites }
}

const SRC_DIR = process.env.WIZARD_SRC || '/work/src'
const FIXTURE_DIR = process.env.WIZARD_FIXTURES || '/work/test/fixtures'
const HOST_ADDRESS = '192.168.86.20'
const PLEX_PORT = 32400
const PLEX_TOKEN = 'wizard-demo-plex-token'
const TVH_CONN = { url: TVH_URL, username: 'freetvarr', password: 'wizard-demo' }
const SECURE_STEP_MS = 330
const DISCOVER_DELAY_MS = 1_800
const PLEX_DISCOVER_DELAY_MS = 2_000
const PLEX_SECTIONS_DELAY_MS = 400
const CHANNEL_PHASES_MS = { network: 700, tuners: 700, scan: 4_200, map: 2_100, recording: 600 }
const GUIDE_PHASES_MS = { feed: 1_200, download: 3_600, link: 1_200 }
const GUIDE_MODULE = { id: '6b6af115948bc15877ed1a4a7c549225', key: '/usr/bin/tv_grab_url', enabled: false, url: '' }

const wizardSimulation = async ({ timeZone, simNow }) => {
  const clockOffset = simNow - Date.now()
  const modules = await loadModules()
  const fixtures = await loadFixtures()
  const network = fixtures.networkGrid.entries[0]
  const tunerCount = fixtures.hardwareDevice.length
  const channelPlan = await channelSetupPlan({ modules, fixtures, timeZone })
  const guidePlan = guideSetupPlan({ modules, fixtures, timeZone })
  return {
    modules,
    fixtures,
    timeZone,
    now: () => Date.now() + clockOffset,
    network,
    tunerCount,
    channelPlan,
    guidePlan,
    settings: freshSettings(timeZone),
    secured: false,
    secureJob: null,
    channelJob: null,
    guideJob: null,
    guideLinks: new Set(),
  }
}

const loadModules = async () => {
  const [setup, guide, bootstrap, pathCheck] = await Promise.all([
    import(join(SRC_DIR, 'tvheadend-setup.js')),
    import(join(SRC_DIR, 'tvheadend-guide.js')),
    import(join(SRC_DIR, 'tvheadend-bootstrap.js')),
    import(join(SRC_DIR, 'path-check.js')),
  ])
  return { ...setup, ...guide, ...bootstrap, compareRecordingPaths: pathCheck.compareRecordingPaths }
}

const loadFixtures = async () => {
  const setupFixture = (name) => readJson(join(FIXTURE_DIR, 'tvh-setup', `${name}.json`))
  const [
    hardwareRoot, hardwareDevice, networkGrid, muxGrid, serviceGrid, channelGrid,
    dvrConfigGrid, guideChannelGrid, scanfile, serverinfo, feedXml,
  ] = await Promise.all([
    setupFixture('hardware-root'),
    setupFixture('hardware-device'),
    setupFixture('network-grid'),
    setupFixture('mux-grid'),
    setupFixture('service-grid'),
    setupFixture('channel-grid'),
    setupFixture('dvr-config-grid'),
    setupFixture('epggrab-channel-grid'),
    setupFixture('scanfile-dvbt'),
    readJson(join(FIXTURE_DIR, 'tvh', 'serverinfo.json')),
    readFile(join(FIXTURE_DIR, 'tvh-setup', 'mjh-sydney-channels.xml'), 'utf8'),
  ])
  return {
    hardwareRoot, hardwareDevice, networkGrid, muxGrid, serviceGrid, channelGrid,
    dvrConfigGrid, guideChannelGrid, scanfile, serverinfo, feedXml,
  }
}

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))

const freshSettings = (timeZone) => ({
  tvh_url: '',
  tvh_username: '',
  tvh_password_set: false,
  tvh_open_entry_backup_set: false,
  recordings_root: '/data/recordings',
  tvh_recordings_path: '/recordings',
  sync_cron: null,
  sync_cron_effective: '*/30 * * * *',
  tz: timeZone,
  time_zone: '',
  tz_source: 'env',
  tz_env: timeZone,
  plex_url: null,
  plex_token_set: false,
  plex_tv_section_id: null,
  plex_prefs_path: '/plex-preferences.xml',
  media_root: '/data/media/tv',
  oneoff_root: '/data/media/one-offs',
  import_unmatched: true,
  plex_oneoff_section_id: null,
  movies_root: '/media/movies',
  plex_movies_section_id: null,
  delete_after_plex_refresh_only: true,
  ad_removal_enabled: false,
  ad_original_retention_days: '7',
  comskip_ini_override: false,
})

const wizardApi = (sim) => {
  const handlers = {
    'GET /api/version': ({ route }) => route.continue(),
    'GET /api/csrf-token': ({ route }) => route.continue(),
    'GET /api/settings': () => sim.settings,
    'POST /api/settings': ({ body }) => saveSettings({ sim, body }),
    'GET /api/sync-status': () => ({ activeSyncId: null, cron: '*/30 * * * *', nextRunAt: nextHalfHour(sim.now()) }),
    'GET /api/recording-now': () => ({ active: [], journeys: [], fetchedAt: sim.now() }),
    'GET /api/folder-suggest': () => ({ match: null, folders: [] }),
    'GET /api/syncs': () => ({ syncs: [], total: 0 }),
    'GET /api/shows': () => ({ shows: [] }),
    'GET /api/series': () => ({ series: [], titleMatches: [], stale: false, error: null }),
    'GET /api/recordings': () => ({ recordings: [], total: 0, page: 1, pageSize: 50 }),
    'POST /api/tvh-detect': () => delay(DISCOVER_DELAY_MS).then(() => discoveredTvheadend(sim)),
    'POST /api/tvh-test': ({ body }) => testConnection({ sim, body }),
    'GET /api/tvh-bootstrap/status': ({ url }) => bootstrapStatus({ sim, url }),
    'GET /api/tvh-bootstrap/progress': () => bootstrapProgress(sim),
    'POST /api/tvh-bootstrap/apply': ({ body }) => secureTvheadend({ sim, body }),
    'GET /api/tvh-setup/status': () => channelStatus(sim),
    'GET /api/tvh-setup/progress': () => jobSnapshot(sim.channelJob),
    'POST /api/tvh-setup/apply': ({ body }) => startChannelSetup({ sim, body }),
    'GET /api/tvh-guide/status': () => guideStatus(sim),
    'GET /api/tvh-guide/progress': () => guideProgress(sim),
    'POST /api/tvh-guide/apply': ({ body }) => startGuideSetup({ sim, body }),
    'POST /api/tvh-guide/links': ({ body }) => linkGuideByHand({ sim, body }),
    'POST /api/media-root-test': ({ body }) => ({ ok: true, path: body.path || sim.settings.media_root, ownerUid: 1000 }),
    'POST /api/recordings-root-test': ({ body }) => ({
      ok: true,
      path: body.path || sim.settings.recordings_root,
      hardlinks: true,
      sameDevice: true,
    }),
    'POST /api/tvh-recordings-path-check': ({ body }) => ({
      ok: true,
      ...sim.modules.compareRecordingPaths({ configured: body.path, tvhStorage: recordingStorage(sim) }),
    }),
    'POST /api/discover-plex': () => delay(PLEX_DISCOVER_DELAY_MS).then(() => ({ servers: [plexServer()] })),
    'POST /api/plex-detect-token': () => detectPlexToken(sim),
    'POST /api/plex-sections': () => delay(PLEX_SECTIONS_DELAY_MS).then(() => ({ sections: plexSections() })),
  }
  return async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const handler = handlers[`${request.method()} ${url.pathname}`]
    if (!handler) return route.fallback()
    const answer = await handler({ route, url, body: request.postDataJSON?.() || {} })
    if (answer === undefined) return
    const { status = 200, data = answer } = answer?.httpStatus ? { status: answer.httpStatus, data: answer.data } : {}
    if (status === 200) return fulfillJson(route, data)
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
  }
}

const saveSettings = ({ sim, body }) => {
  const { tvh_password: password, plex_token: token, time_zone: timeZone, ...plain } = body
  Object.assign(sim.settings, plain)
  if (password) sim.settings.tvh_password_set = true
  if (token) sim.settings.plex_token_set = true
  if (timeZone !== undefined) Object.assign(sim.settings, { time_zone: timeZone, tz: timeZone, tz_source: 'setting' })
  return { ok: true }
}

const discoveredTvheadend = (sim) => ({
  ok: true,
  source: 'probe',
  candidates: [{ url: TVH_URL, version: sim.fixtures.serverinfo.sw_version, needsAuth: false, loopback: false }],
})

const testConnection = ({ sim, body }) => {
  if (body.tvh_url !== undefined) sim.settings.tvh_url = body.tvh_url
  if (body.tvh_username !== undefined) sim.settings.tvh_username = body.tvh_username
  return {
    ok: true,
    version: sim.fixtures.serverinfo.sw_version,
    apiVersion: sim.fixtures.serverinfo.api_version,
    channels: channelsReady(sim) ? sim.fixtures.channelGrid.entries.length : 0,
    tuners: sim.tunerCount,
  }
}

const suggestedPrefixes = (sim) => sim.modules.suggestLanPrefixes({
  eth0: [{ family: 'IPv4', address: HOST_ADDRESS, internal: false }],
  lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
})

const bootstrapStatus = ({ sim, url }) => {
  const prefixes = suggestedPrefixes(sim)
  return {
    ok: true,
    url: url.searchParams.get('url') || TVH_URL,
    fresh: !sim.secured,
    reason: sim.secured ? 'secured' : 'open-default-entry',
    accessEntries: sim.secured ? null : 1,
    suggestedPrefixes: prefixes,
    steps: sim.modules.planBootstrap({ lanPrefixes: prefixes, adminUsername: 'admin' }).steps,
    undoAvailable: sim.secured,
  }
}

const bootstrapProgress = (sim) => {
  const snapshot = jobSnapshot(sim.secureJob)
  return { running: snapshot.running, steps: snapshot.steps.map(({ id, label, status }) => ({ id, label, status })) }
}

const secureTvheadend = async ({ sim, body }) => {
  const input = sim.modules.validateBootstrapInput({
    adminUsername: body.admin_username,
    adminPassword: body.admin_password,
    prefixes: body.prefixes,
  })
  if (input.error) return { httpStatus: 400, data: { ok: false, error: input.error } }
  const plan = sim.modules.planBootstrap({ lanPrefixes: input.prefixes, adminUsername: input.adminUsername })
  sim.secureJob = startJob({
    steps: plan.steps,
    phases: Object.fromEntries(plan.steps.map((s) => [s.id, { ms: SECURE_STEP_MS }])),
  })
  await delay(jobDuration(sim.secureJob))
  sim.secured = true
  Object.assign(sim.settings, {
    tvh_url: body.url,
    tvh_username: sim.modules.FREETVARR_USERNAME,
    tvh_password_set: true,
    tvh_open_entry_backup_set: true,
  })
  return {
    ok: true,
    username: sim.modules.FREETVARR_USERNAME,
    adminUsername: input.adminUsername,
    prefix: plan.prefix,
    steps: bootstrapProgress(sim).steps,
  }
}

const channelSetupPlan = async ({ modules, fixtures, timeZone }) => {
  const read = (reads) => readChannelSetup({ modules, http: fakeTvheadend(reads), timeZone })
  const fresh = await read(freshTvheadendReads(fixtures))
  const scanned = await read(scannedTvheadendReads({ fixtures, transmitter: fresh.transmitter }))
  const networkId = fixtures.networkGrid.entries[0].uuid
  const muxes = fixtures.muxGrid.entries.filter((m) => m.network_uuid === networkId)
  const muxIds = new Set(muxes.map((m) => m.uuid))
  const services = fixtures.serviceGrid.entries.map((s) => ({ ...s, channel: [] }))
  const toMap = modules.unmappedTvServices({ services, muxIds }).length
  const added = fixtures.channelGrid.entries.length
  return { fresh, scanned, networkId, muxes, toMap, added }
}

const readChannelSetup = async ({ modules, http, timeZone }) => {
  const inspection = await modules.inspectSetup({ http, conn: TVH_CONN })
  const transmitters = await modules.listTransmitters({ http, conn: TVH_CONN, scanType: inspection.deliverySystem.scanType })
  const suggestion = modules.suggestChannelSetup({ inspection, transmitters, timeZone })
  const transmitter = transmitters.find((t) => t.key === suggestion.transmitterKey) || null
  return {
    transmitter,
    body: {
      ok: true,
      suggestion,
      tuners: inspection.tuners,
      networks: inspection.compatibleNetworks,
      channels: inspection.channels,
      recordingNow: inspection.recordingNow,
      transmitters,
    },
  }
}

const freshTvheadendReads = (fixtures) => {
  const root = fixtures.hardwareRoot
  const unattached = fixtures.hardwareDevice.map((node) => ({
    ...node,
    params: node.params.map((p) => (p.id === 'networks' ? { ...p, value: [] } : p)),
  }))
  return {
    'hardware/tree:root': root,
    [`hardware/tree:${root[0].uuid}`]: unattached,
    'mpegts/network/grid': { entries: [], total: 0 },
    'channel/grid': { entries: [], total: 0 },
    'dvr/entry/grid_upcoming': { entries: [], total: 0 },
    'mpegts/input/network_list': { entries: [] },
    'dvb/scanfile/list': fixtures.scanfile,
  }
}

const scannedTvheadendReads = ({ fixtures, transmitter }) => {
  const root = fixtures.hardwareRoot
  const network = { ...fixtures.networkGrid.entries[0], networkname: transmitter?.name || 'au-Sydney' }
  return {
    ...freshTvheadendReads(fixtures),
    [`hardware/tree:${root[0].uuid}`]: fixtures.hardwareDevice,
    'mpegts/network/grid': { entries: [network], total: 1 },
    'channel/grid': { entries: fixtures.channelGrid.entries, total: fixtures.channelGrid.entries.length },
    'mpegts/input/network_list': { entries: [{ key: network.uuid, val: network.networkname }] },
  }
}

const fakeTvheadend = (reads) => ({
  get: async (path, params = {}) => {
    const key = path === 'hardware/tree' ? `${path}:${params.uuid}` : path
    if (!(key in reads)) throw new Error(`no fixture for ${key}`)
    return reads[key]
  },
  post: async (path) => {
    throw new Error(`fixture TVHeadend refuses write ${path}`)
  },
})

const channelsReady = (sim) => Boolean(jobSnapshot(sim.channelJob).result?.ok)

const channelStatus = (sim) => ({
  ...(channelsReady(sim) ? sim.channelPlan.scanned.body : sim.channelPlan.fresh.body),
  job: sim.channelJob ? jobSnapshot(sim.channelJob) : null,
})

const startChannelSetup = ({ sim, body }) => {
  const plan = sim.channelPlan
  const transmitter = plan.fresh.body.transmitters.find((t) => t.key === body.transmitter_key)
  if (!transmitter) return { httpStatus: 400, data: { ok: false, error: 'Choose a transmitter.' } }
  const { steps } = sim.modules.planChannelSetup({ networkId: null })
  const scanDetail = (progress) => scanSummary({ sim, progress })
  const mapDetail = (progress) => mapCounts({ plan, progress })
  sim.channelJob = startJob({
    steps,
    phases: {
      network: { ms: CHANNEL_PHASES_MS.network },
      tuners: { ms: CHANNEL_PHASES_MS.tuners },
      scan: { ms: CHANNEL_PHASES_MS.scan, detail: scanDetail },
      map: { ms: CHANNEL_PHASES_MS.map, detail: mapDetail },
      recording: { ms: CHANNEL_PHASES_MS.recording },
    },
    result: (finished) => ({
      ok: true,
      networkId: plan.networkId,
      scan: scanDetail(1),
      mapped: mapDetail(1),
      channels: sim.fixtures.channelGrid.entries.length,
      channelsBefore: 0,
      steps: finished,
    }),
  })
  return { httpStatus: 202, data: { ok: true, steps: jobSnapshot(sim.channelJob).steps } }
}

const scanSummary = ({ sim, progress }) => {
  const { muxes, networkId } = sim.channelPlan
  const scanned = Math.min(muxes.length, Math.floor(progress * muxes.length))
  const states = muxes.map((m, i) => ({
    ...m,
    scan_state: i < scanned ? 0 : i === scanned ? 3 : 1,
    scan_result: i < scanned ? 1 : 0,
  }))
  const services = muxes.slice(0, scanned).reduce((sum, m) => sum + Number(m.num_svc || 0), 0)
  const summary = sim.modules.summariseScan({ network: { id: networkId, services }, muxes: states })
  return { ...summary, waitingForTuner: false }
}

const mapCounts = ({ plan, progress }) => ({
  total: plan.toMap,
  ok: Math.round(progress * plan.added),
  fail: Math.round(progress * (plan.toMap - plan.added)),
})

const guideSetupPlan = ({ modules, fixtures, timeZone }) => {
  const channels = fixtures.channelGrid.entries
    .filter((c) => c.enabled !== false)
    .map((c) => ({ id: c.uuid, name: c.name || '', number: Number(c.number) || null, services: c.services || [], guide: [] }))
  const guideChannels = fixtures.guideChannelGrid.entries.map((g) => ({
    id: g.uuid,
    moduleId: g.modid,
    xmltvId: g.id,
    name: g.name || '',
    channels: [],
  }))
  const feedChannels = modules.parseFeedChannels(fixtures.feedXml)
  const wanted = new Set(feedChannels.map((f) => f.id))
  const serviceLcns = new Map(fixtures.serviceGrid.entries.filter((s) => Number(s.lcn) > 0).map((s) => [s.uuid, Number(s.lcn)]))
  const matched = modules.matchGuideChannels({ channels, guideChannels, feedChannels, serviceLcns })
  const suggestion = modules.suggestGuide({
    inspection: { module: GUIDE_MODULE, channels, linked: 0 },
    timeZone,
  })
  return {
    suggestion,
    expected: wanted.size,
    present: guideChannels.filter((g) => wanted.has(g.xmltvId)).length,
    linked: new Set(matched.links.map((l) => l.channelId)).size,
    total: channels.length,
    unmatched: matched.unmatched.map(({ id, name, number }) => ({
      id,
      name,
      number,
      guess: modules.guessGuideChannel({ channel: { name }, candidates: guideChannels.filter((g) => wanted.has(g.xmltvId)) }),
    })),
    options: guideChannels
      .map((g) => ({ id: g.id, name: g.name, ...(wanted.has(g.xmltvId) ? {} : { empty: true }) }))
      .sort((a, b) => Number(Boolean(a.empty)) - Number(Boolean(b.empty)) || a.name.localeCompare(b.name)),
  }
}

const guideStatus = (sim) => ({
  ok: true,
  suggestion: sim.guidePlan.suggestion,
  job: sim.guideJob ? guideProgress(sim) : null,
})

const startGuideSetup = ({ sim, body }) => {
  const url = String(body.url || '').trim()
  if (!/^https?:\/\/[^\s]+$/i.test(url)) {
    return { httpStatus: 400, data: { ok: false, error: 'Enter a guide address that starts with http:// or https://.' } }
  }
  const plan = sim.guidePlan
  sim.guideLinks.clear()
  sim.guideJob = startJob({
    steps: sim.modules.planGuideSetup().steps,
    phases: {
      feed: { ms: GUIDE_PHASES_MS.feed },
      download: {
        ms: GUIDE_PHASES_MS.download,
        detail: (progress) => ({ found: Math.round(progress * plan.present), expected: plan.expected }),
      },
      link: { ms: GUIDE_PHASES_MS.link },
    },
    result: (finished) => ({
      ok: true,
      linked: plan.linked,
      total: plan.total,
      unmatched: plan.unmatched,
      options: plan.options,
      steps: finished,
    }),
  })
  return { httpStatus: 202, data: { ok: true, steps: jobSnapshot(sim.guideJob).steps } }
}

const guideProgress = (sim) => {
  const snapshot = jobSnapshot(sim.guideJob)
  if (!snapshot.result?.ok) return snapshot
  const handLinked = sim.guideLinks
  return {
    ...snapshot,
    result: {
      ...snapshot.result,
      linked: snapshot.result.linked + handLinked.size,
      unmatched: snapshot.result.unmatched.filter((c) => !handLinked.has(c.id)),
    },
  }
}

const linkGuideByHand = ({ sim, body }) => {
  const known = new Set(sim.guidePlan.options.map((o) => o.id))
  const valid = (body.links || []).filter((l) => known.has(l.guide_id) && sim.guidePlan.unmatched.some((c) => c.id === l.channel_id))
  const fresh = valid.filter((l) => !sim.guideLinks.has(l.channel_id))
  for (const l of fresh) sim.guideLinks.add(l.channel_id)
  return { ok: true, linked: new Set(fresh.map((l) => l.channel_id)).size }
}

const recordingStorage = (sim) => (sim.fixtures.dvrConfigGrid.entries.find((c) => c.name === '') || {}).storage || ''

const plexServer = () => ({
  ip: HOST_ADDRESS,
  port: PLEX_PORT,
  name: 'Plex Media Server',
  version: '1.41.3.9314',
  identifier: 'wizard-demo-plex',
})

const detectPlexToken = (sim) => {
  sim.settings.plex_token_set = true
  return { ok: true, path: sim.settings.plex_prefs_path, source: 'preferences.xml', token: PLEX_TOKEN }
}

const plexSections = () => [
  { key: '1', title: 'Movies', type: 'movie', locations: ['/media/movies'] },
  { key: '2', title: 'TV Shows', type: 'show', locations: ['/data/media/tv'] },
]

const startJob = ({ steps, phases, result = () => null }) => ({ steps, phases, result, startedAt: Date.now() })

const jobDuration = (job) => job.steps.reduce((sum, s) => sum + job.phases[s.id].ms, 0)

const jobSnapshot = (job) => {
  if (!job) return { running: false, steps: [], result: null }
  const elapsed = Date.now() - job.startedAt
  let phaseStart = 0
  const steps = job.steps.map((step) => {
    const phase = job.phases[step.id]
    const from = phaseStart
    phaseStart += phase.ms
    const status = elapsed >= phaseStart ? 'done' : elapsed >= from ? 'running' : 'pending'
    const progress = Math.max(0, Math.min(1, (elapsed - from) / phase.ms))
    const detail = phase.detail && status !== 'pending' ? phase.detail(progress) : null
    return { id: step.id, label: step.label, status, detail }
  })
  const running = elapsed < phaseStart
  return { running, steps, result: running ? null : job.result(steps) }
}

const nextHalfHour = (now) => {
  const next = new Date(now)
  next.setMinutes(next.getMinutes() < 30 ? 30 : 60, 0, 0)
  return next.toISOString()
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
