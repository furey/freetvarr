import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  clientLabelOf, durationText, startedByText, jobRowOf, recordingRowOf, serverLineOf, sessionRowOf, triggerText, upNextRowOf, uptimeText,
} from '../src/web/activity-rows.js'

const timeZone = 'Australia/Sydney'
const at = (clock) => Date.parse(`2026-10-29T${clock}:00+11:00`)

const run = (patch) => ({
  id: 'sync-1', kind: 'sync', title: 'Sync #12', state: 'running', trigger: 'cron', step: null, progress: null,
  percent: null, etaSeconds: null, detail: null, outcome: null, tone: null, error: null, startedAt: at('21:41'), finishedAt: null, ...patch,
})

test('a running job shows its step, count, percent, and time left', () => {
  const row = jobRowOf({
    run: run({ step: 'Scan for ads', percent: 62, etaSeconds: 660, progress: { done: 3, total: 12, unit: 'recordings' } }),
    nowMs: at('21:59'),
    timeZone,
  })
  assert.equal(row.sub, 'Scan for ads · 3 of 12 recordings')
  assert.equal(row.side, '62% · 11m left')
  assert.equal(row.icon, 'running')
  assert.equal(row.indeterminate, false)
})

test('a running job with no percent shows time so far and an indeterminate bar', () => {
  const row = jobRowOf({ run: run({ step: 'List finished recordings' }), nowMs: at('21:41') + 18_000, timeZone })
  assert.equal(row.side, '18s')
  assert.equal(row.indeterminate, true)
})

test('a finished job shows its outcome, clock, and time taken, but not a scheduled trigger', () => {
  const row = jobRowOf({
    run: run({ state: 'done', outcome: '1 imported · 9 skipped', finishedAt: at('21:41') + 18_000 }),
    nowMs: at('22:00'),
    timeZone,
  })
  assert.equal(row.sub, '1 imported · 9 skipped')
  assert.equal(row.side, '9:41pm · 18s')
  assert.equal(row.icon, 'ok')
  assert.equal(row.percent, null)
})

test('failed and warning jobs carry their tone', () => {
  const failed = jobRowOf({ run: run({ state: 'failed', error: 'Film lookup timed out', finishedAt: at('21:42') }), nowMs: at('22:00'), timeZone })
  assert.equal(failed.sub, 'Film lookup timed out')
  assert.equal(failed.icon, 'failed')
  assert.equal(failed.tone, 'fail')
  const warned = jobRowOf({ run: run({ kind: 'health', state: 'done', tone: 'warn', outcome: '1 warning', finishedAt: at('21:42') }), nowMs: at('22:00'), timeZone })
  assert.equal(warned.icon, 'warn')
  assert.equal(warned.tone, 'warn')
})

test('a recording row counts down to the padded stop and shows its slot', () => {
  const row = recordingRowOf({
    recording: {
      id: 'recording-u1', title: 'Big Brother', season: 16, episode: 12, channelName: '10 HD',
      start: at('19:30'), stop: at('20:40'), stopPadded: at('20:50'), recordingStartedAt: at('19:28'), tuner: 'Tuner 2',
    },
    nowMs: at('20:02'),
    timeZone,
  })
  assert.equal(row.title, 'Recording · Big Brother S16 E12')
  assert.equal(row.sub, '10 HD · 7:30pm–8:40pm, stops 8:50pm · Tuner 2')
  assert.equal(row.side, '48m left')
  assert.equal(row.percent, 41)
  assert.equal(row.live, true)
})

test('a session row names the device and how the video plays', () => {
  const row = sessionRowOf({
    session: {
      id: 'a', kind: 'live', label: '7 Sydney', viewers: 1, videoMode: 'copy', startedAt: at('21:00'),
      client: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    },
    nowMs: at('21:31'),
  })
  assert.equal(row.title, '7 Sydney')
  assert.equal(row.sub, 'Live TV · iPhone · Safari · copy, no conversion')
  assert.equal(row.side, '31m')
  const recording = sessionRowOf({ session: { id: 'b', kind: 'playback', label: '"Grand Designs: Auckland"', videoMode: 'vaapi', startedAt: at('21:00') }, nowMs: at('21:01') })
  assert.equal(recording.title, 'Grand Designs: Auckland')
  assert.equal(recording.sub, 'Recording · converted with VAAPI')
  assert.equal(recording.icon, 'playing')
})

test('clientLabelOf names common devices and browsers', () => {
  assert.equal(clientLabelOf('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'), 'iPad · Home Screen app')
  assert.equal(clientLabelOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'), 'Mac · Chrome')
  assert.equal(clientLabelOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0'), 'Windows · Edge')
  assert.equal(clientLabelOf(null), null)
})

test('up next shows minutes when soon and a clock time otherwise', () => {
  const soon = upNextRowOf({ plan: { kind: 'hero', title: 'Home hero rebuild', every: 'every 5 minutes', nextAt: at('21:44') }, nowMs: at('21:41'), timeZone })
  assert.equal(soon.side, 'in 3m')
  assert.equal(soon.sub, 'Every 5 minutes')
  const later = upNextRowOf({ plan: { kind: 'prune', title: 'Cache prune', every: 'every day', nextAt: at('23:58') + 14 * 60_000 }, nowMs: at('21:41'), timeZone })
  assert.equal(later.side, 'tomorrow 12:12am')
  const tonight = upNextRowOf({ plan: { kind: 'prune', title: 'Cache prune', every: 'every day', nextAt: at('23:30') }, nowMs: at('21:41'), timeZone })
  assert.equal(tonight.side, '11:30pm')
})

test('the server line reads uptime, pauses, and tuners', () => {
  const parts = serverLineOf({ uptimeSeconds: 6 * 3600 + 8 * 60, stalls: 66, worstStallMs: 8100, thresholdMs: 100, tuners: { inUse: 2, total: 2 } })
  assert.equal(parts.map((part) => `${part.before}${part.value}${part.after}`).join(' · '),
    'Server up 6 h 8 m · 66 pauses over 100 ms, worst 8.1 s · Tuners 2 of 2 in use')
  assert.deepEqual(serverLineOf({}), [])
  assert.equal(serverLineOf({ stalls: 0, thresholdMs: 100 })[0].after, ' pauses over 100 ms')
})

test('small formatters', () => {
  assert.equal(durationText(30_000), 'under 1m')
  assert.equal(durationText(70 * 60_000), '1h 10m')
  assert.equal(uptimeText(3 * 86400), '3 days')
  assert.equal(triggerText('recording-finished'), 'after a recording')
  assert.equal(triggerText(null), null)
  assert.equal(triggerText('cron'), null)
  assert.equal(startedByText('cron'), 'Schedule')
  assert.equal(startedByText('manual'), 'manual')
})
