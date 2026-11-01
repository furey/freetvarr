const watchWindowMs = 5000
const gapPx = 16
const interactionEvents = ['wheel', 'touchstart', 'keydown', 'mousedown']

let stopWatching = () => {}

export const realignHashAfterReflow = (hash) => {
  stopWatching()
  const content = document.querySelector('.VPContent')
  if (!hash || !content) return
  const observer = new ResizeObserver(() => realign(hash))
  const timer = setTimeout(() => stopWatching(), watchWindowMs)
  stopWatching = () => {
    observer.disconnect()
    clearTimeout(timer)
    interactionEvents.forEach((name) => window.removeEventListener(name, stopWatching))
  }
  interactionEvents.forEach((name) => window.addEventListener(name, stopWatching, { passive: true }))
  observer.observe(content)
}

const realign = (hash) => {
  const target = document.getElementById(decodeURIComponent(hash).slice(1))
  const ruler = document.querySelector('.ftv-bar-ruler')
  if (!target || !ruler) return
  const drift = target.getBoundingClientRect().top - ruler.getBoundingClientRect().bottom - gapPx
  if (Math.abs(drift) > 1) window.scrollBy(0, drift)
}
