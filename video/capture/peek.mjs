import { chromium } from 'playwright'
const [url, out, w = 1440, h = 810] = process.argv.slice(2)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1920 / +w })
await page.goto(url)
await page.waitForTimeout(4000)
await page.screenshot({ path: out })
console.log(await page.evaluate(() => document.body.innerText.slice(0, 800)))
await browser.close()
