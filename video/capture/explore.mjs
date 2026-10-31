import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3 })
await page.route('**/api/tvh-detect', (r) => r.fulfill({ json: { candidates: [{ url: 'http://localhost:9981' }] } }))
const dump = async (tag) => {
  await page.screenshot({ path: `shots/x-${tag}.png` })
  console.log(`--- ${tag}\n` + await page.evaluate(() => document.querySelector('main, .setup, body').innerText.slice(0, 900)))
  console.log(await page.evaluate(() => [...document.querySelectorAll('input,select,button')].filter(e => e.offsetParent).map(e => `${e.tagName}#${e.id}.${e.className.split(' ').slice(-1)} ${(e.innerText || e.value || '').trim().slice(0, 30)}`).join(' | ')))
}
const click = (name) => page.getByRole('button', { name }).first().click()
const steps = process.argv.slice(2)
await page.goto(process.env.START || 'http://127.0.0.1:3857/')
await page.waitForTimeout(2000)
let n = 0
for (const s of steps) {
  const [k, a, b] = s.split('::')
  if (k === 'click') await click(a)
  if (k === 'fill') await page.locator(a).fill(b)
  if (k === 'wait') await page.waitForTimeout(+a)
  if (k === 'dump') await dump(`${n++}-${a}`)
}
await browser.close()
