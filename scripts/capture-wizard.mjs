import { chromium } from 'playwright'
import { join } from 'node:path'
import { rename } from 'node:fs/promises'
import { TIMEZONE, simulatedNow, installCursor, cursorTo, cursorToBox, clickWithCursor, glideScroll } from './capture-demo-api.mjs'
import { ADMIN_PASSWORD, prepareWizardContext } from './capture-wizard-api.mjs'

const BASE = (process.env.FREETVARR_URL || 'http://localhost:3733').replace(/\/$/, '')
const OUT = process.env.WIZARD_OUT || '/work'
const STILL_OUT = process.env.WIZARD_STILL_OUT || '/work/docs/img'
const ONLY = (process.env.WIZARD_ONLY || '').trim()
const VIDEO_VIEWPORT = { width: 1280, height: 800 }
const STILL_VIEWPORT = { width: 1280, height: 936 }
const STILL_FILE = 'screenshot-wizard-secure.png'
const TYPE_DELAY_MS = 50
const EDGE_MARGIN_PX = 110
const JOB_TIMEOUT_MS = 40_000
const POSTER_AFTER_CHANNELS_S = 0.8
const HIDE_SCROLLBARS = '::-webkit-scrollbar{width:0!important;height:0!important}html,body{scrollbar-width:none!important}'
const GUIDE_PICKS = [
  { channel: 'ABCTV', guide: 'ABC TV' },
  { channel: 'SBS ONE', guide: 'SBS' },
]

const run = async () => {
  const browser = await chromium.launch({ args: ['--font-render-hinting=none'] })
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
  const context = await browser.newContext({ viewport: STILL_VIEWPORT, deviceScaleFactor: 2, timezoneId: TIMEZONE })
  await context.clock.install({ time: simNow })
  const { serverWrites } = await prepareWizardContext({ context, timeZone: TIMEZONE, simNow })
  const page = await context.newPage()
  await openWizard(page)
  await page.locator('.panel-body .btn-primary', { hasText: 'NEXT' }).click()
  await waitForSecureForm(page)
  await secureField(page, 'Admin password').fill(ADMIN_PASSWORD)
  await secureField(page, 'Confirm password').fill(ADMIN_PASSWORD)
  await page.evaluate(() => document.activeElement?.blur())
  await page.addStyleTag({ content: HIDE_SCROLLBARS })
  await page.mouse.move(0, 0)
  await page.waitForTimeout(600)
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
    deviceScaleFactor: 2,
    bypassCSP: true,
    timezoneId: TIMEZONE,
    recordVideo: { dir: OUT, size: { width: VIDEO_VIEWPORT.width * 2, height: VIDEO_VIEWPORT.height * 2 } },
  })
  await context.clock.install({ time: simNow })
  const { serverWrites } = await prepareWizardContext({ context, timeZone: TIMEZONE, simNow })
  const page = await context.newPage()
  const startedAt = Date.now()
  await openWizard(page)
  await page.addStyleTag({ content: HIDE_SCROLLBARS })
  await installCursor(page)
  await cursorTo(page, 640, 120)
  const settledAt = Date.now()

  await tourWelcome(page)
  await tourTvheadend(page)
  const channelsDoneAt = await tourChannels(page)
  await tourGuide(page)
  await tourStorage(page)
  await tourPlex(page)
  await tourReady(page)

  const video = page.video()
  await context.close()
  if (video) {
    const dest = join(OUT, 'wizard.webm')
    await rename(await video.path(), dest)
    console.log(`TOUR_WEBM=${dest}`)
  }
  console.log(`TOUR_TRIM=${((settledAt - startedAt) / 1000 + 0.4).toFixed(1)}`)
  console.log(`TOUR_POSTER=${((channelsDoneAt - startedAt) / 1000 + POSTER_AFTER_CHANNELS_S).toFixed(1)}`)
  return serverWrites
}

const tourWelcome = async (page) => {
  await page.waitForTimeout(1000)
  await cursorToBox(page, page.locator('#time-zone-select'))
  await page.waitForTimeout(1000)
  await pressNext(page, 'TVHEADEND')
}

const tourTvheadend = async (page) => {
  await page.waitForSelector('.status-readout.ok:has-text("Found TVHeadend")', { timeout: 10_000 })
  await waitForSecureForm(page)
  await page.waitForTimeout(1000)
  await typeInto(page, secureField(page, 'Admin password'), ADMIN_PASSWORD)
  await typeInto(page, secureField(page, 'Confirm password'), ADMIN_PASSWORD)
  await cursorToBox(page, secureField(page, 'Allowed networks'))
  await page.waitForTimeout(600)
  await tap(page, page.locator('.btn-primary', { hasText: 'SECURE TVHEADEND AND CONNECT FREETVARR' }))
  await cursorTo(page, 1180, 300)
  await page.waitForSelector('.status-readout.ok:has-text("TVHeadend is secured")', { timeout: JOB_TIMEOUT_MS })
  await page.waitForSelector('.status-readout.ok:has-text("Connected")', { timeout: 10_000 })
  await revealBottom(page)
  await page.waitForTimeout(1400)
  await pressNext(page, 'CHANNELS')
}

const tourChannels = async (page) => {
  const find = page.locator('.btn-primary', { hasText: 'FIND CHANNELS' })
  await find.waitFor({ timeout: 15_000 })
  await page.waitForTimeout(600)
  await cursorToBox(page, page.locator('#channel-transmitter'))
  await page.waitForTimeout(900)
  await tap(page, find)
  await cursorTo(page, 1180, 330)
  await page.waitForSelector('.status-readout.ok:has-text("Added")', { timeout: JOB_TIMEOUT_MS })
  const doneAt = Date.now()
  await page.waitForTimeout(1600)
  await pressNext(page, 'GUIDE')
  return doneAt
}

const tourGuide = async (page) => {
  const setUp = page.locator('.btn-primary', { hasText: 'SET UP GUIDE' })
  await setUp.waitFor({ timeout: 15_000 })
  await page.waitForTimeout(600)
  await cursorToBox(page, page.locator('#guide-feed'))
  await page.waitForTimeout(900)
  await tap(page, setUp)
  await cursorTo(page, 1180, 330)
  await page.waitForSelector('.status-readout.ok:has-text("channels have a guide")', { timeout: JOB_TIMEOUT_MS })
  await page.waitForTimeout(1000)
  for (const pick of GUIDE_PICKS) await pickGuide(page, pick)
  await tap(page, page.locator('.panel-body .btn', { hasText: 'SAVE LINKS' }))
  await page.waitForSelector('.status-readout.ok:has-text("Linked")', { timeout: 10_000 })
  await page.waitForTimeout(800)
  await glideScroll(page, { dy: -2000, ms: 900 })
  await page.waitForTimeout(700)
  await pressNext(page, 'STORAGE')
}

const pickGuide = async (page, { channel, guide }) => {
  const select = page.locator('.panel-body div.grid', { has: page.locator('label', { hasText: new RegExp(`^${channel}\\b`) }) })
    .locator('select')
  if (!(await select.count())) return console.log(`  no unmatched channel ${channel}`)
  await revealLocator(page, select)
  await clickRing(page, select)
  await page.waitForTimeout(300)
  await select.selectOption({ label: guide })
  await page.waitForTimeout(700)
}

const tourStorage = async (page) => {
  await page.waitForTimeout(700)
  const testButtons = page.locator('.panel-body .btn-sm')
  await tap(page, testButtons.nth(0))
  await page.waitForSelector('.status-readout.ok:has-text("writable")', { timeout: 10_000 })
  await page.waitForTimeout(700)
  await tap(page, testButtons.nth(1))
  await page.waitForSelector('.status-readout.ok:has-text("readable")', { timeout: 10_000 })
  await page.waitForTimeout(700)
  await tap(page, testButtons.nth(2))
  await page.waitForSelector('.status-readout.ok:has-text("TVHeadend records to")', { timeout: 10_000 })
  await page.waitForTimeout(1000)
  await pressNext(page, 'PLEX')
}

const tourPlex = async (page) => {
  await page.waitForTimeout(700)
  await tap(page, page.locator('.panel-body .btn', { hasText: 'AUTO-DISCOVER PLEX' }))
  await page.waitForSelector('.status-readout.ok:has-text("Selected")', { timeout: 10_000 })
  await page.waitForTimeout(500)
  await tap(page, page.locator('.panel-body .btn-sm', { hasText: 'AUTO-DETECT TOKEN' }))
  await page.waitForSelector('.status-readout.ok:has-text("Token detected")', { timeout: 10_000 })
  const section = page.locator('.panel-body select.field-input')
  await section.waitFor({ timeout: 10_000 })
  await page.waitForTimeout(600)
  await revealLocator(page, section)
  await clickRing(page, section)
  await page.waitForTimeout(300)
  await section.selectOption('2')
  await page.waitForTimeout(900)
  await pressNext(page, 'READY')
}

const tourReady = async (page) => {
  await page.waitForTimeout(1000)
  await cursorToBox(page, page.locator('.panel-body .btn-primary', { hasText: 'OPEN TV GUIDE' }))
  await page.waitForTimeout(2200)
}

const openWizard = async (page) => {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.panel-title:has-text("WELCOME")', { timeout: 20_000 })
  await page.waitForSelector('#time-zone-select', { timeout: 10_000 })
}

const waitForSecureForm = (page) =>
  page.waitForSelector('text=This TVHeadend has no logins yet', { timeout: 15_000 })

const secureField = (page, label) =>
  page.locator('.panel-body .field-row', { has: page.locator('.field-label', { hasText: label }) }).locator('input')

const pressNext = async (page, nextTitle) => {
  const next = page.locator('.panel-body .btn-primary').last()
  await tap(page, next)
  await page.waitForSelector(`.panel-title:has-text("${nextTitle}")`, { timeout: 15_000 })
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.waitForTimeout(500)
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

const clickRing = async (page, locator) => {
  await cursorToBox(page, locator)
  await page.waitForTimeout(180)
  await page.evaluate(() => window.__wt?.click())
}

const revealLocator = async (page, locator) => {
  const box = await locator.boundingBox().catch(() => null)
  if (!box) return
  const height = page.viewportSize().height
  const below = box.y + box.height - (height - EDGE_MARGIN_PX)
  const above = box.y - EDGE_MARGIN_PX
  const dy = below > 0 ? below : above < 0 ? above : 0
  if (!dy) return
  await glideScroll(page, { dy, ms: 900 })
  await page.waitForTimeout(250)
}

const revealBottom = async (page) => {
  await revealLocator(page, page.locator('.panel-body .btn-primary').last())
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
