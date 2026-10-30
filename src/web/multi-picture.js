import { behindLabelOf } from './player-labels.js'

export const keyPictureOf = ({ audible, order }) => audible ?? order[0]

export const pictureControlsAfter = ({ shownFor, picture, event }) => {
  if (event === 'point' || event === 'focus') return picture
  if (event === 'tap') return shownFor === picture ? null : picture
  if (event === 'leave') return shownFor === picture ? null : shownFor
  if (event === 'timeout') return null
  return shownFor
}

export const pictureBadgeOf = ({ paused, behindMinutes = 0 }) => {
  if (paused) return { kind: 'paused', text: 'Paused' }
  if (behindMinutes > 0) return { kind: 'behind', text: behindLabelOf(behindMinutes) }
  return { kind: 'live', text: 'Live' }
}

export const resumeLabelOf = ({ behindMinutes = 0 }) =>
  (behindMinutes > 0 ? `Paused · ${behindLabelOf(behindMinutes)}` : 'Paused')

export const pictureOverlayOf = ({ playing, controlsShown, paused }) => {
  const controls = playing && controlsShown
  return {
    controls,
    resume: playing && paused && !controls,
    badge: playing && !controls,
    dim: playing && paused,
  }
}

export const multiHintOf = ({ layout, hover }) => {
  const reveal = hover ? 'Point at a picture for its own controls.' : 'Tap a picture for its own controls.'
  const makeMain = hover ? 'double-click' : 'double-tap'
  if (layout === 'inset') {
    return `${reveal} Drag the small picture to any corner; ${makeMain} it to make it the big picture.`
  }
  if (layout === 'strip') return `${reveal} ${capitalise(makeMain)} a small picture to make it the big picture.`
  const others = layout === 'grid' ? 'the others mute' : 'the other mutes'
  return `${reveal} Tap Muted to hear a picture; ${others}. You hear the picture with the mint frame.`
}

export const pictureMenuOf = ({ count, isMain }) => {
  if (count <= 2) {
    return [{ key: 'full', label: 'Full screen' }, { key: 'change', label: 'Change channel' }, { key: 'stop', label: 'Stop watching' }]
  }
  return [
    ...(isMain ? [] : [{ key: 'main', label: 'Make main' }]),
    { key: 'change', label: 'Change channel' },
    { key: 'full', label: 'Full screen' },
    { key: 'stop', label: 'Remove' },
  ]
}

export const endedActionsOf = ({ multiActive, phase }) => (multiActive && phase === 'ended'
  ? [{ key: 'change', label: 'Pick a channel' }, { key: 'stop', label: 'Remove' }]
  : [])

const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1)
