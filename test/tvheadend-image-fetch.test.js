import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'

import { fetchProgrammeImage } from '../src/tvheadend.js'

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)])

let server
let otherHost
let base
const otherHits = []
const conn = { url: 'http://tvheadend.invalid', username: '', password: '' }

before(async () => {
  server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://x')
    if (pathname === '/to-other-host') {
      res.writeHead(302, { Location: `http://localhost:${otherHost.address().port}/admin.png` })
      return res.end()
    }
    if (pathname === '/same-host') {
      res.writeHead(302, { Location: '/poster.png' })
      return res.end()
    }
    if (pathname === '/loop') {
      res.writeHead(302, { Location: '/loop' })
      return res.end()
    }
    if (pathname === '/poster.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' })
      return res.end(PNG)
    }
    res.writeHead(404)
    res.end()
  })
  otherHost = http.createServer((req, res) => {
    otherHits.push(req.url)
    res.writeHead(200, { 'Content-Type': 'image/png' })
    res.end(PNG)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  await new Promise((resolve) => otherHost.listen(0, 'localhost', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await new Promise((resolve) => otherHost.close(resolve))
})

test('fetchProgrammeImage: a redirect to another host gives no image and opens no connection there', async () => {
  assert.equal(await fetchProgrammeImage({ source: `${base}/to-other-host`, conn }), null)
  assert.deepEqual(otherHits, [])
})

test('fetchProgrammeImage: a redirect on the same host still fetches the image', async () => {
  const image = await fetchProgrammeImage({ source: `${base}/same-host`, conn })
  assert.equal(image?.contentType, 'image/png')
})

test('fetchProgrammeImage: a redirect loop stops after a few hops', async () => {
  assert.equal(await fetchProgrammeImage({ source: `${base}/loop`, conn }), null)
})
