import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import http from 'node:http'

import { tvhRead, tvhWrite } from '../../src/tvheadend.js'
import { applyGuideSetup, inspectGuide, suggestGuide } from '../../src/tvheadend-guide.js'
import { dockerAvailable, startTvheadend } from './tvheadend-container.js'

const feedHead = readFileSync(new URL('../fixtures/tvh-setup/mjh-sydney-channels.xml', import.meta.url), 'utf8')

test('guide setup turns on the URL grabber, saves the guide, and loads the feed channels', { timeout: 300_000 }, async (t) => {
  if (!(await dockerAvailable())) return t.skip('docker is not available')
  const feed = await serveFeed(`${feedHead}</tv>\n`)
  t.after(() => feed.close())
  const tvh = await startTvheadend()
  t.after(() => tvh.stop())
  const api = { get: tvhRead, post: tvhWrite }
  const conn = { url: tvh.url, username: '', password: '' }

  const before = await inspectGuide({ http: api, conn })
  assert.equal(before.module.enabled, false)
  assert.equal(suggestGuide({ inspection: before, timeZone: 'Australia/Sydney' }).state, 'ready')

  const result = await applyGuideSetup({
    http: api,
    conn,
    url: `http://host.docker.internal:${feed.port}/epg.xml`,
    fetchFeed: async () => (await import('../../src/tvheadend-guide.js')).parseFeedChannels(feedHead),
    pollMs: 2000,
  })
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(result.total, 0)
  assert.equal(result.options.length, 120)

  const after = await inspectGuide({ http: api, conn })
  assert.equal(after.module.enabled, true)
  assert.equal(after.module.url, `http://host.docker.internal:${feed.port}/epg.xml`)
  assert.equal(after.guideChannels.length, 120)
  const config = (await tvhRead('epggrab/config/load', {}, conn)).entries[0].params
  const value = (id) => config.find((p) => p.id === id).value
  assert.equal(value('epgdb_saveafterimport'), true)
  assert.ok(Number(value('epgdb_periodicsave')) > 0)
})

const serveFeed = (body) => new Promise((resolve) => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/xml' })
    res.end(body)
  })
  server.listen(0, '0.0.0.0', () => resolve({ port: server.address().port, close: () => server.close() }))
})
