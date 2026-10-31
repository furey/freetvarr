export const FPS = 30

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export const lerp = (a, b, p) => a + (b - a) * p
export const easeOut = (p) => 1 - (1 - p) ** 3
export const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2)
export const easeOutBack = (p) => {
  const c1 = 1.4
  const c3 = c1 + 1
  return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2
}

export const ramp = (t, start, dur = 0.6, ease = easeOut) => ease(clamp((t - start) / dur))
export const window01 = (t, start, end, fade = 0.45) =>
  Math.min(ramp(t, start, fade), 1 - ramp(t, end - fade, fade, (p) => p))

export const el = (parent, tag, cls = '', html = '', style = {}) => {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  if (html) node.innerHTML = html
  Object.assign(node.style, style)
  parent.appendChild(node)
  return node
}

export const place = (node, { x = 0, y = 0, scale = 1, opacity = 1, blur = 0 }) => {
  node.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
  node.style.opacity = String(opacity)
  node.style.filter = blur ? `blur(${blur}px)` : ''
  node.style.visibility = opacity <= 0.001 ? 'hidden' : 'visible'
}

export const rise = (node, t, start, { dy = 40, dur = 0.7, end = Infinity, fade = 0.45 } = {}) => {
  const p = ramp(t, start, dur)
  const out = end === Infinity ? 0 : ramp(t, end - fade, fade, (q) => q)
  place(node, { y: dy * (1 - p) - out * 10, opacity: p * (1 - out) })
  return p * (1 - out)
}

export const frameUrl = (clip, index) => `frames/${clip}/${String(index + 1).padStart(5, '0')}.jpg`

export const footage = (img, clips, clip, seconds) => {
  if (!clips[clip]) clip = 'live'
  const count = clips[clip]
  const index = Math.max(0, Math.min(count - 1, Math.floor(seconds * FPS)))
  const url = frameUrl(clip, index)
  if (img.dataset.src !== url) {
    img.dataset.src = url
    img.src = url
  }
}

export const segments = (t, list) => {
  for (const s of list) if (t >= s.at && t < s.until) return s
  return list[list.length - 1]
}

export const pendingImages = () => Promise.all([...document.images]
  .filter((img) => img.src && img.offsetParent !== null)
  .map((img) => (img.complete ? img.decode().catch(() => {}) : new Promise((r) => { img.onload = r; img.onerror = r }))))
