import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { chromium } from 'playwright'

const WORK = process.env.SOCIAL_WORK ?? '/work'
const FREETVARR_URL = (process.env.FREETVARR_URL || 'http://localhost:3733').replace(/\/$/, '')
const ART_CACHE = `${WORK}/scripts/.cache/social-art`

const DOCS_URL = 'furey.github.io/freetvarr'
const TAGLINE = 'Record free-to-air TV.<br>Watch it on your TV in any<br>media player, ad&nbsp;free.'

const productCard = {
  layout: 'screenshot',
  headline: TAGLINE,
  url: DOCS_URL
}

const cards = [
  {
    ...productCard,
    name: 'github',
    width: 1280,
    height: 640,
    out: 'docs/img/social-preview.png'
  },
  {
    ...productCard,
    name: 'default',
    width: 1200,
    height: 630,
    out: 'docs/public/social/default.png'
  },
  {
    name: 'leaving-fetch',
    width: 1200,
    height: 630,
    out: 'docs/public/social/leaving-fetch.png',
    wordmark: 'small',
    eyebrow: 'A step-by-step guide',
    headline: 'Leaving<br><em>Fetch&nbsp;TV?</em>',
    headlineSize: 104,
    tagline: 'Keep recording free-to-air TV and watching it on your TV.',
    url: `${DOCS_URL}/guide/leaving-fetch`,
    drawing: 'leaving-fetch'
  }
]

const HOME_VIEWPORT = { width: 1120, height: 960 }
const HOME_SCALE = 2
const SIM_NOW = Date.parse('2026-11-01T19:45:00+11:00')
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

const MIXKIT_ART = {
  'fire-and-feast': 'https://assets.mixkit.co/videos/49231/49231-thumb-720-2.jpg',
  'wild-things': 'https://assets.mixkit.co/videos/1489/1489-thumb-720-3.jpg',
  'fresh-start-kitchen': 'https://assets.mixkit.co/videos/40524/40524-thumb-720-0.jpg',
  'island-escapes': 'https://assets.mixkit.co/videos/1564/1564-thumb-720-0.jpg',
  'open-road': 'https://assets.mixkit.co/videos/35540/35540-thumb-720-0.jpg',
  'night-market': 'https://assets.mixkit.co/videos/4231/4231-thumb-720-0.jpg',
  'paws-and-claws': 'https://assets.mixkit.co/videos/22732/22732-thumb-720-0.jpg',
  'fight-night': 'https://assets.mixkit.co/videos/40969/40969-thumb-720-0.jpg',
  'harbour-patrol': 'https://assets.mixkit.co/videos/5363/5363-thumb-720-0.jpg',
  'sunset-coast': 'https://assets.mixkit.co/videos/2168/2168-thumb-720-0.jpg',
  'desert-crossing': 'https://assets.mixkit.co/videos/4285/4285-thumb-720-0.jpg',
  'city-lights': 'https://assets.mixkit.co/videos/49846/49846-thumb-720-0.jpg'
}

const RECORDING_NOW = { title: 'Fire and Feast', channelName: 'SBS Food', channelId: 'sbs-food', season: 3, episode: 6 }

const NEW_RECORDINGS = [
  { title: 'Wild Things', season: 2, episode: 4, channelName: 'ABC TV', daysAgo: 0 },
  { title: 'Fresh Start Kitchen', season: 5, episode: 12, channelName: 'SBS Food', daysAgo: 0 },
  { title: 'Island Escapes', season: 1, episode: 8, channelName: '9Life', daysAgo: 1 },
  { title: 'Open Road', season: 3, episode: 2, channelName: '10 Peach', daysAgo: 1 },
  { title: 'Night Market', season: 1, episode: 3, channelName: 'SBS Viceland', daysAgo: 2 },
  { title: 'Paws and Claws', season: 4, episode: 9, channelName: '7two', daysAgo: 3 }
]

const SUGGESTIONS = [
  { title: 'Fight Night', kind: 'premiere', channelName: '9Gem', daysAhead: 1 },
  { title: 'Harbour Patrol', kind: 'returning', channelName: '7mate', daysAhead: 2 },
  { title: 'Sunset Coast', kind: 'new-season', channelName: 'ABC TV', daysAhead: 2 },
  { title: 'Desert Crossing', kind: 'premiere', channelName: 'SBS', daysAhead: 3 },
  { title: 'City Lights', kind: 'returning', channelName: '10 Bold', daysAhead: 4 }
]

const main = async () => {
  const assets = await loadAssets()
  const browser = await chromium.launch()
  const homeShot = cards.some((card) => card.layout === 'screenshot')
    ? await captureHome(browser)
    : null
  for (const card of cards) {
    const context = await browser.newContext({
      viewport: { width: card.width, height: card.height },
      deviceScaleFactor: 1
    })
    const page = await context.newPage()
    const html = card.layout === 'screenshot'
      ? screenshotCardHtml({ card, assets, homeShot })
      : drawingCardHtml({ card, assets })
    await page.setContent(html)
    await page.evaluate(() => document.fonts.ready)
    await page.waitForFunction(() => [...document.images].every((img) => img.complete))
    await mkdir(`${WORK}/${card.out.replace(/\/[^/]+$/, '')}`, { recursive: true })
    await page.screenshot({ path: `${WORK}/${card.out}`, type: 'png' })
    console.log(`[social] wrote ${card.out}`)
    await context.close()
  }
  await browser.close()
}

const captureHome = async (browser) => {
  await cacheMixkitArt()
  const context = await browser.newContext({
    viewport: HOME_VIEWPORT,
    deviceScaleFactor: HOME_SCALE,
    timezoneId: 'Australia/Sydney',
    colorScheme: 'dark',
    reducedMotion: 'reduce'
  })
  await context.clock.install({ time: SIM_NOW })
  await context.route('**/social-art/*', serveArt)
  await context.route('**/api/**', serveHomeFixtures(homeFixtures()))
  const page = await context.newPage()
  await page.goto(`${FREETVARR_URL}/#/`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.home-page .hero-carousel:not(.home-skeleton-hero)', { timeout: 20_000 })
  await page.addStyleTag({ content: HIDE_SCROLLBARS })
  await page.waitForFunction(() => [...document.querySelectorAll('.home-page img')]
    .every((img) => img.complete && img.naturalWidth > 0), null, { timeout: 15_000 })
  await page.clock.runFor(3000)
  await page.waitForTimeout(1200)
  const shot = await page.screenshot({ type: 'png' })
  await context.close()
  console.log(`[social] captured Home from ${FREETVARR_URL}`)
  return shot.toString('base64')
}

const HIDE_SCROLLBARS = '::-webkit-scrollbar{width:0!important;height:0!important}html,body{scrollbar-width:none!important}'

const serveHomeFixtures = (fixtures) => async (route) => {
  const url = new URL(route.request().url())
  if (route.request().method() !== 'GET') return route.abort()
  if (url.pathname === '/api/settings') return route.fulfill({ json: await configuredSettings(route) })
  const fixture = fixtures[url.pathname]
  if (fixture) return route.fulfill({ json: fixture(url) })
  return route.continue()
}

const configuredSettings = async (route) => {
  const response = await route.fetch()
  return { ...(await response.json()), tvh_url: 'http://tvheadend:9981', welcome_dismissed: true }
}

const serveArt = async (route) => {
  const name = new URL(route.request().url()).pathname.split('/').pop()
  return route.fulfill({ contentType: 'image/jpeg', body: await readFile(`${ART_CACHE}/${name}`) })
}

const cacheMixkitArt = async () => {
  await mkdir(ART_CACHE, { recursive: true })
  for (const [name, url] of Object.entries(MIXKIT_ART)) {
    const file = `${ART_CACHE}/${name}.jpg`
    if (await exists(file)) continue
    console.log(`[social] downloading Mixkit still for ${name} (Mixkit Free License)`)
    const response = await fetch(url)
    if (!response.ok) throw new Error(`[social] ${url} returned ${response.status}`)
    await writeFile(file, Buffer.from(await response.arrayBuffer()))
  }
}

const exists = (file) => access(file).then(() => true, () => false)

const homeFixtures = () => {
  const recording = recordingNowFixture()
  const episodes = NEW_RECORDINGS.map(newEpisodeFixture)
  return {
    '/api/library/episodes': (url) => ({ episodes: url.searchParams.get('state') === 'new' ? episodes : [] }),
    '/api/home/hero': () => heroFixture(recording),
    '/api/for-you': () => suggestionsFixture(),
    '/api/recording-now': () => ({ active: [recording], journeys: [], finishing: [] }),
    '/api/epg/state': () => ({ upcomingRecordings: [], activeRecordingIds: [String(recording.programId)] }),
    '/api/epg/now': () => ({ entries: [] }),
    '/api/library/shows': () => ({ shows: [] }),
    '/api/watchlist': () => ({ items: [] }),
    '/api/health-summary': () => ({ level: 'ok', issues: [] })
  }
}

const recordingNowFixture = () => ({
  ...RECORDING_NOW,
  start: SIM_NOW - 15 * MINUTE,
  stop: SIM_NOW + 45 * MINUTE,
  uuid: 'social-recording',
  dvrUuid: 'social-recording',
  programId: 9001,
  canPlayFromStart: true
})

const heroFixture = (recording) => ({
  version: 1,
  builtAt: SIM_NOW,
  timeZone: 'Australia/Sydney',
  stale: false,
  candidates: [{
    type: 'recording',
    source: { recording, channel: { id: recording.channelId, name: recording.channelName } },
    endsAt: recording.stop,
    art: {
      image: artUrl(recording.title),
      images: [{ url: artUrl(recording.title), identity: slugOf(recording.title) }],
      title: recording.title
    }
  }]
})

const newEpisodeFixture = ({ title, season, episode, channelName, daysAgo }, index) => ({
  recordingId: 100 + index,
  title,
  showKey: slugOf(title),
  season,
  episode,
  channelName,
  airedAt: SIM_NOW - daysAgo * DAY - (3 + index) * 60 * MINUTE,
  durationS: 3600,
  image: artUrl(title),
  state: 'new'
})

const suggestionsFixture = () => ({
  enabled: true,
  coldStart: false,
  sections: [{
    key: 'might-like',
    items: SUGGESTIONS.map(({ title, kind, channelName, daysAhead }, index) => ({
      id: `social-${index}`,
      title,
      seriesKey: slugOf(title),
      kind,
      channelName,
      channelId: `social-channel-${index}`,
      start: (SIM_NOW + daysAhead * DAY + 30 * MINUTE) / 1000,
      stop: (SIM_NOW + daysAhead * DAY + 90 * MINUTE) / 1000,
      image: artUrl(title)
    }))
  }]
})

const slugOf = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const artUrl = (title) => `/social-art/${slugOf(title)}.jpg`

const loadAssets = async () => {
  const fontDir = `${WORK}/docs/.vitepress/theme/fonts`
  const drawingDir = `${WORK}/scripts/social`
  const [figtree, mono, leavingFetch] = await Promise.all([
    readFile(`${fontDir}/figtree-latin-variable.woff2`),
    readFile(`${fontDir}/geist-mono-latin-500-normal.woff2`),
    readFile(`${drawingDir}/leaving-fetch.svg`, 'utf8')
  ])
  return {
    figtree: figtree.toString('base64'),
    mono: mono.toString('base64'),
    drawings: { 'leaving-fetch': leavingFetch }
  }
}

const wordmarkHtml = (size) =>
  `<div class="wordmark ${size}"><span class="free">Free</span><span class="tv">tv</span><span class="arr">arr</span></div>`

const fontFacesCss = (assets) => `
@font-face {
  font-family: "Figtree";
  font-weight: 300 900;
  src: url(data:font/woff2;base64,${assets.figtree}) format("woff2");
}
@font-face {
  font-family: "Geist Mono";
  font-weight: 500;
  src: url(data:font/woff2;base64,${assets.mono}) format("woff2");
}`

const baseCss = (card) => `
* { box-sizing: border-box; margin: 0; }
html, body { width: ${card.width}px; height: ${card.height}px; overflow: hidden; }
body {
  position: relative;
  background: #0b1117;
  color: #f2f5f7;
  font-family: "Figtree", sans-serif;
}
.wordmark {
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1;
  white-space: nowrap;
}
.wordmark .free { color: #3ba4ff; }
.wordmark .tv { color: #f28c28; }
.wordmark .arr { color: #f5c542; }
.url {
  color: #a9b4be;
  font-family: "Geist Mono", monospace;
  font-weight: 500;
}`

const screenshotLayoutOf = (card) => {
  const unit = card.height / 630
  const frameWidth = Math.round(690 * unit)
  return {
    left: Math.round(64 * unit),
    copyWidth: Math.round(470 * unit),
    wordmarkSize: Math.round(88 * unit),
    headlineSize: Math.round(35 * unit),
    urlSize: Math.round(22 * unit),
    urlBottom: Math.round(56 * unit),
    frameLeft: card.width - Math.round(628 * unit),
    frameTop: Math.round(48 * unit),
    frameWidth,
    barHeight: Math.round(34 * unit),
    dot: Math.round(11 * unit),
    radius: Math.round(14 * unit)
  }
}

const screenshotCardHtml = ({ card, assets, homeShot }) => {
  const l = screenshotLayoutOf(card)
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
${fontFacesCss(assets)}
${baseCss(card)}
.copy {
  position: absolute;
  left: ${l.left}px;
  top: 0;
  bottom: ${l.urlBottom + l.urlSize}px;
  width: ${l.copyWidth}px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.wordmark { font-size: ${l.wordmarkSize}px; margin-bottom: ${Math.round(l.wordmarkSize * 0.4)}px; }
h1 {
  font-size: ${l.headlineSize}px;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: -0.015em;
  text-wrap: balance;
}
.url {
  position: absolute;
  left: ${l.left}px;
  bottom: ${l.urlBottom}px;
  font-size: ${l.urlSize}px;
}
.frame {
  position: absolute;
  left: ${l.frameLeft}px;
  top: ${l.frameTop}px;
  width: ${l.frameWidth}px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: ${l.radius}px;
  overflow: hidden;
  background: #141c24;
}
.bar {
  display: flex;
  align-items: center;
  gap: ${Math.round(l.dot * 0.75)}px;
  height: ${l.barHeight}px;
  padding: 0 ${Math.round(l.dot * 1.3)}px;
  background: #141c24;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.bar i { width: ${l.dot}px; height: ${l.dot}px; border-radius: 50%; background: #26323e; }
.frame img { display: block; width: 100%; }
</style>
</head>
<body>
  <div class="copy">${wordmarkHtml('large')}<h1>${card.headline}</h1></div>
  <span class="url">${card.url}</span>
  <div class="frame">
    <div class="bar"><i></i><i></i><i></i></div>
    <img src="data:image/png;base64,${homeShot}">
  </div>
</body>
</html>`
}

const drawingCopyHtml = (card) => [
  card.eyebrow ? `<p class="eyebrow">${card.eyebrow}</p>` : '',
  `<h1>${card.headline}</h1>`,
  card.tagline ? `<p class="tagline">${card.tagline}</p>` : ''
].join('')

const drawingCardHtml = ({ card, assets }) => `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
${fontFacesCss(assets)}
${baseCss(card)}
.copy {
  position: absolute;
  left: 80px;
  top: 0;
  bottom: 96px;
  width: 560px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.wordmark { font-size: 30px; }
.eyebrow {
  margin-bottom: 20px;
  color: #8d9aa7;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
h1 {
  font-size: ${card.headlineSize}px;
  font-weight: 800;
  line-height: 1.02;
  letter-spacing: -0.015em;
}
h1 em { font-style: normal; color: #3ba4ff; }
.tagline {
  margin-top: 28px;
  color: #a9b4be;
  font-size: 30px;
  font-weight: 500;
  line-height: 1.35;
}
.footer {
  position: absolute;
  left: 80px;
  right: 80px;
  bottom: 64px;
  display: flex;
  align-items: baseline;
  gap: 24px;
}
.url { font-size: 24px; }
.drawing {
  position: absolute;
  right: 56px;
  top: ${(card.height - 96) / 2 - 116}px;
  width: 464px;
  height: 232px;
}
.drawing svg { display: block; width: 100%; height: 100%; }
</style>
</head>
<body>
  <div class="copy">${drawingCopyHtml(card)}</div>
  <div class="drawing">${assets.drawings[card.drawing]}</div>
  <div class="footer">${wordmarkHtml('small')}<span class="url">${card.url}</span></div>
</body>
</html>`

await main()
