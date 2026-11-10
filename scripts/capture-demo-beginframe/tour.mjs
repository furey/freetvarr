import { mkdir, writeFile } from 'node:fs/promises'
import { launch } from './cdp.mjs'
import { startLoopback } from '../capture-loopback.mjs'
import { prepareDemoContext, simulatedNow } from '../capture-demo-api.mjs'
import { ARROW, HAND, installMacCursor } from './cursor.mjs'

const OUT = process.argv[2]
const dt = 1000 / 60
const W = 1280
const H = 800
const BIN = process.env.CHROME_BIN
const SERVER_URL = process.env.FREETVARR_URL.replace(/\/$/, '')
const PARK = [930, 300]
const FILM = process.env.FILM_TITLE || 'Die Hard'
const SERIES = process.env.SERIES_TITLE || 'NCIS'
const SHOW = process.env.SHOW_TITLE || 'Home and Away'
const HOVER_REST = 600
const TOUR = process.env.TOUR || 'demo'
const END_HOLD_MS = { hero: 300, record: 1200 }[TOUR] ?? 2400
const LIVE_TITLE = 'Big Wave Season'
const HERO_GUIDE_GLIDE = -160
const HERO_PLAY_MS = 2400
const CROSSFADE_MS = 380

const run = async () => {
  await mkdir(OUT, { recursive: true })
  const base = await startLoopback({ target: SERVER_URL })
  const b = await launch({
    bin: BIN,
    port: 9412,
    args: ['--headless', '--no-sandbox', '--enable-begin-frame-control', '--run-all-compositor-stages-before-draw',
      '--deterministic-mode', '--force-device-scale-factor=2', '--autoplay-policy=no-user-gesture-required',
      '--hide-scrollbars', '--font-render-hinting=none',
      '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4', 'about:blank'],
  })
  const { targetId } = await b.send('Target.createTarget', { url: 'about:blank', enableBeginFrameControl: true, width: W, height: H })
  const { sessionId } = await b.send('Target.attachToTarget', { targetId, flatten: true })
  const s = (method, params) => b.send(method, params, sessionId)
  await s('Page.enable')
  await s('Runtime.enable')
  await s('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: false })
  await s('Emulation.setTimezoneOverride', { timezoneId: process.env.TZ || 'Australia/Sydney' })
  await s('Emulation.setTouchEmulationEnabled', { enabled: false })
  await s('Emulation.setEmulatedMedia', { features: [
    { name: 'hover', value: 'hover' }, { name: 'any-hover', value: 'hover' },
    { name: 'pointer', value: 'fine' }, { name: 'any-pointer', value: 'fine' },
  ] })
  const ev = async (expression) => {
    const reply = await s('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (reply.exceptionDetails) throw new Error(`${reply.exceptionDetails.exception?.description || reply.exceptionDetails.text}\n  in: ${expression.slice(0, 160)}`)
    return reply.result.value
  }
  const simNow = simulatedNow()
  console.log(`simulated now ${new Date(simNow).toString()}`)
  const picks = await prepareDemoContext({ context: fakeContext({ s }), base, simNow })
  console.log(`on now: ${picks.programme?.program.title}`)
  for (const script of [`(${installMacCursor})(${JSON.stringify({ arrow: ARROW, hand: HAND })})`, `(${installGlideScroll})()`,
    `(${freezeHeroOnSlideOne})()`, `(${decodeImagesSync})()`, `(${installClockPin})()`, `(${installHoverSignature})()`]) {
    await s('Page.addScriptToEvaluateOnNewDocument', { source: script })
  }

  const clock = { virtual: false, base: 0, elapsed: 0 }
  globalThis.__pageNow = () => (clock.virtual ? clock.base + clock.elapsed : Date.now())
  let ticks = Number(process.hrtime.bigint() / 1000n) / 1000
  const mouse = { x: PARK[0], y: PARK[1] }
  const log = []
  const checks = []
  let n = 0
  let recording = false
  let lastShot = null

  const step = async (events = []) => {
    if (clock.virtual) {
      const expired = b.once('Emulation.virtualTimeBudgetExpired')
      await s('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: dt })
      await expired
      clock.elapsed += dt
    }
    ticks += dt
    const inputs = events.map((e) => s('Input.dispatchMouseEvent', { x: mouse.x, y: mouse.y, ...e }))
    const r = await b.send('HeadlessExperimental.beginFrame', {
      frameTimeTicks: ticks, interval: dt, noDisplayUpdates: false,
      ...(recording ? { screenshot: { format: 'jpeg', quality: 92 } } : {}),
    }, sessionId)
    await Promise.all(inputs)
    if (!clock.virtual) await new Promise((done) => setTimeout(done, 16))
    if (!recording) return
    if (r.screenshotData) lastShot = Buffer.from(r.screenshotData, 'base64')
    await writeFile(`${OUT}/${String(n).padStart(5, '0')}.jpg`, lastShot)
    log.push({ n, x: +mouse.x.toFixed(1), y: +mouse.y.toFixed(1), ...JSON.parse(await ev(FRAME_STATE)) })
    n += 1
  }

  const hold = async (ms) => { for (let i = 0; i < Math.round(ms / dt); i++) await step() }
  const pumpUntil = async (expression, ms, label) => {
    for (let i = 0; i < Math.round(ms / dt); i++) {
      if (await ev(expression)) return true
      await step()
    }
    console.log(`  timed out: ${label}`)
    return false
  }
  const glide = async ([tx, ty]) => {
    const [fx, fy] = [mouse.x, mouse.y]
    const d = Math.hypot(tx - fx, ty - fy)
    if (d < 1) return
    const frames = Math.round(Math.min(1000, Math.max(420, 360 + d * 0.5)) / dt)
    for (let i = 1; i <= frames; i++) {
      const p = easeInOut(i / frames)
      mouse.x = fx + (tx - fx) * p
      mouse.y = fy + (ty - fy) * p
      await step([{ type: 'mouseMoved' }])
    }
  }
  const press = async () => {
    await hold(120)
    if (recording) log.push({ press: n })
    await step([{ type: 'mousePressed', button: 'left', clickCount: 1 }])
    await step([{ type: 'mouseReleased', button: 'left', clickCount: 1 }])
    await ev('window.__hoverWatch(null)')
  }
  const centreOf = async (expression, { fx = 0.5, fy = 0.5 } = {}) => {
    const box = await ev(`(() => { const el = ${expression}; if (!el) return null; const r = el.getBoundingClientRect(); return [r.x + r.width * ${fx}, r.y + r.height * ${fy}] })()`)
    if (!box) throw new Error(`no element: ${expression}`)
    return box
  }
  const hoverOn = async (expression, { rest = HOVER_REST, ...where } = {}) => {
    await ev(`window.__hoverWatch(${expression})`)
    await glide(await centreOf(expression, where))
    await hold(rest)
  }
  const clickOn = async (expression, options = {}) => {
    await hoverOn(expression, { rest: 300, ...options })
    await press()
  }
  const scrollEased = async ({ selector, dx = 0, dy = 0, ms = 1400 }) => {
    await ev(`window.__glideScroll(${JSON.stringify(selector)}, ${dx}, ${dy}, ${ms})`)
    await hold(ms + 50)
  }
  const decodeImages = (scope) => pumpUntil(`(() => { const imgs = [...document.querySelectorAll(${JSON.stringify(scope)})]; imgs.forEach((i) => { if (!i.__decoding) i.__decoding = i.decode().then(() => { i.__decoded = true }, () => { i.__decoded = true }) }); return imgs.every((i) => i.__decoded) })()`, 8000, `decode ${scope}`)
  const mark = async (label) => {
    console.log(`  ${label} at frame ${n}`)
    log.push({ mark: label, n })
  }
  const checkRows = async (label) => {
    const rows = JSON.parse(await ev(ROW_COUNTS))
    checks.push({ label, rows })
    console.log(`  rows on ${label}: ${rows.map((r) => `${r.title}=${r.tiles}${r.artless ? `(${r.artless} artless)` : ''}`).join(', ')}`)
  }
  const settleArt = (label, ms = 30000) => pumpUntil(ART_READY, ms, `art on ${label}`)
  const settleLayout = async (label) => {
    await pumpUntil('document.fonts.status === "loaded"', 8000, `fonts on ${label}`)
    let stable = 0
    let last = ''
    for (let i = 0; i < 300 && stable < 20; i++) {
      const now = await ev(LAYOUT_SIGNATURE)
      stable = now === last ? stable + 1 : 0
      last = now
      await step()
    }
  }
  const tab = (route) => `[...document.querySelectorAll('a.app-nav-item[href="#/${route}"]')].find((a) => a.offsetParent)`
  const segment = (label) => `document.querySelector('button.ui-segment[aria-label="${label}"]')`

  const goHomeAndPark = async () => {
    await clickOn(tab('home'))
    await hold(250)
    await glide(PARK)
  }

  const tour = async ({ warm }) => {
    const settle = warm ? settleArt : async () => {}
    await mark('shot 1 home')
    await hold(warm ? 300 : 1000)
    await mark('shot 2 on now')
    const onNow = `[...document.querySelectorAll('.ui-section')].find((sec) => /on now/i.test(sec.querySelector('.ui-section-title')?.textContent || ''))`
    const scrollDy = await ev(`(() => { const sec = ${onNow}; if (!sec) return 0; const r = sec.getBoundingClientRect(); return Math.max(0, Math.round(r.top - 300)) })()`)
    await scrollEased({ selector: '.app-content', dy: scrollDy, ms: 1400 })
    if (warm) { await settle('home on now'); await checkRows('home') }
    const onNowTile = (title) => `[...(${onNow})?.querySelectorAll('a, button') || []].find((el) => el.textContent.includes(${JSON.stringify(title)}))`
    const otherOnNowTile = `[...(${onNow})?.querySelectorAll('a, button') || []].find((el) => el.querySelector('img') && !el.textContent.includes(${JSON.stringify(LIVE_TITLE)}))`
    await hoverOn(otherOnNowTile, { fy: 0.4, rest: 450 })
    await hoverOn(onNowTile('Big Wave Season'), { fy: 0.4, rest: 700 })
    await mark('shot 3 live tv')
    await clickOn(tab('live'))
    await pumpUntil(`!!document.querySelector('.live-row')`, 8000, 'live rows')
    await settle('live')
    await hold(1100)
    await mark('shot 3b images toggle')
    await clickOn(`document.querySelector('.live-images-toggle')`)
    await hold(1100)
    await press()
    if (warm) await settle('live images back')
    await hold(900)
    await mark('shot 4 tune in')
    const row = `[...document.querySelectorAll('.live-row')].find((r) => r.textContent.includes('Big Wave Season'))`
    await hoverOn(`${row}?.querySelector('.live-watch') || ${row}`, { fx: 0.3, rest: 500 })
    await press()
    await pumpUntil(`!!document.querySelector('.live-frame .pl-logo')`, 4000, 'player logo')
    await pumpUntil(VIDEO_UNVEILED, 12000, 'video unveiled')
    await mark('shot 5 video visible')
    await hold(900)
    await glide([mouse.x - 60, mouse.y - 30])
    await hold(1700)
    await mark('shot 6 exit player')
    await clickOn(`document.querySelector('.live-frame .pl-round')`)
    await pumpUntil(PLAYER_CLOSED, 6000, 'player closed')
    await hold(500)
    await mark('shot 7 guide')
    await clickOn(tab('guide'))
    await pumpUntil(`!!document.querySelector('.epg-cell')`, 8000, 'guide cells')
    if (warm) { await settle('guide'); await settleLayout('guide') }
    await hold(1300)
    await mark('shot 8 zoom')
    for (const label of ['Large zoom', 'Small zoom']) {
      await clickOn(segment(label))
      if (warm) { await settle(label); await settleLayout(label) }
      await hold(1000)
    }
    await mark('shot 9 guide ahead')
    const film = cellOf(FILM)
    const ahead = await ev(`(() => { const cell = ${film}; const grid = document.querySelector('.epg-scroll'); if (!cell || !grid) return 0; const c = cell.getBoundingClientRect(); const g = grid.getBoundingClientRect(); return Math.round(c.left - (g.left + g.width * 0.42)) })()`)
    if (Math.abs(ahead) > 40) await scrollEased({ selector: '.epg-scroll', dx: ahead, ms: 1300 })
    if (warm) await settle('guide ahead')
    await hoverOn(film, { fx: 0.3, rest: 900 })
    await mark('shot 10 record film')
    await press()
    await pumpUntil(`!!document.querySelector('.programme-sheet-primary')`, 6000, 'film sheet')
    if (warm) await settle('film sheet')
    await hold(900)
    if (warm) {
      await clickOn(`document.querySelector('.programme-sheet-dismiss')`)
      await pumpUntil(SHEET_CLOSED, 4000, 'sheet closed')
    } else {
      await hoverOn(`document.querySelector('.programme-sheet-primary')`, { rest: 450 })
      await press()
      await recordOfferIfAny()
      await pumpUntil(SHEET_CLOSED, 5000, 'sheet closed after record')
      await hold(800)
    }
    await mark('shot 11 series')
    const series = cellOf(SERIES, { notNow: true })
    await hoverOn(series, { fx: 0.35, rest: 450 })
    await press()
    await pumpUntil(`!!document.querySelector('.programme-sheet-primary')`, 6000, 'series sheet')
    if (warm) await settle('series sheet')
    await hold(600)
    const everyEpisode = `[...document.querySelectorAll('.ui-sheet-backdrop button, .ui-sheet-backdrop [role=radio], .ui-sheet-backdrop label')].find((el) => /every episode/i.test(el.textContent) && el.offsetParent)`
    if (warm) {
      await clickOn(`document.querySelector('.programme-sheet-dismiss')`)
      await pumpUntil(SHEET_CLOSED, 4000, 'sheet closed')
    } else {
      await hoverOn(everyEpisode, { rest: 400 })
      await press()
      await hold(400)
      await revealInSheet(`document.querySelector('.programme-sheet-primary')`)
      await hoverOn(`document.querySelector('.programme-sheet-primary')`, { rest: 400 })
      await press()
      await recordOfferIfAny()
      await pumpUntil(SHEET_CLOSED, 5000, 'sheet closed after series')
      await hold(1500)
    }
    if (warm) await clickOn(segment('Medium zoom'))
    await mark('shot 12 recordings')
    await clickOn(tab('recordings'))
    await pumpUntil(`!!document.querySelector('a.ui-poster')`, 8000, 'posters')
    if (warm) { await settle('recordings'); await checkRows('recordings') }
    await hold(1600)
    await mark('shot 13 shows row')
    const showsScroller = `(document.querySelector('#library-shows .ui-scroller') || document.querySelector('a.ui-poster')?.closest('.ui-scroller'))`
    await ev(`(() => { const el = ${showsScroller}; if (el) el.dataset.wtScroll = 'shows'; return 1 })()`)
    await decodeImages('[data-wt-scroll=shows] img')
    const showPoster = `[...document.querySelectorAll('[data-wt-scroll=shows] a.ui-poster')].find((a) => a.textContent.includes(${JSON.stringify(SHOW)}))`
    const rowDx = await ev(`(() => {
      const row = document.querySelector('[data-wt-scroll=shows]'); const p = ${showPoster}; if (!row || !p) return 0
      const box = row.getBoundingClientRect()
      const pad = parseFloat(getComputedStyle(row).scrollPaddingInlineStart) || 0
      const contentX = (el) => el.getBoundingClientRect().left - box.left + row.scrollLeft
      const max = row.scrollWidth - row.clientWidth
      const wanted = contentX(p) + p.offsetWidth / 2 - row.clientWidth * 0.55
      const snaps = [...row.children].filter((el) => el.offsetWidth > 0).map((t) => Math.min(max, Math.max(0, contentX(t) - pad)))
      const best = snaps.reduce((x, y) => (Math.abs(y - wanted) < Math.abs(x - wanted) ? y : x), 0)
      return Math.round(best - row.scrollLeft)
    })()`)
    await scrollEased({ selector: '[data-wt-scroll=shows]', dx: rowDx, ms: 1500 })
    if (warm) await settle('shows row')
    await hoverOn(showPoster, { rest: 800 })
    await mark('shot 14 show page')
    await press()
    await pumpUntil(`!!document.querySelector('.show-hero')`, 8000, 'show page')
    if (warm) await settle('show page')
    await hold(1400)
    await scrollEased({ selector: '.app-content', dy: 520, ms: 1400 })
    if (warm) await settle('show page lower')
    await hold(500)
    await scrollEased({ selector: '.app-content', dy: -520, ms: 1400 })
    await mark('shot 15 back')
    await clickOn(`document.querySelector('a.show-back')`)
    await pumpUntil(`!document.querySelector('.show-hero')`, 6000, 'left show page')
    await hold(900)
    await mark('shot 16 for you')
    await clickOn(tab('for-you'))
    await pumpUntil(`!!document.querySelector('.for-you-scroller')`, 8000, 'for you rows')
    if (warm) { await settle('for you'); await checkRows('for you') }
    await hold(1000)
    await hoverOn(`document.querySelector('.for-you-scroller a, .for-you-scroller button')`, { rest: 700 })
    await scrollEased({ selector: '.app-content', dy: 560, ms: 1600 })
    if (warm) { await settle('for you lower'); await checkRows('for you lower') }
    await hold(700)
    await scrollEased({ selector: '.app-content', dy: -560, ms: 1600 })
    await hold(300)
    await mark('shot 17 home')
  }

  const crossfadeTo = async (route) => {
    if (!recording || !lastShot) return clickOn(tab(route))
    await ev(`window.__hoverWatch(${tab(route)})`)
    await glide(await centreOf(tab(route)))
    await hold(150)
    await ev(`(${coverWithFrame})(${JSON.stringify(`data:image/jpeg;base64,${lastShot.toString('base64')}`)}, ${CROSSFADE_MS})`)
    await pumpUntil('window.__frameCoverReady()', 1000, 'frame cover')
    await hold(150)
    await press()
    await pumpUntil(viewSettled(route), 3000, `${route} under the crossfade`)
    await ev('window.__fadeFrameCover()')
    await hold(CROSSFADE_MS)
  }

  const heroHomeAndPark = async () => {
    await crossfadeTo('home')
    await glide(PARK)
  }

  const heroTour = async ({ warm }) => {
    const settle = warm ? settleArt : async () => {}
    await mark('hero 1 home')
    await hold(warm ? 300 : 1000)
    await mark('hero 2 on now')
    const onNow = `[...document.querySelectorAll('.ui-section')].find((sec) => /on now/i.test(sec.querySelector('.ui-section-title')?.textContent || ''))`
    const scrollDy = await ev(`(() => { const sec = ${onNow}; if (!sec) return 0; const r = sec.getBoundingClientRect(); return Math.max(0, Math.round(r.top - 300)) })()`)
    await scrollEased({ selector: '.app-content', dy: scrollDy, ms: 1000 })
    if (warm) await settle('home on now')
    const liveTile = `[...(${onNow})?.querySelectorAll('a, button') || []].find((el) => el.textContent.includes(${JSON.stringify(LIVE_TITLE)}))`
    await hoverOn(liveTile, { fy: 0.4, rest: 400 })
    await mark('hero 3 live tv')
    await crossfadeTo('live')
    await pumpUntil(`!!document.querySelector('.live-row')`, 8000, 'live rows')
    await settle('live')
    await hold(350)
    await mark('hero 4 guide')
    await crossfadeTo('guide')
    await pumpUntil(`!!document.querySelector('.epg-cell')`, 8000, 'guide cells')
    if (warm) { await settle('guide'); await settleLayout('guide') }
    await hold(200)
    await scrollEased({ selector: '.epg-scroll', dx: HERO_GUIDE_GLIDE, ms: 800 })
    await hold(200)
    if (warm) await settle('guide glide')
    await mark('hero 5 sheet')
    const liveCell = onNowCellOf(LIVE_TITLE)
    await ev(`window.__hoverWatch(${liveCell})`)
    await glide(await ev(`(${visibleCentreOf})(${liveCell})`))
    await hold(150)
    await press()
    const watchLive = `[...document.querySelectorAll('.ui-sheet-backdrop button')].find((el) => /watch live/i.test(el.textContent) && el.offsetParent)`
    await pumpUntil(`!!(${watchLive})`, 6000, 'watch live button')
    if (warm) await settle('live sheet')
    await hold(150)
    await revealInSheet(watchLive)
    await hoverOn(watchLive, { rest: 400 })
    await mark('hero 6 watch')
    await press()
    await pumpUntil(`!!document.querySelector('.live-frame .pl-logo')`, 4000, 'player logo')
    await pumpUntil(VIDEO_UNVEILED, 12000, 'video unveiled')
    await mark('hero 6b video visible')
    await hold(HERO_PLAY_MS)
    await mark('hero 7 close')
    await clickOn(`document.querySelector('.live-frame .pl-round')`)
    await pumpUntil(PLAYER_CLOSED, 6000, 'player closed')
  }

  const scrollGuideTo = async (cell) => {
    const ahead = await ev(`(() => { const title = ${JSON.stringify(cell)}; const target = [...document.querySelectorAll('.epg-cell')].filter((c) => c.textContent.includes(title) && !c.matches('.is-now, .on-now, .now')).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0]; const grid = document.querySelector('.epg-scroll'); if (!target || !grid) return 0; const c = target.getBoundingClientRect(); const g = grid.getBoundingClientRect(); return Math.round(c.left - (g.left + g.width * 0.42)) })()`)
    if (Math.abs(ahead) > 40) await scrollEased({ selector: '.epg-scroll', dx: ahead, ms: 1300 })
  }

  const recordTour = async ({ warm }) => {
    const settle = warm ? settleArt : async () => {}
    const closeSheet = async () => {
      await clickOn(`document.querySelector('.programme-sheet-dismiss')`)
      await pumpUntil(SHEET_CLOSED, 4000, 'sheet closed')
    }
    const recordFromSheet = async (label) => {
      await revealInSheet(`document.querySelector('.programme-sheet-primary')`)
      await hoverOn(`document.querySelector('.programme-sheet-primary')`, { rest: 450 })
      await press()
      await recordOfferIfAny()
      await pumpUntil(SHEET_CLOSED, 5000, `sheet closed after ${label}`)
    }
    await mark('record 1 home')
    await hold(warm ? 300 : 900)
    await mark('record 2 guide')
    await clickOn(tab('guide'))
    if (await ev(`location.hash !== '#/guide'`)) {
      console.log('  guide tab click missed; opening the guide by address')
      await ev(`location.hash = '#/guide'`)
    }
    await pumpUntil(`!!document.querySelector('.epg-cell')`, 8000, 'guide cells')
    if (warm) { await settle('guide'); await settleLayout('guide') }
    await hold(1100)
    await mark('record 3 one airing')
    const liveCell = onNowCellOf(LIVE_TITLE)
    await ev(`window.__hoverWatch(${liveCell})`)
    await glide(await ev(`(${visibleCentreOf})(${liveCell})`))
    await hold(500)
    await press()
    await pumpUntil(`!!document.querySelector('.programme-sheet-primary')`, 6000, 'live sheet')
    if (warm) await settle('live sheet')
    await hold(1300)
    if (warm) await closeSheet()
    else await recordFromSheet('one airing')
    await hold(400)
    await ev(`window.__hoverWatch(${liveCell})`)
    await glide(await ev(`(${visibleCentreOf})(${liveCell})`))
    await hold(1200)
    await mark('record 4 every episode')
    await scrollGuideTo(RECORD_SERIES)
    if (warm) { await settle('guide ahead'); await settleLayout('guide ahead') }
    const series = cellOf(RECORD_SERIES, { notNow: true })
    await hoverOn(series, { fx: 0.35, rest: 600 })
    await press()
    await pumpUntil(`!!document.querySelector('.programme-sheet-primary')`, 6000, 'series sheet')
    if (warm) await settle('series sheet')
    await hold(1000)
    const everyEpisode = `[...document.querySelectorAll('.ui-sheet-backdrop button, .ui-sheet-backdrop [role=radio], .ui-sheet-backdrop label')].find((el) => /every episode/i.test(el.textContent) && el.offsetParent)`
    if (warm) await closeSheet()
    else {
      await hoverOn(everyEpisode, { rest: 400 })
      await press()
      await hold(1200)
      await recordFromSheet('every episode')
    }
    await hold(400)
    await hoverOn(series, { fx: 0.35, rest: 1400 })
  }

  const revealInSheet = async (expression) => {
    const dy = await ev(`(() => { const el = ${expression}; if (!el) return 0; let box = el.parentElement; while (box && !(box.scrollHeight > box.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement; if (!box) return 0; box.dataset.wtScroll = 'sheet'; const r = el.getBoundingClientRect(); const limit = Math.min(innerHeight, box.getBoundingClientRect().bottom) - 24; return Math.max(0, Math.round(r.bottom - limit)) })()`)
    if (dy > 0) await scrollEased({ selector: '[data-wt-scroll=sheet]', dy, ms: 700 })
  }

  const recordOfferIfAny = async () => {
    const offer = `[...document.querySelectorAll('.programme-sheet-primary')].find((el) => /in HD/.test(el.textContent) && el.offsetParent)`
    for (let i = 0; i < 30; i++) {
      if (await ev(`!!(${offer})`)) return clickOn(offer)
      await step()
    }
    return null
  }

  const RECORD_SERIES = process.env.RECORD_SERIES_TITLE || picks.upNext?.program.title
  if (TOUR === 'record') console.log(`series: ${RECORD_SERIES}`)
  const tours = { demo: tour, hero: heroTour, record: recordTour }
  const homeAndPark = TOUR === 'hero' ? heroHomeAndPark : goHomeAndPark
  try {
    console.log(`warming the ${TOUR} tour`)
    const t0 = Date.now()
    s('Page.navigate', { url: `${base}/#/home` })
    await pumpUntil(`!!document.querySelector('a.app-nav-item[href="#/live"]')`, 30000, 'app shell')
    await settleArt('home')
    await pumpUntil(HERO_DECODED, 30000, 'hero decoded')
    await step([{ type: 'mouseMoved' }])
    await tours[TOUR]({ warm: true })
    await goHomeAndPark()
    await settleArt('home again')
    await pumpUntil(HERO_DECODED, 30000, 'hero decoded again')
    await ev(`(document.querySelector('.app-content') || document.scrollingElement).scrollTop = 0`)
    await clickOn(tab('for-you'))
    await pumpUntil(`!!document.querySelector('.for-you-scroller')`, 8000, 'for you rows')
    await settleArt('for you before preroll')
    await hold(1500)
    console.log(`warm done in ${Date.now() - t0} ms`)

    await s('Emulation.setVirtualTimePolicy', { policy: 'pause' })
    ticks = Math.max(ticks, Number(process.hrtime.bigint() / 1000n) / 1000)
    clock.base = Date.now()
    clock.virtual = true
    console.log(`clock pinned at ${await ev('window.__pinClock()')}`)
    await goHomeAndPark()
    await hold(END_HOLD_MS)
    await ev('window.__artWatch && (window.__artWatch.since = performance.now(), window.__artWatch.issues.clear())')
    recording = true
    const started = Date.now()
    await tours[TOUR]({ warm: false })
    await homeAndPark()
    await hold(END_HOLD_MS)
    await mark('end')
    const artIssues = await ev(`JSON.stringify([...window.__artWatch.issues.values()].map((i) => ({ ...i, forMs: i.lastMs - i.atMs })).filter((i) => i.forMs > 50))`)
    console.log(`captured ${n} frames in ${Date.now() - started} ms real`)
    console.log(`ART_ISSUES ${artIssues}`)
    await writeFile(`${OUT}/art-issues.json`, artIssues)
  } catch (err) {
    console.error(String(err.stack || err))
    console.log(await ev(DUMP_CONTROLS).catch(() => 'no dump'))
    process.exitCode = 1
  } finally {
    await writeFile(`${OUT}/log.json`, JSON.stringify(log))
    await writeFile(`${OUT}/checks.json`, JSON.stringify(checks, null, 1))
    b.close()
    process.exit()
  }
}

const cellOf = (title, { notNow = false } = {}) => `[...document.querySelectorAll('.epg-cell')].filter((c) => c.textContent.includes(${JSON.stringify(title)}) && !(${notNow} && c.matches('.is-now, .on-now, .now'))).find((c) => { const r = c.getBoundingClientRect(); return r.width > 30 && r.top > 120 && r.bottom < innerHeight - 10 && r.left > 330 })`

const coverWithFrame = (src, fadeMs) => {
  const cover = document.createElement('img')
  cover.decoding = 'sync'
  cover.style.cssText = `position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:2147483646;pointer-events:none;transition:opacity ${fadeMs}ms ease-in-out`
  cover.src = src
  document.documentElement.append(cover)
  window.__frameCoverReady = () => cover.complete && cover.naturalWidth > 0
  window.__fadeFrameCover = () => {
    cover.style.opacity = '0'
    setTimeout(() => cover.remove(), fadeMs + 60)
    return 1
  }
  return 1
}

const viewSettled = (route) => `location.hash === '#/${route}' && [...document.querySelectorAll('img')].filter((i) => i.getAttribute('src') && i.closest('.app-content') && i.getBoundingClientRect().bottom > 0 && i.getBoundingClientRect().top < innerHeight).every((i) => i.complete)`

const onNowCellOf = (title) => `[...document.querySelectorAll('.epg-cell')].find((c) => { const r = c.getBoundingClientRect(); const now = document.querySelector('.epg-nowline')?.getBoundingClientRect().left; return c.textContent.includes(${JSON.stringify(title)}) && r.width > 30 && r.top > 120 && r.bottom < innerHeight - 10 && (now === undefined || (r.left <= now && r.right >= now)) })`

const visibleCentreOf = (el) => {
  const r = el.getBoundingClientRect()
  const rail = document.querySelector('.epg-rail-cell')?.getBoundingClientRect().right ?? 0
  const left = Math.max(r.left, rail + 12)
  const right = Math.min(r.right, innerWidth - 12)
  return [left + Math.min(110, (right - left) / 2), r.top + r.height * 0.45]
}

const fakeContext = ({ s }) => ({
  request: {
    get: async (url) => {
      const reply = await fetch(url)
      const body = Buffer.from(await reply.arrayBuffer())
      return { ok: () => reply.ok, status: () => reply.status, json: async () => JSON.parse(body.toString()) }
    },
  },
  clock: { install: ({ time }) => s('Page.addScriptToEvaluateOnNewDocument', { source: `(${shiftPageDate})(${time - Date.now()})` }) },
  addInitScript: (fn, arg) => s('Page.addScriptToEvaluateOnNewDocument', { source: `(${fn})(${JSON.stringify(arg ?? null)})` }),
  on: () => {},
})

const shiftPageDate = (offset) => {
  const RealDate = Date
  class ShiftedDate extends RealDate {
    constructor(...args) {
      if (args.length) super(...args)
      else super(RealDate.now() + offset)
    }

    static now() { return RealDate.now() + offset }
  }
  globalThis.Date = ShiftedDate
}

const installClockPin = () => {
  const pin = { text: null }
  const enforce = () => {
    if (pin.text === null) return
    for (const el of document.querySelectorAll('.ui-clock-time')) if (el.textContent !== pin.text) el.textContent = pin.text
  }
  window.__pinClock = () => {
    pin.text = document.querySelector('.ui-clock-time')?.textContent ?? null
    enforce()
    return pin.text
  }
  const watch = () => new MutationObserver(enforce).observe(document.documentElement, { childList: true, subtree: true, characterData: true })
  if (document.documentElement) watch()
  else document.addEventListener('DOMContentLoaded', watch, { once: true })
}

const installHoverSignature = () => {
  const PROPS = ['backgroundColor', 'color', 'transform', 'scale', 'boxShadow', 'opacity', 'filter', 'outlineColor', 'borderColor', 'textDecorationLine']
  const signatureOf = (el) => [el, ...el.querySelectorAll('*')].slice(0, 40)
    .map((node) => { const cs = getComputedStyle(node); return PROPS.map((p) => cs[p]).join('|') }).join(';')
  const watch = { el: null, rest: null }
  window.__hoverWatch = (el) => {
    watch.el = el || null
    watch.rest = el ? signatureOf(el) : null
    return 1
  }
  window.__hoverState = () => (watch.el && watch.el.isConnected ? signatureOf(watch.el) !== watch.rest : null)
}

const installGlideScroll = () => {
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
  window.__glideScroll = (selector, dx, dy, ms) => {
    const found = document.querySelector(selector)
    const scrolls = (box) => box && ((dy && box.scrollHeight > box.clientHeight + 1) || (dx && box.scrollWidth > box.clientWidth + 1)) && (box === document.scrollingElement || /auto|scroll/.test(getComputedStyle(box)[dy ? 'overflowY' : 'overflowX']))
    const el = scrolls(found) ? found : document.scrollingElement
    const clamp = (v, max) => Math.max(0, Math.min(v, max))
    const from = { x: el.scrollLeft, y: el.scrollTop }
    const to = { x: clamp(from.x + dx, el.scrollWidth - el.clientWidth), y: clamp(from.y + dy, el.scrollHeight - el.clientHeight) }
    const snap = el.style.scrollSnapType
    el.style.scrollSnapType = 'none'
    const startedAt = performance.now()
    const tick = () => {
      const p = Math.min(1, (performance.now() - startedAt) / ms)
      el.scrollTo({ left: from.x + (to.x - from.x) * ease(p), top: from.y + (to.y - from.y) * ease(p), behavior: 'instant' })
      if (p < 1) requestAnimationFrame(tick)
      else requestAnimationFrame(() => { el.style.scrollSnapType = snap })
    }
    requestAnimationFrame(tick)
    return 1
  }
}

const decodeImagesSync = () => {
  const mark = (root) => { for (const img of root.querySelectorAll ? root.querySelectorAll('img') : []) img.decoding = 'sync'; if (root.tagName === 'IMG') root.decoding = 'sync' }
  const watch = () => new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach((node) => node.nodeType === 1 && mark(node)))).observe(document.documentElement, { childList: true, subtree: true })
  if (document.documentElement) watch()
  else document.addEventListener('DOMContentLoaded', watch, { once: true })
}

const freezeHeroOnSlideOne = () => {
  const blockReal = (e) => { if (e.isTrusted && e.target.closest?.('.hero-carousel')) e.stopPropagation() }
  addEventListener('pointerover', blockReal, true)
  addEventListener('pointerleave', blockReal, true)
  const freeze = () => {
    for (const root of document.querySelectorAll('.hero-carousel:not([data-wt-frozen])')) {
      const zone = root.querySelector('.hero-carousel-controls, .hero-slide-actions')
      if (!zone) continue
      root.dataset.wtFrozen = '1'
      zone.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }))
    }
  }
  const watch = () => new MutationObserver(freeze).observe(document.documentElement, { childList: true, subtree: true })
  if (document.documentElement) watch()
  else document.addEventListener('DOMContentLoaded', watch, { once: true })
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

const ART_READY = `[...document.querySelectorAll('img')].filter((i) => i.getAttribute('src')).every((i) => i.complete) && (!window.__artIssuesNow || window.__artIssuesNow().length === 0)`
const HERO_DECODED = `(() => { const img = document.querySelector('.hero-slide.is-active .hero-slide-backdrop img'); return !!img && img.complete && img.naturalWidth > 0 && !document.querySelector('.hero-slide.is-active .ui-art-fallback') })()`
const VIDEO_UNVEILED = `[...document.querySelectorAll('.live-frame video')].some((v) => v.currentTime > 0.05 && !v.paused && !v.classList.contains('is-veiled'))`
const PLAYER_CLOSED = `!document.querySelector('.pl-backdrop') || getComputedStyle(document.querySelector('.pl-backdrop')).display === 'none'`
const SHEET_CLOSED = `!document.querySelector('.ui-sheet-backdrop')`
const LAYOUT_SIGNATURE = `[...document.querySelectorAll('.epg-cell-text, .epg-cell')].slice(0, 80).map((el) => { const r = el.getBoundingClientRect(); return Math.round(r.x) + ',' + Math.round(r.width) }).join(';') + '|' + document.querySelectorAll('.programme-image.is-loaded').length`
const ROW_COUNTS = `JSON.stringify([...document.querySelectorAll('.ui-section, .for-you-section, section')].map((sec) => {
  const scroller = sec.querySelector('.ui-scroller')
  if (!scroller) return null
  const title = (sec.querySelector('.ui-section-title, h2, h3')?.textContent || '').trim().slice(0, 40)
  const tiles = [...scroller.children].filter((el) => !el.matches('.ui-row-end') && !el.querySelector('.ui-row-end'))
  const artless = tiles.filter((el) => el.querySelector('.ui-art-title, .programme-title-card.is-shown, .programme-image-fallback') || [...el.querySelectorAll('img')].some((i) => !(i.complete && i.naturalWidth > 0))).length
  return { title, tiles: tiles.length, artless }
}).filter(Boolean).filter((r, i, all) => all.findIndex((o) => o.title === r.title) === i))`
const DUMP_CONTROLS = `JSON.stringify({ hash: location.hash, controls: [...document.querySelectorAll('button, a, [role=radio], [role=tab]')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth }).map((el) => { const r = el.getBoundingClientRect(); return [el.tagName, (el.className?.baseVal ?? el.className).slice(0, 50), (el.getAttribute('aria-label') || el.textContent).trim().replace(/\\s+/g, ' ').slice(0, 40), Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] }) })`
const FRAME_STATE = `JSON.stringify((() => {
  const v = document.querySelector('.live-frame video')
  const issues = window.__artIssuesNow ? window.__artIssuesNow() : []
  return {
    cur: document.getElementById('__cur')?.dataset.type,
    hash: location.hash,
    ct: v ? +v.currentTime.toFixed(3) : null,
    veiled: v ? v.classList.contains('is-veiled') : null,
    hov: window.__hoverState ? window.__hoverState() : null,
    clock: document.querySelector('.ui-clock-time')?.textContent,
    art: issues.length,
    issue: issues[0] ? issues[0].kind + ': ' + issues[0].label : undefined,
  }
})())`

run()
