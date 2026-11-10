import { test } from 'node:test'
import assert from 'node:assert/strict'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

import { createImageResolver, imageRouteOf, serveImageRoute } from '../src/image-routes.js'
import { createThumbnailStore } from '../src/image-thumbnails.js'

const WEBP_HEADER = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')])
const image = (text) => ({ body: Buffer.concat([WEBP_HEADER, Buffer.from(text)]), contentType: 'image/webp' })
const textOf = (body) => body.subarray(WEBP_HEADER.length).toString()

const routes = () => {
  const calls = []
  const programme = imageRouteOf({
    path: '/api/epg/image/:eventId',
    widthOf: (w) => (w === undefined ? 768 : ['768', '1920'].includes(w) ? Number(w) : null),
    loadImage: async ({ eventId, width }) => {
      calls.push({ eventId, width })
      if (eventId === 'slow') return { image: null, pending: true }
      return eventId === 'gone' ? null : image(`${eventId}@${width}`)
    },
  })
  const show = imageRouteOf({
    path: '/api/epg/show-image',
    widthOf: () => 1920,
    loadImage: async ({ title, width }) => ({ image: image(`${title}@${width}`), pending: false }),
    paramsOf: ({ query }) => ({ title: query.title }),
  })
  return { calls, programme, show }
}

const recorder = () => {
  const res = { statusCode: 200, headers: {}, body: null }
  res.setHeader = (name, value) => { res.headers[name.toLowerCase()] = value }
  res.status = (code) => {
    res.statusCode = code
    return res
  }
  res.json = (body) => { res.body = body }
  res.send = (body) => { res.body = body }
  res.end = () => {}
  return res
}

test('the resolver finds the route for a url and loads the same picture the route serves', async () => {
  const { calls, programme, show } = routes()
  const resolve = createImageResolver([programme, show])
  const resolved = await resolve('/api/epg/image/a%20b?w=1920')
  assert.equal(textOf(resolved.image.body), 'a b@1920')
  assert.deepEqual(calls, [{ eventId: 'a b', width: 1920 }])
  const res = recorder()
  await serveImageRoute({ route: programme, imageMaxAgeS: 86400 })({ params: { eventId: 'a b' }, query: { w: '1920' } }, res)
  assert.equal(textOf(res.body), textOf(resolved.image.body))
  assert.equal(res.headers['cache-control'], 'public, max-age=86400')
  assert.equal(textOf((await resolve('/api/epg/show-image?title=Bluey&w=768')).image.body), 'Bluey@1920')
})

test('the resolver reports pending, missing, bad widths, and unknown paths', async () => {
  const { programme, show } = routes()
  const resolve = createImageResolver([programme, show])
  assert.deepEqual(await resolve('/api/epg/image/slow?w=768'), { image: null, pending: true })
  assert.deepEqual(await resolve('/api/epg/image/gone?w=768'), { image: null, pending: false })
  assert.equal((await resolve('/api/epg/image/a?w=500')).badWidth, true)
  assert.equal((await resolve('/api/elsewhere/a')).unknownRoute, true)
  assert.equal((await resolve('/api/epg/image/%E0%A4%A?w=768')).unknownRoute, true)
})

test('the served route sends 404 with no-store while pending, when missing, and for a non-image', async () => {
  const { programme } = routes()
  const serve = serveImageRoute({ route: programme, imageMaxAgeS: 86400 })
  const pending = recorder()
  await serve({ params: { eventId: 'slow' }, query: {} }, pending)
  assert.equal(pending.statusCode, 404)
  assert.equal(pending.headers['cache-control'], 'no-store')
  const missing = recorder()
  await serve({ params: { eventId: 'gone' }, query: {} }, missing)
  assert.equal(missing.statusCode, 404)
  assert.equal(missing.headers['cache-control'], 'no-store')
  const thrown = recorder()
  const failing = imageRouteOf({ path: '/api/x/:id', widthOf: () => 192, loadImage: async () => { throw new Error('boom') } })
  await serveImageRoute({ route: failing, imageMaxAgeS: 86400 })({ params: { id: '1' }, query: {} }, thrown)
  assert.equal(thrown.statusCode, 404)
  assert.equal(thrown.headers['cache-control'], 'no-store')
  const bad = recorder()
  await serve({ params: { eventId: 'a' }, query: { w: '500' } }, bad)
  assert.equal(bad.statusCode, 400)
})

test('a stamped airing URL serves the same picture, and a final miss stays 404 no-store with its state', async () => {
  const { programme } = routes()
  const resolve = createImageResolver([programme])
  assert.equal(textOf((await resolve('/api/epg/image/42?w=768&c=p1')).image.body), '42@768')
  const final = imageRouteOf({ path: '/api/epg/image/:eventId', widthOf: () => 192, loadImage: async () => ({ image: null, pending: false, final: true }) })
  const res = recorder()
  await serveImageRoute({ route: final, imageMaxAgeS: 86400 })({ params: { eventId: '42' }, query: { c: 'p1' } }, res)
  assert.deepEqual([res.statusCode, res.headers['cache-control'], res.headers['x-art-state']], [404, 'no-store', 'final'])
})

const servedBy = async (loaded) => {
  const route = imageRouteOf({ path: '/api/x/:id', widthOf: () => 192, loadImage: async () => loaded })
  const res = recorder()
  await serveImageRoute({ route, imageMaxAgeS: 86400 })({ params: { id: '1' }, query: {} }, res)
  return res
}

test('the served route answers 404 for any image that is not JPEG, PNG, WebP, or GIF', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>')
  for (const contentType of ['image/svg+xml', 'application/xhtml+xml', 'application/javascript']) {
    const res = await servedBy({ body: svg, contentType })
    assert.equal(res.statusCode, 404, contentType)
  }
  const disguised = await servedBy({ body: Buffer.from('<html><body>page</body></html>'), contentType: 'image/png' })
  assert.equal(disguised.statusCode, 404)
  assert.equal(disguised.headers['cache-control'], 'no-store')
})

test('the served route takes the type from the image bytes and adds a sandbox CSP', async () => {
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toBuffer()
  const res = await servedBy({ body: png, contentType: 'image/svg+xml' })
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['content-type'], 'image/png')
  assert.equal(res.headers['content-security-policy'], "default-src 'none'; sandbox")
})

test('an SVG logo leaves Freetvarr only as a WebP thumbnail with the sandbox CSP', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-svg-route-'))
  const store = createThumbnailStore({ dir })
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><script>x</script><rect width="40" height="20"/></svg>')
  const res = await servedBy(await store.thumbnailFor({ key: 'channel:svg', width: 96, loadOriginal: async () => ({ body: svg, contentType: 'image/svg+xml' }) }))
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['content-type'], 'image/webp')
  assert.equal(res.headers['content-security-policy'], "default-src 'none'; sandbox")
  const original = await servedBy({ body: svg, contentType: 'image/svg+xml' })
  assert.equal(original.statusCode, 404)
  await fs.rm(dir, { recursive: true, force: true })
})
