import { orderChannels } from './channel-order.js'

export const FAVOURITE_SETTLE_MS = 600

export const createFavouriteToggle = ({
  save, currentPins, applyPins, onFailed = () => {}, isBusy = () => false,
  overrides = new Map(), delayMs = FAVOURITE_SETTLE_MS, timers = globalThis,
}) => {
  let intended = null

  const isStarred = (channel) => {
    const id = String(channel.id)
    return overrides.has(id) ? overrides.get(id) : Boolean(channel.pinned)
  }

  const toggle = (channel) => {
    const id = String(channel.id)
    const from = intended ?? currentPins()
    const pins = toggledPins({ pins: from, id })
    const starred = pins.includes(id)
    intended = pins
    if (starred === Boolean(channel.pinned)) overrides.delete(id)
    else overrides.set(id, starred)
    queue.push({ from, pins })
    settler.restart()
    return starred
  }

  let placing = Promise.resolve()
  let placesRunning = 0

  const afterPlaces = (step) => {
    placesRunning += 1
    placing = placing.then(step).catch(() => {}).finally(() => { placesRunning -= 1 })
    return placing
  }

  const place = () => {
    const pins = intended
    if (!pins) return undefined
    return afterPlaces(async () => {
      await applyPins(pins, { animate: true })
      if (intended === pins) intended = null
      pruneOverrides(pins)
    })
  }

  const pruneOverrides = (pins) => {
    [...overrides].forEach(([id, starred]) => {
      if (starred === pins.includes(id)) overrides.delete(id)
    })
  }

  const rollback = ({ pins, err }) => {
    settler.cancel()
    intended = null
    onFailed(err)
    return afterPlaces(async () => {
      overrides.clear()
      if (!samePins(pins, currentPins())) await applyPins(pins, { animate: true })
    })
  }

  const placementToKeep = () => (intended || placesRunning || queue.isPending() ? currentPins() : null)

  const adopt = (replace) => {
    const keep = placementToKeep()
    replace()
    if (keep) applyPins(keep, { animate: false })
  }

  const isUnsettled = () => intended !== null || placesRunning > 0 || queue.isPending()

  const queue = createSaveQueue({ save, onFailed: rollback })
  const settler = createSettleTimer({ delayMs, isBusy, onSettle: place, timers })

  return { toggle, isStarred, adopt, placementToKeep, isUnsettled, cancel: settler.cancel }
}

export const createSaveQueue = ({ save, onFailed = () => {}, onIdle = () => {} }) => {
  let confirmed = null
  let latest = null
  let sending = false

  const push = ({ from, pins }) => {
    if (confirmed === null) confirmed = from
    latest = pins
    if (!sending) return send()
    return undefined
  }

  const send = async () => {
    if (samePins(latest, confirmed)) return finish()
    sending = true
    const pins = latest
    try {
      await save(pins)
    } catch (err) {
      const restored = confirmed
      reset()
      onFailed({ pins: restored, err })
      return undefined
    }
    confirmed = pins
    if (latest !== pins) return send()
    return finish()
  }

  const finish = () => {
    const pins = confirmed
    reset()
    onIdle({ pins })
  }

  const reset = () => {
    confirmed = null
    latest = null
    sending = false
  }

  return { push, isPending: () => latest !== null, latest: () => latest }
}

export const createSettleTimer = ({ delayMs, isBusy = () => false, onSettle, timers = globalThis }) => {
  let handle = null

  const fire = () => {
    handle = null
    if (isBusy()) return restart()
    return onSettle()
  }

  const restart = () => {
    cancel()
    handle = timers.setTimeout(fire, delayMs)
  }

  const cancel = () => {
    if (handle !== null) timers.clearTimeout(handle)
    handle = null
  }

  return { restart, cancel, isArmed: () => handle !== null }
}

export const toggledPins = ({ pins, id }) => {
  const key = String(id)
  return pins.includes(key) ? pins.filter((pin) => pin !== key) : [...pins, key]
}

export const samePins = (a, b) => Boolean(a && b) && a.length === b.length && a.every((id, i) => id === b[i])

export const arrangeForPins = ({ channels, pins, prefs = {} }) => {
  const { sort = 'default', hiddenIds = [], hideSdSimulcasts = false, hideSdChannels = false } = prefs
  const natural = sort === 'default' ? [...channels].sort(byNumber) : channels
  const byId = new Map(channels.map((channel) => [String(channel.id), channel]))
  return orderChannels({ channels: natural, pinnedIds: pins, hiddenIds, sort, hideSdSimulcasts, hideSdChannels })
    .map(({ id, pinned, hidden }) => ({ channel: byId.get(String(id)), pinned, hidden }))
}

export const changedPins = ({ before, after }) => {
  const was = new Set(before)
  const now = new Set(after)
  return new Set([...before.filter((id) => !now.has(id)), ...after.filter((id) => !was.has(id))])
}

const byNumber = (a, b) => (a.number ?? Infinity) - (b.number ?? Infinity)
