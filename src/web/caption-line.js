export const CAPTION_LINE_DEFAULT = 85
export const CAPTION_LINE_MIN = 20
export const CAPTION_PANEL_GAP_PERCENT = 3

export const captionLine = ({ panelHeight = 0, videoHeight = 0 } = {}) => {
  if (!(panelHeight > 0) || !(videoHeight > 0)) return CAPTION_LINE_DEFAULT
  const panelPercent = (panelHeight / videoHeight) * 100
  const line = 100 - panelPercent - CAPTION_PANEL_GAP_PERCENT
  return Math.round(Math.max(CAPTION_LINE_MIN, Math.min(CAPTION_LINE_DEFAULT, line)))
}
