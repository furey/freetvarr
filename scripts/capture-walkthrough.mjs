import { chromium } from 'playwright'
import { join } from 'node:path'
import { rename } from 'node:fs/promises'
import { TIMEZONE, simulatedNow, prepareDemoContext, onAirCell, waitForImages } from './capture-demo-api.mjs'

const BASE = (process.env.FREETVARR_URL || 'http://localhost:3733').replace(/\/$/, '')
const OUT = process.env.WALKTHROUGH_OUT || '/work'
const VIEWPORT = { width: 1280, height: 800 }

const installCursor = (page) =>
  page.evaluate(() => {
    const c = document.createElement('div')
    c.id = '__wtc'
    c.style.cssText =
      'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;' +
      'transition:transform .6s cubic-bezier(.22,.61,.36,1);transform:translate(-80px,-80px)'
    c.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24">' +
      '<path d="M5 3 L5 19 L9.5 14.5 L12.5 21 L15 20 L12 13.5 L18.5 13.5 Z" ' +
      'fill="#fffcfb" stroke="#1a1611" stroke-width="1.3" stroke-linejoin="round"/></svg>'
    document.body.appendChild(c)
    window.__wt = {
      x: -80,
      y: -80,
      move(x, y) {
        this.x = x
        this.y = y
        c.style.transform = `translate(${x}px,${y}px)`
      },
      click() {
        const r = document.createElement('div')
        r.style.cssText =
          `position:fixed;left:${this.x}px;top:${this.y}px;width:10px;height:10px;` +
          'margin:-5px 0 0 -5px;border-radius:50%;border:2px solid #1eb6ff;' +
          'z-index:2147483646;pointer-events:none;opacity:.9;' +
          'transition:transform .5s ease-out,opacity .5s ease-out'
        document.body.appendChild(r)
        requestAnimationFrame(() => {
          r.style.transform = 'scale(4)'
          r.style.opacity = '0'
        })
        setTimeout(() => r.remove(), 600)
      },
    }
  })

const cursorTo = async (page, x, y) => {
  await page.evaluate(([x, y]) => window.__wt?.move(x, y), [x, y])
  await page.waitForTimeout(680)
}

const clickTab = async (page, route) => {
  const link = page.locator(`.tab-strip a[href="#/${route}"]`)
  const box = await link.boundingBox()
  if (box) await cursorTo(page, Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2))
  await page.evaluate(() => window.__wt?.click())
  await Promise.all([
    page.waitForFunction(
      (r) => document.querySelector(`.tab-strip a[href="#/${r}"]`)?.dataset.active === 'true',
      route,
      { timeout: 8000 },
    ),
    link.click(),
  ])
  await page.waitForTimeout(500)
}

const run = async () => {
  const simNow = simulatedNow()
  console.log(`simulated now: ${new Date(simNow).toString()}`)
  const browser = await chromium.launch({ args: ['--font-render-hinting=none'] })
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    bypassCSP: true,
    timezoneId: TIMEZONE,
    recordVideo: { dir: OUT, size: VIEWPORT },
  })
  const picks = await prepareDemoContext({ context, base: BASE, simNow })
  console.log(`programme: ${picks.programme.program.title} on ${picks.programme.channel.name}; search: ${picks.searchTerm}`)

  const page = await context.newPage()
  const startedAt = Date.now()
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.tab-strip a[href="#/dashboard"]', { timeout: 20000 })
  await page.waitForSelector('.panel-title', { timeout: 20000 })
  await waitForImages(page, '.rec-card img')
  await page.addStyleTag({
    content: '::-webkit-scrollbar{width:0!important;height:0!important}html,body{scrollbar-width:none!important}',
  })
  await installCursor(page)
  await cursorTo(page, 250, 96)
  await page.waitForTimeout(400)
  const settledAt = Date.now()

  await page.waitForTimeout(2200)

  await clickTab(page, 'live')
  await page.waitForSelector('.live-row', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(1400)
  const favouriteNow = page.locator('.live-row.pinned .live-row-now').first()
  const favouriteBox = await favouriteNow.boundingBox().catch(() => null)
  if (favouriteBox) {
    await cursorTo(page, Math.round(favouriteBox.x + favouriteBox.width / 2), Math.round(favouriteBox.y + favouriteBox.height / 2))
    await page.waitForTimeout(1000)
  }
  await page.mouse.wheel(0, 300)
  await page.waitForTimeout(1800)
  await page.mouse.wheel(0, -300)
  await page.waitForTimeout(700)
  const channelsButton = page.locator('.panel-header button', { hasText: 'CHANNELS' })
  const channelsBox = await channelsButton.boundingBox().catch(() => null)
  if (channelsBox) {
    await cursorTo(page, Math.round(channelsBox.x + channelsBox.width / 2), Math.round(channelsBox.y + channelsBox.height / 2))
    await page.evaluate(() => window.__wt?.click())
    await channelsButton.click()
    await page.waitForSelector('.epg-modal', { timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(2000)
    const closeButton = page.locator('.epg-modal-x')
    const closeBox = await closeButton.boundingBox().catch(() => null)
    if (closeBox) await cursorTo(page, Math.round(closeBox.x + closeBox.width / 2), Math.round(closeBox.y + closeBox.height / 2))
    await page.evaluate(() => window.__wt?.click())
    await closeButton.click().catch(() => {})
    await page.waitForTimeout(500)
  }
  const watchButton = page.locator('.live-row.pinned .live-row-watch').first()
  const watchBox = await watchButton.boundingBox().catch(() => null)
  if (watchBox) {
    await cursorTo(page, Math.round(watchBox.x + watchBox.width / 2), Math.round(watchBox.y + watchBox.height / 2))
    await page.evaluate(() => window.__wt?.click())
    await watchButton.click()
    await cursorTo(page, 1240, 760)
    await page.waitForSelector('.live-video:not(.is-veiled)', { timeout: 20000 }).catch(() => {})
    await page.waitForTimeout(5000)
    const stopButton = page.locator('.live-modal .btn-danger')
    const stopBox = await stopButton.boundingBox().catch(() => null)
    if (stopBox) await cursorTo(page, Math.round(stopBox.x + stopBox.width / 2), Math.round(stopBox.y + stopBox.height / 2))
    await page.evaluate(() => window.__wt?.click())
    await stopButton.click().catch(() => {})
    await page.waitForTimeout(700)
  }

  await clickTab(page, 'guide')
  await page.waitForSelector('.epg-cell', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(1600)
  const onNowCell = onAirCell(page, picks.programme)
  const cellBox = await onNowCell.boundingBox().catch(() => null)
  if (cellBox) {
    await cursorTo(page, Math.round(cellBox.x + cellBox.width / 2), Math.round(cellBox.y + cellBox.height / 2))
    await page.evaluate(() => window.__wt?.click())
    await onNowCell.click()
    await page.waitForSelector('.epg-modal .programme-image.hero img', { timeout: 8000 }).catch(() => {})
    await waitForImages(page, '.epg-modal img')
    await page.waitForTimeout(3200)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  }
  const scrollBox = await page.locator('.epg-scroll').boundingBox().catch(() => null)
  if (scrollBox) {
    await page.mouse.move(scrollBox.x + scrollBox.width / 2, scrollBox.y + scrollBox.height / 2)
    await page.mouse.wheel(420, 0)
    await page.waitForTimeout(1400)
  }
  const searchInput = page.locator('input[placeholder^="Search"]')
  const searchBox = await searchInput.boundingBox().catch(() => null)
  if (searchBox && picks.searchTerm) {
    await cursorTo(page, Math.round(searchBox.x + searchBox.width / 2), Math.round(searchBox.y + searchBox.height / 2))
    await page.evaluate(() => window.__wt?.click())
    await searchInput.click()
    await searchInput.pressSequentially(picks.searchTerm, { delay: 90 })
    await page.waitForSelector('.deck-card', { timeout: 5000 }).catch(() => {})
    await waitForImages(page, '.deck-card .programme-image img')
    await page.waitForTimeout(2600)
    await searchInput.press('ControlOrMeta+a')
    await searchInput.press('Delete')
    await page.waitForTimeout(700)
  }

  await clickTab(page, 'shows')
  await page.waitForSelector('.deck-table tbody tr, .deck-card', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(2600)

  await clickTab(page, 'recordings')
  await page.waitForSelector('.deck-table tbody tr, .deck-card', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(1400)
  await page.mouse.wheel(0, 240)
  await page.waitForTimeout(1800)
  await page.mouse.wheel(0, -240)
  await page.waitForTimeout(600)

  await clickTab(page, 'syncs')
  await page.waitForSelector('.deck-table tbody tr, .deck-card', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(2600)

  await clickTab(page, 'settings')
  await page.waitForSelector('.panel-title', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(1200)
  await page.mouse.wheel(0, 320)
  await page.waitForTimeout(1800)
  await page.mouse.wheel(0, -320)
  await page.waitForTimeout(600)

  await clickTab(page, 'dashboard')
  await page.waitForSelector('.panel-title', { timeout: 8000 }).catch(() => {})
  await cursorTo(page, 250, 96)
  await page.waitForTimeout(1200)
  await page.mouse.wheel(0, 360)
  await page.waitForTimeout(1800)
  await page.mouse.wheel(0, -360)
  await page.waitForTimeout(1000)

  const video = page.video()
  await context.close()
  if (video) {
    const dest = join(OUT, 'walkthrough.webm')
    await rename(await video.path(), dest)
    console.log(`TOUR_WEBM=${dest}`)
  }
  await browser.close()
  console.log(`TOUR_TRIM=${((settledAt - startedAt) / 1000 + 0.4).toFixed(1)}`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
