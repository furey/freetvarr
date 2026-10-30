import { eventRowOf } from './user-events.js'

export const createEventWriter = ({
  insertRows,
  now = Date.now,
  flushMs = 5_000,
  maxBuffered = 1_000,
  chunkSize = 200,
  warn = (message) => console.warn(`[events] ${message}`),
}) => {
  let buffer = []
  let enabled = true
  let timer = null
  let flushing = Promise.resolve()

  const log = (event) => {
    if (!enabled) return false
    try {
      if (buffer.length >= maxBuffered) buffer.shift()
      buffer.push(eventRowOf({ event, nowMs: now() }))
      return true
    } catch (err) {
      warn(`could not shape a ${event?.kind} event: ${err.message}`)
      return false
    }
  }

  const flush = () => {
    flushing = flushing.then(writeBuffered)
    return flushing
  }

  const writeBuffered = async () => {
    const rows = buffer
    buffer = []
    for (let i = 0; i < rows.length; i += chunkSize) {
      try {
        await insertRows(rows.slice(i, i + chunkSize))
      } catch (err) {
        warn(`dropped ${rows.slice(i, i + chunkSize).length} event(s): ${err.message}`)
      }
    }
    return rows.length
  }

  const start = () => {
    if (timer) return
    timer = setInterval(() => { flush() }, flushMs)
    timer.unref?.()
  }

  const stop = async () => {
    clearInterval(timer)
    timer = null
    return flush()
  }

  const setEnabled = (value) => {
    enabled = Boolean(value)
    if (!enabled) buffer = []
  }

  const discard = () => { buffer = [] }

  return { log, flush, start, stop, setEnabled, discard, isEnabled: () => enabled, pending: () => buffer.length }
}
