import { access } from 'node:fs/promises'

const SERIES = new URL('../', import.meta.url).pathname
const ORIGIN = 'http://stage.invalid'

export const openStage = async (browser, { video, root = SERIES, path = `stage/stage.html?v=${video}`, prepare = async () => {}, attempts = 3 }) => {
  for (let attempt = 1; ; attempt++) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
    try {
      await serveFromDisk(page, root)
      await prepare(page, attempt)
      await loadStage(page, path)
      return page
    } catch (error) {
      await page.close()
      if (attempt >= attempts) throw error
      console.error(`stage ${path} attempt ${attempt} failed: ${error.message.split('\n')[0]}`)
    }
  }
}

const loadStage = async (page, path) => {
  page.on('pageerror', (e) => console.error('pageerror', e.message))
  page.on('requestfailed', (r) => console.error('requestfailed', r.url(), r.failure()?.errorText))
  await page.goto(`${ORIGIN}/${path}`, { timeout: 180000 })
  await page.waitForFunction(() => window.renderAt && window.stageReady, null, { timeout: 180000 })
  await page.evaluate(() => window.stageReady)
}

const serveFromDisk = (page, root) => page.route(`${ORIGIN}/**`, async (route) => {
  const path = `${root}${decodeURIComponent(new URL(route.request().url()).pathname).slice(1)}`
  const found = await access(path).then(() => true, () => false)
  await (found ? route.fulfill({ path }) : route.fulfill({ status: 404, body: '' }))
})
