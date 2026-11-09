import { randomBytes } from 'node:crypto'

export const ART_FEED_SIZE = 500

export const createArtFeed = ({ size = ART_FEED_SIZE, bootId = randomBytes(4).toString('hex') } = {}) => {
  const changes = []
  const listeners = new Set()
  let sequence = 0

  const cursor = () => cursorOf({ bootId, sequence })

  const publish = ({ key, kind, stamp = null }) => {
    if (!key || !kind) return
    sequence += 1
    changes.push({ sequence, key, kind, stamp })
    if (changes.length > size) changes.shift()
    listeners.forEach((listener) => listener())
  }

  const reset = () => {
    changes.length = 0
    sequence += 1
    listeners.forEach((listener) => listener())
  }

  const since = (from) => {
    const parsed = parsedCursorOf(from)
    const oldest = changes[0]?.sequence ?? sequence + 1
    const missedSome = !parsed || parsed.bootId !== bootId || parsed.sequence > sequence || parsed.sequence + 1 < oldest
    if (missedSome) return { cursor: cursor(), reset: true, stamps: [] }
    return { cursor: cursor(), reset: false, stamps: latestPerPicture(changes.filter((change) => change.sequence > parsed.sequence)) }
  }

  const subscribe = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return { cursor, publish, reset, since, subscribe }
}

export const parsedCursorOf = (value) => {
  const match = /^([0-9a-z]{1,16})\.(\d{1,15})$/.exec(String(value ?? ''))
  return match ? { bootId: match[1], sequence: Number(match[2]) } : null
}

const cursorOf = ({ bootId, sequence }) => `${bootId}.${sequence}`

const latestPerPicture = (list) => {
  const byPicture = new Map()
  for (const { key, kind, stamp } of list) {
    const id = `${kind}|${key}`
    byPicture.delete(id)
    byPicture.set(id, { key, kind, stamp })
  }
  return [...byPicture.values()]
}

export const artFeed = createArtFeed()
