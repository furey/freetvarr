import { writeFile } from 'node:fs/promises'
import { openBrowser, record, installCursor, cursorTo, cursorToBox, clickWithCursor, glide, wait, BASE } from './lib.mjs'

const OUT = new URL('./raw/', import.meta.url).pathname

const shoot = async ({ name, width, height, scale, mobile, prepare, run }) => {
  const { browser, page } = await openBrowser({ width, height, scale, mobile })
  if (prepare) await prepare(page)
  const cast = await record({ page, dir: `${OUT}${name}` })
  const marks = {}
  const mark = (key) => { marks[key] = +((Date.now() - cast.startedAt) / 1000).toFixed(2); console.log(`${name} mark ${key} ${marks[key]}`) }
  try {
    await run({ page, mark })
  } finally {
    mark('end')
    await cast.stop()
    await writeFile(`${OUT}${name}/marks.json`, JSON.stringify(marks, null, 2))
    await browser.close()
  }
}

const settle = async (page, hash, ms = 3500) => {
  await page.goto(`${BASE}/${hash}`)
  await wait(page, ms)
  await installCursor(page)
}

const SHOTS = {
  guide: () => shoot({
    name: 'guide', width: 1280, height: 800, scale: 1.25,
    prepare: (page) => settle(page, '#/guide'),
    run: async ({ page, mark }) => {
      mark('start')
      await wait(page, 1500)
      await glide(page, { selector: '.epg-scroll', dx: 420, dy: 0, ms: 2600 })
      mark('scrolled')
      await wait(page, 600)
      const cell = page.locator('button.epg-cell', { hasText: 'Big Wave Season' }).filter({ hasText: '3:30pm' }).first()
      await clickWithCursor(page, cell)
      mark('sheet')
      await wait(page, 2200)
      mark('every')
      await clickWithCursor(page, page.getByRole('radio', { name: 'Every episode', exact: true }).first())
      await wait(page, 1200)
      const series = page.locator('.programme-sheet-primary').first()
      await cursorToBox(page, series)
      await wait(page, 500)
      mark('series-click')
      await page.evaluate(() => window.__wt.click())
      await series.click()
      await wait(page, 3500)
      mark('recorded')
      await wait(page, 1500)
    },
  }),
  home: () => shoot({
    name: 'home', width: 1280, height: 800, scale: 1.25,
    prepare: (page) => settle(page, '#/home', 5000),
    run: async ({ page, mark }) => {
      mark('start')
      await wait(page, 5000)
      mark('scroll')
      await glide(page, { dy: 320, ms: 2600 })
      await wait(page, 1500)
      await glide(page, { selector: '.ui-scroller', dx: 700, ms: 2400 })
      await wait(page, 2500)
      mark('more')
      await glide(page, { dy: -320, ms: 2200 })
      await wait(page, 1500)
    },
  }),
  library: () => shoot({
    name: 'library', width: 1280, height: 800, scale: 1.25,
    prepare: (page) => settle(page, '#/recordings', 4000),
    run: async ({ page, mark }) => {
      mark('start')
      await wait(page, 2500)
      const show = page.getByText('Big Wave Season', { exact: true }).first()
      await clickWithCursor(page, show)
      mark('show')
      await wait(page, 3000)
      await glide(page, { dy: 400, ms: 2400 })
      await wait(page, 2500)
      mark('done')
    },
  }),
  live: () => shoot({
    name: 'live', width: 1280, height: 800, scale: 1.25,
    prepare: (page) => settle(page, '#/live', 4000),
    run: async ({ page, mark }) => {
      mark('start')
      await wait(page, 1500)
      const row = page.getByText(/^Coastline ·/).first()
      await clickWithCursor(page, row)
      mark('tune')
      await page.waitForSelector('video', { timeout: 20000 }).catch(() => {})
      await page.waitForFunction(() => { const v = document.querySelector('video'); return v && v.currentTime > 0.5 && !v.paused }, null, { timeout: 30000 }).catch(() => {})
      mark('playing')
      await page.mouse.move(640, 420)
      await wait(page, 14000)
      mark('done')
    },
  }),
  multi: () => shoot({
    name: 'multi', width: 1280, height: 800, scale: 1.25,
    prepare: async (page) => {
      await settle(page, '#/live', 4000)
      await page.getByText(/^Coastline ·/).first().click()
      await wait(page, 7000)
    },
    run: async ({ page, mark }) => {
      await page.mouse.move(640, 420)
      await wait(page, 400)
      await clickWithCursor(page, page.getByRole('button', { name: 'More', exact: true }))
      await wait(page, 500)
      await clickWithCursor(page, page.getByRole('menuitem', { name: 'Multiview' }).or(page.getByRole('button', { name: 'Multiview' })).first())
      await wait(page, 1500)
      await clickWithCursor(page, page.getByText('Harbour', { exact: true }).first())
      mark('start')
      await wait(page, 12000)
      mark('done')
    },
  }),
  phone: () => shoot({
    name: 'phone', width: 390, height: 844, scale: 3, mobile: true,
    prepare: (page) => settle(page, '#/live', 4000),
    run: async ({ page, mark }) => {
      mark('start')
      await wait(page, 1200)
      await page.getByText(/ · Next /).first().tap()
      mark('tune')
      await wait(page, 14000)
      mark('done')
    },
  }),
}

for (const name of process.argv.slice(2)) await SHOTS[name]()
