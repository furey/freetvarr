export const HIDE_SD_COPY = {
  simulcasts: {
    title: 'Hide SD simulcasts',
    meta: 'Hides an SD channel only when its HD twin is in the lineup (10 next to 10 HD, Nine next to 9HD). SD-only channels stay. A favourite is never hidden. Hide SD channels hides these too.',
  },
  channels: {
    title: 'Hide SD channels',
    meta: 'Shows only HD channels. SD-only channels (for example 7flix) are hidden too. Applies to the TV guide, search, and Live TV; a favourite is never hidden.',
  },
}

export const hideSdSwitchesOf = ({ hideSdSimulcasts = false, hideSdChannels = false } = {}) => ({
  simulcastsOn: Boolean(hideSdChannels || hideSdSimulcasts),
  simulcastsLocked: Boolean(hideSdChannels),
  channelsOn: Boolean(hideSdChannels),
})

export const hideSdBodyOf = ({ hideSdSimulcasts, hideSdChannels } = {}) => ({
  ...(hideSdSimulcasts == null ? {} : { hide_sd_simulcasts: Boolean(hideSdSimulcasts) }),
  ...(hideSdChannels == null ? {} : { hide_sd_channels: Boolean(hideSdChannels) }),
})

export const hideSdPrefsOf = (prefs = {}) => ({
  hideSdSimulcasts: Boolean(prefs.hideSdSimulcasts),
  hideSdChannels: Boolean(prefs.hideSdChannels),
})
