import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createLinkHealth } from '../src/link-health.js'

test('a link stays until its host is found down, then drops until a later check finds it up', async () => {
  const clock = { ms: 0 }
  const answers = [false, true]
  const probed = []
  const health = createLinkHealth({
    probe: async (url) => { probed.push(url); return answers.shift() },
    now: () => clock.ms,
    ttlMs: 100,
  })
  const link = 'https://www.tvmaze.com/people/1/someone'
  assert.equal(health.linkOf(link), link)
  await health.settled()
  assert.equal(health.linkOf(link), null)
  assert.equal(health.linkOf('https://www.themoviedb.org/person/1'), 'https://www.themoviedb.org/person/1')
  clock.ms = 100
  health.linkOf(link)
  await health.settled()
  assert.equal(health.linkOf(link), link)
  assert.deepEqual(probed, ['https://www.tvmaze.com/', 'https://www.themoviedb.org/', 'https://www.tvmaze.com/'])
})

test('missing and non-https links are dropped, and a failed probe counts as up', async () => {
  const health = createLinkHealth({ probe: async () => { throw new Error('boom') } })
  assert.equal(health.linkOf(null), null)
  assert.equal(health.linkOf('http://www.tvmaze.com/shows/1'), null)
  health.linkOf('https://www.tvmaze.com/shows/1')
  await health.settled()
  assert.equal(health.linkOf('https://www.tvmaze.com/shows/1'), 'https://www.tvmaze.com/shows/1')
})
