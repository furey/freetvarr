export const scrollFade = {
  mounted: (el) => {
    const update = () => markHiddenEdges(el)
    const resize = new ResizeObserver(update)
    resize.observe(el)
    el.addEventListener('scroll', update, { passive: true })
    el.addEventListener('focusin', revealFocused)
    document.fonts?.ready.then(update)
    watchers.set(el, { update, resize })
    update()
  },
  updated: (el) => watchers.get(el)?.update(),
  unmounted: (el) => {
    const watcher = watchers.get(el)
    if (!watcher) return
    watcher.resize.disconnect()
    el.removeEventListener('scroll', watcher.update)
    el.removeEventListener('focusin', revealFocused)
    watchers.delete(el)
  },
}

export const hiddenEdgesOf = ({ scrollLeft, scrollWidth, clientWidth }) => ({
  start: scrollLeft > EDGE_SLACK_PX,
  end: scrollWidth - clientWidth - scrollLeft > EDGE_SLACK_PX,
})

const watchers = new WeakMap()

const markHiddenEdges = (el) => {
  const hidden = hiddenEdgesOf(el)
  el.classList.toggle('is-fade-start', hidden.start)
  el.classList.toggle('is-fade-end', hidden.end)
}

const revealFocused = (event) => {
  if (event.target === event.currentTarget) return
  event.target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

const EDGE_SLACK_PX = 1
