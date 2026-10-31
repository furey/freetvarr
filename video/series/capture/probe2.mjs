import { openBrowser, wait, BASE } from './lib.mjs'
const OUT = new URL('./peek/', import.meta.url).pathname
const { browser, page } = await openBrowser(process.env.VW ? { width: Number(process.env.VW), height: Number(process.env.VH), scale: Number(process.env.VS || 1) } : {})
const dump = async (name) => {
  await page.screenshot({ path: `${OUT}${name}.jpg`, type: 'jpeg', quality: 70 })
  const els = await page.evaluate(() => [...document.querySelectorAll('button,a,[role=radio],[role=switch],input,select,h1,h2,h3,label')].filter((e) => e.getClientRects().length && !e.closest("nav")).map((e) => `${e.tagName.toLowerCase()}${e.getAttribute('role') ? `[${e.getAttribute('role')}]` : ''}:${(e.getAttribute('aria-label') || e.textContent || e.value || '').trim().replace(/\s+/g, ' ').slice(0, 50)}`))
  console.log(`== ${name}\n${[...new Set(els)].join(' | ')}`)
}
const steps = JSON.parse(process.argv[2])
for (const s of steps) {
  if (s.go) { await page.goto(`${BASE}/${s.go}`); await wait(page, 3500) }
  if (s.click) { await page.locator(s.click).first().click(); await wait(page, 1500) }
  if (s.text) { await page.getByText(s.text, { exact: s.exact ?? false }).first().click({ force: true }); await wait(page, 1500) }
  if (s.role) { await page.getByRole(s.role[0], { name: s.role[1], exact: true }).first().click(); await wait(page, 1500) }
  if (s.type) { await page.keyboard.type(s.type, { delay: 50 }); await wait(page, 2000) }
  if (s.eval) { console.log(await page.evaluate(s.eval)) }
  if (s.dump) await dump(s.dump)
}
await browser.close()
