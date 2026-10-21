import { api } from '/shared/api.js'

export const loadChannelPrefs = () => api('GET', '/api/epg/channel-prefs')

export const saveChannelPrefs = async (body) => {
  const saved = await api('PUT', '/api/epg/channel-prefs', body)
  channelPrefsSavedAt = Date.now()
  return saved
}

export const channelPrefsChangedSince = (sinceMs) => channelPrefsSavedAt > sinceMs

let channelPrefsSavedAt = 0
