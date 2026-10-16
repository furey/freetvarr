import { readFile, mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const WORK = process.env.SOCIAL_WORK ?? '/work'

const HEADLINE = [
  '<em>Live TV</em> in your browser.',
  '<em>Recordings</em> in your media library, <em>ad&nbsp;free.<sup>*</sup></em>'
]
const TAGLINE =
  'Self-hosted TV for any TVHeadend-compatible tuner. Watch live, browse the TV guide, and record straight into your media library.'

const cards = [
  {
    name: 'github',
    width: 1280,
    height: 640,
    scale: 2,
    out: 'docs/img/social-preview.png',
    padding: 72,
    headlineSize: 38,
    copyScale: 1.5,
    frameLeft: 820,
    frameTop: 120,
    frameWidth: 720,
    glowSize: 720,
    headline: HEADLINE,
    tagline: TAGLINE
  },
  {
    name: 'default',
    width: 1200,
    height: 630,
    scale: 1,
    out: 'docs/public/social/default.png',
    padding: 64,
    headlineSize: 36,
    copyScale: 1.5,
    frameLeft: 780,
    frameTop: 120,
    frameWidth: 700,
    glowSize: 688,
    headline: HEADLINE,
    tagline: TAGLINE
  },
  {
    name: 'leaving-fetch',
    layout: 'hook',
    width: 1200,
    height: 630,
    scale: 1,
    out: 'docs/public/social/leaving-fetch.png',
    eyebrow: 'A step-by-step guide',
    headline: 'Leaving <em>Fetch&nbsp;TV?</em>',
    tagline: 'Keep recording free-to-air TV and watching it on your TV.<br>Own your setup before the levy.'
  }
]

const main = async () => {
  const assets = await loadAssets()
  const browser = await chromium.launch()
  for (const card of cards) {
    const context = await browser.newContext({
      viewport: { width: card.width, height: card.height },
      deviceScaleFactor: card.scale
    })
    const page = await context.newPage()
    await page.setContent(card.layout === 'hook' ? hookHtml({ card, assets }) : cardHtml({ card, assets }))
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
  const [inter, mono, poster] = await Promise.all([
    readFile(`${fontDir}/inter-variable.woff2`),
    readFile(`${fontDir}/jetbrains-mono-variable.woff2`),
    readFile(`${WORK}/docs/img/screenshot-dashboard.png`)
  ])
  return {
    inter: inter.toString('base64'),
    mono: mono.toString('base64'),
    poster: poster.toString('base64')
  }
}

const bannerHtml = ({ strong, text }) =>
  `<div class="banner"><strong>${strong}</strong><span>${text}</span></div>`

const cardHtml = ({ card, assets }) => `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
@font-face {
  font-family: "Inter";
  font-weight: 100 900;
  src: url(data:font/woff2;base64,${assets.inter}) format("woff2");
}
@font-face {
  font-family: "JetBrains Mono";
  font-weight: 100 800;
  src: url(data:font/woff2;base64,${assets.mono}) format("woff2");
}
* { box-sizing: border-box; margin: 0; }
html, body { width: ${card.width}px; height: ${card.height}px; overflow: hidden; }
body {
  position: relative;
  background: #1a1611;
  color: #fffcfb;
  font-family: "Inter", sans-serif;
}
.banner {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 52px;
  background: #007bb6;
  color: #fff;
  font-size: 20px;
}
.banner strong { font-weight: 700; }
.glow {
  position: absolute;
  left: ${card.frameLeft + 300 - card.glowSize / 2}px;
  top: ${card.frameTop + 260 - card.glowSize / 2}px;
  width: ${card.glowSize}px;
  height: ${card.glowSize}px;
  border-radius: 50%;
  background: linear-gradient(
    -45deg,
    ${card.glow ?? 'rgba(98, 207, 255, 0.75), rgba(30, 182, 255, 0.65) 50%, rgba(0, 123, 182, 0.6)'}
  );
  filter: blur(80px);
  opacity: 0.6;
}
.copy {
  position: absolute;
  z-index: 2;
  left: ${card.padding}px;
  top: ${card.banner ? 52 : 0}px;
  bottom: 0;
  width: ${card.frameLeft - card.padding - 48}px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.copy-inner {
  zoom: ${card.copyScale};
  width: ${(card.frameLeft - card.padding - 48) / card.copyScale}px;
}
.wordmark {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 36px;
  font-family: "JetBrains Mono", monospace;
  font-size: 28px;
  font-weight: 400;
  color: #fffcfb;
}
.chips { display: flex; gap: 6px; }
.chips i { width: 15px; height: 11px; }
.chips i:nth-child(1) { background: #1eb6ff; }
.chips i:nth-child(2) { background: #ff8a00; }
.chips i:nth-child(3) { background: #e2b03c; }
h1 {
  font-size: ${card.headlineSize}px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.025em;
}
h1 span { display: block; color: #ff8a00; }
h1 em { font-style: normal; color: #fffcfb; }
h1 sup { font-size: 0.8em; line-height: 0; position: relative; top: -0.2em; left: -0.2em; vertical-align: baseline; }
.tagline {
  margin-top: 24px;
  color: #b0a89e;
  font-size: 19px;
  font-weight: 500;
  line-height: 1.4;
}
.footnote {
  margin-top: 16px;
  color: #8b837e;
  font-size: 15px;
  font-weight: 500;
}
.footnote code { font-family: "JetBrains Mono", monospace; }
.frame {
  position: absolute;
  z-index: 1;
  left: ${card.frameLeft}px;
  top: ${card.frameTop}px;
  width: ${card.frameWidth}px;
  border: 1px solid #3d3829;
  border-radius: 12px;
  overflow: hidden;
  background: #28231b;
  box-shadow: 0 24px 48px -24px rgba(0, 0, 0, 0.7), 0 8px 20px -12px rgba(0, 0, 0, 0.5);
}
.bar {
  position: relative;
  display: flex;
  align-items: center;
  padding: 10px 14px;
  background: #28231b;
  border-bottom: 1px solid #3d3829;
}
.dots { display: flex; gap: 8px; }
.dots i { width: 11px; height: 11px; border-radius: 50%; }
.dots i:nth-child(1) { background: #1eb6ff; }
.dots i:nth-child(2) { background: #ff8a00; }
.dots i:nth-child(3) { background: #e2b03c; }
.url {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  color: #8b837e;
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  letter-spacing: 0.02em;
}
.frame img { display: block; width: 100%; }
</style>
</head>
<body>
  ${card.banner ? bannerHtml(card.banner) : ''}
  <div class="glow"></div>
  <div class="copy"><div class="copy-inner">
    <div class="wordmark"><div class="chips"><i></i><i></i><i></i></div>Freetvarr</div>
    <h1>${card.headline.map((line) => `<span>${line}</span>`).join('')}</h1>
    <p class="tagline">${card.tagline}</p>
    ${card.banner ? '' : '<p class="footnote">*optional via <code>comskip</code></p>'}
  </div></div>
  <div class="frame">
    <div class="bar">
      <div class="dots"><i></i><i></i><i></i></div>
      <div class="url">http://freetvarr.lan</div>
    </div>
    <img src="data:image/png;base64,${assets.poster}">
  </div>
</body>
</html>`

const hookHtml = ({ card, assets }) => `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
@font-face {
  font-family: "Inter";
  font-weight: 100 900;
  src: url(data:font/woff2;base64,${assets.inter}) format("woff2");
}
@font-face {
  font-family: "JetBrains Mono";
  font-weight: 100 800;
  src: url(data:font/woff2;base64,${assets.mono}) format("woff2");
}
* { box-sizing: border-box; margin: 0; }
html, body { width: ${card.width}px; height: ${card.height}px; overflow: hidden; }
body {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding-bottom: 36px;
  background:
    radial-gradient(70% 60% at 50% 0%, rgba(0, 123, 182, 0.42), transparent 70%),
    radial-gradient(45% 50% at 100% 100%, rgba(255, 138, 0, 0.12), transparent 70%),
    radial-gradient(45% 50% at 0% 100%, rgba(226, 176, 60, 0.08), transparent 70%),
    #1a1611;
  color: #fffcfb;
  font-family: "Inter", sans-serif;
}
.eyebrow {
  font-family: "JetBrains Mono", monospace;
  font-size: 22px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #b0a89e;
}
h1 {
  margin-top: 22px;
  font-size: 112px;
  font-weight: 800;
  line-height: 1.02;
  letter-spacing: -0.035em;
}
h1 em { font-style: normal; color: #2fa8e0; }
.rule { width: 120px; height: 6px; margin-top: 34px; border-radius: 3px; background: #007bb6; }
.tagline {
  margin-top: 34px;
  max-width: 980px;
  font-size: 32px;
  font-weight: 500;
  line-height: 1.35;
  color: #b0a89e;
}
.chips { position: absolute; left: 50%; bottom: 52px; transform: translateX(-50%); display: flex; gap: 8px; }
.chips i { width: 22px; height: 16px; }
.chips i:nth-child(1) { background: #1eb6ff; }
.chips i:nth-child(2) { background: #ff8a00; }
.chips i:nth-child(3) { background: #e2b03c; }
</style>
</head>
<body>
  <p class="eyebrow">${card.eyebrow}</p>
  <h1>${card.headline}</h1>
  <div class="rule"></div>
  <p class="tagline">${card.tagline}</p>
  <div class="chips"><i></i><i></i><i></i></div>
</body>
</html>`

await main()
