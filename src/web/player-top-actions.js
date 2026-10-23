export const HEADING_MIN_SHARE = 0.45

export const EARLY_COMPACT = 1
export const LATE_COMPACT = 2

export const ROUND_WIDTH = 44
export const ICON_PILL_WIDTH = 40
export const LOGO_WIDTH = 40

export const LABELLED_PILL_WIDTHS = {
  info: 84,
  series: 102,
  multiview: 124,
  minimise: 122,
  airplay: 110,
  sound: 104,
  record: 120,
}

export const MENU_ORDER = ['info', 'series', 'multiview', 'minimise', 'airplay']

export const topBarActionsOf = ({ actions = [], canMinimise, infoOpen, infoId, prePlay }) => {
  if (prePlay) return []
  return [
    ...actions,
    canMinimise && {
      key: 'minimise', order: 2, priority: 3, icon: 'minimise-icon', label: 'Miniplayer', ariaLabel: 'Miniplayer',
      menuLabel: 'Miniplayer',
    },
    {
      key: 'info', order: 4, priority: 1, icon: 'info-icon', label: 'Info', ariaLabel: 'Programme info', menuLabel: 'Programme info',
      pressed: infoOpen, expanded: infoOpen, controls: infoId,
    },
  ].filter((action) => action && !action.hidden)
}

export const topBarLayoutOf = ({
  barWidth,
  gap,
  actionsGap,
  backWidth = ROUND_WIDTH,
  logoWidth = 0,
  pinned = [],
  optional = [],
}) => {
  const plans = layoutPlansOf({ optional, pinned, hasLogo: logoWidth > 0 })
  const headingMin = barWidth * HEADING_MIN_SHARE
  const roomOf = (plan) => headingRoomOf({ plan, barWidth, gap, actionsGap, backWidth, logoWidth, pinned })
  const chosen = plans.find((plan) => roomOf(plan) >= headingMin) ?? plans.at(-1)
  return {
    inline: chosen.inline.map((action) => action.key),
    overflow: optional.filter((action) => !chosen.inline.includes(action)).map((action) => action.key),
    compact: pinned.filter((action) => isCompactIn(action, chosen)).map((action) => action.key),
    showLogo: chosen.logo,
  }
}

export const optionalWidthOf = ({ key, round = false, labelled = false }) => {
  if (round) return ROUND_WIDTH
  return labelled ? LABELLED_PILL_WIDTHS[key] ?? ICON_PILL_WIDTH : ICON_PILL_WIDTH
}

export const menuOrderOf = (keys) =>
  [...keys].sort((a, b) => MENU_ORDER.indexOf(a) - MENU_ORDER.indexOf(b))

export const moreMenuKeysOf = ({ overflow = [] }) => menuOrderOf([...new Set(overflow)])

const layoutPlansOf = ({ optional, pinned, hasLogo }) => {
  const levels = [...new Set([0, ...pinned.filter(isCompactable).map((action) => action.compactAt)])].sort((a, b) => a - b)
  const earlyLevels = levels.filter((level) => level < LATE_COMPACT)
  const lateLevels = levels.filter((level) => level >= LATE_COMPACT)
  const dropping = optional.flatMap((_, index) => earlyLevels.map((level) => ({
    inline: optional.slice(0, optional.length - index),
    level,
    logo: hasLogo,
  })))
  const bare = earlyLevels.map((level) => ({ inline: [], level, logo: hasLogo }))
  const late = lateLevels.map((level) => ({ inline: [], level, logo: hasLogo }))
  const deepest = levels.at(-1)
  const logoless = hasLogo ? [{ inline: [], level: deepest, logo: false }] : []
  return [...dropping, ...bare, ...late, ...logoless]
}

const headingRoomOf = ({ plan, barWidth, gap, actionsGap, backWidth, logoWidth, pinned }) => {
  const widths = [
    ...plan.inline.map((action) => action.width),
    ...pinned.map((action) => (isCompactIn(action, plan) ? action.compactWidth : action.width)),
  ]
  const actionsWidth = widths.reduce((sum, width) => sum + width, 0) + actionsGap * Math.max(0, widths.length - 1)
  const leadWidth = backWidth + gap + (plan.logo ? logoWidth + gap : 0)
  const actionsLead = widths.length ? gap : 0
  return barWidth - leadWidth - actionsLead - actionsWidth
}

const isCompactable = (action) => Number.isFinite(action.compactWidth)

const isCompactIn = (action, plan) => isCompactable(action) && action.compactAt <= plan.level
