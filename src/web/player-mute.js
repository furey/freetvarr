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

export const playerMenuItemsOf = ({ overflow = [], hasCaptions, captionsOn, canPip, pipActive, fullscreen }) => [
  ...overflow,
  hasCaptions && { key: 'captions', label: 'Captions', icon: 'captions-icon', value: captionsOn ? 'On' : 'Off', on: Boolean(captionsOn) },
  canPip && {
    key: 'pip',
    label: pipActive ? 'Close pop out (picture in picture)' : 'Pop out (picture in picture)',
    icon: pipActive ? 'exit-pip-icon' : 'pop-out-icon',
  },
  { key: 'fullscreen', label: fullscreen ? 'Exit full screen' : 'Full screen', icon: fullscreen ? 'exit-fullscreen-icon' : 'fullscreen-icon' },
].filter(Boolean)
