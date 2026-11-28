export const PLAYER_THEME_COLOR = '#000000'
export const BAR_TINT_CLASS = 'player-bar-tint'

export const themeColorOf = ({ playerOpen, appColor }) => (playerOpen ? PLAYER_THEME_COLOR : appColor)

export const syncThemeColor = (playerOpen, doc = document) => {
  const meta = doc.querySelector('meta[name="theme-color"]')
  if (!meta) return
  meta.dataset.appColor ??= meta.getAttribute('content')
  meta.setAttribute('content', themeColorOf({ playerOpen, appColor: meta.dataset.appColor }))
}

export const syncBarTint = (playerOpen, doc = document) => {
  doc.querySelector(`.${BAR_TINT_CLASS}`)?.remove()
  if (playerOpen) return doc.body.append(barTintOf(doc))
  reinsertInPlace(doc, doc.querySelector('.app-tabbar'))
}

const barTintOf = (doc) => {
  const tint = doc.createElement('div')
  tint.className = BAR_TINT_CLASS
  tint.setAttribute('aria-hidden', 'true')
  return tint
}

const reinsertInPlace = (doc, element) => {
  if (!element?.parentNode) return
  const focused = doc.activeElement
  element.parentNode.insertBefore(element, element.nextSibling)
  if (element.contains(focused)) focused.focus({ preventScroll: true })
}
