import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { recordRequestError, seriesRequestError } from '../src/record-requests.js'

const server = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8')

const routeBody = (path) => {
  const start = server.indexOf(`app.post('${path}'`)
  return server.slice(start, server.indexOf('\n})\n', start))
}

test('recordRequestError: a programme sheet that has no epg_program_id yet can still record', () => {
  assert.equal(recordRequestError({ channel_id: 'c1', program_id: 42 }), null)
  assert.equal(recordRequestError({ program_id: 42 }), 'channel_id and program_id are required')
  assert.equal(recordRequestError({ channel_id: 'c1' }), 'channel_id and program_id are required')
})

test('seriesRequestError: a series recording needs the series link, channel, and programme only', () => {
  assert.equal(seriesRequestError({ series_link: 's1', channel_id: 'c1', program_id: 42 }), null)
  assert.equal(seriesRequestError({ channel_id: 'c1', program_id: 42 }), 'series_link, channel_id and program_id are required')
})

test('record routes: neither route asks for epg_program_id', () => {
  for (const path of ['/api/epg/record', '/api/epg/record-series']) {
    assert.doesNotMatch(routeBody(path), /epg_program_id/)
  }
  assert.match(routeBody('/api/epg/record'), /recordRequestError\(/)
  assert.match(routeBody('/api/epg/record-series'), /seriesRequestError\(/)
})
