export const MAX_PICTURES = 4

export const PICTURES = ['primary', 'secondary', 'third', 'fourth']

export const COMPANIONS = PICTURES.slice(1)

export const LAYOUTS = ['split', 'inset']

export const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

export const COMPACT_PICTURE_LIMIT = 2

export const SMALL_TILE_WIDTH = 420

export const initialMultiView = ({ layout = 'split', muted = false } = {}) => ({
  order: PICTURES.slice(0, 2),
  layout,
  audible: muted ? null : 'primary',
  insetCorner: 'bottom-right',
})

export const soundAfterTap = ({ audible, tapped }) => (audible === tapped ? null : tapped)

export const tapSound = (state, tapped) => ({ ...state, audible: soundAfterTap({ audible: state.audible, tapped }) })

export const soundButtonOf = ({ audible, picture, channelName = '', count = 2 }) => {
  const name = channelName ? ` for ${channelName}` : ''
  if (audible === picture) {
    return { label: 'Sound', audible: true, ariaLabel: `Sound on${name}. Tap to mute` }
  }
  const others = count > 2 ? 'the others' : 'the other'
  return { label: 'Muted', audible: false, ariaLabel: `Muted${name}. Tap to hear this picture and mute ${others}` }
}

export const isMutedIn = ({ audible, picture }) => audible !== picture

export const mainPictureOf = (state) => state.order[0]

export const otherPictureOf = (picture) => (picture === 'primary' ? 'secondary' : 'primary')

export const swapPictures = (state) => ({ ...state, order: [state.order[1], state.order[0], ...state.order.slice(2)] })

export const makeMain = (state, picture) => {
  const at = state.order.indexOf(picture)
  if (at <= 0) return state
  const order = [...state.order]
  order[at] = order[0]
  order[0] = picture
  return { ...state, order }
}

export const setLayout = (state, layout) => (LAYOUTS.includes(layout) ? { ...state, layout } : state)

export const nextPictureOf = (order) => COMPANIONS.find((id) => !order.includes(id)) ?? null

export const addPicture = (state) => {
  const picture = nextPictureOf(state.order)
  return picture ? { ...state, order: [...state.order, picture] } : state
}

export const soundAfterStop = ({ audible, stopped, order, ended = [] }) => {
  if (audible !== stopped) return audible
  return order.find((p) => p !== stopped && !ended.includes(p)) ?? null
}

export const removePicture = (state, picture) => {
  const order = state.order.filter((p) => p !== picture)
  return { ...state, order, audible: soundAfterStop({ audible: state.audible, stopped: picture, order }) }
}

export const promoteIntoPrimary = (state, companion) => {
  const order = state.order.filter((p) => p !== 'primary').map((p) => (p === companion ? 'primary' : p))
  return { ...state, order, audible: audibleAfterPromotion({ audible: state.audible, companion, order }) }
}

export const pictureLimitOf = ({ compact, streams }) => {
  const device = compact ? COMPACT_PICTURE_LIMIT : MAX_PICTURES
  const shared = streams?.max > 0 ? streams.max : MAX_PICTURES
  return Math.min(device, shared)
}

export const canAddPictureOf = ({ count, compact, streams }) => {
  if (count >= pictureLimitOf({ compact, streams })) return false
  return !(streams?.max > 0 && streams.inUse >= streams.max)
}

export const shownLayoutOf = ({ layout, portraitPhone, count = 2 }) => {
  if (count > 2) return layout === 'inset' ? 'strip' : 'grid'
  return portraitPhone ? 'stacked' : layout
}

export const slotOf = ({ state, picture, portraitPhone }) => {
  const isMain = mainPictureOf(state) === picture
  const layout = shownLayoutOf({ layout: state.layout, portraitPhone, count: state.order.length })
  if (layout === 'grid' || layout === 'strip') return 'tile'
  if (layout === 'stacked') return isMain ? 'top' : 'bottom'
  if (layout === 'split') return isMain ? 'left' : 'right'
  return isMain ? 'full' : 'inset'
}

export const slotCountOf = ({ count, canAdd }) => (count > 2 && canAdd ? Math.min(count + 1, MAX_PICTURES) : count)

export const tileBoxesOf = ({ layout, slots, area, gap = 12 }) => {
  if (layout === 'strip') return stripBoxesOf({ slots, area, gap })
  return gridBoxesOf({ slots, area, gap })
}

export const snapCorner = ({ centreX, centreY, width, height }) => {
  const vertical = centreY < height / 2 ? 'top' : 'bottom'
  const horizontal = centreX < width / 2 ? 'left' : 'right'
  return `${vertical}-${horizontal}`
}

export const insetBoxAt = ({ corner, frameWidth, frameHeight, insetWidth, margin, topReserve = 0, bottomReserve = 0 }) => {
  const width = Math.min(insetWidth, Math.max(0, frameWidth - margin * 2))
  const height = Math.round((width * 9) / 16)
  const [vertical, horizontal] = corner.split('-')
  const left = horizontal === 'left' ? margin : frameWidth - margin - width
  const top = vertical === 'top' ? margin + topReserve : frameHeight - margin - bottomReserve - height
  return { left, top, width, height }
}

export const clampInsetBox = ({ left, top, width, height, frameWidth, frameHeight }) => ({
  left: Math.max(0, Math.min(frameWidth - width, left)),
  top: Math.max(0, Math.min(frameHeight - height, top)),
  width,
  height,
})

export const watchingTitle = (count) => (count > 1 ? `Watching ${count} channels` : 'Watching 1 channel')

const gridBoxesOf = ({ slots, area, gap }) => {
  const width = Math.max(0, Math.min((area.width - gap) / 2, (((area.height - gap) / 2) * 16) / 9))
  const height = (width * 9) / 16
  const left = area.left + (area.width - (width * 2 + gap)) / 2
  const top = area.top + (area.height - (height * 2 + gap)) / 2
  return Array.from({ length: slots }, (_, i) => roundBox({
    left: left + (i % 2) * (width + gap),
    top: top + Math.floor(i / 2) * (height + gap),
    width,
    height,
  }))
}

const stripBoxesOf = ({ slots, area, gap }) => {
  const sideways = area.width >= area.height
  const layout = sideways ? stripRightOf({ area, gap }) : stripBelowOf({ area, gap })
  return Array.from({ length: slots }, (_, i) => roundBox(i === 0 ? layout.main : layout.strip(i - 1)))
}

const stripRightOf = ({ area, gap }) => {
  const fitWidth = ((area.width - gap + (32 * gap) / 27) * 3) / 4
  const mainWidth = Math.max(0, Math.min(fitWidth, (area.height * 16) / 9))
  const mainHeight = (mainWidth * 9) / 16
  const stripHeight = (mainHeight - gap * 2) / 3
  const stripWidth = (stripHeight * 16) / 9
  const left = area.left + (area.width - (mainWidth + gap + stripWidth)) / 2
  const top = area.top + (area.height - mainHeight) / 2
  return {
    main: { left, top, width: mainWidth, height: mainHeight },
    strip: (i) => ({ left: left + mainWidth + gap, top: top + i * (stripHeight + gap), width: stripWidth, height: stripHeight }),
  }
}

const stripBelowOf = ({ area, gap }) => {
  const fitWidth = ((area.height - gap + (3 * gap) / 8) * 4) / 3
  const mainWidth = Math.max(0, Math.min(area.width, fitWidth))
  const mainHeight = (mainWidth * 9) / 16
  const stripWidth = (mainWidth - gap * 2) / 3
  const stripHeight = (stripWidth * 9) / 16
  const left = area.left + (area.width - mainWidth) / 2
  const top = area.top + (area.height - (mainHeight + gap + stripHeight)) / 2
  return {
    main: { left, top, width: mainWidth, height: mainHeight },
    strip: (i) => ({ left: left + i * (stripWidth + gap), top: top + mainHeight + gap, width: stripWidth, height: stripHeight }),
  }
}

const audibleAfterPromotion = ({ audible, companion, order }) => {
  if (audible === companion) return 'primary'
  if (audible === 'primary') return order[0] ?? null
  return audible
}

const roundBox = ({ left, top, width, height }) => ({
  left: Math.round(left),
  top: Math.round(top),
  width: Math.round(width),
  height: Math.round(height),
})
