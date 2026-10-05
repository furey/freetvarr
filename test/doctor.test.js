import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

import {
  runDoctor,
  classifyDiskFree,
  classifyGuideDepth,
  plexLocationMatches,
  isBridgeOnly,
  guideCoverage,
} from '../src/doctor.js'

const HOUR_MS = 60 * 60 * 1000
const GB = 1e9
const HANG = Symbol('hang')

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/tvh/${name}.json`, import.meta.url), 'utf8'))

const eventsEndingIn = ({ now, hours }) => {
  const body = fixture('epg-events-last')
  body.entries[0].stop = Math.floor((now + hours * HOUR_MS) / 1000)
  return body
}

const healthyRoutes = ({ now }) => ({
  '/api/serverinfo': () => fixture('serverinfo'),
  '/api/channel/grid': () => fixture('channel-grid'),
  '/api/status/inputs': () => fixture('status-inputs'),
  '/api/dvr/entry/grid_upcoming': () => fixture('dvr-upcoming'),
  '/api/epg/events/grid': () => eventsEndingIn({ now, hours: 7 * 24 }),
  '/api/config/load': () => fixture('config-load'),
  '/api/dvr/config/grid': () => fixture('dvr-config-grid'),
  '/api/hardware/tree': (url) => fixture(url.searchParams.get('uuid') === 'root' ? 'hardware-tree-root' : 'hardware-tree-device'),
  '/api/access/entry/grid': () => fixture('access-entry-grid'),
})

const ALLOWED_PATHS = new Set(Object.keys(healthyRoutes({ now: 0 })))

const refuse = (status) => () => ({ status })

const withTvh = async (routes, run) => {
  const requests = []
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://tvh')
    requests.push({ method: req.method, path: url.pathname })
    const route = routes[url.pathname]
    const reply = route ? route(url) : { status: 404 }
    if (reply === HANG) return
    if (reply?.status) {
      res.writeHead(reply.status, { 'Content-Type': 'text/html' })
      return res.end(`<html>${reply.status}</html>`)
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(reply))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    await run(`http://127.0.0.1:${server.address().port}`)
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
  assert.ok(requests.length > 0)
  for (const r of requests) {
    assert.equal(r.method, 'GET', `${r.method} ${r.path} is not a read`)
    assert.ok(ALLOWED_PATHS.has(r.path), `${r.path} is not on the allowlist`)
  }
  return requests
}

const tempFolders = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-doctor-'))
  const recordings = path.join(root, 'recordings')
  const media = path.join(root, 'media')
  await fs.mkdir(recordings)
  await fs.mkdir(media)
  return { recordings, media }
}

const doctorDeps = async ({ url, timeZone = '', ...overrides } = {}) => {
  const { recordings, media } = await tempFolders()
  return {
    connection: async () => ({ url, username: '', password: '' }),
    settings: async () => ({
      mediaRoot: media,
      recordingsRoot: recordings,
      tvhRecordingsPath: '/recordings',
      plexUrl: '',
      plexToken: '',
      plexSectionId: '',
      syncCron: '',
      adRemovalEnabled: false,
      timeZone,
    }),
    guide: async () => null,
    latestSync: async () => null,
    schedulerExpression: () => '*/30 * * * *',
    liveEncoder: async () => ({ kind: 'vaapi', reason: 'VAAPI test encode passed on /dev/dri/renderD128' }),
    which: async (tool) => `/usr/bin/${tool}`,
    statfs: async () => ({ bavail: (500 * GB) / 4096, bsize: 4096, blocks: (1000 * GB) / 4096 }),
    envTimeZone: () => 'Australia/Sydney',
    systemTimeZone: () => 'UTC',
    interfaces: () => ({ eth0: [{ family: 'IPv4', address: '192.0.2.5', internal: false }] }),
    uid: () => 1000,
    ...overrides,
  }
}

const runAgainst = async ({ routes, now = Date.now(), timeoutMs, ...overrides }) => {
  let report
  await withTvh(routes, async (url) => {
    report = await runDoctor({ now, timeoutMs, deps: await doctorDeps({ url, ...overrides }) })
  })
  return report
}

const byId = (report) => Object.fromEntries(report.checks.map((c) => [c.id, c]))

const TVH_DEPENDENT = ['tvh.rights', 'tvh.open', 'tvh.tuners', 'tvh.channels', 'guide.depth', 'guide.logos', 'paths.match']

test('runDoctor: a healthy setup passes every check it can run, reading TVHeadend with GETs only', async () => {
  const now = Date.now()
  const report = await runAgainst({ routes: healthyRoutes({ now }), now })
  const checks = byId(report)
  assert.deepEqual(report.summary, { pass: 16, warn: 0, fail: 0, skip: 2 })
  assert.match(checks['tvh.reach'].detail, /^TVHeadend 4\.3-2794~g5ce3ff63c at http:\/\/127\.0\.0\.1:\d+, API version 20\.$/)
  assert.match(checks['tvh.tuners'].detail, /^2 tuners: HDHomeRun DVB-T Tuner #0 \(192\.0\.2\.10\)/)
  assert.equal(checks['tvh.channels'].detail, '3 channels in TVHeadend.')
  assert.deepEqual(['plex.reach', 'ads.comskip', 'live.encoder'].map((id) => checks[id].status), ['skip', 'skip', 'pass'])
  for (const c of report.checks) {
    assert.deepEqual(Object.keys(c).filter((k) => k !== 'action').sort(), ['detail', 'doc', 'fix', 'group', 'id', 'status', 'title'])
  }
  assert.match(report.ranAt, /^\d{4}-\d{2}-\d{2}T/)
  assert.equal(typeof report.durationMs, 'number')
})

test('runDoctor: a 401 on serverinfo fails the login and skips every TVHeadend check', async () => {
  const now = Date.now()
  const report = await runAgainst({ routes: { ...healthyRoutes({ now }), '/api/serverinfo': refuse(401) }, now })
  const checks = byId(report)
  assert.equal(checks['tvh.reach'].status, 'pass')
  assert.equal(checks['tvh.auth'].status, 'fail')
  assert.match(checks['tvh.auth'].detail, /HTTP 401/)
  assert.match(checks['tvh.auth'].fix, /No username was sent/)
  for (const id of TVH_DEPENDENT) {
    assert.equal(checks[id].status, 'skip', id)
    assert.equal(checks[id].detail, 'Fix the TVHeadend connection first.')
  }
})

test('runDoctor: a 403 on serverinfo names the three usual causes', async () => {
  const now = Date.now()
  const report = await runAgainst({ routes: { ...healthyRoutes({ now }), '/api/serverinfo': refuse(403) }, now })
  const auth = byId(report)['tvh.auth']
  assert.equal(auth.status, 'fail')
  assert.match(auth.detail, /HTTP 403/)
  assert.match(auth.fix, /Wrong password, a network outside the allowed range, or a missing right/)
})

test('runDoctor: a 403 on status/inputs alone fails the rights check naming Admin', async () => {
  const now = Date.now()
  const report = await runAgainst({ routes: { ...healthyRoutes({ now }), '/api/status/inputs': refuse(403) }, now })
  const checks = byId(report)
  assert.equal(checks['tvh.auth'].status, 'pass')
  assert.equal(checks['tvh.rights'].status, 'fail')
  assert.match(checks['tvh.rights'].fix, /tick Admin\.$/)
  assert.doesNotMatch(checks['tvh.rights'].fix, /Video recorder/)
  assert.equal(checks['tvh.tuners'].status, 'skip')
})

test('runDoctor: the open default access entry warns that anyone can change TVHeadend', async () => {
  const now = Date.now()
  const open = {
    entries: [
      ...fixture('access-entry-grid').entries,
      { uuid: 'd1', enabled: true, username: '*', prefix: '0.0.0.0/0,::/0', admin: true, comment: 'Default access entry' },
    ],
  }
  const report = await runAgainst({ routes: { ...healthyRoutes({ now }), '/api/access/entry/grid': () => open }, now })
  const check = byId(report)['tvh.open']
  assert.equal(check.status, 'warn')
  assert.match(check.detail, /0\.0\.0\.0\/0,::\/0/)
  assert.match(check.detail, /anyone on your network can change TVHeadend/)
  assert.match(check.fix, /SECURE TVHEADEND/)
  assert.equal(check.doc, 'guide/tvheadend#_2-secure-tvheadend')
})

test('runDoctor: an anonymous entry without admin rights passes the open-access check', async () => {
  const now = Date.now()
  const viewer = { entries: [{ uuid: 'v1', enabled: true, username: '*', prefix: '192.0.2.0/24', admin: false }] }
  const report = await runAgainst({ routes: { ...healthyRoutes({ now }), '/api/access/entry/grid': () => viewer }, now })
  assert.equal(byId(report)['tvh.open'].status, 'pass')
})

test('runDoctor: an empty hardware tree and no inputs fails the tuner check', async () => {
  const now = Date.now()
  const report = await runAgainst({
    routes: {
      ...healthyRoutes({ now }),
      '/api/hardware/tree': () => [],
      '/api/status/inputs': () => ({ entries: [], totalCount: 0 }),
    },
    now,
  })
  const tuners = byId(report)['tvh.tuners']
  assert.equal(tuners.status, 'fail')
  assert.match(tuners.fix, /network_mode: host/)
  assert.equal(tuners.doc, 'guide/troubleshooting#missing-tuner')
})

test('runDoctor: a tuner on a link-local address warns', async () => {
  const now = Date.now()
  const inputs = fixture('status-inputs')
  inputs.entries[0].input = 'HDHomeRun DVB-T Tuner #0 (169.254.12.34)'
  const report = await runAgainst({ routes: { ...healthyRoutes({ now }), '/api/status/inputs': () => inputs }, now })
  const tuners = byId(report)['tvh.tuners']
  assert.equal(tuners.status, 'warn')
  assert.match(tuners.fix, /link-local/)
  assert.equal(tuners.doc, 'guide/hardware#direct-to-a-spare-nas-port')
})

test('runDoctor: preferred picons with no picon path warns on logos', async () => {
  const now = Date.now()
  const config = fixture('config-load')
  config.entries[0].params.find((p) => p.id === 'piconpath').value = ''
  const grid = fixture('channel-grid')
  for (const c of grid.entries) c.icon_public_url = ''
  const report = await runAgainst({
    routes: { ...healthyRoutes({ now }), '/api/config/load': () => config, '/api/channel/grid': () => grid },
    now,
  })
  const logos = byId(report)['guide.logos']
  assert.equal(logos.status, 'warn')
  assert.match(logos.detail, /0 of 3 channels have a TVHeadend icon/)
  assert.match(logos.fix, /Prefer picons over channel icons/)
})

test('runDoctor: a guide ending in 6 h fails and one ending in 30 h warns', async () => {
  const now = Date.now()
  const depthAt = async (hours) => byId(await runAgainst({
    routes: { ...healthyRoutes({ now }), '/api/epg/events/grid': () => eventsEndingIn({ now, hours }) },
    now,
  }))['guide.depth']
  const six = await depthAt(6)
  const thirty = await depthAt(30)
  assert.equal(six.status, 'fail')
  assert.match(six.detail, /runs 6 h ahead/)
  assert.match(six.fix, /Enable an XMLTV grabber/)
  assert.equal(thirty.status, 'warn')
})

test('runDoctor: a route that never answers fails within the time budget', async () => {
  const now = Date.now()
  const started = Date.now()
  const report = await runAgainst({
    routes: { ...healthyRoutes({ now }), '/api/epg/events/grid': () => HANG },
    now,
    timeoutMs: 50,
  })
  const depth = byId(report)['guide.depth']
  assert.equal(depth.status, 'fail')
  assert.equal(depth.detail, 'No answer within 0.05 s.')
  assert.ok(Date.now() - started < 2000)
})

test('runDoctor: an unreachable TVHeadend fails the connection and skips the TVHeadend checks', async () => {
  const report = await runDoctor({ deps: await doctorDeps({ url: 'http://127.0.0.1:1' }) })
  const checks = byId(report)
  assert.equal(checks['tvh.reach'].status, 'fail')
  assert.match(checks['tvh.reach'].fix, /can't reach TVHeadend at http:\/\/127\.0\.0\.1:1/)
  for (const id of ['tvh.auth', ...TVH_DEPENDENT]) assert.equal(checks[id].status, 'skip', id)
  assert.equal(checks['paths.recordings'].status, 'pass')
})

test('runDoctor: imports that copy across separate mounts on one disk warn and name the fix', async () => {
  const now = Date.now()
  const probeHardlink = async () => ({ hardlinks: false, sameDevice: true, code: 'EXDEV' })
  const check = byId(await runAgainst({ routes: healthyRoutes({ now }), now, probeHardlink }))['paths.hardlink']
  assert.equal(check.status, 'warn')
  assert.match(check.detail, /copy each file/)
  assert.match(check.fix, /separate mounts/)
})

test('runDoctor: a real link between the test folders passes the hardlink check', async () => {
  const now = Date.now()
  const check = byId(await runAgainst({ routes: healthyRoutes({ now }), now }))['paths.hardlink']
  assert.equal(check.status, 'pass')
  assert.match(check.detail, /hardlink\.$/)
})

test('classifyDiskFree: under 2 GB fails, under 20 GB or 10% warns', () => {
  assert.equal(classifyDiskFree({ free: 1 * GB, total: 1000 * GB }), 'fail')
  assert.equal(classifyDiskFree({ free: 15 * GB, total: 50 * GB }), 'warn')
  assert.equal(classifyDiskFree({ free: 90 * GB, total: 1000 * GB }), 'warn')
  assert.equal(classifyDiskFree({ free: 200 * GB, total: 1000 * GB }), 'pass')
})

test('classifyGuideDepth: under 12 h fails, under 48 h or a quarter of channels empty warns', () => {
  const now = 1_000_000_000_000
  assert.equal(classifyGuideDepth({ lastStopMs: null, now }), 'fail')
  assert.equal(classifyGuideDepth({ lastStopMs: now + 6 * HOUR_MS, now }), 'fail')
  assert.equal(classifyGuideDepth({ lastStopMs: now + 30 * HOUR_MS, now }), 'warn')
  assert.equal(classifyGuideDepth({ lastStopMs: now + 100 * HOUR_MS, now, emptyShare: 0.3 }), 'warn')
  assert.equal(classifyGuideDepth({ lastStopMs: now + 100 * HOUR_MS, now, emptyShare: 0.1 }), 'pass')
})

test('guideCoverage: counts channels with nothing in the next 24 h', () => {
  const now = 1_000_000_000_000
  const guide = {
    channels: [{ epgId: 'a' }, { epgId: 'b' }, { epgId: 'c' }],
    programsByChannel: {
      a: [{ start: now - HOUR_MS, end: now + HOUR_MS }],
      b: [{ start: now - 3 * HOUR_MS, end: now - HOUR_MS }],
    },
  }
  assert.deepEqual(guideCoverage({ guide, now }), { channels: 3, empty: 2 })
})

test('plexLocationMatches: compares the last two parts of the media folder', () => {
  assert.equal(plexLocationMatches({ locations: ['/data/media/tv'], mediaRoot: '/media/tv' }), true)
  assert.equal(plexLocationMatches({ locations: ['/data/media/tv/'], mediaRoot: '/media/tv' }), true)
  assert.equal(plexLocationMatches({ locations: ['/data/movies'], mediaRoot: '/media/tv' }), false)
  assert.equal(plexLocationMatches({ locations: [], mediaRoot: '/media/tv' }), false)
})

test('isBridgeOnly: true only when every IPv4 address is in 172.16.0.0/12', () => {
  const nic = (address) => ({ family: 'IPv4', address, internal: false })
  const loopback = { family: 'IPv4', address: '127.0.0.1', internal: true }
  assert.equal(isBridgeOnly({ lo: [loopback], eth0: [nic('172.18.0.4')] }), true)
  assert.equal(isBridgeOnly({ eth0: [nic('172.18.0.4')], eth1: [nic('192.168.1.20')] }), false)
  assert.equal(isBridgeOnly({ lo: [loopback] }), false)
})

const hostCheck = async ({ envTz = '', stored = '', system = 'UTC' }) => {
  const now = Date.now()
  const report = await runAgainst({
    routes: healthyRoutes({ now }),
    now,
    timeZone: stored,
    envTimeZone: () => envTz,
    systemTimeZone: () => system,
  })
  return byId(report)['host.env']
}

test('host.env: no zone chosen on a UTC system warns and links to Settings', async () => {
  const check = await hostCheck({})
  assert.equal(check.status, 'warn')
  assert.match(check.detail, /No time zone is chosen/)
  assert.equal(check.action.href, '#/settings/schedule')
})

test('host.env: a zone chosen in Settings passes and names its source', async () => {
  const check = await hostCheck({ stored: 'Australia/Sydney' })
  assert.equal(check.status, 'pass')
  assert.match(check.detail, /^Time zone Australia\/Sydney \(from Settings\)/)
})

test('host.env: a zone chosen in Settings beats TZ in .env', async () => {
  const check = await hostCheck({ envTz: 'Australia/Perth', stored: 'Australia/Sydney' })
  assert.equal(check.status, 'pass')
  assert.match(check.detail, /^Time zone Australia\/Sydney \(from Settings\)/)
})

test('host.env: an unknown TZ in .env warns with the .env fix', async () => {
  const check = await hostCheck({ envTz: 'Nowhere/Land' })
  assert.equal(check.status, 'warn')
  assert.match(check.detail, /TZ is Nowhere\/Land/)
  assert.match(check.fix, /\.env/)
  assert.equal(check.action, undefined)
})

test('host.env: TZ set to UTC in .env is a deliberate choice and passes', async () => {
  const check = await hostCheck({ envTz: 'UTC' })
  assert.equal(check.status, 'pass')
  assert.match(check.detail, /\(from TZ in \.env\)/)
})

test('host.env: an unknown stored zone warns and links to Settings', async () => {
  const check = await hostCheck({ stored: 'Mars/Olympus', system: 'Australia/Perth' })
  assert.equal(check.status, 'warn')
  assert.match(check.detail, /setting is Mars\/Olympus/)
  assert.equal(check.action.href, '#/settings/schedule')
})
