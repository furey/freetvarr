import { chromium } from 'playwright'
import { writeFile } from 'node:fs/promises'
const TMP = new URL('../stage/logo-tmp.html', import.meta.url).pathname
import { CHANNELS } from '../stack/content.mjs'
const COLOURS = ['#3ba4ff', '#ff7a59', '#3dd68c', '#b58cff', '#62cfff', '#f5c542', '#7ed957', '#ff5c8a']
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 400, height: 400 } })
const font = 'fonts/figtree-latin-variable.woff2'
for (const [i, c] of CHANNELS.entries()) {
  const html = `<style>@font-face{font-family:F;src:url(${font})}html,body{margin:0;background:transparent}
  .l{width:400px;height:400px;display:grid;place-items:center}
  .b{width:340px;height:340px;border-radius:80px;background:${COLOURS[i]};display:grid;place-items:center;font-family:F;font-weight:800;color:#0b1117}
  .n{font-size:${c.name.length > 8 ? 54 : 64}px;letter-spacing:-0.02em;text-align:center;line-height:1}
  .d{font-size:130px;line-height:1;margin-bottom:-10px}</style>
  <div class="l"><div class="b"><div style="text-align:center"><div class="d">${c.number}</div><div class="n">${c.name}</div></div></div></div>`
  await writeFile(TMP, html)
  await page.goto(`file://${TMP}`)
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: `../stack/host/logos/${c.id.split('.')[0]}.png`, omitBackground: true })
}
await browser.close()
