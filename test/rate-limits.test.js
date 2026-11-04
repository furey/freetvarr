import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import express from 'express'

import { RATE_LIMITED_MESSAGE, ROW_ACTION_LIMIT, createRateLimiter } from '../src/rate-limits.js'

const server = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8')

const appWith = async (limiter) => {
  const app = express()
  app.post('/row', limiter, (req, res) => res.json({ ok: true }))
  const listener = app.listen(0, '127.0.0.1')
  await once(listener, 'listening')
  return { url: `http://127.0.0.1:${listener.address().port}/row`, close: () => listener.close() }
}

test('createRateLimiter: a refused request answers with a JSON error that says to wait', async (t) => {
  const { url, close } = await appWith(createRateLimiter({ limit: 1 }))
  t.after(close)
  assert.equal((await fetch(url, { method: 'POST' })).status, 200)
  const refused = await fetch(url, { method: 'POST' })
  assert.equal(refused.status, 429)
  assert.match(refused.headers.get('content-type'), /application\/json/)
  assert.deepEqual(await refused.json(), { error: RATE_LIMITED_MESSAGE, code: 'rate-limited' })
})

test('row action limiter: a cleanup pass of six rows in a minute all reach the handler', async (t) => {
  const { url, close } = await appWith(createRateLimiter({ limit: ROW_ACTION_LIMIT }))
  t.after(close)
  const statuses = []
  for (let i = 0; i < 6; i++) statuses.push((await fetch(url, { method: 'POST' })).status)
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 200])
})

test('server: row actions and setup checks have their own limiters, apart from the sync limiter', () => {
  assert.doesNotMatch(server, /express-rate-limit/)
  assert.match(server, /mountRecordingTvhRoutes\(\{ app, csrf: doubleCsrfProtection, limiter: rowActionLimiter \}\)/)
  assert.match(server, /mountAdOriginalRoutes\(\{ app, csrf: doubleCsrfProtection, limiter: rowActionLimiter,/)
  for (const route of ['tvh-recordings-path-check', 'tvh-shows', 'tvh-test', 'tvh-detect', 'discover-plex', 'plex-libraries/create']) {
    assert.match(server, new RegExp(`app\\.post\\('/api/${route}', setupCheckLimiter,`))
  }
  assert.match(server, /app\.post\('\/api\/sync', syncLimiter,/)
  assert.match(server, /const epgLimiter = createRateLimiter\(\{ limit: EPG_LIMIT \}\)/)
})
