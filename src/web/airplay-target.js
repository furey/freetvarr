export const AVAILABILITY_EVENT = 'webkitplaybacktargetavailabilitychanged'
export const WIRELESS_EVENT = 'webkitcurrentplaybacktargetiswirelesschanged'

export const listenForAirplay = ({ video, state }) => {
  const syncTarget = () => { state.playingOnTv = isPlayingOnTv(video) }
  const syncAvailability = (event) => { state.airplay = event.availability === 'available' }
  const syncOpen = (open) => {
    if (open) return syncTarget()
    state.playingOnTv = false
  }
  const stop = () => {
    video?.removeEventListener(AVAILABILITY_EVENT, syncAvailability)
    video?.removeEventListener(WIRELESS_EVENT, syncTarget)
  }
  video?.addEventListener(AVAILABILITY_EVENT, syncAvailability)
  video?.addEventListener(WIRELESS_EVENT, syncTarget)
  syncTarget()
  return { syncOpen, stop }
}

const isPlayingOnTv = (video) => Boolean(video?.webkitCurrentPlaybackTargetIsWireless)
