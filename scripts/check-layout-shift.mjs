import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const baseUrl = (process.env.FREETVARR_URL ?? 'http://127.0.0.1:3801').replace(/\/$/, '')
const playwrightDir = process.env.PLAYWRIGHT_DIR ?? resolve(import.meta.dirname, '.cache/playwright-1.49.0/node_modules/playwright')
const framesDir = process.env.LAYOUT_FRAMES_DIR ?? ''
const reportFile = process.env.LAYOUT_REPORT ?? ''
const screenFilter = process.env.LAYOUT_SCREENS ? process.env.LAYOUT_SCREENS.split(',') : null
const viewports = (process.env.LAYOUT_VIEWPORTS ?? '390x844,1280x800').split(',').map(parseViewport)
const cpuRate = Number(process.env.LAYOUT_CPU_RATE ?? 4)
const clockOffsetMs = Number(process.env.CAPTURE_CLOCK_OFFSET_MS ?? 0)
const settleMs = Number(process.env.LAYOUT_SETTLE_MS ?? 1500)
const watchMs = Number(process.env.LAYOUT_WATCH_MS ?? 2500)
const film = process.env.LAYOUT_FILM ?? 'rocky'
const deepLinkFilm = process.env.LAYOUT_DEEP_LINK_FILM ?? 'the-terminator'
const series = process.env.LAYOUT_SERIES ?? 'friends'
const filmTitle = process.env.LAYOUT_FILM_TITLE ?? 'Rocky'
const limits = {
  cls: Number(process.env.LAYOUT_MAX_CLS ?? 0.02),
  popInMs: Number(process.env.LAYOUT_MAX_POP_IN_MS ?? 1500),
  blankMs: Number(process.env.LAYOUT_MAX_BLANK_MS ?? 20),
  slowItemsMs: Number(process.env.LAYOUT_MAX_SLOW_ITEMS_MS ?? 2500),
  skeletonMs: Number(process.env.LAYOUT_MIN_SKELETON_MS ?? 700),
}

const main = async () => {
  const { chromium } = createRequire(import.meta.url)(playwrightDir)
  const browser = await chromium.launch()
  const results = []
  for (const viewport of viewports) {
    for (const screen of selectedScreens()) results.push(await measureScreen({ browser, viewport, screen }))
  }
  await browser.close()
  if (reportFile) await writeFile(reportFile, JSON.stringify(results, null, 2))
  printTable(results)
  results.filter((result) => result.allow).forEach((result) => console.log(`KNOWN ${result.screen} @${result.viewport}: ${result.allow.note ?? result.allow.flicker ?? 'slow lookup'}`))
  const failures = results.filter((result) => failuresOf(result).length)
  failures.forEach((result) => console.log(`FAIL ${result.screen} @${result.viewport}: ${failuresOf(result).join('; ')}`))
  process.exit(failures.length ? 1 : 0)
}

const guideCell = 'button.epg-cell'
const LATE_SECTION_ITEMS = [/^h2\.ui-section-title\|(About|Cast and crew)/, /^p\.(show-about-synopsis|show-crew-line)/, /^li\.show-cast-person/, /programme-score-badge/]
const SHEET_LOOKUP_ITEMS = [/library-menu-item\|(Hide|Change categories)/, /^span\.ui-skeleton/, /programme-score-badge/, /^section\.ui-sheet\.programme-sheet/]
const SCREENS = [
  { name: 'home', from: '#/recordings', to: '#/home' },
  { name: 'for-you', from: '#/home', to: '#/for-you' },
  { name: 'live', from: '#/home', to: '#/live', slowItems: [/^(li|button|span|h2)\.(live-|ui-group-label|sort-edit)/] },
  { name: 'guide', from: '#/home', to: '#/guide' },
  { name: 'recordings', from: '#/home', to: '#/recordings' },
  { name: 'recordings-shows', from: '#/recordings', to: '#/recordings/shows' },
  { name: 'recordings-movies', from: '#/recordings', to: '#/recordings/movies' },
  { name: 'recordings-one-offs', from: '#/recordings', to: '#/recordings/one-offs' },
  { name: 'series-page', from: '#/recordings/shows', click: `a[href="#/recordings/show/${series}"]` },
  { name: 'movie-page', from: '#/recordings/movies', click: `a[href="#/recordings/show/${film}"]` },
  { name: 'movie-page-cold-lookups', from: '#/recordings/movies', click: `a[href="#/recordings/show/${film}"]`, lookups: 'pending', slowItems: LATE_SECTION_ITEMS },
  { name: 'movie-page-deep-link', deepLink: `#/recordings/show/${deepLinkFilm}` },
  { name: 'one-off-page', from: '#/recordings/one-offs', click: '.library-poster a' },
  { name: 'scheduled', from: '#/recordings', to: '#/recordings/scheduled' },
  { name: 'settings', from: '#/home', to: '#/settings' },
  { name: 'search', from: '#/home', click: 'button[aria-label="Search"] >> visible=true' },
  { name: 'programme-sheet', from: '#/guide', click: guideCell, slowItems: SHEET_LOOKUP_ITEMS },
  { name: 'programme-sheet-film', from: '#/guide', click: `${guideCell}:has-text("${filmTitle}")` },
  { name: 'more-info', from: '#/guide', click: guideCell, then: 'summary.more-info-summary', inputGrace: true, slowItems: [...SHEET_LOOKUP_ITEMS, /^(h3|li|div|dt|dd|p)\.(ui-group-label|show-cast|more-info)/] },
  { name: 'info-sheet', from: `#/recordings/show/${series}`, click: '.show-episode-more', then: 'button.library-menu-item:has-text("info")' },
  { name: 'player', from: `#/recordings/show/${film}`, click: '.show-actions >> visible=true >> .ui-button-primary' },
]

const selectedScreens = () => SCREENS.filter(({ name }) => !screenFilter || screenFilter.includes(name))

const measureScreen = async ({ browser, viewport, screen }) => {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, serviceWorkers: 'block' })
  await context.addInitScript(instrument, { clockOffsetMs })
  if (!isLoopback) await context.route('**/*', refuseWrites)
  if (useLookupFixtures) await routeLookups({ context, mode: screen.lookups ?? 'slow' })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  const frames = []
  const requests = watchRequests(page)
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message.split('\n')[0]))
  page.on('console', (message) => {
    if (message.type() === 'error' && /Vue warn|TypeError|ReferenceError/.test(message.text())) pageErrors.push(message.text().split('\n')[0])
  })
  try {
    if (screen.deepLink) {
      await page.goto(`${baseUrl}/`, { waitUntil: 'load' })
      await page.goto('about:blank')
      await startWatch({ cdp, frames })
      await page.goto(`${baseUrl}/${screen.deepLink}`, { waitUntil: 'commit' })
      await page.evaluate((ms) => window.__layoutCheck.begin({ watchMs: ms, fromNavigation: true }), watchMs)
    } else {
      await page.goto(`${baseUrl}/${screen.from}`, { waitUntil: 'load' })
      await settle(page)
      if (screen.click && !await page.locator(screen.click).count()) return { screen: screen.name, viewport: `${viewport.width}`, skipped: 'nothing to open here' }
      if (screen.click) await tagTapTarget({ page, selector: screen.click })
      if (screen.click) await page.locator(TAP_TARGET).scrollIntoViewIfNeeded({ timeout: 5000 })
      await settle(page)
      if (screen.click) await tagTapTarget({ page, selector: screen.click })
      await startWatch({ cdp, frames })
      await page.evaluate((ms) => window.__layoutCheck.begin({ watchMs: ms }), watchMs)
      await openScreen({ page, screen })
    }
    await page.waitForFunction(() => window.__layoutCheck.done, null, { timeout: watchMs + 20_000 })
    const raw = await page.evaluate(() => window.__layoutCheck.result())
    await stopWatch(cdp)
    const result = { screen: screen.name, viewport: `${viewport.width}`, allow: screen.allow, ...summarise({ raw, inputGrace: Boolean(screen.inputGrace), slowItems: screen.slowItems ?? [] }), pageErrors, requests: requests.since(raw.startWallMs) }
    if (framesDir) await saveFrames({ frames, raw, dir: join(framesDir, `${screen.name}-${viewport.width}`) })
    return result
  } catch (error) {
    return { screen: screen.name, viewport: `${viewport.width}`, error: error.message.split('\n')[0] }
  } finally {
    await context.close()
  }
}

const watchRequests = (page) => {
  const log = []
  if (!process.env.LAYOUT_TIMELINE) return { since: () => undefined }
  page.on('requestfinished', (request) => {
    const timing = request.timing()
    log.push({ url: request.url().replace(baseUrl, '').slice(0, 90), startWallMs: timing.startTime, endWallMs: timing.startTime + timing.responseEnd })
  })
  return {
    since: (startWallMs) => log
      .filter((entry) => entry.endWallMs >= startWallMs)
      .map(({ url, startWallMs: start, endWallMs: end }) => ({ url, start: Math.round(start - startWallMs), end: Math.round(end - startWallMs) })),
  }
}

const openScreen = async ({ page, screen }) => {
  if (screen.to) return page.evaluate((hash) => { location.hash = hash }, screen.to)
  if (screen.press) return page.keyboard.press(screen.press)
  await page.locator(TAP_TARGET).click({ timeout: 5000 })
  if (screen.then) {
    await page.waitForTimeout(600)
    await page.evaluate(() => window.__layoutCheck.restart())
    await page.locator(screen.then).first().click({ timeout: 5000 })
  }
}

const TAP_TARGET_ATTRIBUTE = 'data-layout-tap-target'
const TAP_TARGET = `[${TAP_TARGET_ATTRIBUTE}]`

const tagTapTarget = ({ page, selector }) => page.locator(selector).evaluateAll((elements, attribute) => {
  document.querySelectorAll(`[${attribute}]`).forEach((element) => element.removeAttribute(attribute))
  const centreHitsItself = (element) => {
    const rect = element.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return false
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    return Boolean(hit) && element.contains(hit)
  }
  const target = elements.find(centreHitsItself) ?? elements[0]
  target?.setAttribute(attribute, '')
}, TAP_TARGET_ATTRIBUTE)

const startWatch = async ({ cdp, frames }) => {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate })
  if (!framesDir) return
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    frames.push({ data, wallMs: metadata.timestamp * 1000 })
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 })
}

const stopWatch = async (cdp) => {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  if (framesDir) await cdp.send('Page.stopScreencast').catch(() => {})
}

const settle = async (page) => {
  await page.waitForTimeout(settleMs)
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
}

const routeLookups = async ({ context, mode }) => {
  const asked = new Map()
  const answer = (body) => async (route) => {
    const url = route.request().url()
    asked.set(url, (asked.get(url) ?? 0) + 1)
    await new Promise((done) => setTimeout(done, LOOKUP_DELAY_MS))
    const pending = mode === 'pending' && asked.get(url) === 1
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pending ? { status: 'pending' } : body) })
  }
  await context.route('**/api/epg/programme-credits**', answer(CREDITS_FIXTURE))
  await context.route('**/api/epg/programme-ratings**', answer(RATINGS_FIXTURE))
}

const isLoopback = /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(baseUrl)
const useLookupFixtures = isLoopback && process.env.LAYOUT_LOOKUP_FIXTURES !== '0'
const LOOKUP_DELAY_MS = 250
const CREDITS_FIXTURE = {
  status: 'ready',
  overview: 'A small-time boxer gets a rare chance to fight the heavyweight champion and sets out to go the distance.',
  cast: ['Sylvester Stallone', 'Talia Shire', 'Burt Young', 'Carl Weathers', 'Burgess Meredith']
    .map((name) => ({ name, character: '', image: null, url: null })),
  crew: [{ job: 'Director', name: 'John G. Avildsen' }, { job: 'Writer', name: 'Sylvester Stallone' }],
  details: { company: 'United Artists', year: 1976, genres: ['Drama'], minutes: 120, language: 'English' },
}
const RATINGS_FIXTURE = {
  status: 'ready',
  score: 7.8,
  votes: 7000,
  source: 'tmdb',
  url: null,
  reviews: { snippet: 'A crowd-pleaser with real heart.', count: 4, url: null },
}

const refuseWrites = (route) => (route.request().method() === 'GET' || route.request().method() === 'HEAD'
  ? route.continue()
  : route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))

const saveFrames = async ({ frames, raw, dir }) => {
  await mkdir(dir, { recursive: true })
  const index = frames.map(({ data, wallMs }, n) => ({ file: `frame-${String(n).padStart(3, '0')}.jpg`, ms: Math.round(wallMs - raw.startWallMs), data }))
  await Promise.all(index.map(({ file, data }) => writeFile(join(dir, file), Buffer.from(data, 'base64'))))
  await writeFile(join(dir, 'frames.json'), JSON.stringify(index.map(({ file, ms }) => ({ file, ms }))))
}

const summarise = ({ raw, inputGrace, slowItems }) => {
  const changes = changesOf(raw.frames)
  const content = changes.filter((change) => !isArt(change))
  const arrivals = content.filter((change) => change.kind !== 'out')
  const startMs = arrivals[0]?.ms ?? null
  const late = arrivals.filter((change) => change.ms - startMs > 0)
  const isSlowItem = (change) => slowItems.some((pattern) => pattern.test(change.key))
  const lateContent = late.filter((change) => !isSlowItem(change))
  const lateSlow = late.filter(isSlowItem)
  const isTapResponse = (change) => inputGrace && raw.inputs.some((ms) => change.ms >= ms && change.ms - ms < INPUT_GRACE_MS)
  const art = changes.filter((change) => isArt(change) && change.kind === 'in' && change.key.endsWith('|loaded'))
  const skeletonSpans = skeletonSpansOf(raw.frames)
  return {
    visible: raw.visible,
    rafFrames: raw.frames.length,
    cls: round(raw.shifts.reduce((sum, shift) => sum + shift.value, 0), 4),
    startMs,
    blankMs: blankMsOf({ frames: raw.frames, startMs }),
    popInMs: lateContent.length ? lateContent.at(-1).ms - startMs : 0,
    slowItemsMs: lateSlow.length ? lateSlow.at(-1).ms - startMs : 0,
    moves: late.filter((change) => change.kind === 'move' && !isTapResponse(change)).length,
    guideMoves: raw.guideMoves.length,
    guideMoveItems: raw.guideMoves.slice(0, 8),
    artMs: art.length && startMs !== null ? Math.max(0, art.at(-1).ms - startMs) : 0,
    flickers: skeletonSpans.filter((span) => span.start > 0 && span.ended && span.ms < limits.skeletonMs),
    skeletonSpans,
    lateFades: raw.fades.filter((fade) => startMs !== null && fade.ms - startMs > 50).slice(0, 12),
    lateItems: late.slice(0, 16),
    timeline: process.env.LAYOUT_TIMELINE ? changes.slice(0, 300) : undefined,
    shifts: raw.shifts.slice(0, 12),
  }
}

const isArt = (change) => change.key.startsWith('img')

const blankMsOf = ({ frames, startMs }) => {
  const contentCountOf = (frame) => frame.items.filter((item) => !item.key.startsWith('img')).length
  const floor = contentCountOf(frames[0]) * BLANK_SHARE
  return frames.slice(1)
    .map((frame, index) => ({ frame, previous: frames[index] }))
    .filter(({ frame }) => (startMs === null || frame.ms < startMs) && contentCountOf(frame) < floor)
    .reduce((sum, { frame, previous }) => sum + frame.ms - previous.ms, 0)
}

const BLANK_SHARE = 0.5
const INPUT_GRACE_MS = 500

const changesOf = (frames) => frames.slice(1).flatMap((frame, index) => {
  const before = new Map(frames[index].items.map((item) => [item.key, item]))
  const after = new Map(frame.items.map((item) => [item.key, item]))
  const appeared = [...after.keys()].filter((key) => !before.has(key)).map((key) => ({ ms: frame.ms, kind: 'in', key }))
  const gone = [...before.keys()].filter((key) => !after.has(key)).map((key) => ({ ms: frame.ms, kind: 'out', key }))
  const moved = [...after.entries()]
    .filter(([key, item]) => before.has(key) && !item.animating && !before.get(key).animating && movedFar(before.get(key), item))
    .map(([key, item]) => ({ ms: frame.ms, kind: 'move', key, from: before.get(key).box, to: item.box }))
  return [...appeared, ...gone, ...moved]
})

const movedFar = (a, b) => a.box.some((value, n) => Math.abs(value - b.box[n]) > 2)

const skeletonSpansOf = (frames) => frames.reduce((spans, frame) => {
  const open = spans.at(-1)
  if (frame.skeleton && (!open || open.ended)) spans.push({ start: frame.ms, ms: 0, ended: false })
  if (frame.skeleton && open && !open.ended) open.ms = frame.ms - open.start
  if (!frame.skeleton && open && !open.ended) Object.assign(open, { ended: true, ms: frame.ms - open.start })
  return spans
}, [])

const failuresOf = (result) => {
  if (result.skipped) return []
  if (result.error) return [result.error]
  const allow = result.allow ?? {}
  return [
    result.cls > (allow.cls ?? limits.cls) ? `CLS ${result.cls}` : '',
    result.blankMs > limits.blankMs ? `blank for ${result.blankMs} ms` : '',
    result.popInMs > (allow.popInMs ?? limits.popInMs) ? `content still arriving ${result.popInMs} ms after the first frame` : '',
    result.slowItemsMs > limits.slowItemsMs ? `the named slow items still arriving ${result.slowItemsMs} ms after the first frame` : '',
    result.moves > (allow.moves ?? 0) ? `${result.moves} shifted items` : '',
    result.guideMoves ? `${result.guideMoves} guide cells moved after the tap` : '',
    result.flickers.length && !allow.flicker ? `placeholder shown only ${result.flickers.map((f) => f.ms).join('/')} ms` : '',
    result.visible === false ? 'tab not visible' : '',
    result.pageErrors?.length ? `page error: ${result.pageErrors[0]}` : '',
  ].filter(Boolean)
}

const printTable = (results) => {
  const columns = ['screen', 'width', 'CLS', 'blank', 'pop-in', 'slow', 'moves', 'guide', 'art', 'flicker']
  console.log(columns.map((name, n) => name.padEnd(n ? 8 : 26)).join(''))
  results.forEach((r) => console.log([
    r.screen, r.viewport, r.cls, r.blankMs, r.popInMs, r.slowItemsMs, r.moves, r.guideMoves, r.artMs,
    r.skipped ?? r.error ?? (r.flickers.length ? r.flickers.map((f) => `${f.ms}ms`).join(' ') : '-'),
  ].map((value, n) => String(value ?? '-').padEnd(n ? 8 : 26)).join('')))
}

const round = (value, places) => Number(value.toFixed(places))

function parseViewport (text) {
  const [width, height] = text.split('x').map(Number)
  return { width, height }
}

function instrument ({ clockOffsetMs }) {
  if (clockOffsetMs) {
    const RealDate = Date
    const shifted = class extends RealDate {
      constructor (...args) { super(...(args.length ? args : [RealDate.now() + clockOffsetMs])) }
      static now () { return RealDate.now() + clockOffsetMs }
    }
    globalThis.Date = shifted
  }
  try {
    const today = new Date()
    const day = [today.getFullYear(), today.getMonth() + 1, today.getDate()].map((n) => String(n).padStart(2, '0')).join('-')
    sessionStorage.setItem('freetvarr.introPlayed', '1')
    localStorage.setItem('freetvarr.introPlayedOn', day)
  } catch {}
  const state = { start: 0.0001, shifts: [], frames: [], fades: [], inputs: [], guideBaseline: null, guideMoves: [], done: false, watchMs: 0, visible: null, startWallMs: 0 }
  const noteFade = (target, source) => {
    if (!target?.isConnected) return
    state.fades.push({ ms: Math.round(performance.now() - state.start), node: describe(target), source })
  }
  const animate = Element.prototype.animate
  Element.prototype.animate = function (keyframes, options) {
    const first = Array.isArray(keyframes) ? keyframes[0] : null
    if (first && Number(first.opacity) === 0) noteFade(this, 'script')
    return animate.call(this, keyframes, options)
  }
  const guideCellBoxes = () => new Map([...document.querySelectorAll('button.epg-cell[data-key]')].map((cell) => {
    const rect = cell.getBoundingClientRect()
    return [cell.dataset.key, [rect.x, rect.y, rect.width, rect.height]]
  }))
  const noteGuideMoves = (ms) => {
    if (!state.guideBaseline) return
    const noted = new Set(state.guideMoves.map((move) => move.key))
    for (const [key, box] of guideCellBoxes()) {
      const before = state.guideBaseline.get(key)
      if (!before || noted.has(key) || !box.some((value, n) => Math.abs(value - before[n]) > 0.5)) continue
      state.guideMoves.push({ ms, key, from: before.map(Math.round), to: box.map(Math.round) })
    }
  }
  document.addEventListener('pointerdown', () => {
    state.inputs.push(Math.round(performance.now() - state.start))
    if (state.watchMs && !state.guideBaseline) state.guideBaseline = guideCellBoxes()
  }, true)
  document.addEventListener('animationstart', (event) => {
    if (Number(getComputedStyle(event.target).opacity) < 0.05) noteFade(event.target, event.animationName)
  }, true)
  new PerformanceObserver((list) => list.getEntries().forEach((entry) => {
    if (!state.start || entry.hadRecentInput || entry.startTime < state.start) return
    state.shifts.push({
      ms: Math.round(entry.startTime - state.start),
      value: Number(entry.value.toFixed(4)),
      sources: (entry.sources ?? []).map((source) => ({
        node: describe(source.node),
        from: boxOf(source.previousRect),
        to: boxOf(source.currentRect),
      })),
    })
  })).observe({ type: 'layout-shift', buffered: true })
  const selector = 'h1,h2,h3,p,img,button,.ui-skeleton,.ui-chip,li,.ui-card-title,.ui-banner,[role="dialog"],video'
  const describe = (node) => {
    if (!node || node.nodeType !== 1) return node?.nodeName ?? ''
    const classes = [...node.classList].filter((name) => !name.startsWith('is-')).slice(0, 3).join('.')
    return `${node.tagName.toLowerCase()}${classes ? `.${classes}` : ''}`
  }
  const boxOf = (rect) => (rect ? [rect.x, rect.y, rect.width, rect.height].map(Math.round) : null)
  const transformsSeen = new WeakMap()
  const isMovingByItself = (node, memo) => {
    if (!memo.has(node)) {
      const style = getComputedStyle(node)
      const transform = `${style.transform}|${style.translate}|${style.scale}`
      const previous = transformsSeen.get(node)
      transformsSeen.set(node, transform)
      memo.set(node, node.getAnimations().some((animation) => animation.playState === 'running')
        || (previous !== undefined && previous !== transform))
    }
    return memo.get(node)
  }
  const isAnimating = (el, memo) => {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      if (isMovingByItself(node, memo)) return true
    }
    return false
  }
  const layoutBoxOf = (el) => {
    const rect = el.getBoundingClientRect()
    const [dx, dy] = animatedOffsetOf(el)
    return [Math.round(rect.x - dx), Math.round(rect.y - dy), Math.round(rect.width), Math.round(rect.height)]
  }
  const animatedOffsetOf = (el) => {
    let x = 0
    let y = 0
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      if (!node.getAnimations().length) continue
      const style = getComputedStyle(node)
      const [tx = '0', ty = '0'] = style.translate.split(' ')
      const matrix = style.transform === 'none' ? null : new DOMMatrixReadOnly(style.transform)
      x += (Number.parseFloat(tx) || 0) + (matrix?.m41 ?? 0)
      y += (Number.parseFloat(ty) || 0) + (matrix?.m42 ?? 0)
    }
    return [x, y]
  }
  const keyOf = (el) => {
    const text = el.tagName === 'IMG'
      ? `${el.getAttribute('src') ?? ''}|${el.complete && el.naturalWidth ? 'loaded' : 'loading'}`
      : (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)
    return `${describe(el)}|${text}`
  }
  const snapshot = () => {
    const height = innerHeight
    const width = innerWidth
    const seen = new Map()
    const motion = new Map()
    let skeleton = false
    for (const el of document.querySelectorAll(selector)) {
      const rect = el.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1 || rect.bottom <= 0 || rect.top >= height || rect.right <= 0 || rect.left >= width) continue
      if (!el.checkVisibility({ opacityProperty: false, visibilityProperty: true })) continue
      if (el.classList.contains('ui-skeleton')) skeleton = true
      const box = layoutBoxOf(el)
      let key = keyOf(el)
      while (seen.has(key)) key = `${key}+`
      seen.set(key, { key, box, animating: isAnimating(el, motion) })
    }
    return { items: [...seen.values()], skeleton }
  }
  const afterPaint = new MessageChannel()
  afterPaint.port1.onmessage = () => {
    const ms = Math.round(performance.now() - state.start)
    state.frames.push({ ms, ...snapshot() })
    noteGuideMoves(ms)
    if (ms >= state.watchMs) {
      state.done = true
      return
    }
    requestAnimationFrame(tick)
  }
  const tick = () => afterPaint.port2.postMessage(null)
  window.__layoutCheck = {
    begin: ({ watchMs, fromNavigation = false }) => {
      state.start = fromNavigation ? 0.0001 : performance.now()
      state.startWallMs = performance.timeOrigin + (fromNavigation ? 0 : state.start)
      state.watchMs = watchMs
      state.visible = document.visibilityState === 'visible'
      state.guideBaseline = null
      state.guideMoves = []
      if (!fromNavigation) {
        state.frames = []
        state.shifts = []
        state.fades = []
        state.frames.push({ ms: 0, ...snapshot() })
      }
      requestAnimationFrame(tick)
    },
    restart: () => {
      state.start = performance.now()
      state.startWallMs = performance.timeOrigin + state.start
      state.frames = [{ ms: 0, ...snapshot() }]
      state.shifts = []
      state.fades = []
      state.inputs = []
    },
    get done () { return state.done },
    result: () => ({ ...state, visible: state.visible && document.visibilityState === 'visible' }),
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
