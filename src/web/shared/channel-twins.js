import { shallowRef } from '/vendor/vue.esm-browser.prod.js'
import { twinFormatsOf } from '/simulcast.js'
import { api } from '/shared/api.js'

export const twinFormats = shallowRef(new Map())

export const rememberLineup = (channels) => {
  lineupKnown = true
  twinFormats.value = twinFormatsOf(channels)
}

export const twinFormatOf = (channelId) =>
  (channelId == null ? null : twinFormats.value.get(String(channelId)) || null)

export const loadLineupOnce = () => {
  if (lineupKnown) return Promise.resolve()
  lineupLoad ||= api('GET', '/api/epg/now?all=1')
    .then((result) => { if (!lineupKnown && result?.entries) rememberLineup(result.entries.map((entry) => entry.channel)) })
    .catch(() => { lineupLoad = null })
  return lineupLoad
}

let lineupKnown = false
let lineupLoad = null
