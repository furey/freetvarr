export const PLAYER_THEME_COLOR = '#000000'

export const themeColorOf = ({ playerOpen, appColor }) => (playerOpen ? PLAYER_THEME_COLOR : appColor)

export const syncThemeColor = (playerOpen, doc = document) => {
  const meta = doc.querySelector('meta[name="theme-color"]')
  if (!meta) return
  meta.dataset.appColor ??= meta.getAttribute('content')
  meta.setAttribute('content', themeColorOf({ playerOpen, appColor: meta.dataset.appColor }))
}
