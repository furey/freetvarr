import { api } from '/shared/api.js'

export const loadChannelPrefs = () => api('GET', '/api/epg/channel-prefs')

export const saveChannelPrefs = async (body) => {
  channelPrefsSaves += 1
  try {
    const saved = await api('PUT', '/api/epg/channel-prefs', body)
    channelPrefsSavedAt = Date.now()
    return saved
  } finally {
    channelPrefsSaves += 1
  }
}

export const channelPrefsSaveCount = () => channelPrefsSaves

export const channelPrefsChangedSince = (sinceMs) => channelPrefsSavedAt > sinceMs

let channelPrefsSavedAt = 0
let channelPrefsSaves = 0
