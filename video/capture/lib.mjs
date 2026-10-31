import { chromium } from 'playwright'
import { startScreencast } from './capture-screencast.mjs'

export const BASE = process.env.FTV_URL || 'http://127.0.0.1:3857'
const SCRATCH_PREFIX = new URL('../stack/', import.meta.url).pathname
const FEED_URL = 'http://192.168.86.246:3890/xmltv.xml'

export const openBrowser = async ({ width = 1280, height = 800, scale = 1.25, mobile = false } = {}) => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] })
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: scale, isMobile: mobile, hasTouch: mobile,
  })
  await context.addInitScript(tidyText, { prefix: SCRATCH_PREFIX, feed: FEED_URL })
  await context.route('**/api/discover-plex', (r) => r.fulfill({ json: [] }))
  await context.route('**/api/health-summary**', async (r) => {
    const res = await r.fetch()
    const body = await res.json()
    r.fulfill({ response: res, json: { ...body, level: 'ok', sentence: '' } })
  })
  await context.route('**/api/doctor**', async (r) => {
    const res = await r.fetch()
    const body = await res.json()
    const checks = (body.checks || []).map((c) => (c.status === 'fail' || c.status === 'warn' ? { ...c, status: 'pass', fix: '' } : c))
    const summary = { pass: checks.filter((c) => c.status === 'pass').length, warn: 0, fail: 0, skip: checks.filter((c) => c.status === 'skip').length }
    r.fulfill({ response: res, json: { ...body, checks, summary } })
  })
  const page = await context.newPage()
  return { browser, context, page }
}

const tidyText = ({ prefix, feed }) => {
  const fix = (s) => s.split(prefix).join('/data/').split(feed).join('https://guide.example/tv/xmltv.xml')
  const walk = (node) => {
    if (node.nodeType === 3) {
      if (node.nodeValue.includes(prefix) || node.nodeValue.includes(feed)) node.nodeValue = fix(node.nodeValue)
      return
    }
    if (node.nodeType === 1 && (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') && node.value
      && (node.value.includes(prefix) || node.value.includes(feed))) node.value = fix(node.value)
    node.childNodes?.forEach(walk)
  }
  new MutationObserver((records) => records.forEach((r) => {
    if (r.type === 'characterData') walk(r.target)
    r.addedNodes?.forEach(walk)
  })).observe(document, { subtree: true, childList: true, characterData: true })
  setInterval(() => document.body && document.querySelectorAll('input').forEach(walk), 100)
}

export const record = async ({ page, dir }) => startScreencast({ page, dir })

export const installCursor = (page) => page.evaluate(() => {
  if (document.getElementById('__wtc')) return
  const c = document.createElement('div')
  c.id = '__wtc'
  c.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;' +
    'transition:transform .7s cubic-bezier(.22,.61,.36,1);transform:translate(1400px,900px)'
  c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M5 3 L5 19 L9.5 14.5 L12.5 21 L15 20 L12 13.5 L18.5 13.5 Z" ' +
    'fill="#f2f5f7" stroke="#0b1117" stroke-width="1.3" stroke-linejoin="round"/></svg>'
  document.body.appendChild(c)
  const ring = document.createElement('div')
  ring.style.cssText = 'position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;' +
    'border:3px solid #5ce1c6;opacity:0;pointer-events:none;z-index:2147483646;transition:none'
  document.body.appendChild(ring)
  window.__wt = {
    move: (x, y) => { c.style.transform = `translate(${x - 4}px,${y - 2}px)`; window.__wt.x = x; window.__wt.y = y },
    click: () => {
      ring.style.left = `${window.__wt.x}px`; ring.style.top = `${window.__wt.y}px`
      ring.animate([{ opacity: 0.9, transform: 'scale(.5)' }, { opacity: 0, transform: 'scale(1.4)' }], { duration: 450, easing: 'ease-out' })
    },
  }
})

export const cursorTo = async (page, x, y) => {
  await installCursor(page)
  await page.evaluate(([x, y]) => window.__wt.move(x, y), [x, y])
  await page.waitForTimeout(750)
  await page.mouse.move(x, y)
}

export const cursorToBox = async (page, locator) => {
  const box = await locator.boundingBox()
  if (!box) throw new Error('no box')
  const x = Math.round(box.x + box.width / 2)
  const y = Math.round(box.y + box.height / 2)
  await cursorTo(page, x, y)
  return { x, y }
}

export const clickWithCursor = async (page, locator, { dwell = 250 } = {}) => {
  await cursorToBox(page, locator)
  await page.waitForTimeout(dwell)
  await page.evaluate(() => window.__wt.click())
  await locator.click()
}

export const glide = (page, { selector = null, dx = 0, dy = 0, ms = 1400 }) => page.evaluate(({ selector, dx, dy, ms }) => new Promise((resolve) => {
  const el = selector ? document.querySelector(selector) : document.scrollingElement
  if (!el) return resolve(false)
  const from = { x: el.scrollLeft, y: el.scrollTop }
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
  const start = performance.now()
  const step = () => {
    const p = Math.min(1, (performance.now() - start) / ms)
    el.scrollLeft = from.x + dx * ease(p)
    el.scrollTop = from.y + dy * ease(p)
    if (p < 1) requestAnimationFrame(step)
    else resolve(true)
  }
  requestAnimationFrame(step)
}), { selector, dx, dy, ms })

export const wait = (page, ms) => page.waitForTimeout(ms)
