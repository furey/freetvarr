import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  applyChannelSetup,
  inspectSetup,
  isMapperFinished,
  parseTransmitters,
  pickTransmitter,
  suggestChannelSetup,
  summariseScan,
  unmappedTvServices,
} from '../src/tvheadend-setup.js'
import { countryForTimeZone } from '../src/zone-countries.js'

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/tvh-setup/${name}.json`, import.meta.url)))

const NETWORK_ID = '72404162f35f8bda3f95001dbda29791'
const CONN = { url: 'http://tvh.test:9981', username: 'freetvarr', password: 'x' }

const liveTvheadend = () => {
  const reads = {
    'hardware/tree:root': fixture('hardware-root'),
    [`hardware/tree:${fixture('hardware-root')[0].uuid}`]: fixture('hardware-device'),
    'mpegts/network/grid': fixture('network-grid'),
    'mpegts/mux/grid': fixture('mux-grid'),
    'mpegts/service/grid': fixture('service-grid'),
    'channel/grid': fixture('channel-grid'),
    'dvr/config/grid': fixture('dvr-config-grid'),
    'service/mapper/status': fixture('mapper-status'),
    'mpegts/input/network_list': { entries: [{ key: NETWORK_ID, val: 'Free-to-air' }] },
  }
  const writes = []
  return {
    writes,
    get: async (path, params = {}) => {
      const key = path === 'hardware/tree' ? `${path}:${params.uuid}` : path
      if (!(key in reads)) throw new Error(`unexpected read ${key}`)
      return reads[key]
    },
    post: async (path, form) => {
      writes.push({ path, form })
      return {}
    },
  }
}

const transmitters = () => parseTransmitters(fixture('scanfile-dvbt').entries)

test('inspectSetup reads tuners, networks, and channels from the live fixtures', async () => {
  const inspection = await inspectSetup({ http: liveTvheadend(), conn: CONN })
  assert.equal(inspection.tuners.length, 4)
  assert.deepEqual(new Set(inspection.tuners.map((t) => t.deliverySystem)), new Set(['dvbt']))
  assert.ok(inspection.tuners.every((t) => t.enabled && t.networks.includes(NETWORK_ID)))
  assert.match(inspection.tuners[0].device, /HDHomeRun/)
  assert.equal(inspection.deliverySystem.networkClass, 'dvb_network_dvbt')
  assert.equal(inspection.networks[0].services, 59)
  assert.deepEqual(inspection.compatibleNetworks.map((n) => n.id), [NETWORK_ID])
  assert.ok(inspection.channels > 0)
})

test('parseTransmitters keeps the truncated key and hides country-wide and automatic lists', () => {
  const list = transmitters()
  const sydney = list.find((t) => t.name === 'au-Sydney')
  assert.equal(sydney.key, 'dvbt/au/dvb-t_au-Sydne')
  assert.equal(sydney.countryName, 'Australia')
  assert.ok(!list.some((t) => t.name === 'au-ALL' || t.name === 'au-unknown'))
  assert.ok(!list.some((t) => t.country === 'auto'))
})

test('pickTransmitter matches the time zone city, preferring the exact and then the shortest name', () => {
  const list = transmitters()
  assert.equal(pickTransmitter({ transmitters: list, country: 'au', timeZone: 'Australia/Sydney' }).name, 'au-Sydney')
  assert.equal(pickTransmitter({ transmitters: list, country: 'au', timeZone: 'Australia/Melbourne' }).name, 'au-Melbourne')
  assert.equal(pickTransmitter({ transmitters: list, country: 'au', timeZone: 'Australia/Hobart' }).name, 'au-Hobart')
  assert.equal(pickTransmitter({ transmitters: list, country: 'au', timeZone: 'Australia/Lord_Howe' }), null)
})

test('countryForTimeZone maps zones to scan list countries and leaves unknown zones blank', () => {
  assert.equal(countryForTimeZone('Australia/Perth'), 'au')
  assert.equal(countryForTimeZone('Pacific/Auckland'), 'nz')
  assert.equal(countryForTimeZone('Europe/London'), 'uk')
  assert.equal(countryForTimeZone('America/Indiana/Indianapolis'), 'us')
  assert.equal(countryForTimeZone('Asia/Tokyo'), '')
  assert.equal(countryForTimeZone(''), '')
})

test('suggestChannelSetup pre-fills the tuners, the existing network, and a transmitter from the zone', async () => {
  const inspection = await inspectSetup({ http: liveTvheadend(), conn: CONN })
  const suggestion = suggestChannelSetup({ inspection, transmitters: transmitters(), timeZone: 'Australia/Sydney' })
  assert.equal(suggestion.state, 'has-channels')
  assert.equal(suggestion.tunerIds.length, 4)
  assert.equal(suggestion.networkId, NETWORK_ID)
  assert.equal(suggestion.country, 'au')
  assert.equal(suggestion.transmitterKey, 'dvbt/au/dvb-t_au-Sydne')
  assert.ok(suggestion.countries.some((c) => c.code === 'au' && c.name === 'Australia'))
})

test('suggestChannelSetup reports no tuner, an unsupported tuner, and leaves an unknown country blank', () => {
  const base = { networks: [], channels: 0, compatibleNetworks: [] }
  assert.equal(suggestChannelSetup({ inspection: { ...base, tuners: [], deliverySystem: null } }).state, 'no-tuner')
  const satellite = { id: 's', deliverySystem: 'dvbs', enabled: false, networks: [] }
  assert.equal(
    suggestChannelSetup({ inspection: { ...base, tuners: [satellite], deliverySystem: null } }).state,
    'unsupported-tuner',
  )
  const tuner = { id: 't', deliverySystem: 'dvbt', enabled: false, networks: [] }
  const fresh = suggestChannelSetup({
    inspection: { ...base, tuners: [tuner], deliverySystem: { id: 'dvbt' } },
    transmitters: transmitters(),
    timeZone: 'Asia/Tokyo',
  })
  assert.equal(fresh.state, 'ready')
  assert.equal(fresh.networkId, null)
  assert.equal(fresh.country, '')
  assert.equal(fresh.transmitterKey, '')
})

test('summariseScan counts the network muxes and finishes only when none is queued or active', () => {
  const network = { id: NETWORK_ID, services: 59 }
  const muxes = fixture('mux-grid').entries
  const done = summariseScan({ network, muxes })
  assert.deepEqual(
    { frequencies: done.frequencies, scanned: done.scanned, received: done.received, finished: done.finished },
    { frequencies: 5, scanned: 5, received: 5, finished: true },
  )
  const midScan = muxes.map((m, i) => ({ ...m, scan_state: i === 0 ? 3 : i < 3 ? 1 : 0, scan_result: i < 3 ? 0 : 1 }))
  const running = summariseScan({ network, muxes: midScan })
  assert.equal(running.finished, false)
  assert.equal(running.active, 1)
  assert.equal(running.queued, 2)
  assert.equal(summariseScan({ network, muxes: [] }).finished, false)
  assert.equal(summariseScan({ network: { id: 'other', services: 0 }, muxes }).frequencies, 0)
})

test('unmappedTvServices keeps unmapped TV services on the network and drops radio', () => {
  const services = fixture('service-grid').entries
  const muxIds = new Set(fixture('mux-grid').entries.map((m) => m.uuid))
  assert.deepEqual(unmappedTvServices({ services, muxIds }), [], 'every unmapped live service is radio')
  const fresh = services.map((s) => ({ ...s, channel: [] }))
  const pending = unmappedTvServices({ services: fresh, muxIds })
  assert.equal(pending.length, 41, "42 TV services less one disabled")
  assert.ok(pending.every((s) => ![2, 10].includes(s.dvb_servicetype)))
  assert.equal(unmappedTvServices({ services, muxIds: new Set() }).length, 0)
})

test('isMapperFinished waits for the active service and every queued result', () => {
  assert.equal(isMapperFinished({ total: 0, ok: 0, fail: 0, ignore: 0 }), true)
  assert.equal(isMapperFinished({ total: 10, ok: 4, fail: 1, ignore: 2, active: 'uuid' }), false)
  assert.equal(isMapperFinished({ total: 10, ok: 4, fail: 1, ignore: 2 }), false)
  assert.equal(isMapperFinished({ total: 10, ok: 7, fail: 1, ignore: 2 }), true)
})

const scriptedTvheadend = ({ scanFrames, mapperFrames, tuner = { enabled: false, networks: [] }, rerecord = 10 }) => {
  const writes = []
  let networkId = null
  let scanFrame = 0
  let mapperFrame = 0
  const frontend = {
    uuid: 'fe1',
    text: 'Tuner #0',
    class: 'tvhdhomerun_frontend_dvbt',
    leaf: 1,
    event: 'mpegts_input',
    params: [{ id: 'enabled', value: tuner.enabled }, { id: 'networks', value: tuner.networks }],
  }
  const current = () => scanFrames[Math.min(scanFrame, scanFrames.length - 1)]
  const network = () => ({ uuid: networkId, networkname: 'au-Sydney', num_svc: current().services, num_mux: 2 })
  const reads = {
    'hardware/tree': (p) => (p.uuid === 'root' ? [{ uuid: 'dev', text: 'HDHomeRun', leaf: 0 }] : [frontend]),
    'mpegts/network/grid': () => ({ entries: networkId ? [network()] : [] }),
    'mpegts/input/network_list': () => ({ entries: networkId ? [{ key: networkId }] : [] }),
    'channel/grid': () => ({ total: 0, entries: [] }),
    'mpegts/mux/grid': () => {
      const frame = current()
      scanFrame += 1
      return {
        entries: frame.muxes.map(([state, result], i) => ({
          uuid: `mux${i}`, network_uuid: networkId, scan_state: state, scan_result: result,
        })),
      }
    },
    'mpegts/service/grid': () => ({
      entries: [
        { uuid: 'tv1', multiplex_uuid: 'mux0', dvb_servicetype: 25, channel: [], enabled: true },
        { uuid: 'radio1', multiplex_uuid: 'mux0', dvb_servicetype: 2, channel: [], enabled: true },
        { uuid: 'mapped', multiplex_uuid: 'mux1', dvb_servicetype: 1, channel: ['c1'], enabled: true },
      ],
    }),
    'service/mapper/status': () => mapperFrames[Math.min(mapperFrame++, mapperFrames.length - 1)],
    'dvr/config/grid': () => ({ entries: [{ uuid: 'dvr', name: '', 'rerecord-errors': rerecord }] }),
  }
  return {
    writes,
    get: async (path, params = {}) => reads[path](params),
    post: async (path, form) => {
      writes.push({ path, form })
      if (path === 'mpegts/network/create') {
        networkId = 'net1'
        return { uuid: networkId }
      }
      return {}
    },
  }
}

const fastClock = () => {
  let t = 0
  return { now: () => (t += 1000) }
}

const transmitter = { key: 'dvbt/au/dvb-t_au-Sydne', name: 'au-Sydney' }

test('applyChannelSetup creates the network, turns on the tuner, scans, maps TV only, and fixes rerecord', async () => {
  const http = scriptedTvheadend({
    scanFrames: [
      { services: 0, muxes: [[3, 0], [1, 0]] },
      { services: 12, muxes: [[0, 1], [3, 0]] },
      { services: 20, muxes: [[0, 1], [0, 2]] },
    ],
    mapperFrames: [{ total: 1, ok: 0, fail: 0, ignore: 0, active: 'tv1' }, { total: 1, ok: 1, fail: 0, ignore: 0 }],
  })
  const progress = []
  const result = await applyChannelSetup({
    http,
    conn: CONN,
    tunerIds: ['fe1'],
    networkId: null,
    transmitter,
    onProgress: (steps) => progress.push(steps),
    pollMs: 0,
    ...fastClock(),
  })
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(result.scan.services, 20)
  assert.equal(result.scan.received, 1)
  assert.deepEqual(result.mapped, { total: 1, ok: 1, fail: 0 })
  const paths = http.writes.map((w) => w.path)
  assert.deepEqual(paths, ['mpegts/network/create', 'idnode/save', 'service/mapper/save', 'idnode/save'])
  const create = http.writes[0].form
  assert.equal(create.class, 'dvb_network_dvbt')
  assert.deepEqual(JSON.parse(create.conf), { networkname: 'au-Sydney', scanfile: 'dvbt/au/dvb-t_au-Sydne' })
  assert.deepEqual(JSON.parse(http.writes[1].form.node), { uuid: 'fe1', enabled: true, networks: ['net1'] })
  assert.deepEqual(JSON.parse(http.writes[2].form.node).services, ['tv1'])
  assert.deepEqual(JSON.parse(http.writes[3].form.node), { uuid: 'dvr', 'rerecord-errors': 0 })
  assert.ok(result.steps.every((s) => s.status === 'done'))
  assert.ok(progress.some((steps) => steps.find((s) => s.id === 'scan').detail?.scanned === 1))
})

test('applyChannelSetup reuses a network, keeps a user-set rerecord value, and skips a scan that has services', async () => {
  const http = scriptedTvheadend({
    scanFrames: [{ services: 20, muxes: [[0, 1], [0, 1]] }],
    mapperFrames: [{ total: 1, ok: 1, fail: 0, ignore: 0 }],
    rerecord: 3,
  })
  await http.post('mpegts/network/create', {})
  http.writes.length = 0
  const result = await applyChannelSetup({
    http, conn: CONN, tunerIds: ['fe1'], networkId: 'net1', pollMs: 0, ...fastClock(),
  })
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.deepEqual(http.writes.map((w) => w.path), ['idnode/save', 'service/mapper/save'])
})

test('applyChannelSetup reports a scan with no channels as no-signal', async () => {
  const http = scriptedTvheadend({
    scanFrames: [{ services: 0, muxes: [[0, 2], [0, 2]] }],
    mapperFrames: [{ total: 0, ok: 0, fail: 0, ignore: 0 }],
  })
  const result = await applyChannelSetup({
    http, conn: CONN, tunerIds: ['fe1'], networkId: null, transmitter, pollMs: 0, ...fastClock(),
  })
  assert.equal(result.ok, false)
  assert.equal(result.failedStep, 'scan')
  assert.equal(result.code, 'no-signal')
  assert.equal(result.steps.find((s) => s.id === 'scan').status, 'failed')
})

test('applyChannelSetup flags a stalled scan as waiting for a tuner, then times out', async () => {
  const http = scriptedTvheadend({
    scanFrames: [{ services: 0, muxes: [[1, 0], [1, 0]] }],
    mapperFrames: [{ total: 0, ok: 0, fail: 0, ignore: 0 }],
  })
  const details = []
  const result = await applyChannelSetup({
    http,
    conn: CONN,
    tunerIds: ['fe1'],
    networkId: null,
    transmitter,
    pollMs: 0,
    stallMs: 5000,
    scanLimitMs: 20_000,
    onProgress: (steps) => details.push(steps.find((s) => s.id === 'scan').detail),
    ...fastClock(),
  })
  assert.equal(result.code, 'scan-timeout')
  assert.ok(details.some((d) => d?.waitingForTuner === true))
})

test('applyChannelSetup refuses tuners that are not in TVHeadend', async () => {
  const http = scriptedTvheadend({ scanFrames: [{ services: 0, muxes: [] }], mapperFrames: [{}] })
  const result = await applyChannelSetup({ http, conn: CONN, tunerIds: ['gone'], networkId: null, transmitter })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'no-tuner')
  assert.deepEqual(http.writes, [])
})
