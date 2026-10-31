import { chromium } from 'playwright'
const [url, out, ...actions] = process.argv.slice(2)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3 })
await page.goto(url)
await page.waitForTimeout(2500)
for (const a of actions) {
  const [kind, arg, val] = a.split('::')
  if (kind === 'click') await page.getByText(arg, { exact: false }).first().click()
  if (kind === 'role') await page.getByRole('button', { name: arg }).first().click()
  if (kind === 'fill') await page.locator(arg).fill(val)
  if (kind === 'wait') await page.waitForTimeout(+arg)
  if (kind === 'shot') await page.screenshot({ path: arg })
}
await page.waitForTimeout(1500)
await page.screenshot({ path: out })
console.log(await page.evaluate(() => document.body.innerText.slice(0, 1500)))
await browser.close()
