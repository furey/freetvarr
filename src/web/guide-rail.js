export const GUIDE_RAIL_DEFAULT_PX = 200
export const GUIDE_RAIL_MIN_PX = 96
export const GUIDE_RAIL_MAX_PX = 320
export const GUIDE_RAIL_VIEWPORT_SHARE = 0.38
export const GUIDE_RAIL_COMPACT_BELOW_PX = 136
export const GUIDE_RAIL_ORDER_TEXT_MIN_PX = 179
export const GUIDE_RAIL_MIN_ORDER_PINS = 2

export const clampRailPx = (px) => Math.min(GUIDE_RAIL_MAX_PX, Math.max(GUIDE_RAIL_MIN_PX, px))

export const railShownPxOf = ({ railPx, viewportWidth }) =>
  Math.min(railPx, viewportWidth * GUIDE_RAIL_VIEWPORT_SHARE)

export const railLayoutOf = ({ shownPx, narrow }) => {
  const compact = shownPx < GUIDE_RAIL_COMPACT_BELOW_PX
  return {
    compact,
    filterPlaceholder: narrow || compact ? 'Filter' : 'Filter channels',
    orderControl: shownPx >= GUIDE_RAIL_ORDER_TEXT_MIN_PX ? 'text' : 'icon',
  }
}

export const canEditOrderOf = ({ narrow, filter, pinnedCount }) =>
  !narrow && !filter.trim() && pinnedCount >= GUIDE_RAIL_MIN_ORDER_PINS
