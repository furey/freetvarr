import { test } from 'node:test'
import assert from 'node:assert/strict'

import { tvhRead, tvhWrite } from '../../src/tvheadend.js'
import {
  DELIVERY_SYSTEMS,
  checkRecordingProfile,
  createNetwork,
  inspectSetup,
  listTransmitters,
  suggestChannelSetup,
  summariseScan,
} from '../../src/tvheadend-setup.js'
import { dockerAvailable, eventually, startTvheadend } from './tvheadend-container.js'

test('channel setup reads a tuner-less TVHeadend, creates a network from a scan list, and fixes rerecord', { timeout: 300_000 }, async (t) => {
  if (!(await dockerAvailable())) return t.skip('docker is not available')
  const tvh = await startTvheadend()
  t.after(() => tvh.stop())
  const http = { get: tvhRead, post: tvhWrite }
  const conn = { url: tvh.url, username: '', password: '' }

  const inspection = await inspectSetup({ http, conn })
  assert.deepEqual(inspection.tuners, [])
  assert.equal(inspection.channels, 0)
  assert.equal(suggestChannelSetup({ inspection }).state, 'no-tuner')

  const transmitters = await listTransmitters({ http, conn, scanType: 'dvbt' })
  const sydney = transmitters.find((tx) => tx.name === 'au-Sydney')
  assert.ok(sydney, 'the image ships the au-Sydney scan list')
  assert.equal(sydney.countryName, 'Australia')

  const network = await createNetwork({ http, conn, deliverySystem: DELIVERY_SYSTEMS.dvbt, transmitter: sydney })
  const created = await eventually(async () => {
    const [grid, muxes] = await Promise.all([
      tvhRead('mpegts/network/grid', {}, conn),
      tvhRead('mpegts/mux/grid', { limit: 1000 }, conn),
    ])
    const entry = grid.entries.find((n) => n.uuid === network.id)
    const summary = summariseScan({ network: { id: network.id, services: entry?.num_svc ?? 0 }, muxes: muxes.entries })
    return entry?.networkname === 'au-Sydney' && summary.frequencies > 0 && summary.queued > 0 && !summary.finished
  })
  assert.equal(created, true, 'the new network has queued frequencies that never finish without a tuner')

  assert.deepEqual(await checkRecordingProfile({ http, conn }), { changed: true })
  const profiles = await tvhRead('dvr/config/grid', {}, conn)
  assert.equal(profiles.entries.find((c) => c.name === '')['rerecord-errors'], 0)
  assert.deepEqual(await checkRecordingProfile({ http, conn }), { changed: false })
})
