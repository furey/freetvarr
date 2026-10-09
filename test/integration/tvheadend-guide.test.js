import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import http from 'node:http'

import { tvhRead, tvhWrite } from '../../src/tvheadend.js'
import {
  applyGuideSetup,
  inspectGuide,
  linkChannelsByHand,
  parseFeedChannels,
  suggestGuide,
  waitForNewListings,
} from '../../src/tvheadend-guide.js'
import { dockerAvailable, eventually, startTvheadend } from './tvheadend-container.js'

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

test('changing listings drops the old shows at once and No listings leaves the channel empty', { timeout: 600_000 }, async (t) => {
  if (!(await dockerAvailable())) return t.skip('docker is not available')
  const xml = relinkFeed(Date.now())
  const feed = await serveFeed(xml)
  t.after(() => feed.close())
  const tvh = await startTvheadend()
  t.after(() => tvh.stop())
  const api = { get: tvhRead, post: tvhWrite }
  const conn = { url: tvh.url, username: '', password: '' }
  const create = async (number) =>
    (await tvhWrite('channel/create', { conf: JSON.stringify({ name: '10', number }) }, conn)).uuid
  const sd = await create(1)
  const hd = await create(10)

  const setup = await applyGuideSetup({
    http: api,
    conn,
    url: `http://host.docker.internal:${feed.port}/epg.xml`,
    fetchFeed: async () => parseFeedChannels(xml),
    pollMs: 2000,
  })
  assert.equal(setup.ok, true, JSON.stringify(setup))
  const titles = async (channel) =>
    ((await tvhRead('epg/events/grid', { channel, limit: 500 }, conn)).entries || []).map((e) => e.title)
  assert.ok(await eventually(async () => (await titles(hd)).includes('Ten Show'), { attempts: 120, delayMs: 2000 }))

  const news = (await inspectGuide({ http: api, conn })).guideChannels.find((g) => g.xmltvId === 'mjh-abc-news').id
  const moved = await linkChannelsByHand({ http: api, conn, links: [{ channelId: hd, guideId: news }] })
  assert.deepEqual(moved.loading, [hd])
  assert.equal(await waitForNewListings({ http: api, conn, channelIds: [hd], pollMs: 2000 }), true)
  assert.deepEqual([...new Set(await titles(hd))], ['News Hour'])
  assert.deepEqual([...new Set(await titles(sd))], ['Ten Show'])
  const hdNode = (await tvhRead('idnode/load', { uuid: hd }, conn)).entries[0].params
  assert.equal(hdNode.find((p) => p.id === 'epgauto').value, false)

  await linkChannelsByHand({ http: api, conn, links: [{ channelId: hd, guideId: '' }] })
  assert.deepEqual(await titles(hd), [])
  await new Promise((resolve) => setTimeout(resolve, 20_000))
  assert.deepEqual(await titles(hd), [])
  assert.deepEqual([...new Set(await titles(sd))], ['Ten Show'])
})

const relinkFeed = (nowMs) => {
  const hourMs = 3_600_000
  const stamp = (ms) => `${new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 14)} +0000`
  const shows = (channel, title) => Array.from({ length: 8 }, (_, i) => {
    const start = Math.floor(nowMs / hourMs) * hourMs + i * hourMs
    return `<programme start="${stamp(start)}" stop="${stamp(start + hourMs)}" channel="${channel}"><title>${title}</title></programme>`
  }).join('\n')
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<tv>',
    '<channel id="mjh-ten"><display-name>10</display-name></channel>',
    '<channel id="mjh-abc-news"><display-name>ABC NEWS</display-name></channel>',
    shows('mjh-ten', 'Ten Show'),
    shows('mjh-abc-news', 'News Hour'),
    '</tv>',
    '',
  ].join('\n')
}

const serveFeed = (body) => new Promise((resolve) => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/xml' })
    res.end(body)
  })
  server.listen(0, '0.0.0.0', () => resolve({ port: server.address().port, close: () => server.close() }))
})
