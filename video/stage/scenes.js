import { clamp, lerp, ramp, easeOut, easeInOut, easeOutBack, el, place, rise, footage, window01 } from './kit.js'
import { ICONS } from './icons.js'

export const buildScenes = ({ clips, marks }) => {
  const mark = (clip, key, fallback = 0) => marks[clip]?.[key] ?? fallback
  const lengthOf = (clip) => clips[clip] / 30

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

  const appWindow = (root, { x, y, w, url = 'freetvarr.lan', clip }) => {
    const h = Math.round(w / 1.6) + 44
    const win = el(root, 'div', 'window', '', { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` })
    el(win, 'div', 'window-bar', `<i></i><i></i><i></i><span>${url}</span>`)
    const img = el(win, 'img', '', '', { height: `${h - 44}px` })
    const bar = win.querySelector('span')
    return {
      win, img,
      setUrl: (u) => { if (bar.textContent !== u) bar.textContent = u },
      show: (seconds, c = clip) => footage(img, clips, c, seconds),
    }
  }

  const kicker = (root, { label, text, tone = '', x, y }) => {
    const node = el(root, 'div', `kicker ${tone}`, `${label ? `<small>${label}</small>` : ''}${text}`, { left: `${x}px`, top: `${y}px` })
    return (t, start, end) => {
      const p = ramp(t, start, 0.55, easeOutBack)
      const out = end ? ramp(t, end - 0.35, 0.35, (q) => q) : 0
      place(node, { x: -30 * (1 - p), opacity: clamp(p) * (1 - out) })
    }
  }

  const cueTimes = (scene) => scene.cues.map((c) => c.start)
  const cueEnd = (scene, i) => scene.cues[i].start + scene.cues[i].duration

  const glow = (root) => {
    const g = el(root, 'div', 'glow')
    return (t, total) => {
      const p = t / total
      g.style.setProperty('--gx', `${lerp(15, 35, p)}%`)
      g.style.setProperty('--gy', `${lerp(5, 20, p)}%`)
      g.style.setProperty('--hx', `${lerp(95, 75, p)}%`)
    }
  }

  return {
    open: (root, scene) => {
      const bg = glow(root)
      const [c0, c1] = cueTimes(scene)
      const right = el(root, 'div', 'layer')
      const a = appWindow(right, { x: 820, y: 120, w: 1240, url: 'freetvarr.lan/#/guide', clip: 'guide' })
      const b = appWindow(right, { x: 980, y: 520, w: 1000, url: 'freetvarr.lan/#/home', clip: 'home' })
      const shade = el(root, 'div', 'layer', '', { background: 'linear-gradient(90deg, #0b1117 0%, #0b1117 38%, rgba(11,17,23,0.55) 62%, rgba(11,17,23,0) 100%)' })
      const h1 = el(root, 'div', 'headline', 'Leaving Fetch?', { position: 'absolute', left: '120px', top: '300px', fontSize: '120px' })
      const s1 = el(root, 'div', 'subline', 'Keep recording free-to-air TV.', { position: 'absolute', left: '124px', top: '470px', color: '#f2f5f7' })
      const s2 = el(root, 'div', 'subline', 'Keep watching it on your TV.', { position: 'absolute', left: '124px', top: '535px', color: '#f2f5f7' })
      const s3 = el(root, 'div', 'subline', '<span style="color:#5ce1c6">Hardware you own.</span><br>Nothing more to pay each month.', { position: 'absolute', left: '124px', top: '640px' })
      void shade
      return (t) => {
        bg(t, scene.duration)
        const drift = t / scene.duration
        place(a.win, { x: lerp(60, -20, drift), y: 0, opacity: ramp(t, 0.1, 0.8), scale: lerp(1.0, 1.03, drift) })
        place(b.win, { x: lerp(90, -10, drift), y: lerp(40, 0, ramp(t, 0.6, 1.2)), opacity: ramp(t, 0.6, 0.8) })
        a.show(mark('guide', 'start') + 0.5 + t * 0.9)
        b.show(1 + t)
        rise(h1, t, c0 - 0.1, { dy: 60 })
        rise(s1, t, c0 + 1.1)
        rise(s2, t, c0 + 2.9)
        rise(s3, t, c1)
        const out = ramp(t, scene.duration - 0.5, 0.5, (q) => q)
        root.style.opacity = String(1 - out)
      }
    },

    title: (root, scene) => {
      const bg = glow(root)
      const wrap = el(root, 'div', 'layer', '', { display: 'grid', placeItems: 'center' })
      const box = el(wrap, 'div', '', '', { position: 'relative', textAlign: 'center', marginTop: '-60px' })
      const word = el(box, 'div', 'wordmark', '<span class="free">Free</span><span class="tv">tv</span><span class="arr">arr</span>', { fontSize: '230px' })
      const parts = [...word.children]
      const chips = el(root, 'div', 'layer')
      const chipColours = ['#3ba4ff', '#f28c28', '#f5c542']
      const chipEls = chipColours.map((c) => el(chips, 'div', '', '', { position: 'absolute', background: c, borderRadius: '14px' }))
      const tag = el(box, 'div', 'subline', 'Record free-to-air TV and watch it on any screen.', { marginTop: '46px', color: '#f2f5f7', fontWeight: '600' })
      const note = el(box, 'div', 'subline', 'Free and open source. Runs on your own computer.', { marginTop: '18px', fontSize: '34px' })
      let rects = null
      return (t) => {
        bg(t, scene.duration)
        if (!rects) rects = parts.map((p) => p.getBoundingClientRect())
        const morph = ramp(t, 0.5, 1.1, easeInOut)
        chipEls.forEach((chip, i) => {
          const r = rects[i]
          const chipW = 120
          const chipH = 46
          const startX = 960 - 210 + i * 150
          const startY = 480
          const x = lerp(startX, r.left, morph)
          const y = lerp(startY, r.top + r.height * 0.32, morph)
          const w = lerp(chipW, r.width, morph)
          const h = lerp(chipH, r.height * 0.42, morph)
          Object.assign(chip.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` })
          chip.style.opacity = String(ramp(t, 0.05 + i * 0.08, 0.35) * (1 - ramp(t, 1.25, 0.4)))
        })
        parts.forEach((p, i) => {
          const q = ramp(t, 1.0 + i * 0.06, 0.6)
          place(p, { y: 30 * (1 - q), opacity: q })
        })
        rise(tag, t, 2.0)
        rise(note, t, 2.6)
        const out = ramp(t, scene.duration - 0.6, 0.6, (q) => q)
        root.style.opacity = String(1 - out)
      }
    },

    levy: (root, scene) => {
      const bg = glow(root)
      const label = chapterLabel(root, 'The Fetch levy')
      const [c0, c1, c2, c3] = cueTimes(scene)
      const a = el(root, 'div', 'layer')
      const ah = el(a, 'div', 'headline', 'Fetch Mini Gen&nbsp;3<br>and Mighty Gen&nbsp;3', { position: 'absolute', left: '120px', top: '220px' })
      const as = el(a, 'div', 'subline', 'With no Fetch subscription', { position: 'absolute', left: '124px', top: '440px' })
      const fact1 = el(a, 'div', 'card', `<div style="font-size:30px;color:#8d9aa7;font-weight:600">One-off levy</div><div style="font-size:96px;font-weight:800;margin-top:6px">$29.99</div><div style="font-size:30px;color:#a9b4be;margin-top:4px">per household</div>`, { left: '1120px', top: '230px', width: '640px', padding: '44px 52px' })
      const fact2 = el(a, 'div', 'card', `<div style="font-size:30px;color:#8d9aa7;font-weight:600">Keeps the box working until at least</div><div style="font-size:72px;font-weight:800;margin-top:10px">30 June 2028</div>`, { left: '1120px', top: '600px', width: '640px', padding: '44px 52px' })
      const b = el(root, 'div', 'layer', '', { display: 'grid', placeItems: 'center' })
      const cal = el(b, 'div', 'card', `
        <div style="background:#ff4d4f;color:#fff;font-size:44px;font-weight:800;letter-spacing:.12em;padding:22px 0;border-radius:24px 24px 0 0">OCTOBER</div>
        <div style="font-size:300px;font-weight:800;line-height:1;padding:30px 0 10px">31</div>
        <div style="font-size:40px;color:#a9b4be;padding-bottom:40px">2026</div>`, { position: 'relative', width: '560px', textAlign: 'center', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.14)' })
      const calNote = el(b, 'div', 'subline', 'Last day to opt in to the levy', { position: 'absolute', top: '930px', width: '100%', textAlign: 'center', color: '#f2f5f7' })
      const c = el(root, 'div', 'layer')
      const row = (top, k, v) => el(c, 'div', 'card', `<div style="display:flex;align-items:center;gap:40px"><div style="color:#ff8486">${ICONS.cross(84)}</div><div><div style="font-size:30px;color:#8d9aa7;font-weight:700;letter-spacing:.06em;text-transform:uppercase">${k}</div><div style="font-size:64px;font-weight:800;margin-top:6px">${v}</div></div></div>`, { left: '240px', top: `${top}px`, width: '1440px', padding: '44px 56px', borderColor: 'rgba(255,77,79,0.45)' })
      const r1 = row(300, 'In November, if you do nothing', 'Fetch suspends the box')
      const r2 = row(580, 'On a Mighty', 'The recordings are lost for good')
      const d = el(root, 'div', 'layer')
      const choice = (left, title, sub, mint) => el(d, 'div', 'card', `<div style="font-size:30px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${mint ? '#5ce1c6' : '#8d9aa7'}">${sub}</div><div style="font-size:76px;font-weight:800;margin-top:14px">${title}</div>`, { left: `${left}px`, top: '360px', width: '760px', padding: '64px 60px', borderColor: mint ? 'rgba(92,225,198,0.7)' : 'rgba(255,255,255,0.08)', background: mint ? 'rgba(92,225,198,0.10)' : '#141c24' })
      const d1 = choice(160, 'Pay the levy', 'One choice', false)
      const d2 = choice(1000, 'Own your setup', 'The other', true)
      return (t) => {
        bg(t, scene.duration)
        label(t)
        const showA = window01(t, c0 - 0.4, c1 - 0.1)
        a.style.opacity = String(showA)
        rise(ah, t, c0 - 0.3, { dy: 50 })
        rise(as, t, c0 + 2.6)
        rise(fact1, t, c0 + 5.2)
        rise(fact2, t, c0 + 6.2)
        b.style.opacity = String(window01(t, c1 - 0.1, c2 + 0.1))
        const pop = ramp(t, c1 - 0.1, 0.7, easeOutBack)
        place(cal, { scale: lerp(0.8, 1, pop), opacity: clamp(pop) })
        rise(calNote, t, c1 + 0.5)
        c.style.opacity = String(window01(t, c2 - 0.35, c3 + 0.1))
        rise(r1, t, c2 - 0.3)
        rise(r2, t, c2 + 3.6)
        d.style.opacity = String(window01(t, c3 - 0.35, scene.duration + 1))
        rise(d1, t, c3 - 0.3)
        rise(d2, t, c3 + 1.8)
        const glowOn = ramp(t, c3 + 2.0, 0.6)
        d2.style.transform += ` scale(${1 + 0.03 * glowOn})`
        d1.style.opacity = String(Number(d1.style.opacity) * (1 - 0.45 * glowOn))
      }
    },

    need: (root, scene) => {
      const bg = glow(root)
      const label = chapterLabel(root, 'What you need')
      const [c0, c1, c2, c3, c4] = cueTimes(scene)
      const nodes = [
        { icon: 'aerial', title: 'Aerial', sub: 'Your roof aerial', x: 120 },
        { icon: 'tuner', title: 'Network tuner', sub: 'e.g. HDHomeRun', x: 560, n: 1 },
        { icon: 'computer', title: 'A computer', sub: 'Always on: a NAS or a mini PC', x: 1000, n: 2 },
        { icon: 'tv', title: 'Your TV', sub: 'With a media player app', x: 1440, n: 3 },
      ]
      const lines = el(root, 'div', 'layer')
      const svg = el(lines, 'div', '', `<svg width="1920" height="1080"><g stroke="#5ce1c6" stroke-width="6" stroke-linecap="round" fill="none">
        <path id="l1" d="M480 470 H560"/><path id="l2" d="M920 470 H1000"/><path id="l3" d="M1360 470 H1440"/></g></svg>`)
      const paths = [...svg.querySelectorAll('path')]
      paths.forEach((p) => { p.style.strokeDasharray = '80'; p.style.strokeDashoffset = '80' })
      const cards = nodes.map((n) => el(root, 'div', 'card', `
        ${n.n ? `<div style="position:absolute;top:24px;right:28px;width:52px;height:52px;border-radius:50%;background:#26323e;display:grid;place-items:center;font-size:28px;font-weight:800">${n.n}</div>` : ''}
        <div class="ic" style="color:#a9b4be;margin-top:10px">${ICONS[n.icon](150)}</div>
        <div style="font-size:40px;font-weight:800;margin-top:22px">${n.title}</div>
        <div style="font-size:28px;color:#a9b4be;margin-top:10px">${n.sub}</div>`, { left: `${n.x}px`, top: '300px', width: '360px', height: '380px', padding: '40px 30px', textAlign: 'center' }))
      const stack = el(root, 'div', 'card', `
        <div style="font-size:26px;color:#8d9aa7;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-bottom:22px">On that computer</div>
        <div style="display:flex;gap:22px;justify-content:center">
          <div style="padding:22px 34px;border-radius:16px;background:#1c2630;font-size:40px;font-weight:700">TVHeadend<div style="font-size:24px;color:#a9b4be;font-weight:500;margin-top:6px">Records from the tuner</div></div>
          <div style="padding:22px 34px;border-radius:16px;background:rgba(92,225,198,0.12);border:2px solid rgba(92,225,198,0.6)"><span class="wordmark" style="font-size:44px"><span class="free">Free</span><span class="tv">tv</span><span class="arr">arr</span></span><div style="font-size:24px;color:#a9b4be;font-weight:500;margin-top:8px">Guide, library, and player</div></div>
        </div>`, { left: '560px', top: '730px', width: '1240px', padding: '36px 40px', textAlign: 'center' })
      const cueFor = [c0, c1, c2, c3]
      return (t) => {
        bg(t, scene.duration)
        label(t)
        cards.forEach((card, i) => {
          const start = c0 - 0.2 + i * 0.3
          const p = ramp(t, start, 0.6)
          const active = i === 0 ? t >= c1 && t < c2 : i === 1 ? t >= c1 && t < c2 : i === 2 ? t >= c2 && t < c3 || t >= c4 : t >= c3 && t < c4
          const lit = active ? 1 : 0
          card.style.borderColor = lit ? 'rgba(92,225,198,0.75)' : 'rgba(255,255,255,0.08)'
          card.style.background = lit ? 'rgba(92,225,198,0.08)' : '#141c24'
          card.querySelector('.ic').style.color = lit ? '#5ce1c6' : '#a9b4be'
          place(card, { y: 40 * (1 - p), opacity: p })
          void cueFor
        })
        paths[0].style.strokeDashoffset = String(80 * (1 - ramp(t, c1 + 3.4, 0.8)))
        paths[1].style.strokeDashoffset = String(80 * (1 - ramp(t, c2 + 0.5, 0.8)))
        paths[2].style.strokeDashoffset = String(80 * (1 - ramp(t, c3 + 0.3, 0.8)))
        const lift = ramp(t, c4 - 0.1, 0.8)
        cards.forEach((card) => { card.style.top = `${300 - 120 * lift}px` })
        svg.style.transform = `translateY(${-120 * lift}px)`
        rise(stack, t, c4 + 0.2, { dy: 50 })
      }
    },

    setup: (root, scene) => {
      const bg = glow(root)
      const label = chapterLabel(root, 'Install and setup', { x: 272, y: 52 })
      const [c0, c1, c2, c3, c4] = cueTimes(scene)
      const term = el(root, 'div', 'terminal', '', { left: '272px', top: '130px', width: '1376px', height: '860px' })
      const pre = el(term, 'pre')
      const cmd = 'curl -fsSL https://raw.githubusercontent.com/furey/freetvarr/main/install.sh | sh'
      const out = [
        '<span class="t-dim">[install] downloaded docker-compose.yml</span>',
        '<span class="t-dim">[install] wrote .env</span>',
        '<span class="t-dim">[install] starting Freetvarr and TVHeadend…</span>',
        '',
        'Open <span class="t-mint">http://192.168.1.20:3733</span> to run setup.',
      ]
      const app = appWindow(root, { x: 272, y: 130, w: 1376, url: 'freetvarr.lan:3733', clip: 'wizard' })
      const k = [
        kicker(root, { label: 'Step 1', text: 'Finds TVHeadend and locks it', tone: 'is-mint', x: 150, y: 860 }),
        kicker(root, { label: 'Step 2', text: 'Scans for channels and loads the guide', tone: 'is-mint', x: 150, y: 860 }),
        kicker(root, { label: 'Step 3', text: 'Check what it found, then Next', tone: 'is-mint', x: 150, y: 860 }),
      ]
      const wz = (key, d = 0) => mark('wizard', key, d)
      const map = piecewise([
        [c1 - 0.3, wz('welcome')],
        [c2 - 0.35, wz('welcome') + (c2 - 0.05 - c1)],
        [c2 - 0.34, wz('secure') - 0.3],
        [c3 - 0.35, wz('secured') + 0.4],
        [c3 - 0.34, wz('scan') - 0.2],
        [c3 + 1.3, wz('scanned')],
        [c3 + 1.31, wz('guide') - 0.3],
        [c3 + 2.5, wz('guide') + 1.6],
        [c3 + 2.51, wz('guided') - 1.4],
        [c4 - 0.35, wz('guided') + 0.2],
        [c4 - 0.34, wz('folders') - 0.4],
        [scene.duration, wz('folders') - 0.4 + (scene.duration - c4 + 0.34)],
      ])
      return (t) => {
        bg(t, scene.duration)
        label(t)
        const typed = Math.floor(clamp((t - c0 - 0.2) / 1.6) * cmd.length)
        const outLines = out.slice(0, Math.max(0, Math.floor((t - c0 - 2.0) / 0.25)))
        pre.innerHTML = `<span class="t-mint">$</span> ${cmd.slice(0, typed)}${typed < cmd.length || !outLines.length ? '<span class="caret"></span>' : ''}\n${outLines.join('\n')}`
        const termOn = window01(t, c0 - 0.4, c1 - 0.1)
        place(term, { opacity: termOn, scale: lerp(0.97, 1, ramp(t, c0 - 0.4, 0.6)) })
        const appOn = ramp(t, c1 - 0.3, 0.5)
        place(app.win, { opacity: appOn, scale: lerp(0.97, 1, appOn) })
        if (t >= c1 - 0.4) app.show(map(t))
        k[0](t, c2 - 0.2, c3 - 0.3)
        k[1](t, c3 - 0.2, c4 - 0.3)
        k[2](t, c4 - 0.2, scene.duration)
      }
    },

    guide: (root, scene) => {
      const bg = glow(root)
      const label = chapterLabel(root, 'TV guide and recording', { x: 272, y: 52 })
      const [c0, c1, c2, c3, c4] = cueTimes(scene)
      const app = appWindow(root, { x: 272, y: 130, w: 1376, url: 'freetvarr.lan/#/guide', clip: 'guide' })
      const k = [
        kicker(root, { label: 'TV guide', text: 'The week ahead, with pictures', x: 150, y: 860 }),
        kicker(root, { label: 'Record', text: 'One episode, or the whole series', tone: 'is-red', x: 150, y: 860 }),
        kicker(root, { label: 'Series', text: 'Every new episode records by itself', tone: 'is-mint', x: 150, y: 860 }),
        kicker(root, { label: 'Optional', text: 'Ads taken out of recordings', tone: 'is-mint', x: 150, y: 860 }),
      ]
      const g = (key) => mark('guide', key)
      const map = piecewise([
        [0, g('start')],
        [c1 + 0.5, g('sheet') + 0.4],
        [c2 + 0.4, g('every') + 0.3],
        [c3 + 0.2, g('series-click') + 0.3],
        [scene.duration, g('series-click') + 0.3 + (scene.duration - c3 - 0.2)],
      ])
      return (t) => {
        bg(t, scene.duration)
        label(t)
        place(app.win, { opacity: ramp(t, 0, 0.5), scale: lerp(0.97, 1, ramp(t, 0, 0.6)) })
        app.show(map(t))
        k[0](t, c0, c1 - 0.2)
        k[1](t, c2, c3 - 0.2)
        k[2](t, c3, c4 - 0.2)
        k[3](t, c4, scene.duration)
      }
    },

    home: (root, scene) => {
      const bg = glow(root)
      const label = chapterLabel(root, 'Home and suggestions', { x: 272, y: 52 })
      const [c0, c1, c2] = cueTimes(scene)
      const app = appWindow(root, { x: 272, y: 130, w: 1376, url: 'freetvarr.lan/#/home', clip: 'home' })
      const k = [
        kicker(root, { label: 'Home', text: 'Carry on where you left off', x: 150, y: 860 }),
        kicker(root, { label: 'Rows', text: 'New recordings, on now, tonight', x: 150, y: 860 }),
        kicker(root, { label: 'For you', text: 'Suggestions, made on your computer', tone: 'is-mint', x: 150, y: 860 }),
      ]
      const h = (key) => mark('home', key)
      const map = piecewise([[0, h('start')], [scene.duration, h('start') + scene.duration]])
      return (t) => {
        bg(t, scene.duration)
        label(t)
        place(app.win, { opacity: ramp(t, 0, 0.5), scale: lerp(0.97, 1, ramp(t, 0, 0.6)) })
        app.show(map(t))
        k[0](t, c0, c1 - 0.2)
        k[1](t, c1, c2 - 0.2)
        k[2](t, c2, scene.duration)
      }
    },

    library: (root, scene) => {
      const bg = glow(root)
      const label = chapterLabel(root, 'Recordings and Plex', { x: 272, y: 52 })
      const [c0, c1, c2] = cueTimes(scene)
      const app = appWindow(root, { x: 272, y: 130, w: 1376, url: 'freetvarr.lan/#/recordings', clip: 'library' })
      const tree = el(root, 'div', 'card', `
        <div class="mono" style="font-size:27px;line-height:1.75;color:#a9b4be">
          <div><span style="color:#5ce1c6">${ICONS.folder(30)}</span> tv</div>
          <div style="padding-left:40px"><span style="color:#5ce1c6">${ICONS.folder(30)}</span> Big Wave Season</div>
          <div style="padding-left:80px"><span style="color:#5ce1c6">${ICONS.folder(30)}</span> Season 03</div>
          <div style="padding-left:120px;color:#f2f5f7">${ICONS.file(30)} Big Wave Season - S03E01.ts</div>
          <div style="padding-left:120px;color:#f2f5f7">${ICONS.file(30)} Big Wave Season - S03E02.ts</div>
          <div style="padding-left:120px;color:#f2f5f7">${ICONS.file(30)} Big Wave Season - S03E03.ts</div>
        </div>`, { left: '1000px', top: '470px', width: '820px', padding: '34px 40px', background: 'rgba(20,28,36,0.97)', border: '2px solid rgba(255,255,255,0.14)' })
      tree.querySelectorAll('svg').forEach((s) => { s.style.verticalAlign = '-6px' })
      const k = [
        kicker(root, { label: 'Library', text: 'A folder for each show and season', x: 150, y: 860 }),
        kicker(root, { label: 'Show pages', text: 'Every episode, ready to play', x: 150, y: 860 }),
        kicker(root, { label: 'Plex', text: 'New episodes show up straight away', tone: 'is-mint', x: 150, y: 860 }),
      ]
      const l = (key) => mark('library', key)
      const map = piecewise([[0, l('start')], [c1 - 0.45, l('show') - 0.1], [c1 - 0.44, l('show') + 1.2], [scene.duration, l('show') + 1.2 + (scene.duration - c1 + 0.44)]])
      return (t) => {
        bg(t, scene.duration)
        label(t)
        place(app.win, { opacity: ramp(t, 0, 0.5), scale: lerp(0.97, 1, ramp(t, 0, 0.6)) })
        app.show(map(t))
        const tp = ramp(t, c0 + 1.2, 0.6, easeOutBack)
        const tout = ramp(t, c1 - 0.5, 0.4, (q) => q)
        place(tree, { y: 40 * (1 - clamp(tp)), opacity: clamp(tp) * (1 - tout) })
        k[0](t, c0, c1 - 0.2)
        k[1](t, c1, c2 - 0.2)
        k[2](t, c2, scene.duration)
      }
    },

    tv: (root, scene) => {
      const bg = glow(root)
      const label = chapterLabel(root, 'Watching on the TV')
      const [c0, c1, c2, c3] = cueTimes(scene)
      const tvLayer = el(root, 'div', 'layer')
      const tv = el(tvLayer, 'div', '', '', { position: 'absolute', left: '360px', top: '150px', width: '1200px', height: '675px', borderRadius: '18px', background: '#000', border: '14px solid #1c2630', overflow: 'hidden' })
      el(tvLayer, 'div', '', '', { position: 'absolute', left: '900px', top: '839px', width: '120px', height: '50px', background: '#1c2630' })
      el(tvLayer, 'div', '', '', { position: 'absolute', left: '760px', top: '886px', width: '400px', height: '14px', borderRadius: '7px', background: '#26323e' })
      const lib = el(tv, 'div', 'layer', '', { background: '#10161d', padding: '44px 50px' })
      el(lib, 'div', '', 'TV shows', { fontSize: '40px', fontWeight: '800', marginBottom: '26px' })
      const posters = [
        ['Big Wave Season', 'hd/surf-a.jpg'], ['Kitchen Heat', 'hd/1666.jpg'], ['Wild Neighbours', 'hd/4276.jpg'],
        ['Mountain Rangers', 'hd/4115.jpg'], ['Road Trip Rules', 'hd/4368.jpg'], ['The Weekend Garden', 'hd/1891.jpg'],
      ]
      const grid = el(lib, 'div', '', '', { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '22px 24px' })
      const tiles = posters.map(([title, src]) => {
        const tile = el(grid, 'div', '', `<img src="media/${src}" style="display:block;width:100%;height:170px;border-radius:12px;object-fit:cover"><div style="font-size:24px;font-weight:700;margin-top:10px">${title}</div>`)
        return tile
      })
      const play = el(tv, 'div', 'layer', '', { background: '#000' })
      const playImg = el(play, 'img', '', '', { width: '100%', height: '100%', objectFit: 'cover' })
      const controls = el(play, 'div', '', '', { position: 'absolute', left: '0', right: '0', bottom: '0', height: '190px', background: 'linear-gradient(transparent, rgba(0,0,0,0.85))' })
      el(controls, 'div', '', 'Big Wave Season · S3 E1', { position: 'absolute', left: '44px', bottom: '118px', fontSize: '30px', fontWeight: '700' })
      const track = el(controls, 'div', '', '', { position: 'absolute', left: '44px', right: '44px', bottom: '96px', height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.25)' })
      const fill = el(track, 'div', '', '', { height: '100%', borderRadius: '4px', background: '#f2f5f7', width: '30%' })
      const btns = el(controls, 'div', '', '', { position: 'absolute', left: '0', right: '0', bottom: '18px', display: 'flex', justifyContent: 'center', gap: '60px', color: '#f2f5f7' })
      const bBack = el(btns, 'div', '', ICONS.back(64))
      const bPause = el(btns, 'div', '', ICONS.pause(64))
      const bFwd = el(btns, 'div', '', ICONS.forward(64))
      const tvCaption = el(tvLayer, 'div', 'subline', 'Your media player app (e.g. Plex or Infuse)', { position: 'absolute', top: '940px', width: '100%', textAlign: 'center', color: '#f2f5f7' })
      const devices = el(root, 'div', 'layer')
      const laptop = appWindow(devices, { x: 120, y: 170, w: 1180, url: 'freetvarr.lan/#/live', clip: 'live' })
      const phone = el(devices, 'div', '', '', { position: 'absolute', left: '1400px', top: '150px', width: '400px', height: '820px', borderRadius: '56px', border: '14px solid #26323e', background: '#000', overflow: 'hidden' })
      const phoneImg = el(phone, 'img', '', '', { width: '100%', height: '100%', objectFit: 'cover' })
      const k2 = kicker(devices, { label: 'In the browser', text: 'Live TV and recordings', tone: 'is-mint', x: 150, y: 880 })
      const k3 = kicker(devices, { label: 'Multiview', text: 'Two channels at once', tone: 'is-mint', x: 150, y: 880 })
      const press = (node, at) => {
        const p = clamp((t0 - at) / 0.4)
        node.style.transform = `scale(${p > 0 && p < 1 ? 1 + 0.25 * Math.sin(p * Math.PI) : 1})`
        node.style.color = p > 0 && p < 1 ? '#5ce1c6' : '#f2f5f7'
      }
      let t0 = 0
      return (t) => {
        t0 = t
        bg(t, scene.duration)
        label(t)
        const tvOn = window01(t, 0, c2 - 0.1)
        tvLayer.style.opacity = String(tvOn)
        tiles.forEach((tile, i) => rise(tile, t, 0.3 + i * 0.12, { dy: 24 }))
        const focus = ramp(t, c1 - 0.6, 0.3)
        tiles[0].firstChild.style.outline = focus > 0 ? '5px solid #f2f5f7' : ''
        const opened = ramp(t, c1 - 0.1, 0.5)
        place(play, { opacity: opened, scale: lerp(0.9, 1, opened) })
        const local = t - c1
        let clipT = local
        if (local > 1.4) clipT -= Math.min(local - 1.4, 0.0)
        footage(playImg, clips, 'surf', Math.max(0, local > 2.2 && local < 2.6 ? 2.2 : local > 2.6 ? local - 0.4 : local))
        void clipT
        fill.style.width = `${30 + Math.max(0, local) * 0.6 - (local > 1.2 ? 3 : 0) + (local > 2.8 ? 8 : 0)}%`
        press(bBack, c1 + 1.0)
        press(bPause, c1 + 2.0)
        bPause.innerHTML = local > 2.2 && local < 2.6 ? ICONS.play(64) : ICONS.pause(64)
        press(bFwd, c1 + 2.8)
        rise(tvCaption, t, c0 + 0.6)
        devices.style.opacity = String(ramp(t, c2 - 0.1, 0.5))
        place(laptop.win, { opacity: ramp(t, c2 - 0.1, 0.5), y: 30 * (1 - ramp(t, c2 - 0.1, 0.6)) })
        const liveT = t < c3 - 0.2 ? mark('live', 'playing') + 1.0 + (t - c2) : mark('multi', 'start', 0) + 4 + (t - c3)
        laptop.show(liveT, t < c3 - 0.2 ? 'live' : 'multi')
        rise(phone, t, c2 + 0.6, { dy: 60 })
        footage(phoneImg, clips, 'phone', mark('phone', 'tune') + 8.5 + Math.max(0, t - c2))
        k2(t, c2 + 0.3, c3 - 0.2)
        k3(t, c3, scene.duration)
      }
    },

    fetchtv: (root, scene) => {
      const bg = glow(root)
      const label = chapterLabel(root, 'Save your Fetch recordings')
      const [c0, c1, c2, c3] = cueTimes(scene)
      const term = el(root, 'div', 'terminal', '', { left: '120px', top: '170px', width: '1680px', height: '640px' })
      const pre = el(term, 'pre')
      const cmd = 'npx fetchtv recordings --ip=192.168.1.50 --for-plex --save=./fetch-recordings'
      const out = [
        'Fetch TV IP address: <span class="t-mag">192.168.1.50</span>',
        'Retrieving Fetch TV recordings…',
        'Saving 24 recordings…',
        '<span style="color:#62cfff">Starting download for: Kitchen Heat - S05E01.ts</span>',
        '<span style="color:#62cfff">Starting download for: Kitchen Heat - S05E02.ts</span>',
        '<span style="color:#62cfff">Starting download for: Mountain Rangers - S04E01.ts</span>',
      ]
      const tree = el(root, 'div', 'card', `
        <div class="mono" style="font-size:30px;line-height:1.8;color:#a9b4be">
          <div><span style="color:#5ce1c6">${ICONS.folder(32)}</span> fetch-recordings</div>
          <div style="padding-left:44px"><span style="color:#5ce1c6">${ICONS.folder(32)}</span> Kitchen Heat</div>
          <div style="padding-left:88px"><span style="color:#5ce1c6">${ICONS.folder(32)}</span> Season 5</div>
          <div style="padding-left:132px;color:#f2f5f7">${ICONS.file(32)} Kitchen Heat - S05E01.ts</div>
          <div style="padding-left:132px;color:#f2f5f7">${ICONS.file(32)} Kitchen Heat - S05E02.ts</div>
          <div style="padding-left:44px"><span style="color:#5ce1c6">${ICONS.folder(32)}</span> Mountain Rangers</div>
        </div>`, { left: '520px', top: '230px', width: '880px', padding: '40px 48px' })
      tree.querySelectorAll('svg').forEach((s) => { s.style.verticalAlign = '-6px' })
      const warn = el(root, 'div', 'card', `<div style="display:flex;gap:40px;align-items:center"><div style="color:#ff8486">${ICONS.calendar(110)}</div><div><div style="font-size:30px;color:#ff8486;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Do it before 31 October</div><div style="font-size:58px;font-weight:800;margin-top:8px">A suspended box can't be copied</div></div></div>`, { left: '240px', top: '420px', width: '1440px', padding: '50px 60px', borderColor: 'rgba(255,77,79,0.5)', background: 'rgba(255,77,79,0.08)' })
      const k1 = kicker(root, { label: 'fetchtv', text: 'Free, runs on a Windows PC or a Mac', tone: 'is-mint', x: 120, y: 860 })
      return (t) => {
        bg(t, scene.duration)
        label(t)
        const typed = Math.floor(clamp((t - c1 + 0.3) / 2.4) * cmd.length)
        const shown = out.slice(0, Math.max(0, Math.floor((t - c1 - 2.4) / 0.45)))
        pre.innerHTML = `<span class="t-mint">$</span> ${cmd.slice(0, Math.max(0, typed))}${typed < cmd.length ? '<span class="caret"></span>' : ''}\n${shown.join('\n')}`
        place(term, { opacity: window01(t, c0 - 0.2, c2 - 0.1), y: 20 * (1 - ramp(t, c0 - 0.2, 0.6)) })
        k1(t, c1 + 0.5, c2 - 0.3)
        place(tree, { opacity: window01(t, c2 - 0.1, c3 - 0.1), y: 40 * (1 - ramp(t, c2 - 0.1, 0.6)) })
        place(warn, { opacity: window01(t, c3 - 0.1, scene.duration + 1), scale: lerp(0.94, 1, ramp(t, c3 - 0.1, 0.6, easeOutBack)) })
      }
    },

    end: (root, scene) => {
      const bg = glow(root)
      const [c0, c1, c2] = cueTimes(scene)
      const word = el(root, 'div', 'wordmark', '<span class="free">Free</span><span class="tv">tv</span><span class="arr">arr</span>', { position: 'absolute', left: '120px', top: '150px', fontSize: '150px' })
      const free = el(root, 'div', 'subline', 'Free and open source', { position: 'absolute', left: '126px', top: '330px', color: '#f2f5f7', fontWeight: '600' })
      const link = (top, k, v, mint) => el(root, 'div', 'card', `<div style="font-size:26px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${mint ? '#5ce1c6' : '#8d9aa7'}">${k}</div><div class="mono" style="font-size:44px;margin-top:10px">${v}</div>`, { left: '120px', top: `${top}px`, width: '1680px', padding: '30px 44px', borderColor: mint ? 'rgba(92,225,198,0.6)' : 'rgba(255,255,255,0.08)' })
      const l1 = link(450, 'Leaving Fetch guide', 'furey.github.io/freetvarr/guide/leaving-fetch', true)
      const l2 = link(640, 'Website and docs', 'furey.github.io/freetvarr', false)
      const l3 = link(830, 'Source code', 'github.com/furey/freetvarr', false)
      return (t) => {
        bg(t, scene.duration)
        rise(word, t, 0, { dy: 30 })
        rise(free, t, c0 + 0.4)
        rise(l1, t, c1)
        rise(l2, t, c1 + 1.2)
        rise(l3, t, c1 + 2.0)
        void c2
        root.style.opacity = String(1 - ramp(t, scene.duration - 1.2, 1.2, (q) => q))
      }
    },
  }
}
