import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  arrangeForPins,
  changedPins,
  createFavouriteToggle,
  createSaveQueue,
  createSettleTimer,
  samePins,
  toggledPins,
} from '../src/web/favourite-queue.js'

const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

const controlledSave = () => {
  const calls = []
  const save = (pins) => {
    const call = { pins, ...deferred() }
    calls.push(call)
    return call.promise
  }
  return { save, calls }
}

const fakeTimers = () => {
  const pending = new Map()
  let next = 1
  return {
    setTimeout: (fn) => { pending.set(next, fn); return next++ },
    clearTimeout: (id) => { pending.delete(id) },
    runAll: () => {
      const due = [...pending.values()]
      pending.clear()
      due.forEach((fn) => fn())
    },
    count: () => pending.size,
  }
}

const viewOf = (pins) => {
  const state = { pins: [...pins], applied: [] }
  const channels = ['1', '2', '3', '4'].map((id) => ({ id, get pinned() { return state.pins.includes(id) } }))
  return {
    state,
    channel: (id) => channels.find((c) => c.id === id),
    currentPins: () => [...state.pins],
    applyPins: (next, { animate }) => {
      state.pins = [...next]
      state.applied.push({ pins: [...next], animate })
    },
  }
}

test('toggledPins appends a new favourite and removes an existing one', () => {
  assert.deepEqual(toggledPins({ pins: ['1', '2'], id: 3 }), ['1', '2', '3'])
  assert.deepEqual(toggledPins({ pins: ['1', '2'], id: '1' }), ['2'])
})

test('samePins and changedPins compare pin lists', () => {
  assert.equal(samePins(['1', '2'], ['1', '2']), true)
  assert.equal(samePins(['1', '2'], ['2', '1']), false)
  assert.equal(samePins(null, []), false)
  assert.deepEqual([...changedPins({ before: ['1', '2'], after: ['2', '3'] })].sort(), ['1', '3'])
})

test('save queue keeps one save in flight and sends only the latest list', async () => {
  const { save, calls } = controlledSave()
  const queue = createSaveQueue({ save })
  queue.push({ from: [], pins: ['1'] })
  queue.push({ from: ['1'], pins: ['1', '2'] })
  queue.push({ from: ['1', '2'], pins: ['1', '2', '3'] })
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].pins, ['1'])
  calls[0].resolve()
  await flush()
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[1].pins, ['1', '2', '3'])
  assert.equal(queue.isPending(), true)
  calls[1].resolve()
  await flush()
  assert.equal(calls.length, 2)
  assert.equal(queue.isPending(), false)
})

test('save queue sends the original list again when a tap undoes a save in flight', async () => {
  const { save, calls } = controlledSave()
  const queue = createSaveQueue({ save })
  queue.push({ from: ['1'], pins: ['1', '2'] })
  queue.push({ from: ['1', '2'], pins: ['1'] })
  calls[0].resolve()
  await flush()
  assert.deepEqual(calls.map((c) => c.pins), [['1', '2'], ['1']])
})

test('save queue skips the save when the latest list equals the confirmed one', async () => {
  const { save, calls } = controlledSave()
  const idle = []
  const queue = createSaveQueue({ save, onIdle: ({ pins }) => idle.push(pins) })
  queue.push({ from: ['1'], pins: ['1', '2'] })
  queue.push({ from: ['1', '2'], pins: ['1', '2', '3'] })
  queue.push({ from: ['1', '2', '3'], pins: ['1', '2'] })
  calls[0].resolve()
  await flush()
  assert.equal(calls.length, 1)
  assert.deepEqual(idle, [['1', '2']])
})

test('save queue rolls back to the last confirmed list on failure and drops queued lists', async () => {
  const { save, calls } = controlledSave()
  const failures = []
  const queue = createSaveQueue({ save, onFailed: (failure) => failures.push(failure) })
  queue.push({ from: ['1'], pins: ['1', '2'] })
  queue.push({ from: ['1', '2'], pins: ['1', '2', '3'] })
  calls[0].resolve()
  await flush()
  queue.push({ from: ['1', '2', '3'], pins: ['1', '2', '3', '4'] })
  calls[1].reject(new Error('offline'))
  await flush()
  assert.equal(calls.length, 2)
  assert.deepEqual(failures[0].pins, ['1', '2'])
  assert.equal(failures[0].err.message, 'offline')
  assert.equal(queue.isPending(), false)
})

test('settle timer restarts on each tap and waits while the view is busy', () => {
  const timers = fakeTimers()
  let busy = false
  let settled = 0
  const settler = createSettleTimer({ delayMs: 600, isBusy: () => busy, onSettle: () => { settled += 1 }, timers })
  settler.restart()
  settler.restart()
  assert.equal(timers.count(), 1)
  busy = true
  timers.runAll()
  assert.equal(settled, 0)
  assert.equal(settler.isArmed(), true)
  busy = false
  timers.runAll()
  assert.equal(settled, 1)
  assert.equal(settler.isArmed(), false)
})

test('favourite toggle flips the star at once and moves the row only after the delay', async () => {
  const timers = fakeTimers()
  const { save, calls } = controlledSave()
  const view = viewOf(['1'])
  const favourites = createFavouriteToggle({ save, ...view, timers })
  const starred = favourites.toggle(view.channel('3'))
  assert.equal(starred, true)
  assert.equal(favourites.isStarred(view.channel('3')), true)
  assert.equal(view.channel('3').pinned, false)
  assert.deepEqual(calls[0].pins, ['1', '3'])
  assert.deepEqual(view.state.applied, [])
  timers.runAll()
  await flush()
  assert.deepEqual(view.state.applied, [{ pins: ['1', '3'], animate: true }])
  assert.equal(favourites.isStarred(view.channel('3')), true)
  calls[0].resolve()
  await flush()
  assert.equal(favourites.isUnsettled(), false)
})

test('fast taps build on each other instead of on stale view state', async () => {
  const timers = fakeTimers()
  const { save, calls } = controlledSave()
  const view = viewOf([])
  const favourites = createFavouriteToggle({ save, ...view, timers })
  favourites.toggle(view.channel('2'))
  favourites.toggle(view.channel('3'))
  favourites.toggle(view.channel('2'))
  favourites.toggle(view.channel('4'))
  assert.equal(favourites.isStarred(view.channel('2')), false)
  assert.equal(favourites.isStarred(view.channel('3')), true)
  calls[0].resolve()
  await flush()
  assert.deepEqual(calls.map((c) => c.pins), [['2'], ['3', '4']])
  timers.runAll()
  await flush()
  assert.deepEqual(view.state.pins, ['3', '4'])
  assert.equal(view.state.applied.length, 1)
})

test('incoming data keeps the local placement while a change is unsettled or unsaved', async () => {
  const timers = fakeTimers()
  const { save, calls } = controlledSave()
  const view = viewOf(['1'])
  const favourites = createFavouriteToggle({ save, ...view, timers })
  favourites.toggle(view.channel('2'))
  favourites.adopt(() => { view.state.pins = ['4'] })
  assert.deepEqual(view.state.pins, ['1'])
  assert.equal(favourites.isStarred(view.channel('2')), true)
  timers.runAll()
  await flush()
  favourites.adopt(() => { view.state.pins = ['1'] })
  assert.deepEqual(view.state.pins, ['1', '2'])
  calls[0].resolve()
  await flush()
  favourites.adopt(() => { view.state.pins = ['1', '2', '3'] })
  assert.deepEqual(view.state.pins, ['1', '2', '3'])
})

test('a settled response from a request started before the save keeps the local pins', async () => {
  const timers = fakeTimers()
  const { save, calls } = controlledSave()
  const view = viewOf(['1'])
  const favourites = createFavouriteToggle({ save, ...view, timers })
  favourites.toggle(view.channel('2'))
  timers.runAll()
  await flush()
  calls[0].resolve()
  await flush()
  assert.equal(favourites.isUnsettled(), false)
  favourites.adopt(() => { view.state.pins = ['1'] }, { stale: true })
  assert.deepEqual(view.state.pins, ['1', '2'])
  favourites.adopt(() => { view.state.pins = ['1', '2', '5'] })
  assert.deepEqual(view.state.pins, ['1', '2', '5'])
})

test('a failed save rolls the star and the rows back and reports the error', async () => {
  const timers = fakeTimers()
  const { save, calls } = controlledSave()
  const view = viewOf(['1'])
  const errors = []
  const favourites = createFavouriteToggle({ save, ...view, timers, onFailed: (err) => errors.push(err.message) })
  favourites.toggle(view.channel('2'))
  timers.runAll()
  await flush()
  assert.deepEqual(view.state.pins, ['1', '2'])
  calls[0].reject(new Error('HTTP 500'))
  await flush()
  assert.deepEqual(view.state.pins, ['1'])
  assert.deepEqual(errors, ['HTTP 500'])
  assert.equal(favourites.isStarred(view.channel('2')), false)
})

test('a failed save before the delay cancels the move and clears the star', async () => {
  const timers = fakeTimers()
  const { save, calls } = controlledSave()
  const view = viewOf(['1'])
  const favourites = createFavouriteToggle({ save, ...view, timers })
  favourites.toggle(view.channel('1'))
  assert.equal(favourites.isStarred(view.channel('1')), false)
  calls[0].reject(new Error('offline'))
  await flush()
  assert.equal(timers.count(), 0)
  assert.equal(favourites.isStarred(view.channel('1')), true)
  assert.deepEqual(view.state.applied, [])
})

test('arrangeForPins puts favourites first in pin order and restores the number order of the rest', () => {
  const channels = [
    { id: 'c', number: 3 }, { id: 'a', number: 1 }, { id: 'b', number: 2 }, { id: 'd', number: 4 },
  ]
  const arranged = arrangeForPins({ channels, pins: ['d'], prefs: { sort: 'default' } })
  assert.deepEqual(arranged.map((a) => a.channel.id), ['d', 'a', 'b', 'c'])
  assert.equal(arranged[0].channel, channels[3])
  assert.deepEqual(arranged.map((a) => a.pinned), [true, false, false, false])
})

test('arrangeForPins hides an unpinned channel that the hide rules cover', () => {
  const channels = [{ id: 'sd', number: 1, name: 'Seven', hd: false }, { id: 'hd', number: 2, name: 'Seven HD', hd: true }]
  const arranged = arrangeForPins({ channels, pins: [], prefs: { hideSdChannels: true } })
  assert.deepEqual(arranged.map((a) => [a.channel.id, a.hidden]), [['sd', true], ['hd', false]])
})

test('a tap during a running move builds on the moving list and keeps its star', async () => {
  const timers = fakeTimers()
  const { save, calls } = controlledSave()
  const view = viewOf(['1'])
  const moves = []
  const applyPins = (next, options) => {
    const move = deferred()
    moves.push(move)
    return move.promise.then(() => view.applyPins(next, options))
  }
  const favourites = createFavouriteToggle({ save, ...view, applyPins, timers })
  favourites.toggle(view.channel('2'))
  timers.runAll()
  await flush()
  favourites.toggle(view.channel('3'))
  assert.equal(favourites.isStarred(view.channel('2')), true)
  assert.equal(favourites.isStarred(view.channel('3')), true)
  moves[0].resolve()
  await flush()
  assert.deepEqual(view.state.pins, ['1', '2'])
  assert.equal(favourites.isStarred(view.channel('3')), true)
  timers.runAll()
  await flush()
  moves[1].resolve()
  await flush()
  assert.deepEqual(view.state.pins, ['1', '2', '3'])
  calls[0].resolve()
  await flush()
  assert.deepEqual(calls.map((c) => c.pins), [['1', '2'], ['1', '2', '3']])
})
