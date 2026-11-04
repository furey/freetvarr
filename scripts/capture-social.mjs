import { readFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { TIMEZONE, simulatedNow, prepareDemoContext, requireAllArt } from './capture-demo-api.mjs'
import { startLoopback } from './capture-loopback.mjs'

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const { MIST_FRAG, MIST_VERT } = await import(`${REPO_ROOT}docs/.vitepress/theme/mist-shader.js`)
const FREETVARR_URL = (process.env.FREETVARR_URL || 'http://localhost:3733').replace(/\/$/, '')

const DOCS_URL = 'furey.github.io/freetvarr'
const TAGLINE = 'Record free-to-air TV.<br>Watch it on your TV in any<br>media player, ad&nbsp;free.'

const productMist = {
  origin: [0.68, 0.35],
  scale: 1.3,
  direction: [1.4, 0],
  bottomFade: 0.15,
  strength: 0.4,
  time: 145,
  colour: '#3ba4ff'
}

const productCard = {
  layout: 'screenshot',
  headline: TAGLINE,
  url: DOCS_URL,
  mist: productMist
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

const HOME_VIEWPORT = { width: 1280, height: 1100 }
const HOME_SCALE = 2
const HERO_TITLE = process.env.SOCIAL_HERO_TITLE ?? 'Big Brother'
const SWIFTSHADER_ARGS = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist'
]
const HIDE_SCROLLBARS = '::-webkit-scrollbar{width:0!important;height:0!important}html,body{scrollbar-width:none!important}'

const main = async () => {
  const assets = await loadAssets()
  const browser = await chromium.launch()
  const mistBrowser = cards.some((card) => card.mist)
    ? await chromium.launch({ args: SWIFTSHADER_ARGS })
    : null
  const homeShot = cards.some((card) => card.layout === 'screenshot')
    ? await captureHome(browser)
    : null
  for (const card of cards) {
    const context = await (card.mist ? mistBrowser : browser).newContext({
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
    await paintMist({ page, card })
    await mkdir(dirname(`${REPO_ROOT}${card.out}`), { recursive: true })
    await page.screenshot({ path: `${REPO_ROOT}${card.out}`, type: 'png' })
    console.log(`[social] wrote ${card.out}`)
    await context.close()
  }
  await Promise.all([browser.close(), mistBrowser?.close()])
}

const captureHome = async (browser) => {
  const base = await startLoopback({ target: FREETVARR_URL })
  const context = await browser.newContext({
    viewport: HOME_VIEWPORT,
    deviceScaleFactor: HOME_SCALE,
    timezoneId: TIMEZONE,
    colorScheme: 'dark',
    reducedMotion: 'reduce'
  })
  await prepareDemoContext({ context, base, simNow: simulatedNow() })
  const page = await context.newPage()
  await page.goto(`${base}/#/home`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.home-page .hero-carousel', { timeout: 20_000 })
  await showHeroSlide(page, HERO_TITLE)
  await page.addStyleTag({ content: HIDE_SCROLLBARS })
  await page.mouse.move(0, 0)
  await requireAllArt(page, { label: 'social Home' })
  await page.waitForTimeout(400)
  const shot = await page.screenshot({ type: 'png' })
  await context.close()
  console.log(`[social] captured Home from ${FREETVARR_URL}`)
  return shot.toString('base64')
}

const showHeroSlide = async (page, title) => {
  const titles = await page.locator('.hero-slide .hero-slide-title').allTextContents()
  const index = titles.findIndex((text) => text.trim() === title)
  if (index < 0) return console.log(`[social] no "${title}" hero slide; keeping ${titles[0]}`)
  await page.locator('.hero-carousel-dot').nth(index).click()
  const pause = page.locator('.hero-carousel-pause')
  if (await pause.count()) await pause.click()
  await page.waitForTimeout(800)
}

const paintMist = async ({ page, card }) => {
  if (!card.mist) return
  await page.evaluate(drawMist, { mist: card.mist, vert: MIST_VERT, frag: MIST_FRAG })
}

const drawMist = ({ mist, vert, frag }) => {
  const canvas = document.querySelector('canvas.mist')
  const { width, height } = canvas
  const gl = canvas.getContext('webgl', {
    antialias: false,
    depth: false,
    preserveDrawingBuffer: true
  })
  if (!gl) throw new Error('[social] no WebGL context for the mist')
  const program = gl.createProgram()
  for (const [type, src] of [[gl.VERTEX_SHADER, vert], [gl.FRAGMENT_SHADER, frag]]) {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, src)
    gl.compileShader(shader)
    gl.attachShader(program, shader)
  }
  gl.linkProgram(program)
  const linked = gl.getProgramParameter(program, gl.LINK_STATUS)
  if (!linked) throw new Error(gl.getProgramInfoLog(program))
  gl.useProgram(program)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  const at = (name) => gl.getUniformLocation(program, name)
  const colour = [1, 3, 5].map((i) => parseInt(mist.colour.slice(i, i + 2), 16) / 255)
  const highlight = colour.map((value) => value + (1 - value) * 0.35)
  gl.viewport(0, 0, width, height)
  gl.uniform2f(at('o'), width * mist.origin[0], height * (1 - mist.origin[1]))
  gl.uniform1f(at('b'), height * mist.bottomFade)
  gl.uniform1f(at('s'), height * mist.scale)
  gl.uniform2fv(at('f'), mist.direction)
  gl.uniform1f(at('t'), mist.time)
  gl.uniform1f(at('k'), mist.strength)
  gl.uniform3fv(at('c1'), colour)
  gl.uniform3fv(at('c2'), highlight)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

const loadAssets = async () => {
  const fontDir = `${REPO_ROOT}docs/.vitepress/theme/fonts`
  const drawingDir = `${REPO_ROOT}scripts/social`
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

const mistHtml = (card) => card.mist
  ? `<canvas class="mist" width="${card.width}" height="${card.height}"></canvas>`
  : ''

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
.mist {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
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
  font-weight: 400;
  line-height: 1.3;
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
  ${mistHtml(card)}
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
  font-weight: 400;
  line-height: 1.45;
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
  ${mistHtml(card)}
  <div class="copy">${drawingCopyHtml(card)}</div>
  <div class="drawing">${assets.drawings[card.drawing]}</div>
  <div class="footer">${wordmarkHtml('small')}<span class="url">${card.url}</span></div>
</body>
</html>`

await main()
