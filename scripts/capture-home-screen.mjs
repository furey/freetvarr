import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { TIMEZONE, simulatedNow, prepareDemoContext, restartHeroCarousel, waitForImages } from './capture-demo-api.mjs'
import { startScreencast } from './capture-screencast.mjs'
import { startLoopback } from './capture-loopback.mjs'

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const ICON = `${REPO_ROOT}src/web/icon-512.png`
const SERVER_URL = (process.env.FREETVARR_URL || 'http://localhost:3733').replace(/\/$/, '')
const FRAMES_DIR = process.env.HOME_SCREEN_FRAMES || `${REPO_ROOT}scripts/.cache/frames/home-screen`
const DEVICE_SCALE = 2
const STAGE = { width: 1114, height: 918 }
const PAGE_BACKGROUND = '#1a1611'
const IPAD = {
  name: 'ipad',
  screen: { width: 1024, height: 768 },
  appViewport: { width: 1024, height: 738 },
  statusBarHeight: 30,
  screenRadius: 26,
  iconRadius: 22,
  columns: 4,
  rows: 3,
  lastRowItems: 2,
  dockGlyphs: [[3, 11], [9]],
}
const IPHONE = {
  name: 'iphone',
  screen: { width: 320, height: 692 },
  appViewport: { width: 390, height: 795 },
  statusBarHeight: 40,
  screenRadius: 40,
  iconRadius: 13,
  columns: 4,
  rows: 4,
  lastRowItems: 3,
  dockGlyphs: [[3, 11, 9]],
}
const HOME_HOLD_MS = 1800
const DEVICE_STAGGER_MS = 750
const PRESS_MS = 220
const LAUNCH_MS = 560
const APP_FADE_DELAY_MS = 330
const APP_FADE_MS = 420
const APP_HOLD_MS = 3000
const SCROLLBARS_OFF = '::-webkit-scrollbar{width:0!important;height:0!important}html,body{scrollbar-width:none!important}'

const run = async () => {
  const browser = await chromium.launch({
    args: ['--font-render-hinting=none', `--force-device-scale-factor=${DEVICE_SCALE}`],
  })
  const base = await startLoopback({ target: SERVER_URL })
  const dashboards = {
    ipad: await captureDashboard({ browser, base, viewport: IPAD.appViewport }),
    iphone: await captureDashboard({ browser, base, viewport: IPHONE.appViewport, isMobile: true }),
  }
  const iconUri = `data:image/png;base64,${(await readFile(ICON)).toString('base64')}`
  const context = await browser.newContext({ viewport: STAGE, deviceScaleFactor: DEVICE_SCALE })
  const tab = await context.newPage()
  await tab.setContent(page({ iconUri, dashboards }))
  await waitForImages(tab, 'img')
  const screencast = await startScreencast({ page: tab, dir: FRAMES_DIR })
  await tab.waitForTimeout(HOME_HOLD_MS)
  await openApp(tab, IPHONE)
  await tab.waitForTimeout(DEVICE_STAGGER_MS - PRESS_MS)
  await openApp(tab, IPAD)
  await tab.waitForTimeout(APP_FADE_DELAY_MS + APP_FADE_MS + APP_HOLD_MS)
  await screencast.stop()
  await browser.close()
  console.log('TOUR_TRIM=0.2')
}

const captureDashboard = async ({ browser, base, viewport, isMobile = false }) => {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: DEVICE_SCALE,
    isMobile,
    hasTouch: isMobile,
    bypassCSP: true,
    timezoneId: TIMEZONE,
  })
  await prepareDemoContext({ context, base, simNow: simulatedNow() })
  const tab = await context.newPage()
  await tab.goto(`${base}/#/home`, { waitUntil: 'networkidle' })
  await tab.waitForSelector('a.app-nav-item:visible', { timeout: 20000 })
  await tab.addStyleTag({ content: SCROLLBARS_OFF })
  await waitForImages(tab, '.app-content img')
  await restartHeroCarousel(tab)
  await tab.waitForTimeout(1200)
  const shot = await tab.screenshot({ type: 'png' })
  await context.close()
  return `data:image/png;base64,${shot.toString('base64')}`
}

const openApp = async (tab, device) => {
  const timing = { pressMs: PRESS_MS, launchMs: LAUNCH_MS, fadeDelayMs: APP_FADE_DELAY_MS, fadeMs: APP_FADE_MS }
  await tab.evaluate(pressIcon, { name: device.name, ...timing })
  await tab.waitForTimeout(PRESS_MS)
  await tab.evaluate(launchApp, { name: device.name, iconRadius: device.iconRadius, screenRadius: device.screenRadius, ...timing })
}

const pressIcon = ({ name, pressMs }) => {
  const icon = document.querySelector(`.${name} .freetvarr .tile`)
  const touch = document.querySelector(`.${name}-touch`)
  const box = icon.getBoundingClientRect()
  touch.style.left = `${box.left + box.width / 2}px`
  touch.style.top = `${box.top + box.height / 2}px`
  touch.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)', offset: 0.35 }, { opacity: 0, transform: 'scale(1.1)' }], { duration: pressMs * 2, easing: 'ease-out', fill: 'forwards' })
  icon.animate([{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(.9)', filter: 'brightness(.7)', offset: 0.5 }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: pressMs, easing: 'ease-in-out' })
}

const launchApp = ({ name, iconRadius, screenRadius, launchMs, fadeDelayMs, fadeMs }) => {
  const device = document.querySelector(`.${name}`)
  const screen = device.querySelector('.screen')
  const icon = device.querySelector('.freetvarr .tile')
  const launch = device.querySelector('.launch')
  const from = icon.getBoundingClientRect()
  const area = screen.getBoundingClientRect()
  const spring = 'cubic-bezier(.3,.85,.25,1)'
  icon.style.visibility = 'hidden'
  launch.style.display = 'block'
  launch.animate([
    { left: `${from.left - area.left}px`, top: `${from.top - area.top}px`, width: `${from.width}px`, height: `${from.height}px`, borderRadius: `${iconRadius}px` },
    { left: '0px', top: '0px', width: `${area.width}px`, height: `${area.height}px`, borderRadius: `${screenRadius}px` },
  ], { duration: launchMs, easing: spring, fill: 'forwards' })
  launch.querySelector('img').animate([{ opacity: 1 }, { opacity: 0, offset: 0.35 }, { opacity: 0 }], { duration: launchMs, fill: 'forwards' })
  device.querySelector('.home').animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.12)', opacity: 0.3 }], { duration: launchMs, easing: spring, fill: 'forwards' })
  device.querySelector('.app-layer').animate([{ opacity: 0 }, { opacity: 1 }], { duration: fadeMs, delay: fadeDelayMs, easing: 'ease-out', fill: 'forwards' })
}

const statusClock = () => {
  const at = new Date(simulatedNow())
  const part = (options) => new Intl.DateTimeFormat('en-AU', { timeZone: TIMEZONE, ...options }).format(at)
  const [time, period] = part({ hour: 'numeric', minute: '2-digit', hour12: true }).split(/\s+/)
  return { time, period: (period || '').toUpperCase(), date: part({ weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '') }
}

const page = ({ iconUri, dashboards }) => `<!doctype html>
<html><head><meta charset="utf-8"><title>Home Screens</title>
<style>${styles()}</style></head>
<body><div class="stage">
${ipad({ iconUri, dashboardUri: dashboards.ipad })}
${iphone({ iconUri, dashboardUri: dashboards.iphone })}
<span class="touch ipad-touch"></span><span class="touch iphone-touch"></span>
</div></body></html>`

const ipad = ({ iconUri, dashboardUri }) => `
<div class="device ipad"><div class="camera"></div>${screen({ device: IPAD, iconUri, dashboardUri })}</div>`

const iphone = ({ iconUri, dashboardUri }) => `
<div class="device iphone">${screen({ device: IPHONE, iconUri, dashboardUri, notch: true })}</div>`

const screen = ({ device, iconUri, dashboardUri, notch = false }) => `
<div class="screen">
  <div class="home">
    <div class="grid">${gridItems({ device, iconUri })}</div>
    <div class="dots"><i class="on"></i><i></i></div>
    <div class="dock">${dock(device.dockGlyphs)}</div>
  </div>
  <div class="launch"><img src="${iconUri}" alt=""></div>
  <div class="app-layer"><img src="${dashboardUri}" alt=""></div>
  ${notch ? '<div class="notch"></div>' : ''}
  <div class="status">${statusBar(device)}</div>
</div>`

const statusBar = (device) => device === IPHONE
  ? `<span>${statusClock().time}</span><span class="status-right">${wifi()}${battery()}</span>`
  : `<span>${statusClock().time} ${statusClock().period}&nbsp;&nbsp;${statusClock().date}</span><span class="status-right">${wifi()}<span>82%</span>${battery()}</span>`

const dock = (groups) => groups
  .map((glyphs) => glyphs.map((glyph) => tile(glyph)).join(''))
  .join('<span class="dock-split"></span>')

const gridItems = ({ device, iconUri }) => {
  const total = device.columns * (device.rows - 1) + device.lastRowItems
  const greyItems = Array.from({ length: total - 1 }, (_, index) => app({ glyph: index, labelWidth: 0.4 + ((index * 37) % 42) / 100 }))
  return [...greyItems, freetvarr(iconUri)].join('')
}

const app = ({ glyph, labelWidth }) => `
<div class="app">${tile(glyph)}<span class="label-bar" style="width:calc(var(--icon) * ${labelWidth.toFixed(2)})"></span></div>`

const freetvarr = (iconUri) => `
<div class="app freetvarr">
  <img class="tile real" src="${iconUri}" alt="">
  <span class="label"><i class="new-dot"></i>Freetvarr</span>
</div>`

const tile = (glyph) => {
  const shade = TILE_SHADES[glyph % TILE_SHADES.length]
  return `<span class="tile" style="background:${shade}">${GLYPHS[glyph % GLYPHS.length]}</span>`
}

const TILE_SHADES = ['#4a453f', '#56514a', '#3f3b35', '#5d5750', '#4f4a43', '#615b53']

const svg = (body) => `<svg viewBox="0 0 60 60" aria-hidden="true">${body}</svg>`

const GLYPHS = [
  svg('<circle cx="30" cy="30" r="13" fill="none" stroke="currentColor" stroke-width="4"/>'),
  svg('<rect x="17" y="17" width="26" height="26" rx="5" fill="currentColor"/>'),
  svg('<path d="M30 15 L45 43 H15 Z" fill="currentColor"/>'),
  svg('<path d="M16 22 H44 M16 30 H44 M16 38 H34" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>'),
  svg('<g fill="currentColor"><rect x="16" y="16" width="12" height="12" rx="3"/><rect x="32" y="16" width="12" height="12" rx="3"/><rect x="16" y="32" width="12" height="12" rx="3"/><rect x="32" y="32" width="12" height="12" rx="3"/></g>'),
  svg('<circle cx="30" cy="30" r="14" fill="currentColor"/>'),
  svg('<path d="M15 40 L25 27 L32 35 L37 29 L45 40 Z" fill="currentColor"/><circle cx="38" cy="20" r="4" fill="currentColor"/>'),
  svg('<rect x="15" y="20" width="30" height="22" rx="4" fill="none" stroke="currentColor" stroke-width="4"/>'),
  svg('<path d="M30 14 V46 M14 30 H46" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>'),
  svg('<circle cx="30" cy="30" r="14" fill="none" stroke="currentColor" stroke-width="4"/><path d="M30 22 V30 L36 34" stroke="currentColor" stroke-width="4" stroke-linecap="round" fill="none"/>'),
  svg('<path d="M16 38 Q30 14 44 38" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>'),
  svg('<rect x="20" y="14" width="20" height="32" rx="4" fill="none" stroke="currentColor" stroke-width="4"/>'),
  svg('<path d="M18 30 L26 38 L43 21" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>')
]

const wifi = () => `<svg viewBox="0 0 20 14" width="17" height="12"><path d="M10 13 L6.6 9.4 A5 5 0 0 1 13.4 9.4 Z M3.6 6.5 A9.4 9.4 0 0 1 16.4 6.5 L15 8 A7.4 7.4 0 0 0 5 8 Z M0.6 3.4 A13.6 13.6 0 0 1 19.4 3.4 L18 4.9 A11.6 11.6 0 0 0 2 4.9 Z" fill="currentColor"/></svg>`

const battery = () => `<svg viewBox="0 0 27 13" width="25" height="12"><rect x="0.5" y="0.5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" stroke-opacity="0.45"/><rect x="2" y="2" width="16.5" height="9" rx="2" fill="currentColor"/><path d="M25 4.5 V8.5 A2 2 0 0 0 25 4.5 Z" fill="currentColor" fill-opacity="0.45"/></svg>`

const styles = () => `
:root { color-scheme: dark; }
html, body { margin: 0; background: ${PAGE_BACKGROUND}; overflow: hidden; }
body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif; }
.stage { position: relative; width: ${STAGE.width}px; height: ${STAGE.height}px; }
.device { position: absolute; background: #0e0c09; box-shadow: 0 0 0 1.5px #3d3829, 0 0 0 3px #0e0c09; }
.ipad { z-index: 1; left: 23px; top: 23px; padding: 22px; border-radius: 46px; box-shadow: 0 0 0 1.5px #3d3829, 0 0 0 3px #0e0c09, 0 22px 50px rgba(0,0,0,0.35); }
.iphone { z-index: 2; left: 564px; top: 175px; padding: 12px; border-radius: 52px; box-shadow: 0 0 0 1.5px #4a4434, 0 0 0 3px #0e0c09, -18px 34px 60px rgba(0,0,0,0.6), -6px 12px 22px rgba(0,0,0,0.45); }
.camera { position: absolute; top: 50%; left: 9px; width: 6px; height: 6px; margin-top: -3px; border-radius: 50%; background: #23201b; box-shadow: inset 0 0 0 1.5px #2e2a24; }
.screen { position: relative; overflow: hidden; color: #fffcfb;
  background:
    radial-gradient(120% 90% at 85% 110%, rgba(255,138,0,0.16), transparent 55%),
    radial-gradient(110% 80% at 10% -10%, rgba(30,182,255,0.14), transparent 55%),
    linear-gradient(160deg, #332d24 0%, #28231b 45%, #1a1611 100%); }
.ipad .screen { --icon: 95px; width: ${IPAD.screen.width}px; height: ${IPAD.screen.height}px; border-radius: ${IPAD.screenRadius}px; }
.iphone .screen { --icon: 54px; width: ${IPHONE.screen.width}px; height: ${IPHONE.screen.height}px; border-radius: ${IPHONE.screenRadius}px; }
.home { position: absolute; inset: 0; transform-origin: 50% 60%; }
.launch { display: none; position: absolute; z-index: 2; overflow: hidden; background: #1a1611; }
.launch img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.app-layer { position: absolute; inset: 0; z-index: 3; opacity: 0; background: #1a1611; }
.ipad .app-layer { padding-top: ${IPAD.statusBarHeight}px; }
.iphone .app-layer { padding-top: ${IPHONE.statusBarHeight}px; }
.app-layer img { display: block; width: 100%; }
.notch { position: absolute; z-index: 5; top: 0; left: 50%; width: 118px; height: 26px; margin-left: -59px; border-radius: 0 0 16px 16px; background: #0e0c09; }
.touch { position: absolute; z-index: 10; width: 64px; height: 64px; margin: -32px 0 0 -32px; border-radius: 50%; background: rgba(255,252,251,0.35); box-shadow: 0 0 0 1.5px rgba(255,252,251,0.5); opacity: 0; pointer-events: none; }
.iphone-touch { width: 44px; height: 44px; margin: -22px 0 0 -22px; }
.status { position: relative; z-index: 4; box-sizing: border-box; display: flex; justify-content: space-between; align-items: center; font-weight: 600; letter-spacing: 0.01em; }
.ipad .status { height: ${IPAD.statusBarHeight}px; padding: 0 26px; font-size: 14px; }
.iphone .status { height: ${IPHONE.statusBarHeight}px; padding: 4px 30px 0 34px; font-size: 14px; }
.status-right { display: flex; align-items: center; gap: 7px; font-size: 13px; }
.grid { display: grid; grid-template-columns: repeat(4, 1fr); }
.ipad .grid { row-gap: 42px; padding: 82px 150px 0; }
.iphone .grid { row-gap: 24px; padding: 70px 18px 0; }
.app { display: flex; flex-direction: column; align-items: center; gap: calc(var(--icon) * 0.095); }
.tile { box-sizing: border-box; display: grid; place-items: center; width: var(--icon); height: var(--icon); border-radius: calc(var(--icon) * 0.232); color: #8b837e; box-shadow: inset 0 0 0 1px rgba(255,252,251,0.06); }
.tile svg { width: 64%; height: 64%; }
.label-bar { display: block; height: calc(var(--icon) * 0.095); margin: calc(var(--icon) * 0.05) 0 3px; border-radius: 4px; background: rgba(176,168,158,0.32); }
.label { display: flex; align-items: center; gap: 5px; font-weight: 500; color: #fffcfb; text-shadow: 0 1px 2px rgba(0,0,0,0.5); }
.ipad .label { height: 18px; font-size: 16px; }
.iphone .label { height: 13px; font-size: 11px; gap: 3px; }
img.tile.real { display: block; box-shadow: 0 0 0 1.5px rgba(30,182,255,0.55), 0 0 22px 2px rgba(30,182,255,0.28), 0 2px 6px rgba(0,0,0,0.3); }
.app:not(.freetvarr) .tile { opacity: 0.85; }
.new-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #1eb6ff; }
.iphone .new-dot { width: 6px; height: 6px; }
.dots { position: absolute; left: 0; right: 0; display: flex; justify-content: center; gap: 9px; }
.ipad .dots { bottom: 146px; }
.iphone .dots { bottom: 108px; gap: 7px; }
.dots i { width: 7px; height: 7px; border-radius: 50%; background: rgba(255,252,251,0.3); }
.iphone .dots i { width: 6px; height: 6px; }
.dots i.on { background: rgba(255,252,251,0.85); }
.dock { position: absolute; left: 50%; transform: translateX(-50%); display: flex; align-items: center; background: rgba(255,252,251,0.1); box-shadow: inset 0 0 0 1px rgba(255,252,251,0.06); }
.ipad .dock { bottom: 16px; gap: 20px; padding: 14px 20px; border-radius: 34px; --icon: 85px; }
.iphone .dock { bottom: 10px; width: 296px; justify-content: space-around; padding: 12px 0; border-radius: 32px; }
.dock .tile { opacity: 0.85; }
.dock-split { width: 1px; height: 64px; background: rgba(255,252,251,0.18); }`

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
