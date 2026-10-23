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
  if (!video || video.disablePictureInPicture) return false
  if (hasWebkitPresentationMode(video)) return video.webkitSupportsPresentationMode('picture-in-picture')
  return Boolean(doc?.pictureInPictureEnabled) && typeof video.requestPictureInPicture === 'function'
}

export const isInPictureInPicture = ({ video, doc }) =>
  Boolean(video) && (doc?.pictureInPictureElement === video || video.webkitPresentationMode === 'picture-in-picture')

export const togglePictureInPicture = async ({ video, doc }) => {
  if (closePictureInPictureOf({ video, doc })) return false
  if (!pictureInPictureSupportOf({ video, doc })) return false
  if (hasWebkitPresentationMode(video)) {
    video.webkitSetPresentationMode('picture-in-picture')
    return true
  }
  await video.requestPictureInPicture()
  return true
}

export const closePictureInPictureOf = ({ video, doc }) => {
  if (!video) return false
  if (video.webkitPresentationMode === 'picture-in-picture' && typeof video.webkitSetPresentationMode === 'function') {
    video.webkitSetPresentationMode('inline')
    return true
  }
  if (doc?.pictureInPictureElement !== video) return false
  doc.exitPictureInPicture?.()?.catch?.(() => {})
  return true
}

const hasWebkitPresentationMode = (video) =>
  typeof video.webkitSupportsPresentationMode === 'function' && typeof video.webkitSetPresentationMode === 'function'

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
