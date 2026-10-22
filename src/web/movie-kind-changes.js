import { TOAST_ACTION_MS } from './toast-queue.js'

export const CONFIRM_AFTER_MS = TOAST_ACTION_MS + 1000

export const createMovieKindChanges = ({
  save,
  clear,
  onPendingChange = () => {},
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  confirmAfterMs = CONFIRM_AFTER_MS,
}) => {
  const pending = new Map()

  const publish = () => onPendingChange(new Set(pending.keys()))

  const drop = (showKey, entry = pending.get(showKey)) => {
    if (!entry || pending.get(showKey) !== entry) return
    if (entry.timer) clearTimer(entry.timer)
    pending.delete(showKey)
    publish()
  }

  const confirm = async ({ showKey, entry, reload }) => {
    entry.timer = null
    await Promise.resolve(reload()).catch(() => {})
    drop(showKey, entry)
  }

  const change = async ({ showKey, kind, title = null, reload = () => {} }) => {
    drop(showKey)
    const entry = { kind, timer: null }
    pending.set(showKey, entry)
    publish()
    try {
      await save({ showKey, kind, ...(title && { title }) })
    } catch (err) {
      drop(showKey, entry)
      throw err
    }
    if (pending.get(showKey) !== entry) return
    entry.timer = setTimer(() => confirm({ showKey, entry, reload }), confirmAfterMs)
  }

  const undo = async ({ showKey, reload = () => {} }) => {
    drop(showKey)
    await Promise.resolve(clear(showKey)).catch(() => {})
    await Promise.resolve(reload()).catch(() => {})
  }

  return { change, undo, pendingKeys: () => new Set(pending.keys()) }
}
