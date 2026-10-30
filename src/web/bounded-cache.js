export const boundedMap = (limit) => {
  const map = new Map()
  const setEntry = map.set.bind(map)
  map.set = (key, value) => {
    map.delete(key)
    setEntry(key, value)
    dropOldest(map, limit)
    return map
  }
  return map
}

export const expiringMap = ({ limit, ttlMs, now = Date.now }) => {
  const entries = boundedMap(limit)
  return {
    get: (key) => {
      const entry = entries.get(key)
      if (!entry) return undefined
      if (now() - entry.savedAt < ttlMs) return entry.value
      entries.delete(key)
      return undefined
    },
    set: (key, value) => {
      entries.set(key, { value, savedAt: now() })
    },
  }
}

export const boundedSet = (limit) => {
  const set = new Set()
  const addEntry = set.add.bind(set)
  set.add = (value) => {
    set.delete(value)
    addEntry(value)
    dropOldest(set, limit)
    return set
  }
  return set
}

const dropOldest = (collection, limit) => {
  while (collection.size > limit) collection.delete(collection.keys().next().value)
}
