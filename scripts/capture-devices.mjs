import { mkdir, stat } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import {
  TIMEZONE, simulatedNow, prepareDemoContext, restartHeroCarousel, waitForAllArt, startArtWatch, artWatchReport, glideScroll,
} from './capture-demo-api.mjs'
import { startScreencast } from './capture-screencast.mjs'
import { startLoopback } from './capture-loopback.mjs'

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const SERVER_URL = (process.env.FREETVARR_URL || 'http://localhost:3733').replace(/\/$/, '')
const WORK_DIR = process.env.DEVICES_WORK_DIR || `${REPO_ROOT}scripts/.cache/devices`
const OUT_DIR = `${REPO_ROOT}docs/public`
const LOOP_S = 24
const FPS = 30
const SCALE = 2
const STAGE = { width: 1114, height: 918 }
const IPAD = { left: 23, top: 23, pad: 22, radius: 46, screen: { width: 1024, height: 768, radius: 26 } }
const IPHONE = { left: 564, top: 175, pad: 12, radius: 52, screen: { width: 320, height: 692, radius: 40 } }
const THEMES = { light: '#ffffff', dark: '#0b1117' }
const CRF = { full: Number(process.env.DEVICES_CRF ?? 24), oneX: Number(process.env.DEVICES_1X_CRF ?? 25) }
const run = promisify(execFile)

const main = async () => {
  await mkdir(WORK_DIR, { recursive: true })
  const browser = await chromium.launch({ args: ['--font-render-hinting=none', `--force-device-scale-factor=${SCALE}`] })
  const screens = {}
  for (const device of DEVICES) screens[device.name] = await recordDevice({ browser, device })
  await renderBezels(browser)
  await browser.close()
  for (const theme of Object.keys(THEMES)) await composite({ theme, screens })
  await reportSizes()
  const failed = Object.values(screens).some((screen) => screen.artIssues.length)
  if (failed && process.env.ALLOW_ART_ISSUES !== '1') process.exitCode = 1
}

const recordDevice = async ({ browser, device }) => {
  const base = await startLoopback({ target: SERVER_URL })
  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: SCALE,
    isMobile: device.mobile,
    hasTouch: device.mobile,
    bypassCSP: true,
    timezoneId: TIMEZONE,
  })
  await prepareDemoContext({ context, base, simNow: simulatedNow() })
  const page = await context.newPage()
  await page.goto(`${base}/${device.start}`, { waitUntil: 'networkidle' })
  await page.addStyleTag({ content: '::-webkit-scrollbar{width:0!important;height:0!important}html,body,*{scrollbar-width:none!important}' })
  await waitForAllArt(page)
  console.log(`[devices] warming the ${device.name} tour`)
  await playTimeline({ page, device })
  await returnToStart({ page, device })
  const framesDir = `${WORK_DIR}/frames-${device.name}`
  const screencast = await startScreencast({ page, dir: framesDir })
  await page.waitForTimeout(300)
  await startArtWatch(page)
  const startedAt = Date.now()
  await playTimeline({ page, device })
  await page.waitForTimeout(Math.max(0, LOOP_S * 1000 - (Date.now() - startedAt)) + 300)
  const artIssues = await artWatchReport(page)
  await screencast.stop()
  await context.close()
  reportArtCheck({ device, artIssues })
  const file = `${WORK_DIR}/${device.name}.mp4`
  await encodeScreen({ framesDir, trimS: (startedAt - screencast.startedAt) / 1000, screen: device.screen, file })
  return { file, artIssues }
}

const playTimeline = async ({ page, device }) => {
  const startedAt = Date.now()
  for (const step of device.timeline) {
    const waitMs = step.at * 1000 - (Date.now() - startedAt)
    if (waitMs > 0) await page.waitForTimeout(waitMs)
    else if (waitMs < -150) console.log(`  ${device.name} step at ${step.at}s ran ${(-waitMs / 1000).toFixed(2)}s late`)
    await step.run(page)
  }
  await page.waitForTimeout(Math.max(0, LOOP_S * 1000 - (Date.now() - startedAt)))
}

const returnToStart = async ({ page, device }) => {
  await closePlayer(page)
  await page.keyboard.press('Escape')
  await goTo(page, device.start)
  await scrollToTop(page)
  await waitForAllArt(page)
  await restartHeroCarousel(page)
}

const reportArtCheck = ({ device, artIssues }) => {
  if (!artIssues.length) return console.log(`ART_CHECK=pass ${device.name}`)
  console.log(`ART_CHECK=fail ${device.name} (${artIssues.length})`)
  for (const issue of artIssues) console.log(`  ${issue.atMs} ms ${issue.hash} ${issue.kind}: ${issue.label}`)
}

const encodeScreen = ({ framesDir, trimS, screen, file }) => run('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-f', 'concat', '-safe', '0', '-i', `${framesDir}/frames.ffconcat`,
  '-ss', trimS.toFixed(3), '-t', String(LOOP_S),
  '-an', '-vf', `fps=${FPS},scale=${screen.width * SCALE}:${screen.height * SCALE}:flags=lanczos,setsar=1,format=yuv420p`,
  '-c:v', 'libx264', '-crf', '12', '-preset', 'fast', file,
], { maxBuffer: 1 << 26 })

const renderBezels = async (browser) => {
  const page = await browser.newPage({ viewport: STAGE, deviceScaleFactor: SCALE })
  for (const name of ['ipad', 'iphone']) {
    await page.setContent(bezelMarkup(name))
    await page.screenshot({ path: `${WORK_DIR}/bezel-${name}.png`, omitBackground: true })
  }
  for (const [name, device] of [['ipad', IPAD], ['iphone', IPHONE]]) {
    await page.setViewportSize({ width: device.screen.width, height: device.screen.height })
    await page.setContent(maskMarkup(device.screen))
    await page.screenshot({ path: `${WORK_DIR}/mask-${name}.png` })
  }
  await page.close()
}

const composite = async ({ theme, screens }) => {
  const out = `${OUT_DIR}/devices-${theme}`
  const at = (n) => n * SCALE
  const filters = [
    `color=c=${THEMES[theme]}:s=${at(STAGE.width)}x${at(STAGE.height)}:r=${FPS}:d=${LOOP_S}[bg]`,
    '[0:v]format=yuva420p[ipadraw]', '[4:v]format=gray[ipadmask]', '[ipadraw][ipadmask]alphamerge[ipad]',
    '[3:v]format=yuva420p[phoneraw]', '[5:v]format=gray[phonemask]', '[phoneraw][phonemask]alphamerge[phone]',
    `[bg][ipad]overlay=${at(IPAD.left + IPAD.pad)}:${at(IPAD.top + IPAD.pad)}:shortest=1[s1]`,
    '[s1][1:v]overlay=0:0[s2]',
    `[s2][phone]overlay=${at(IPHONE.left + IPHONE.pad)}:${at(IPHONE.top + IPHONE.pad)}[s3]`,
    '[s3][2:v]overlay=0:0,format=yuv420p,split[full][small]',
    `[small]scale=${STAGE.width}:${STAGE.height}:flags=lanczos[onex]`,
  ]
  const encode = (crf) => ['-c:v', 'libx264', '-profile:v', 'high', '-crf', String(crf), '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', '-t', String(LOOP_S)]
  await run('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-i', screens.ipad.file,
    '-loop', '1', '-i', `${WORK_DIR}/bezel-ipad.png`,
    '-loop', '1', '-i', `${WORK_DIR}/bezel-iphone.png`,
    '-i', screens.iphone.file,
    '-loop', '1', '-i', `${WORK_DIR}/mask-ipad.png`,
    '-loop', '1', '-i', `${WORK_DIR}/mask-iphone.png`,
    '-filter_complex', filters.join(';'),
    '-map', '[full]', ...encode(CRF.full), `${out}.mp4`,
    '-map', '[onex]', ...encode(CRF.oneX), `${out}-1x.mp4`,
  ], { maxBuffer: 1 << 26 })
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${out}.mp4`, '-frames:v', '1', '-update', '1', '-q:v', '4', `${out}-poster.jpg`])
}

const reportSizes = async () => {
  for (const theme of Object.keys(THEMES)) {
    for (const suffix of ['.mp4', '-1x.mp4', '-poster.jpg']) {
      const file = `${OUT_DIR}/devices-${theme}${suffix}`
      console.log(`[devices] ${((await stat(file)).size / 1048576).toFixed(2)} MB  ${file}`)
    }
  }
}

const goTo = async (page, hash) => {
  await page.evaluate((target) => { window.location.hash = target }, hash)
  await page.waitForTimeout(80)
}

const scrollToTop = (page) => page.evaluate(() => {
  for (const el of [document.scrollingElement, document.querySelector('.app-content')]) el?.scrollTo({ top: 0, behavior: 'instant' })
})

const scrollerOf = (page) => page.evaluate(() => {
  const el = document.querySelector('.app-content')
  return el && el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY) ? '.app-content' : null
})

const scrollDownAndBack = async (page, { dy, downMs, holdMs, upMs }) => {
  const selector = await scrollerOf(page)
  await glideScroll(page, { selector, dy, ms: downMs })
  await page.waitForTimeout(holdMs)
  await glideScroll(page, { selector, dy: -dy, ms: upMs })
}

const playLiveDemo = async (page) => {
  const row = page.locator('.live-row').filter({ hasText: 'Big Wave Season' }).first()
  const target = row.locator('.live-row-text, .live-row-now').first()
  await target.click()
  await page.waitForFunction(() => [...document.querySelectorAll('video')].some((v) => v.currentTime > 0.2), null, { timeout: 15_000 })
    .catch(() => console.log('  live demo did not start'))
}

const openProgramme = async (page, title) => {
  const cell = page.locator('.epg-cell').filter({ hasText: title }).first()
  if (!(await cell.count())) return console.log(`  no guide cell for ${title}`)
  await cell.click()
}

const closePlayer = async (page) => {
  if (!(await page.locator('video').count())) return
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
}

const bezelMarkup = (name) => `<!doctype html><style>
html,body{margin:0;background:transparent}
.stage{position:relative;width:${STAGE.width}px;height:${STAGE.height}px}
.device{position:absolute;overflow:hidden;background:transparent}
.screen{background:transparent;box-shadow:0 0 0 40px #0e0c09}
.ipad{left:${IPAD.left}px;top:${IPAD.top}px;padding:${IPAD.pad}px;border-radius:${IPAD.radius}px;box-shadow:0 0 0 1.5px #3d3829,0 0 0 3px #0e0c09,0 22px 50px rgba(0,0,0,.3)}
.iphone{left:${IPHONE.left}px;top:${IPHONE.top}px;padding:${IPHONE.pad}px;border-radius:${IPHONE.radius}px;box-shadow:0 0 0 1.5px #4a4434,0 0 0 3px #0e0c09,-18px 34px 60px rgba(0,0,0,.45),-6px 12px 22px rgba(0,0,0,.35)}
.ipad .screen{width:${IPAD.screen.width}px;height:${IPAD.screen.height}px;border-radius:${IPAD.screen.radius}px}
.iphone .screen{width:${IPHONE.screen.width}px;height:${IPHONE.screen.height}px;border-radius:${IPHONE.screen.radius}px}
.camera{position:absolute;top:50%;left:9px;width:6px;height:6px;margin-top:-3px;border-radius:50%;background:#23201b;box-shadow:inset 0 0 0 1.5px #2e2a24}
.notch{position:absolute;top:${IPHONE.pad}px;left:50%;width:118px;height:26px;margin-left:-59px;border-radius:0 0 16px 16px;background:#0e0c09}
</style><div class="stage">${name === 'ipad'
    ? '<div class="device ipad"><div class="camera"></div><div class="screen"></div></div>'
    : '<div class="device iphone"><div class="screen"></div><div class="notch"></div></div>'}</div>`

const maskMarkup = (screen) => `<!doctype html><style>
html,body{margin:0;background:#000}
div{width:${screen.width}px;height:${screen.height}px;border-radius:${screen.radius}px;background:#fff}
</style><div></div>`

const IPAD_TIMELINE = [
  { at: 1.0, run: (page) => scrollDownAndBack(page, { dy: 520, downMs: 1600, holdMs: 800, upMs: 1400 }) },
  { at: 5.8, run: (page) => goTo(page, '#/live') },
  { at: 6.9, run: playLiveDemo },
  { at: 13.0, run: closePlayer },
  { at: 13.4, run: (page) => goTo(page, '#/guide') },
  { at: 18.2, run: (page) => openProgramme(page, 'Civil War') },
]

const IPHONE_TIMELINE = [
  { at: 2.4, run: (page) => scrollDownAndBack(page, { dy: 640, downMs: 1800, holdMs: 800, upMs: 1600 }) },
  { at: 7.8, run: (page) => goTo(page, '#/home') },
  { at: 12.6, run: (page) => goTo(page, '#/live') },
  { at: 13.7, run: playLiveDemo },
  { at: 19.6, run: closePlayer },
  { at: 19.9, run: (page) => goTo(page, '#/recordings') },
]

const DEVICES = [
  { name: 'ipad', viewport: { width: 1024, height: 768 }, screen: IPAD.screen, mobile: false, start: '#/home', timeline: IPAD_TIMELINE },
  { name: 'iphone', viewport: { width: 390, height: 844 }, screen: IPHONE.screen, mobile: true, start: '#/for-you', timeline: IPHONE_TIMELINE },
]

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
