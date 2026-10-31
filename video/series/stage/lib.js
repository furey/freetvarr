import { clamp, lerp, ramp, easeOut, easeInOut, easeOutBack, el, place, rise, footage, window01 } from './kit.js'
import { ICONS } from './icons.js'

export { clamp, lerp, ramp, easeOut, easeInOut, easeOutBack, el, place, rise, footage, window01, ICONS }

export const MINT = '#5ce1c6'
export const RED = '#ff4d4f'
export const RED_TEXT = '#ff8486'
export const DIM = '#8d9aa7'
export const TEXT2 = '#a9b4be'

export const kit = ({ clips, marks }) => {
  const mark = (clip, key, fallback = 0) => marks[clip]?.[key] ?? fallback

  const piecewise = (points) => (t) => {
    if (t <= points[0][0]) return points[0][1]
    for (let i = 1; i < points.length; i++) {
      const [t0, v0] = points[i - 1]
      const [t1, v1] = points[i]
      if (t <= t1) return v1 === null ? v0 + (t - t0) : lerp(v0, v1, (t - t0) / (t1 - t0))
    }
    const [tl, vl] = points[points.length - 1]
    return vl + (t - tl)
  }

  const chapterLabel = (root, text, { x = 120, y = 70 } = {}) => {
    const node = el(root, 'div', 'chapter', text, { left: `${x}px`, top: `${y}px` })
    return (t) => rise(node, t, 0.1, { dy: 16 })
  }

  const title = (root, text, { x = 120, y = 118, size = 76 } = {}) => {
    const node = el(root, 'div', 'headline', text, { position: 'absolute', left: `${x}px`, top: `${y}px`, fontSize: `${size}px` })
    return (t, start = 0.15) => rise(node, t, start, { dy: 30 })
  }

  const appWindow = (root, { x, y, w, url = 'freetvarr.lan', clip }) => {
    const h = Math.round(w / 1.6) + 44
    const win = el(root, 'div', 'window', '', { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` })
    el(win, 'div', 'window-bar', `<i></i><i></i><i></i><span>${url}</span>`)
    const img = el(win, 'img', '', '', { height: `${h - 44}px` })
    const bar = win.querySelector('span')
    return {
      win, img, h,
      setUrl: (u) => { if (bar.textContent !== u) bar.textContent = u },
      show: (seconds, c = clip) => footage(img, clips, c, seconds),
    }
  }

  const kicker = (root, { label, text, tone = '', x = 150, y = 880 }) => {
    const node = el(root, 'div', `kicker ${tone}`, `${label ? `<small>${label}</small>` : ''}${text}`, { left: `${x}px`, top: `${y}px` })
    return (t, start, end) => {
      const p = ramp(t, start, 0.55, easeOutBack)
      const out = end ? ramp(t, end - 0.35, 0.35, (q) => q) : 0
      place(node, { x: -30 * (1 - p), opacity: clamp(p) * (1 - out) })
    }
  }

  const glow = (root) => {
    const g = el(root, 'div', 'glow')
    return (t, total) => {
      const p = t / total
      g.style.setProperty('--gx', `${lerp(15, 35, p)}%`)
      g.style.setProperty('--gy', `${lerp(5, 20, p)}%`)
      g.style.setProperty('--hx', `${lerp(95, 75, p)}%`)
    }
  }

  const card = (root, html, style = {}) => el(root, 'div', 'card', html, { padding: '36px 44px', ...style })

  const factCard = (root, { label, value, tone = '', x, y, w, size = 56, icon = '' }) => {
    const colour = tone === 'red' ? RED_TEXT : tone === 'mint' ? MINT : DIM
    const border = tone === 'red' ? 'rgba(255,77,79,0.5)' : tone === 'mint' ? 'rgba(92,225,198,0.6)' : 'rgba(255,255,255,0.08)'
    const bg = tone === 'red' ? 'rgba(255,77,79,0.07)' : tone === 'mint' ? 'rgba(92,225,198,0.07)' : '#141c24'
    return card(root, `<div style="display:flex;gap:36px;align-items:center">${icon ? `<div style="color:${colour};flex:none">${icon}</div>` : ''}<div>
      ${label ? `<div style="font-size:27px;color:${colour};font-weight:700;letter-spacing:.06em;text-transform:uppercase">${label}</div>` : ''}
      <div style="font-size:${size}px;font-weight:800;margin-top:6px;line-height:1.15">${value}</div></div></div>`,
    { left: `${x}px`, top: `${y}px`, width: `${w}px`, borderColor: border, background: bg })
  }

  const terminal = (root, { x, y, w, h, title: name = 'Terminal', size = 30 }) => {
    const term = el(root, 'div', 'terminal', '', { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` })
    el(term, 'div', 'window-bar', `<i></i><i></i><i></i><b style="margin-left:18px;font-weight:600;color:#a9b4be">${name}</b>`, { background: '#10161d' })
    const pre = el(term, 'pre', '', '', { fontSize: `${size}px` })
    const set = ({ t, cmd, at, typeDur = 1.6, out = [], outAt, step = 0.3, prompt = '<span class="t-mint">$</span> ', prior = '' }) => {
      const typed = Math.floor(clamp((t - at) / typeDur) * cmd.length)
      const n = Math.max(0, Math.floor((t - (outAt ?? at + typeDur + 0.3)) / step) + 1)
      const shown = t >= (outAt ?? at + typeDur + 0.3) ? out.slice(0, n) : []
      const caret = typed < cmd.length || !shown.length ? '<span class="caret"></span>' : ''
      pre.innerHTML = `${prior}${prompt}${esc(cmd.slice(0, Math.max(0, typed)))}${caret}${shown.length ? `\n${shown.join('\n')}` : ''}`
    }
    return { term, pre, set }
  }

  const tree = (root, rows, { x, y, w, size = 30, gap = 44 }) => {
    const html = rows.map(([depth, kind, name, tone]) => `<div data-row style="padding-left:${depth * gap}px;white-space:nowrap;color:${tone || (kind === 'dir' ? TEXT2 : '#f2f5f7')}"><span style="color:${kind === 'dir' ? MINT : 'inherit'}">${kind === 'dir' ? ICONS.folder(size + 2) : ICONS.file(size + 2)}</span> ${name}</div>`).join('')
    const node = card(root, `<div class="mono" style="font-size:${size}px;line-height:1.8">${html}</div>`, { left: `${x}px`, top: `${y}px`, width: `${w}px` })
    node.querySelectorAll('svg').forEach((s) => { s.style.verticalAlign = '-6px' })
    return { node, rows: [...node.querySelectorAll('[data-row]')] }
  }

  const endCard = (root, { links, next }) => {
    const word = el(root, 'div', 'wordmark', '<span class="free">Free</span><span class="tv">tv</span><span class="arr">arr</span>', { position: 'absolute', left: '120px', top: '120px', fontSize: '130px' })
    const nodes = links.map(([k, v, mint], i) => el(root, 'div', 'card', `<div style="font-size:26px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${mint ? MINT : DIM}">${k}</div><div class="mono" style="font-size:44px;margin-top:10px">${v}</div>`, { left: '120px', top: `${330 + i * 180}px`, width: '1680px', padding: '30px 44px', borderColor: mint ? 'rgba(92,225,198,0.6)' : 'rgba(255,255,255,0.08)' }))
    const nextNode = next ? el(root, 'div', 'card', `<div style="font-size:26px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${MINT}">Next in this playlist</div><div style="font-size:50px;font-weight:800;margin-top:10px">${next}</div>`, { left: '120px', top: `${330 + links.length * 180 + 40}px`, width: '1680px', padding: '34px 44px', background: 'rgba(92,225,198,0.08)', borderColor: 'rgba(92,225,198,0.6)' }) : null
    return (t, start = 0.4) => {
      rise(word, t, 0, { dy: 30 })
      nodes.forEach((n, i) => rise(n, t, start + i * 0.6))
      if (nextNode) rise(nextNode, t, start + nodes.length * 0.6 + 0.4)
    }
  }

  const cueTimes = (scene) => scene.cues.map((c) => c.start)
  const cueEnd = (scene, i) => scene.cues[i].start + scene.cues[i].duration

  return { mark, piecewise, chapterLabel, title, appWindow, kicker, glow, card, factCard, terminal, tree, endCard, cueTimes, cueEnd }
}

export const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const fadeTail = (root, t, duration, len = 0.6) => {
  root.style.opacity = String(1 - ramp(t, duration - len, len, (q) => q))
}
