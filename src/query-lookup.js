export const ownValueOf = (map, key) => (typeof key === 'string' && Object.hasOwn(map, key) ? map[key] : null)
