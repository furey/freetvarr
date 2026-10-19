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

export const playerMenuItemsOf = ({ hasCaptions, captionsOn, canPip, pipActive, fullscreen }) => [
  hasCaptions && { key: 'captions', label: 'Captions', value: captionsOn ? 'On' : 'Off', on: Boolean(captionsOn) },
  canPip && {
    key: 'pip',
    label: pipActive ? 'Close pop out (picture in picture)' : 'Pop out (picture in picture)',
  },
  { key: 'fullscreen', label: fullscreen ? 'Exit full screen' : 'Full screen' },
].filter(Boolean)
