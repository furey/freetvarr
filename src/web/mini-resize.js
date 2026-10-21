import { SIZE_RULES, clampShare, insetGrowthOf, innerCornerOf, keyActionOf, percentOf } from './multi-resize.js'

export const MINI_SIZE_KEY = 'freetvarr.miniplayerSize'

export const MINI_CARD_QUERY = '(min-width: 768px) and (min-height: 501px)'

export const MINI_DOCK_CORNER = 'bottom-right'

export const MINI_GRIP_CORNER = innerCornerOf(MINI_DOCK_CORNER)

export const MINI_DEFAULT_WIDTH = 360

export const MINI_MIN_WIDTH = 240

export const MINI_RULE = SIZE_RULES.inset

export const miniShareOfWidth = ({ width, viewportWidth }) => width / Math.max(1, viewportWidth)

export const miniWidthOf = ({ share, viewportWidth }) => {
  if (share == null) return MINI_DEFAULT_WIDTH
  const clamped = clampShare({ rule: MINI_RULE, share })
  return Math.max(MINI_MIN_WIDTH, Math.round(clamped * viewportWidth))
}

export const miniWidthAfterDrag = ({ startWidth, dx, dy, viewportWidth }) => {
  const grown = startWidth + insetGrowthOf({ corner: MINI_DOCK_CORNER, dx, dy })
  return miniWidthOf({ share: miniShareOfWidth({ width: grown, viewportWidth }), viewportWidth })
}

export const miniShareAfterKey = ({ width, viewportWidth, key }) => {
  const share = miniShareOfWidth({ width, viewportWidth })
  return keyActionOf({ rule: MINI_RULE, share, key })
}

export const miniLabelOf = ({ width, viewportWidth }) =>
  `${percentOf(miniShareOfWidth({ width, viewportWidth }))}% wide`

export const parseMiniShare = (raw) => {
  const share = Number(raw)
  if (raw == null || raw === '' || !Number.isFinite(share)) return null
  return clampShare({ rule: MINI_RULE, share })
}

export const miniShareToStore = ({ share }) => (share == null ? null : String(Math.round(share * 1000) / 1000))
