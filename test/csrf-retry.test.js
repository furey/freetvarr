import assert from 'node:assert/strict'
import test from 'node:test'

import { isCsrfRejection, withCsrfRetry } from '../src/web/shared/csrf-retry.js'

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
