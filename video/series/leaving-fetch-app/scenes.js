import { kit, clamp, lerp, ramp, easeInOut, easeOutBack, el, place, rise, window01, footage, ICONS, MINT, DIM, TEXT2, fadeTail } from '../stage/lib.js'

const ASSET = '../leaving-fetch-app/assets'
const MAIN_BASE = 60.806
const NF_BASE = 57.822
const FRAME_W = 1600
const FRAME_H = 1268
const WIN = { x: 620, y: 50, w: 1180 }
const IMG_H = Math.round(WIN.w * FRAME_H / FRAME_W)
const SCALE = WIN.w / FRAME_W
const TILES = [['Master Cook', 1666], ['Backyard Builders', 4069], ['The Footy Panel', 1216]]

const setTopBox = (root, { x, y, w = 420 }) => el(root, 'div', '', `
  <div style="position:relative;width:${w}px;height:${Math.round(w * 0.22)}px;border-radius:18px;background:linear-gradient(#1a222b,#0d1218);border:2px solid rgba(255,255,255,0.14);box-shadow:0 30px 60px rgba(0,0,0,0.45)">
    <div style="position:absolute;left:26px;top:50%;width:12px;height:12px;margin-top:-6px;border-radius:50%;background:#3dd68c;box-shadow:0 0 12px #3dd68c"></div>
    <div style="position:absolute;right:30px;top:50%;width:${Math.round(w * 0.3)}px;height:4px;margin-top:-2px;border-radius:2px;background:rgba(255,255,255,0.1)"></div>
  </div>`, { position: 'absolute', left: `${x}px`, top: `${y}px` })

const laptop = (root, { x, y, w = 440 }) => el(root, 'div', '', `
  <div style="width:${w}px;height:${Math.round(w * 0.6)}px;border-radius:18px 18px 4px 4px;background:#0b1117;border:12px solid #26323e;position:relative;overflow:hidden">
    <div class="screen" style="position:absolute;inset:0;padding:22px 26px;font-size:24px;font-weight:700;line-height:1.7;color:#f2f5f7"></div>
  </div>
  <div style="width:${w + 80}px;height:22px;margin-left:-40px;border-radius:0 0 18px 18px;background:#303d4a"></div>`, { position: 'absolute', left: `${x}px`, top: `${y}px` })

const tile = (root, [name, id], { w = 220 } = {}) => el(root, 'div', '', `
  <img src="media/hd/${id}.jpg" style="display:block;width:${w}px;height:${Math.round(w * 0.5625)}px;object-fit:cover;border-radius:12px;border:2px solid rgba(255,255,255,0.18)">
  <div style="font-size:22px;font-weight:700;margin-top:8px;white-space:nowrap">${name}</div>`, { position: 'absolute', left: '0', top: '0' })

const label = (root, text, { x, y, w }) => el(root, 'div', '', text, { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${w}px`, textAlign: 'center', fontSize: '30px', fontWeight: '700', color: TEXT2 })

const illustration = (root, file, { x, y, w, h }) => el(root, 'div', '', `<div style="position:relative">
    <img src="${ASSET}/${file}" style="display:block;max-width:${w}px;max-height:${h}px;border-radius:20px;border:2px solid rgba(255,255,255,0.14);box-shadow:0 30px 60px rgba(0,0,0,0.45)">
    <div style="position:absolute;left:18px;top:16px;font-size:20px;font-weight:700;letter-spacing:.08em;color:#fff;background:rgba(0,0,0,0.55);padding:5px 14px;border-radius:8px">ILLUSTRATION</div></div>`,
{ position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, display: 'flex', alignItems: 'center', justifyContent: 'center' })

const appFrame = (root, clips) => {
  const win = el(root, 'div', 'window', '', { left: `${WIN.x}px`, top: `${WIN.y}px`, width: `${WIN.w}px`, height: `${IMG_H + 44}px` })
  el(win, 'div', 'window-bar', '<i></i><i></i><i></i><span>Fetch My Recordings</span>')
  const stack = el(win, 'div', '', '', { position: 'relative', height: `${IMG_H}px` })
  const imgs = ['fmr-main', 'fmr-nf'].map((clip) => {
    const img = el(stack, 'img', '', '', { position: 'absolute', inset: '0', height: `${IMG_H}px`, objectFit: 'cover' })
    return { clip, img }
  })
  const show = ({ main, nf, mix = 0 }) => {
    footage(imgs[0].img, clips, 'fmr-main', Math.max(0, main))
    if (nf !== undefined) footage(imgs[1].img, clips, 'fmr-nf', Math.max(0, nf))
    imgs[1].img.style.opacity = String(mix)
    imgs[1].img.style.visibility = mix > 0 ? 'visible' : 'hidden'
  }
  return { win, show }
}

const ring = (root, { x, y, w, h }) => el(root, 'div', '', '', {
  position: 'absolute', left: `${WIN.x + x * SCALE - 10}px`, top: `${WIN.y + 44 + y * SCALE - 10}px`,
  width: `${w * SCALE + 20}px`, height: `${h * SCALE + 20}px`, border: `6px solid ${MINT}`, borderRadius: '20px', boxShadow: '0 0 34px rgba(92,225,198,0.55)',
})

const sideTitle = (root, text) => el(root, 'div', 'headline', text, { position: 'absolute', left: '120px', top: '150px', width: '460px', fontSize: '72px', textWrap: 'balance' })

const sideCard = (root, card, html, top) => card(root, html, { left: '120px', top: `${top}px`, width: '460px', padding: '30px 36px' })

const cardLabel = (text, colour = DIM) => `<div style="font-size:24px;color:${colour};font-weight:700;letter-spacing:.06em;text-transform:uppercase">${text}</div>`

export const buildScenes = (deps) => {
  const { chapterLabel, title, glow, card, factCard, endCard, cueTimes } = kit(deps)
  const { clips } = deps
  const mainAt = (scene, t) => scene.start + t - MAIN_BASE
  const nfAt = (scene, t) => scene.start + t - NF_BASE

  const appScene = ({ chapter, heading, setup }) => (root, scene) => {
    const bg = glow(root)
    const chap = chapterLabel(root, chapter)
    const head = sideTitle(root, heading)
    const app = appFrame(root, clips)
    const extra = setup ? setup(root, scene) : () => {}
    return (t) => {
      bg(t, scene.duration)
      chap(t)
      rise(head, t, 0.15, { dy: 30 })
      place(app.win, { opacity: 1 })
      app.show({ main: mainAt(scene, t) })
      extra(t, app)
    }
  }

  return {
    open: (root, scene) => {
      const bg = glow(root)
      const [c0, c1, c2] = cueTimes(scene)
      const icon = el(root, 'img', '', '', { position: 'absolute', left: '112px', top: '90px', width: '150px', height: '150px' })
      icon.src = `${ASSET}/app-icon.png`
      const head = el(root, 'div', 'headline', 'Save your<br>Fetch recordings', { position: 'absolute', left: '120px', top: '270px', fontSize: '112px' })
      const sub = el(root, 'div', 'subline', 'A free app for Mac, Windows, and Linux', { position: 'absolute', left: '124px', top: '540px', color: '#f2f5f7' })
      const scene3 = el(root, 'div', 'layer')
      const box = setTopBox(scene3, { x: 160, y: 790 })
      const lap = laptop(scene3, { x: 1320, y: 620 })
      label(scene3, 'Your Fetch box', { x: 160, y: 910, w: 420 })
      label(scene3, 'Your computer', { x: 1320, y: 930, w: 440 })
      const svg = el(scene3, 'div', '', '<svg width="1920" height="1080" style="position:absolute;left:0;top:0"><path d="M600 836 C 900 836, 1000 790, 1300 790" stroke="#5ce1c6" stroke-width="6" stroke-dasharray="14 14" fill="none" stroke-linecap="round"/></svg>', { position: 'absolute', inset: '0' })
      const path = svg.querySelector('path')
      const tiles = TILES.map((t) => tile(scene3, t, { w: 200 }))
      const note = el(scene3, 'div', 'kicker is-mint', '<small>Over your home network</small>No Fetch account needed', { left: '700px', top: '600px', fontSize: '32px' })
      const screen = lap.querySelector('.screen')
      return (t) => {
        bg(t, scene.duration)
        place(icon, { opacity: ramp(t, 0.1, 0.6), scale: lerp(0.9, 1, ramp(t, 0.1, 0.7, easeOutBack)) })
        rise(head, t, c0 - 0.5, { dy: 60 })
        rise(sub, t, c1 - 0.2)
        place(box, { opacity: ramp(t, 0.3, 0.6), y: 30 * (1 - ramp(t, 0.3, 0.6)) })
        place(lap, { opacity: ramp(t, 0.6, 0.6), y: 30 * (1 - ramp(t, 0.6, 0.6)) })
        path.style.strokeDashoffset = String(-t * 40)
        path.style.opacity = String(ramp(t, c1 - 0.3, 0.6))
        const len = path.getTotalLength()
        tiles.forEach((node, i) => {
          const p = ramp(t, c1 + 0.2 + i * 1.1, 1.6, easeInOut)
          const pt = path.getPointAtLength(len * p)
          node.style.transform = `translate(${pt.x - 100}px, ${pt.y - 70}px) scale(${lerp(0.7, 1, Math.sin(p * Math.PI))})`
          node.style.opacity = String(p > 0 && p < 1 ? 1 : 0)
        })
        const copied = Math.floor(clamp((t - c1 - 1.4) / 1.1, 0, 3))
        screen.innerHTML = TILES.slice(0, copied).map(([n]) => `<span style="color:${MINT}">✓</span> ${n}`).join('<br>')
        rise(note, t, c2 - 0.1)
      }
    },

    why: (root, scene) => {
      const bg = glow(root)
      const chap = chapterLabel(root, 'Copy before you cancel')
      const kick = title(root, 'Save first, then cancel')
      const [c0, c1, c2] = cueTimes(scene)
      const levy = factCard(root, { label: 'Fetch Mini Gen 3 and Mighty Gen 3', value: 'The levy applies from 1 November 2026', x: 120, y: 300, w: 1680, size: 60 })
      const cancelled = factCard(root, { label: 'Cancelled', value: 'The box lists no recordings', tone: 'red', x: 120, y: 560, w: 820, size: 48, icon: ICONS.cross(72) })
      const suspended = factCard(root, { label: 'Suspended', value: 'You cannot copy them', tone: 'red', x: 980, y: 560, w: 820, size: 48, icon: ICONS.cross(72) })
      const order = factCard(root, { label: 'So', value: 'Save first, then cancel', tone: 'mint', x: 120, y: 820, w: 1680, size: 56 })
      return (t) => {
        bg(t, scene.duration)
        chap(t)
        kick(t)
        rise(levy, t, c0 - 0.1)
        rise(cancelled, t, c1 + 0.2)
        rise(suspended, t, c1 + 1.2)
        rise(order, t, c2 + 2.4)
      }
    },

    download: (root, scene) => {
      const bg = glow(root)
      const chap = chapterLabel(root, 'Download the app')
      const kick = title(root, 'Free download')
      const [c0, c1] = cueTimes(scene)
      const net = el(root, 'div', 'layer')
      const box = setTopBox(net, { x: 120, y: 330, w: 340 })
      el(net, 'div', '', '<svg width="1920" height="1080" style="position:absolute;left:0;top:0"><path d="M480 368 H 900" stroke="#5ce1c6" stroke-width="6" stroke-dasharray="14 14" stroke-linecap="round"/></svg>', { position: 'absolute', inset: '0' })
      el(net, 'div', '', 'Same home network', { position: 'absolute', left: '540px', top: '300px', fontSize: '28px', fontWeight: '700', color: MINT })
      const computers = factCard(net, { label: 'Your computer', value: 'A Mac, a Windows PC, or Linux', x: 920, y: 290, w: 880, size: 44 })
      const choices = ['Mac', 'Windows PC', 'Linux'].map((name, i) => card(root, `<div style="font-size:26px;color:${DIM};font-weight:700;letter-spacing:.06em;text-transform:uppercase">Download for</div><div style="font-size:60px;font-weight:800;margin-top:6px">${name}</div>`, { left: `${120 + i * 573}px`, top: '500px', width: '534px', padding: '34px 40px' }))
      const page = card(root, `<div style="font-size:40px;font-weight:800">The download page picks the right file for your computer</div><div class="mono" style="font-size:36px;color:${MINT};margin-top:14px">furey.github.io/freetvarr/guide/leaving-fetch</div>`, { left: '120px', top: '740px', width: '1680px', padding: '34px 44px', borderColor: 'rgba(92,225,198,0.6)' })
      const link = el(root, 'div', '', 'Link in the description', { position: 'absolute', left: '124px', top: '960px', fontSize: '32px', color: TEXT2 })
      return (t) => {
        bg(t, scene.duration)
        chap(t)
        kick(t)
        place(box, { opacity: ramp(t, c0 - 0.2, 0.5) })
        net.style.opacity = String(ramp(t, c0 - 0.2, 0.5))
        rise(computers, t, c0 + 0.6)
        choices.forEach((node, i) => rise(node, t, c1 - 0.1 + i * 0.25, { dy: 40 }))
        rise(page, t, c1 + 1.4)
        rise(link, t, c1 + 2.6)
      }
    },

    warning: (root, scene) => {
      const bg = glow(root)
      const chap = chapterLabel(root, 'The first-open warning')
      const kick = title(root, 'The warning is expected')
      const [c0, c1, c2, c3, c4] = cueTimes(scene)
      const area = { x: 120, y: 290, w: 1080, h: 720 }
      const shots = {
        mac1: illustration(root, 'mac-1-first-open.png', area),
        mac2: illustration(root, 'mac-2-privacy-security.png', area),
        win1: illustration(root, 'win-1-smartscreen.png', area),
        win2: illustration(root, 'win-2-smartscreen-run-anyway.png', area),
        mac4: illustration(root, 'mac-4-local-network.png', { x: 120, y: 290, w: 530, h: 720 }),
        win4: illustration(root, 'win-4-firewall.png', { x: 670, y: 290, w: 530, h: 720 }),
      }
      const why = factCard(root, { label: 'Fetch My Recordings', value: 'Free, open source,<br>and unsigned', x: 1260, y: 290, w: 540, size: 44 })
      const mac = factCard(root, { label: 'Mac', value: 'Done, then<br>Open Anyway', tone: 'mint', x: 1260, y: 540, w: 540, size: 44 })
      const win = factCard(root, { label: 'Windows', value: 'More info, then<br>Run anyway', tone: 'mint', x: 1260, y: 775, w: 540, size: 44 })
      const allow = factCard(root, { label: 'Then', value: 'Allow, so it can<br>find your box', x: 1260, y: 290, w: 540, size: 44 })
      const spans = [
        ['mac1', 0, c2 + 2.0],
        ['mac2', c2 + 2.0, c3],
        ['win1', c3, c3 + 1.3],
        ['win2', c3 + 1.3, c4],
        ['mac4', c4, scene.duration + 1],
        ['win4', c4 + 0.3, scene.duration + 1],
      ]
      return (t) => {
        bg(t, scene.duration)
        chap(t)
        kick(t)
        spans.forEach(([key, start, end]) => {
          const on = window01(t, start === 0 ? c0 - 0.3 : start - 0.2, end + 0.2, 0.35)
          place(shots[key], { opacity: on, scale: lerp(0.97, 1, ramp(t, start - 0.2, 0.5)) })
        })
        const whyOn = Math.min(ramp(t, c1 + 0.8, 0.5), 1 - ramp(t, c4 - 0.3, 0.3))
        place(why, { opacity: whyOn, y: 20 * (1 - ramp(t, c1 + 0.8, 0.5)) })
        rise(mac, t, c2 + 0.3)
        rise(win, t, c3 + 0.2)
        place(allow, { opacity: ramp(t, c4, 0.5), y: 20 * (1 - ramp(t, c4, 0.5)) })
      }
    },

    find: (root, scene) => {
      const bg = glow(root)
      const chap = chapterLabel(root, 'Find your Fetch box')
      const head = sideTitle(root, 'Find your Fetch box')
      const app = appFrame(root, clips)
      const [c0, c1] = cueTimes(scene)
      const router = card(root, `${cardLabel('No box found?')}<div style="font-size:40px;font-weight:800;margin-top:8px;line-height:1.2">Your router lists<br>its address</div>`, { left: '120px', top: '440px', width: '460px', padding: '30px 36px' })
      void c0
      return (t) => {
        bg(t, scene.duration)
        chap(t)
        rise(head, t, 0.15, { dy: 30 })
        const mix = ramp(t, c1 - 0.45, 0.35, (q) => q)
        app.show({ main: mainAt(scene, t), nf: nfAt(scene, t), mix })
        rise(router, t, c1 + 0.6)
      }
    },

    choose: appScene({
      chapter: 'Choose recordings',
      heading: 'Choose recordings',
      setup: (root, scene) => {
        const [c0, c1] = cueTimes(scene)
        const ticked = card(root, `${cardLabel('New recordings')}<div style="font-size:42px;font-weight:800;margin-top:8px">Start ticked</div>`, { left: '120px', top: '440px', width: '460px', padding: '30px 36px' })
        const show = card(root, `${cardLabel('Single episodes')}<div style="font-size:42px;font-weight:800;margin-top:8px">Click <span style="color:${MINT}">Show</span></div>`, { left: '120px', top: '640px', width: '460px', padding: '30px 36px' })
        return (t) => {
          rise(ticked, t, c0 + 0.2)
          rise(show, t, c1 + 0.4)
        }
      },
    }),

    folder: appScene({
      chapter: 'Choose a folder',
      heading: 'Choose a folder',
      setup: (root, scene) => {
        const [c0, c1] = cueTimes(scene)
        const size = card(root, `${cardLabel('1 hour of HD')}<div class="mono" style="font-size:54px;color:${MINT};margin-top:8px">3–6 GB</div>`, { left: '120px', top: '440px', width: '460px', padding: '30px 36px' })
        const names = card(root, `${cardLabel('Media library names')}<div class="mono" style="font-size:24px;line-height:1.7;color:${TEXT2};margin-top:12px;white-space:nowrap">Master Cook/<br>&nbsp;&nbsp;Season 01/<br>&nbsp;&nbsp;&nbsp;&nbsp;<span style="color:#f2f5f7">Master Cook - S01E01.ts</span></div>`, { left: '120px', top: '660px', width: '460px', padding: '30px 36px' })
        return (t) => {
          rise(size, t, c0 + 1.6)
          rise(names, t, c1 + 2.8)
        }
      },
    }),

    save: appScene({
      chapter: 'Save your recordings',
      heading: 'Click Save',
      setup: (root, scene) => {
        const [c0, c1, c2] = cueTimes(scene)
        const awake = card(root, `${cardLabel('While it saves')}<div style="font-size:40px;font-weight:800;margin-top:8px;line-height:1.2">Your computer<br>stays awake</div>`, { left: '120px', top: '400px', width: '460px', padding: '30px 36px' })
        const again = card(root, `${cardLabel('Stopped part way?')}<div style="font-size:40px;font-weight:800;margin-top:8px">Click <span style="color:${MINT}">Save again</span></div>`, { left: '120px', top: '640px', width: '460px', padding: '30px 36px' })
        const button = ring(root, { x: 1207, y: 1082, w: 201, h: 77 })
        void c1
        return (t) => {
          rise(awake, t, c0 + 1.2)
          rise(again, t, c2 + 0.6)
          const on = window01(t, c2 + 1.4, scene.duration + 0.3, 0.3)
          place(button, { opacity: on, scale: lerp(1.08, 1, ramp(t, c2 + 1.4, 0.5, easeOutBack)) })
        }
      },
    }),

    files: appScene({
      chapter: 'Your files',
      heading: 'Your files',
      setup: (root, scene) => {
        const [c0, c1] = cueTimes(scene)
        const watch = card(root, `${cardLabel('How to watch')}<div style="font-size:36px;font-weight:800;margin-top:12px;line-height:1.5">On this computer<br>On your TV<br>Record free-to-air</div>`, { left: '120px', top: '400px', width: '460px', padding: '30px 36px' })
        void c0
        return (t) => {
          rise(watch, t, c1 + 1.2)
        }
      },
    }),

    cancel: (root, scene) => {
      const bg = glow(root)
      const chap = chapterLabel(root, 'Cancel Fetch')
      const kick = title(root, 'Packages, Cancel Service')
      const [c0, c1, c2, c3] = cueTimes(scene)
      const safe = factCard(root, { value: 'Cancel only once your recordings are safe', tone: 'red', x: 120, y: 290, w: 1680, size: 60 })
      const after = el(root, 'div', '', 'After you cancel, the box:', { position: 'absolute', left: '124px', top: '500px', fontSize: '38px', fontWeight: '700', color: TEXT2 })
      const facts = [
        ['On the TV', 'Restarts at Fetch’s setup screen', ''],
        ['To set it up again', 'Asks for an activation code', 'This needs an active Fetch account'],
        ['On the network', 'Lists no recordings', ''],
      ].map(([k, v, note], i) => card(root, `<div style="font-size:24px;color:${DIM};font-weight:700;letter-spacing:.06em;text-transform:uppercase">${k}</div><div style="font-size:40px;font-weight:800;margin-top:8px;line-height:1.2;text-wrap:balance">${v}</div>${note ? `<div style="font-size:28px;color:${TEXT2};margin-top:10px;text-wrap:balance">${note}</div>` : ''}`, { left: `${120 + i * 573}px`, top: '580px', width: '534px', minHeight: '250px', padding: '32px 38px' }))
      const signin = card(root, `
        <div style="font-size:30px;color:#8d9aa7;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Fetch account management</div>
        <div style="font-size:56px;font-weight:800;margin:10px 0 30px">Sign in</div>
        <div style="font-size:26px;color:#a9b4be;margin-bottom:10px">Username</div>
        <div class="mono" style="padding:18px 24px;border-radius:12px;background:#070b0f;border:2px solid rgba(92,225,198,0.6);font-size:32px">you@example.com</div>
        <div style="font-size:26px;color:#a9b4be;margin:26px 0 10px">Password</div>
        <div class="mono" style="padding:18px 24px;border-radius:12px;background:#070b0f;border:2px solid rgba(255,255,255,0.12);font-size:32px">••••••••••</div>`, { left: '120px', top: '290px', width: '760px', padding: '40px 48px' })
      const steps = ['Packages', 'Cancel Service', 'Yes, cancel my service'].map((s, i) => card(root, `<div style="display:flex;align-items:center;gap:28px"><div style="width:64px;height:64px;border-radius:50%;background:#26323e;display:grid;place-items:center;font-size:32px;font-weight:800">${i + 1}</div><div style="font-size:48px;font-weight:800">${s}</div></div>`, { left: '960px', top: `${330 + i * 170}px`, width: '840px', padding: '28px 40px' }))
      return (t) => {
        bg(t, scene.duration)
        chap(t)
        kick(t)
        const firstOut = 1 - ramp(t, c2 - 0.45, 0.35)
        place(safe, { opacity: Math.min(ramp(t, c0 - 0.2, 0.5), firstOut), scale: lerp(0.95, 1, ramp(t, c0 - 0.2, 0.6, easeOutBack)) })
        place(after, { opacity: Math.min(ramp(t, c1 - 0.1, 0.5), firstOut) })
        const at = [c1 + 1.6, c1 + 3.6, c1 + 7.0]
        facts.forEach((node, i) => place(node, { opacity: Math.min(ramp(t, at[i], 0.45), firstOut), y: 24 * (1 - ramp(t, at[i], 0.45)) }))
        rise(signin, t, c2 - 0.1)
        steps.forEach((node, i) => {
          const start = c3 + i * 1.0
          const on = ramp(t, start, 0.4)
          place(node, { opacity: on, x: -30 * (1 - on) })
          const lit = t >= start + 0.2 && t < start + 1.2 + (i === 2 ? 3 : 0)
          node.style.borderColor = lit ? (i === 2 ? 'rgba(255,77,79,0.7)' : 'rgba(92,225,198,0.7)') : 'rgba(255,255,255,0.08)'
        })
      }
    },

    end: (root, scene) => {
      const bg = glow(root)
      const [c0, c1] = cueTimes(scene)
      const term = el(root, 'div', 'layer')
      el(term, 'div', 'chapter', 'Prefer the terminal?', { left: '120px', top: '70px' })
      const tTitle = el(term, 'div', 'headline', 'fetchtv on the command line', { position: 'absolute', left: '120px', top: '118px', fontSize: '76px' })
      const box = card(term, `<div class="mono" style="font-size:52px"><span style="color:${MINT}">$</span> npx fetchtv@latest</div>`, { left: '120px', top: '330px', width: '1680px', padding: '44px 48px', background: '#070b0f' })
      const page = factCard(term, { label: 'Commands', value: '<span class="mono" style="font-weight:500">github.com/furey/fetchtv</span>', x: 120, y: 560, w: 1680, size: 50 })
      const rest = el(root, 'div', 'layer')
      const show = endCard(rest, {
        links: [['Fetch My Recordings', 'github.com/furey/fetch-my-recordings', true], ['Leaving Fetch guide', 'furey.github.io/freetvarr/guide/leaving-fetch', true]],
        next: 'Install Freetvarr and run setup',
      })
      return (t) => {
        bg(t, scene.duration)
        const termOn = 1 - ramp(t, c1 - 0.4, 0.4)
        term.style.opacity = String(termOn)
        rise(tTitle, t, c0 - 0.3, { dy: 30 })
        rise(box, t, c0 + 0.3)
        rise(page, t, c0 + 2.0)
        rest.style.opacity = String(ramp(t, c1 - 0.1, 0.4))
        show(Math.max(0, t - (c1 - 0.2)), 0.3)
        fadeTail(root, t, scene.duration, 1.2)
      }
    },
  }
}
