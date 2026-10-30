import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createImageResolver, imageRouteOf, serveImageRoute } from '../src/image-routes.js'

const image = (text) => ({ body: Buffer.from(text), contentType: 'image/webp' })

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
  assert.equal(resolved.image.body.toString(), 'a b@1920')
  assert.deepEqual(calls, [{ eventId: 'a b', width: 1920 }])
  const res = recorder()
  await serveImageRoute({ route: programme, missingMaxAgeS: 300, imageMaxAgeS: 86400 })({ params: { eventId: 'a b' }, query: { w: '1920' } }, res)
  assert.equal(res.body.toString(), resolved.image.body.toString())
  assert.equal(res.headers['cache-control'], 'public, max-age=86400')
  assert.equal((await resolve('/api/epg/show-image?title=Bluey&w=768')).image.body.toString(), 'Bluey@1920')
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

test('the served route sends 404 with no-store while pending and a short cache when missing', async () => {
  const { programme } = routes()
  const serve = serveImageRoute({ route: programme, missingMaxAgeS: 300, imageMaxAgeS: 86400 })
  const pending = recorder()
  await serve({ params: { eventId: 'slow' }, query: {} }, pending)
  assert.equal(pending.statusCode, 404)
  assert.equal(pending.headers['cache-control'], 'no-store')
  const missing = recorder()
  await serve({ params: { eventId: 'gone' }, query: {} }, missing)
  assert.equal(missing.headers['cache-control'], 'public, max-age=300')
  const bad = recorder()
  await serve({ params: { eventId: 'a' }, query: { w: '500' } }, bad)
  assert.equal(bad.statusCode, 400)
})
