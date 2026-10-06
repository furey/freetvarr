import { countryForTimeZone } from './zone-countries.js'

export const inspectSetup = async ({ http, conn }) => {
  const [tuners, networkGrid, channels, upcoming] = await Promise.all([
    listTuners({ http, conn }),
    http.get('mpegts/network/grid', { limit: GRID_LIMIT }, conn),
    countChannels({ http, conn }),
    http.get('dvr/entry/grid_upcoming', { limit: UPCOMING_LIMIT }, conn),
  ])
  const networks = (networkGrid?.entries || []).map(normaliseNetwork)
  const deliverySystem = primaryDeliverySystem(tuners)
  const candidates = deliverySystem
    ? tuners.filter((t) => t.deliverySystem === deliverySystem.id)
    : []
  const compatibleNetworks = candidates.length
    ? await listCompatibleNetworks({ http, conn, tunerId: candidates[0].id, networks })
    : []
  return {
    tuners,
    networks,
    channels,
    deliverySystem,
    compatibleNetworks,
    recordingNow: recordingsInProgress(upcoming?.entries || []),
  }
}

export const recordingsInProgress = (entries) => entries
  .filter((e) => String(e.sched_status || '').startsWith('recording'))
  .map((e) => ({ title: e.disp_title || '', stopMs: Number(e.stop_real || e.stop || 0) * 1000 }))

export const listTransmitters = async ({ http, conn, scanType, attempts = SCANFILE_ATTEMPTS, delayMs = 1000 }) => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const body = await http.get('dvb/scanfile/list', { type: scanType }, conn)
      return parseTransmitters(body?.entries || [])
    } catch (err) {
      if (err?.status !== 400 || attempt >= attempts) throw err
      await sleep(delayMs)
    }
  }
}

export const parseTransmitters = (entries) => entries
  .map(({ key, val }) => {
    const [, country = ''] = String(key).split('/')
    const [countryName = '', name = ''] = String(val).split(/:\s+/)
    return { key, country, countryName, name }
  })
  .filter((t) => t.name && t.country !== 'auto' && !HIDDEN_TRANSMITTER.test(t.name))

export const suggestChannelSetup = ({ inspection, transmitters = [], timeZone = '' }) => {
  const { tuners, deliverySystem, compatibleNetworks, channels } = inspection
  if (!tuners.length) return { state: 'no-tuner' }
  if (!deliverySystem) return { state: 'unsupported-tuner', tuners }
  const tunerIds = tuners.filter((t) => t.deliverySystem === deliverySystem.id).map((t) => t.id)
  const network = [...compatibleNetworks].sort((a, b) => b.services - a.services)[0] || null
  const country = countryForTimeZone(timeZone)
  const countries = listCountries(transmitters)
  const known = countries.some((c) => c.code === country)
  return {
    state: channels > 0 ? 'has-channels' : 'ready',
    deliverySystem,
    tunerIds,
    networkId: network?.id || null,
    country: known ? country : '',
    transmitterKey: known ? pickTransmitter({ transmitters, country, timeZone })?.key || '' : '',
    countries,
  }
}

export const listCountries = (transmitters) => {
  const byCode = new Map()
  for (const t of transmitters) if (!byCode.has(t.country)) byCode.set(t.country, t.countryName)
  return [...byCode].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name))
}

export const pickTransmitter = ({ transmitters, country, timeZone }) => {
  const city = squash(String(timeZone).split('/').pop())
  if (!city) return null
  const ranked = transmitters
    .filter((t) => t.country === country)
    .map((t) => ({ t, rank: cityRank({ city, name: squash(stripCountryPrefix(t)) }) }))
    .filter((r) => r.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.t.name.length - b.t.name.length)
  return ranked[0]?.t || null
}

export const summariseScan = ({ network, muxes }) => {
  const own = muxes.filter((m) => m.network_uuid === network.id)
  const queued = own.filter((m) => QUEUED_STATES.has(m.scan_state)).length
  const active = own.filter((m) => m.scan_state === SCAN_STATE_ACTIVE).length
  const received = own.filter((m) => RECEIVED_RESULTS.has(m.scan_result)).length
  return {
    frequencies: own.length,
    scanned: own.length - queued - active,
    received,
    queued,
    active,
    services: network.services,
    finished: own.length > 0 && queued === 0 && active === 0,
  }
}

export const tunersInUseElsewhere = ({ inputs, tuners }) => {
  const names = new Set(tuners.map((t) => t.name))
  return inputs.filter((i) => names.has(i.input) && Number(i.weight || 0) >= OTHER_USE_WEIGHT).length
}

export const isWaitingForTuner = ({ summary, inputs, tuners }) => summary.active === 0
  && summary.queued > 0
  && tuners.length > 0
  && tunersInUseElsewhere({ inputs, tuners }) >= tuners.length

export const isTvService = (service) => !NON_TV_SERVICE_TYPES.has(Number(service.dvb_servicetype))

export const unmappedTvServices = ({ services, muxIds }) => services
  .filter((s) => muxIds.has(s.multiplex_uuid))
  .filter((s) => s.enabled !== false && !s.encrypted)
  .filter((s) => !(s.channel || []).length)
  .filter(isTvService)

export const isMapperFinished = (status) => {
  const total = Number(status?.total || 0)
  const settled = Number(status?.ok || 0) + Number(status?.fail || 0) + Number(status?.ignore || 0)
  return !status?.active && settled >= total
}

export const tunerAddressConfig = ({ address, hostAddress, dockerVm }) => {
  const tuner = String(address ?? '').trim()
  if (!isLanAddress(tuner)) {
    return { field: 'address', error: `Enter the tuner's address as four numbers with dots, for example 192.168.1.50.` }
  }
  if (!dockerVm) return { node: { hdhomerun_ip: tuner } }
  const host = String(hostAddress ?? '').trim()
  if (!isLanAddress(host)) {
    return { field: 'hostAddress', error: `Enter this computer's address as four numbers with dots, for example 192.168.1.20.` }
  }
  if (host === tuner) return { field: 'hostAddress', error: 'The tuner and this computer cannot have the same address.' }
  return { node: { hdhomerun_ip: tuner, local_ip: host, local_port: TUNER_STREAM_PORT } }
}

export const isLanAddress = (value) => {
  const octets = String(value).match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)?.slice(1).map(Number)
  if (!octets || octets.some((o) => o > 255)) return false
  const [first] = octets
  return first !== 0 && first !== 127 && first < 224
}

export const readTunerAddress = async ({ http, conn }) => {
  const body = await http.get('config/load', {}, conn)
  const params = body?.entries?.[0]?.params || []
  const value = (id) => params.find((p) => p.id === id)?.value
  return { address: value('hdhomerun_ip') || '', hostAddress: value('local_ip') || '' }
}

export const saveTunerAddress = ({ http, conn, node }) =>
  http.post('config/save', { node: JSON.stringify(node) }, conn)

export const TUNER_STREAM_PORT = 9983

export const planChannelSetup = ({ networkId }) => ({
  steps: [
    { id: 'network', label: networkId ? 'Use the existing TV network' : 'Create the TV network' },
    { id: 'tuners', label: 'Turn on the tuners' },
    { id: 'scan', label: 'Scan for channels' },
    { id: 'map', label: 'Add the channels' },
    { id: 'recording', label: 'Check the recording settings' },
  ],
})

export const applyChannelSetup = async ({
  http,
  conn,
  tunerIds,
  networkId,
  transmitter,
  onProgress = () => {},
  pollMs = POLL_MS,
  scanLimitMs = SCAN_LIMIT_MS,
  mapLimitMs = MAP_LIMIT_MS,
  now = Date.now,
}) => {
  const progress = createProgress({ steps: planChannelSetup({ networkId }).steps, onProgress })
  const wait = (ms) => sleep(ms)
  let current = null
  const run = async (stepId, action) => {
    current = stepId
    progress.start(stepId)
    const result = await action()
    progress.done(stepId)
    return result
  }
  try {
    const inspection = await inspectSetup({ http, conn })
    const tuners = inspection.tuners.filter((t) => tunerIds.includes(t.id))
    if (!tuners.length) throw new SetupError('None of the chosen tuners is in TVHeadend now.', 'no-tuner')
    const network = await run('network', () => (networkId
      ? useNetwork({ inspection, networkId })
      : createNetwork({ http, conn, deliverySystem: inspection.deliverySystem, transmitter })))
    await run('tuners', () => attachTuners({ http, conn, tuners, networkId: network.id }))
    const scan = await run('scan', () => scanNetwork({
      http,
      conn,
      network,
      tuners,
      rescan: network.existing && network.services === 0,
      report: (detail) => progress.detail('scan', detail),
      wait,
      pollMs,
      limitMs: scanLimitMs,
      now,
    }))
    const mapped = await run('map', () => mapChannels({
      http,
      conn,
      networkId: network.id,
      report: (detail) => progress.detail('map', detail),
      wait,
      pollMs,
      limitMs: mapLimitMs,
      now,
    }))
    const channels = await countChannels({ http, conn })
    await run('recording', () => checkRecordingProfile({ http, conn }))
    return {
      ok: true,
      networkId: network.id,
      scan,
      mapped,
      channels,
      channelsBefore: inspection.channels,
      steps: progress.steps(),
    }
  } catch (err) {
    if (current) progress.fail(current)
    return {
      ok: false,
      failedStep: current,
      code: err?.code || null,
      error: err?.message || String(err),
      detail: err?.detail || null,
      steps: progress.steps(),
    }
  }
}

export class SetupError extends Error {
  constructor(message, code, detail = null) {
    super(message)
    this.name = 'SetupError'
    this.code = code
    this.detail = detail
  }
}

export const DELIVERY_SYSTEMS = {
  dvbt: { id: 'dvbt', label: 'Antenna (DVB-T)', scanType: 'dvbt', networkClass: 'dvb_network_dvbt' },
  dvbc: { id: 'dvbc', label: 'Cable (DVB-C)', scanType: 'dvbc', networkClass: 'dvb_network_dvbc' },
  atsc_t: { id: 'atsc_t', label: 'Antenna (ATSC)', scanType: 'atsc-t', networkClass: 'dvb_network_atsc_t' },
  atsc_c: { id: 'atsc_c', label: 'Cable (ATSC)', scanType: 'atsc-c', networkClass: 'dvb_network_atsc_c' },
  isdb_t: { id: 'isdb_t', label: 'Antenna (ISDB-T)', scanType: 'isdb-t', networkClass: 'dvb_network_isdb_t' },
}

const listTuners = async ({ http, conn }) => {
  const roots = await http.get('hardware/tree', { uuid: 'root' }, conn)
  return collectFrontends({ http, conn, nodes: Array.isArray(roots) ? roots : [], device: '' })
}

const collectFrontends = async ({ http, conn, nodes, device }) => {
  const found = []
  for (const node of nodes) {
    if (node.leaf) {
      if (isFrontend(node)) found.push(normaliseFrontend({ node, device }))
      continue
    }
    const children = await http.get('hardware/tree', { uuid: node.uuid }, conn)
    found.push(...await collectFrontends({
      http,
      conn,
      nodes: Array.isArray(children) ? children : [],
      device: node.text || device,
    }))
  }
  return found
}

const isFrontend = (node) => node.event === 'mpegts_input' || /_frontend_/.test(node.class || '')

const normaliseFrontend = ({ node, device }) => ({
  id: node.uuid,
  name: node.text || '',
  device,
  deliverySystem: deliverySystemOf(node.class),
  enabled: paramValue(node, 'enabled') !== false,
  networks: paramValue(node, 'networks') || [],
})

const deliverySystemOf = (className = '') => {
  const suffix = String(className).match(/_(dvbt|dvbc|dvbs|atsc_t|atsc_c|isdb_t|isdb_c|isdb_s)$/)?.[1]
  return suffix || null
}

const primaryDeliverySystem = (tuners) => {
  const counts = new Map()
  for (const t of tuners) {
    if (DELIVERY_SYSTEMS[t.deliverySystem]) counts.set(t.deliverySystem, (counts.get(t.deliverySystem) || 0) + 1)
  }
  const [top] = [...counts].sort((a, b) => b[1] - a[1])
  return top ? DELIVERY_SYSTEMS[top[0]] : null
}

const paramValue = (node, id) => (node.params || []).find((p) => p.id === id)?.value

const normaliseNetwork = (n) => ({
  id: n.uuid,
  name: n.networkname || '',
  muxes: Number(n.num_mux || 0),
  services: Number(n.num_svc || 0),
  channels: Number(n.num_chn || 0),
  queued: Number(n.scanq_length || 0),
})

const listCompatibleNetworks = async ({ http, conn, tunerId, networks }) => {
  const body = await http.get('mpegts/input/network_list', { uuid: tunerId }, conn)
  const ids = new Set((body?.entries || []).map((e) => e.key))
  return networks.filter((n) => ids.has(n.id))
}

const useNetwork = ({ inspection, networkId }) => {
  const network = inspection.compatibleNetworks.find((n) => n.id === networkId)
  if (!network) throw new SetupError('That TV network is not in TVHeadend now.', 'no-network')
  return { ...network, existing: true }
}

export const createNetwork = async ({ http, conn, deliverySystem, transmitter }) => {
  if (!transmitter?.key) throw new SetupError('Choose a transmitter first.', 'no-transmitter')
  const body = await http.post('mpegts/network/create', {
    class: deliverySystem.networkClass,
    conf: JSON.stringify({ networkname: transmitter.name, scanfile: transmitter.key }),
  }, conn)
  if (!body?.uuid) throw new SetupError('TVHeadend did not create the TV network.', 'no-uuid')
  return { id: body.uuid, name: transmitter.name, services: 0, existing: false }
}

const attachTuners = async ({ http, conn, tuners, networkId }) => {
  for (const tuner of tuners) {
    if (tuner.enabled && tuner.networks.includes(networkId)) continue
    await http.post('idnode/save', {
      node: JSON.stringify({ uuid: tuner.id, enabled: true, networks: [...new Set([...tuner.networks, networkId])] }),
    }, conn)
  }
}

const scanNetwork = async ({ http, conn, network, tuners, rescan, report, wait, pollMs, limitMs, now }) => {
  if (rescan) await http.post('mpegts/network/scan', { uuid: network.id }, conn)
  const startedAt = now()
  for (;;) {
    const summary = await readScan({ http, conn, networkId: network.id })
    const inputs = summary.active === 0 && summary.queued > 0 ? await readInputs({ http, conn }) : []
    report({ ...summary, waitingForTuner: isWaitingForTuner({ summary, inputs, tuners }) })
    if (summary.finished) {
      if (summary.services === 0) {
        throw new SetupError('The scan found no channels.', 'no-signal', summary)
      }
      return summary
    }
    if (now() - startedAt >= limitMs) throw new SetupError('The scan did not finish.', 'scan-timeout', summary)
    await wait(pollMs)
  }
}

const readScan = async ({ http, conn, networkId }) => {
  const [networks, muxes] = await Promise.all([
    http.get('mpegts/network/grid', { limit: GRID_LIMIT }, conn),
    http.get('mpegts/mux/grid', { limit: MUX_LIMIT }, conn),
  ])
  const entry = (networks?.entries || []).find((n) => n.uuid === networkId)
  if (!entry) throw new SetupError('The TV network disappeared from TVHeadend.', 'no-network')
  return summariseScan({ network: normaliseNetwork(entry), muxes: muxes?.entries || [] })
}

const readInputs = async ({ http, conn }) => {
  const body = await http.get('status/inputs', {}, conn).catch(() => null)
  return body?.entries || []
}

export const countChannels = async ({ http, conn }) => {
  const body = await http.get('channel/grid', { limit: 1 }, conn)
  return Number(body?.total ?? body?.entries?.length ?? 0)
}

const mapChannels = async ({ http, conn, networkId, report, wait, pollMs, limitMs, now }) => {
  const [muxes, services] = await Promise.all([
    http.get('mpegts/mux/grid', { limit: MUX_LIMIT }, conn),
    http.get('mpegts/service/grid', { limit: SERVICE_LIMIT }, conn),
  ])
  const muxIds = new Set((muxes?.entries || []).filter((m) => m.network_uuid === networkId).map((m) => m.uuid))
  const pending = unmappedTvServices({ services: services?.entries || [], muxIds })
  if (!pending.length) {
    report({ total: 0, ok: 0, fail: 0 })
    return { total: 0, ok: 0, fail: 0 }
  }
  await http.post('service/mapper/save', {
    node: JSON.stringify({
      services: pending.map((s) => s.uuid),
      check_availability: true,
      merge_same_name: true,
      encrypted: false,
      type_tags: false,
      provider_tags: false,
      network_tags: false,
    }),
  }, conn)
  const startedAt = now()
  for (;;) {
    const status = await http.get('service/mapper/status', {}, conn)
    const counts = { total: Number(status?.total || 0), ok: Number(status?.ok || 0), fail: Number(status?.fail || 0) }
    const started = counts.total > 0 || Boolean(status?.active)
    if (started) report(counts)
    if (!started && now() - startedAt < MAP_START_GRACE_MS) {
      await wait(pollMs)
      continue
    }
    if (isMapperFinished(status)) {
      if (counts.ok === 0) throw new SetupError('TVHeadend could not add any channels.', 'map-empty', counts)
      return counts
    }
    if (now() - startedAt >= limitMs) throw new SetupError('Adding channels did not finish.', 'map-timeout', counts)
    await wait(pollMs)
  }
}

export const checkRecordingProfile = async ({ http, conn }) => {
  const body = await http.get('dvr/config/grid', {}, conn)
  const profile = (body?.entries || []).find((c) => c.name === '')
  if (!profile || Number(profile['rerecord-errors']) !== IMAGE_DEFAULT_RERECORD_ERRORS) return { changed: false }
  await http.post('idnode/save', { node: JSON.stringify({ uuid: profile.uuid, 'rerecord-errors': 0 }) }, conn)
  return { changed: true }
}

const createProgress = ({ steps, onProgress }) => {
  const state = steps.map((s) => ({ id: s.id, label: s.label, status: 'pending', detail: null }))
  const update = (id, patch) => {
    const step = state.find((s) => s.id === id)
    if (step) Object.assign(step, patch)
    onProgress(snapshot())
  }
  const snapshot = () => state.map((s) => ({ ...s }))
  return {
    start: (id) => update(id, { status: 'running' }),
    done: (id) => update(id, { status: 'done' }),
    fail: (id) => update(id, { status: 'failed' }),
    detail: (id, detail) => update(id, { detail }),
    steps: snapshot,
  }
}

const cityRank = ({ city, name }) => {
  if (name === city) return 0
  if (name.startsWith(city)) return 1
  if (name.includes(city)) return 2
  return null
}

const stripCountryPrefix = (t) => t.name.replace(new RegExp(`^${t.country}-`, 'i'), '')

const squash = (value = '') => String(value).toLowerCase().replace(/[^a-z0-9]/g, '')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const SCANFILE_ATTEMPTS = 10
const HIDDEN_TRANSMITTER = /-(all|unknown)$/i
const QUEUED_STATES = new Set([1, 2])
const SCAN_STATE_ACTIVE = 3
const RECEIVED_RESULTS = new Set([1, 3])
const NON_TV_SERVICE_TYPES = new Set([2, 3, 4, 5, 7, 10, 12])
const IMAGE_DEFAULT_RERECORD_ERRORS = 10
const GRID_LIMIT = 100
const UPCOMING_LIMIT = 1000
const MUX_LIMIT = 1000
const SERVICE_LIMIT = 5000
const POLL_MS = 2000
const OTHER_USE_WEIGHT = 10
const SCAN_LIMIT_MS = 30 * 60_000
const MAP_LIMIT_MS = 20 * 60_000
const MAP_START_GRACE_MS = 15_000
