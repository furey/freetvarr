import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import crypto from 'crypto'

import { listUpcoming } from '../src/tvheadend.js'
import { parseChallenge } from '../src/http-auth.js'

const USERNAME = 'freetvarr'
const PASSWORD = 'secret'
const REALM = 'tvheadend'

const md5 = (text) => crypto.createHash('md5').update(text).digest('hex')

const startDigestServer = async () => {
  const nonces = new Set()
  const seen = []
  const challenge = ({ stale = false } = {}) => {
    const nonce = crypto.randomBytes(8).toString('hex')
    nonces.add(nonce)
    return `Digest realm="${REALM}", qop=auth, nonce="${nonce}", opaque="o"${stale ? ', stale=true' : ''}`
  }
  const verdict = (req) => {
    const header = req.headers.authorization || ''
    if (!header.startsWith('Digest ')) return 'missing'
    const p = parseChallenge(header.slice(7))
    if (!nonces.has(p.nonce)) return 'stale'
    const ha1 = md5(`${USERNAME}:${REALM}:${PASSWORD}`)
    const ha2 = md5(`${req.method}:${p.uri}`)
    return p.response === md5(`${ha1}:${p.nonce}:${p.nc}:${p.cnonce}:auth:${ha2}`) ? 'ok' : 'bad'
  }
  const server = http.createServer((req, res) => {
    const result = verdict(req)
    seen.push({ result, nc: parseChallenge(req.headers.authorization || '').nc })
    if (result !== 'ok') {
      res.writeHead(401, { 'WWW-Authenticate': challenge({ stale: result === 'stale' }) })
      return res.end()
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ entries: [] }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  return { url, seen, expireNonces: () => nonces.clear(), close: () => server.close() }
}

test('sendAuthenticated: reuses the digest nonce with a rising nonce count', async () => {
  const tvh = await startDigestServer()
  const conn = { url: tvh.url, username: USERNAME, password: PASSWORD }
  await listUpcoming(conn)
  await listUpcoming(conn)
  await listUpcoming(conn)
  tvh.close()
  assert.deepEqual(tvh.seen.map((s) => s.result), ['missing', 'ok', 'ok', 'ok'])
  assert.deepEqual(tvh.seen.slice(1).map((s) => s.nc), ['00000001', '00000002', '00000003'])
})

test('sendAuthenticated: answers a stale nonce with one retry on the fresh challenge', async () => {
  const tvh = await startDigestServer()
  const conn = { url: tvh.url, username: USERNAME, password: PASSWORD }
  await listUpcoming(conn)
  tvh.expireNonces()
  await listUpcoming(conn)
  await listUpcoming(conn)
  tvh.close()
  assert.deepEqual(tvh.seen.map((s) => s.result), ['missing', 'ok', 'stale', 'ok', 'ok'])
})

test('sendAuthenticated: a wrong password stops reusing the challenge', async () => {
  const tvh = await startDigestServer()
  const conn = { url: tvh.url, username: USERNAME, password: 'wrong' }
  await assert.rejects(listUpcoming(conn), { code: 'auth' })
  await assert.rejects(listUpcoming(conn), { code: 'auth' })
  tvh.close()
  assert.deepEqual(tvh.seen.map((s) => s.result), ['missing', 'bad', 'missing', 'bad'])
})
