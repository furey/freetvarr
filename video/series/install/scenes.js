import { kit, clamp, lerp, ramp, easeOutBack, el, place, rise, window01, ICONS, MINT, DIM, TEXT2, fadeTail, esc } from '../stage/lib.js'

const URL = 'freetvarr.lan:3733'
const CHANNELS = ['Coastline 3', 'Harbour 5', 'Southern 6', 'Nightline 8', 'Ridgeline 10', 'Bayside 11', 'Greenhouse 12', 'Courtside 13']

export const buildScenes = (deps) => {
  const { mark, piecewise, chapterLabel, title, appWindow, kicker, glow, card, factCard, terminal, endCard, cueTimes } = kit(deps)
  const wz = (key) => mark('wizard', key)

  const appScene = (root, scene, { chapter, clip, url = `${URL}/#/welcome` }) => {
    const bg = glow(root)
    const chap = chapterLabel(root, chapter, { x: 272, y: 52 })
    const app = appWindow(root, { x: 272, y: 130, w: 1376, url, clip })
    const tick = (t) => {
      bg(t, scene.duration)
      chap(t)
      place(app.win, { opacity: ramp(t, 0, 0.5), scale: lerp(0.97, 1, ramp(t, 0, 0.6)) })
    }
    return { app, tick }
  }

  return {
    open: (root, scene) => {
      const bg = glow(root)
      const [c0, c1] = cueTimes(scene)
      const app = appWindow(root, { x: 860, y: 170, w: 1180, url: `${URL}/#/welcome`, clip: 'wizard' })
      el(root, 'div', 'layer', '', { background: 'linear-gradient(90deg, #0b1117 0%, #0b1117 36%, rgba(11,17,23,0.5) 60%, rgba(11,17,23,0) 100%)' })
      const word = el(root, 'div', 'wordmark', '<span class="free">Free</span><span class="tv">tv</span><span class="arr">arr</span>', { position: 'absolute', left: '120px', top: '250px', fontSize: '84px' })
      const h1 = el(root, 'div', 'headline', 'Install<br>and setup', { position: 'absolute', left: '120px', top: '360px', fontSize: '120px' })
      const s1 = el(root, 'div', 'subline', 'One command, then setup in a browser.', { position: 'absolute', left: '124px', top: '640px', color: '#f2f5f7' })
      const s2 = el(root, 'div', 'subline', '<span style="color:#5ce1c6">Check what it finds.</span> Press Next.', { position: 'absolute', left: '124px', top: '710px' })
      return (t) => {
        bg(t, scene.duration)
        place(app.win, { x: lerp(60, -20, t / scene.duration), opacity: ramp(t, 0.2, 0.8) })
        app.show(0.5 + t * 0.2)
        rise(word, t, c0 - 0.6, { dy: 30 })
        rise(h1, t, c0 - 0.4, { dy: 60 })
        rise(s1, t, c0 + 1.4)
        rise(s2, t, c1)
      }
    },

    need: (root, scene) => {
      const bg = glow(root)
      const chap = chapterLabel(root, 'Before you start')
      const kick = title(root, 'Tuner, computer, Docker')
      const [c0, c1, c2, c3] = cueTimes(scene)
      const node = (x, y, w, icon, name, sub) => card(root, `<div class="ic" style="color:${TEXT2}">${ICONS[icon](110)}</div><div style="font-size:34px;font-weight:800;margin-top:14px">${name}</div><div style="font-size:24px;color:${TEXT2};margin-top:6px">${sub}</div>`, { left: `${x}px`, top: `${y}px`, width: `${w}px`, textAlign: 'center', padding: '30px 20px' })
      const aerial = node(120, 330, 260, 'aerial', 'Aerial', 'On the roof')
      const tuner = node(440, 330, 300, 'tuner', 'Tuner', 'e.g. HDHomeRun')
      const nas = card(root, `<div style="display:flex;align-items:center;gap:22px"><div class="ic" style="color:${TEXT2}">${ICONS.computer(110)}</div><div><div style="font-size:34px;font-weight:800">NAS or mini PC</div><div style="font-size:24px;color:${TEXT2};margin-top:6px">Stays on</div></div></div>
        <div class="docker" style="margin-top:22px;padding:18px;border-radius:16px;border:2px dashed rgba(255,255,255,0.18)">
          <div style="font-size:22px;color:#8d9aa7;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:14px">Docker</div>
          <div style="display:flex;gap:16px">
            <div class="tvh" style="flex:1;padding:16px;border-radius:12px;background:#1c2630;font-size:28px;font-weight:700;text-align:center">TVHeadend</div>
            <div style="flex:1;padding:16px;border-radius:12px;background:rgba(92,225,198,0.12);border:2px solid rgba(92,225,198,0.6);text-align:center"><span class="wordmark" style="font-size:30px"><span class="free">Free</span><span class="tv">tv</span><span class="arr">arr</span></span></div>
          </div></div>`, { left: '800px', top: '300px', width: '560px', padding: '30px 30px' })
      const screens = card(root, `<div style="font-size:24px;color:#8d9aa7;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:16px">Home network</div><div style="display:flex;gap:26px;color:${TEXT2};justify-content:center">${ICONS.tv(96)}${ICONS.phone(96)}${ICONS.computer(96)}</div><div style="font-size:24px;color:${TEXT2};margin-top:10px">TV, phone, laptop</div>`, { left: '1420px', top: '330px', width: '380px', textAlign: 'center', padding: '30px 20px' })
      const svg = el(root, 'div', '', `<svg width="1920" height="1080" style="position:absolute;left:0;top:0" fill="none" stroke="#5ce1c6" stroke-width="6" stroke-linecap="round"><path d="M380 480 H440"/><path d="M740 480 H800"/><path d="M1360 480 H1420"/></svg>`, { position: 'absolute', inset: '0' })
      const paths = [...svg.querySelectorAll('path')]
      paths.forEach((p) => { p.style.strokeDasharray = '60'; p.style.strokeDashoffset = '60' })
      const docker = factCard(root, { label: 'Docker', value: 'Free software that runs apps such as TVHeadend and Freetvarr', x: 120, y: 820, w: 1680, size: 40 })
      const included = factCard(root, { label: 'Included', value: 'The install includes TVHeadend. Setup sets it up for you.', tone: 'mint', x: 120, y: 820, w: 1680, size: 40, icon: ICONS.check(64) })
      const lit = (n, on) => {
        n.style.borderColor = on ? 'rgba(92,225,198,0.75)' : 'rgba(255,255,255,0.08)'
        n.style.background = on ? 'rgba(92,225,198,0.08)' : '#141c24'
        n.querySelector('.ic').style.color = on ? MINT : TEXT2
      }
      return (t) => {
        bg(t, scene.duration)
        chap(t)
        kick(t)
        ;[aerial, tuner, nas, screens].forEach((n, i) => rise(n, t, c0 - 0.3 + i * 0.25))
        lit(aerial, t >= c0 && t < c1)
        lit(tuner, t >= c0 && t < c1)
        lit(nas, t >= c1)
        paths.forEach((p, i) => { p.style.strokeDashoffset = String(60 * (1 - ramp(t, c0 + 0.5 + i * 0.4, 0.6))) })
        nas.querySelector('.docker').style.borderColor = t >= c2 ? 'rgba(92,225,198,0.7)' : 'rgba(255,255,255,0.18)'
        nas.querySelector('.tvh').style.outline = t >= c3 ? '3px solid #5ce1c6' : ''
        place(docker, { opacity: window01(t, c2 - 0.1, c3 - 0.1), y: 20 * (1 - ramp(t, c2 - 0.1, 0.5)) })
        place(included, { opacity: ramp(t, c3 - 0.1, 0.5), y: 20 * (1 - ramp(t, c3 - 0.1, 0.5)) })
      }
    },

    install: (root, scene) => {
      const bg = glow(root)
      const chap = chapterLabel(root, 'One command')
      const kick = title(root, 'One command')
      const [c0, c1, c2, c3, c4, c5] = cueTimes(scene)
      const term = terminal(root, { x: 120, y: 260, w: 1680, h: 780, size: 25, title: 'Terminal' })
      const ssh = factCard(root, { label: 'On a NAS', value: 'Sign in over SSH first', tone: 'mint', x: 1160, y: 110, w: 640, size: 42 })
      const cmd = 'curl -fsSL https://raw.githubusercontent.com/furey/freetvarr/main/install.sh | sh'
      const banner = '<span style="color:#3ba4ff">■</span><span style="color:#f28c28">■</span><span style="color:#f5c542">■</span>  <b>Freetvarr</b>'
      const head = [
        banner,
        '',
        '<span class="t-dim">[install]</span> folder: ~/freetvarr',
        '<span class="t-dim">[install]</span> <span class="t-green">downloaded docker-compose.yml</span>',
        '<span class="t-dim">[install]</span> <span class="t-green">wrote .env:</span>',
        '    PUID=1000',
        '    PGID=1000',
        '    # TZ=Australia/Sydney',
      ]
      const ask = '<b>Files will be owned by this PUID and PGID. Start now? [Y/n/e = edit .env first]</b> '
      const pull = (p) => [
        `[+] pull ${p < 1 ? Math.min(2, 1 + Math.floor(p * 3)) : 3}/3`,
        ` ${p >= 1 ? '<span class="t-green">✔</span>' : '<span class="t-yellow">⠿</span>'} Image ghcr.io/furey/freetvarr:latest        ${p >= 1 ? 'Pulled ' : 'Pulling'}`,
        ` ${p >= 0.6 ? '<span class="t-green">✔</span>' : '<span class="t-yellow">⠿</span>'} Image lscr.io/linuxserver/tvheadend:latest ${p >= 0.6 ? 'Pulled ' : 'Pulling'}`,
        ` ${p >= 1 ? '<span class="t-green">✔</span> Container tvheadend   Started' : ''}`,
        ` ${p >= 1 ? '<span class="t-green">✔</span> Container freetvarr   Started' : ''}`,
      ]
      const ready = '<span class="t-dim">[install]</span> Freetvarr is starting. Open <span class="addr" style="color:#5ce1c6;text-decoration:underline">http://192.168.1.20:3733</span> to run the setup wizard.'
      return (t) => {
        bg(t, scene.duration)
        chap(t)
        kick(t)
        place(term.term, { opacity: ramp(t, c0 - 0.4, 0.5) })
        rise(ssh, t, c0 + 0.2)
        ssh.style.opacity = String(Number(ssh.style.opacity) * (1 - ramp(t, c1 + 0.3, 0.4)))
        if (t < c1) {
          term.set({ t, cmd: 'ssh admin@192.168.1.20', at: c0 + 1.2, typeDur: 1.0, out: ['<span class="t-dim">admin@nas:~$</span> <span class="caret"></span>'], outAt: c0 + 3.4 })
          return
        }
        const prior = '<span class="t-mint">$</span> ssh admin@192.168.1.20\n'
        const lines = []
        if (t >= c2 - 0.6) lines.push(...head.slice(0, Math.max(0, Math.floor((t - (c2 - 0.6)) / 0.18) + 1)))
        if (t >= c2 + 1.6) lines.push(`${ask}${t >= c3 + 0.6 ? '' : '<span class="caret"></span>'}`)
        if (t >= c4 - 0.3) lines.push(...pull(ramp(t, c4 - 0.3, 3.4, (q) => q)))
        if (t >= c5 - 0.2) lines.push('', ready)
        term.set({ t, cmd, at: c1 + 0.6, typeDur: 1.8, out: lines, outAt: c1 + 2.6, step: 0.01, prompt: '<span class="t-dim">admin@nas:~$</span> ', prior })
        const addr = term.pre.querySelector('.addr')
        if (addr) addr.style.background = `rgba(92,225,198,${0.2 * ramp(t, c5 + 1.2, 0.4)})`
      }
    },

    start: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'Start', clip: 'wizard' })
      const [c0] = cueTimes(scene)
      const k = kicker(root, { label: 'Step 1', text: 'Confirm the time zone, then Start setup', tone: 'is-mint' })
      const map = piecewise([[0, wz('welcome') + 0.2], [4.6, 3.0], [scene.duration, 5.6]])
      return (t) => {
        tick(t)
        app.show(map(t))
        k(t, c0 + 0.2, scene.duration)
      }
    },

    tvheadend: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'Secure TVHeadend', clip: 'wizard' })
      const [c0, c1, c2] = cueTimes(scene)
      const k = [
        kicker(root, { label: 'TVHeadend', text: 'Admin username, password, allowed networks' }),
        kicker(root, { label: 'Secure and connect', text: 'Freetvarr saves the login and connects', tone: 'is-mint' }),
        kicker(root, { label: 'Your own TVHeadend?', text: 'Use my own TVHeadend login instead' }),
      ]
      const map = piecewise([
        [0, wz('tvh') - 0.3], [c0 + 1.0, wz('tvh') + 0.7], [c0 + 3.4, wz('secure') - 0.2], [c1 - 0.1, wz('secure') + 0.1],
        [c1 + 5.0, wz('secured') + 0.2], [scene.duration, wz('secured') + 0.6],
      ])
      return (t) => {
        tick(t)
        app.show(map(t))
        k[0](t, c0 + 0.3, c1 - 0.1)
        k[1](t, c1 + 0.3, c2 - 0.1)
        k[2](t, c2 + 0.3, scene.duration)
      }
    },

    channels: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'Find channels', clip: 'wizard' })
      const [c0, c1, c2] = cueTimes(scene)
      const k = [
        kicker(root, { label: 'Channels', text: 'Check the tuners and the transmitter' }),
        kicker(root, { label: 'No tuner found?', text: 'Enter the tuner\'s address' }),
      ]
      const list = card(root, `<div style="font-size:24px;color:#8d9aa7;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:12px">Added 8 channels</div>${CHANNELS.map((c) => `<div style="display:flex;align-items:center;gap:14px;font-size:30px;font-weight:700;line-height:1.75"><span style="color:#5ce1c6">${ICONS.check(30)}</span>${c}</div>`).join('')}`, { left: '1340px', top: '260px', width: '440px', padding: '30px 34px', background: 'rgba(20,28,36,0.97)', borderColor: 'rgba(92,225,198,0.6)' })
      const map = piecewise([
        [0, wz('channels')], [c1 - 0.2, wz('scan') - 0.4], [c1 + 0.2, wz('scan')], [c1 + 4.8, wz('scanned') + 0.3], [scene.duration, wz('scanned') + 1.2],
      ])
      return (t) => {
        tick(t)
        app.show(map(t))
        k[0](t, c0 + 0.3, c1 + 1.0)
        place(list, { opacity: window01(t, c1 + 4.4, c2 + 0.2), y: 30 * (1 - ramp(t, c1 + 4.4, 0.6)) })
        k[1](t, c2 + 0.2, scene.duration)
      }
    },

    guide: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'TV guide', clip: 'wizard' })
      const [c0, c1, c2] = cueTimes(scene)
      const k = [
        kicker(root, { label: 'Guide', text: 'Check your region, then Set up guide' }),
        kicker(root, { label: 'Australia and New Zealand', text: 'A free 7-day guide', tone: 'is-mint' }),
      ]
      const rows = [['Coastline 3', 'Coastline', 0], ['Harbour 5', 'Harbour', 0], ['Southern 6', 'Southern HD', 1], ['Nightline 8', 'Nightline', 0], ['Ridgeline 10', 'Ridgeline', 0]]
      const matches = card(root, `<div style="font-size:24px;color:#8d9aa7;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:16px">Channel → listings</div>
        ${rows.map(([a, b, guess]) => `<div style="display:grid;grid-template-columns:260px 40px 1fr;align-items:center;font-size:30px;line-height:1.9"><b>${a}</b><span style="color:#8d9aa7">→</span><span class="mono" style="font-size:27px;${guess ? 'color:#ffb547' : ''}">${b}${guess ? '  <span style="font-family:Figtree;font-size:22px;padding:4px 12px;border-radius:8px;background:rgba(255,181,71,0.14)">best guess</span>' : ''}</span></div>`).join('')}
        <div style="margin-top:20px;display:inline-block;padding:14px 30px;border-radius:12px;background:#5ce1c6;color:#04201a;font-size:28px;font-weight:800">Save and next</div>`, { left: '780px', top: '300px', width: '960px', padding: '34px 40px', background: 'rgba(20,28,36,0.98)', borderColor: 'rgba(255,255,255,0.18)' })
      const map = piecewise([
        [0, wz('guide-step')], [c0 + 2.6, wz('guide-step') + 0.4], [c0 + 3.0, wz('guide') + 0.1], [c1 - 0.2, wz('guide') + 2.0],
        [c1 - 0.19, wz('guided') - 0.5], [scene.duration, wz('guided') + 1.5],
      ])
      return (t) => {
        tick(t)
        app.show(map(t))
        k[0](t, c0 + 0.3, c1 - 0.1)
        place(matches, { opacity: window01(t, c1 + 0.2, c2 - 0.1), y: 30 * (1 - ramp(t, c1 + 0.2, 0.6)) })
        k[1](t, c2 + 0.1, scene.duration)
      }
    },

    folders: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'Folders', clip: 'wizard' })
      const [c0, c1] = cueTimes(scene)
      const k = [
        kicker(root, { label: 'Folders', text: 'Recordings and your TV library' }),
        kicker(root, { label: 'Checks passed?', text: 'Press Next', tone: 'is-mint' }),
      ]
      const map = piecewise([[0, wz('folders') - 0.6], [scene.duration, wz('folders') + 2.8]])
      return (t) => {
        tick(t)
        app.show(map(t))
        k[0](t, c0 + 0.3, c1 - 0.1)
        k[1](t, c1 + 0.2, scene.duration)
      }
    },

    plex: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'Plex', clip: 'wizplex' })
      const [c0, c1, c2] = cueTimes(scene)
      const wp = (key) => mark('wizplex', key)
      const k = [
        kicker(root, { label: 'Plex libraries', text: 'TV, movies, and one-off' }),
        kicker(root, { label: 'No Plex?', text: 'Press Next. Recordings still go into your library', tone: 'is-mint' }),
      ]
      const create = card(root, `<div style="font-size:28px;color:#a9b4be">No library for your recordings yet?</div>
        <div style="margin-top:14px;display:inline-block;padding:14px 30px;border-radius:12px;background:#5ce1c6;color:#04201a;font-size:28px;font-weight:800">+ Create libraries</div>`, { left: '1180px', top: '690px', width: '600px', padding: '30px 36px', background: 'rgba(20,28,36,0.98)', borderColor: 'rgba(255,255,255,0.18)' })
      const hovered = wp('rows') + 4.9
      const clicked = wp('done') - 0.75
      const map = piecewise([
        [0, wp('plex') + 0.3], [c0 + 2.4, wp('rows')], [c0 + 7.3, hovered],
        [scene.duration - 1.5, hovered + 0.5], [scene.duration - 0.1, clicked], [scene.duration, clicked],
      ])
      return (t) => {
        tick(t)
        app.show(map(t))
        k[0](t, c0 + 0.3, c1 - 0.1)
        place(create, { opacity: window01(t, c1 - 0.1, c2 - 0.1), y: 30 * (1 - ramp(t, c1 - 0.1, 0.6)) })
        k[1](t, c2 + 0.2, scene.duration)
      }
    },

    done: (root, scene) => {
      const { app, tick } = appScene(root, scene, { chapter: 'You\'re set', clip: 'wizdone' })
      const [c0, c1, c2] = cueTimes(scene)
      const k = [
        kicker(root, { label: 'You\'re set', text: 'Start watching opens Home', tone: 'is-mint' }),
        kicker(root, { label: 'Change it later', text: 'Settings → System → Setup' }),
      ]
      const wd = (key) => mark('wizdone', key)
      const wp = (key) => mark('wizplex', key)
      const map = piecewise([[0, wp('done') + 0.2], [3.0, wp('done') + 5.0], [3.01, 14.0], [c1 - 0.3, 15.0]])
      const endLayer = el(root, 'div', 'layer', '', { background: '#0b1117' })
      const showEnd = endCard(endLayer, {
        links: [['Getting started', 'furey.github.io/freetvarr/guide/getting-started', true]],
        next: 'Record free-to-air TV from the TV guide',
      })
      return (t) => {
        tick(t)
        if (t < c1 - 0.3) {
          app.setUrl(t < 3.0 || map(t) < wd('home') ? `${URL}/#/welcome` : `${URL}/#/home`)
          app.show(map(t), t < 3.0 ? 'wizplex' : 'wizdone')
        } else {
          app.setUrl(`${URL}/#/settings/system/setup`)
          app.show(1 + (t - c1), 'setup')
        }
        k[0](t, c0 + 0.3, c1 - 0.3)
        k[1](t, c1 + 0.2, c2 - 0.1)
        endLayer.style.opacity = String(ramp(t, c2 - 0.4, 0.5))
        if (t >= c2 - 0.4) showEnd(t - (c2 - 0.4), 0.2)
        fadeTail(root, t, scene.duration, 1.2)
      }
    },
  }
}
