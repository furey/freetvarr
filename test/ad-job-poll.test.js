import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { AD_JOB_POLL_MS, freshEpisodeOf, hasAdJobRunning } from '../src/web/ad-confirm.js'
import { createPoll } from '../src/web/poll.js'

const showView = readFileSync(new URL('../src/web/views/show-view.js', import.meta.url), 'utf8')

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

test('hasAdJobRunning: true while any episode scans for ads', () => {
  assert.equal(hasAdJobRunning([{ ads: { status: 'cut' } }, { ads: { status: 'scanning' } }]), true)
  assert.equal(hasAdJobRunning([{ ads: { status: 'cut' } }, {}]), false)
  assert.equal(AD_JOB_POLL_MS, 5000)
})

test('freshEpisodeOf: an open episode menu takes the reloaded episode, so Restore shows once the cut ends', () => {
  const open = { recordingId: 'r1', ads: { status: 'scanning' } }
  const reloaded = { recordingId: 'r1', ads: { status: 'cut', backup: { uncut: true } } }
  assert.equal(freshEpisodeOf({ episode: open, episodes: [reloaded] }), reloaded)
  assert.equal(freshEpisodeOf({ episode: open, episodes: [] }), open)
  assert.equal(freshEpisodeOf({ episode: null, episodes: [reloaded] }), null)
})

test('ad job poll: two failed show reloads in a row, then a third GET still goes out, and it stops when the cut ends', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let episodes = [{ recordingId: 'r1', ads: { status: 'scanning' } }]
  const gets = []
  const load = async () => {
    gets.push('GET /api/library/shows/the-block')
    if (gets.length <= 2) throw new Error('Could not reach Freetvarr. Check the connection, then try again.')
    episodes = [{ recordingId: 'r1', ads: { status: 'cut' } }]
  }
  const poll = createPoll({ run: load, delayOf: () => (hasAdJobRunning(episodes) ? AD_JOB_POLL_MS : null) })
  poll.book()
  for (let i = 0; i < 4; i++) {
    t.mock.timers.tick(AD_JOB_POLL_MS)
    await flush()
  }
  assert.equal(gets.length, 3)
  assert.equal(poll.isBooked(), false)
})

test('show page: the ad job poll is a createPoll with the show reload', () => {
  assert.match(showView, /createPoll\(\{\n\s*run: load,/)
})
