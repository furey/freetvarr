import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'

import { openChannelStream, streamRequestError, TvheadendError } from '../src/tvheadend.js'

const startHangUpServer = async () => {
  const server = http.createServer((req) => req.socket.destroy())
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }
}

test('openChannelStream: a hang-up before any reply reports no input source', async () => {
  const tvh = await startHangUpServer()
  const conn = { url: tvh.url, username: '', password: '' }
  const err = await openChannelStream({ channelId: 'c1', userAgent: 'test', conn }).catch((e) => e)
  tvh.close()
  assert.ok(err instanceof TvheadendError)
  assert.equal(err.code, 'no-source')
  assert.equal(err.stage, 'stream')
})

test('streamRequestError: passes other request failures through unchanged', () => {
  const refused = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
  assert.equal(streamRequestError(refused), refused)
})
