import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createActivity, nextIntervalRun, isKept, FAILED_KEPT_MS, FINISHED_KEPT_MS } from '../src/activity.js'

const HOUR = 60 * 60 * 1000

const clock = (start = 1_000_000) => {
  let at = start
  return { now: () => at, advance: (ms) => { at += ms } }
}

test('track lists a job as running, then as finished with its steps timed', async () => {
  const time = clock()
  const activity = createActivity({ now: time.now })
  let seen = null
  await activity.track({ kind: 'sync', trigger: 'cron' }, async (job) => {
    job.step('List finished recordings')
    time.advance(300)
    job.step('Import new recordings').total(4, 'recordings').advance(1)
    seen = activity.snapshot().running
    time.advance(700)
    job.outcome('1 imported')
  })
  assert.equal(seen.length, 1)
  assert.equal(seen[0].step, 'Import new recordings')
  assert.equal(seen[0].percent, 25)
  const [done] = activity.snapshot().recent
  assert.equal(done.state, 'done')
  assert.equal(done.outcome, '1 imported')
  assert.equal(done.trigger, 'cron')
  const detail = activity.get(done.id)
  assert.deepEqual(detail.steps.map((step) => [step.label, step.state, step.ms]), [
    ['List finished recordings', 'done', 300],
    ['Import new recordings', 'done', 700],
  ])
  assert.equal(activity.runningCount(), 0)
})

test('a thrown error fails the job, keeps the reason, and still rethrows', async () => {
  const activity = createActivity({ now: clock().now })
  await assert.rejects(activity.track({ kind: 'prune' }, async () => { throw new Error('disk full\nmore') }), /disk full/)
  const [failed] = activity.snapshot().recent
  assert.equal(failed.state, 'failed')
  assert.equal(failed.error, 'disk full')
})

test('fail without a throw marks the job failed when it ends', async () => {
  const activity = createActivity({ now: clock().now })
  await activity.track({ kind: 'sync' }, async (job) => { job.fail('TVHeadend did not answer') })
  assert.equal(activity.snapshot().recent[0].state, 'failed')
})

test('nested jobs point at their parent and currentJob follows async work', async () => {
  const activity = createActivity({ now: clock().now })
  await activity.track({ kind: 'sync', trigger: 'manual' }, async () => {
    await activity.track({ kind: 'import', title: 'Import · News' }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1))
      activity.current().update({ step: 'Copy from TVHeadend', percent: 40, etaSeconds: 12.4 })
      const running = activity.snapshot().running.find((run) => run.kind === 'import')
      assert.equal(running.percent, 40)
      assert.equal(running.etaSeconds, 12)
      assert.equal(running.trigger, 'manual')
    })
  })
  const [child, parent] = activity.snapshot().recent.sort((a, b) => a.kind.localeCompare(b.kind))
  assert.equal(child.kind, 'import')
  assert.equal(child.parentId, parent.id)
})

test('join reuses a running job of a listed kind and starts its own otherwise', async () => {
  const activity = createActivity({ now: clock().now })
  await activity.track({ kind: 'import' }, () => activity.join({ kinds: ['import'], kind: 'ads' }, (job) => job.step('Scan for ads')))
  await activity.join({ kinds: ['import'], kind: 'ads', title: 'Ad removal · News' }, async () => {})
  assert.deepEqual(activity.snapshot().recent.map((run) => run.kind).sort(), ['ads', 'import'])
})

test('quiet jobs keep only their latest success', async () => {
  const activity = createActivity({ now: clock().now })
  for (let i = 0; i < 3; i++) await activity.track({ kind: 'hero' }, async () => {})
  await assert.rejects(activity.track({ kind: 'hero' }, async () => { throw new Error('no feed') }))
  await activity.track({ kind: 'hero' }, async () => {})
  assert.deepEqual(activity.snapshot().recent.map((run) => run.state).sort(), ['done', 'failed'])
  await assert.rejects(activity.track({ kind: 'hero' }, async () => { throw new Error('still no feed') }))
  assert.deepEqual(activity.snapshot().recent.filter((run) => run.state === 'failed').map((run) => run.error), ['still no feed'])
})

test('finished jobs drop after 24 hours and failed ones after 7 days', async () => {
  const time = clock()
  const activity = createActivity({ now: time.now })
  await activity.track({ kind: 'sync' }, async () => {})
  await assert.rejects(activity.track({ kind: 'prune' }, async () => { throw new Error('locked') }))
  time.advance(FINISHED_KEPT_MS + 1)
  assert.deepEqual(activity.snapshot().recent.map((run) => run.kind), ['prune'])
  time.advance(FAILED_KEPT_MS)
  assert.deepEqual(activity.snapshot().recent, [])
})

test('failed runs go to the store and come back after a restart', async () => {
  const saved = []
  const store = {
    save: async (run) => saved.push(JSON.parse(JSON.stringify(run))),
    load: async () => saved,
    prune: async () => 0,
  }
  const time = clock()
  const first = createActivity({ now: time.now })
  await first.useStore(store)
  await assert.rejects(first.track({ kind: 'health' }, async () => { throw new Error('TVHeadend down') }))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(saved.length, 1)
  const second = createActivity({ now: time.now })
  await second.useStore(store)
  const [restored] = second.snapshot().recent
  assert.equal(restored.error, 'TVHeadend down')
  assert.equal(second.get(restored.id).state, 'failed')
})

test('subscribers hear about each change', async () => {
  const activity = createActivity({ now: clock().now })
  const heard = []
  const stop = activity.subscribe((run) => heard.push(run.state))
  await activity.track({ kind: 'prune' }, async (job) => { job.step('show_artwork') })
  stop()
  await activity.track({ kind: 'prune' }, async () => {})
  assert.deepEqual(heard, ['running', 'running', 'done'])
})

test('logs and items are capped', async () => {
  const activity = createActivity({ now: clock().now })
  await activity.track({ kind: 'health' }, async (job) => {
    for (let i = 0; i < 150; i++) job.log(`line ${i}`)
    for (let i = 0; i < 250; i++) job.item({ label: `check ${i}` })
  })
  const detail = activity.get(activity.snapshot().recent[0].id)
  assert.equal(detail.log.length, 100)
  assert.equal(detail.log[0].text, 'line 50')
  assert.equal(detail.items.length, 200)
})

test('up next lists plans soonest first and skips plans with no time', () => {
  const time = clock(0)
  const activity = createActivity({ now: time.now })
  activity.planEvery({ kind: 'health', every: 'every 3 hours', firstDelayMs: 2 * 60_000, everyMs: 3 * HOUR })
  activity.plan({ kind: 'sync', every: 'every 30 minutes', nextAt: () => 60_000 })
  activity.plan({ kind: 'prune', every: 'every day', nextAt: () => null })
  assert.deepEqual(activity.snapshot().upNext.map((plan) => [plan.kind, plan.nextAt]), [
    ['sync', 60_000],
    ['health', 120_000],
  ])
})

test('nextIntervalRun counts from the first timer, then the repeating one', () => {
  assert.equal(nextIntervalRun({ startedAt: 0, firstDelayMs: 120, everyMs: 1000, nowMs: 50 }), 120)
  assert.equal(nextIntervalRun({ startedAt: 0, firstDelayMs: 120, everyMs: 1000, nowMs: 500 }), 1000)
  assert.equal(nextIntervalRun({ startedAt: 0, firstDelayMs: 120, everyMs: 1000, nowMs: 2500 }), 3000)
})

test('isKept uses the longer window for failed runs', () => {
  assert.equal(isKept({ run: { state: 'done', finishedAt: 0 }, nowMs: 2 * 24 * HOUR }), false)
  assert.equal(isKept({ run: { state: 'failed', finishedAt: 0 }, nowMs: 2 * 24 * HOUR }), true)
})
