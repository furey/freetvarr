import { openBrowser, wait } from './lib.mjs'
const { browser, page } = await openBrowser({ width: 390, height: 844, scale: 3, mobile: true })
await page.goto('http://127.0.0.1:3857/#/live')
await wait(page, 4000)
await page.screenshot({ path: 'shots/m-live.png' })
console.log((await page.evaluate(() => document.body.innerText)).slice(0, 500))
await browser.close()
