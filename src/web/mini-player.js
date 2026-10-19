export const SWIPE_DOWN_MIN_PX = 80
export const SWIPE_MAX_MS = 700

export const isSwipeDown = ({ startX, startY, endX, endY, ms }) => {
  const dy = endY - startY
  const dx = Math.abs(endX - startX)
  return ms <= SWIPE_MAX_MS && dy >= SWIPE_DOWN_MIN_PX && dy > dx * 1.5
}

export const minutesLeftText = ({ endMs, nowMs }) => {
  if (endMs == null) return ''
  const minutes = Math.max(1, Math.ceil((endMs - nowMs) / 60_000))
  return `${minutes} min left`
}

export const miniMetaOf = (parts) => parts.filter(Boolean).join(' · ')

export const pictureInPictureSupportOf = ({ video, doc }) => {
  if (!video) return false
  if (doc?.pictureInPictureEnabled && typeof video.requestPictureInPicture === 'function'
    && !video.disablePictureInPicture) return true
  return typeof video.webkitSupportsPresentationMode === 'function'
    && video.webkitSupportsPresentationMode('picture-in-picture')
}

export const isInPictureInPicture = ({ video, doc }) =>
  Boolean(video) && (doc?.pictureInPictureElement === video || video.webkitPresentationMode === 'picture-in-picture')

export const togglePictureInPicture = async ({ video, doc }) => {
  if (!pictureInPictureSupportOf({ video, doc })) return false
  const inside = isInPictureInPicture({ video, doc })
  if (typeof video.requestPictureInPicture === 'function' && doc?.pictureInPictureEnabled) {
    if (inside) await doc.exitPictureInPicture()
    else await video.requestPictureInPicture()
    return !inside
  }
  video.webkitSetPresentationMode(inside ? 'inline' : 'picture-in-picture')
  return !inside
}

export const MINI_CAPTION_LINE = 90

export const captionLineOf = ({ mini, lifted, liftedLine, restingLine }) => {
  if (mini) return MINI_CAPTION_LINE
  return lifted ? liftedLine : restingLine
}

export const miniControlsShownOf = ({ hovering, tapShown, paused, menuOpen, focusInside }) =>
  Boolean(hovering || tapShown || paused || menuOpen || focusInside)

export const miniPictureClickOf = ({ controlsShown }) => (controlsShown ? 'expand' : 'reveal')

export const isHoverPointer = (pointerType) => pointerType === 'mouse' || pointerType === 'pen'

export const miniMenuItemsOf = ({ phone, hasCaptions, captionsOn, canPip, pipActive, muted }) => [
  phone && { key: 'sound', label: 'Sound', value: muted ? 'Muted' : 'On', on: !muted },
  { key: 'expand', label: 'Back to full player' },
  !phone && hasCaptions && { key: 'captions', label: 'Captions', value: captionsOn ? 'On' : 'Off', on: captionsOn },
  canPip && {
    key: 'pip',
    label: pipActive ? 'Close pop out (picture in picture)' : 'Pop out (picture in picture)',
  },
].filter(Boolean)
