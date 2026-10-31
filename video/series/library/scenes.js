import { kit, clamp, lerp, ramp, easeInOut, easeOutBack, el, place, rise, window01, ICONS, MINT, DIM, TEXT2, fadeTail } from '../stage/lib.js'

const URL = 'freetvarr.lan'
const IMG = { kh: 'media/hd/1666.jpg', reef: 'media/hd/4092.jpg', bws: 'media/hd/surf-a.jpg' }

export const buildScenes = (deps) => {
  const { piecewise, chapterLabel, title, appWindow, kicker, glow, card, factCard, tree, endCard, cueTimes } = kit(deps)

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

  const graphicScene = (root, scene, chapter, kick) => {
    const bg = glow(root)
    const chap = chapterLabel(root, chapter)
    const head = title(root, kick)
    return (t) => { bg(t, scene.duration); chap(t); head(t) }
  }

  return {
    open: (root, scene) => {
      const tick = graphicScene(root, scene, 'Recordings library', 'Filed for you')
      const [c0, c1] = cueTimes(scene)
      const t1 = tree(root, [
        [0, 'dir', 'media'],
        [1, 'dir', 'tv'],
        [2, 'dir', 'Kitchen Heat'],
        [3, 'dir', 'Season 05'],
        [4, 'file', '<span class="nm">Kitchen Heat - S05E03.ts</span>'],
      ], { x: 120, y: 300, w: 1100, size: 34 })
      const nm = t1.node.querySelector('.nm')
      const from = factCard(root, { label: 'From TVHeadend', value: '<span class="mono" style="font-size:34px">Kitchen Heat 2026-10-30 2030.ts</span>', x: 1260, y: 300, w: 540, size: 34 })
      const to = factCard(root, { label: 'Renamed', value: '<span class="mono" style="font-size:34px">S05E03</span><div style="font-size:26px;color:#a9b4be;font-weight:600;margin-top:8px">Season and episode, so players can match it</div>', tone: 'mint', x: 1260, y: 560, w: 540, size: 34 })
      return (t) => {
        tick(t)
        place(t1.node, { opacity: ramp(t, c0 - 0.4, 0.5) })
        t1.rows.forEach((r, i) => { r.style.opacity = String(ramp(t, c0 + i * 0.5, 0.4)) })
        const renamed = t >= c1 + 1.6
        nm.textContent = renamed ? 'Kitchen Heat - S05E03.ts' : 'Kitchen Heat 2026-10-30 2030.ts'
        nm.style.color = renamed ? MINT : '#f2f5f7'
        rise(from, t, c1 - 0.2)
        rise(to, t, c1 + 1.4)
      }
    },

    library: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'The library', clip: 'llib', url: '#/recordings' })
      const [c0, c1, c2] = cueTimes(scene)
      const k = [
        kicker(root, { label: 'Recordings', text: 'Then Library. A poster for each show.' }),
        kicker(root, { label: 'Shelves', text: 'Shows, movies, specials and one-offs' }),
        kicker(root, { label: 'Badges', text: 'Number: not started. REC: recording now.', tone: 'is-red' }),
      ]
      const map = piecewise([[0, 0.3], [c1 - 0.2, 2.6], [c2 - 0.2, 7.2], [scene.duration, 11.4]])
      return (t) => {
        tick(t)
        app.show(map(t))
        k[0](t, c0 + 0.3, c1 - 0.1)
        k[1](t, c1 + 0.1, c2 - 0.1)
        k[2](t, c2 + 0.1, scene.duration)
      }
    },

    show: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'Show pages', clip: 'llib', url: '#/recordings' })
      const [c0, c1, c2, c3] = cueTimes(scene)
      const k = [
        kicker(root, { label: 'Resume', text: 'Plays the next episode you have not watched', tone: 'is-mint' }),
        kicker(root, { label: 'Status line', text: 'What records next, and on which channel' }),
        kicker(root, { label: 'Episodes', text: 'A row each, with a bar for what you watched' }),
      ]
      const map = piecewise([[0, 11.5], [c1 - 0.2, 14.6], [c3 - 0.2, 16.0], [scene.duration, 20.6]])
      return (t) => {
        tick(t)
        app.setUrl(map(t) < 12.6 ? `${URL}/#/recordings` : `${URL}/#/recordings/show/big-wave-season`)
        app.show(map(t))
        k[0](t, c1 + 0.1, c2 - 0.1)
        k[1](t, c2 + 0.1, c3 - 0.1)
        k[2](t, c3 + 0.1, scene.duration)
        void c0
      }
    },

    menu: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'Episode menus', clip: 'lmenu', url: '#/recordings/show/big-wave-season' })
      const [c0, c1] = cueTimes(scene)
      const k = [
        kicker(root, { label: 'Three dots', text: 'Or hold the row on a touch screen' }),
        kicker(root, { label: 'Episode menu', text: 'Mark as watched, Episode info, Delete' }),
      ]
      const map = piecewise([[0, 1.0], [c1 - 0.2, 5.0], [scene.duration, 9.3]])
      return (t) => {
        tick(t)
        app.show(map(t))
        k[0](t, c0 + 0.3, c1 - 0.1)
        k[1](t, c1 + 0.1, scene.duration)
      }
    },

    options: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'Recording options', clip: 'lopts', url: '#/recordings/show/big-wave-season' })
      const [c0, c1, c2, c3] = cueTimes(scene)
      const k = [
        kicker(root, { label: 'Recording options', text: 'The series recording of this show' }),
        kicker(root, { label: 'Options', text: 'Channels, keep, start early, finish late' }),
        kicker(root, { label: 'Pause recording', text: 'No new episodes. Recorded ones still filed.' }),
        kicker(root, { label: 'No Save button', text: 'Each change saves by itself', tone: 'is-mint' }),
      ]
      const map = piecewise([[0, 0.5], [c1, 4.2], [c2, 6.4], [c3 - 0.2, 9.6], [scene.duration, 11.5]])
      return (t) => {
        tick(t)
        app.show(map(t))
        k[0](t, c0 + 0.3, c1 - 0.1)
        k[1](t, c1 + 0.1, c2 - 0.1)
        k[2](t, c2 + 0.1, c3 - 0.1)
        k[3](t, c3 + 0.1, scene.duration)
      }
    },

    delete: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'Delete', clip: 'lmenu', url: '#/recordings/show/big-wave-season' })
      const [c0, c1, c2, c3] = cueTimes(scene)
      const k = [
        kicker(root, { label: 'Delete', text: 'From your library and from TVHeadend', tone: 'is-red' }),
        kicker(root, { label: 'Before anything changes', text: 'What gets deleted, and what stays' }),
        kicker(root, { label: 'No undo', text: 'The series keeps recording new episodes' }),
        kicker(root, { label: 'TVHeadend', text: 'Keeps a note, so it does not record it again', tone: 'is-mint' }),
      ]
      const map = piecewise([[0, 9.3], [c1 - 0.2, 13.0], [scene.duration, 17.3]])
      return (t) => {
        tick(t)
        app.show(map(t))
        const z = ramp(t, c1, 0.9, easeInOut)
        app.img.style.transformOrigin = '50% 58%'
        app.img.style.transform = `scale(${lerp(1, 1.35, z)})`
        k[0](t, c0 + 0.3, c1 - 0.1)
        k[1](t, c1 + 0.1, c2 - 0.1)
        k[2](t, c2 + 0.1, c3 - 0.1)
        k[3](t, c3 + 0.1, scene.duration)
      }
    },

    plex: (root, scene) => {
      const tick = graphicScene(root, scene, 'Plex', 'Plex kept up to date')
      const [c0, c1, c2] = cueTimes(scene)
      const ftv = card(root, `<span class="wordmark" style="font-size:54px"><span class="free">Free</span><span class="tv">tv</span><span class="arr">arr</span></span><div style="font-size:26px;color:${TEXT2};margin-top:10px">Files each new recording</div>`, { left: '120px', top: '400px', width: '520px', textAlign: 'center', padding: '44px 30px' })
      const lib = card(root, `<div style="color:${MINT}">${ICONS.folder(110)}</div><div style="font-size:36px;font-weight:800;margin-top:10px">Media library</div>`, { left: '760px', top: '370px', width: '400px', textAlign: 'center', padding: '40px 30px' })
      const plex = card(root, `<div class="ic" style="color:${TEXT2}">${ICONS.computer(110)}</div><div style="font-size:36px;font-weight:800;margin-top:10px">Plex</div><div class="scan" style="font-size:26px;color:${MINT};margin-top:8px;opacity:0">Scanning…</div>`, { left: '1280px', top: '370px', width: '520px', textAlign: 'center', padding: '40px 30px' })
      const tile = el(root, 'div', '', `<img src="${IMG.kh}" style="width:220px;height:124px;object-fit:cover;border-radius:12px;border:2px solid rgba(255,255,255,0.2);display:block"><div style="font-size:22px;font-weight:700;margin-top:6px">Kitchen Heat · S5 E3</div>`, { position: 'absolute', left: '0', top: '0' })
      const watched = (x) => el(root, 'div', '', `<div style="display:flex;gap:16px;align-items:center;font-size:32px;font-weight:700"><span style="color:${MINT}">${ICONS.check(48)}</span>Watched · resume point</div>`, { position: 'absolute', left: `${x}px`, top: '720px' })
      const w1 = watched(130)
      const w2 = watched(1300)
      const sync = el(root, 'div', '', '⇄', { position: 'absolute', left: '920px', top: '700px', fontSize: '80px', color: MINT })
      return (t) => {
        tick(t)
        ;[ftv, lib, plex].forEach((n, i) => rise(n, t, c0 - 0.4 + i * 0.3))
        const p = ramp(t, c0 + 1.2, 1.6, easeInOut)
        place(tile, { x: lerp(260, 850, p), y: lerp(260, 250, p) - 120 * Math.sin(p * Math.PI) * 0.3, opacity: ramp(t, c0 + 0.9, 0.3) * (1 - ramp(t, c0 + 2.9, 0.4)) })
        const scanning = window01(t, c0 + 3.0, c0 + 5.8)
        plex.querySelector('.scan').style.opacity = String(scanning)
        plex.style.borderColor = scanning > 0.5 ? 'rgba(92,225,198,0.7)' : 'rgba(255,255,255,0.08)'
        rise(w1, t, c1)
        rise(sync, t, c1 + 0.6)
        rise(w2, t, c2)
      }
    },

    'whole-library': (root, scene) => {
      const tick = graphicScene(root, scene, 'Your whole Plex library', 'Everything in one place')
      const [c0, c1, c2, c3] = cueTimes(scene)
      const page = card(root, `<div style="display:flex;gap:30px;align-items:center"><img src="${IMG.reef}" style="width:260px;height:146px;object-fit:cover;border-radius:14px"><div><div style="font-size:54px;font-weight:800">Reef Diaries</div><div style="font-size:26px;color:${TEXT2};margin-top:6px">Southern · Season 1</div></div></div>
        <div class="rows" style="margin-top:28px"></div>`, { left: '120px', top: '280px', width: '1180px', padding: '34px 40px' })
      const rows = page.querySelector('.rows')
      const ep = (n, src, mint) => el(rows, 'div', '', `<div style="display:flex;align-items:center;gap:24px;padding:14px 0;border-top:1px solid rgba(255,255,255,0.08)"><div style="width:120px;height:68px;border-radius:10px;background:url(${IMG.reef}) center/cover"></div><div style="flex:1;font-size:30px;font-weight:700">E${n} · Episode ${n}</div><div style="font-size:24px;font-weight:700;padding:6px 16px;border-radius:10px;${mint ? 'background:rgba(92,225,198,0.14);color:#5ce1c6' : 'background:#26323e;color:#a9b4be'}">${src}</div></div>`)
      const list = [ep(12, 'Recorded', true), ep(11, 'Recorded', true), ep(4, 'Copied in, from Plex'), ep(3, 'Copied in, from Plex'), ep(2, 'Copied in, from Plex')]
      const keep = factCard(root, { label: 'Your files', value: 'Not imported, renamed, or moved', x: 1340, y: 280, w: 460, size: 40 })
      const off = factCard(root, { label: 'To turn it off', value: 'Settings → Recording → Plex', tone: 'mint', x: 1340, y: 560, w: 460, size: 40 })
      return (t) => {
        tick(t)
        rise(page, t, c0 - 0.3)
        list.forEach((r, i) => { r.style.opacity = String(ramp(t, (i < 2 ? c0 : c1 - 0.2) + (i % 3) * 0.3, 0.4)) })
        rise(keep, t, c2)
        rise(off, t, c3)
      }
    },

    arr: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'Sonarr and Radarr', clip: 'larr', url: '#/settings/arr' })
      const [c0, c1, c2, c3] = cueTimes(scene)
      const k = [
        kicker(root, { label: 'Sonarr and Radarr', text: 'Apps that download shows and films' }),
        kicker(root, { label: 'Settings → Recording', text: 'Find Sonarr and Radarr', tone: 'is-mint' }),
        kicker(root, { label: 'Deleted stays deleted', text: 'The file does not download again' }),
      ]
      const dialog = card(root, `<div style="font-size:44px;font-weight:800">Delete this episode?</div>
        <div style="font-size:26px;color:${TEXT2};margin:10px 0 22px">This episode has two copies. Which one do you want to delete?</div>
        ${['Both', 'Recording', 'Sonarr copy'].map((o, i) => `<div class="opt" style="display:flex;align-items:center;gap:18px;padding:18px 22px;margin-top:12px;border-radius:14px;border:2px solid rgba(255,255,255,0.1);font-size:32px;font-weight:700"><span style="width:28px;height:28px;border-radius:50%;border:3px solid ${i === 0 ? MINT : DIM};${i === 0 ? `box-shadow:inset 0 0 0 6px #141c24;background:${MINT}` : ''}"></span>${o}</div>`).join('')}
        <div style="display:flex;gap:18px;margin-top:28px"><div style="flex:1;text-align:center;padding:16px;border-radius:12px;background:#26323e;font-size:28px;font-weight:800">Cancel</div><div style="flex:1;text-align:center;padding:16px;border-radius:12px;background:#ff4d4f;font-size:28px;font-weight:800">Delete</div></div>`, { left: '560px', top: '200px', width: '800px', padding: '40px 46px', background: 'rgba(20,28,36,0.99)', borderColor: 'rgba(255,255,255,0.18)', boxShadow: '0 40px 120px rgba(0,0,0,0.6)' })
      const shade = el(root, 'div', 'layer', '', { background: 'rgba(11,17,23,0.7)' })
      root.appendChild(dialog)
      const map = piecewise([[0, 0.4], [c1 + 1.0, 1.4], [c1 + 2.2, 2.5], [scene.duration, 2.5]])
      return (t) => {
        tick(t)
        app.show(map(t))
        k[0](t, c0 + 0.3, c1 - 0.1)
        k[1](t, c1 + 0.1, c2 - 0.1)
        k[2](t, c2 + 0.1, c3 - 0.1)
        const d = ramp(t, c3 - 0.2, 0.5)
        shade.style.opacity = String(d)
        place(dialog, { opacity: d, scale: lerp(0.94, 1, ramp(t, c3 - 0.2, 0.6, easeOutBack)) })
      }
    },

    end: (root, scene) => {
      const bg = glow(root)
      const show = endCard(root, {
        links: [['Recordings', 'furey.github.io/freetvarr/guide/recordings', true], ['Plex', 'furey.github.io/freetvarr/guide/plex']],
        next: 'Home, For you, Activity, Health, and Settings',
      })
      return (t) => {
        bg(t, scene.duration)
        show(t, 0.3)
        fadeTail(root, t, scene.duration, 1.2)
        void clamp
      }
    },
  }
}
