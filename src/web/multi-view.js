export const MAX_PICTURES = 2

export const PICTURES = ['primary', 'secondary']

export const LAYOUTS = ['split', 'inset']

export const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

export const initialMultiView = ({ layout = 'split', muted = false } = {}) => ({
  order: [...PICTURES],
  layout,
  audible: muted ? null : 'primary',
  insetCorner: 'bottom-right',
})

export const soundAfterTap = ({ audible, tapped }) => (audible === tapped ? null : tapped)

export const tapSound = (state, tapped) => ({ ...state, audible: soundAfterTap({ audible: state.audible, tapped }) })

export const soundButtonOf = ({ audible, picture, channelName = '' }) => {
  const name = channelName ? ` for ${channelName}` : ''
  if (audible === picture) {
    return { label: 'Sound', audible: true, ariaLabel: `Sound on${name}. Tap to mute` }
  }
  return { label: 'Muted', audible: false, ariaLabel: `Muted${name}. Tap to hear this picture and mute the other` }
}

export const isMutedIn = ({ audible, picture }) => audible !== picture

export const mainPictureOf = (state) => state.order[0]

export const otherPictureOf = (picture) => (picture === 'primary' ? 'secondary' : 'primary')

export const swapPictures = (state) => ({ ...state, order: [state.order[1], state.order[0]] })

export const makeMain = (state, picture) => (mainPictureOf(state) === picture ? state : swapPictures(state))

export const setLayout = (state, layout) => (LAYOUTS.includes(layout) ? { ...state, layout } : state)

export const shownLayoutOf = ({ layout, portraitPhone }) => (portraitPhone ? 'stacked' : layout)

export const slotOf = ({ state, picture, portraitPhone }) => {
  const isMain = mainPictureOf(state) === picture
  const layout = shownLayoutOf({ layout: state.layout, portraitPhone })
  if (layout === 'stacked') return isMain ? 'top' : 'bottom'
  if (layout === 'split') return isMain ? 'left' : 'right'
  return isMain ? 'full' : 'inset'
}

export const survivorAfterStop = (stopped) => otherPictureOf(stopped)

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
