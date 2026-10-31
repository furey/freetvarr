import { kit, lerp, ramp, easeInOut, el, place, rise, footage, MINT, fadeTail } from '../stage/lib.js'

const URL = 'freetvarr.lan'

export const buildScenes = (deps) => {
  const { clips } = deps
  const { piecewise, chapterLabel, title, appWindow, kicker, glow, endCard, cueTimes } = kit(deps)

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
    const frame = el(root, 'div', '', '', { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, borderRadius: '22px', border: '5px solid #26323e', background: '#000', overflow: 'hidden' })
    const img = el(frame, 'img', '', '', { width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' })
    el(frame, 'div', '', '', { position: 'absolute', left: '50%', top: '7px', width: '26%', height: '18px', marginLeft: '-13%', borderRadius: '9px', background: '#000' })
    return { frame, show: (s, c) => footage(img, clips, c, s) }
  }

  return {
    open: (root, scene) => {
      const bg = glow(root)
      const [c0, c1] = cueTimes(scene)
      const head = title(root, 'Five main sections', { size: 84 })
      const names = ['Home', 'Live TV', 'TV guide', 'Recordings', 'Settings']
      const row = el(root, 'div', '', '', { position: 'absolute', left: '120px', top: '230px', display: 'flex', gap: '16px' })
      const chips = names.map((n) => el(row, 'div', '', n, { padding: '16px 30px', borderRadius: '14px', background: '#141c24', border: '2px solid rgba(255,255,255,0.1)', fontSize: '38px', fontWeight: '700' }))
      const forYou = el(row, 'div', '', 'For you', { padding: '16px 30px', borderRadius: '14px', background: 'transparent', border: '2px dashed rgba(255,255,255,0.3)', fontSize: '38px', fontWeight: '700', color: '#8d9aa7' })
      const ph = phone(root, { x: 140, y: 330, w: 330 })
      const lap = appWindow(root, { x: 620, y: 340, w: 1180, url: `${URL}/#/home`, clip: 'hhome' })
      const lab1 = el(root, 'div', 'subline', 'Phone: the tab bar', { position: 'absolute', left: '140px', top: '1040px', fontSize: '28px', display: 'none' })
      void lab1
      return (t) => {
        bg(t, scene.duration)
        head(t, c0 - 0.5)
        chips.forEach((c, i) => {
          rise(c, t, c0 + i * 0.25)
          const on = t >= c0 + 1.2 + i * 0.9 && t < c0 + 2.1 + i * 0.9
          c.style.borderColor = on ? 'rgba(92,225,198,0.8)' : 'rgba(255,255,255,0.1)'
          c.style.color = on ? MINT : '#f2f5f7'
        })
        rise(forYou, t, c1 + 0.3)
        const forYouOn = t >= c1 + 1.0
        forYou.style.borderColor = forYouOn ? 'rgba(92,225,198,0.8)' : 'rgba(255,255,255,0.3)'
        forYou.style.color = forYouOn ? MINT : '#8d9aa7'
        place(ph.frame, { opacity: ramp(t, c0 + 0.2, 0.5), y: 30 * (1 - ramp(t, c0 + 0.2, 0.6)) })
        ph.show(2.0, 'hphonetabs')
        place(lap.win, { opacity: ramp(t, c0 + 0.7, 0.5), y: 30 * (1 - ramp(t, c0 + 0.7, 0.6)) })
        lap.show(4.5)
      }
    },

    home: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'Home', clip: 'hhome', url: '#/home' })
      const [c0, c1, c2, c3, c4] = cueTimes(scene)
      const k = [
        kicker(root, { label: 'Home', text: 'What can I watch now?', tone: 'is-mint' }),
        kicker(root, { label: 'Slides', text: 'Carry on watching, recording now' }),
        kicker(root, { label: 'Rows', text: 'New, For you, On now, Recording tonight' }),
        kicker(root, { label: 'On now', text: 'Favourite channels only. Star a few.' }),
        kicker(root, { label: 'Press and hold', text: 'More choices on any card' }),
      ]
      const map = piecewise([[0, 0.3], [c1, 3.7], [c2 - 0.2, 5.3], [c3 - 0.2, 9.5], [c4 - 0.25, 13.3], [c4 - 0.2, 19.0], [scene.duration, 21.6]])
      return (t) => {
        tick(t)
        app.show(map(t))
        k[0](t, c0 + 0.2, c1 - 0.1)
        k[1](t, c1 + 0.1, c2 - 0.1)
        k[2](t, c2 + 0.1, c3 - 0.1)
        k[3](t, c3 + 0.1, c4 - 0.1)
        k[4](t, c4 + 0.1, scene.duration)
      }
    },

    search: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'Search', clip: 'hsearch', url: '#/home' })
      const [c0, c1] = cueTimes(scene)
      const k = [
        kicker(root, { label: 'Search', text: 'Your recordings, and the next 7 days' }),
        kicker(root, { label: 'Initials or a similar spelling', text: 'bws, mountin rangers', tone: 'is-mint' }),
      ]
      const map = piecewise([[0, 0.5], [c1 - 0.3, 5.5], [scene.duration, 10.4]])
      return (t) => {
        tick(t)
        app.show(map(t))
        k[0](t, c0 + 0.2, c1 - 0.1)
        k[1](t, c1 + 0.1, scene.duration)
      }
    },

    'for-you': (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'For you', clip: 'hforyou', url: '#/for-you' })
      const [c0, c1, c2, c3, c4, c5] = cueTimes(scene)
      const k = [
        kicker(root, { label: 'For you', text: 'Picks from the next week of the guide' }),
        kicker(root, { label: 'Made on your computer', text: 'From what you record and watch', tone: 'is-mint' }),
        kicker(root, { label: 'Private', text: 'Your history never leaves that computer', tone: 'is-mint' }),
        kicker(root, { label: 'Getting started', text: 'Needs about five of your shows' }),
        kicker(root, { label: 'Three dots', text: 'More like this, Fewer like this, Why this?' }),
        kicker(root, { label: 'Turn off or pause history', text: 'Settings → For you' }),
      ]
      const map = piecewise([[0, 0.5], [c1, 1.5], [c3, 8.2], [c4 + 3.0, 11.6], [scene.duration, 15.5]])
      return (t) => {
        tick(t)
        app.show(map(t))
        const ends = [c1, c2, c3, c4, c5, scene.duration]
        ;[c0, c1, c2, c3, c4, c5].forEach((c, i) => k[i](t, c + 0.1, ends[i] - 0.1))
      }
    },

    activity: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'Activity', clip: 'hactivity', url: '#/settings/system/activity' })
      const [c0, c1, c2] = cueTimes(scene)
      const k = [
        kicker(root, { label: 'A sync', text: 'Checks TVHeadend, files new recordings' }),
        kicker(root, { label: 'Settings → System → Activity', text: 'What runs now, with progress' }),
        kicker(root, { label: 'Syncs tab', text: 'Every sync. Sync now checks at once.', tone: 'is-mint' }),
      ]
      const map = piecewise([[0, 0.3], [c1 - 0.2, 2.9], [c2 - 0.2, 3.0], [c2 + 0.8, 4.4], [scene.duration, 11.6]])
      return (t) => {
        tick(t)
        app.setUrl(map(t) < 4.0 ? `${URL}/#/settings/system/activity` : `${URL}/#/settings/system/activity/syncs`)
        app.show(map(t))
        k[0](t, c0 + 0.2, c1 - 0.1)
        k[1](t, c1 + 0.1, c2 - 0.1)
        k[2](t, c2 + 0.1, scene.duration)
      }
    },

    health: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'Health', clip: 'hhealth', url: '#/settings/system/health' })
      const [c0, c1, c2, c3] = cueTimes(scene)
      const k = [
        kicker(root, { label: 'Health', text: 'Checks everything, says what to fix', tone: 'is-mint' }),
        kicker(root, { label: 'Automatic', text: 'Every three hours' }),
        kicker(root, { label: 'Something broke?', text: 'A dot on Settings. Red problems show on Home.', tone: 'is-red' }),
        kicker(root, { label: 'Press it', text: 'Health shows the fix' }),
      ]
      return (t) => {
        tick(t)
        if (t >= c2 - 0.2 && t < c3 - 0.2) {
          app.setUrl(`${URL}/#/home`)
          app.show(0.5 + (t - c2 + 0.2) * 0.9, 'hdot')
          const z = ramp(t, c2 + 2.2, 0.8, easeInOut)
          app.img.style.transformOrigin = '62% 4%'
          app.img.style.transform = `scale(${lerp(1, 1.6, z)})`
        } else {
          app.img.style.transform = ''
          app.setUrl(`${URL}/#/settings/system/health`)
          app.show(t < c2 ? Math.min(0.3 + t * 0.6, 6.8) : 0.5)
        }
        k[0](t, c0 + 0.2, c1 - 0.1)
        k[1](t, c1 + 0.1, c2 - 0.1)
        k[2](t, c2 + 0.1, c3 - 0.1)
        k[3](t, c3 + 0.1, scene.duration)
      }
    },

    settings: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'Settings', clip: 'hsettings', url: '#/settings' })
      const [c0, c1, c2, c3] = cueTimes(scene)
      const k = [
        kicker(root, { label: 'Settings', text: 'About, Watching, Recording, System' }),
        kicker(root, { label: 'Search settings', text: 'Any page or setting by name' }),
        kicker(root, { label: 'System diagram', text: 'Every part, from the aerial to the TV' }),
        kicker(root, { label: 'Redo part of setup', text: 'System → Setup', tone: 'is-mint' }),
      ]
      const map = piecewise([[0, 0.3], [c1 - 0.2, 2.4], [c2 - 0.2, 6.8], [c3 - 0.2, 11.9]])
      return (t) => {
        tick(t)
        if (t < c3 - 0.2) {
          app.setUrl(t < c2 - 0.2 ? `${URL}/#/settings` : `${URL}/#/settings/diagram`)
          app.show(map(t))
        } else {
          app.setUrl(`${URL}/#/settings/system/setup`)
          app.show(1 + (t - c3), 'setup')
        }
        k[0](t, c0 + 0.2, c1 - 0.1)
        k[1](t, c1 + 0.1, c2 - 0.1)
        k[2](t, c2 + 0.1, c3 - 0.1)
        k[3](t, c3 + 0.1, scene.duration)
      }
    },

    end: (root, scene) => {
      const bg = glow(root)
      const show = endCard(root, {
        links: [['The Freetvarr guide', 'furey.github.io/freetvarr', true], ['Settings', 'furey.github.io/freetvarr/guide/settings']],
      })
      return (t) => {
        bg(t, scene.duration)
        show(t, 0.3)
        fadeTail(root, t, scene.duration, 1.4)
      }
    },
  }
}
