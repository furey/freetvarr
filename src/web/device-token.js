export const DEVICE_TOKEN_KEY = 'freetvarr.deviceToken'

export const deviceTokenFrom = ({ storage, newToken }) => {
  try {
    const stored = storage?.getItem(DEVICE_TOKEN_KEY)
    if (stored) return stored
    const token = newToken()
    storage?.setItem(DEVICE_TOKEN_KEY, token)
    return token
  } catch {
    return newToken()
  }
}
