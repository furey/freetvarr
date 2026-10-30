export const UPDATE_APPEAR_DELAY_MS = 1_500
export const UPDATE_LATER_MS = 60 * 60_000
export const UPDATE_CARD_WIDTH = 400
export const UPDATE_RAIL_GAP = 32
export const UPDATE_PHONE_GAP = 8
export const UPDATE_MINI_CLEARANCE = 24

const RELEASES_URL = 'https://github.com/furey/freetvarr/releases/tag'

export const updateCardVisibleOf = ({ stale, ready, playerFull, later, playing, nowMs }) => {
  if (!stale || !ready || playerFull) return false
  if (!later) return true
  if (later.untilStopped) return !playing
  return nowMs >= later.untilMs
}

export const laterOf = ({ playing, nowMs }) => (playing
  ? { untilStopped: true }
  : { untilMs: nowMs + UPDATE_LATER_MS })

export const laterAfterPlaybackOf = ({ later, playing }) => (later?.untilStopped && !playing ? null : later)

export const shownVersionOf = ({ latestVersion, loadedVersion }) =>
  latestVersion && loadedVersion && latestVersion !== loadedVersion ? latestVersion : ''

export const releaseNotesUrlOf = (version) => `${RELEASES_URL}/${encodeURIComponent(version)}`

export const updateCardCopyOf = ({ playing, version }) => ({
  title: 'Freetvarr has been updated',
  version,
  releaseUrl: version ? releaseNotesUrlOf(version) : '',
  body: playing
    ? 'Reloading stops what\'s playing. Your recordings and settings stay as they are.'
    : 'Reload to start using it. Your recordings and settings stay as they are.',
  note: playing ? 'Choose Later and this comes back when you stop watching.' : '',
  reloadLabel: playing ? 'Reload now' : 'Reload',
})

export const updateCardBottomOf = ({ phone, viewportWidth, viewportHeight, railWidth, miniRect }) => {
  if (!miniRect) return null
  const aboveMini = viewportHeight - miniRect.top
  if (phone) return aboveMini + UPDATE_PHONE_GAP
  const cardRight = railWidth + UPDATE_RAIL_GAP + Math.min(UPDATE_CARD_WIDTH, viewportWidth)
  if (cardRight + UPDATE_MINI_CLEARANCE <= miniRect.left) return null
  return aboveMini + UPDATE_MINI_CLEARANCE
}
