import net from 'net'
import os from 'os'

import { GUIDE_FEED_PATH } from './guide-feed.js'
import { hostRefusedPage } from './host-refused-page.js'

export const ALLOWED_HOSTS_KEY = 'allowed_hosts'
export const SEEN_HOSTS_KEY = 'host_check_seen'
export const ANY_HOST = '*'
export const HOST_NOT_ALLOWED = 'host-not-allowed'

export const createHostGate = ({ allowedHosts, seenHosts, exempt = isExemptRequest, machineNames = machineNamesOf(), directUrlOf = directUrlOfRequest }) =>
  (req, res, next) => {
    if (exempt(req)) return next()
    const refusal = refusalOf({ req, extra: allowedHosts.current(), machineNames })
    if (!refusal) return next()
    if (refusal.name) seenHosts.note({ hostname: refusal.name, from: req.ip, pageLoad: isUserPageLoad(req) })
    refuse({ req, res, name: refusal.name, directUrl: directUrlOf(req) })
  }

export const isAllowedHost = ({ hostname, extra = [], machineNames = [] }) => {
  if (!hostname || extra.includes(ANY_HOST)) return true
  if (net.isIP(hostname)) return true
  if (!hostname.includes('.')) return true
  if (PRIVATE_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))) return true
  if (machineNames.includes(hostname)) return true
  return extra.some((entry) => matchesEntry({ hostname, entry }))
}

export const normaliseHostname = (raw) => {
  const text = String(raw ?? '').trim().toLowerCase()
  const bracketed = text.match(/^\[([^\]]*)\](?::\d*)?$/)
  if (bracketed) return bracketed[1]
  if (net.isIP(text)) return text
  const name = text.replace(/:\d*$/, '')
  return name.endsWith('.') ? name.slice(0, -1) : name
}

export const isUserPageLoad = (req) => req.get('sec-fetch-mode') === 'navigate'
  && req.get('sec-fetch-dest') === 'document'
  && req.get('sec-fetch-site') === 'none'

const refusalOf = ({ req, extra, machineNames }) => {
  const forwarded = isForwardedHostTrusted(req) ? normaliseHostname(req.hostname) : null
  if (forwarded === '') return { name: '' }
  const name = [forwarded, normaliseHostname(req.get('host'))]
    .filter((candidate) => candidate !== null)
    .find((candidate) => !isAllowedHost({ hostname: candidate, extra, machineNames }))
  return name === undefined ? null : { name }
}

export const directUrlOfRequest = (req) => {
  const address = String(req.socket?.localAddress || '').replace(/^::ffff:/, '')
  if (!net.isIP(address) || isLoopback(address) || isDockerBridge(address)) return null
  const host = net.isIPv6(address) ? `[${address}]` : address
  return `http://${host}:${req.socket.localPort}/`
}

export const isExemptRequest = (req) => (req.method === 'GET' || req.method === 'HEAD') && EXEMPT_PATHS.includes(req.path)

export const machineNamesOf = (hostname = os.hostname()) => {
  const full = normaliseHostname(hostname)
  const first = full.split('.')[0]
  return [...new Set([full, first].filter(Boolean))]
}

export const parseAllowedHosts = (input) => {
  const entries = (Array.isArray(input) ? input : String(input ?? '').split(/[\s,]+/))
    .map((entry) => String(entry).trim())
    .filter(Boolean)
  const hosts = []
  const invalid = []
  for (const entry of entries) {
    const host = allowedHostOf(entry)
    if (!host) invalid.push(entry)
    else if (!hosts.includes(host)) hosts.push(host)
  }
  return { hosts, invalid }
}

export const allowedHostsErrorOf = (invalid) => `${invalid.join(', ')} ${invalid.length === 1 ? 'is not a hostname' : 'are not hostnames'}. Enter a name such as freetvarr.example.com, with no http://, port, or path.`

export const createAllowedHosts = ({ readSetting, writeSetting, envText = process.env.FREETVARR_ALLOWED_HOSTS, log = console.warn }) => {
  const env = parseAllowedHosts(envText)
  if (env.invalid.length) log(`[host-check] FREETVARR_ALLOWED_HOSTS: ${allowedHostsErrorOf(env.invalid)}`)
  let saved = []
  let combined = env.hosts

  const remember = (hosts) => {
    saved = hosts
    combined = [...new Set([...saved, ...env.hosts])]
  }

  return {
    load: async () => remember(parseAllowedHosts(await readSetting(ALLOWED_HOSTS_KEY)).hosts),
    save: async (hosts) => {
      await writeSetting(ALLOWED_HOSTS_KEY, hosts.join('\n'))
      remember(hosts)
    },
    current: () => combined,
    saved: () => saved,
    fromEnv: () => env.hosts,
    allowsAnyHost: () => combined.includes(ANY_HOST),
  }
}

export const createSeenHosts = ({ max = MAX_SEEN_HOSTS, now = Date.now, log = console.log, readSetting, writeSetting }) => {
  const seen = new Map()
  const logBudget = createLogBudget({ now, log })
  let saveTimer = null
  let saveDueAt = Infinity
  let lastSaveAt = -Infinity
  let saving = Promise.resolve()

  const flush = () => {
    clearTimeout(saveTimer)
    saveTimer = null
    saveDueAt = Infinity
    lastSaveAt = now()
    const entries = JSON.stringify([...seen.values()])
    saving = saving
      .then(() => writeSetting(SEEN_HOSTS_KEY, entries))
      .catch((err) => console.warn(`[host-check] could not save the names seen: ${err.message}`))
    return saving
  }

  const saveWithin = (delayMs) => {
    const dueAt = now() + delayMs
    if (dueAt >= saveDueAt) return
    clearTimeout(saveTimer)
    saveDueAt = dueAt
    saveTimer = setTimeout(flush, Math.max(0, delayMs))
    saveTimer.unref?.()
  }

  const note = ({ hostname, from, pageLoad = false }) => {
    const name = hostname.slice(0, MAX_NAME_LENGTH)
    const at = now()
    const before = seen.get(name)
    const entry = {
      name,
      count: (before?.count || 0) + 1,
      first_seen: before?.first_seen ?? at,
      last_seen: at,
      from: String(from || '').replace(/^::ffff:/, ''),
      page_load: Boolean(before?.page_load || pageLoad),
      logged_at: before?.logged_at ?? null,
    }
    if ((entry.logged_at == null || at - entry.logged_at >= DAY_MS) && logBudget.spend(`[host-check] refused ${name} from ${entry.from}; add it to Allowed hostnames if you use it`)) {
      entry.logged_at = at
    }
    seen.delete(name)
    seen.set(name, entry)
    while (seen.size > max) seen.delete(seen.keys().next().value)
    const isNews = !before || (pageLoad && !before.page_load)
    saveWithin(isNews ? lastSaveAt + NEW_NAME_SAVE_GAP_MS - at : KNOWN_NAME_SAVE_DELAY_MS)
    if (isNews && at - lastSaveAt >= NEW_NAME_SAVE_GAP_MS) flush()
  }

  const load = async () => {
    seen.clear()
    for (const entry of seenEntriesFrom(await readSetting(SEEN_HOSTS_KEY)).slice(-max)) seen.set(entry.name, entry)
  }

  const forget = async () => {
    clearTimeout(saveTimer)
    saveTimer = null
    saveDueAt = Infinity
    await saving
    seen.clear()
  }

  const list = () => [...seen.values()].reverse()

  return { note, load, list, flush, forget }
}

export const hostCheckReport = ({ allowedHosts, seenHosts, machineNames = machineNamesOf(), now = Date.now(), windowMs = SEEN_WINDOW_MS }) => {
  const extra = allowedHosts.current()
  return {
    anyHost: allowedHosts.allowsAnyHost(),
    added: extra.length,
    seen: seenHosts.list()
      .filter((entry) => now - entry.last_seen <= windowMs)
      .filter((entry) => !isAllowedHost({ hostname: entry.name, extra, machineNames }))
      .map((entry) => ({ ...entry, page_load: Boolean(entry.page_load), allowable: isSaveableHost(entry.name) })),
  }
}

export const mountAllowedHosts = ({ app, csrf, limiter, allowedHosts, seenHosts, machineNames = machineNamesOf() }) => {
  const state = () => ({
    hosts: allowedHosts.saved(),
    env_hosts: allowedHosts.fromEnv(),
    any_host: allowedHosts.allowsAnyHost(),
    seen: hostCheckReport({ allowedHosts, seenHosts, machineNames }).seen.map(({ name, count, last_seen: lastSeen, from }) => ({ name, count, last_seen: lastSeen, from })),
  })

  app.get('/api/allowed-hosts', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json(state())
  })

  app.put('/api/allowed-hosts', limiter, csrf, async (req, res) => {
    const { hosts, invalid } = parseAllowedHosts(req.body?.hosts)
    if (invalid.length) return res.status(400).json({ error: allowedHostsErrorOf(invalid) })
    if (hosts.length > MAX_ALLOWED_HOSTS) return res.status(400).json({ error: `Add up to ${MAX_ALLOWED_HOSTS} names.` })
    await allowedHosts.save(hosts)
    res.json(state())
  })

  app.post('/api/allowed-hosts/allow/:name', limiter, csrf, async (req, res) => {
    const { hosts: [host] = [], invalid } = parseAllowedHosts([req.params.name])
    if (!host || invalid.length || host.includes(ANY_HOST)) return res.status(400).json({ error: allowedHostsErrorOf([req.params.name]) })
    const saved = allowedHosts.saved()
    if (!saved.includes(host)) await allowedHosts.save([...saved, host])
    res.json(state())
  })
}

const isForwardedHostTrusted = (req) => req.get('x-forwarded-host') !== undefined
  && Boolean(req.app?.get('trust proxy fn')?.(req.socket?.remoteAddress, 0))

const isLoopback = (address) => address === '::1' || address.startsWith('127.')

const isDockerBridge = (address) => /^172\.(1[6-9]|2\d|3[01])\./.test(address)

const refuse = ({ req, res, name, directUrl }) => {
  res.status(403).setHeader('Cache-Control', 'no-store')
  if (req.accepts(['json', 'html']) === 'html') return res.type('html').send(hostRefusedPage({ name, directUrl }))
  res.json({ error: refusedMessageOf(name), code: HOST_NOT_ALLOWED })
}

const refusedMessageOf = (name) => `${name || 'This hostname'} is not on Allowed hostnames. Open Freetvarr by its IP address to add it.`

const allowedHostOf = (entry) => {
  if (entry === ANY_HOST) return ANY_HOST
  const host = entry.toLowerCase().replace(/\.$/, '')
  if (host.length > MAX_NAME_LENGTH || !HOST_ENTRY.test(host)) return null
  if (host.startsWith('*.') && host.split('.').length < 3) return null
  return host
}

const isSaveableHost = (name) => {
  const host = allowedHostOf(name)
  return Boolean(host) && host !== ANY_HOST && !host.startsWith('*.')
}

const createLogBudget = ({ now, log }) => {
  let hourStartedAt = -Infinity
  let lines = 0
  return {
    spend: (line) => {
      const at = now()
      if (at - hourStartedAt >= HOUR_MS) {
        hourStartedAt = at
        lines = 0
      }
      lines += 1
      if (lines <= LOG_LINES_PER_HOUR) {
        log(line)
        return true
      }
      if (lines === LOG_LINES_PER_HOUR + 1) log(LOG_BUDGET_SPENT)
      return false
    },
  }
}

const matchesEntry = ({ hostname, entry }) => {
  if (!entry.startsWith('*.')) return hostname === entry
  return hostname.endsWith(entry.slice(1))
}

const seenEntriesFrom = (raw) => {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed.filter(isSeenEntry) : []
  } catch {
    return []
  }
}

const isSeenEntry = (entry) => typeof entry?.name === 'string' && Number.isFinite(entry.count) && Number.isFinite(entry.last_seen)

const LABEL = '[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?'
const HOST_ENTRY = new RegExp(`^(?:\\*\\.)?${LABEL}(?:\\.${LABEL})*$`)
const PRIVATE_SUFFIXES = ['localhost', 'local', 'lan', 'home', 'home.arpa', 'internal', 'localdomain', 'corp']
const EXEMPT_PATHS = ['/healthz', GUIDE_FEED_PATH]
const MAX_NAME_LENGTH = 253
const MAX_SEEN_HOSTS = 50
const MAX_ALLOWED_HOSTS = 100
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const SEEN_WINDOW_MS = 14 * DAY_MS
const NEW_NAME_SAVE_GAP_MS = 60_000
const KNOWN_NAME_SAVE_DELAY_MS = HOUR_MS
const LOG_LINES_PER_HOUR = 10
const LOG_BUDGET_SPENT = '[host-check] more refused names this hour; see Health'
