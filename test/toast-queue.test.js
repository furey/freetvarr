import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TOAST_ACTION_MS,
  TOAST_MAX_WIDTH,
  TOAST_MS,
  createToastQueue,
  isSameToast,
  toastDurationOf,
  toastKindOf,
  toastPlacementOf,
} from '../src/web/toast-queue.js'

const fakeTimers = () => {
  let clock = 0
  let seq = 0
  const timers = new Map()
  return {
    now: () => clock,
    setTimer: (fn, ms) => {
      const id = ++seq
      timers.set(id, { fn, at: clock + ms })
      return id
    },
    clearTimer: (id) => { timers.delete(id) },
    advance: (ms) => {
      clock += ms
      for (const [id, { fn, at }] of [...timers]) {
        if (at > clock) continue
        timers.delete(id)
        fn()
      }
    },
    pending: () => timers.size,
  }
}

const queueWith = () => {
  const timers = fakeTimers()
  const seen = []
  const queue = createToastQueue({ onChange: (next) => seen.push(next), ...timers })
  return { queue, timers, seen, shown: () => seen.at(-1) }
}

test('toastKindOf: maps flash and library kinds onto ok, info, and error', () => {
  assert.equal(toastKindOf('ok'), 'ok')
  assert.equal(toastKindOf('err'), 'error')
  assert.equal(toastKindOf('error'), 'error')
  assert.equal(toastKindOf('info'), 'info')
  assert.equal(toastKindOf(undefined), 'ok')
})

test('toastDurationOf: success 4 s, with an action 6 s, errors and persistent toasts stay', () => {
  assert.equal(toastDurationOf({ kind: 'ok' }), TOAST_MS)
  assert.equal(toastDurationOf({ kind: 'ok', action: { label: 'Undo' } }), TOAST_ACTION_MS)
  assert.equal(toastDurationOf({ kind: 'err' }), null)
  assert.equal(toastDurationOf({ kind: 'ok', persist: true }), null)
})

test('isSameToast: compares text, detail, and kind', () => {
  assert.equal(isSameToast({ text: 'Saved.' }, { text: 'Saved.', kind: 'ok' }), true)
  assert.equal(isSameToast({ text: 'Saved.' }, { text: 'Saved.', kind: 'err' }), false)
  assert.equal(isSameToast({ text: 'Saved.', detail: 'a' }, { text: 'Saved.' }), false)
  assert.equal(isSameToast(null, { text: 'Saved.' }), false)
})

test('queue: a success toast hides after 4 s', () => {
  const { queue, timers, shown } = queueWith()
  queue.show({ text: 'Channel preferences saved.' })
  timers.advance(TOAST_MS - 1)
  assert.equal(shown().text, 'Channel preferences saved.')
  timers.advance(1)
  assert.equal(shown(), null)
})

test('queue: the newest toast replaces the current one', () => {
  const { queue, timers, shown } = queueWith()
  const first = queue.show({ text: 'Scheduled "The Block".' })
  timers.advance(3000)
  const second = queue.show({ text: 'Guide refreshed.' })
  assert.notEqual(first, second)
  assert.equal(shown().text, 'Guide refreshed.')
  timers.advance(TOAST_MS - 1)
  assert.equal(shown().text, 'Guide refreshed.')
  timers.advance(1)
  assert.equal(shown(), null)
  assert.equal(timers.pending(), 0)
})

test('queue: the same text again keeps its id and restarts the timer', () => {
  const { queue, timers, shown } = queueWith()
  const first = queue.show({ text: 'Saved.' })
  timers.advance(3000)
  const again = queue.show({ text: 'Saved.' })
  assert.equal(again, first)
  timers.advance(3000)
  assert.equal(shown().text, 'Saved.')
  timers.advance(TOAST_MS - 3000)
  assert.equal(shown(), null)
})

test('queue: an error stays until dismissed', () => {
  const { queue, timers, shown } = queueWith()
  const id = queue.show({ text: 'Reorder failed: offline', kind: 'error' })
  timers.advance(60_000)
  assert.equal(shown().kind, 'error')
  queue.dismiss(id)
  assert.equal(shown(), null)
})

test('queue: dismissing an old id leaves the newer toast alone', () => {
  const { queue, shown } = queueWith()
  const old = queue.show({ text: 'Started sync #4.', persist: true })
  queue.show({ text: 'Saved.' })
  queue.dismiss(old)
  assert.equal(shown().text, 'Saved.')
})

test('queue: a pause holds the remaining time until every reason resumes', () => {
  const { queue, timers, shown } = queueWith()
  queue.show({ text: 'The Block is hidden from For you', action: { label: 'Undo', run: () => {} } })
  timers.advance(2000)
  queue.pause('pointer')
  queue.pause('hidden')
  timers.advance(60_000)
  assert.equal(shown().text, 'The Block is hidden from For you')
  queue.resume('pointer')
  timers.advance(60_000)
  assert.equal(shown().text, 'The Block is hidden from For you')
  queue.resume('hidden')
  timers.advance(TOAST_ACTION_MS - 2001)
  assert.notEqual(shown(), null)
  timers.advance(1)
  assert.equal(shown(), null)
})

test('queue: a toast shown while paused waits for the resume', () => {
  const { queue, timers, shown } = queueWith()
  queue.pause('focus')
  queue.show({ text: 'Saved.' })
  timers.advance(10_000)
  assert.equal(shown().text, 'Saved.')
  queue.resume('focus')
  timers.advance(TOAST_MS)
  assert.equal(shown(), null)
})

test('queue: resuming a reason that never paused changes nothing', () => {
  const { queue, timers, shown } = queueWith()
  queue.show({ text: 'Saved.' })
  timers.advance(3000)
  queue.resume('pointer')
  timers.advance(1000)
  assert.equal(shown(), null)
})

test('placement: on phone the toast stacks above the Miniplayer bar', () => {
  const placement = toastPlacementOf({
    phone: true,
    viewportHeight: 844,
    toastLeft: 8,
    obstacles: [{ top: 688, left: 8, gap: 8 }],
  })
  assert.deepEqual(placement, { clearBottom: 164, maxWidth: null })
})

test('placement: on tablet the toast narrows beside the Miniplayer card', () => {
  const placement = toastPlacementOf({
    phone: false,
    viewportHeight: 1112,
    toastLeft: 112,
    obstacles: [{ top: 822, left: 450, gap: 8 }],
  })
  assert.deepEqual(placement, { clearBottom: 0, maxWidth: 314 })
})

test('placement: a wide gap keeps the full width', () => {
  const placement = toastPlacementOf({
    phone: false,
    viewportHeight: 768,
    toastLeft: 112,
    obstacles: [{ top: 478, left: 982, gap: 8 }],
  })
  assert.equal(placement.maxWidth, TOAST_MAX_WIDTH)
})

test('placement: the toast stacks 12 px above the update card', () => {
  const placement = toastPlacementOf({
    phone: false,
    viewportHeight: 768,
    toastLeft: 112,
    obstacles: [{ top: 560, left: 120, gap: 12 }],
  })
  assert.deepEqual(placement, { clearBottom: 220, maxWidth: null })
})

test('placement: no obstacles leaves the CSS defaults', () => {
  assert.deepEqual(toastPlacementOf({ phone: true, viewportHeight: 844, toastLeft: 8, obstacles: [] }), { clearBottom: 0, maxWidth: null })
})
