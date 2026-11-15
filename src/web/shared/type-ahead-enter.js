export const TYPE_AHEAD_SELECTOR = '[data-type-ahead]'
export const KEYBOARD_DISMISS_EVENT = 'keyboard-dismiss'
export const TOUCH_KEYBOARD_QUERY = '(hover: none) and (pointer: coarse)'

export const installTypeAheadEnter = ({ target = window, isTouch = touchKeyboardOf(window) } = {}) => {
  const onKeydown = (event) => {
    const field = event.target?.closest?.(TYPE_AHEAD_SELECTOR)
    if (!field || !enterOnlyClosesKeyboard({ key: event.key, isComposing: event.isComposing, touch: isTouch() })) return
    event.preventDefault()
    event.stopImmediatePropagation()
    field.dispatchEvent(new CustomEvent(KEYBOARD_DISMISS_EVENT))
    field.blur()
  }
  target.addEventListener('keydown', onKeydown, true)
  return () => target.removeEventListener('keydown', onKeydown, true)
}

export const enterOnlyClosesKeyboard = ({ key, isComposing = false, touch }) => key === 'Enter' && !isComposing && touch

export const touchKeyboardOf = (win) => () => Boolean(win.matchMedia?.(TOUCH_KEYBOARD_QUERY).matches)
