import { shallowRef } from '/vendor/vue.esm-browser.prod.js'
import { channelFormatsOf } from '/simulcast.js'
import { api } from '/shared/api.js'

export const twinFormats = shallowRef(new Map())

export const rememberLineup = ({ channels, hideSdSimulcasts, hideSdChannels }) => {
  lineupKnown = true
  twinFormats.value = channelFormatsOf({ channels, hideSdSimulcasts, hideSdChannels })
}

export const lineupOf = (result) => ({
  channels: (result.entries || []).map((entry) => entry.channel),
  hideSdSimulcasts: result.hideSdSimulcasts,
  hideSdChannels: result.hideSdChannels,
})

export const twinFormatOf = (channelId) =>
  (channelId == null ? null : twinFormats.value.get(String(channelId)) || null)

export const loadNowAll = () => {
  nowAllLoad ??= api('GET', '/api/epg/now?all=1')
    .then((result) => {
      if (result?.entries) rememberLineup(lineupOf(result))
      return result
    })
    .finally(() => { nowAllLoad = null })
  return nowAllLoad
}

export const loadLineupOnce = () => {
  if (lineupKnown) return Promise.resolve()
  return loadNowAll().then(() => {}, () => {})
}

let lineupKnown = false
let nowAllLoad = null
