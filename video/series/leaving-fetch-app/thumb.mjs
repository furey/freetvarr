import {chromium} from 'playwright'
import {writeFile} from 'node:fs/promises'

const HERE = new URL('.', import.meta.url).pathname
const FONTS = new URL('../../../docs/.vitepress/theme/fonts', import.meta.url).pathname
const ICON = process.argv[2] || `${HERE}assets/app-icon.png`
const OUT = process.argv[3] || `${HERE}thumb-leaving-fetch-app.jpg`
const HTML = `${HERE}thumb.html`

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face {font-family: Figtree; font-weight: 300 900;
    src: url("file://${FONTS}/figtree-latin-variable.woff2") format("woff2");}
  * {box-sizing: border-box; margin: 0;}
  body {background: #0b1117; font-family: Figtree, sans-serif; color: #f2f5f7;}
  .thumb {position: relative; width: 1280px; height: 720px; overflow: hidden;
    background:
      radial-gradient(640px 520px at 100% 0%, rgba(92,225,198,0.10), transparent 70%),
      radial-gradient(560px 420px at 0% 100%, rgba(59,164,255,0.07), transparent 70%),
      #0b1117;}
  .thumb > * {position: absolute;}
  .plate {left: 600px; top: 80px; right: -40px; bottom: -40px; border-radius: 20px;
    border: 1px solid rgba(255,255,255,0.08);
    background: linear-gradient(160deg, rgba(92,225,198,0.07), transparent 45%),
      linear-gradient(180deg, #141c24, #0f161d);}
  .headline {left: 80px; top: 104px; width: 520px; white-space: nowrap; z-index: 5;
    font-size: 96px; font-weight: 800; line-height: 1.0; letter-spacing: -0.02em;}
  .headline em {font-style: normal; color: #5ce1c6;}
  .headline p {margin-top: 24px; font-size: 34px; font-weight: 600; line-height: 1.2;
    color: #a9b4be;}
  .chips {left: 80px; top: 628px; display: flex; gap: 6px;}
  .chips i {width: 36px; height: 12px;}
  .chips i:nth-child(1) {background: #3ba4ff;}
  .chips i:nth-child(2) {background: #f28c28;}
  .chips i:nth-child(3) {background: #f5c542;}
  .app {left: 640px; right: 0; top: 120px; display: flex; flex-direction: column;
    align-items: center;}
  .app img {width: 300px; height: 300px; border-radius: 66px;
    box-shadow: 0 0 0 1px rgba(255,255,255,0.10);}
  .app h2 {margin-top: 36px; font-size: 48px; font-weight: 800; letter-spacing: -0.01em;}
  .app p {margin-top: 12px; font-size: 30px; font-weight: 600; color: #a9b4be;}
</style></head><body><div class="thumb">
  <div class="plate"></div>
  <div class="app"><img src="file://${ICON}"><h2>Fetch My Recordings</h2>
    <p>Mac, Windows, and Linux</p></div>
  <div class="headline"><div>Save your</div><div><em>Fetch</em></div><div><em>recordings</em></div>
    <p>Free app for your computer</p></div>
  <div class="chips"><i></i><i></i><i></i></div>
</div></body></html>`

await writeFile(HTML, html)
const browser = await chromium.launch()
const page = await browser.newPage({viewport: {width: 1280, height: 720}})
await page.goto(`file://${HTML}`)
await page.evaluate(() => document.fonts.ready)
await page.waitForLoadState('networkidle')
await page.screenshot({path: OUT, type: 'jpeg', quality: 90})
await browser.close()
