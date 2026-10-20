import { onUnmounted } from '/vendor/vue.esm-browser.prod.js'

export const LONG_PRESS_MS = 500
export const LONG_PRESS_SLOP_PX = 10

export const useLongPress = (onPress) => {
  let press = null
  let swallowing = false
  let lastPointerType = ''

  const clear = () => {
    clearTimeout(press?.timer)
    press = null
  }

  const stopSwallowing = () => {
    swallowing = false
    window.removeEventListener('click', swallowClick, true)
  }

  const startSwallowing = () => {
    swallowing = true
    window.addEventListener('click', swallowClick, true)
  }

  const onPointerDown = (event) => {
    lastPointerType = event.pointerType
    if (event.pointerType === 'mouse') return
    stopSwallowing()
    press = {
      x: event.clientX,
      y: event.clientY,
      timer: setTimeout(() => {
        press = null
        startSwallowing()
        onPress()
      }, LONG_PRESS_MS),
    }
  }

  const onPointerMove = (event) => {
    if (!press) return
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > LONG_PRESS_SLOP_PX) clear()
  }

  const onPointerEnd = () => {
    clear()
    if (swallowing) setTimeout(stopSwallowing, CLICK_AFTER_RELEASE_MS)
  }

  const onContextMenu = (event) => {
    event.preventDefault()
    if (lastPointerType !== 'touch' && lastPointerType !== 'pen') onPress()
  }

  onUnmounted(() => {
    clear()
    stopSwallowing()
  })

  return { onPointerDown, onPointerMove, onPointerEnd, onContextMenu }
}

const CLICK_AFTER_RELEASE_MS = 400

const swallowClick = (event) => {
  event.preventDefault()
  event.stopPropagation()
}
