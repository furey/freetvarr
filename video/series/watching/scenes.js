import { kit, clamp, lerp, ramp, easeInOut, easeOutBack, el, place, rise, window01, footage, ICONS, MINT, TEXT2, fadeTail } from '../stage/lib.js'

const URL = 'freetvarr.lan'
const POSTERS = [['Big Wave Season', 'hd/surf-a.jpg'], ['Kitchen Heat', 'hd/1666.jpg'], ['Mountain Rangers', 'hd/4115.jpg'], ['Wild Neighbours', 'hd/4276.jpg'], ['Road Trip Rules', 'hd/4368.jpg'], ['The Weekend Garden', 'hd/1891.jpg']]

export const buildScenes = (deps) => {
  const { clips } = deps
  const { piecewise, chapterLabel, title, appWindow, kicker, glow, card, factCard, endCard, cueTimes } = kit(deps)

  const appScene = (root, scene, { chapter, clip, url }) => {
    const bg = glow(root)
    const chap = chapterLabel(root, chapter, { x: 272, y: 52 })
    const app = appWindow(root, { x: 272, y: 130, w: 1376, url: `${URL}/${url}`, clip })
    const tick = (t) => {
      bg(t, scene.duration)
      chap(t)
      place(app.win, { opacity: ramp(t, 0, 0.5), scale: lerp(0.97, 1, ramp(t, 0, 0.6)) })
    }
    return { app, tick }
  }

  const phone = (root, { x, y, w = 380 }) => {
    const h = Math.round(w * 2.165)
    const frame = el(root, 'div', '', '', { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, borderRadius: '56px', border: '14px solid #26323e', background: '#000', overflow: 'hidden' })
    const img = el(frame, 'img', '', '', { width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' })
    return { frame, img, show: (s, c) => footage(img, clips, c, s) }
  }

  const tvSet = (root, { x = 360, y = 170, w = 1200 } = {}) => {
    const h = Math.round(w * 0.5625)
    const layer = el(root, 'div', 'layer')
    const screen = el(layer, 'div', '', '', { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, borderRadius: '18px', background: '#000', border: '14px solid #1c2630', overflow: 'hidden' })
    el(layer, 'div', '', '', { position: 'absolute', left: `${x + w / 2 - 60}px`, top: `${y + h + 14}px`, width: '120px', height: '46px', background: '#1c2630' })
    el(layer, 'div', '', '', { position: 'absolute', left: `${x + w / 2 - 200}px`, top: `${y + h + 58}px`, width: '400px', height: '14px', borderRadius: '7px', background: '#26323e' })
    return { layer, screen }
  }

  return {
    open: (root, scene) => {
      const bg = glow(root)
      const [c0, c1] = cueTimes(scene)
      const head = title(root, 'Watch on the TV', { size: 84 })
      const tile = el(root, 'div', '', `<img src="media/hd/surf-a.jpg" style="width:300px;height:169px;object-fit:cover;border-radius:14px;display:block;border:2px solid rgba(255,255,255,0.2)"><div style="font-size:26px;font-weight:700;margin-top:8px">Big Wave Season · S3 E1</div>`, { position: 'absolute', left: '0', top: '0' })
      const folder = card(root, `<div style="color:${MINT}">${ICONS.folder(130)}</div><div style="font-size:34px;font-weight:800;margin-top:8px">Media library</div><div class="mono" style="font-size:22px;color:${TEXT2};margin-top:6px">tv/Big Wave Season/Season 03</div>`, { left: '220px', top: '470px', width: '520px', textAlign: 'center' })
      const tv = tvSet(root, { x: 900, y: 300, w: 900 })
      const grid = el(tv.screen, 'div', '', '', { position: 'absolute', inset: '0', background: '#10161d', padding: '30px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '18px' })
      POSTERS.forEach(([n, src]) => el(grid, 'div', '', `<img src="media/${src}" style="width:100%;height:150px;object-fit:cover;border-radius:10px;display:block"><div style="font-size:20px;font-weight:700;margin-top:6px">${n}</div>`))
      return (t) => {
        bg(t, scene.duration)
        head(t, 0.2)
        rise(folder, t, c0 - 0.2)
        const p = ramp(t, c0 + 0.6, 1.4, easeInOut)
        place(tile, { x: 330, y: lerp(150, 430, p), scale: lerp(1, 0.4, p), opacity: ramp(t, c0, 0.3) * (1 - ramp(t, c0 + 1.9, 0.3)) })
        place(tv.layer, { opacity: ramp(t, c1 - 0.3, 0.5), y: 30 * (1 - ramp(t, c1 - 0.3, 0.6)) })
        grid.style.opacity = String(ramp(t, c1 + 0.4, 0.5))
      }
    },

    tv: (root, scene) => {
      const bg = glow(root)
      const chap = chapterLabel(root, 'Recordings on the TV')
      const [c0, c1, c2] = cueTimes(scene)
      const tv = tvSet(root, { x: 360, y: 150, w: 1200 })
      const lib = el(tv.screen, 'div', 'layer', '', { background: '#10161d', padding: '40px 46px' })
      el(lib, 'div', '', 'TV shows', { fontSize: '40px', fontWeight: '800', marginBottom: '24px' })
      const grid = el(lib, 'div', '', '', { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '22px 24px' })
      const tiles = POSTERS.map(([n, src]) => el(grid, 'div', '', `<img src="media/${src}" style="display:block;width:100%;height:170px;border-radius:12px;object-fit:cover"><div style="font-size:24px;font-weight:700;margin-top:10px">${n}</div>`))
      const play = el(tv.screen, 'div', 'layer', '', { background: '#000' })
      const playImg = el(play, 'img', '', '', { width: '100%', height: '100%', objectFit: 'cover' })
      const controls = el(play, 'div', '', '', { position: 'absolute', left: '0', right: '0', bottom: '0', height: '190px', background: 'linear-gradient(transparent, rgba(0,0,0,0.85))' })
      el(controls, 'div', '', 'Big Wave Season · S3 E1', { position: 'absolute', left: '44px', bottom: '118px', fontSize: '30px', fontWeight: '700' })
      const track = el(controls, 'div', '', '', { position: 'absolute', left: '44px', right: '44px', bottom: '96px', height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.25)' })
      const fill = el(track, 'div', '', '', { height: '100%', borderRadius: '4px', background: '#f2f5f7', width: '30%' })
      const btns = el(controls, 'div', '', '', { position: 'absolute', left: '0', right: '0', bottom: '18px', display: 'flex', justifyContent: 'center', gap: '60px', color: '#f2f5f7' })
      const bBack = el(btns, 'div', '', ICONS.back(64))
      const bPause = el(btns, 'div', '', ICONS.pause(64))
      const bFwd = el(btns, 'div', '', ICONS.forward(64))
      const caption = el(root, 'div', 'subline', 'A media player app on your TV (e.g. Plex or Infuse)', { position: 'absolute', top: '940px', width: '100%', textAlign: 'center', color: '#f2f5f7' })
      const file = factCard(root, { label: 'Each file', value: '<span class="mono" style="font-size:30px">Big Wave Season/Season 03/<br>Big Wave Season - <span style="color:#5ce1c6">S03E01</span>.ts</span>', tone: 'mint', x: 1080, y: 560, w: 760, size: 30 })
      let now = 0
      const press = (node, at) => {
        const p = clamp((now - at) / 0.4)
        node.style.transform = `scale(${p > 0 && p < 1 ? 1 + 0.25 * Math.sin(p * Math.PI) : 1})`
        node.style.color = p > 0 && p < 1 ? MINT : '#f2f5f7'
      }
      return (t) => {
        now = t
        bg(t, scene.duration)
        chap(t)
        tiles.forEach((tile, i) => rise(tile, t, 0.3 + i * 0.1, { dy: 24 }))
        tiles[0].firstChild.style.outline = t > c1 - 0.5 ? '5px solid #f2f5f7' : ''
        place(file, { opacity: window01(t, c1, c2 - 0.1), y: 20 * (1 - ramp(t, c1, 0.5)) })
        const opened = ramp(t, c2 - 0.1, 0.5)
        place(play, { opacity: opened, scale: lerp(0.9, 1, opened) })
        const local = Math.max(0, t - c2)
        footage(playImg, clips, 'surf', local > 2.2 && local < 2.6 ? 2.2 : local > 2.6 ? local - 0.4 : local)
        fill.style.width = `${30 + local * 0.6 - (local > 1.2 ? 3 : 0) + (local > 2.8 ? 8 : 0)}%`
        press(bBack, c2 + 1.0)
        press(bPause, c2 + 2.0)
        bPause.innerHTML = local > 2.2 && local < 2.6 ? ICONS.play(64) : ICONS.pause(64)
        press(bFwd, c2 + 2.8)
        rise(caption, t, c0 + 0.5)
      }
    },

    'tv-apps': (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'Live TV on the TV', clip: 'wtvapps', url: '#/settings/tv-apps' })
      const [c0, c1, c2, c3, c4] = cueTimes(scene)
      const k = [
        kicker(root, { label: 'Live TV and the 7-day guide on the TV', text: 'A TV app, such as Jellyfin or Kodi' }),
        kicker(root, { label: 'Settings → Watching → Watch on TV', text: 'Make a TV login', tone: 'is-mint' }),
        kicker(root, { label: 'TV login', text: 'Can only watch. No recording, no settings.' }),
        kicker(root, { label: 'Addresses', text: 'Copy each one into the TV app', tone: 'is-mint' }),
        kicker(root, { label: 'Kodi', text: 'Also shows Australian captions' }),
      ]
      const map = piecewise([[0, 0.3], [c1 - 0.2, 1.6], [c1 + 2.5, 6.0], [c2 - 0.2, 6.5], [c3 - 0.2, 10.2], [c4 - 0.2, 14.5], [scene.duration, 17.3]])
      return (t) => {
        tick(t)
        app.show(map(t))
        const ends = [c1, c2, c3, c4, scene.duration]
        ;[c0, c1, c2, c3, c4].forEach((c, i) => k[i](t, c + 0.1, ends[i] - 0.1))
      }
    },

    live: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'Live TV in the browser', clip: 'wlive', url: '#/live' })
      const [c0, c1, c2] = cueTimes(scene)
      const k = [
        kicker(root, { label: 'Live TV', text: 'Press a channel' }),
        kicker(root, { label: 'In the browser', text: 'No app to install', tone: 'is-mint' }),
        kicker(root, { label: 'Each row', text: 'On now, and on next' }),
      ]
      const map = piecewise([[0, 0.3], [c1 - 0.6, 5.9], [c1 - 0.59, 10.7], [c2 - 0.3, 10.7 + (c2 - c1 + 0.3)], [c2 - 0.29, 1.0], [scene.duration, 4.4]])
      return (t) => {
        tick(t)
        app.show(map(t))
        k[0](t, c0 + 0.1, c1 - 0.1)
        k[1](t, c1 + 0.1, c2 - 0.1)
        k[2](t, c2 + 0.1, scene.duration)
      }
    },

    rewind: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'Pause and rewind', clip: 'wrewind', url: '#/live' })
      const [c0, c1, c2, c3, c4] = cueTimes(scene)
      const k = [
        kicker(root, { label: 'Pause and rewind', text: 'Up to 30 minutes back' }),
        kicker(root, { label: 'Start over', text: 'From the first minute, while TVHeadend records it', tone: 'is-mint' }),
        kicker(root, { label: 'Go live', text: 'Back to now' }),
        kicker(root, { label: 'Double-tap', text: 'Left or right side skips 10 seconds' }),
        kicker(root, { label: 'Captions', text: '⋯ menu, then Captions' }),
      ]
      const taps = ['−10 s', '+10 s'].map((txt, i) => el(root, 'div', '', `<div style="width:170px;height:170px;border-radius:50%;background:rgba(255,255,255,0.18);border:3px solid rgba(255,255,255,0.6);display:grid;place-items:center;font-size:40px;font-weight:800">${txt}</div>`, { position: 'absolute', left: `${i ? 1330 : 420}px`, top: '470px' }))
      const map = piecewise([[0, 0.9], [c1 - 0.2, 8.6], [c1 + 0.4, 10.4], [c1 + 2.6, 13.5], [c1 + 2.61, 17.6], [c2 + 0.6, 18.9]])
      return (t) => {
        tick(t)
        if (t < c2 + 0.6) app.show(map(t))
        else app.show(Math.min(16.5, 10.9 + (t - c2 - 0.6)), 'wlive')
        taps.forEach((tp, i) => {
          const at = c3 + 0.6 + i * 1.3
          const p = ramp(t, at, 0.25) * (1 - ramp(t, at + 0.6, 0.3))
          place(tp, { opacity: p, scale: lerp(0.8, 1, p) })
        })
        const ends = [c1, c2, c3, c4, scene.duration]
        ;[c0, c1, c2, c3, c4].forEach((c, i) => k[i](t, c + 0.1, ends[i] - 0.1))
      }
    },

    mini: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'Miniplayer', clip: 'wmini', url: '#/live' })
      const [c0, c1] = cueTimes(scene)
      const k = [
        kicker(root, { label: 'Miniplayer', text: 'Keep browsing while you watch', tone: 'is-mint' }),
        kicker(root, { label: 'Phone: above the tab bar', text: 'Computer: a card in a corner' }),
      ]
      const shade = el(root, 'div', 'layer', '', { background: 'rgba(11,17,23,0.7)' })
      const ph = phone(root, { x: 760, y: 110, w: 390 })
      const map = piecewise([[0, 0.5], [c1 - 0.2, 9.0], [scene.duration, 13.2]])
      return (t) => {
        tick(t)
        app.setUrl(map(t) > 7 ? `${URL}/#/guide` : `${URL}/#/live`)
        app.show(map(t))
        const p = window01(t, c1 - 0.2, c1 + 2.8)
        shade.style.opacity = String(p)
        place(ph.frame, { opacity: p, y: 40 * (1 - ramp(t, c1 - 0.2, 0.6)) })
        ph.show(Math.min(5.6, 0.8 + Math.max(0, t - c1) * 1.2), 'wphonemini')
        k[0](t, c0 + 0.1, c1 - 0.1)
        k[1](t, c1 + 0.1, scene.duration)
      }
    },

    multiview: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'Multiview', clip: 'wmulti', url: '#/live' })
      const [c0, c1, c2] = cueTimes(scene)
      const k = [
        kicker(root, { label: 'Multiview', text: 'Up to four channels, two on a phone' }),
        kicker(root, { label: 'Pick a channel', text: 'Each one says if it needs a free tuner', tone: 'is-mint' }),
        kicker(root, { label: 'Recordings come first', text: 'A recording can take a tuner from live TV', tone: 'is-red' }),
      ]
      const map = piecewise([[0, 0.5], [c1 - 0.2, 4.5], [c2 - 0.2, 7.0], [c2 - 0.19, 16.0], [scene.duration, 16.0 + (scene.duration - c2)]])
      return (t) => {
        tick(t)
        app.show(map(t))
        k[0](t, c0 + 0.1, c1 - 0.1)
        k[1](t, c1 + 0.1, c2 - 0.1)
        k[2](t, c2 + 0.1, scene.duration)
      }
    },

    playback: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'Recordings in the browser', clip: 'wplay', url: '#/recordings/show/big-wave-season' })
      const [c0, c1, c2] = cueTimes(scene)
      const k = [
        kicker(root, { label: 'Same player', text: 'Resume where you stopped', tone: 'is-mint' }),
        kicker(root, { label: 'Safari', text: 'AirPlay sends it to an Apple TV' }),
        kicker(root, { label: 'Ad breaks found?', text: 'A Skip ad button in each one' }),
      ]
      const map = piecewise([[0, 0.5], [c0 + 1.6, 2.4], [c0 + 1.61, 4.9], [c2 - 0.2, 12.6], [c2 + 1.0, 13.2], [scene.duration, 13.25]])
      return (t) => {
        tick(t)
        app.show(map(t))
        const z = ramp(t, c2 + 1.2, 0.9, easeInOut)
        app.img.style.transformOrigin = '96% 92%'
        app.img.style.transform = `scale(${lerp(1, 1.8, z)})`
        k[0](t, c0 + 0.1, c1 - 0.1)
        k[1](t, c1 + 0.1, c2 - 0.1)
        k[2](t, c2 + 0.1, scene.duration)
      }
    },

    'home-screen': (root, scene) => {
      const bg = glow(root)
      const chap = chapterLabel(root, 'Save it as an app')
      const head = title(root, 'Add to Home Screen')
      const [c0, c1, c2] = cueTimes(scene)
      const ph = phone(root, { x: 1180, y: 110, w: 410 })
      const note = el(root, 'div', 'subline', 'Opens full screen from its own icon, like an app.', { position: 'absolute', left: '124px', top: '240px', width: '900px' })
      const home = el(ph.frame, 'div', 'layer', '', { background: 'linear-gradient(160deg,#1c2630,#0b1117)', padding: '80px 26px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '34px 14px', alignContent: 'start' })
      const icons = Array.from({ length: 11 }, () => el(home, 'div', '', '<div style="width:70px;height:70px;border-radius:18px;background:#26323e;margin:auto"></div>'))
      const ftv = el(home, 'div', '', `<img src="assets/icon-512.png" style="width:70px;height:70px;border-radius:18px;display:block;margin:auto"><div style="font-size:16px;text-align:center;margin-top:6px;font-weight:600">Freetvarr</div>`)
      const ring = el(root, 'div', '', '', { position: 'absolute', width: '70px', height: '70px', borderRadius: '50%', border: '4px solid #5ce1c6', left: '1499px', top: '409px', opacity: '0', width: '90px', height: '90px' })
      const endLayer = el(root, 'div', 'layer', '', { background: '#0b1117' })
      const showEnd = endCard(endLayer, {
        links: [['Live TV', 'furey.github.io/freetvarr/guide/live-tv', true], ['Player and Multiview', 'furey.github.io/freetvarr/guide/player']],
        next: 'Your recordings library',
      })
      void icons
      return (t) => {
        bg(t, scene.duration)
        chap(t)
        head(t, 0.15)
        rise(note, t, c1)
        place(ph.frame, { opacity: ramp(t, c0 - 0.3, 0.5), y: 30 * (1 - ramp(t, c0 - 0.3, 0.6)) })
        const added = ramp(t, c0 + 1.6, 0.6, easeOutBack)
        place(ftv, { opacity: clamp(added), scale: lerp(0.5, 1, clamp(added)) })
        const tap = ramp(t, c1 + 0.4, 0.3) * (1 - ramp(t, c1 + 0.8, 0.3))
        ring.style.opacity = String(tap)
        const open = ramp(t, c1 + 0.9, 0.5)
        home.style.opacity = String(1 - open)
        ph.img.style.opacity = String(open)
        ph.show(1 + Math.max(0, t - c1 - 0.9), 'whomephone')
        endLayer.style.opacity = String(ramp(t, c2 - 0.4, 0.5))
        if (t >= c2 - 0.4) showEnd(t - (c2 - 0.4), 0.2)
        fadeTail(root, t, scene.duration, 1.2)
      }
    },
  }
}
