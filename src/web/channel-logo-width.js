export const CHANNEL_LOGO_WIDTHS = [96, 192]

export const logoWidthOf = ({ cssPx, dpr, widths = CHANNEL_LOGO_WIDTHS }) =>
  widths.find((width) => width >= cssPx * (dpr || 1)) ?? widths.at(-1)
