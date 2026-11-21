import { onScopeDispose, ref, watch } from '/vendor/vue.esm-browser.prod.js'
import { remainingHoldMs } from '/pending.js'

export const PLACEHOLDER_DELAY_MS = 300
export const PLACEHOLDER_MIN_MS = 800

export const usePlaceholderTiming = (isPending, { delayMs = PLACEHOLDER_DELAY_MS, minMs = PLACEHOLDER_MIN_MS } = {}) => {
  const showing = ref(false)
  const holding = ref(false)
  let shownAt = 0
  let cancelPaintWait = () => {}
  let delayTimer = null
  let holdTimer = null

  const show = () => {
    shownAt = Date.now()
    showing.value = true
    afterNextPaint(() => { if (showing.value && !holding.value) shownAt = Date.now() })
  }

  const cancelDelay = () => {
    cancelPaintWait()
    clearTimeout(delayTimer)
  }

  const finish = () => {
    showing.value = false
    holding.value = false
  }

  const update = (pending) => {
    cancelDelay()
    if (pending) {
      clearTimeout(holdTimer)
      holding.value = false
      if (!showing.value) cancelPaintWait = afterNextPaint(() => { delayTimer = setTimeout(show, delayMs) })
      return
    }
    if (!showing.value) return
    const holdMs = remainingHoldMs({ startedAt: shownAt, now: Date.now(), minMs })
    if (!holdMs) return finish()
    holding.value = true
    holdTimer = setTimeout(finish, holdMs)
  }

  watch(isPending, update, { immediate: true })
  onScopeDispose(() => {
    cancelDelay()
    clearTimeout(holdTimer)
  })

  return { showing, holding }
}

const afterNextPaint = (run) => {
  if (typeof requestAnimationFrame !== 'function') {
    run()
    return () => {}
  }
  let timer = null
  const frame = requestAnimationFrame(() => { timer = setTimeout(run, 0) })
  return () => {
    cancelAnimationFrame(frame)
    clearTimeout(timer)
  }
}
