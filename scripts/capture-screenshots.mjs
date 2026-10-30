import { chromium } from 'playwright'
import { TIMEZONE, simulatedNow, prepareDemoContext, waitForProgrammeImages } from './capture-demo-api.mjs'
import { startLoopback } from './capture-loopback.mjs'

const SERVER_URL = (process.env.FREETVARR_URL || 'http://localhost:3733').replace(/\/$/, '')
const OUT = process.env.SCREENSHOT_OUT || '/work/docs/img'
const ONLY = (process.env.SHOT_FILTER || '').trim()
const DESKTOP_VIEWPORT = { width: 1280, height: 936 }
const MOBILE_VIEWPORT = { width: 390, height: 844 }
const LIVE_SHOT_AT_S = 4
const CONTROLS_FADE_MS = 4500

const DESKTOP_SHOTS = [
  { hash: '#/home', file: 'screenshot-dashboard.png', wait: '.home-hero, .home-row' },
  { hash: '#/settings/system/series', file: 'screenshot-series.png', wait: '.settings-page' },
  { hash: '#/settings/system/activity', file: 'screenshot-syncs.png', wait: '.settings-page' },
  { hash: '#/recordings', file: 'screenshot-recordings.png', wait: '.library-shelf, .library-grid' },
  { hash: '#/settings/storage', file: 'screenshot-settings.png', wait: '.settings-page' },
  { hash: '#/settings/plex', file: 'screenshot-plex.png', wait: '.settings-page', prepare: (page) => scrollToText(page, 'Watched state') },
  { hash: '#/settings/arr', file: 'screenshot-arr.png', wait: '.settings-page' },
  { hash: '#/guide', file: 'screenshot-guide.png', wait: '.epg-cell' },
  { hash: '#/guide', file: 'screenshot-programme.png', wait: '.epg-cell', prepare: (page, picks) => openProgramme(page, picks.upNext ?? picks.programme) },
  { hash: '#/guide', file: 'screenshot-programme-movie.png', wait: '.epg-cell', prepare: (page, picks) => openProgramme(page, picks.upNextFilm) },
  { hash: '#/guide', file: 'screenshot-channels.png', wait: '.epg-cell', prepare: (page) => openChannelSettings(page) },
  { hash: '#/live', file: 'screenshot-live.png', wait: '.live-row, .live-list' },
  { hash: '#/live', file: 'screenshot-player.png', wait: '.live-row, .live-list', prepare: (page, picks) => playLive(page, picks) },
  { hash: '#/for-you', file: 'screenshot-for-you.png', wait: '.for-you-view, .fy-rail' },
  { hash: '#/recordings/scheduled', file: 'screenshot-scheduled.png', wait: '.scheduled-view, .ui-empty' },
  { hash: '#/recordings/show/:showcase', file: 'screenshot-show.png', wait: '.show-view, .show-hero' },
  { hash: '#/recordings/show/:scheduledOnly', file: 'screenshot-show-scheduled.png', wait: '.show-hero' },
  { hash: '#/recordings/show/:copyShow', file: 'screenshot-delete.png', wait: '.show-hero', prepare: (page, picks) => openEpisodeAction(page, { label: 'Delete episode', episode: picks.copyEpisode }) },
  { hash: '#/recordings/show/:showcase', file: 'screenshot-merge.png', wait: '.show-hero', prepare: (page) => openEpisodeAction(page, { label: 'Merge into another show…' }) },
]

const MOBILE_SHOTS = [
  { hash: '#/home', file: 'screenshot-mobile-dashboard.png', wait: '.home-hero, .home-row' },
  { hash: '#/settings/system/series', file: 'screenshot-mobile-series.png', wait: '.settings-page' },
  { hash: '#/recordings', file: 'screenshot-mobile-recordings.png', wait: '.library-shelf, .library-grid' },
  { hash: '#/guide', file: 'screenshot-mobile-guide.png', wait: '.epg-cell' },
  { hash: '#/live', file: 'screenshot-mobile-live.png', wait: '.live-row, .live-list' },
  { hash: '#/recordings/scheduled', file: 'screenshot-mobile-recording-banner.png', wait: '.ui-banner' },
  { hash: '#/live', file: 'screenshot-mobile-player.png', wait: '.live-row, .live-list', prepare: (page, picks) => playLive(page, picks) },
]

const HIDE_SCROLLBARS = `
  ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
  html, body { scrollbar-width: none !important; -ms-overflow-style: none !important; }
`

const filterShots = (shots) => ONLY
  ? shots.filter((s) => ONLY.split(',').some((only) => s.hash.includes(only) || s.file.includes(only)))
  : shots

const waitForAnimationsToSettle = (page) => page.waitForFunction(() => document.getAnimations()
  .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
  .every((a) => a.playState !== 'running'), null, { timeout: 5_000 }).catch(() => {})

const scrollToText = async (page, text) => {
  const target = page.getByText(text, { exact: false }).first()
  await target.waitFor({ timeout: 10_000 }).catch(() => {})
  await target.evaluate((el) => {
    const scroller = el.closest('.settings-content, .app-content, main') || document.scrollingElement
    const top = el.getBoundingClientRect().top - 120
    scroller.scrollBy({ top, behavior: 'instant' })
    window.scrollBy({ top: el.getBoundingClientRect().top - 120, behavior: 'instant' })
  }).catch(() => {})
}

const openProgramme = async (page, { program }) => {
  const cell = page.locator('.epg-cell', { hasText: program.title }).first()
  await cell.scrollIntoViewIfNeeded().catch(() => {})
  await cell.click()
  await page.waitForSelector('.programme-sheet, .ui-sheet', { timeout: 15_000 })
  await page.waitForTimeout(1200)
  await waitForProgrammeImages(page)
}

const openChannelSettings = async (page) => {
  const button = page.getByRole('button', { name: /channels/i }).first()
  await button.click()
  await page.waitForTimeout(1500)
}

const playLive = async (page, picks) => {
  const row = page.locator('.live-row, .live-list-row').filter({ hasText: 'Big Wave Season' }).first()
  await row.click()
  await page.mouse.move(0, 0)
  await page.waitForFunction((at) => [...document.querySelectorAll('video')].some((v) => v.currentTime >= at),
    LIVE_SHOT_AT_S, { timeout: 40_000 }).catch(() => console.log('  live video did not reach the shot time'))
  await page.mouse.move(0, 0)
  await page.waitForTimeout(CONTROLS_FADE_MS)
}

const resolveHash = (hash, picks) => hash
  .replace(':showcase', encodeURIComponent(picks.showcaseKey || ''))
  .replace(':scheduledOnly', encodeURIComponent(picks.scheduledOnlyKey || ''))
  .replace(':copyShow', encodeURIComponent(picks.copyShowKey || ''))

const showKeyOf = (title) => String(title ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

const libraryKeys = async ({ request, base }) => {
  const { shows = [] } = await (await request.get(`${base}/api/library/shows`)).json()
  const { series = [] } = await (await request.get(`${base}/api/series`)).json()
  const recordedKeys = new Set(shows.filter((s) => s.counts?.total > 0).map((s) => s.key))
  const scheduledOnly = series.find((s) => s.nextAiring && !recordedKeys.has(showKeyOf(s.title)))
  const showcase = shows.find((s) => s.nextAiring && s.counts?.total >= 4) ?? shows.find((s) => s.counts?.total >= 4) ?? shows[0]
  const details = await Promise.all(shows.map(async (show) => (await request.get(`${base}/api/library/shows/${encodeURIComponent(show.key)}`)).json()))
  const copyEpisodeOf = (detail) => (detail.seasons || []).flatMap((season) => season.episodes || []).find((e) => e.otherVersions?.length)
  const withCopy = details.find(copyEpisodeOf)
  return {
    showcaseKey: showcase?.key,
    scheduledOnlyKey: scheduledOnly ? showKeyOf(scheduledOnly.title) : null,
    copyShowKey: withCopy?.key ?? showcase?.key,
    copyEpisode: withCopy ? copyEpisodeOf(withCopy).episode : null,
  }
}

const openEpisodeAction = async (page, { label, episode = null }) => {
  const button = episode == null
    ? page.locator('.show-episode-more').first()
    : page.getByRole('button', { name: new RegExp(`^Actions for E${episode}( |$)`) }).first()
  await button.scrollIntoViewIfNeeded()
  await button.click()
  await page.getByRole('menuitem', { name: label }).or(page.getByRole('button', { name: label })).first().click()
  await page.waitForTimeout(1500)
}

const SIM_NOW = simulatedNow()
console.log(`simulated now: ${new Date(SIM_NOW).toString()}`)

const BASE = await startLoopback({ target: SERVER_URL })
const browser = await chromium.launch()

const captureAll = async (shots, viewport, { mobile = false } = {}) => {
  if (!shots.length) return
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    timezoneId: TIMEZONE,
    isMobile: mobile,
    hasTouch: mobile,
  })
  const picks = await prepareDemoContext({ context: ctx, base: BASE, simNow: SIM_NOW })
  Object.assign(picks, await libraryKeys({ request: ctx.request, base: BASE }))
  console.log(`programme: ${picks.programme.program.title} on ${picks.programme.channel.name}; show: ${picks.showcaseKey}; scheduled only: ${picks.scheduledOnlyKey}`)
  const page = await ctx.newPage()
  for (const shot of shots) {
    const url = `${BASE}/${resolveHash(shot.hash, picks)}`
    console.log(`→ ${url} @ ${viewport.width}×${viewport.height}`)
    await page.mouse.move(0, 0)
    await page.goto(`${BASE}/#/blank`, { waitUntil: 'domcontentloaded' })
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.waitForSelector(shot.wait, { timeout: 15_000 }).catch(() => console.log(`  no ${shot.wait}`))
    await page.waitForTimeout(1200)
    if (shot.prepare) {
      const prepared = await shot.prepare(page, picks).then(() => true).catch((err) => {
        console.log(`  SKIPPED ${shot.file}: ${err.message.split('\n')[0]}`)
        return false
      })
      if (!prepared) continue
    }
    await page.addStyleTag({ content: HIDE_SCROLLBARS })
    await waitForProgrammeImages(page)
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
await captureAll(filterShots(MOBILE_SHOTS), MOBILE_VIEWPORT, { mobile: true })

await browser.close()
console.log('done')
