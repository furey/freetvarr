import { chromium } from 'playwright'
import { join } from 'node:path'
import { rename } from 'node:fs/promises'
import { TIMEZONE, simulatedNow, prepareDemoContext, onAirCell, waitForImages } from './capture-demo-api.mjs'

const BASE = (process.env.FREETVARR_URL || 'http://localhost:3733').replace(/\/$/, '')
const OUT = process.env.WALKTHROUGH_OUT || '/work'
const VIEWPORT = { width: 1280, height: 800 }
const SCROLL_MS = 1600
const VIEW_REVEAL_MS = 850
const LIVE_PLAY_MS = 3500
const POSTER_AFTER_PLAY_S = 2.5

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

const cursorToBox = async (page, locator) => {
  const box = await locator.boundingBox().catch(() => null)
  if (!box) return false
  await cursorTo(page, Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2))
  return true
}

const clickWithCursor = async (page, locator) => {
  if (!(await cursorToBox(page, locator))) return false
  await page.waitForTimeout(180)
  await page.evaluate(() => window.__wt?.click())
  await locator.click()
  return true
}

const clickTab = async (page, route) => {
  const link = page.locator(`.tab-strip a[href="#/${route}"]`)
  await cursorToBox(page, link)
  await page.waitForTimeout(220)
  await page.evaluate(() => window.__wt?.click())
  await Promise.all([
    page.waitForFunction(
      (r) => document.querySelector(`.tab-strip a[href="#/${r}"]`)?.dataset.active === 'true',
      route,
      { timeout: 8000 },
    ),
    link.click(),
  ])
  await page.waitForTimeout(VIEW_REVEAL_MS)
}

const glideScroll = (page, { selector = null, dx = 0, dy = 0, ms = SCROLL_MS }) =>
  page.evaluate(({ selector, dx, dy, ms }) => new Promise((resolve) => {
    const el = selector ? document.querySelector(selector) : document.scrollingElement
    if (!el) return resolve()
    const clamp = (v, max) => Math.max(0, Math.min(v, max))
    const from = { x: el.scrollLeft, y: el.scrollTop }
    const to = {
      x: clamp(from.x + dx, el.scrollWidth - el.clientWidth),
      y: clamp(from.y + dy, el.scrollHeight - el.clientHeight),
    }
    const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
    const startedAt = performance.now()
    const step = () => {
      const progress = Math.min(1, (performance.now() - startedAt) / ms)
      const eased = easeInOut(progress)
      el.scrollTo({
        left: from.x + (to.x - from.x) * eased,
        top: from.y + (to.y - from.y) * eased,
        behavior: 'instant',
      })
      if (progress < 1) requestAnimationFrame(step)
      else resolve()
    }
    requestAnimationFrame(step)
  }), { selector, dx, dy, ms })

const scrollDownAndBack = async (page, { dy, hold = 600 }) => {
  await glideScroll(page, { dy })
  await page.waitForTimeout(hold)
  await glideScroll(page, { dy: -dy })
  await page.waitForTimeout(400)
}

const watchLiveBriefly = async (page, watchButton) => {
  if (!(await clickWithCursor(page, watchButton))) return null
  await cursorTo(page, 1240, 760)
  await page.waitForSelector('.live-video:not(.is-veiled)', { timeout: 20000 }).catch(() => {})
  const playingAt = Date.now()
  await page.waitForTimeout(LIVE_PLAY_MS)
  await clickWithCursor(page, page.locator('.live-modal .btn-danger')).catch(() => {})
  await page.waitForTimeout(700)
  return playingAt
}

const run = async () => {
  const simNow = simulatedNow()
  console.log(`simulated now: ${new Date(simNow).toString()}`)
  const browser = await chromium.launch({ args: ['--font-render-hinting=none'] })
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
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

  await page.waitForTimeout(1400)
  const dashboardWatch = page.locator('.panel-body .btn-watch:not(.live-row-watch)').first()
  const playingAt = await watchLiveBriefly(page, dashboardWatch)

  await clickTab(page, 'live')
  await page.waitForSelector('.live-row', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(900)
  await cursorToBox(page, page.locator('.live-row.pinned .live-row-now').first())
  await page.waitForTimeout(400)
  await scrollDownAndBack(page, { dy: 300 })
  const channelsButton = page.locator('.panel-header button', { hasText: 'CHANNELS' })
  if (await clickWithCursor(page, channelsButton)) {
    await page.waitForSelector('.epg-modal', { timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(1200)
    await clickWithCursor(page, page.locator('.epg-modal-x')).catch(() => {})
    await page.waitForTimeout(500)
  }

  await clickTab(page, 'guide')
  await page.waitForSelector('.epg-cell', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(1000)
  const onNowCell = onAirCell(page, picks.programme)
  if (await clickWithCursor(page, onNowCell)) {
    await page.waitForSelector('.epg-modal .programme-image.hero img', { timeout: 8000 }).catch(() => {})
    await waitForImages(page, '.epg-modal img')
    await page.waitForTimeout(2200)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  }
  await glideScroll(page, { selector: '.epg-scroll', dx: 420, ms: 2000 })
  await page.waitForTimeout(500)
  const searchInput = page.locator('input[placeholder^="Search"]')
  if (picks.searchTerm && (await clickWithCursor(page, searchInput))) {
    await searchInput.pressSequentially(picks.searchTerm, { delay: 70 })
    await page.waitForSelector('.deck-card', { timeout: 5000 }).catch(() => {})
    await waitForImages(page, '.deck-card .programme-image img')
    await page.waitForTimeout(1600)
    await searchInput.press('ControlOrMeta+a')
    await searchInput.press('Delete')
    await page.waitForTimeout(700)
  }

  await clickTab(page, 'shows')
  await page.waitForSelector('.deck-table tbody tr, .deck-card', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(1500)

  await clickTab(page, 'recordings')
  await page.waitForSelector('.deck-table tbody tr, .deck-card', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(700)
  await scrollDownAndBack(page, { dy: 240 })

  await clickTab(page, 'syncs')
  await page.waitForSelector('.deck-table tbody tr, .deck-card', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(1500)

  await clickTab(page, 'settings')
  await page.waitForSelector('.panel-title', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(600)
  await scrollDownAndBack(page, { dy: 320 })

  await clickTab(page, 'dashboard')
  await page.waitForSelector('.panel-title', { timeout: 8000 }).catch(() => {})
  await cursorTo(page, 250, 96)
  await page.waitForTimeout(500)
  await scrollDownAndBack(page, { dy: 360 })
  await page.waitForTimeout(400)

  const video = page.video()
  await context.close()
  if (video) {
    const dest = join(OUT, 'walkthrough.webm')
    await rename(await video.path(), dest)
    console.log(`TOUR_WEBM=${dest}`)
  }
  await browser.close()
  const trim = (settledAt - startedAt) / 1000 + 0.4
  console.log(`TOUR_TRIM=${trim.toFixed(1)}`)
  if (playingAt) console.log(`TOUR_POSTER=${((playingAt - startedAt) / 1000 + POSTER_AFTER_PLAY_S).toFixed(1)}`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
