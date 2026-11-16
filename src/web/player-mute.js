export const PLAYER_MUTED_KEY = 'freetvarr.playerMuted'

export const loadPlayerMuted = (storage) => {
  try { return storage.getItem(PLAYER_MUTED_KEY) === '1' } catch { return false }
}

export const savePlayerMuted = (storage, muted) => {
  try { storage.setItem(PLAYER_MUTED_KEY, muted ? '1' : '0') } catch {}
}

export const muteButtonOf = ({ muted }) => (muted
  ? { label: 'Muted', audible: false, ariaLabel: 'Muted. Press to hear sound' }
  : { label: 'Sound', audible: true, ariaLabel: 'Sound on. Press to mute' })

export const soundToggleOf = ({ muted }) => (muted
  ? { muted: true, ariaLabel: 'Unmute', title: 'Unmute (M)' }
  : { muted: false, ariaLabel: 'Mute', title: 'Mute (M)' })

export const playerMenuItemsOf = ({ overflow = [], canMinimise, canPip, pipActive }) => [
  ...overflow,
  canMinimise && { key: 'minimise', label: 'Miniplayer', icon: 'minimise-icon' },
  canPip && {
    key: 'pip',
    label: pipActive ? 'Close pop out (picture in picture)' : 'Pop out (picture in picture)',
    icon: pipActive ? 'exit-pip-icon' : 'pop-out-icon',
  },
].filter(Boolean)

export const baseRowButtonsOf = ({ hasCaptions, captionsOn, infoOpen, fullscreen, noCaptionsTitle }) => ({
  captions: {
    disabled: !hasCaptions || Boolean(infoOpen),
    pressed: Boolean(hasCaptions && captionsOn && !infoOpen),
    title: captionsTitleOf({ hasCaptions, infoOpen, noCaptionsTitle }),
  },
  info: { expanded: Boolean(infoOpen), title: 'Programme info (I)' },
  fullscreen: fullscreen
    ? { ariaLabel: 'Exit full screen', title: 'Exit full screen (F)', icon: 'exit-fullscreen-icon' }
    : { ariaLabel: 'Full screen', title: 'Full screen (F)', icon: 'fullscreen-icon' },
})

const captionsTitleOf = ({ hasCaptions, infoOpen, noCaptionsTitle }) => {
  if (!hasCaptions) return noCaptionsTitle
  if (infoOpen) return CAPTIONS_HIDDEN_BY_INFO_TITLE
  return 'Captions (C)'
}

export const NO_CAPTIONS_ON_CHANNEL = 'No captions on this channel'
export const NO_CAPTIONS_ON_RECORDING = 'No captions on this recording'
export const CAPTIONS_HIDDEN_BY_INFO_TITLE = 'Captions hide while programme info is open'
