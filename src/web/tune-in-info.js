export const TUNE_IN_EXIT_MS = 440
export const TUNE_IN_SLOW_MS = 15_000

export const startsTuneInInfo = ({ phase, channelId, confirmedChannelId, multiview }) =>
  phase === 'tuning' && !multiview && channelId !== confirmedChannelId

export const confirmedChannelAfter = ({ phase, channelId, confirmedChannelId }) => {
  if (phase === 'live') return channelId ?? null
  if (phase === 'ended' || phase === 'idle') return null
  return confirmedChannelId
}

export const tuneInExitWaitMs = ({ shownAtMs, nowMs, minimumMs }) =>
  Math.max(0, shownAtMs + minimumMs - nowMs)

export const isSlowTune = ({ phase, startedAtMs, nowMs }) =>
  phase === 'tuning' && nowMs - startedAtMs > TUNE_IN_SLOW_MS

export const canDismissTuneIn = ({ phase }) => phase === 'live'

export const showsTuneInBadge = ({ key, panelKey }) => Boolean(key) && key !== panelKey
