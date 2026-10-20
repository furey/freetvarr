import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  allowedUrlOf,
  createCircuitBreaker,
  createHostLimiter,
  createOutboundClient,
  responseVerdictOf,
  retryAfterOf,
  retryDelayMs,
} from '../src/outbound-http.js'

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }

const clientWith = ({ responses, hosts = { 'api.example.org': {} }, clock = { ms: 0 } }) => {
  const calls = []
  const client = createOutboundClient({
    hosts,
    now: () => clock.ms,
    sleep: async (ms) => { clock.ms += ms },
    random: () => 1,
    request: async (options) => {
      calls.push(options)
      const next = responses.shift()
      if (next instanceof Error) throw next
      return next
    },
  })
  return { client, calls }
}

const jsonResponse = (body, status = 200, headers = JSON_HEADERS) => ({ status, headers, body: Buffer.from(JSON.stringify(body)) })

test('allowedUrlOf accepts only https hosts on the allow-list', () => {
  const isAllowedHost = (host) => host === 'api.example.org'
  assert.equal(allowedUrlOf({ url: 'https://api.example.org/x', isAllowedHost }).hostname, 'api.example.org')
  for (const url of ['http://api.example.org/x', 'https://evil.example.org/x', 'https://user:pw@api.example.org/', 'https://api.example.org:8443/', 'not a url']) {
    assert.throws(() => allowedUrlOf({ url, isAllowedHost }), { code: 'host-not-allowed' }, url)
  }
})

test('responseVerdictOf retries only transient answers', () => {
  assert.equal(responseVerdictOf({ status: 200 }), 'ok')
  assert.equal(responseVerdictOf({ status: 404 }), 'missing')
  assert.equal(responseVerdictOf({ status: 429 }), 'retry')
  assert.equal(responseVerdictOf({ status: 503 }), 'retry')
  assert.equal(responseVerdictOf({ error: new Error('timeout') }), 'retry')
  assert.equal(responseVerdictOf({ status: 401 }), 'rejected')
  assert.equal(responseVerdictOf({ status: 403 }), 'rejected')
})

test('retryDelayMs backs off exponentially with jitter, caps, and honours Retry-After', () => {
  assert.equal(retryDelayMs({ attempt: 0, baseMs: 500, maxMs: 8000, random: () => 1 }), 500)
  assert.equal(retryDelayMs({ attempt: 2, baseMs: 500, maxMs: 8000, random: () => 1 }), 2000)
  assert.equal(retryDelayMs({ attempt: 2, baseMs: 500, maxMs: 8000, random: () => 0 }), 1000)
  assert.equal(retryDelayMs({ attempt: 9, baseMs: 500, maxMs: 8000, random: () => 1 }), 8000)
  assert.equal(retryDelayMs({ attempt: 0, baseMs: 500, maxMs: 8000, retryAfterS: 3 }), 3000)
  assert.equal(retryDelayMs({ attempt: 0, baseMs: 500, maxMs: 8000, retryAfterS: 60 }), null)
})

test('retryAfterOf reads seconds and ignores junk', () => {
  assert.equal(retryAfterOf({ 'retry-after': '7' }), 7)
  assert.equal(retryAfterOf({}), null)
  assert.equal(retryAfterOf({ 'retry-after': 'soon' }), null)
})

test('circuit breaker opens after repeated failures and doubles its cooldown', () => {
  const clock = { ms: 0 }
  const breaker = createCircuitBreaker({ failureThreshold: 3, baseCooldownMs: 1000, maxCooldownMs: 3000, now: () => clock.ms })
  breaker.recordFailure()
  breaker.recordFailure()
  assert.equal(breaker.allows(), true)
  breaker.recordFailure()
  assert.equal(breaker.allows(), false)
  clock.ms = 1000
  assert.equal(breaker.allows(), true)
  breaker.recordFailure()
  assert.equal(breaker.allows(), false)
  clock.ms = 2999
  assert.equal(breaker.allows(), false)
  clock.ms = 3000
  breaker.recordFailure()
  assert.equal(breaker.state().openUntil, 6000)
  breaker.recordSuccess()
  assert.equal(breaker.allows(), true)
})

test('host limiter caps concurrency, spaces starts, and refuses an overfull queue', async () => {
  const clock = { ms: 0 }
  const waits = []
  let running = 0
  let peak = 0
  const limiter = createHostLimiter({
    concurrency: 2,
    gapMs: 100,
    maxQueue: 3,
    now: () => clock.ms,
    sleep: async (ms) => {
      waits.push(ms)
      clock.ms += ms
    },
  })
  const task = async () => {
    running += 1
    peak = Math.max(peak, running)
    await Promise.resolve()
    running -= 1
  }
  const runs = [limiter.run(task), limiter.run(task), limiter.run(task), limiter.run(task), limiter.run(task)]
  const results = await Promise.allSettled(runs)
  assert.equal(peak <= 2, true)
  assert.equal(results.filter((result) => result.status === 'rejected').length, 0)
  assert.deepEqual(waits.slice(0, 2), [0, 100])
  const crowded = createHostLimiter({ concurrency: 1, maxQueue: 1, sleep: () => new Promise(() => {}) })
  crowded.run(task)
  crowded.run(task)
  await assert.rejects(crowded.run(task), { code: 'queue-full' })
})

test('getJson sends the User-Agent, retries a 503, and parses the body', async () => {
  const { client, calls } = clientWith({ responses: [jsonResponse({}, 503), jsonResponse({ ok: 1 })] })
  assert.deepEqual(await client.getJson({ url: 'https://api.example.org/q' }), { ok: 1 })
  assert.equal(calls.length, 2)
  assert.match(calls[0].headers['User-Agent'], /github\.com\/furey\/freetvarr/)
})

test('getJson treats 404 as a miss and never retries a 401', async () => {
  const missing = clientWith({ responses: [jsonResponse({}, 404)] })
  assert.equal(await missing.client.getJson({ url: 'https://api.example.org/q' }), null)
  const refused = clientWith({ responses: [jsonResponse({}, 401)] })
  await assert.rejects(refused.client.getJson({ url: 'https://api.example.org/q' }), { code: 'rejected', status: 401 })
  assert.equal(refused.calls.length, 1)
})

test('getJson rejects a non-JSON body and does not put the address in the error', async () => {
  const { client } = clientWith({ responses: [{ status: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from('<html>') }] })
  const error = await client.getJson({ url: 'https://api.example.org/q?api_key=secret' }).catch((err) => err)
  assert.equal(error.code, 'bad-content')
  assert.doesNotMatch(error.message, /secret/)
})

test('getImage accepts only raster image types', async () => {
  const { client } = clientWith({
    responses: [
      { status: 200, headers: { 'content-type': 'image/jpeg' }, body: Buffer.from([1, 2]) },
      { status: 200, headers: { 'content-type': 'image/svg+xml' }, body: Buffer.from('<svg/>') },
    ],
  })
  assert.equal((await client.getImage({ url: 'https://api.example.org/a.jpg' })).contentType, 'image/jpeg')
  assert.equal(await client.getImage({ url: 'https://api.example.org/b.svg' }), null)
})

test('a host that keeps failing is skipped until its cooldown ends', async () => {
  const clock = { ms: 0 }
  const failures = Array.from({ length: 5 }, () => new Error('timeout'))
  const { client, calls } = clientWith({
    responses: [...failures, jsonResponse({ ok: 1 })],
    hosts: { 'api.example.org': { breaker: { failureThreshold: 5, baseCooldownMs: 60000 } } },
    clock,
  })
  await assert.rejects(client.getJson({ url: 'https://api.example.org/q', retries: 4 }), { code: 'unavailable' })
  const callsBefore = calls.length
  await assert.rejects(client.getJson({ url: 'https://api.example.org/q' }), { code: 'circuit-open' })
  assert.equal(calls.length, callsBefore)
  clock.ms += 60000
  assert.deepEqual(await client.getJson({ url: 'https://api.example.org/q' }), { ok: 1 })
})

test('requests to a host off the allow-list never leave the process', async () => {
  const { client, calls } = clientWith({ responses: [] })
  await assert.rejects(client.getJson({ url: 'https://elsewhere.example.org/q' }), { code: 'host-not-allowed' })
  assert.equal(calls.length, 0)
})
