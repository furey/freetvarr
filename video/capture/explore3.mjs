import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3 })
const dump = async (tag) => {
  await page.screenshot({ path: `shots/x-${tag}.png` })
  console.log(`--- ${tag}\n` + (await page.evaluate(() => document.body.innerText)).split('\n').filter(l => !/^(Africa|America|Asia|Europe|Pacific|Atlantic|Indian|Antarctica|Arctic|Australia\/)/.test(l)).join('\n').slice(0, 1800))
  console.log(await page.evaluate(() => [...document.querySelectorAll('input,select,button')].filter(e => e.offsetParent).map(e => `${e.tagName}#${e.id} ${(e.innerText || e.value || '').trim().slice(0, 30)}`).join(' | ')))
}
const click = async (name, wait = 3000) => { await page.getByRole('button', { name, exact: true }).first().click(); await page.waitForTimeout(wait) }
await page.goto('http://127.0.0.1:3857/#/welcome')
await page.waitForTimeout(2000)
for (const s of process.argv.slice(2)) {
  if (s.startsWith('dump:')) await dump(s.slice(5))
  else if (s.startsWith('wait:')) await page.waitForTimeout(+s.slice(5))
  else await click(s)
}
await browser.close()
