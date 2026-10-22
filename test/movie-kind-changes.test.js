import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONFIRM_AFTER_MS, createMovieKindChanges } from '../src/web/movie-kind-changes.js'
import { TOAST_ACTION_MS } from '../src/web/toast-queue.js'

const fakeTimers = () => {
  let seq = 0
  const timers = new Map()
  return {
    setTimer: (fn, ms) => {
      const id = ++seq
      timers.set(id, { fn, ms })
      return id
    },
    clearTimer: (id) => { timers.delete(id) },
    fireAll: async () => {
      for (const [id, { fn }] of [...timers]) {
        timers.delete(id)
        await fn()
      }
    },
    delays: () => [...timers.values()].map((timer) => timer.ms),
  }
}

const changesWith = ({ save = async () => {}, clear = async () => {} } = {}) => {
  const { fireAll, delays, ...timers } = fakeTimers()
  const calls = []
  const seen = []
  const changes = createMovieKindChanges({
    save: async (body) => { calls.push(['save', body]); return save(body) },
    clear: async (showKey) => { calls.push(['clear', showKey]); return clear(showKey) },
    onPendingChange: (keys) => seen.push([...keys]),
    ...timers,
  })
  const reload = async () => { calls.push(['reload']) }
  return { changes, timers: { fireAll, delays }, calls, seen, reload }
}

test('CONFIRM_AFTER_MS: waits out the Undo toast', () => {
  assert.ok(CONFIRM_AFTER_MS > TOAST_ACTION_MS)
})

test('change: the show leaves the list before the save and stays out until the confirming reload', async () => {
  const { changes, timers, calls, seen, reload } = changesWith()
  await changes.change({ showKey: 'heron', kind: 'not-movie', reload })
  assert.deepEqual(seen, [['heron']])
  assert.deepEqual(calls, [['save', { showKey: 'heron', kind: 'not-movie' }]])
  assert.deepEqual(timers.delays(), [CONFIRM_AFTER_MS])
  await timers.fireAll()
  assert.deepEqual(calls.at(-1), ['reload'])
  assert.deepEqual(seen.at(-1), [])
})

test('undo: the show comes back at once, with no reload before the clear', async () => {
  const { changes, timers, calls, seen, reload } = changesWith()
  await changes.change({ showKey: 'heron', kind: 'not-movie', reload })
  await changes.undo({ showKey: 'heron', reload })
  assert.deepEqual(seen, [['heron'], []])
  assert.deepEqual(calls.map(([name]) => name), ['save', 'clear', 'reload'])
  assert.deepEqual(timers.delays(), [])
})

test('change: a failed save puts the show back and rethrows', async () => {
  const { changes, timers, seen, reload } = changesWith({ save: async () => { throw new Error('offline') } })
  await assert.rejects(changes.change({ showKey: 'heron', kind: 'movie', reload }), /offline/)
  assert.deepEqual(seen, [['heron'], []])
  assert.deepEqual(timers.delays(), [])
})

test('undo: a failed clear still reloads so the list shows what the server holds', async () => {
  const { changes, calls, reload } = changesWith({ clear: async () => { throw new Error('offline') } })
  await changes.change({ showKey: 'heron', kind: 'not-movie', reload })
  await changes.undo({ showKey: 'heron', reload })
  assert.deepEqual(calls.at(-1), ['reload'])
})

test('change: other shows stay pending while one is undone or confirmed', async () => {
  const { changes, timers, seen, reload } = changesWith()
  await changes.change({ showKey: 'heron', kind: 'not-movie', reload })
  await changes.change({ showKey: 'egret', kind: 'movie', reload })
  assert.deepEqual(changes.pendingKeys(), new Set(['heron', 'egret']))
  await changes.undo({ showKey: 'heron', reload })
  assert.deepEqual(seen.at(-1), ['egret'])
  await timers.fireAll()
  assert.deepEqual(changes.pendingKeys(), new Set())
})
