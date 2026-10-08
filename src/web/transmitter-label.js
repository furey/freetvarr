const COUNTRY_PREFIX = /^[a-z]{2}-/i

export const transmitterLabel = (id) => {
  const name = String(id ?? '')
  if (!COUNTRY_PREFIX.test(name)) return name
  return name.replace(COUNTRY_PREFIX, '').replace(/_+/g, ' ').trim()
}
