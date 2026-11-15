import { currentKeyboardInset } from './visible-viewport.js'

export const TYPE_AHEAD_SELECTOR = '[data-type-ahead]'
export const KEYBOARD_DISMISS_EVENT = 'keyboard-dismiss'
export const TOUCH_KEYBOARD_QUERY = '(hover: none) and (pointer: coarse)'
export const ON_SCREEN_KEYBOARD_MIN_PX = 80

export const installTypeAheadEnter = ({
  target = window,
  isTouch = touchKeyboardOf(window),
  keyboardInset = () => currentKeyboardInset(window),
} = {}) => {
  const onKeydown = (event) => {
    const field = event.target?.closest?.(TYPE_AHEAD_SELECTOR)
    if (!field) return
    const onlyCloses = enterOnlyClosesKeyboard({
      key: event.key,
      keyCode: event.keyCode,
      isComposing: event.isComposing,
      touch: isTouch(),
      keyboardInset: keyboardInset(),
    })
    if (!onlyCloses) return
    event.preventDefault()
    event.stopImmediatePropagation()
    field.dispatchEvent(new CustomEvent(KEYBOARD_DISMISS_EVENT))
    field.blur()
  }
  target.addEventListener('keydown', onKeydown, true)
  return () => target.removeEventListener('keydown', onKeydown, true)
}

export const enterOnlyClosesKeyboard = ({ key, keyCode = 13, isComposing = false, touch, keyboardInset }) => key === 'Enter'
  && !isComposing
  && keyCode !== IME_KEY_CODE
  && touch
  && keyboardInset >= ON_SCREEN_KEYBOARD_MIN_PX

export const touchKeyboardOf = (win) => () => Boolean(win.matchMedia?.(TOUCH_KEYBOARD_QUERY).matches)

const IME_KEY_CODE = 229
