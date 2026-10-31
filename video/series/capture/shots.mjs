import { writeFile } from 'node:fs/promises'
import { openBrowser, record, installCursor, cursorTo, cursorToBox, clickWithCursor, glide, wait, warm, imagesReady, BASE } from './lib.mjs'

const OUT = new URL('./raw/', import.meta.url).pathname
const B3 = 'http://127.0.0.1:3860'

const shoot = async ({ name, width = 1280, height = 800, scale = 1.25, mobile = false, prepare, run, routes }) => {
  const { browser, context, page } = await openBrowser({ width, height, scale, mobile })
  if (routes) await routes(context)
  if (prepare) await prepare(page)
  const cast = await record({ page, dir: `${OUT}${name}` })
  const marks = {}
  const mark = (key) => { marks[key] = +((Date.now() - cast.startedAt) / 1000).toFixed(2); console.log(`${name} mark ${key} ${marks[key]}`) }
  try {
    await run({ page, mark, context })
  } finally {
    mark('end')
    await cast.stop()
    await writeFile(`${OUT}${name}/marks.json`, JSON.stringify(marks, null, 2))
    await browser.close()
  }
}

const settle = async (page, hash, ms = 3500, base = BASE) => {
  await page.goto(`${base}/#/home`)
  await wait(page, 1500)
  await page.goto(`${base}/${hash}`)
  await wait(page, ms)
  await warm(page)
  await installCursor(page)
}

export const SHOTS = {}
const add = (name, def) => { SHOTS[name] = () => shoot({ name, ...def }) }

add('wizdone', {
  prepare: async (page) => {
    await settle(page, '#/settings/system/setup', 3000, B3)
    await page.getByRole('button', { name: 'Run the whole setup from the start' }).click()
    await wait(page, 2500)
    for (let i = 0; i < 5; i++) {
      await page.locator('.setup-next, .ui-button-primary').filter({ visible: true }).last().click()
      await wait(page, 2500)
    }
    await installCursor(page)
  },
  run: async ({ page, mark }) => {
    mark('plex')
    await wait(page, 2500)
    await clickWithCursor(page, page.locator('.setup-next, .ui-button-primary').filter({ visible: true }).last())
    await wait(page, 600)
    mark('done')
    await wait(page, 4000)
    await clickWithCursor(page, page.getByRole('button', { name: 'Start watching' }))
    mark('home')
    await wait(page, 6000)
  },
})

add('setup', {
  prepare: (page) => settle(page, '#/settings/system/setup', 4000, B3),
  run: async ({ page, mark }) => {
    mark('start')
    await wait(page, 4000)
  },
})


const visibleCell = async (page, text, { minX = 360, maxX = 1180 } = {}) => {
  const cells = page.locator('button.epg-cell', { hasText: text })
  const n = await cells.count()
  for (let i = 0; i < n; i++) {
    const b = await cells.nth(i).boundingBox()
    if (b && b.x >= minX && b.x + Math.min(b.width, 200) <= maxX + 200 && b.y > 300 && b.y < 760) return cells.nth(i)
  }
  throw new Error(`no visible cell ${text}`)
}
const pick = (page, role, name) => page.getByRole(role, { name, exact: true }).first()
const guideAt = async (page, day) => {
  await settle(page, '#/guide')
  await page.getByRole('button', { name: day, exact: true }).first().click()
  await wait(page, 800)
  await page.getByRole('button', { name: 'Tonight', exact: true }).first().click()
  await wait(page, 1500)
  await installCursor(page)
}

add('rguide', {
  prepare: async (page) => {
    await settle(page, '#/guide')
    for (const n of ['Sat', 'Sun', 'Tonight', 'Today', 'Now']) {
      await page.getByRole('button', { name: n, exact: true }).first().click()
      await wait(page, 600)
      await warm(page)
    }
    await installCursor(page)
  },
  run: async ({ page, mark }) => {
    mark('start')
    await wait(page, 1800)
    await glide(page, { selector: '.epg-scroll', dx: 360, ms: 2200 })
    await wait(page, 600)
    mark('days')
    await clickWithCursor(page, pick(page, 'button', 'Sat'))
    await wait(page, 1300)
    await clickWithCursor(page, pick(page, 'button', 'Sun'))
    await wait(page, 1000)
    mark('tonight')
    await clickWithCursor(page, pick(page, 'button', 'Tonight'))
    await wait(page, 1500)
    await clickWithCursor(page, pick(page, 'button', 'Now'))
    await wait(page, 1500)
    mark('star')
    await clickWithCursor(page, page.getByRole('button', { name: 'Add Nightline to favourites' }).first())
    await wait(page, 3000)
  },
})

add('rec1', {
  prepare: (page) => guideAt(page, 'Sat'),
  run: async ({ page, mark }) => {
    mark('start')
    await wait(page, 800)
    await clickWithCursor(page, await visibleCell(page, 'Kitchen Heat'))
    mark('sheet')
    await wait(page, 3500)
    mark('pad')
    await clickWithCursor(page, pick(page, 'button', 'Start earlier'))
    await wait(page, 700)
    await clickWithCursor(page, pick(page, 'button', 'Start less early'))
    await wait(page, 700)
    await clickWithCursor(page, pick(page, 'button', 'Finish later'))
    await wait(page, 700)
    await clickWithCursor(page, pick(page, 'button', 'Finish less late'))
    await wait(page, 1000)
    mark('record')
    await clickWithCursor(page, pick(page, 'button', 'Record'))
    await wait(page, 600)
    mark('recorded')
    await wait(page, 3500)
  },
})

add('rseries', {
  prepare: (page) => guideAt(page, 'Sat'),
  run: async ({ page, mark }) => {
    mark('start')
    await wait(page, 600)
    await clickWithCursor(page, await visibleCell(page, 'Wild Neighbours'))
    await wait(page, 2000)
    mark('every')
    await clickWithCursor(page, page.getByRole('radio', { name: 'Every episode', exact: true }).first())
    await wait(page, 1800)
    mark('keep')
    await clickWithCursor(page, pick(page, 'button', 'Keep fewer'))
    await wait(page, 900)
    await clickWithCursor(page, pick(page, 'button', 'Keep fewer'))
    await wait(page, 1200)
    mark('any')
    await clickWithCursor(page, page.getByRole('switch', { name: 'Record on any channel' }).first())
    await wait(page, 1500)
    mark('record')
    await clickWithCursor(page, pick(page, 'button', 'Record series'))
    await wait(page, 600)
    mark('recorded')
    await wait(page, 4000)
  },
})

add('rcancel', {
  prepare: (page) => guideAt(page, 'Sat'),
  run: async ({ page, mark }) => {
    mark('start')
    await wait(page, 600)
    await clickWithCursor(page, await visibleCell(page, 'Kitchen Heat'))
    await wait(page, 1500)
    mark('cancel')
    await cursorToBox(page, pick(page, 'button', 'Cancel recording'))
    await wait(page, 2200)
    await page.keyboard.press('Escape')
    await wait(page, 1000)
    await page.getByRole('button', { name: 'Sat', exact: true }).first().click()
    await wait(page, 1500)
    await clickWithCursor(page, await visibleCell(page, 'Wild Neighbours'))
    await wait(page, 1500)
    mark('skip')
    await cursorToBox(page, pick(page, 'button', 'Skip this episode'))
    await wait(page, 1800)
    mark('cseries')
    await cursorToBox(page, pick(page, 'button', 'Cancel series'))
    await wait(page, 2500)
  },
})

add('rwatch', {
  prepare: (page) => settle(page, '#/guide'),
  run: async ({ page, mark }) => {
    mark('start')
    await wait(page, 600)
    await clickWithCursor(page, pick(page, 'button', 'Search the next 7 days'))
    await wait(page, 500)
    await page.keyboard.type('Harbour Lights', { delay: 90 })
    await wait(page, 1500)
    mark('add')
    await clickWithCursor(page, page.getByRole('button', { name: /to watchlist/ }).first())
    await wait(page, 1500)
    mark('switch')
    await clickWithCursor(page, page.getByRole('switch', { name: 'Record when it appears' }).first())
    await wait(page, 1500)
    await clickWithCursor(page, page.getByRole('button', { name: 'Record when it appears', exact: true }).last())
    await wait(page, 2500)
    mark('done')
  },
})

add('rsched', {
  width: 1600, height: 1000, scale: 1,
  prepare: (page) => settle(page, '#/recordings/scheduled', 4000),
  run: async ({ page, mark }) => {
    mark('start')
    await wait(page, 2500)
    mark('scroll')
    await glide(page, { dy: 520, ms: 2600 })
    await wait(page, 1200)
    await glide(page, { dy: -520, ms: 1800 })
    await wait(page, 600)
    mark('skip')
    await clickWithCursor(page, page.getByRole('switch', { name: /^Skip / }).nth(1))
    await wait(page, 2500)
    mark('timeline')
    await cursorTo(page, 1300, 500)
    await wait(page, 4000)
  },
})


add('rads', {
  prepare: async (page) => {
    await settle(page, '#/settings/ad-removal')
    const sw = page.getByRole('switch').first()
    if ((await sw.getAttribute('aria-checked')) === 'true') {
      await sw.click()
      await wait(page, 400)
      await page.getByRole('button', { name: 'Save settings' }).click()
      await wait(page, 1500)
    }
    await installCursor(page)
  },
  run: async ({ page, mark }) => {
    mark('start')
    await wait(page, 1500)
    mark('enable')
    await clickWithCursor(page, page.getByRole('switch').first())
    await wait(page, 900)
    await cursorToBox(page, page.locator('input').first())
    await wait(page, 900)
    mark('save')
    await clickWithCursor(page, page.getByRole('button', { name: 'Save settings' }))
    await wait(page, 1500)
    mark('rules')
    await clickWithCursor(page, page.getByRole('link', { name: 'Series rules' }).first())
    await wait(page, 2000)
    await cursorToBox(page, page.getByText('Wild Neighbours').first())
    await page.getByText('Wild Neighbours').first().click({ force: true })
    await wait(page, 1500)
    const sel = page.locator('select').filter({ hasText: 'Detect' }).first()
    await cursorToBox(page, sel)
    await wait(page, 600)
    mark('detect')
    await sel.selectOption({ index: 1 })
    await wait(page, 2500)
    mark('cut')
    await sel.selectOption({ index: 2 })
    await wait(page, 1200)
    await clickWithCursor(page, page.getByRole('button', { name: 'Save', exact: true }).first())
    await wait(page, 2500)
  },
})

add('rphone', {
  width: 390, height: 844, scale: 3, mobile: true,
  prepare: async (page) => {
    await settle(page, '#/guide', 4500)
    await page.getByRole('button', { name: 'Sat', exact: true }).first().tap()
    await wait(page, 2500)
    await warm(page)
  },
  run: async ({ page, mark }) => {
    mark('start')
    await wait(page, 1200)
    const cell = page.locator('button.epg-cell', { hasText: 'Kitchen Heat' })
    const n = await cell.count()
    let target = cell.first()
    for (let i = 0; i < n; i++) { const b = await cell.nth(i).boundingBox(); if (b && b.x > 100 && b.x < 330 && b.y > 150 && b.y < 760) { target = cell.nth(i); break } }
    await target.tap()
    mark('sheet')
    await wait(page, 3500)
  },
})


add('wtvapps', {
  prepare: async (page) => {
    await settle(page, '#/settings/tv-apps')
    const del = page.getByRole('button', { name: 'Delete TV login' })
    if (await del.count()) {
      await del.click()
      await wait(page, 800)
      await page.getByRole('button', { name: /^Delete/ }).last().click()
      await wait(page, 2000)
    }
    await installCursor(page)
  },
  run: async ({ page, mark }) => {
    mark('start')
    await wait(page, 1500)
    mark('make')
    await clickWithCursor(page, page.getByRole('button', { name: 'Make a TV login' }))
    await wait(page, 3500)
    mark('made')
    const addr = page.getByLabel('TVHeadend address for TV apps')
    await clickWithCursor(page, addr)
    await addr.pressSequentially('192.168.1.20', { delay: 80 })
    await page.keyboard.press('Tab')
    await wait(page, 2000)
    mark('rows')
    await glide(page, { dy: 400, ms: 2000 })
    await wait(page, 1200)
    mark('copy')
    await clickWithCursor(page, page.getByRole('button', { name: /Copy/ }).first())
    await wait(page, 3000)
  },
})

add('wplay', {
  prepare: async (page) => {
    await settle(page, '#/recordings')
    await page.getByText('Big Wave Season', { exact: true }).first().click({ force: true })
    await wait(page, 3000)
    await installCursor(page)
  },
  run: async ({ page, mark }) => {
    mark('start')
    await wait(page, 1500)
    mark('play')
    await clickWithCursor(page, page.getByRole('button', { name: 'Play E13 · Episode 13' }))
    await wait(page, 5000)
    await page.mouse.move(640, 500)
    const skip = page.getByRole('button', { name: /Skip ad/i }).first()
    await skip.waitFor({ state: 'visible', timeout: 20000 }).catch(() => console.log('no skip button'))
    mark('skip')
    await wait(page, 1500)
    await clickWithCursor(page, skip, { dwell: 600 }).catch((e) => console.log('skip click failed', e.message))
    await wait(page, 4000)
    mark('done')
  },
})

add('whomephone', {
  width: 390, height: 844, scale: 3, mobile: true,
  prepare: (page) => settle(page, '#/home', 5000),
  run: async ({ page, mark }) => {
    mark('start')
    await wait(page, 4000)
  },
})


const openShow = async (page, title) => {
  await settle(page, '#/recordings')
  await page.getByText(title, { exact: true }).first().click({ force: true })
  await wait(page, 3000)
  await installCursor(page)
}

add('llib', {
  prepare: (page) => settle(page, '#/recordings', 4000),
  run: async ({ page, mark }) => {
    mark('start')
    await wait(page, 2500)
    mark('scroll')
    await glide(page, { dy: 420, ms: 2400 })
    await wait(page, 1500)
    await glide(page, { dy: -420, ms: 1800 })
    mark('badge')
    await cursorTo(page, 260, 330)
    await wait(page, 2500)
    mark('open')
    await clickWithCursor(page, page.getByText('Big Wave Season', { exact: true }).first())
    await wait(page, 3500)
    mark('show')
    await glide(page, { dy: 380, ms: 2400 })
    await wait(page, 2500)
  },
})

add('lmenu', {
  prepare: (page) => openShow(page, 'Big Wave Season'),
  run: async ({ page, mark }) => {
    mark('start')
    await glide(page, { dy: 300, ms: 1200 })
    await wait(page, 600)
    mark('menu')
    await clickWithCursor(page, page.getByRole('button', { name: /^Actions for E3/ }).first())
    await wait(page, 1500)
    mark('items')
    for (const n of ['Mark as watched', 'Episode info', 'Delete episode']) {
      await cursorToBox(page, page.getByRole('button', { name: n, exact: true }).first())
      await wait(page, 900)
    }
    mark('delete')
    await clickWithCursor(page, page.getByRole('button', { name: 'Delete episode', exact: true }).first())
    await wait(page, 2500)
    mark('dialog')
    await glide(page, { selector: '[role=dialog] .ui-dialog-body, [role=dialog]', dy: 300, ms: 1500 })
    await wait(page, 3000)
    mark('cancel')
    await clickWithCursor(page, page.getByRole('button', { name: 'Cancel', exact: true }).last())
    await wait(page, 1200)
  },
})

add('lopts', {
  prepare: (page) => openShow(page, 'Big Wave Season'),
  run: async ({ page, mark }) => {
    mark('start')
    await wait(page, 800)
    await clickWithCursor(page, page.getByRole('button', { name: 'Recording options' }).first())
    await wait(page, 2000)
    mark('open')
    await glide(page, { selector: '[role=dialog]', dy: 250, ms: 1500 })
    await wait(page, 2500)
    mark('pause')
    const pause = page.getByRole('button', { name: /Pause recording/ }).or(page.getByRole('switch', { name: /Pause/ })).first()
    await cursorToBox(page, pause).catch(() => {})
    await wait(page, 3000)
  },
})

add('larr', {
  prepare: (page) => settle(page, '#/settings/arr'),
  run: async ({ page, mark }) => {
    mark('start')
    await wait(page, 1500)
    mark('find')
    await clickWithCursor(page, page.getByRole('button', { name: 'Find Sonarr and Radarr' }))
    await wait(page, 5000)
  },
})


add('hhome', {
  prepare: (page) => settle(page, '#/home', 5000),
  run: async ({ page, mark }) => {
    mark('start')
    await wait(page, 5000)
    mark('rows')
    await glide(page, { dy: 450, ms: 2600 })
    await wait(page, 1500)
    await glide(page, { dy: 450, ms: 2400 })
    await wait(page, 1800)
    mark('hold')
    const card = page.locator('button[aria-label^="More for"]').first()
    await clickWithCursor(page, card)
    await wait(page, 2500)
    await page.keyboard.press('Escape')
    await wait(page, 800)
  },
})

add('hsearch', {
  prepare: (page) => settle(page, '#/home', 4000),
  run: async ({ page, mark }) => {
    mark('start')
    await wait(page, 800)
    await clickWithCursor(page, page.getByRole('button', { name: 'Search', exact: true }).first())
    await wait(page, 600)
    await page.keyboard.type('bws', { delay: 160 })
    await wait(page, 2200)
    await imagesReady(page, 5000)
    mark('typo')
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Meta+A')
    await page.keyboard.type('mountin rangers', { delay: 90 })
    await wait(page, 3000)
  },
})

add('hforyou', {
  prepare: (page) => settle(page, '#/for-you', 5000),
  run: async ({ page, mark }) => {
    mark('start')
    await wait(page, 3000)
    mark('scroll')
    await glide(page, { dy: 400, ms: 2400 })
    await wait(page, 1500)
    await glide(page, { dy: -400, ms: 1500 })
    mark('menu')
    await clickWithCursor(page, page.locator('button[aria-label^="More for"]').first())
    await wait(page, 1500)
    mark('why')
    const why = page.getByRole('menuitem', { name: /Why this/ }).or(page.getByRole('button', { name: /Why this/ })).first()
    await clickWithCursor(page, why).catch((e) => console.log('why', e.message))
    await wait(page, 3500)
  },
})

add('hactivity', {
  prepare: (page) => settle(page, '#/settings/system/activity', 4000),
  run: async ({ page, mark }) => {
    mark('start')
    await wait(page, 3000)
    mark('syncs')
    await clickWithCursor(page, page.getByRole('tab', { name: /Syncs/ }).or(page.getByRole('link', { name: /^Syncs/ })).first())
    await wait(page, 2500)
    mark('syncnow')
    await clickWithCursor(page, page.getByRole('button', { name: 'Sync now' }).first())
    await wait(page, 4000)
  },
})

add('hhealth', {
  prepare: (page) => settle(page, '#/settings/system/health', 4000),
  run: async ({ page, mark }) => {
    mark('start')
    await wait(page, 3000)
    await glide(page, { dy: 400, ms: 2400 })
    await wait(page, 1500)
  },
})

add('hdot', {
  routes: async (context) => {
    await context.route('**/api/health-summary**', async (r) => {
      const res = await r.fetch()
      const body = await res.json()
      r.fulfill({ response: res, json: { ...body, level: 'fail', sentence: 'The TVHeadend tuners check failed.' } })
    })
  },
  prepare: (page) => settle(page, '#/home', 5000),
  run: async ({ page, mark }) => {
    mark('start')
    await wait(page, 3000)
    mark('settings')
    await cursorToBox(page, page.getByRole('link', { name: 'Settings' }).first())
    await wait(page, 2000)
    mark('alert')
    await clickWithCursor(page, page.getByText('The TVHeadend tuners check failed.').first())
    await wait(page, 3500)
  },
})

add('hsettings', {
  prepare: (page) => settle(page, '#/settings', 4000),
  run: async ({ page, mark }) => {
    mark('start')
    await wait(page, 2500)
    mark('search')
    await clickWithCursor(page, page.getByPlaceholder('Search settings').first())
    await page.keyboard.type('plex', { delay: 150 })
    await wait(page, 2500)
    await page.keyboard.press('Escape')
    mark('diagram')
    await page.goto(`${BASE}/#/settings/diagram`)
    await wait(page, 2500)
    await imagesReady(page, 5000)
    await installCursor(page)
    await wait(page, 2500)
    mark('setup')
    await page.goto(`${BASE}/#/settings/system/setup`)
    await wait(page, 3500)
    await installCursor(page)
    await wait(page, 1500)
  },
})

add('hphonetabs', {
  width: 390, height: 844, scale: 3, mobile: true,
  prepare: (page) => settle(page, '#/home', 5000),
  run: async ({ page, mark }) => {
    mark('start')
    await wait(page, 4000)
  },
})


const tuneIn = async (page, name = 'Coastline') => {
  await page.locator(`[aria-label^="Watch ${name} live"]`).first().click()
  await page.waitForFunction(() => { const v = document.querySelector('video'); return v && v.currentTime > 0.5 && !v.paused }, null, { timeout: 30000 }).catch(() => {})
}
const wake = async (page) => { await page.mouse.move(640, 380); await wait(page, 120); await page.mouse.move(650, 390) }
const moreMenu = async (page, item) => {
  await wake(page)
  await clickWithCursor(page, page.getByRole('button', { name: 'More', exact: true }).first())
  await wait(page, 600)
  await clickWithCursor(page, page.getByRole('menuitem', { name: item }).or(page.getByRole('button', { name: item, exact: true })).first())
}

add('wlive', {
  prepare: (page) => settle(page, '#/live', 4000),
  run: async ({ page, mark }) => {
    mark('start')
    await wait(page, 1500)
    await glide(page, { dy: 200, ms: 1500 })
    await wait(page, 600)
    await glide(page, { dy: -200, ms: 1200 })
    mark('tune')
    await clickWithCursor(page, page.locator('[aria-label^="Watch Coastline live"]').first())
    await page.waitForFunction(() => { const v = document.querySelector('video'); return v && v.currentTime > 0.5 && !v.paused }, null, { timeout: 30000 }).catch(() => {})
    mark('playing')
    await wake(page)
    await wait(page, 6000)
  },
})

add('wrewind', {
  prepare: async (page) => { await settle(page, '#/live', 4000); await tuneIn(page); await wait(page, 4000); await installCursor(page) },
  run: async ({ page, mark }) => {
    mark('start')
    await wake(page)
    await wait(page, 800)
    mark('pause')
    await clickWithCursor(page, page.getByRole('button', { name: 'Pause' }).first())
    await wait(page, 1800)
    await clickWithCursor(page, page.getByRole('button', { name: 'Play' }).first())
    await wait(page, 800)
    mark('drag')
    await wake(page)
    await cursorTo(page, 1158, 730)
    await page.mouse.down()
    for (let i = 1; i <= 20; i++) { await page.mouse.move(1158 - i * 22, 730); await page.evaluate(([x, y]) => window.__wt.move(x, y), [1158 - i * 22, 730]); await wait(page, 30) }
    await page.mouse.up()
    await wait(page, 2500)
    mark('startover')
    await wake(page)
    await clickWithCursor(page, page.getByRole('button', { name: /Start over/ }).first())
    await wait(page, 900)
    const fromStart = page.getByRole('menuitem', { name: /From the start/ }).or(page.getByRole('button', { name: /From the start/ })).first()
    await clickWithCursor(page, fromStart).catch((e) => console.log('fromstart', e.message))
    await wait(page, 3500)
    mark('golive')
    await wake(page)
    await clickWithCursor(page, page.getByRole('button', { name: /Go live/ }).first()).catch((e) => console.log('golive', e.message))
    await wait(page, 3000)
  },
})

add('wmini', {
  prepare: async (page) => { await settle(page, '#/guide', 3000); await page.goto(`${BASE}/#/live`); await wait(page, 2500); await tuneIn(page); await wait(page, 3000); await installCursor(page) },
  run: async ({ page, mark }) => {
    mark('start')
    await wait(page, 800)
    await moreMenu(page, 'Miniplayer')
    mark('mini')
    await wait(page, 1500)
    await clickWithCursor(page, page.getByRole('link', { name: 'TV guide' }).first())
    await wait(page, 2000)
    await glide(page, { selector: '.epg-scroll', dx: 300, ms: 2500 })
    await wait(page, 2500)
  },
})

add('wphonemini', {
  width: 390, height: 844, scale: 3, mobile: true,
  prepare: async (page) => { await settle(page, '#/live', 4000); await page.locator('[aria-label^="Watch Coastline live"]').first().tap(); await wait(page, 8000); await installCursor(page) },
  run: async ({ page, mark }) => {
    mark('start')
    await page.mouse.click(195, 150)
    await wait(page, 800)
    const more = page.getByRole('button', { name: 'More', exact: true }).first()
    await more.tap().catch(() => {})
    await wait(page, 800)
    await page.getByRole('menuitem', { name: 'Miniplayer' }).or(page.getByRole('button', { name: 'Miniplayer', exact: true })).first().tap().catch((e) => console.log('mini', e.message))
    mark('mini')
    await wait(page, 4000)
  },
})

add('wmulti', {
  prepare: async (page) => { await settle(page, '#/live', 4000); await tuneIn(page); await wait(page, 3000); await installCursor(page) },
  run: async ({ page, mark }) => {
    mark('start')
    await moreMenu(page, 'Multiview')
    await wait(page, 600)
    mark('sheet')
    await wait(page, 2500)
    await clickWithCursor(page, page.getByText('Harbour', { exact: true }).first())
    await wait(page, 4000)
    mark('two')
    for (const ch of ['Nightline', 'Ridgeline']) {
      await wake(page)
      await clickWithCursor(page, page.getByRole('button', { name: /Add channel/ }).first()).catch((e) => console.log('add', e.message))
      await wait(page, 1500)
      await clickWithCursor(page, page.getByText(ch, { exact: true }).last()).catch((e) => console.log(ch, e.message))
      await wait(page, 3500)
    }
    mark('four')
    await wait(page, 4000)
  },
})

const names = process.argv.slice(2)
for (const n of names) await SHOTS[n]()
