import { chromium } from 'playwright'
import { join } from 'node:path'
import { TIMEZONE, simulatedNow, installCursor, cursorTo, cursorToBox, clickWithCursor } from './capture-demo-api.mjs'
import { ADMIN_PASSWORD, prepareWizardContext } from './capture-wizard-api.mjs'
import { startScreencast } from './capture-screencast.mjs'
import { startLoopback } from './capture-loopback.mjs'

const SERVER_URL = (process.env.FREETVARR_URL || 'http://localhost:3733').replace(/\/$/, '')
const BASE = await startLoopback({ target: SERVER_URL })
const FRAMES_DIR = process.env.WIZARD_FRAMES || '/work/scripts/.cache/frames/wizard'
const STILL_OUT = process.env.WIZARD_STILL_OUT || '/work/docs/img'
const ONLY = (process.env.WIZARD_ONLY || '').trim()
const VIDEO_VIEWPORT = { width: 1280, height: 800 }
const DEVICE_SCALE = 2
const STILL_VIEWPORT = { width: 1280, height: 936 }
const STILL_FILE = 'screenshot-wizard-secure.png'
const TYPE_DELAY_MS = 50
const EDGE_MARGIN_PX = 110
const JOB_TIMEOUT_MS = 40_000
const HIDE_SCROLLBARS = '::-webkit-scrollbar{width:0!important;height:0!important}html,body{scrollbar-width:none!important}'

const run = async () => {
  const browser = await chromium.launch({
    args: ['--font-render-hinting=none', `--force-device-scale-factor=${DEVICE_SCALE}`],
  })
  const serverWrites = []
  if (ONLY !== 'video') serverWrites.push(...await captureSecureStill(browser))
  if (ONLY !== 'still') serverWrites.push(...await recordTour(browser))
  await browser.close()
  if (serverWrites.length) {
    console.error(`FAILED: ${serverWrites.length} write(s) reached the server:\n  ${serverWrites.join('\n  ')}`)
    process.exit(1)
  }
  console.log('no server writes')
}

const captureSecureStill = async (browser) => {
  const simNow = simulatedNow()
  const context = await browser.newContext({ viewport: STILL_VIEWPORT, deviceScaleFactor: DEVICE_SCALE, timezoneId: TIMEZONE })
  await context.clock.install({ time: simNow })
  const { serverWrites } = await prepareWizardContext({ context, timeZone: TIMEZONE, simNow })
  const page = await context.newPage()
  await openWizard(page)
  await page.getByRole('button', { name: 'Start setup' }).click()
  await waitForSecureForm(page)
  await page.getByLabel('Admin password').fill(ADMIN_PASSWORD)
  await page.evaluate(() => document.activeElement?.blur())
  await page.addStyleTag({ content: HIDE_SCROLLBARS })
  await page.mouse.move(0, 0)
  await page.waitForTimeout(800)
  await page.screenshot({
    path: join(STILL_OUT, STILL_FILE),
    clip: { x: 0, y: 0, width: STILL_VIEWPORT.width, height: STILL_VIEWPORT.height },
  })
  console.log(`saved ${STILL_FILE}`)
  await context.close()
  return serverWrites
}

const recordTour = async (browser) => {
  const simNow = simulatedNow()
  const context = await browser.newContext({
    viewport: VIDEO_VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE,
    bypassCSP: true,
    timezoneId: TIMEZONE,
  })
  await context.clock.install({ time: simNow })
  const { serverWrites } = await prepareWizardContext({ context, timeZone: TIMEZONE, simNow })
  const page = await context.newPage()
  const screencast = await startScreencast({ page, dir: FRAMES_DIR })
  const { startedAt } = screencast
  await openWizard(page)
  await page.addStyleTag({ content: HIDE_SCROLLBARS })
  await installCursor(page)
  await cursorTo(page, 640, 120)
  const settledAt = Date.now()

  await tourWelcome(page)
  await tourTvheadend(page)
  await tourChannels(page)
  await tourGuide(page)
  await tourStorage(page)
  await tourPlex(page)
  await tourReady(page)

  await screencast.stop()
  await context.close()
  console.log(`TOUR_TRIM=${((settledAt - startedAt) / 1000 + 0.4).toFixed(1)}`)
  return serverWrites
}

const tourWelcome = async (page) => {
  await page.waitForTimeout(1200)
  await cursorToBox(page, page.locator('select:visible').first())
  await page.waitForTimeout(1100)
  await pressButton(page, 'Start setup')
}

const tourTvheadend = async (page) => {
  await waitForSecureForm(page)
  await page.waitForTimeout(900)
  await typeInto(page, page.getByLabel('Admin password'), ADMIN_PASSWORD)
  await cursorToBox(page, page.getByLabel('Allowed networks'))
  await page.waitForTimeout(700)
  await pressButton(page, 'Secure and connect')
  await cursorTo(page, 1180, 300)
  await page.getByRole('button', { name: 'Save and next' }).waitFor({ timeout: JOB_TIMEOUT_MS })
  await revealLocator(page, page.getByText('Turn off open access'))
  await page.waitForTimeout(1400)
  await pressButton(page, 'Save and next')
}

const tourChannels = async (page) => {
  const find = page.getByRole('button', { name: 'Find channels' })
  await find.waitFor({ timeout: 15_000 })
  await page.waitForTimeout(900)
  await pressButton(page, 'Find channels')
  await cursorTo(page, 1180, 330)
  await page.getByText(/^Added \d+ channels/).waitFor({ timeout: JOB_TIMEOUT_MS })
  await page.waitForTimeout(1600)
  await pressButton(page, 'Next')
}

const tourGuide = async (page) => {
  const setUp = page.getByRole('button', { name: 'Set up guide' })
  await setUp.waitFor({ timeout: 15_000 })
  await page.waitForTimeout(600)
  await cursorToBox(page, page.locator('select:visible').first())
  await page.waitForTimeout(900)
  await pressButton(page, 'Set up guide')
  await cursorTo(page, 1180, 330)
  await page.getByText(/channels have a guide/).waitFor({ timeout: JOB_TIMEOUT_MS })
  await page.waitForTimeout(1200)
  const picks = page.getByText(/channels without a guide/i)
  await revealLocator(page, picks)
  await cursorToBox(page, picks)
  await page.waitForTimeout(1600)
  await pressButton(page, /^(Save and next|Next)$/)
}

const tourStorage = async (page) => {
  await page.getByText('TV library').first().waitFor({ timeout: 10_000 })
  await page.waitForTimeout(900)
  await cursorToBox(page, page.getByText('TV library').first())
  await page.waitForTimeout(1200)
  await pressButton(page, 'Next')
}

const tourPlex = async (page) => {
  await page.getByText('Connected').first().waitFor({ timeout: 15_000 })
  await page.waitForTimeout(700)
  for (const kind of ['tv', 'movies', 'oneoff']) {
    await cursorToBox(page, page.locator(`#wizard-plex-${kind}-section`))
    await page.waitForTimeout(900)
  }
  await page.waitForTimeout(400)
  await pressButton(page, 'Next')
}

const tourReady = async (page) => {
  await page.getByRole('button', { name: 'Start watching' }).waitFor({ timeout: 10_000 })
  await page.waitForTimeout(1000)
  await cursorToBox(page, page.getByRole('button', { name: 'Start watching' }))
  await page.waitForTimeout(2400)
}

const openWizard = async (page) => {
  await page.goto(`${BASE}/#/welcome`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Start setup' }).waitFor({ timeout: 20_000 })
  await page.waitForTimeout(600)
}

const waitForSecureForm = (page) =>
  page.waitForSelector('text=This TVHeadend has no logins yet', { timeout: 15_000 })

const pressButton = async (page, name) => {
  const button = page.getByRole('button', { name, exact: typeof name === 'string' }).last()
  await button.waitFor({ timeout: 15_000 })
  await tap(page, button)
  await page.waitForTimeout(700)
}

const tap = async (page, locator) => {
  await revealLocator(page, locator)
  await clickWithCursor(page, locator)
}

const typeInto = async (page, locator, text) => {
  await tap(page, locator)
  await locator.pressSequentially(text, { delay: TYPE_DELAY_MS })
  await page.waitForTimeout(300)
}

const revealLocator = async (page, locator) => {
  const box = await locator.boundingBox().catch(() => null)
  if (!box) return
  const height = page.viewportSize().height
  const below = box.y + box.height - (height - EDGE_MARGIN_PX)
  const above = box.y - EDGE_MARGIN_PX
  const dy = below > 0 ? below : above < 0 ? above : 0
  if (!dy) return
  await locator.evaluate((el, { dy, ms }) => new Promise((resolve) => {
    let scroller = el.parentElement
    while (scroller && !(scroller.scrollHeight > scroller.clientHeight && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement
    scroller = scroller || document.scrollingElement
    const from = scroller.scrollTop
    const startedAt = performance.now()
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
    const step = () => {
      const progress = Math.min(1, (performance.now() - startedAt) / ms)
      scroller.scrollTop = from + dy * ease(progress)
      if (progress < 1) requestAnimationFrame(step)
      else resolve()
    }
    requestAnimationFrame(step)
  }), { dy, ms: 900 })
  await page.waitForTimeout(250)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
