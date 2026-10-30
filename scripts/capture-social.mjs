import { readFile, mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const WORK = process.env.SOCIAL_WORK ?? '/work'

const DOCS_URL = 'furey.github.io/freetvarr'
const TAGLINE = 'Record free-to-air TV.<br>Watch it on your TV in any media player, ad&nbsp;free.'

const productCard = {
  wordmark: 'large',
  headline: TAGLINE,
  url: DOCS_URL,
  drawing: 'tv-apps'
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

const main = async () => {
  const assets = await loadAssets()
  const browser = await chromium.launch()
  for (const card of cards) {
    const context = await browser.newContext({
      viewport: { width: card.width, height: card.height },
      deviceScaleFactor: 1
    })
    const page = await context.newPage()
    await page.setContent(cardHtml({ card, assets }))
    await page.evaluate(() => document.fonts.ready)
    await mkdir(`${WORK}/${card.out.replace(/\/[^/]+$/, '')}`, { recursive: true })
    await page.screenshot({ path: `${WORK}/${card.out}`, type: 'png' })
    console.log(`[social] wrote ${card.out}`)
    await context.close()
  }
  await browser.close()
}

const loadAssets = async () => {
  const fontDir = `${WORK}/docs/.vitepress/theme/fonts`
  const drawingDir = `${WORK}/scripts/social`
  const [figtree, mono, tvApps, leavingFetch] = await Promise.all([
    readFile(`${fontDir}/figtree-latin-variable.woff2`),
    readFile(`${fontDir}/geist-mono-latin-500-normal.woff2`),
    readFile(`${drawingDir}/tv-apps.svg`, 'utf8'),
    readFile(`${drawingDir}/leaving-fetch.svg`, 'utf8')
  ])
  return {
    figtree: figtree.toString('base64'),
    mono: mono.toString('base64'),
    drawings: { 'tv-apps': tvApps, 'leaving-fetch': leavingFetch }
  }
}

const wordmarkHtml = (size) =>
  `<div class="wordmark ${size}"><span class="free">Free</span><span class="tv">tv</span><span class="arr">arr</span></div>`

const copyHtml = (card) => [
  card.wordmark === 'large' ? wordmarkHtml('large') : '',
  card.eyebrow ? `<p class="eyebrow">${card.eyebrow}</p>` : '',
  `<h1>${card.headline}</h1>`,
  card.tagline ? `<p class="tagline">${card.tagline}</p>` : ''
].join('')

const footerHtml = (card) => [
  card.wordmark === 'small' ? wordmarkHtml('small') : '',
  `<span class="url">${card.url}</span>`
].join('')

const cardHtml = ({ card, assets }) => `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
@font-face {
  font-family: "Figtree";
  font-weight: 300 900;
  src: url(data:font/woff2;base64,${assets.figtree}) format("woff2");
}
@font-face {
  font-family: "Geist Mono";
  font-weight: 500;
  src: url(data:font/woff2;base64,${assets.mono}) format("woff2");
}
* { box-sizing: border-box; margin: 0; }
html, body { width: ${card.width}px; height: ${card.height}px; overflow: hidden; }
body {
  position: relative;
  background: #0b1117;
  color: #f2f5f7;
  font-family: "Figtree", sans-serif;
}
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
.wordmark {
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1;
  white-space: nowrap;
}
.wordmark.large { font-size: 92px; margin-bottom: 36px; }
.wordmark.small { font-size: 30px; }
.wordmark .free { color: #3ba4ff; }
.wordmark .tv { color: #f28c28; }
.wordmark .arr { color: #f5c542; }
.eyebrow {
  margin-bottom: 20px;
  color: #8d9aa7;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
h1 {
  font-size: ${card.headlineSize ?? 46}px;
  font-weight: 800;
  line-height: ${card.headlineSize ? 1.02 : 1.18};
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
.url {
  color: #a9b4be;
  font-family: "Geist Mono", monospace;
  font-size: 24px;
  font-weight: 500;
}
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
  <div class="copy">${copyHtml(card)}</div>
  <div class="drawing">${assets.drawings[card.drawing]}</div>
  <div class="footer">${footerHtml(card)}</div>
</body>
</html>`

await main()
