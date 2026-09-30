import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'

import { channelLogoSources, getChannelIcon, indexEpgIconsByChannel } from '../src/tvheadend.js'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47])

const withServer = async (routes, run) => {
  const server = http.createServer((req, res) => {
    const route = routes[req.url]
    if (!route) {
      res.writeHead(404, { 'Content-Type': 'text/html' })
      return res.end('<html>404</html>')
    }
    res.writeHead(200, { 'Content-Type': route.contentType })
    res.end(route.body)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    await run(base)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

test('indexEpgIconsByChannel: maps each linked channel to its EPG icons, skipping iconless entries', () => {
  const index = indexEpgIconsByChannel([
    { icon: 'https://example.com/nine.png', channels: ['ch-9', 'ch-9hd'] },
    { icon: '', channels: ['ch-9'] },
    { icon: 'https://example.com/nine-alt.png', channels: ['ch-9'] },
    { icon: 'https://example.com/orphan.png' },
  ])
  assert.deepEqual(index.get('ch-9'), ['https://example.com/nine.png', 'https://example.com/nine-alt.png'])
  assert.deepEqual(index.get('ch-9hd'), ['https://example.com/nine.png'])
  assert.equal(index.size, 2)
})

test('channelLogoSources: TVHeadend icon first, then EPG icons, without blanks or repeats', () => {
  const sources = channelLogoSources({
    channel: { icon_public_url: 'imagecache/28' },
    epgIcons: ['https://example.com/nine.png', 'imagecache/28'],
  })
  assert.deepEqual(sources, ['imagecache/28', 'https://example.com/nine.png'])
  assert.deepEqual(channelLogoSources({ channel: {} }), [])
})

test('getChannelIcon: falls back to the EPG icon when the TVHeadend icon is missing', async () => {
  await withServer({ '/xmltv/nine.png': { contentType: 'image/png', body: PNG } }, async (base) => {
    const image = await getChannelIcon({
      sources: ['imagecache/28', `${base}/xmltv/nine.png`],
      conn: { url: base, username: '', password: '' },
    })
    assert.equal(image.contentType, 'image/png')
    assert.deepEqual(image.body, PNG)
  })
})

test('getChannelIcon: serves the TVHeadend icon when it exists', async () => {
  await withServer({ '/imagecache/28': { contentType: 'image/jpeg', body: PNG } }, async (base) => {
    const image = await getChannelIcon({
      sources: ['imagecache/28', `${base}/xmltv/nine.png`],
      conn: { url: base, username: '', password: '' },
    })
    assert.equal(image.contentType, 'image/jpeg')
  })
})

test('getChannelIcon: returns null when no source serves an image', async () => {
  await withServer({ '/page': { contentType: 'text/html', body: '<html></html>' } }, async (base) => {
    const image = await getChannelIcon({
      sources: ['imagecache/28', `${base}/page`, 'http://127.0.0.1:1/unreachable.png'],
      conn: { url: base, username: '', password: '' },
    })
    assert.equal(image, null)
  })
  assert.equal(await getChannelIcon({ sources: [] }), null)
})
