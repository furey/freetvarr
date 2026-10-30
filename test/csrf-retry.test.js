import assert from 'node:assert/strict'
import test from 'node:test'

import { once } from 'node:events'

import cookieParser from 'cookie-parser'
import { doubleCsrf } from 'csrf-csrf'
import express from 'express'

import { isCsrfRejection, sharedCsrfToken, withCsrfRetry } from '../src/web/shared/csrf-retry.js'

const rejection = (status, message) => Object.assign(new Error(message), { status })

test('isCsrfRejection: a 403 that names the csrf token, not any 403 or any message', () => {
  assert.equal(isCsrfRejection(rejection(403, 'invalid csrf token')), true)
  assert.equal(isCsrfRejection(rejection(403, 'Plex rejected the token')), false)
  assert.equal(isCsrfRejection(rejection(400, 'invalid csrf token')), false)
})

test('withCsrfRetry: a rejected token is fetched again once and the request is sent again', async () => {
  const sent = []
  const tokens = []
  const result = await withCsrfRetry({
    send: async (token) => {
      sent.push(token)
      if (token === 'old') throw rejection(403, 'invalid csrf token')
      return { ok: true }
    },
    tokenOf: async ({ force }) => {
      tokens.push(force)
      return force ? 'new' : 'old'
    },
  })
  assert.deepEqual(result, { ok: true })
  assert.deepEqual(sent, ['old', 'new'])
  assert.deepEqual(tokens, [false, true])
})

test('withCsrfRetry: other failures and a second csrf rejection reach the caller', async () => {
  await assert.rejects(withCsrfRetry({ send: async () => { throw rejection(500, 'boom') }, tokenOf: async () => 't' }), /boom/)
  let sends = 0
  await assert.rejects(withCsrfRetry({
    send: async () => {
      sends += 1
      throw rejection(403, 'invalid csrf token')
    },
    tokenOf: async () => 't',
  }), /csrf/)
  assert.equal(sends, 2)
})

test('sharedCsrfToken: requests sent together share one token fetch', async () => {
  let fetches = 0
  const tokenOf = sharedCsrfToken(async () => {
    fetches += 1
    await new Promise((resolve) => setTimeout(resolve, 5))
    return `t${fetches}`
  })
  const tokens = await Promise.all([tokenOf(), tokenOf(), tokenOf()])
  assert.deepEqual(tokens, ['t1', 't1', 't1'])
  assert.equal(await tokenOf(), 't1')
  assert.equal(fetches, 1)
})

test('sharedCsrfToken: a forced fetch happens only when the rejected token is still current', async () => {
  let fetches = 0
  const tokenOf = sharedCsrfToken(async () => `t${fetches += 1}`)
  await tokenOf()
  assert.deepEqual(await Promise.all([
    tokenOf({ force: true, rejected: 't1' }),
    tokenOf({ force: true, rejected: 't1' }),
  ]), ['t2', 't2'])
  assert.equal(await tokenOf({ force: true, rejected: 't1' }), 't2')
  assert.equal(fetches, 2)
  assert.equal(await tokenOf({ force: true, rejected: 't2' }), 't3')
})

test('sharedCsrfToken: parallel first-visit posts pass the real double-submit check', async (t) => {
  const secret = 's'.repeat(32)
  const { doubleCsrfProtection, generateToken } = doubleCsrf({
    getSecret: () => secret,
    getSessionIdentifier: () => 'freetvarr',
    cookieName: 'freetvarr.x-csrf',
    cookieOptions: { httpOnly: true, sameSite: 'strict', secure: false, path: '/' },
    size: 32,
  })
  const pause = () => new Promise((resolve) => setTimeout(resolve, Math.random() * 20))
  const app = express()
  app.use(cookieParser(secret))
  app.get('/api/csrf-token', async (req, res) => {
    const token = generateToken(req, res, true)
    res.setHeader('Content-Type', 'application/json')
    res.flushHeaders()
    await pause()
    res.end(JSON.stringify({ token }))
  })
  app.post('/api/check', doubleCsrfProtection, (req, res) => res.json({ ok: true }))
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }))
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => server.close())
  const baseUrl = `http://127.0.0.1:${server.address().port}`
  const firstVisit = async () => {
    let cookie = ''
    const browserFetch = async (url, options = {}) => {
      const res = await fetch(`${baseUrl}${url}`, { ...options, headers: { ...options.headers, cookie } })
      const setCookie = res.headers.get('set-cookie')
      if (setCookie) cookie = setCookie.split(';')[0]
      return res
    }
    const tokenOf = sharedCsrfToken(async () => (await (await browserFetch('/api/csrf-token')).json()).token)
    const post = () => withCsrfRetry({
      tokenOf,
      send: async (token) => {
        const res = await browserFetch('/api/check', { method: 'POST', headers: { 'x-csrf-token': token } })
        const data = await res.json()
        if (!res.ok) throw Object.assign(new Error(data.error), { status: res.status })
        return data
      },
    })
    return Promise.all([post(), post(), post()])
  }
  for (let visit = 0; visit < 10; visit += 1) {
    assert.deepEqual(await firstVisit(), [{ ok: true }, { ok: true }, { ok: true }])
  }
})
