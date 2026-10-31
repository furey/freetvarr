import { openBrowser, wait } from './lib.mjs'
const [hash, out, w = 1280, h = 800] = process.argv.slice(2)
const { browser, page } = await openBrowser({ width: +w, height: +h })
await page.goto(`http://127.0.0.1:3857/${hash}`)
await wait(page, 3500)
await page.screenshot({ path: out })
console.log(await page.evaluate(() => [...document.querySelectorAll('button, a, [role=button], .epg-cell, [class*=card]')].filter(e => e.offsetParent).slice(0, 80).map(e => `${e.tagName}.${String(e.className).split(' ').slice(0, 3).join('.')} "${(e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40)}"`).join('\n')))
await browser.close()
