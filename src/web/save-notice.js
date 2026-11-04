export const savedNoticeOf = (cleared = []) => {
  const lines = CLEARED_ORDER.filter((key) => cleared.includes(key)).map(reenterLineOf)
  return lines.length ? `Saved. ${lines.join(' ')}` : 'Saved.'
}

export const reenterLineOf = (key) => `Enter the ${SECRET_NAMES[key]} again for the new address.`

export const rootFieldErrorOf = (err) => {
  const field = err?.data?.field
  return ROOT_FIELDS.includes(field) ? { field, text: err.message } : null
}

const SECRET_NAMES = {
  tvh_password: 'TVHeadend password',
  plex_token: 'Plex token',
  sonarr_api_key: 'Sonarr API key',
  radarr_api_key: 'Radarr API key',
}

const CLEARED_ORDER = Object.keys(SECRET_NAMES)

const ROOT_FIELDS = ['media_root', 'oneoff_root', 'movies_root', 'recordings_root', 'tvh_recordings_path']
