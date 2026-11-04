import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'

import { channelLogoSources, getChannelIcon, indexEpgIconsByChannel } from '../src/tvheadend.js'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])

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
  await withServer({ '/imagecache/28': { contentType: 'image/jpeg', body: JPEG } }, async (base) => {
    const image = await getChannelIcon({
      sources: ['imagecache/28', `${base}/xmltv/nine.png`],
      conn: { url: base, username: '', password: '' },
    })
    assert.equal(image.contentType, 'image/jpeg')
  })
})

test('getChannelIcon: takes the image type from the bytes and accepts raster or SVG images only', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>')
  await withServer({
    '/svg': { contentType: 'image/svg+xml', body: svg },
    '/html-as-image': { contentType: 'image/png', body: '<html><body>page</body></html>' },
    '/untyped': { contentType: 'application/octet-stream', body: PNG },
  }, async (base) => {
    const conn = { url: base, username: '', password: '' }
    assert.equal((await getChannelIcon({ sources: ['svg'], conn })).contentType, 'image/svg+xml')
    assert.equal(await getChannelIcon({ sources: ['html-as-image'], conn }), null)
    assert.equal((await getChannelIcon({ sources: ['untyped'], conn })).contentType, 'image/png')
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
