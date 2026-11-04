import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import http from 'node:http'

import cookieParser from 'cookie-parser'
import express from 'express'

import {
  ALLOWED_HOSTS_KEY,
  SEEN_HOSTS_KEY,
  createAllowedHosts,
  createHostGate,
  createSeenHosts,
  hostCheckReport,
  isAllowedHost,
  machineNamesOf,
  mountAllowedHosts,
  normaliseHostname,
  parseAllowedHosts,
} from '../src/host-gate.js'

const allowedByDefault = (raw) => isAllowedHost({ hostname: normaliseHostname(raw), extra: [], machineNames: ['nas'] })

const ACCEPTED = [
  '192.168.1.10',
  '192.168.1.10:3733',
  '100.101.102.103',
  '[fe80::1]',
  '[fe80::1]:3733',
  'fe80::1',
  '::1',
  '[::1]:3733',
  '::ffff:192.168.1.10',
  '[::ffff:192.168.1.10]:3733',
  'localhost',
  'localhost:3733',
  'LOCALHOST.',
  'a.localhost',
  'freetvarr',
  'diskstation:3733',
  'nas',
  'nas.local',
  'freetvarr.lan',
  'freetvarr.lan:3733',
  'FreeTvarr.LAN.',
  'nas.home.arpa',
  'tv.internal',
  'nas.home',
  'nas.localdomain',
  'nas.corp',
  '',
]

const REFUSED = [
  'attacker.example',
  'attacker.example:3733',
  'Attacker.Example.',
  '192.168.1.10.nip.io',
  'localhost.attacker.example',
  'lan.attacker.example',
  'freetvarr.lan.attacker.example',
  'xn--80ak6aa92e.com',
  'nas.tail1234.ts.net',
  'nas.fritz.box',
  'freetvarr.lan..',
]

test('isAllowedHost: accepts IP addresses, loopback names, one-word names, and private-use suffixes', () => {
  for (const host of ACCEPTED) assert.equal(allowedByDefault(host), true, host)
})

test('isAllowedHost: refuses public names, including ones that end in a private suffix label', () => {
  for (const host of REFUSED) assert.equal(allowedByDefault(host), false, host)
})

test('normaliseHostname: lowercases, drops the port, the brackets, and one trailing dot', () => {
  assert.equal(normaliseHostname('FreeTvarr.LAN.:3733'), 'freetvarr.lan')
  assert.equal(normaliseHostname('[FE80::1]:3733'), 'fe80::1')
  assert.equal(normaliseHostname('::ffff:192.168.1.10'), '::ffff:192.168.1.10')
  assert.equal(normaliseHostname(undefined), '')
})

test('isAllowedHost: the machine name and its first label pass', () => {
  const machineNames = machineNamesOf('DiskStation.example.com')
  assert.deepEqual(machineNames, ['diskstation.example.com', 'diskstation'])
  assert.equal(isAllowedHost({ hostname: 'diskstation.example.com', extra: [], machineNames }), true)
  assert.equal(isAllowedHost({ hostname: 'other.example.com', extra: [], machineNames }), false)
})

test('isAllowedHost: listed names pass, a wildcard matches subdomains only, and * allows any name', () => {
  const extra = ['freetvarr.example.com', '*.home.example.com']
  const allowed = (hostname) => isAllowedHost({ hostname, extra, machineNames: [] })
  assert.equal(allowed('freetvarr.example.com'), true)
  assert.equal(allowed('tv.home.example.com'), true)
  assert.equal(allowed('a.tv.home.example.com'), true)
  assert.equal(allowed('home.example.com'), false)
  assert.equal(allowed('xhome.example.com'), false)
  assert.equal(isAllowedHost({ hostname: 'attacker.example', extra: ['*'], machineNames: [] }), true)
})

test('parseAllowedHosts: commas, spaces, and new lines split; bad entries come back in invalid', () => {
  const { hosts, invalid } = parseAllowedHosts('Freetvarr.Example.com, *.home.example.com\nnas.tail1234.ts.net  https://x x:8080 x/path 10.0.0.0/8 freetvarr.example.com a.*.b')
  assert.deepEqual(hosts, ['freetvarr.example.com', '*.home.example.com', 'nas.tail1234.ts.net'])
  assert.deepEqual(invalid, ['https://x', 'x:8080', 'x/path', '10.0.0.0/8', 'a.*.b'])
})

test('parseAllowedHosts: one * entry is kept, and a list also takes an array', () => {
  assert.deepEqual(parseAllowedHosts('*').hosts, ['*'])
  assert.deepEqual(parseAllowedHosts(['tv.example.com', 'tv.example.com.']).hosts, ['tv.example.com'])
  assert.deepEqual(parseAllowedHosts('').hosts, [])
})

test('parseAllowedHosts: a wildcard needs at least two labels after *.', () => {
  const { hosts, invalid } = parseAllowedHosts('*.com *.io *.example.com *.co.uk')
  assert.deepEqual(hosts, ['*.example.com', '*.co.uk'])
  assert.deepEqual(invalid, ['*.com', '*.io'])
})

const memorySettings = (initial = {}) => {
  const values = { ...initial }
  return {
    values,
    read: async (key) => values[key] ?? null,
    write: async (key, value) => { values[key] = value },
  }
}

test('createAllowedHosts: joins the saved names with FREETVARR_ALLOWED_HOSTS, and a save takes effect at once', async () => {
  const settings = memorySettings({ [ALLOWED_HOSTS_KEY]: 'saved.example.com' })
  const allowedHosts = createAllowedHosts({ readSetting: settings.read, writeSetting: settings.write, envText: 'env.example.com, bad:1' })
  await allowedHosts.load()
  assert.deepEqual(allowedHosts.current(), ['saved.example.com', 'env.example.com'])
  assert.deepEqual(allowedHosts.saved(), ['saved.example.com'])
  assert.deepEqual(allowedHosts.fromEnv(), ['env.example.com'])
  await allowedHosts.save(['new.example.com'])
  assert.equal(settings.values[ALLOWED_HOSTS_KEY], 'new.example.com')
  assert.deepEqual(allowedHosts.current(), ['new.example.com', 'env.example.com'])
  assert.equal(allowedHosts.allowsAnyHost(), false)
})

test('createAllowedHosts: * in either list allows any name', async () => {
  const allowedHosts = createAllowedHosts({ readSetting: async () => null, writeSetting: async () => {}, envText: '*' })
  await allowedHosts.load()
  assert.equal(allowedHosts.allowsAnyHost(), true)
})

test('createSeenHosts: keeps the newest 50 names with counts, and logs each name once a day', async () => {
  let clock = Date.parse('2026-11-20T08:00:00Z')
  const lines = []
  const seenHosts = createSeenHosts({ now: () => clock, log: (line) => lines.push(line), readSetting: async () => null, writeSetting: async () => {} })
  seenHosts.note({ hostname: 'tv.example.com', from: '192.168.1.23' })
  seenHosts.note({ hostname: 'tv.example.com', from: '192.168.1.23' })
  assert.equal(lines.length, 1)
  assert.match(lines[0], /^\[host-check\] opened as tv\.example\.com from 192\.168\.1\.23;/)
  clock += 25 * 60 * 60 * 1000
  seenHosts.note({ hostname: 'tv.example.com', from: '192.168.1.24' })
  assert.equal(lines.length, 2)
  seenHosts.note({ hostname: 'tv.example.com', from: '::ffff:192.168.1.25' })
  const [entry] = seenHosts.list()
  assert.equal(entry.count, 4)
  assert.equal(entry.from, '192.168.1.25')
  for (let i = 0; i < 60; i += 1) seenHosts.note({ hostname: `junk${i}.example`, from: '192.168.1.66' })
  const names = seenHosts.list().map((seen) => seen.name)
  assert.equal(names.length, 50)
  assert.equal(names.includes('tv.example.com'), false)
  assert.equal(names[0], 'junk59.example')
})

test('createSeenHosts: at most 10 log lines an hour across all names, then one line pointing to Health', () => {
  let clock = Date.parse('2026-11-20T08:00:00Z')
  const lines = []
  const seenHosts = createSeenHosts({ now: () => clock, log: (line) => lines.push(line), readSetting: async () => null, writeSetting: async () => {} })
  for (let i = 0; i < 200; i += 1) seenHosts.note({ hostname: `r${i}.attacker.example`, from: '192.168.1.66' })
  assert.equal(lines.length, 11)
  assert.equal(lines[10], '[host-check] more unknown names this hour; see Health')
  clock += 30 * 60 * 1000
  seenHosts.note({ hostname: 'late.attacker.example', from: '192.168.1.66' })
  assert.equal(lines.length, 11)
  clock += 31 * 60 * 1000
  seenHosts.note({ hostname: 'next-hour.example', from: '192.168.1.66' })
  assert.equal(lines.length, 12)
  assert.match(lines[11], /opened as next-hour\.example/)
})

test('createSeenHosts: a page load marks the name, and a later fetch does not clear the mark', () => {
  const seenHosts = createSeenHosts({ log: () => {}, readSetting: async () => null, writeSetting: async () => {} })
  seenHosts.note({ hostname: 'fetch.example.com', from: '192.168.1.23', pageLoad: false })
  seenHosts.note({ hostname: 'tv.example.com', from: '192.168.1.23', pageLoad: true })
  seenHosts.note({ hostname: 'tv.example.com', from: '192.168.1.23', pageLoad: false })
  const byName = Object.fromEntries(seenHosts.list().map((entry) => [entry.name, entry.page_load]))
  assert.deepEqual(byName, { 'tv.example.com': true, 'fetch.example.com': false })
})

const tick = () => new Promise((resolve) => setImmediate(resolve))

test('createSeenHosts: a new name is saved at once; more requests for a known name wait for the hourly save', async () => {
  const writes = []
  const seenHosts = createSeenHosts({ log: () => {}, readSetting: async () => null, writeSetting: async (key, value) => { writes.push(value) } })
  seenHosts.note({ hostname: 'tv.example.com', from: '192.168.1.23' })
  await tick()
  assert.equal(writes.length, 1)
  for (let i = 0; i < 20; i += 1) seenHosts.note({ hostname: 'tv.example.com', from: '192.168.1.23' })
  await tick()
  assert.equal(writes.length, 1)
  await seenHosts.flush()
  assert.equal(JSON.parse(writes.at(-1))[0].count, 21)
})

test('createSeenHosts: a flood of new names saves at most once a minute', async () => {
  let clock = 1_000_000
  const writes = []
  const seenHosts = createSeenHosts({ now: () => clock, log: () => {}, readSetting: async () => null, writeSetting: async (key, value) => { writes.push(value) } })
  for (let i = 0; i < 30; i += 1) seenHosts.note({ hostname: `r${i}.attacker.example`, from: '192.168.1.66' })
  await tick()
  assert.equal(writes.length, 1)
  clock += 61_000
  seenHosts.note({ hostname: 'another.attacker.example', from: '192.168.1.66' })
  await tick()
  assert.equal(writes.length, 2)
  await seenHosts.forget()
})

test('createSeenHosts: forget waits for a save in flight, then empties the list, so Reset cannot bring old names back', async () => {
  const writes = []
  let release
  const seenHosts = createSeenHosts({
    log: () => {},
    readSetting: async () => null,
    writeSetting: (key, value) => new Promise((resolve) => { release = () => { writes.push(value); resolve() } }),
  })
  seenHosts.note({ hostname: 'tv.example.com', from: '192.168.1.23' })
  await tick()
  const forgotten = seenHosts.forget()
  release()
  await forgotten
  assert.deepEqual(seenHosts.list(), [])
  assert.equal(writes.length, 1)
})

test('createSeenHosts: the list is saved and read back, so Health keeps it after a restart', async () => {
  const settings = memorySettings()
  const first = createSeenHosts({ now: () => 1000, log: () => {}, readSetting: settings.read, writeSetting: settings.write })
  first.note({ hostname: 'tv.example.com', from: '192.168.1.23' })
  await first.flush()
  assert.ok(settings.values[SEEN_HOSTS_KEY])
  const lines = []
  const second = createSeenHosts({ now: () => 2000, log: (line) => lines.push(line), readSetting: settings.read, writeSetting: settings.write })
  await second.load()
  assert.deepEqual(second.list().map(({ name, count }) => ({ name, count })), [{ name: 'tv.example.com', count: 1 }])
  second.note({ hostname: 'tv.example.com', from: '192.168.1.23' })
  assert.equal(lines.length, 0)
})

test('createSeenHosts: a long name is cut to 253 characters', () => {
  const seenHosts = createSeenHosts({ log: () => {}, readSetting: async () => null, writeSetting: async () => {} })
  seenHosts.note({ hostname: `${'a'.repeat(300)}.example`, from: '192.168.1.23' })
  assert.equal(seenHosts.list()[0].name.length, 253)
})

const listen = async (app) => {
  const server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return server
}

const send = ({ server, method = 'GET', path = '/', headers = {} }) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: server.address().port, method, path, headers }, (res) => {
    let body = ''
    res.on('data', (chunk) => { body += chunk })
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
  })
  req.on('error', reject)
  req.end()
})

const gateApp = async ({ trustProxy = 'loopback', extra = [] } = {}) => {
  const allowedHosts = createAllowedHosts({ readSetting: async () => extra.join('\n'), writeSetting: async () => {}, envText: '' })
  await allowedHosts.load()
  const seenHosts = createSeenHosts({ log: () => {}, readSetting: async () => null, writeSetting: async () => {} })
  const app = express()
  app.set('trust proxy', trustProxy)
  app.use(createHostGate({ allowedHosts, seenHosts, machineNames: [] }))
  app.use(cookieParser())
  app.get('/healthz', (req, res) => res.json({ ok: true }))
  app.get('/guide/xmltv.xml', (req, res) => res.type('xml').send('<tv/>'))
  app.post('/guide/xmltv.xml', (req, res) => res.status(405).end())
  app.get('/api/csrf-token', (req, res) => res.cookie('freetvarr.x-csrf', 'x').json({ token: 't' }))
  app.post('/api/settings', (req, res) => res.json({ saved: true }))
  return { app, seenHosts, server: await listen(app) }
}

test('createHostGate: report mode never refuses an unknown name, and records it', async () => {
  const { server, seenHosts } = await gateApp()
  try {
    const token = await send({ server, path: '/api/csrf-token', headers: { Host: 'rebind.attacker.example:3733' } })
    assert.equal(token.status, 200)
    assert.match(token.headers['set-cookie'][0], /^freetvarr\.x-csrf=/)
    const save = await send({ server, method: 'POST', path: '/api/settings', headers: { Host: 'rebind.attacker.example:3733' } })
    assert.equal(save.status, 200)
    assert.deepEqual(seenHosts.list().map(({ name, count }) => ({ name, count })), [{ name: 'rebind.attacker.example', count: 2 }])
  } finally {
    server.close()
  }
})

test('createHostGate: known names, listed names, and a missing Host are not recorded', async () => {
  const { server, seenHosts } = await gateApp({ extra: ['tv.example.com'] })
  try {
    for (const host of ['192.168.1.10:3733', 'freetvarr.lan', 'tv.example.com', '[::1]:3733']) {
      assert.equal((await send({ server, path: '/api/csrf-token', headers: { Host: host } })).status, 200)
    }
    assert.deepEqual(seenHosts.list(), [])
  } finally {
    server.close()
  }
})

test('createHostGate: GET /healthz and GET /guide/xmltv.xml skip the check; POST to the feed does not', async () => {
  const { server, seenHosts } = await gateApp()
  try {
    assert.equal((await send({ server, path: '/healthz', headers: { Host: 'attacker.example' } })).status, 200)
    assert.equal((await send({ server, method: 'HEAD', path: '/healthz', headers: { Host: 'attacker.example' } })).status, 200)
    assert.equal((await send({ server, path: '/guide/xmltv.xml', headers: { Host: 'attacker.example' } })).status, 200)
    assert.deepEqual(seenHosts.list(), [])
    await send({ server, method: 'POST', path: '/guide/xmltv.xml', headers: { Host: 'attacker.example' } })
    assert.deepEqual(seenHosts.list().map((seen) => seen.name), ['attacker.example'])
  } finally {
    server.close()
  }
})

test('createHostGate: X-Forwarded-Host from a loopback proxy is checked; from an untrusted client it is ignored', async () => {
  const trusted = await gateApp()
  try {
    await send({ server: trusted.server, path: '/api/csrf-token', headers: { Host: '127.0.0.1:3733', 'X-Forwarded-Host': 'proxy.example.com' } })
    assert.deepEqual(trusted.seenHosts.list().map((seen) => seen.name), ['proxy.example.com'])
  } finally {
    trusted.server.close()
  }
  const untrusted = await gateApp({ trustProxy: () => false })
  try {
    await send({ server: untrusted.server, path: '/api/csrf-token', headers: { Host: '192.168.1.10:3733', 'X-Forwarded-Host': 'proxy.example.com' } })
    assert.deepEqual(untrusted.seenHosts.list(), [])
  } finally {
    untrusted.server.close()
  }
})

test('createHostGate: only a page the user opened from the address bar, a bookmark, or the Home Screen counts as a page load', async () => {
  const { server, seenHosts } = await gateApp()
  const visit = (hostname, headers) => send({ server, path: '/', headers: { Host: hostname, ...headers } })
  try {
    await visit('typed.example.com', { 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Site': 'none' })
    await visit('link.example.com', { 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Site': 'cross-site' })
    await visit('fetch.example.com', { 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Site': 'same-origin' })
    await visit('self.example.com', { 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Site': 'same-origin' })
    await visit('frame.example.com', { 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'iframe', 'Sec-Fetch-Site': 'none' })
    await visit('old-browser.example.com', {})
    const byName = Object.fromEntries(seenHosts.list().map((entry) => [entry.name, entry.page_load]))
    assert.deepEqual(byName, {
      'typed.example.com': true,
      'link.example.com': false,
      'fetch.example.com': false,
      'self.example.com': false,
      'frame.example.com': false,
      'old-browser.example.com': false,
    })
  } finally {
    server.close()
  }
})

test('server: the host gate runs after X-Robots-Tag and before cookies, CSRF, and every route', () => {
  const source = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8')
  const at = (needle) => {
    const index = source.indexOf(needle)
    assert.notEqual(index, -1, needle)
    return index
  }
  const gate = at('app.use(hostGate)')
  assert.ok(at("res.setHeader('X-Robots-Tag'") < gate)
  assert.ok(gate < at('app.use(cookieParser('))
  assert.ok(gate < at("app.get('/healthz'"))
  assert.ok(gate < at("app.get('/api/csrf-token'"))
  assert.ok(gate < at("app.use('/api', (req, res, next) => {\n  res.setHeader(BUILD_HEADER"))
})

test('hostCheckReport: lists recent names the 3.0.0 check would refuse, newest first, without names allowed since', async () => {
  const now = Date.parse('2026-11-20T08:00:00Z')
  let clock = now - 20 * 24 * 60 * 60 * 1000
  const settings = memorySettings({ [ALLOWED_HOSTS_KEY]: 'added.example.com' })
  const allowedHosts = createAllowedHosts({ readSetting: settings.read, writeSetting: settings.write, envText: 'env.example.com' })
  await allowedHosts.load()
  const seenHosts = createSeenHosts({ now: () => clock, log: () => {}, readSetting: async () => null, writeSetting: async () => {} })
  seenHosts.note({ hostname: 'old.example.com', from: '192.168.1.23' })
  clock = now - 60_000
  seenHosts.note({ hostname: 'tv.example.com', from: '192.168.1.23' })
  seenHosts.note({ hostname: 'added.example.com', from: '192.168.1.23' })
  const report = hostCheckReport({ allowedHosts, seenHosts, machineNames: [], now })
  assert.equal(report.anyHost, false)
  assert.equal(report.added, 2)
  assert.deepEqual(report.seen.map((seen) => seen.name), ['tv.example.com'])
  assert.equal(report.seen[0].allowable, true)
  seenHosts.note({ hostname: 'user@attacker.example', from: '192.168.1.23' })
  const odd = hostCheckReport({ allowedHosts, seenHosts, machineNames: [], now })
  assert.equal(odd.seen.find((seen) => seen.name === 'user@attacker.example').allowable, false)
})

const routeApp = async () => {
  const settings = memorySettings({ [ALLOWED_HOSTS_KEY]: 'saved.example.com' })
  const allowedHosts = createAllowedHosts({ readSetting: settings.read, writeSetting: settings.write, envText: 'env.example.com' })
  await allowedHosts.load()
  const seenHosts = createSeenHosts({ log: () => {}, readSetting: async () => null, writeSetting: async () => {} })
  const app = express()
  app.use(express.json())
  app.use(createHostGate({ allowedHosts, seenHosts, machineNames: [] }))
  mountAllowedHosts({ app, csrf: (req, res, next) => next(), limiter: (req, res, next) => next(), allowedHosts, seenHosts, machineNames: [] })
  return { settings, allowedHosts, seenHosts, server: await listen(app) }
}

const sendJson = ({ server, method, path, body, host = '192.168.1.10:3733' }) => new Promise((resolve, reject) => {
  const payload = body === undefined ? '' : JSON.stringify(body)
  const req = http.request({
    host: '127.0.0.1',
    port: server.address().port,
    method,
    path,
    headers: { Host: host, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
  }, (res) => {
    let text = ''
    res.on('data', (chunk) => { text += chunk })
    res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(text || 'null') }))
  })
  req.on('error', reject)
  req.end(payload)
})

test('GET /api/allowed-hosts: the saved names, the .env names, the name in use, and the names seen', async () => {
  const { server } = await routeApp()
  try {
    await sendJson({ server, method: 'GET', path: '/api/allowed-hosts', host: 'tv.example.com' })
    const { body } = await sendJson({ server, method: 'GET', path: '/api/allowed-hosts', host: 'tv.example.com' })
    assert.deepEqual(body.hosts, ['saved.example.com'])
    assert.deepEqual(body.env_hosts, ['env.example.com'])
    assert.equal(body.any_host, false)
    assert.deepEqual(body.current, { name: 'tv.example.com', allowed: false })
    assert.deepEqual(body.seen.map((seen) => seen.name), ['tv.example.com'])
  } finally {
    server.close()
  }
})

test('PUT /api/allowed-hosts: saves valid names and refuses a scheme, a port, or a path with a message that names it', async () => {
  const { server, settings } = await routeApp()
  try {
    const refused = await sendJson({ server, method: 'PUT', path: '/api/allowed-hosts', body: { hosts: ['ok.example.com', 'https://tv.example.com'] } })
    assert.equal(refused.status, 400)
    assert.match(refused.body.error, /https:\/\/tv\.example\.com/)
    assert.equal(settings.values[ALLOWED_HOSTS_KEY], 'saved.example.com')
    const saved = await sendJson({ server, method: 'PUT', path: '/api/allowed-hosts', body: { hosts: ['OK.example.com', '*.home.example.com'] } })
    assert.equal(saved.status, 200)
    assert.deepEqual(saved.body.hosts, ['ok.example.com', '*.home.example.com'])
    assert.equal(settings.values[ALLOWED_HOSTS_KEY], 'ok.example.com\n*.home.example.com')
  } finally {
    server.close()
  }
})

test('POST /api/allowed-hosts/allow/:name: the Health action adds one name and keeps the rest', async () => {
  const { server, allowedHosts } = await routeApp()
  try {
    const added = await sendJson({ server, method: 'POST', path: '/api/allowed-hosts/allow/TV.example.com' })
    assert.equal(added.status, 200)
    assert.deepEqual(allowedHosts.saved(), ['saved.example.com', 'tv.example.com'])
    const again = await sendJson({ server, method: 'POST', path: '/api/allowed-hosts/allow/tv.example.com' })
    assert.deepEqual(again.body.hosts, ['saved.example.com', 'tv.example.com'])
    assert.equal((await sendJson({ server, method: 'POST', path: '/api/allowed-hosts/allow/*' })).status, 400)
    assert.equal((await sendJson({ server, method: 'POST', path: '/api/allowed-hosts/allow/x%3A8080' })).status, 400)
  } finally {
    server.close()
  }
})

test('PUT /api/allowed-hosts and the allow route refuse a request opened by a name that is not allowed', async () => {
  const { server, allowedHosts } = await routeApp()
  try {
    const put = await sendJson({ server, method: 'PUT', path: '/api/allowed-hosts', body: { hosts: ['rebind.attacker.example'] }, host: 'rebind.attacker.example:3733' })
    assert.equal(put.status, 403)
    assert.equal(put.body.code, 'host-not-allowed')
    assert.doesNotMatch(put.body.error, /csrf/i)
    const allow = await sendJson({ server, method: 'POST', path: '/api/allowed-hosts/allow/rebind.attacker.example', host: 'rebind.attacker.example:3733' })
    assert.equal(allow.status, 403)
    assert.deepEqual(allowedHosts.saved(), ['saved.example.com'])
    assert.equal((await sendJson({ server, method: 'POST', path: '/api/allowed-hosts/allow/tv.example.com', host: 'saved.example.com' })).status, 200)
    assert.equal((await sendJson({ server, method: 'POST', path: '/api/allowed-hosts/allow/nas.example.com', host: 'freetvarr.lan:3733' })).status, 200)
  } finally {
    server.close()
  }
})
