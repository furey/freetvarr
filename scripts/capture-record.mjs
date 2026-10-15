import { chromium } from 'playwright'
import {
  TIMEZONE, simulatedNow, prepareDemoContext, waitForImages,
  installCursor, cursorTo, clickWithCursor, clickTab,
} from './capture-demo-api.mjs'
import { startScreencast } from './capture-screencast.mjs'
import { startLoopback } from './capture-loopback.mjs'

const SERVER_URL = (process.env.FREETVARR_URL || 'http://localhost:3733').replace(/\/$/, '')
const BASE = await startLoopback({ target: SERVER_URL })
const FRAMES_DIR = process.env.RECORD_FRAMES || '/work/scripts/.cache/frames/record'
const VIEWPORT = { width: 1280, height: 800 }
const DEVICE_SCALE = 2
const RECORDED_PROGRAMME = 'Big Wave Season'
const SERIES_PROGRAMME_SKIP = /news|sport|football|rugby|league|cricket|tennis|golf|racing|shopping|weather/i
const MODAL_HOLD_MS = 1800
const MARKER_HOLD_MS = 2400
const BUTTON_DWELL_MS = 900
const SCROLLBARS_OFF = '::-webkit-scrollbar{width:0!important;height:0!important}html,body{scrollbar-width:none!important}'



const openCell = async (page, cell) => {
  await clickWithCursor(page, cell)
  await page.waitForSelector('.epg-modal:not(.live-modal)', { timeout: 8000 })
  if (await page.locator('.epg-modal:not(.live-modal) .programme-image img').count()) {
    await waitForImages(page, '.epg-modal:not(.live-modal) .programme-image img')
  }
}

const pressInModal = async (page, button) => {
  await clickWithCursor(page, button, { dwellMs: BUTTON_DWELL_MS })
  await page.waitForSelector('.epg-modal:not(.live-modal)', { state: 'hidden', timeout: 8000 })
}

const showMarker = async (page, cellHandle) => {
  await page.waitForFunction((el) => /\b(recording|scheduled|series)\b/.test(el.className), cellHandle, { timeout: 8000 })
  const box = await cellHandle.boundingBox()
  await cursorTo(page, Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2))
  await page.waitForTimeout(MARKER_HOLD_MS)
}

const recordedCell = (page) => page.locator('.epg-cell.on-now')
  .filter({ has: page.locator('.epg-cell-title', { hasText: RECORDED_PROGRAMME }) })
  .first()

const seriesCandidateKeys = (page) => page
  .locator('.epg-cell:not(.on-now):not(.past):not(.recording):not(.scheduled):not(.series)')
  .evaluateAll((cells, { skip, view }) => cells.flatMap((cell) => {
    const title = cell.querySelector('.epg-cell-title')?.textContent || ''
    const box = cell.getBoundingClientRect()
    const fits = box.left > 220 && box.right < view.width - 40 && box.top > 140 && box.bottom < view.height - 40
    return title && fits && !new RegExp(skip, 'i').test(title) ? [cell.dataset.key] : []
  }), { skip: SERIES_PROGRAMME_SKIP.source, view: VIEWPORT })

const recordSeriesOfAny = async (page) => {
  for (const key of await seriesCandidateKeys(page)) {
    const cell = page.locator(`.epg-cell[data-key="${key}"]`)
    const handle = await cell.elementHandle()
    await openCell(page, cell)
    const seriesButton = page.locator('.epg-modal:not(.live-modal) button[aria-label="Record series"]')
    if (await seriesButton.count()) {
      await page.waitForTimeout(MODAL_HOLD_MS)
      await pressInModal(page, seriesButton.first())
      await showMarker(page, handle)
      return true
    }
    await page.keyboard.press('Escape')
    await page.waitForSelector('.epg-modal:not(.live-modal)', { state: 'hidden', timeout: 5000 }).catch(() => {})
  }
  return false
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
  await prepareDemoContext({ context, base: BASE, simNow })

  const page = await context.newPage()
  const screencast = await startScreencast({ page, dir: FRAMES_DIR })
  const { startedAt } = screencast
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.tab-strip a[href="#/dashboard"]', { timeout: 20000 })
  await page.waitForSelector('.panel-title', { timeout: 20000 })
  await page.addStyleTag({ content: SCROLLBARS_OFF })
  await installCursor(page)
  await cursorTo(page, 640, 120)
  const settledAt = Date.now()

  await page.waitForTimeout(600)
  await clickTab(page, 'guide')
  await page.waitForSelector('.epg-cell', { timeout: 8000 })
  await page.waitForTimeout(1400)

  await openCell(page, recordedCell(page))
  await page.waitForTimeout(MODAL_HOLD_MS)
  await pressInModal(page, page.locator('.epg-modal:not(.live-modal) button', { hasText: /^\s*RECORD\s*$/ }).first())
  await showMarker(page, await recordedCell(page).elementHandle())

  const seriesDone = await recordSeriesOfAny(page)
  if (!seriesDone) throw new Error('no programme in view offers a SERIES button')
  await page.waitForTimeout(600)

  await screencast.stop()
  await context.close()
  await browser.close()
  console.log(`TOUR_TRIM=${((settledAt - startedAt) / 1000 + 0.4).toFixed(1)}`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
