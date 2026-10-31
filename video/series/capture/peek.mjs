import { openBrowser, wait, BASE } from './lib.mjs'
const OUT = new URL('./peek/', import.meta.url).pathname
const routes = process.argv.slice(2)
const { browser, page } = await openBrowser({})
for (const r of routes) {
  await page.goto(`${BASE}/${r}`)
  await wait(page, 3500)
  const name = r.replace(/[^a-z0-9]+/gi, '_') || 'root'
  await page.screenshot({ path: `${OUT}${name}.jpg`, type: 'jpeg', quality: 70 })
  const btns = await page.evaluate(() => [...document.querySelectorAll('a,button,[role=tab],h1,h2,h3')].filter((e) => e.offsetParent).map((e) => `${e.tagName}:${(e.getAttribute('aria-label') || e.textContent).trim().replace(/\s+/g, ' ').slice(0, 40)}`).slice(0, 90))
  console.log(`== ${r}\n${[...new Set(btns)].join(' | ')}`)
}
await browser.close()
