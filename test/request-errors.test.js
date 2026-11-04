import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { OFFLINE_MESSAGE, RATE_LIMITED_MESSAGE, reachServer, responseErrorOf } from '../src/web/shared/request-errors.js'
import { RATE_LIMITED_MESSAGE as SERVER_RATE_LIMITED_MESSAGE } from '../src/rate-limits.js'
import { isCsrfRejection } from '../src/web/shared/csrf-retry.js'

const api = readFileSync(new URL('../src/web/shared/api.js', import.meta.url), 'utf8')

test('reachServer: a fetch that throws becomes a plain offline error with status 0', async () => {
  const err = await reachServer(async () => { throw new TypeError('Load failed') }).catch((e) => e)
  assert.equal(err.message, OFFLINE_MESSAGE)
  assert.equal(err.status, 0)
  assert.equal(err.code, 'offline')
  assert.equal(err.cause.message, 'Load failed')
})

test('reachServer: a fetch that answers passes its response through', async () => {
  assert.deepEqual(await reachServer(async () => ({ ok: true })), { ok: true })
})

test('responseErrorOf: a 429 with a text body says to wait, and keeps its status', () => {
  const err = responseErrorOf({ status: 429, data: {} })
  assert.equal(err.message, RATE_LIMITED_MESSAGE)
  assert.equal(err.status, 429)
  assert.equal(err.code, 'rate-limited')
  assert.equal(RATE_LIMITED_MESSAGE, SERVER_RATE_LIMITED_MESSAGE)
})

test('responseErrorOf: the server error text wins, and a csrf 403 still reads as a csrf rejection', () => {
  const err = responseErrorOf({ status: 403, data: { error: 'invalid csrf token', code: 'EBADCSRFTOKEN' } })
  assert.equal(err.message, 'invalid csrf token')
  assert.equal(isCsrfRejection(err), true)
  assert.equal(responseErrorOf({ status: 500 }).message, 'HTTP 500')
})

test('api: every request and the csrf token fetch go through the offline and 429 helpers', () => {
  assert.match(api, /const fetchCsrf = async \(\) => \{\n\s*const res = noteBuild\(await reachServer\(\(\) => fetch\('\/api\/csrf-token'\)\)\)/)
  assert.match(api, /const res = noteBuild\(await reachServer\(\(\) => fetch\(url, \{/)
  assert.match(api, /if \(!res\.ok\) throw responseErrorOf\(\{ status: res\.status, data \}\)/)
})
