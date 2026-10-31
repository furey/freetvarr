import { openBrowser, wait } from './lib.mjs'
const { browser, page } = await openBrowser()
await page.goto('http://127.0.0.1:3857/#/guide')
await wait(page, 3500)
await page.locator('button.epg-cell', { hasText: 'Big Wave Season' }).first().click()
await wait(page, 2000)
console.log(await page.evaluate(() => [...document.querySelectorAll('button,[role=radio],[role=tab],label')].filter(e => e.offsetParent && e.closest('[role=dialog], .sheet, [class*=sheet]')).map(e => `${e.tagName}[${e.getAttribute('role')}].${String(e.className).split(' ').slice(0, 2).join('.')} "${(e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40)}"`).join('\n')))
await browser.close()
