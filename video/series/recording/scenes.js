import { kit, clamp, lerp, ramp, easeInOut, el, place, rise, window01, footage, MINT, fadeTail } from '../stage/lib.js'

const URL = 'freetvarr.lan'

export const buildScenes = (deps) => {
  const { clips } = deps
  const { mark, piecewise, chapterLabel, title, appWindow, kicker, glow, card, endCard, cueTimes } = kit(deps)

  const appScene = (root, scene, { chapter, clip, url }) => {
    const bg = glow(root)
    const chap = chapterLabel(root, chapter, { x: 272, y: 52 })
    const app = appWindow(root, { x: 272, y: 130, w: 1376, url: `${URL}/${url}`, clip })
    const tick = (t, from = 0) => {
      bg(t, scene.duration)
      chap(t)
      place(app.win, { opacity: ramp(t, from, 0.5), scale: lerp(0.97, 1, ramp(t, from, 0.6)) })
    }
    return { app, tick }
  }

  const phone = (root, { x, y, w = 400 }) => {
    const h = Math.round(w * 2.165)
    const frame = el(root, 'div', '', '', { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, borderRadius: '22px', border: '5px solid #26323e', background: '#000', overflow: 'hidden' })
    const img = el(frame, 'img', '', '', { width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' })
    el(frame, 'div', '', '', { position: 'absolute', left: '50%', top: '7px', width: '26%', height: '18px', marginLeft: '-13%', borderRadius: '9px', background: '#000' })
    return { frame, show: (s, c = 'rphone') => footage(img, clips, c, s) }
  }

  return {
    open: (root, scene) => {
      const bg = glow(root)
      const [c0, c1] = cueTimes(scene)
      const kick = title(root, 'Record from the guide', { size: 84 })
      const sub = el(root, 'div', 'subline', 'Like the record button on the Fetch remote.', { position: 'absolute', left: '124px', top: '220px' })
      const lap = appWindow(root, { x: 120, y: 300, w: 1150, url: `${URL}/#/guide`, clip: 'rguide' })
      const ph = phone(root, { x: 1400, y: 180, w: 380 })
      return (t) => {
        bg(t, scene.duration)
        kick(t, c0 - 0.6)
        rise(sub, t, c0 + 1.0)
        place(lap.win, { opacity: ramp(t, 0.2, 0.6), y: 30 * (1 - ramp(t, 0.2, 0.7)) })
        lap.show(0.3 + t * 0.4)
        place(ph.frame, { opacity: ramp(t, 0.6, 0.6), y: 40 * (1 - ramp(t, 0.6, 0.7)) })
        ph.show(t < c1 + 0.6 ? 0.2 : 0.2 + (t - c1 - 0.6))
      }
    },

    guide: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'The TV guide', clip: 'rguide', url: '#/guide' })
      const [c0, c1, c2] = cueTimes(scene)
      const g = (k) => mark('rguide', k)
      const k = [
        kicker(root, { label: 'TV guide', text: 'Seven days ahead' }),
        kicker(root, { label: 'Day chips', text: 'Switch days. Now and Tonight jump.' }),
        kicker(root, { label: 'Favourites', text: 'Star a channel to pin it to the top', tone: 'is-mint' }),
      ]
      const map = piecewise([[0, 0.2], [c1 - 0.6, g('days') - 0.4], [c2, g('days') - 0.4 + (c2 - c1 + 0.6) * 1.6], [c2 + 1.5, g('star') + 0.1]])
      return (t) => {
        tick(t)
        app.show(Math.min(map(t), mark('rguide', 'end') - 0.1))
        k[0](t, c0 + 0.3, c1 - 0.1)
        k[1](t, c1 + 0.1, c2 - 0.1)
        k[2](t, c2 + 0.3, scene.duration)
      }
    },

    sheet: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'The programme sheet', clip: 'rec1', url: '#/guide' })
      const [c0, c1] = cueTimes(scene)
      const k = kicker(root, { label: 'Programme sheet', text: 'Picture, episode, time, and what it is about' })
      const shade = el(root, 'div', 'layer', '', { background: 'rgba(11,17,23,0.75)' })
      const ph = phone(root, { x: 760, y: 120, w: 390 })
      const k2 = kicker(root, { label: 'On a phone', text: 'The sheet slides up from the bottom', tone: 'is-mint' })
      return (t) => {
        tick(t)
        app.show(clamp(0.2 + t * 0.85, 0, 5.3))
        k(t, c0 + 0.6, c1 - 0.2)
        const p = ramp(t, c1 - 0.3, 0.5)
        shade.style.opacity = String(p)
        place(ph.frame, { opacity: p, y: 60 * (1 - p) })
        ph.show(0.6 + Math.max(0, t - c1))
        k2(t, c1 + 0.4, scene.duration)
      }
    },

    record: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'Record one episode', clip: 'rec1', url: '#/guide' })
      const [c0, c1, c2] = cueTimes(scene)
      const k = [
        kicker(root, { label: 'One airing', text: 'This episode, then Record', tone: 'is-red' }),
        kicker(root, { label: 'Scheduled', text: 'A dot marks it on the guide' }),
        kicker(root, { label: 'After it airs', text: 'Filed into your library', tone: 'is-mint' }),
      ]
      const map = piecewise([[0, 11.6], [c1 - 0.2, 15.0]])
      return (t) => {
        tick(t)
        app.show(Math.min(map(t), mark('rec1', 'end') - 0.1))
        k[0](t, c0 + 0.3, c1 - 0.1)
        k[1](t, c1 + 0.1, c2 - 0.1)
        k[2](t, c2 + 0.2, scene.duration)
      }
    },

    padding: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'Start early, finish late', clip: 'rec1', url: '#/guide' })
      const [c0, c1] = cueTimes(scene)
      const badge = card(root, `<div style="display:flex;gap:44px;align-items:center;font-size:44px;font-weight:800">
        <div><div style="font-size:24px;color:#8d9aa7;letter-spacing:.06em;text-transform:uppercase">Start early</div><span class="mono" style="color:#5ce1c6">2m</span></div>
        <div><div style="font-size:24px;color:#8d9aa7;letter-spacing:.06em;text-transform:uppercase">Finish late</div><span class="mono" style="color:#5ce1c6">10m</span></div></div>`, { left: '1420px', top: '170px', width: '440px', padding: '28px 36px', borderColor: 'rgba(92,225,198,0.6)', background: 'rgba(20,28,36,0.97)' })
      const k = kicker(root, { label: 'Before you press Record', text: 'Set Start early and Finish late' })
      const map = piecewise([[0, 4.6], [c1 - 0.5, 5.4], [scene.duration, 12.6]])
      return (t) => {
        tick(t)
        app.show(map(t))
        rise(badge, t, c0 + 1.0)
        k(t, c1 + 0.2, scene.duration)
      }
    },

    series: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'Record the series', clip: 'rseries', url: '#/guide' })
      const [c0, c1, c2, c3] = cueTimes(scene)
      const k = [
        kicker(root, { label: 'Every episode', text: 'Then Record series', tone: 'is-red' }),
        kicker(root, { label: 'Keep', text: 'TVHeadend removes the oldest' }),
        kicker(root, { label: 'Any channel', text: 'Follow the show to another channel' }),
        kicker(root, { label: 'Episode numbers', text: 'Each episode records once', tone: 'is-mint' }),
      ]
      const map = piecewise([[0, 2.6], [c1 - 0.2, 6.6], [c2 - 0.2, 10.9], [c3 - 0.3, 13.5], [scene.duration, 19.0]])
      return (t) => {
        tick(t)
        app.show(map(t))
        k[0](t, c0 + 0.3, c1 - 0.1)
        k[1](t, c1 + 0.1, c2 - 0.1)
        k[2](t, c2 + 0.1, c3 - 0.1)
        k[3](t, c3 + 0.1, scene.duration)
      }
    },

    cancel: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'Change or cancel', clip: 'rcancel', url: '#/guide' })
      const [c0, c1] = cueTimes(scene)
      const k = [
        kicker(root, { label: 'Changed your mind?', text: 'Cancel recording' }),
        kicker(root, { label: 'A series', text: 'Skip this episode, or Cancel series' }),
      ]
      const map = piecewise([[0, 1.5], [c1 - 0.3, 5.9], [c1 - 0.29, 10.6], [scene.duration, 16.9]])
      return (t) => {
        tick(t)
        app.show(map(t))
        k[0](t, c0 + 0.3, c1 - 0.1)
        k[1](t, c1 + 0.1, scene.duration)
      }
    },

    watchlist: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'Watchlist', clip: 'rwatch', url: '#/guide' })
      const [c0, c1, c2, c3] = cueTimes(scene)
      const k = [
        kicker(root, { label: 'Not on yet?', text: 'Search for it' }),
        kicker(root, { label: 'No match', text: 'Add to watchlist' }),
        kicker(root, { label: 'Record when it appears', text: 'Records the series once it is in the guide', tone: 'is-mint' }),
        kicker(root, { label: 'Scheduled', text: 'The watchlist shows when it next airs' }),
      ]
      const map = piecewise([[0, 0.3], [c1 - 0.1, 4.8], [c2 - 0.2, 7.6], [c3 - 0.3, 13.0]])
      return (t) => {
        tick(t)
        if (t < c3 - 0.3) {
          app.setUrl(`${URL}/#/guide`)
          app.img.style.transform = ''
          app.show(map(t))
        } else {
          app.setUrl(`${URL}/#/recordings/scheduled`)
          const z = ramp(t, c3, 0.8, easeInOut)
          app.img.style.transformOrigin = '96% 58%'
          app.img.style.transform = `scale(${lerp(1, 2.0, z)})`
          app.show(mark('rsched', 'timeline') + 2, 'rsched')
        }
        k[0](t, c0 + 0.3, c1 - 0.1)
        k[1](t, c1 + 0.1, c2 - 0.1)
        k[2](t, c2 + 0.1, c3 - 0.1)
        k[3](t, c3 + 0.1, scene.duration)
      }
    },

    scheduled: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'Scheduled', clip: 'rsched', url: '#/recordings/scheduled' })
      const [c0, c1, c2, c3] = cueTimes(scene)
      const k = [
        kicker(root, { label: 'Recordings', text: 'Then Scheduled' }),
        kicker(root, { label: 'Scheduled', text: 'Now, today, tomorrow, later this week' }),
        kicker(root, { label: 'Switch off', text: 'Skip one episode. The series keeps going.' }),
        kicker(root, { label: 'Wide screen', text: 'A timeline for each tuner, with clash warnings', tone: 'is-mint' }),
      ]
      const map = piecewise([[0, 0.3], [c1 - 0.2, 2.6], [c2 - 0.3, 7.2], [c3 - 0.3, 12.0], [scene.duration, 17.1]])
      return (t) => {
        tick(t)
        app.show(map(t))
        const z = ramp(t, c3 + 0.2, 0.9, easeInOut)
        app.img.style.transformOrigin = '96% 40%'
        app.img.style.transform = `scale(${lerp(1, 1.9, z)})`
        k[0](t, c0 + 0.3, c1 - 0.1)
        k[1](t, c1 + 0.1, c2 - 0.1)
        k[2](t, c2 + 0.1, c3 - 0.1)
        k[3](t, c3 + 0.1, scene.duration)
      }
    },

    ads: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'Ad removal', clip: 'rads', url: '#/settings/ad-removal' })
      const [c0, c1, c2, c3] = cueTimes(scene)
      const intro = el(root, 'div', 'layer')
      const kick = title(intro, 'Detect first, then Cut', { x: 272, y: 150 })
      const bar = el(intro, 'div', '', '', { position: 'absolute', left: '272px', top: '420px', width: '1376px', height: '120px' })
      const parts = [[0, 22, 'show'], [22, 9, 'ad'], [31, 26, 'show'], [57, 8, 'ad'], [65, 25, 'show'], [90, 10, 'ad']]
      const segs = parts.map(([left, width, kind]) => el(bar, 'div', '', kind === 'ad' ? 'Ad break' : '', {
        position: 'absolute', left: `${left}%`, width: `${width}%`, top: '0', height: '120px', borderRadius: '14px',
        background: kind === 'ad' ? 'rgba(255,181,71,0.22)' : 'rgba(92,225,198,0.22)', border: `2px solid ${kind === 'ad' ? 'rgba(255,181,71,0.8)' : 'rgba(92,225,198,0.7)'}`,
        display: 'grid', placeItems: 'center', fontSize: '28px', fontWeight: '700', color: '#ffb547',
      }))
      const barLabel = el(intro, 'div', 'subline', 'One recorded episode', { position: 'absolute', left: '276px', top: '350px', fontSize: '34px' })
      const off = el(intro, 'div', 'subline', 'Off until you turn it on', { position: 'absolute', left: '276px', top: '600px', color: '#f2f5f7' })
      const k = [
        kicker(root, { label: 'Settings → Recording', text: 'Ad removal, then Save settings' }),
        kicker(root, { label: 'Series rules', text: 'Detect first. Check the breaks. Then Cut.', tone: 'is-mint' }),
        kicker(root, { label: 'After a cut', text: 'The original stays for 7 days' }),
      ]
      const map = piecewise([[c1 - 0.3, 1.0], [c2 - 0.3, 6.9], [c2 - 0.29, 12.6], [c3 - 0.3, 18.5], [c3 - 0.29, 7.2], [scene.duration, 8.0]])
      return (t) => {
        tick(t, c1 - 0.3)
        kick(t, 0.15)
        const graphic = 1 - ramp(t, c1 - 0.5, 0.4, (q) => q)
        intro.style.opacity = String(graphic)
        const lift = ramp(t, c0 + 2.2, 1.0, easeInOut)
        let x = 0
        segs.forEach((s, i) => {
          const [left, width, kind] = parts[i]
          if (kind === 'ad') {
            place(s, { y: -90 * lift, opacity: (1 - lift) * graphic })
          } else {
            s.style.left = `${lerp(left, x, ramp(t, c0 + 3.0, 0.9, easeInOut))}%`
            s.style.opacity = String(graphic * ramp(t, c0 - 0.2, 0.5))
            x += width
          }
        })
        barLabel.style.opacity = String(graphic * ramp(t, c0, 0.5))
        rise(off, t, c0 + 3.4)
        off.style.opacity = String(Number(off.style.opacity) * graphic)
        app.win.style.visibility = t < c1 - 0.3 ? 'hidden' : 'visible'
        app.setUrl(t >= c2 - 0.3 && t < c3 - 0.3 ? `${URL}/#/settings/system/series` : `${URL}/#/settings/ad-removal`)
        if (t >= c1 - 0.3) app.show(map(t))
        const z = ramp(t, c3 + 0.2, 0.8, easeInOut)
        app.img.style.transformOrigin = '63% 12%'
        app.img.style.transform = `scale(${lerp(1, 1.7, z)})`
        k[0](t, c1 + 0.1, c2 - 0.1)
        k[1](t, c2 + 0.1, c3 - 0.1)
        k[2](t, c3 + 0.1, scene.duration)
        void MINT
      }
    },

    end: (root, scene) => {
      const bg = glow(root)
      const show = endCard(root, {
        links: [['TV guide', 'furey.github.io/freetvarr/guide/tv-guide', true], ['Series rules', 'furey.github.io/freetvarr/guide/series']],
        next: 'Watch recordings and live TV on your TV',
      })
      return (t) => {
        bg(t, scene.duration)
        show(t, 0.3)
        fadeTail(root, t, scene.duration, 1.2)
      }
    },
  }
}
