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
