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

export const airplayReachHintOf = (hostname) => {
  const host = String(hostname ?? '').toLowerCase().replace(/\.$/, '')
  if (isTailscaleHost(host)) return `${UNREACHABLE_TEXT} Use your home address, or add the TV to Tailscale.`
  if (isHomeNetworkHost(host)) return ''
  return `${UNREACHABLE_TEXT} Use your home address.`
}

const isTailscaleHost = (host) => host.endsWith(`.${TAILSCALE_SUFFIX}`) || isTailscaleIp(host)

const isTailscaleIp = (host) => {
  if (!IPV4.test(host)) return false
  const [first, second] = host.split('.').map(Number)
  return first === 100 && second >= 64 && second <= 127
}

const isHomeNetworkHost = (host) => !host
  || IPV4.test(host)
  || host.includes(':')
  || !host.includes('.')
  || HOME_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))

const isPlayingOnTv = (video) => Boolean(video?.webkitCurrentPlaybackTargetIsWireless)

const UNREACHABLE_TEXT = "If your TV shows an error, it can't reach this address."
const TAILSCALE_SUFFIX = 'ts.net'
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/
const HOME_SUFFIXES = ['localhost', 'local', 'lan', 'home', 'home.arpa', 'internal', 'localdomain', 'corp']
