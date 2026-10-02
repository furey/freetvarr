import { chromium } from 'playwright'
import { TIMEZONE, simulatedNow, prepareDemoContext, onAirCell, waitForImages } from './capture-demo-api.mjs'

const BASE = process.env.FREETVARR_URL || 'http://localhost:3733'
const OUT = process.env.SCREENSHOT_OUT || '/work/docs/img'
const ONLY = (process.env.SHOT_FILTER || '').trim()
const DESKTOP_VIEWPORT = { width: 1280, height: 936 }
const MOBILE_VIEWPORT = { width: 390, height: 844 }
const LIVE_SHOT_AT_S = 4

const DESKTOP_SHOTS = [
  { hash: '#/dashboard',  file: 'screenshot-dashboard.png',  wait: '.panel-title' },
  { hash: '#/shows',      file: 'screenshot-shows.png',      wait: '.panel-title' },
  { hash: '#/syncs',      file: 'screenshot-syncs.png',      wait: '.panel-title' },
  { hash: '#/recordings', file: 'screenshot-recordings.png', wait: '.panel-title' },
  { hash: '#/settings',   file: 'screenshot-settings.png',   wait: '.panel-title' },
  { hash: '#/guide',      file: 'screenshot-guide.png',      wait: '.epg-cell' },
  { hash: '#/guide',      file: 'screenshot-programme.png',  wait: '.epg-cell', prepare: (page, picks) => openProgramme(page, picks.programme) },
  { hash: '#/live',       file: 'screenshot-live.png',       wait: '.live-row' },
  { hash: '#/live',       file: 'screenshot-player.png',     wait: '.live-row', prepare: (page) => playLive(page) },
  { hash: '#/live',       file: 'screenshot-channels.png',   wait: '.live-row', click: 'button:has-text("CHANNELS")', clickWait: '.epg-modal:not(.live-modal)' },
]

const MOBILE_SHOTS = [
  { hash: '#/dashboard',  file: 'screenshot-mobile-dashboard.png',  wait: '.panel-title' },
  { hash: '#/shows',      file: 'screenshot-mobile-shows.png',      wait: '.panel-title' },
  { hash: '#/recordings', file: 'screenshot-mobile-recordings.png', wait: '.panel-title' },
  { hash: '#/guide',      file: 'screenshot-mobile-guide.png',      wait: '.epg-cell' },
  { hash: '#/live',       file: 'screenshot-mobile-live.png',       wait: '.live-row' },
  { hash: '#/live',       file: 'screenshot-mobile-player.png',     wait: '.live-row', prepare: (page) => playLive(page) },
]

const HIDE_SCROLLBARS = `
  ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
  html, body { scrollbar-width: none !important; -ms-overflow-style: none !important; }
`

const filterShots = (shots) => ONLY
  ? shots.filter((s) => s.hash.includes(ONLY) || s.file.includes(ONLY))
  : shots

const waitForAnimationsToSettle = (page) => page.waitForFunction(() => document.getAnimations()
  .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
  .every((a) => a.playState !== 'running'), null, { timeout: 5_000 }).catch(() => {})

const openProgramme = async (page, programme) => {
  await onAirCell(page, programme).click()
  await page.waitForSelector('.epg-modal .programme-image.hero img', { timeout: 15_000 })
  await waitForImages(page, '.epg-modal img')
}

const playLive = async (page) => {
  await page.locator('.live-row.pinned .live-row-watch').first().click()
  await page.mouse.move(0, 0)
  await page.waitForSelector('.live-video:not(.is-veiled)', { timeout: 20_000 })
  await page.waitForFunction((at) => document.querySelector('.live-video')?.currentTime >= at,
    LIVE_SHOT_AT_S, { timeout: 30_000 })
}

const SIM_NOW = simulatedNow()
console.log(`simulated now: ${new Date(SIM_NOW).toString()}`)

const browser = await chromium.launch()

const captureAll = async (shots, viewport) => {
  if (!shots.length) return
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    timezoneId: TIMEZONE,
  })
  const picks = await prepareDemoContext({ context: ctx, base: BASE, simNow: SIM_NOW })
  console.log(`programme: ${picks.programme.program.title} on ${picks.programme.channel.name}`)
  const page = await ctx.newPage()
  for (const shot of shots) {
    const url = `${BASE}/${shot.hash}`
    console.log(`→ ${url} @ ${viewport.width}×${viewport.height}`)
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.waitForSelector(shot.wait, { timeout: 15_000 })
    if (shot.click) {
      await page.click(shot.click)
      await page.waitForSelector(shot.clickWait, { timeout: 15_000 })
    }
    if (shot.prepare) await shot.prepare(page, picks)
    await page.addStyleTag({ content: HIDE_SCROLLBARS })
    await page.waitForTimeout(800)
    await waitForAnimationsToSettle(page)
    await page.screenshot({
      path: `${OUT}/${shot.file}`,
      clip: { x: 0, y: 0, width: viewport.width, height: viewport.height },
    })
    console.log(`  saved ${shot.file}`)
    await page.keyboard.press('Escape')
  }
  await ctx.close()
}

await captureAll(filterShots(DESKTOP_SHOTS), DESKTOP_VIEWPORT)
await captureAll(filterShots(MOBILE_SHOTS), MOBILE_VIEWPORT)

await browser.close()
console.log('done')
