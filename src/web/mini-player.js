import { showImageUrlOf } from './artwork-stamps.js'

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

export const ON_YOUR_TV_TEXT = 'On your TV'

export const liveMiniMetaOnTvOf = ({ channelName }) => miniMetaOf([channelName, ON_YOUR_TV_TEXT])

export const recordingMiniMetaOnTvOf = ({ leftText }) => miniMetaOf([ON_YOUR_TV_TEXT, leftText])

export const onTvArtUrlOf = ({ source = null, eventId = null, title = '', stamp = (url) => url }) => {
  if (source) return stamp(source)
  const base = onTvArtBaseOf({ eventId, title })
  if (!base) return null
  const stamped = stamp(base)
  return `${stamped}${stamped.includes('?') ? '&' : '?'}w=${ON_TV_ART_WIDTH}`
}

const onTvArtBaseOf = ({ eventId, title }) => {
  if (eventId != null) return `/api/epg/image/${encodeURIComponent(eventId)}`
  return title ? showImageUrlOf({ title }) : null
}

const ON_TV_ART_WIDTH = 384

export const miniBarMetaOf = ({ meta, onTvMeta, playingOnTv, phone }) => (phone && playingOnTv && onTvMeta ? onTvMeta : meta)

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

export const ONE_CAPTION_LINE_PERCENT = 8

export const captionLineOf = ({ mini, lifted, liftedLine, restingLine }) => {
  if (mini) return MINI_CAPTION_LINE
  return lifted ? liftedLine : restingLine
}

export const liftedCaptionLineOf = ({ frameHeight, footerTop, fallbackLine }) => {
  if (!(frameHeight > 0) || !(footerTop > 0) || footerTop > frameHeight) return fallbackLine
  return Math.min(fallbackLine, Math.floor((footerTop / frameHeight) * 100) - ONE_CAPTION_LINE_PERCENT)
}

export const miniControlsShownOf = ({ hovering, tapShown, paused, menuOpen, focusInside }) =>
  Boolean(hovering || tapShown || paused || menuOpen || focusInside)

export const miniPictureClickOf = ({ controlsShown }) => (controlsShown ? 'expand' : 'reveal')

export const isHoverPointer = (pointerType) => pointerType === 'mouse' || pointerType === 'pen'

export const MINI_CARD_BUTTON_EDGE = 8
export const MINI_CARD_BUTTON_STEP = 44
export const MINI_CARD_BUTTON_WIDTH = 40
export const MINI_BADGE_RIGHT_EDGE = 63
export const MINI_BADGE_CLEARANCE = 8

export const MINI_CAPTIONS_MIN_WIDTH = MINI_BADGE_RIGHT_EDGE + MINI_BADGE_CLEARANCE
  + MINI_CARD_BUTTON_EDGE + 3 * MINI_CARD_BUTTON_STEP + MINI_CARD_BUTTON_WIDTH

export const miniCaptionsOnCardOf = ({ cardWidth }) => cardWidth >= MINI_CAPTIONS_MIN_WIDTH

export const miniMetaWithSoundOf = ({ meta, muted, phone }) => (phone && muted ? miniMetaOf(['Muted', meta]) : meta)

export const miniMenuItemsOf = ({ phone, muted, captionsOnCard, hasCaptions, captionsOn, canPip, pipActive }) => [
  phone && { key: 'sound', label: 'Sound', value: muted ? 'Muted' : 'On', on: !muted },
  !phone && !captionsOnCard && hasCaptions && { key: 'captions', label: 'Captions', value: captionsOn ? 'On' : 'Off', on: captionsOn },
  canPip && {
    key: 'pip',
    label: pipActive ? 'Close pop out (picture in picture)' : 'Pop out (picture in picture)',
  },
  { key: 'close', label: 'Close player' },
].filter(Boolean)
