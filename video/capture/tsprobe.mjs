import { openBrowser, wait } from './lib.mjs'
const { browser, page } = await openBrowser()
await page.goto('http://127.0.0.1:3857/#/live')
await wait(page, 3500)
await page.getByText(/^Coastline ·/).first().click()
await wait(page, 8000)
console.log(JSON.stringify(await page.evaluate(() => fetch('/api/live/tuner-status').then(r => r.json())), null, 0).slice(0, 1500))
await browser.close()
