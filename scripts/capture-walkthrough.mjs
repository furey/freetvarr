import { chromium } from 'playwright'
import {
  TIMEZONE, simulatedNow, prepareDemoContext, restartHeroCarousel, waitForImages,
  installCursor, cursorTo, cursorToBox, clickWithCursor, glideScroll, clickTab,
} from './capture-demo-api.mjs'
import { startScreencast } from './capture-screencast.mjs'
import { startLoopback } from './capture-loopback.mjs'

const SERVER_URL = (process.env.FREETVARR_URL || 'http://localhost:3733').replace(/\/$/, '')
const BASE = await startLoopback({ target: SERVER_URL })
const FRAMES_DIR = process.env.WALKTHROUGH_FRAMES || '/work/scripts/.cache/frames/walkthrough'
const VIEWPORT = { width: 1280, height: 800 }
const DEVICE_SCALE = 2
const LIVE_PLAY_MS = 3500
const TOOLTIP_HOLD_MS = 1800

const scrollDownAndBack = async (page, { dy, hold = 600, selector = null }) => {
  await glideScroll(page, { dy, selector })
  await page.waitForTimeout(hold)
  await glideScroll(page, { dy: -dy, selector })
  await page.waitForTimeout(400)
}

const SCROLLER = '.app-content'

const scrollerOf = async (page) => (await page.evaluate((sel) => {
  const el = document.querySelector(sel)
  return Boolean(el && el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY))
}, SCROLLER) ? SCROLLER : null)

const watchLiveBriefly = async (page) => {
  const row = page.locator('.live-row').filter({ hasText: 'Big Wave Season' }).first()
  if (!(await clickWithCursor(page, row.locator('.live-row-text, .live-row-now').first().or(row).first()))) return
  await cursorTo(page, 1240, 760)
  await page.waitForFunction(() => [...document.querySelectorAll('video')].some((v) => v.currentTime > 0.5), null, { timeout: 30000 }).catch(() => {})
  await page.mouse.move(0, 0)
  await page.waitForTimeout(LIVE_PLAY_MS)
  await page.mouse.move(640, 300)
  await page.waitForTimeout(500)
  const close = page.locator('.live-frame .pl-round').first()
  if (!(await clickWithCursor(page, close).catch(() => false))) await page.keyboard.press('Escape')
  await page.waitForTimeout(900)
}

const openProgramme = async (page, entry) => {
  if (!entry) return
  const cell = page.locator('.epg-cell').filter({ hasText: entry.program.title }).first()
  await cursorToBox(page, cell)
  await page.waitForTimeout(TOOLTIP_HOLD_MS)
  if (!(await clickWithCursor(page, cell))) return
  await page.waitForTimeout(2600)
  await page.keyboard.press('Escape')
  await page.mouse.move(0, 0)
  await page.waitForTimeout(600)
}

const searchFor = async (page, term) => {
  if (!term) return
  const button = page.locator('button[aria-label="Search the next 7 days"]:visible').first()
  if (!(await clickWithCursor(page, button))) return
  await page.waitForTimeout(700)
  await page.keyboard.type(term, { delay: 80 })
  await page.waitForSelector('.guide-result', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(2400)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
}

const openShow = async (page, title) => {
  const poster = page.locator('a.ui-poster', { hasText: title }).first()
  const target = (await poster.count()) ? poster : page.locator('a.ui-poster').first()
  if (!(await clickWithCursor(page, target))) return
  await page.waitForSelector('.show-hero', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(1400)
  await scrollDownAndBack(page, { dy: 520, hold: 1000, selector: await scrollerOf(page) })
  await page.goBack()
  await page.waitForTimeout(VIEW_SETTLE_MS)
}

const openSettingsWithoutAbout = async (page) => {
  const link = page.locator('a.app-nav-item[href="#/settings"]:visible').first()
  await cursorToBox(page, link)
  await page.waitForTimeout(220)
  await page.evaluate(() => {
    window.__wt?.click()
    window.location.hash = '#/settings/system/series'
  })
  await page.waitForTimeout(VIEW_SETTLE_MS + 300)
}

const openSettingsPage = async (page, label) => {
  const link = page.locator('a', { hasText: new RegExp(`^${label}$`) }).first()
  if (!(await clickWithCursor(page, link))) return
  await page.waitForTimeout(VIEW_SETTLE_MS + 400)
}

const run = async () => {
  const simNow = simulatedNow()
  console.log(`simulated now: ${new Date(simNow).toString()}`)
  const browser = await chromium.launch({
    args: ['--font-render-hinting=none', `--force-device-scale-factor=${DEVICE_SCALE}`],
  })
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE,
    bypassCSP: true,
    timezoneId: TIMEZONE,
  })
  const picks = await prepareDemoContext({ context, base: BASE, simNow })
  console.log(`programme: ${picks.upNext?.program.title} on ${picks.upNext?.channel.name}; search: ${picks.searchTerm}`)

  const page = await context.newPage()
  await page.goto(`${BASE}/#/home`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  const screencast = await startScreencast({ page, dir: FRAMES_DIR })
  const { startedAt } = screencast
  await page.goto(`${BASE}/#/home`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('a.app-nav-item:visible', { timeout: 20000 })
  await waitForImages(page, '.app-content img')
  await page.addStyleTag({
    content: '::-webkit-scrollbar{width:0!important;height:0!important}html,body,*{scrollbar-width:none!important}',
  })
  await installCursor(page)
  await cursorTo(page, 700, 300)
  await restartHeroCarousel(page)
  const settledAt = Date.now()

  await page.waitForTimeout(3600)
  await scrollDownAndBack(page, { dy: 560, hold: 1200, selector: await scrollerOf(page) })

  await clickTab(page, 'live')
  await page.waitForSelector('.live-row', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(900)
  await watchLiveBriefly(page)

  await clickTab(page, 'guide')
  await page.waitForSelector('.epg-cell', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(1000)
  await openProgramme(page, picks.upNext)
  await searchFor(page, picks.searchTerm)

  await clickTab(page, 'recordings')
  await page.waitForSelector('a.ui-poster', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(1200)
  await openShow(page, 'My Kitchen Rules')
  await clickWithCursor(page, page.getByRole('tab', { name: /Scheduled/ }).or(page.getByRole('link', { name: /Scheduled/ })).or(page.locator('a, button', { hasText: /^Scheduled/ })).first()).catch(() => {})
  await page.waitForTimeout(2400)

  await clickTab(page, 'for-you')
  await page.waitForTimeout(2200)
  await scrollDownAndBack(page, { dy: 480, hold: 900, selector: await scrollerOf(page) })

  await openSettingsWithoutAbout(page)
  await openSettingsPage(page, 'Activity')
  await page.waitForTimeout(1200)
  await openSettingsPage(page, 'Health')
  await page.waitForTimeout(1600)

  await clickTab(page, 'home')
  await cursorTo(page, 700, 300)
  await page.waitForTimeout(2200)

  await screencast.stop()
  await context.close()
  await browser.close()
  const trim = (settledAt - startedAt) / 1000 + 0.4
  console.log(`TOUR_TRIM=${trim.toFixed(1)}`)
}

const VIEW_SETTLE_MS = 900

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
