const envTimeZone = process.env.TZ || ''

export const timeZoneFromEnv = () => envTimeZone

export const isKnownTimeZone = (zone) => {
  if (!zone) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

export const currentTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

export const resolveTimeZone = ({ envTz, stored, system }) => {
  if (envTz) return { zone: envTz, source: 'env' }
  if (isKnownTimeZone(stored)) return { zone: stored, source: 'setting' }
  return { zone: system, source: 'system' }
}

export const applyStoredTimeZone = async ({ getSetting, envTz = envTimeZone, env = process.env }) => {
  const stored = await getSetting('time_zone')
  const resolved = resolveTimeZone({ envTz, stored, system: currentTimeZone() })
  if (resolved.source === 'setting') env.TZ = resolved.zone
  return resolved
}
