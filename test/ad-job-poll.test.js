import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { AD_JOB_POLL_MS, freshEpisodeOf, hasAdJobRunning } from '../src/web/ad-confirm.js'

const showView = readFileSync(new URL('../src/web/views/show-view.js', import.meta.url), 'utf8')
const actions = readFileSync(new URL('../src/web/components/library-actions.js', import.meta.url), 'utf8')

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

test('show page: reloads every 5 s while an ad job runs, stops on unmount, and the menu follows the reload', () => {
  assert.match(showView, /if \(unmounted \|\| !hasAdJobRunning\(allEpisodes\.value\)\) return\n\s*adJobTimer = setTimeout\(load, AD_JOB_POLL_MS\)/)
  assert.match(showView, /watch\(\[show, error\], scheduleAdJobPoll\)/)
  assert.match(showView, /onUnmounted\(\(\) => \{\n\s*unmounted = true\n\s*stopAdJobPoll\(\)/)
  assert.match(actions, /if \(menuEpisode\.value\) menuEpisode\.value = freshEpisodeOf\(\{ episode: menuEpisode\.value, episodes: list \}\)/)
})
