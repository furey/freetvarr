import { chromium } from 'playwright'
import {
  TIMEZONE, simulatedNow, prepareDemoContext, waitForImages,
  installCursor, cursorTo, cursorToBox, clickWithCursor, clickTab,
} from './capture-demo-api.mjs'
import { startScreencast } from './capture-screencast.mjs'
import { startLoopback } from './capture-loopback.mjs'

const SERVER_URL = (process.env.FREETVARR_URL || 'http://localhost:3733').replace(/\/$/, '')
const BASE = await startLoopback({ target: SERVER_URL })
const FRAMES_DIR = process.env.RECORD_FRAMES || '/work/scripts/.cache/frames/record'
const VIEWPORT = { width: 1280, height: 800 }
const DEVICE_SCALE = 2
const RECORDED_PROGRAMME = 'Big Wave Season'
const MODAL_HOLD_MS = 1800
const MARKER_HOLD_MS = 2400
const BUTTON_DWELL_MS = 900
const SCROLLBARS_OFF = '::-webkit-scrollbar{width:0!important;height:0!important}html,body{scrollbar-width:none!important}'

const SHEET = '.programme-sheet'

const openCell = async (page, cell) => {
  await clickWithCursor(page, cell)
  await page.waitForSelector(SHEET, { timeout: 8000 })
  await page.waitForTimeout(500)
  if (await page.locator('.programme-sheet img').count()) await waitForImages(page, '.programme-sheet img')
}

const pressInSheet = async (page, button) => {
  await clickWithCursor(page, button, { dwellMs: BUTTON_DWELL_MS })
  await page.locator('.programme-sheet').first().waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
}

const showMarker = async (page, cell) => {
  await page.waitForTimeout(400)
  await cursorToBox(page, cell)
  await page.waitForTimeout(MARKER_HOLD_MS)
}

const cellFor = (page, title) => page.locator('.epg-cell').filter({ hasText: title }).first()

const recordButton = (page) => page.locator('[role="dialog"] button').filter({ hasText: /^\s*Record( series| every episode)?\s*$/ }).last()

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
  if (!picks.upNext) throw new Error('no upcoming series programme for Every episode')
  console.log(`series: ${picks.upNext.program.title} on ${picks.upNext.channel.name}`)

  const page = await context.newPage()
  await page.goto(`${BASE}/#/home`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  const screencast = await startScreencast({ page, dir: FRAMES_DIR })
  const { startedAt } = screencast
  await page.goto(`${BASE}/#/home`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('a.app-nav-item:visible', { timeout: 20000 })
  await page.addStyleTag({ content: SCROLLBARS_OFF })
  await installCursor(page)
  await cursorTo(page, 640, 120)
  const settledAt = Date.now()

  await page.waitForTimeout(600)
  await clickTab(page, 'guide')
  await page.waitForSelector('.epg-cell', { timeout: 8000 })
  await page.waitForTimeout(1400)

  const recorded = cellFor(page, RECORDED_PROGRAMME)
  await openCell(page, recorded)
  await page.waitForTimeout(MODAL_HOLD_MS)
  await pressInSheet(page, recordButton(page))
  await showMarker(page, recorded)

  const series = cellFor(page, picks.upNext.program.title)
  await openCell(page, series)
  await page.waitForTimeout(MODAL_HOLD_MS - 600)
  await clickWithCursor(page, page.locator('[role="dialog"] button', { hasText: 'Every episode' }).first(), { dwellMs: 300 })
  await page.waitForTimeout(1400)
  await pressInSheet(page, recordButton(page))
  await showMarker(page, series)
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
