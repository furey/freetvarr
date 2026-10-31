import { openBrowser, wait } from './lib.mjs'
const OUT = new URL('./peek/', import.meta.url).pathname
const { browser, page } = await openBrowser({})
await page.goto('http://127.0.0.1:3860/#/settings/system/setup')
await wait(page, 3000)
await page.getByRole('button', { name: 'Run the whole setup from the start' }).click()
await wait(page, 2500)
for (let i = 0; i < 9; i++) {
  await page.screenshot({ path: `${OUT}wiz-${i}.jpg`, type: 'jpeg', quality: 70 })
  const btns = await page.evaluate(() => [...document.querySelectorAll('button,a,h1,h2,select')].filter((e) => e.offsetParent).map((e) => (e.getAttribute('aria-label') || e.textContent).trim().replace(/\s+/g, ' ').slice(0, 40)))
  console.log(i, page.url(), btns.join(' | '))
  const next = page.locator('.setup-next, .ui-button-primary').filter({ visible: true }).last()
  const label = (await next.textContent().catch(() => '')).trim()
  if (/Start setup|Next|Save and next|Open Freetvarr|Start watching/.test(label) && !/Start watching|Open Freetvarr/.test(label)) { await next.click(); await wait(page, 3000) } else { console.log('stop at', label); break }
}
await browser.close()
