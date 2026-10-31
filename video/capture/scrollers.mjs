import { openBrowser, wait } from './lib.mjs'
const { browser, page } = await openBrowser()
for (const hash of process.argv.slice(2)) {
  await page.goto(`http://127.0.0.1:3857/${hash}`)
  await wait(page, 3500)
  console.log(hash, await page.evaluate(() => [...document.querySelectorAll('*')].filter(e => (e.scrollHeight > e.clientHeight + 5 || e.scrollWidth > e.clientWidth + 5) && ['auto', 'scroll'].some(v => getComputedStyle(e).overflowY === v || getComputedStyle(e).overflowX === v)).map(e => `${e.tagName}.${String(e.className).split(' ').join('.')} ${e.scrollWidth}x${e.scrollHeight} in ${e.clientWidth}x${e.clientHeight}`).join('\n')))
  console.log('doc', await page.evaluate(() => `${document.scrollingElement.scrollHeight} in ${innerHeight}`))
}
await browser.close()
