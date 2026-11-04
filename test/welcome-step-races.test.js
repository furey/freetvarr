import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createBootstrapCheck, leaveTvheadendStep, nextStepAfter } from '../src/web/setup-wizard-flow.js'
import { guideLinksSaver } from '../src/web/guide-links.js'

const deferred = () => {
  let resolve = null
  let reject = null
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

test('setup wizard: Next on the TVHeadend step waits for a held open-access check and stays for the Secure form', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const status = deferred()
  let bootstrap = null
  const reads = []
  const tests = []
  const checks = createBootstrapCheck({
    read: async (url) => {
      reads.push(url)
      bootstrap = await status.promise
    },
    delayMs: 500,
  })
  checks.schedule('http://tvh:9981')
  const leaving = leaveTvheadendStep({
    settleBootstrap: () => checks.settle({ url: 'http://tvh:9981', known: Boolean(bootstrap) }),
    showsSecure: () => Boolean(bootstrap?.fresh),
    testTvh: async () => { tests.push('POST /api/tvh-test'); return true },
  })
  status.resolve({ fresh: true })
  assert.equal(await leaving, false)
  assert.deepEqual(tests, [])
  t.mock.timers.tick(1000)
  assert.deepEqual(reads, ['http://tvh:9981'])
})

test('setup wizard: a check already in flight is awaited, not sent again', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const status = deferred()
  const reads = []
  const checks = createBootstrapCheck({ read: (url) => { reads.push(url); return status.promise }, delayMs: 500 })
  checks.schedule('http://tvh:9981')
  t.mock.timers.tick(500)
  const settled = checks.settle({ url: 'http://tvh:9981', known: false })
  status.resolve()
  await settled
  assert.deepEqual(reads, ['http://tvh:9981'])
  await checks.settle({ url: 'http://tvh:9981', known: true })
  assert.deepEqual(reads, ['http://tvh:9981'])
})

test('setup wizard: with no open-access answer, Next goes on to the connection test', async () => {
  const checks = createBootstrapCheck({ read: async () => {}, delayMs: 500 })
  const advanced = await leaveTvheadendStep({
    settleBootstrap: () => checks.settle({ url: 'http://tvh:9981', known: false }),
    showsSecure: () => false,
    testTvh: async () => true,
  })
  assert.equal(advanced, true)
})

test('nextStepAfter: a rail jump made during a save keeps the jumped step', () => {
  assert.equal(nextStepAfter({ from: 5, current: 5 }), 6)
  assert.equal(nextStepAfter({ from: 5, current: 1 }), 1)
})

test('guideLinksSaver: a failed save shows the reason, a double press sends once, and the wizard still gets the throw', async () => {
  const sent = []
  const failure = deferred()
  const state = { saving: false, error: '' }
  const save = guideLinksSaver({
    send: (links) => { sent.push(links); return failure.promise },
    onBusy: (busy) => { state.saving = busy },
    onError: (text) => { state.error = text },
  })
  const first = save([{ channel_id: 'c1', guide_id: 'g1' }])
  const second = save([{ channel_id: 'c1', guide_id: 'g1' }])
  failure.reject(new Error('TVHeadend refused the change'))
  await assert.rejects(first, /refused/)
  await second
  assert.equal(sent.length, 1)
  assert.equal(state.saving, false)
  assert.equal(state.error, 'Could not save the guide choices: TVHeadend refused the change')
})
