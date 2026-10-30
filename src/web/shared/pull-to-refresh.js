import { shouldReloadOnPull } from '/stale-build.js'
import { loadedBuild, latestBuild, checkForNewBuild } from '/shared/api.js'
import { pollRecordingNow } from '/shared/recording-now.js'
import { refreshTick } from '/shared/store.js'
import { loadSyncStatus } from '/shared/sync-status.js'
import { wait, prefersReducedMotion } from '/shared/utils.js'
import { pullMoveOf, pullOffsetOf, pullProgressOf, isPullCommitted } from '/pull-gesture.js'

const PULL_HOLD_PX = 52
const PULL_TICKS = 8
const PULL_MIN_SPIN_MS = 600
const PULL_FADE_MS = 200
const PULL_SETTLE_MS = 350
const PULL_SPRING = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

const PULL_REFRESH_SPINNER = `<span class="pull-refresh-spinner">${
  Array.from({ length: PULL_TICKS }, (_, i) => `<i style="--i:${i}"></i>`).join('')
}</span>`

const isStandaloneApp = () =>
  window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches

const hasScrolledAncestor = (el) => {
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    if (node.scrollTop > 0) return true
  }
  return false
}

const pullBlocked = (e) => window.scrollY > 0
  || e.touches.length > 1
  || Boolean(e.target.closest?.('.ui-sheet-backdrop, .ui-search-backdrop, .epg-row.pinned .epg-rail-cell, .live-row.pinned .live-row-handle'))
  || hasScrolledAncestor(e.target)

const refreshInPlace = async () => {
  refreshTick.value += 1
  await Promise.all([loadSyncStatus(), pollRecordingNow(), wait(PULL_MIN_SPIN_MS)])
}

export const refreshFromPull = async () => {
  await checkForNewBuild()
  if (shouldReloadOnPull({ loaded: loadedBuild, latest: latestBuild.value })) return window.location.reload()
  await refreshInPlace()
}

export const installPullToRefresh = ({ onRefresh }) => {
  if (!isStandaloneApp()) return
  const page = document.getElementById('app')
  const indicator = document.createElement('div')
  indicator.className = 'pull-refresh'
  indicator.setAttribute('aria-hidden', 'true')
  indicator.innerHTML = PULL_REFRESH_SPINNER
  document.body.append(indicator)
  let start = null
  let claimed = false
  let committed = false
  let offset = 0
  let progress = 0
  let refreshing = false
  let frame = 0
  const settleTransition = () => (prefersReducedMotion()
    ? 'transform 150ms linear'
    : `transform ${PULL_SETTLE_MS}ms ${PULL_SPRING}`)
  const render = (animate) => {
    const transition = animate ? settleTransition() : 'none'
    page.style.transition = transition
    indicator.style.transition = transition
    page.style.transform = offset ? `translate3d(0, ${offset}px, 0)` : ''
    const bar = page.querySelector('.settings-save-bar')
    if (bar) {
      bar.style.transition = transition
      bar.style.transform = offset ? `translate3d(0, ${-offset}px, 0)` : ''
    }
    indicator.style.transform = `translate3d(-50%, ${offset / 2}px, 0)`
    indicator.style.setProperty('--pull-progress', progress)
    indicator.classList.toggle('pulling', progress > 0)
  }
  const place = (px, { animate = false, pullProgress = 0 } = {}) => {
    offset = px
    progress = pullProgress
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => render(animate))
  }
  const finish = async () => {
    indicator.classList.add('done')
    await wait(PULL_FADE_MS)
    place(0, { animate: true })
    await wait(PULL_SETTLE_MS)
    indicator.classList.remove('refreshing', 'done')
    document.body.classList.remove('pull-refreshing')
    refreshing = false
  }
  const commit = () => {
    committed = true
    indicator.classList.add('refreshing')
  }
  const runRefresh = async () => {
    refreshing = true
    document.body.classList.add('pull-refreshing')
    place(PULL_HOLD_PX, { animate: true })
    await onRefresh().catch(() => {})
    await finish()
  }
  const release = () => {
    start = null
    syncMoveListener()
    if (committed) {
      committed = false
      return runRefresh()
    }
    place(0, { animate: true })
  }
  window.addEventListener('touchstart', (e) => {
    if (refreshing || pullBlocked(e)) return
    const touch = e.touches[0]
    start = { x: touch.clientX, y: touch.clientY }
    claimed = false
    committed = false
  }, { passive: true })
  const onTouchMove = (e) => {
    if (!start) return
    if (e.touches.length > 1 || document.body.classList.contains('epg-drag-lock')) {
      committed = false
      indicator.classList.remove('refreshing')
      return release()
    }
    const touch = e.touches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    const move = pullMoveOf({ dx, dy, claimed, cancelable: e.cancelable })
    if (move === 'wait') return
    if (move === 'abandon') {
      start = null
      syncMoveListener()
      return
    }
    if (e.cancelable) e.preventDefault()
    if (move === 'hold') return
    claimed = true
    const pullOffset = pullOffsetOf(dy)
    place(pullOffset, { pullProgress: pullProgressOf(pullOffset) })
    if (!committed && isPullCommitted(pullOffset)) commit()
  }
  let moveListening = false
  const syncMoveListener = () => {
    const wanted = Boolean(start) || window.scrollY <= 0
    if (wanted === moveListening) return
    moveListening = wanted
    if (wanted) window.addEventListener('touchmove', onTouchMove, { passive: false })
    else window.removeEventListener('touchmove', onTouchMove, { passive: false })
  }
  syncMoveListener()
  window.addEventListener('scroll', syncMoveListener, { passive: true })
  window.addEventListener('touchend', (e) => {
    if (!start || e.touches.length > 0) return
    release()
  })
  window.addEventListener('touchcancel', () => {
    if (start) release()
  })
}
