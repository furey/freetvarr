import { readFile, mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const WORK = process.env.SOCIAL_WORK ?? '/work'
const OUT_DIR = `${WORK}/docs/public/social`

const cards = [
  {
    name: 'default',
    headlineSize: 76,
    headline: 'Live TV in your browser.<br>Recordings in Plex.',
    subline: 'A self-hosted companion for TVHeadend and a TVHeadend-compatible tuner'
  },
  {
    name: 'leaving-fetch',
    headlineSize: 104,
    headline: 'Leaving Fetch TV?',
    subline: 'Own your free-to-air setup before the levy.<br>A step-by-step guide.'
  }
]

const main = async () => {
  const fonts = await loadFonts()
  const logo = await readFile(`${WORK}/docs/public/logo.svg`, 'utf8')
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
  for (const card of cards) {
    await page.setContent(cardHtml({ card, fonts, logo }))
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: `${OUT_DIR}/${card.name}.png`, type: 'png' })
    console.log(`[social] wrote docs/public/social/${card.name}.png`)
  }
  await browser.close()
}

const loadFonts = async () => {
  const inter = await readFile(`${WORK}/docs/.vitepress/theme/fonts/inter-variable.woff2`)
  return { inter: inter.toString('base64') }
}

const cardHtml = ({ card, fonts, logo }) => `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
@font-face {
  font-family: "Inter";
  font-weight: 100 900;
  src: url(data:font/woff2;base64,${fonts.inter}) format("woff2");
}
* { box-sizing: border-box; margin: 0; }
html, body { width: 1200px; height: 630px; }
body {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 36px;
  padding: 0 150px;
  background:
    radial-gradient(circle at 18% 12%, rgba(30, 182, 255, 0.22), transparent 42%),
    radial-gradient(circle at 82% 88%, rgba(255, 138, 0, 0.18), transparent 44%),
    radial-gradient(circle at 92% 18%, rgba(226, 176, 60, 0.12), transparent 30%),
    #1a1611;
  color: #fffcfb;
  font-family: "Inter", sans-serif;
  text-align: center;
}
.logo svg { width: 420px; height: auto; display: block; }
.logo svg > rect { fill: transparent; }
h1 {
  font-size: ${card.headlineSize}px;
  font-weight: 800;
  line-height: 1.08;
  letter-spacing: -0.03em;
}
p {
  color: #b0a89e;
  font-size: 34px;
  font-weight: 500;
  line-height: 1.3;
  letter-spacing: -0.01em;
}
.chips { display: flex; gap: 10px; }
.chips span { width: 64px; height: 10px; }
</style>
</head>
<body>
  <div class="logo">${logo.replace(/<\?xml[^>]*>/, '')}</div>
  <h1>${card.headline}</h1>
  <p>${card.subline}</p>
  <div class="chips">
    <span style="background:#1eb6ff"></span>
    <span style="background:#ff8a00"></span>
    <span style="background:#e2b03c"></span>
  </div>
</body>
</html>`

await main()
