import { chromium } from 'playwright'

const BASE = process.env.FREETVARR_URL || 'http://localhost:8124'
const OUT = process.env.SCREENSHOT_OUT || '/work/docs/img'
const ONLY = (process.env.SHOT_FILTER || '').trim()
const DESKTOP_VIEWPORT = { width: 1280, height: 936 }
const MOBILE_VIEWPORT = { width: 390, height: 844 }

const DESKTOP_SHOTS = [
  { hash: '#/dashboard',  file: 'screenshot-dashboard.png',  wait: '.panel-title' },
  { hash: '#/shows',      file: 'screenshot-shows.png',      wait: '.panel-title' },
  { hash: '#/syncs',      file: 'screenshot-syncs.png',      wait: '.panel-title' },
  { hash: '#/recordings', file: 'screenshot-recordings.png', wait: '.panel-title' },
  { hash: '#/settings',   file: 'screenshot-settings.png',   wait: '.panel-title' },
  { hash: '#/guide',      file: 'screenshot-guide.png',      wait: '.epg-cell' },
]

const MOBILE_SHOTS = [
  { hash: '#/dashboard',  file: 'screenshot-mobile-dashboard.png',  wait: '.panel-title' },
  { hash: '#/shows',      file: 'screenshot-mobile-shows.png',      wait: '.panel-title' },
  { hash: '#/recordings', file: 'screenshot-mobile-recordings.png', wait: '.panel-title' },
  { hash: '#/guide',      file: 'screenshot-mobile-guide.png',      wait: '.epg-cell' },
]

const SANITISED_SETTINGS = {
  fetch_ip: '192.168.1.50',
  plex_url: 'http://192.168.1.100:32400',
  plex_prefs_path: '/plex-preferences.xml',
  media_root: '/media/tv',
  fetch_cloud_activation_code: 'EX4MPL0CL0UDC0DE',
  fetch_cloud_terminal_id: 'fetcharr-ex4mple',
}

const DEMO_SHOWS = [
  { id: 1, fetch_show_pattern: 'Bluey', dest_folder: 'Bluey (2018)', season_template: 'Season {season}', enabled: true, delete_after_download: false, created_at: '2026-07-01 09:12:00', ad_removal: 'cut' },
  { id: 2, fetch_show_pattern: 'Gardening Australia', dest_folder: 'Gardening Australia', season_template: 'Season {season}', enabled: true, delete_after_download: true, created_at: '2026-06-20 18:00:00', ad_removal: 'detect' },
  { id: 3, fetch_show_pattern: 'MasterChef Australia', dest_folder: 'MasterChef Australia', season_template: 'Season {season}', enabled: true, delete_after_download: false, created_at: '2026-06-11 20:30:00', ad_removal: 'off' },
]

const DEMO_RECORDINGS = [
  { fetch_id: '201', show_id: 1, fetch_title: 'Bluey - S03E12 - Family Meeting', season: 3, episode: 12, file_path: '/media/tv/Bluey (2018)/Season 3/Bluey - S03E12.ts', size: 734003200, status: 'done', error: null, downloaded_at: '2026-07-14 21:03:11', deleted_from_fetch_at: null, ad_status: 'cut', ad_breaks_json: '[{"start":63.4,"end":210.8}]', ad_processed_at: '2026-07-14 21:20:00', show_pattern: 'Bluey', show_dest_folder: 'Bluey (2018)', progress: null },
  { fetch_id: '202', show_id: 1, fetch_title: 'Bluey - S03E11 - Whale Watching', season: 3, episode: 11, file_path: '/media/tv/Bluey (2018)/Season 3/Bluey - S03E11.ts', size: 712031232, status: 'done', error: null, downloaded_at: '2026-07-14 21:01:44', deleted_from_fetch_at: null, ad_status: 'detected', ad_breaks_json: '[{"start":63.4,"end":210.8},{"start":640.2,"end":770.6}]', ad_processed_at: '2026-07-14 21:18:00', show_pattern: 'Bluey', show_dest_folder: 'Bluey (2018)', progress: null },
  { fetch_id: '203', show_id: 2, fetch_title: 'Gardening Australia - S15E20', season: 15, episode: 20, file_path: '/media/tv/Gardening Australia/Season 15/Gardening Australia - S15E20.ts', size: 2952790016, status: 'done', error: null, downloaded_at: '2026-07-13 19:40:02', deleted_from_fetch_at: '2026-07-13 20:15:00', ad_status: 'no_breaks', ad_breaks_json: null, ad_processed_at: '2026-07-13 20:05:00', show_pattern: 'Gardening Australia', show_dest_folder: 'Gardening Australia', progress: null },
  { fetch_id: '204', show_id: 3, fetch_title: 'MasterChef Australia - S16E31', season: 16, episode: 31, file_path: null, size: null, status: 'downloading', error: null, downloaded_at: null, deleted_from_fetch_at: null, ad_status: null, ad_breaks_json: null, ad_processed_at: null, show_pattern: 'MasterChef Australia', show_dest_folder: 'MasterChef Australia', progress: { phase: 'downloading', percent: 47, etaSeconds: 72, etaLabel: '1m 12s', detail: '14.8 MB/s', startedAt: 1720000000000 } },
  { fetch_id: '205', show_id: 3, fetch_title: 'MasterChef Australia - S16E30', season: 16, episode: 30, file_path: '/media/tv/MasterChef Australia/Season 16/MasterChef Australia - S16E30.ts', size: 1288490188, status: 'partial', error: 'downloaded 1.20 GB of 2.10 GB; next sync resumes', downloaded_at: '2026-07-14 20:12:00', deleted_from_fetch_at: null, ad_status: null, ad_breaks_json: null, ad_processed_at: null, show_pattern: 'MasterChef Australia', show_dest_folder: 'MasterChef Australia', progress: null },
  { fetch_id: '206', show_id: 1, fetch_title: 'Bluey - S03E10 - Onesies', season: 3, episode: 10, file_path: '/media/tv/Bluey (2018)/Season 3/Bluey - S03E10.ts', size: 698351616, status: 'done', error: null, downloaded_at: '2026-07-12 08:22:10', deleted_from_fetch_at: '2026-07-12 09:00:00', ad_status: 'cut', ad_breaks_json: '[{"start":58.0,"end":205.0}]', ad_processed_at: '2026-07-12 08:40:00', show_pattern: 'Bluey', show_dest_folder: 'Bluey (2018)', progress: null },
]

const HIDE_SCROLLBARS = `
  ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
  html, body { scrollbar-width: none !important; -ms-overflow-style: none !important; }
`

const filterShots = (shots) => ONLY
  ? shots.filter((s) => s.hash.includes(ONLY) || s.file.includes(ONLY))
  : shots

const browser = await chromium.launch()

const captureAll = async (shots, viewport) => {
  if (!shots.length) return
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
  })
  await ctx.addInitScript(() => {
    try { localStorage.setItem('fetcharr.welcomeDismissed', '1') } catch {}
  })
  await ctx.route('**/api/settings', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    const response = await route.fetch()
    let data
    try {
      data = await response.json()
    } catch {
      return route.fulfill({ response })
    }
    const masked = { ...data }
    for (const [key, value] of Object.entries(SANITISED_SETTINGS)) {
      if (masked[key]) masked[key] = value
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(masked),
    })
  })
  await ctx.route('**/api/shows', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ shows: DEMO_SHOWS }) })
      : route.continue())
  await ctx.route('**/api/recordings**', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ recordings: DEMO_RECORDINGS, total: DEMO_RECORDINGS.length, page: 1, pageSize: 50 }) })
      : route.continue())
  const page = await ctx.newPage()
  for (const shot of shots) {
    const url = `${BASE}/${shot.hash}`
    console.log(`→ ${url} @ ${viewport.width}×${viewport.height}`)
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.waitForSelector(shot.wait, { timeout: 15_000 })
    await page.addStyleTag({ content: HIDE_SCROLLBARS })
    await page.waitForTimeout(800)
    await page.screenshot({
      path: `${OUT}/${shot.file}`,
      clip: { x: 0, y: 0, width: viewport.width, height: viewport.height },
    })
    console.log(`  saved ${shot.file}`)
  }
  await ctx.close()
}

await captureAll(filterShots(DESKTOP_SHOTS), DESKTOP_VIEWPORT)
await captureAll(filterShots(MOBILE_SHOTS), MOBILE_VIEWPORT)

await browser.close()
console.log('done')
