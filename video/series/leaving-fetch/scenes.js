import { kit, clamp, lerp, ramp, easeInOut, easeOutBack, el, place, rise, window01, ICONS, MINT, RED_TEXT, DIM, TEXT2, fadeTail } from '../stage/lib.js'

const IMG = { 'Kitchen Heat': 1666, 'Tide Watch': 1045, 'Reef Diaries': 4092, 'Wild Neighbours': 4276, 'Lighthouse at Dusk': 1567 }
const IP = '<span class="t-mag">192.168.1.50</span>'

const setTopBox = (root, { x, y, w = 420 }) => el(root, 'div', '', `
  <div style="position:relative;width:${w}px;height:${Math.round(w * 0.22)}px;border-radius:18px;background:linear-gradient(#1a222b,#0d1218);border:2px solid rgba(255,255,255,0.14);box-shadow:0 30px 60px rgba(0,0,0,0.45)">
    <div style="position:absolute;left:26px;top:50%;width:12px;height:12px;margin-top:-6px;border-radius:50%;background:#3dd68c;box-shadow:0 0 12px #3dd68c"></div>
    <div style="position:absolute;right:30px;top:50%;width:${Math.round(w * 0.3)}px;height:4px;margin-top:-2px;border-radius:2px;background:rgba(255,255,255,0.1)"></div>
  </div>`, { position: 'absolute', left: `${x}px`, top: `${y}px` })

const laptop = (root, { x, y, w = 440 }) => el(root, 'div', '', `
  <div style="width:${w}px;height:${Math.round(w * 0.6)}px;border-radius:18px 18px 4px 4px;background:#0b1117;border:12px solid #26323e;position:relative;overflow:hidden">
    <div class="screen" style="position:absolute;inset:0;padding:22px;font-family:'Geist Mono',monospace;font-size:20px;color:#5ce1c6"></div>
  </div>
  <div style="width:${w + 80}px;height:22px;margin-left:-40px;border-radius:0 0 18px 18px;background:#303d4a"></div>`, { position: 'absolute', left: `${x}px`, top: `${y}px` })

const tile = (root, name, { w = 220 } = {}) => el(root, 'div', '', `
  <img src="media/hd/${IMG[name]}.jpg" style="display:block;width:${w}px;height:${Math.round(w * 0.5625)}px;object-fit:cover;border-radius:12px;border:2px solid rgba(255,255,255,0.18)">
  <div style="font-size:22px;font-weight:700;margin-top:8px;white-space:nowrap">${name}</div>`, { position: 'absolute', left: '0', top: '0' })

const label = (root, text, { x, y, w }) => el(root, 'div', '', text, { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${w}px`, textAlign: 'center', fontSize: '30px', fontWeight: '700', color: TEXT2 })

export const buildScenes = (deps) => {
  const { chapterLabel, title, kicker, glow, card, factCard, terminal, tree, endCard, cueTimes } = kit(deps)

  return {
    open: (root, scene) => {
      const bg = glow(root)
      const [c0, c1] = cueTimes(scene)
      const head = el(root, 'div', 'headline', 'Save your<br>Fetch recordings', { position: 'absolute', left: '120px', top: '150px', fontSize: '110px' })
      const sub = el(root, 'div', 'subline', 'Before you cancel, copy them off the box.', { position: 'absolute', left: '124px', top: '420px', color: '#f2f5f7' })
      const scene3 = el(root, 'div', 'layer')
      const box = setTopBox(scene3, { x: 160, y: 760 })
      const lap = laptop(scene3, { x: 1320, y: 620 })
      label(scene3, 'Your Fetch box', { x: 160, y: 880, w: 420 })
      label(scene3, 'Your computer', { x: 1320, y: 920, w: 440 })
      const svg = el(scene3, 'div', '', `<svg width="1920" height="1080" style="position:absolute;left:0;top:0"><path d="M600 806 C 900 806, 1000 760, 1300 760" stroke="#5ce1c6" stroke-width="6" stroke-dasharray="14 14" fill="none" stroke-linecap="round"/></svg>`, { position: 'absolute', inset: '0' })
      const path = svg.querySelector('path')
      const tiles = ['Kitchen Heat', 'Tide Watch', 'Reef Diaries'].map((n) => tile(scene3, n, { w: 200 }))
      const net = el(scene3, 'div', 'kicker is-mint', '<small>fetchtv</small>Free · home network · no Fetch account', { left: '640px', top: '540px', fontSize: '32px' })
      const screen = lap.querySelector('.screen')
      return (t) => {
        bg(t, scene.duration)
        rise(head, t, c0 - 0.5, { dy: 60 })
        rise(sub, t, c0 + 1.2)
        place(box, { opacity: ramp(t, 0.3, 0.6), y: 30 * (1 - ramp(t, 0.3, 0.6)) })
        place(lap, { opacity: ramp(t, 0.6, 0.6), y: 30 * (1 - ramp(t, 0.6, 0.6)) })
        path.style.strokeDashoffset = String(-t * 40)
        path.style.opacity = String(ramp(t, c1 - 0.3, 0.6))
        const len = path.getTotalLength()
        tiles.forEach((node, i) => {
          const p = ramp(t, c1 + 0.4 + i * 1.1, 1.6, easeInOut)
          const pt = path.getPointAtLength(len * p)
          const on = p > 0 && p < 1 ? 1 : 0
          node.style.transform = `translate(${pt.x - 100}px, ${pt.y - 70}px) scale(${lerp(0.7, 1, Math.sin(p * Math.PI))})`
          node.style.opacity = String(on)
        })
        const copied = Math.floor(clamp((t - c1 - 1.6) / 1.1, 0, 3))
        screen.innerHTML = ['Kitchen Heat', 'Tide Watch', 'Reef Diaries'].slice(0, copied).map((n) => `✓ ${n}`).join('<br>')
        rise(net, t, c1 + 0.2)
      }
    },

    deadline: (root, scene) => {
      const bg = glow(root)
      const chap = chapterLabel(root, 'The levy deadline')
      const kick = title(root, 'Save first, then cancel')
      const [c0, c1, c2, c3, c4] = cueTimes(scene)
      const levy = factCard(root, { label: 'Fetch Mini Gen 3 and Mighty Gen 3', value: 'A one-off levy to keep the box working', x: 120, y: 330, w: 1680, size: 60 })
      const cal = card(root, `
        <div style="background:#ff4d4f;color:#fff;font-size:34px;font-weight:800;letter-spacing:.12em;padding:16px 0;border-radius:24px 24px 0 0;text-align:center">OCTOBER 2026</div>
        <div style="font-size:190px;font-weight:800;line-height:1;padding:20px 0 26px;text-align:center">31</div>`, { left: '120px', top: '560px', width: '420px', padding: '0', overflow: 'hidden', borderColor: 'rgba(255,255,255,0.14)' })
      const closed = el(root, 'div', '', 'Opt-in deadline', { position: 'absolute', left: '600px', top: '640px', fontSize: '84px', fontWeight: '800' })
      const closedSub = el(root, 'div', 'subline', 'The last day to opt in to the levy', { position: 'absolute', left: '604px', top: '750px' })
      const branch = el(root, 'div', 'layer')
      const start = card(branch, '<div style="font-size:26px;color:#8d9aa7;font-weight:700;letter-spacing:.06em;text-transform:uppercase">31 Oct 2026</div><div style="font-size:44px;font-weight:800;margin-top:6px">Opt-in deadline</div>', { left: '120px', top: '520px', width: '440px', padding: '30px 36px' })
      const lines = el(branch, 'div', '', `<svg width="1920" height="1080" style="position:absolute;left:0;top:0" fill="none" stroke-width="6" stroke-linecap="round">
        <path class="up" d="M560 600 C 680 600, 680 410, 820 410" stroke="#5ce1c6"/>
        <path class="down" d="M560 600 C 680 600, 680 790, 820 790" stroke="#ff4d4f"/></svg>`, { position: 'absolute', inset: '0' })
      const [up, down] = [lines.querySelector('.up'), lines.querySelector('.down')]
      ;[up, down].forEach((p) => { p.style.strokeDasharray = '400'; p.style.strokeDashoffset = '400' })
      const yes = factCard(branch, { label: 'If you opt in', value: 'Works until at least June 2028', tone: 'mint', x: 820, y: 330, w: 980, size: 52, icon: ICONS.check(70) })
      const no = factCard(branch, { label: 'If you don’t', value: 'Suspended in November 2026', tone: 'red', x: 820, y: 710, w: 980, size: 52, icon: ICONS.cross(70) })
      const tiles = el(branch, 'div', '', '', { position: 'absolute', left: '820px', top: '900px', display: 'flex', gap: '24px' })
      ;['Kitchen Heat', 'Tide Watch', 'Reef Diaries'].forEach((n) => el(tiles, 'img', '', '', { width: '180px', height: '100px', objectFit: 'cover', borderRadius: '10px', border: '2px solid rgba(255,255,255,0.18)' }).src = `media/hd/${IMG[n]}.jpg`)
      const tilesNote = el(branch, 'div', '', 'Recordings can’t be copied', { position: 'absolute', left: '1440px', top: '930px', fontSize: '30px', fontWeight: '700', color: RED_TEXT })
      const dead = factCard(root, { label: 'A cancelled box', value: 'Stops working completely', tone: 'red', x: 120, y: 420, w: 1680, size: 72, icon: ICONS.cross(96) })
      const order = el(root, 'div', '', `<div style="display:flex;gap:30px;align-items:center;font-size:56px;font-weight:800">
        <div style="padding:24px 40px;border-radius:20px;background:rgba(92,225,198,0.12);border:2px solid rgba(92,225,198,0.7)">1. Save</div>
        <div style="color:#8d9aa7">→</div>
        <div style="padding:24px 40px;border-radius:20px;background:#141c24;border:2px solid rgba(255,255,255,0.14)">2. Cancel</div></div>`, { position: 'absolute', left: '120px', top: '720px' })
      return (t) => {
        bg(t, scene.duration)
        chap(t)
        kick(t)
        const a = window01(t, c0 - 0.3, c2 - 0.1)
        rise(levy, t, c0 - 0.2)
        levy.style.opacity = String(Number(levy.style.opacity) * a)
        const pop = ramp(t, c1 - 0.2, 0.7, easeOutBack)
        place(cal, { scale: lerp(0.85, 1, pop), opacity: clamp(pop) * window01(t, c1 - 0.3, c2 - 0.1) })
        rise(closed, t, c1 + 0.4)
        rise(closedSub, t, c1 + 1.2)
        closed.style.opacity = String(Number(closed.style.opacity) * window01(t, c1, c2 - 0.1))
        closedSub.style.opacity = String(Number(closedSub.style.opacity) * window01(t, c1, c2 - 0.1))
        branch.style.opacity = String(window01(t, c2 - 0.3, c4 - 0.1))
        rise(start, t, c2 - 0.2)
        up.style.strokeDashoffset = String(400 * (1 - ramp(t, c2 + 0.2, 0.8)))
        rise(yes, t, c2 + 0.8)
        down.style.strokeDashoffset = String(400 * (1 - ramp(t, c3 - 0.2, 0.8)))
        rise(no, t, c3 + 0.4)
        rise(tiles, t, c3 + 0.6)
        const gone = ramp(t, c3 + 2.6, 0.9)
        tiles.style.opacity = String(Number(tiles.style.opacity) * (1 - 0.8 * gone))
        tiles.style.filter = `grayscale(${gone})`
        place(tilesNote, { opacity: gone })
        place(dead, { opacity: window01(t, c4 - 0.2, scene.duration + 1), y: 30 * (1 - ramp(t, c4 - 0.2, 0.6)) })
        rise(order, t, c4 + 2.4)
      }
    },

    need: (root, scene) => {
      const bg = glow(root)
      const chap = chapterLabel(root, 'What you need')
      const kick = title(root, 'Install Node.js first')
      const [c0, c1, c2] = cueTimes(scene)
      const box = setTopBox(root, { x: 160, y: 430, w: 380 })
      const lap = laptop(root, { x: 1000, y: 300, w: 380 })
      const svg = el(root, 'div', '', '<svg width="1920" height="1080" style="position:absolute;left:0;top:0"><path d="M560 470 H 980" stroke="#5ce1c6" stroke-width="6" stroke-dasharray="14 14" stroke-linecap="round"/></svg>', { position: 'absolute', inset: '0' })
      const netLabel = el(root, 'div', '', 'Same home network', { position: 'absolute', left: '600px', top: '400px', fontSize: '28px', fontWeight: '700', color: MINT })
      label(root, 'Fetch box', { x: 160, y: 540, w: 380 })
      const lapLabel = label(root, 'A Windows PC or a Mac', { x: 920, y: 580, w: 540 })
      const t1 = factCard(root, { label: 'Set up', value: '15 minutes', x: 1500, y: 300, w: 380, size: 54 })
      const t2 = factCard(root, { label: 'Then copying', value: 'A few hours', x: 1500, y: 490, w: 380, size: 54 })
      const node = card(root, `
        <div style="display:flex;align-items:center;gap:16px;font-size:24px;color:#8d9aa7"><span class="mono" style="padding:6px 18px;border-radius:8px;background:#070b0f">nodejs.org/en/download</span></div>
        <div style="display:flex;align-items:center;gap:60px;margin-top:30px">
          <div><div style="font-size:30px;color:#a9b4be;font-weight:600">Node.js</div><div style="font-size:54px;font-weight:800;margin-top:4px">Free software that runs fetchtv</div></div>
          <div class="lts" style="margin-left:auto;padding:22px 40px;border-radius:16px;background:#5ce1c6;color:#04201a;font-size:40px;font-weight:800;white-space:nowrap">LTS installer</div>
        </div>`, { left: '120px', top: '700px', width: '1680px' })
      const lts = node.querySelector('.lts')
      void svg
      return (t) => {
        bg(t, scene.duration)
        chap(t)
        kick(t)
        place(box, { opacity: ramp(t, c0 - 0.3, 0.5) })
        place(lap, { opacity: ramp(t, c0, 0.5), y: 20 * (1 - ramp(t, c0, 0.6)) })
        svg.style.opacity = String(ramp(t, c0 + 0.8, 0.6))
        rise(netLabel, t, c0 + 1.2)
        rise(lapLabel, t, c0 + 0.4)
        rise(t1, t, c1 - 0.1)
        rise(t2, t, c1 + 1.4)
        rise(node, t, c2 - 0.2, { dy: 50 })
        const pulse = ramp(t, c2 + 4.4, 0.4) * (1 - ramp(t, c2 + 5.4, 0.6))
        lts.style.transform = `scale(${1 + 0.08 * pulse})`
        lts.style.boxShadow = `0 0 ${40 * pulse}px rgba(92,225,198,${0.7 * pulse})`
      }
    },

    find: (root, scene) => {
      const bg = glow(root)
      const chap = chapterLabel(root, 'Find the box')
      const kick = title(root, '<span class="mono" style="font-size:70px">npx fetchtv</span>')
      const [c0, c1, c2, c3] = cueTimes(scene)
      const tabs = el(root, 'div', '', `<div style="display:flex;gap:24px">
        <div style="padding:20px 34px;border-radius:16px;background:#141c24;border:2px solid rgba(255,255,255,0.12);font-size:34px;font-weight:700"><span style="color:#8d9aa7;font-weight:600">Mac:</span> Terminal</div>
        <div style="padding:20px 34px;border-radius:16px;background:#141c24;border:2px solid rgba(255,255,255,0.12);font-size:34px;font-weight:700"><span style="color:#8d9aa7;font-weight:600">Windows:</span> PowerShell</div></div>`, { position: 'absolute', left: '1060px', top: '130px' })
      const term = terminal(root, { x: 120, y: 260, w: 1680, h: 600, title: 'Terminal' })
      const out = [
        '<span class="t-dim">Need to install the following packages:</span>',
        '<span class="t-dim">  fetchtv</span>',
        '<span class="t-dim">Ok to proceed? (y)</span> y',
      ]
      const found = [
        '',
        '<span class="t-green">=== Started: 30/10/2026, 7:42:10 pm ===</span>',
        `Fetch TV IP address: <span class="ip" style="padding:2px 10px;border-radius:8px">${IP}</span>`,
        `<span class="t-dim">Tip: Run future commands with "--ip=192.168.1.50" to skip server discovery.</span>`,
      ]
      const router = factCard(root, { label: 'No box found?', value: 'Router → list of connected devices', tone: 'mint', x: 120, y: 890, w: 1300, size: 44 })
      return (t) => {
        bg(t, scene.duration)
        chap(t)
        kick(t)
        rise(tabs, t, c0 + 2.6)
        place(term.term, { opacity: ramp(t, c0 - 0.3, 0.5), y: 20 * (1 - ramp(t, c0 - 0.3, 0.6)) })
        const answered = t >= c1 + 5.2
        const asked = answered ? out[2] : `<span class="t-dim">Ok to proceed? (y)</span> ${t >= c1 + 2.4 ? '<span class="caret"></span>' : ''}`
        const head = t >= c1 + 2.4 ? [out[0], out[1], asked] : [out[0], out[1]]
        const tail = answered ? found.slice(0, Math.max(0, Math.floor((t - Math.max(c1 + 5.4, c2 - 0.8)) / 0.35) + 1)) : []
        term.set({ t, cmd: 'npx fetchtv', at: c1 + 0.3, typeDur: 0.9, out: [...head, ...tail], outAt: c1 + 1.6, step: 0.01 })
        const ip = term.pre.querySelector('.ip')
        if (ip) ip.style.background = `rgba(229,140,255,${0.25 * ramp(t, c2 + 0.6, 0.4)})`
        rise(router, t, c3 - 0.1)
      }
    },

    list: (root, scene) => {
      const bg = glow(root)
      const chap = chapterLabel(root, 'List your recordings')
      const kick = title(root, '3–6 GB per HD hour')
      const [c0, c1] = cueTimes(scene)
      const term = terminal(root, { x: 120, y: 260, w: 1180, h: 740, size: 28 })
      const out = [
        '<span class="t-green">=== Listing Shows ===</span>',
        '<span class="t-green">• Kitchen Heat</span>',
        '<span class="t-green">• Lighthouse at Dusk</span>',
        '<span class="t-green">• Tide Watch</span>',
        '<span class="t-green">• Wild Neighbours</span>',
        '<span class="t-green">=== Done: 30/10/2026, 7:43:02 pm ===</span>',
      ]
      const disk = card(root, `
        <div style="font-size:27px;color:#8d9aa7;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Free space</div>
        <div style="font-size:60px;font-weight:800;margin-top:6px">Enough room?</div>
        <div style="margin-top:30px;height:34px;border-radius:17px;background:#26323e;overflow:hidden"><div class="fill" style="height:100%;width:0;background:#5ce1c6;border-radius:17px"></div></div>
        <div style="display:flex;justify-content:space-between;margin-top:14px;font-size:26px;color:#a9b4be"><span class="used">0 GB</span><span>Disk</span></div>
        <div style="margin-top:40px;font-size:32px;line-height:1.5"><b>1 hour of HD</b><br><span class="mono" style="font-size:44px;color:#5ce1c6">3–6 GB</span></div>`, { left: '1340px', top: '260px', width: '460px' })
      const fill = disk.querySelector('.fill')
      const used = disk.querySelector('.used')
      return (t) => {
        bg(t, scene.duration)
        chap(t)
        kick(t)
        place(term.term, { opacity: ramp(t, c0 - 0.4, 0.5) })
        term.set({ t, cmd: 'npx fetchtv shows --ip=192.168.1.50', at: c0 + 0.2, typeDur: 1.5, out, step: 0.3 })
        rise(disk, t, c1 - 0.2)
        const p = ramp(t, c1 + 0.6, 3.0, easeInOut)
        fill.style.width = `${p * 58}%`
        used.textContent = `${Math.round(p * 120)} GB of recordings`
      }
    },

    copy: (root, scene) => {
      const bg = glow(root)
      const chap = chapterLabel(root, 'Copy everything')
      const kick = title(root, 'Add <span class="mono" style="font-size:70px;color:#5ce1c6">--for-plex</span>')
      const [c0, c1, c2] = cueTimes(scene)
      const term = terminal(root, { x: 120, y: 260, w: 1680, h: 560, size: 27 })
      const cmd = 'npx fetchtv recordings --ip=192.168.1.50 --for-plex --save=./fetch-recordings'
      const base = [
        '<span class="t-green">=== Saving Recordings ===</span>',
        'Saving 24 recordings…',
        '<span style="color:#62cfff">Starting download for: Kitchen Heat - S03E08.ts</span>',
      ]
      const t2 = tree(root, [
        [0, 'dir', 'fetch-recordings'],
        [1, 'dir', 'Kitchen Heat'],
        [2, 'dir', 'Season 03'],
        [3, 'file', 'Kitchen Heat - S03E07.ts'],
        [3, 'file', 'Kitchen Heat - S03E08<span class="ext">.part</span>'],
        [1, 'dir', 'Tide Watch'],
        [1, 'dir', 'Wild Neighbours'],
      ], { x: 120, y: 260, w: 1000, size: 30 })
      const ext = t2.node.querySelector('.ext')
      const resume = factCard(root, { label: 'Copy stopped?', value: 'Run the same command again', tone: 'mint', x: 1160, y: 260, w: 640, size: 46 })
      const skip = el(root, 'div', 'card', `<div class="mono" style="font-size:26px;line-height:1.7;color:#8d9aa7">Skipping already saved: Kitchen Heat / S03E07<br>Skipping already saved: Tide Watch / S01E02<br><span style="color:#62cfff">Resuming download for: Kitchen Heat - S03E08.ts</span></div>`, { left: '1160px', top: '520px', width: '640px', padding: '30px 36px' })
      return (t) => {
        bg(t, scene.duration)
        chap(t)
        kick(t)
        const showTerm = window01(t, c0 - 0.4, c1 + 0.2)
        place(term.term, { opacity: showTerm })
        const pct = Math.round(clamp((t - c0 - 3.6) / 3) * 37)
        const bar = '█'.repeat(Math.round(pct / 2.5)) + '░'.repeat(40 - Math.round(pct / 2.5))
        term.set({ t, cmd, at: c0 + 0.2, typeDur: 2.4, out: [...base, `<span class="t-dim">${bar} ${pct}% | 1.2 GB</span>`], outAt: c0 + 2.9, step: 0.3 })
        const treeOn = window01(t, c1 - 0.1, scene.duration + 1)
        place(t2.node, { opacity: treeOn, y: 30 * (1 - ramp(t, c1 - 0.1, 0.6)) })
        t2.rows.forEach((r, i) => { r.style.opacity = String(ramp(t, c1 + 0.2 + i * 0.35, 0.4)) })
        const done = ramp(t, c1 + 4.4, 0.3)
        ext.textContent = done >= 0.5 ? '.ts' : '.part'
        ext.style.color = done >= 0.5 ? MINT : '#ffb547'
        rise(resume, t, c2 - 0.1)
        rise(skip, t, c2 + 2.6)
      }
    },

    library: (root, scene) => {
      const bg = glow(root)
      const chap = chapterLabel(root, 'Into your library')
      const kick = title(root, 'tv, movies, one-offs')
      const [c0, c1, c2, c3] = cueTimes(scene)
      const fm = el(root, 'div', 'window', '', { left: '120px', top: '260px', width: '1680px', height: '520px' })
      el(fm, 'div', 'window-bar', '<i></i><i></i><i></i><span>Your computer  ·  NAS shared folder</span>')
      const panes = el(fm, 'div', '', '', { display: 'grid', gridTemplateColumns: '1fr 1fr', height: '476px' })
      const left = el(panes, 'div', '', '', { padding: '34px 40px', borderRight: '1px solid rgba(255,255,255,0.08)' })
      const right = el(panes, 'div', '', '', { padding: '34px 40px', background: '#10161d' })
      const head = (p, txt) => el(p, 'div', 'mono', txt, { fontSize: '26px', color: DIM, marginBottom: '20px' })
      head(left, 'fetch-recordings')
      head(right, 'NAS › freetvarr › media')
      const row = (p, name, kind = 'dir') => el(p, 'div', 'mono', `<span style="color:${kind === 'dir' ? MINT : '#f2f5f7'}">${kind === 'dir' ? ICONS.folder(34) : ICONS.file(34)}</span> ${name}`, { fontSize: '30px', lineHeight: '1.9', whiteSpace: 'nowrap' })
      const src = ['Kitchen Heat', 'Wild Neighbours', 'Tide Watch', 'Lighthouse at Dusk', 'Nightline News'].map((n) => row(left, n))
      const dst = { tv: row(right, 'tv'), movies: row(right, 'movies'), 'one-offs': row(right, 'one-offs') }
      fm.querySelectorAll('svg').forEach((s) => { s.style.verticalAlign = '-7px' })
      const ghost = el(root, 'div', 'mono', '', { position: 'absolute', left: '0', top: '0', fontSize: '30px', padding: '8px 18px', borderRadius: '12px', background: 'rgba(92,225,198,0.18)', border: '2px solid rgba(92,225,198,0.7)', whiteSpace: 'nowrap' })
      const rules = card(root, `<div style="display:grid;grid-template-columns:auto auto;gap:14px 40px;font-size:34px;align-items:center">
        <div style="color:#a9b4be">A series</div><div class="mono" style="color:#5ce1c6">tv</div>
        <div style="color:#a9b4be">A film</div><div class="mono" style="color:#5ce1c6">movies <span style="color:#8d9aa7">or</span> one-offs</div>
        <div style="color:#a9b4be">Anything else</div><div class="mono" style="color:#5ce1c6">one-offs</div></div>`, { left: '120px', top: '810px', width: '1100px', padding: '28px 44px' })
      const scan = factCard(root, { label: 'Then', value: 'Your media library finds them on its next scan', tone: 'mint', x: 120, y: 810, w: 1680, size: 46 })
      const drags = [
        { from: 0, to: 'tv', at: c1 + 0.6 },
        { from: 1, to: 'tv', at: c1 + 2.4 },
        { from: 3, to: 'movies', at: c2 + 0.6 },
        { from: 4, to: 'one-offs', at: c2 + 3.4 },
      ]
      let rects = null
      return (t) => {
        bg(t, scene.duration)
        chap(t)
        kick(t)
        place(fm, { opacity: ramp(t, c0 - 0.3, 0.5), y: 20 * (1 - ramp(t, c0 - 0.3, 0.6)) })
        if (!rects && t > 0) rects = { src: src.map((n) => n.getBoundingClientRect()), dst: Object.fromEntries(Object.entries(dst).map(([k, n]) => [k, n.getBoundingClientRect()])) }
        let active = null
        drags.forEach((d) => {
          const p = ramp(t, d.at, 1.2, easeInOut)
          src[d.from].style.opacity = String(p >= 1 ? 0.3 : 1)
          if (p > 0 && p < 1) active = { d, p }
        })
        Object.values(dst).forEach((n) => { n.style.background = '' })
        if (active && rects) {
          const a = rects.src[active.d.from]
          const b = rects.dst[active.d.to]
          ghost.textContent = src[active.d.from].textContent.trim()
          place(ghost, { x: lerp(a.left + 40, b.left + 180, active.p), y: lerp(a.top, b.top, active.p), opacity: 1 })
          if (active.p > 0.7) dst[active.d.to].style.background = 'rgba(92,225,198,0.14)'
        } else place(ghost, { opacity: 0 })
        place(rules, { opacity: window01(t, c2 - 0.2, c3 - 0.1), y: 20 * (1 - ramp(t, c2 - 0.2, 0.5)) })
        place(scan, { opacity: ramp(t, c3 - 0.1, 0.5), y: 20 * (1 - ramp(t, c3 - 0.1, 0.5)) })
      }
    },

    cancel: (root, scene) => {
      const bg = glow(root)
      const chap = chapterLabel(root, 'Cancel Fetch')
      const kick = title(root, 'Packages, Cancel Service')
      const [c0, c1, c2, c3, c4, c5] = cueTimes(scene)
      const wire = el(root, 'div', 'layer')
      const wall = card(wire, '<div style="font-size:30px;font-weight:700;text-align:center">Aerial<br>wall socket</div>', { left: '120px', top: '420px', width: '300px', padding: '40px 20px' })
      const box = setTopBox(wire, { x: 1240, y: 340, w: 420 })
      label(wire, 'Fetch box', { x: 1240, y: 450, w: 420 })
      const tuner = card(wire, `<div style="display:flex;gap:28px;align-items:center"><div style="color:#5ce1c6">${ICONS.tuner(110)}</div><div style="font-size:40px;font-weight:800">Your new tuner</div></div>`, { left: '1240px', top: '600px', width: '560px', padding: '30px 40px', borderColor: 'rgba(92,225,198,0.6)' })
      const lead = el(wire, 'div', '', '<svg width="1920" height="1080" style="position:absolute;left:0;top:0"><path d="" stroke="#f2f5f7" stroke-width="10" fill="none" stroke-linecap="round"/></svg>', { position: 'absolute', inset: '0' })
      const leadPath = lead.querySelector('path')
      const check = factCard(wire, { label: 'Then', value: 'Check every channel you watch', tone: 'mint', x: 120, y: 820, w: 1000, size: 44 })
      const signin = card(root, `
        <div style="font-size:30px;color:#8d9aa7;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Fetch account management</div>
        <div style="font-size:56px;font-weight:800;margin:10px 0 30px">Sign in</div>
        <div style="font-size:26px;color:#a9b4be;margin-bottom:10px">Username</div>
        <div class="mono" style="padding:18px 24px;border-radius:12px;background:#070b0f;border:2px solid rgba(92,225,198,0.6);font-size:32px">you@example.com</div>
        <div style="font-size:28px;color:#5ce1c6;margin-top:16px">Your email address, in lower case</div>
        <div style="font-size:26px;color:#a9b4be;margin:26px 0 10px">Password</div>
        <div class="mono" style="padding:18px 24px;border-radius:12px;background:#070b0f;border:2px solid rgba(255,255,255,0.12);font-size:32px">••••••••••</div>`, { left: '120px', top: '270px', width: '760px', padding: '40px 48px' })
      const steps = ['Packages', 'Cancel Service', 'Yes, cancel my service'].map((s, i) => card(root, `<div style="display:flex;align-items:center;gap:28px"><div style="width:64px;height:64px;border-radius:50%;background:#26323e;display:grid;place-items:center;font-size:32px;font-weight:800">${i + 1}</div><div style="font-size:48px;font-weight:800">${s}</div></div>`, { left: '960px', top: `${300 + i * 170}px`, width: '840px', padding: '28px 40px' }))
      const every = factCard(root, { label: 'One cancel', value: 'Cancels every box on the account', x: 960, y: 820, w: 840, size: 40 })
      const isp = factCard(root, { label: 'Fetch through your internet provider?', value: 'Cancel through the provider instead', x: 120, y: 780, w: 760, size: 40 })
      const safe = factCard(root, { label: 'Cancel only once your recordings are safe', value: 'A cancelled box can’t be switched back on', tone: 'red', x: 120, y: 420, w: 1680, size: 64, icon: ICONS.cross(96) })
      return (t) => {
        bg(t, scene.duration)
        chap(t)
        kick(t)
        wire.style.opacity = String(window01(t, 0, c1 - 0.1))
        place(wall, { opacity: ramp(t, 0.2, 0.5) })
        place(box, { opacity: ramp(t, 0.3, 0.5) })
        rise(tuner, t, c0 + 0.3)
        const p = ramp(t, c0 + 1.0, 1.4, easeInOut)
        const ty = lerp(386, 690, p)
        leadPath.setAttribute('d', `M420 500 C 800 500, 900 ${ty}, 1240 ${ty}`)
        rise(check, t, c0 + 2.6)
        const mid = window01(t, c1 - 0.2, c5 - 0.1)
        place(signin, { opacity: Math.min(mid, ramp(t, c1 - 0.2, 0.5)) * (1 - ramp(t, c4 - 0.4, 0.3)), y: 20 * (1 - ramp(t, c1 - 0.2, 0.5)) })
        steps.forEach((s, i) => {
          const on = ramp(t, c2 + i * 1.0, 0.4)
          place(s, { opacity: Math.min(mid, on), x: -30 * (1 - on) })
          const lit = t >= c2 + i * 1.0 + 0.2 && t < c2 + i * 1.0 + 1.2 + (i === 2 ? 1.2 : 0)
          s.style.borderColor = lit ? (i === 2 ? 'rgba(255,77,79,0.7)' : 'rgba(92,225,198,0.7)') : 'rgba(255,255,255,0.08)'
        })
        place(every, { opacity: Math.min(mid, ramp(t, c3 - 0.1, 0.5)) })
        place(isp, { opacity: Math.min(mid, ramp(t, c4 - 0.2, 0.5)) })
        place(safe, { opacity: ramp(t, c5 - 0.2, 0.5), scale: lerp(0.95, 1, ramp(t, c5 - 0.2, 0.6, easeOutBack)) })
      }
    },

    end: (root, scene) => {
      const bg = glow(root)
      const show = endCard(root, {
        links: [['Leaving Fetch guide', 'furey.github.io/freetvarr/guide/leaving-fetch', true], ['fetchtv', 'github.com/furey/fetchtv']],
        next: 'Install Freetvarr and run setup',
      })
      return (t) => {
        bg(t, scene.duration)
        show(t, 0.3)
        fadeTail(root, t, scene.duration, 1.2)
      }
    },
  }
}
