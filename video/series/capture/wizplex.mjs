import { writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { record, installCursor, cursorTo, cursorToBox, clickWithCursor, wait } from './lib.mjs'
import { ADMIN_PASSWORD, prepareWizardContext } from '../../../scripts/capture-wizard-api.mjs'
import { startLoopback } from '../../../scripts/capture-loopback.mjs'

const NAME = 'wizplex'
const OUT = new URL(`./raw/${NAME}/`, import.meta.url).pathname
const SERVER_URL = (process.env.FTV_URL || 'http://127.0.0.1:3813').replace(/\/$/, '')
const TIMEZONE = 'Australia/Sydney'
const JOB_TIMEOUT_MS = 40_000
const DEMO_STACK_TEXT = {
  '192.168.86.20:9981': 'localhost:9981',
  'http://192.168.86.20:32400': 'http://localhost:32400',
  '35 channels': '8 channels',
  '32 of 35 channels': '8 of 8 channels',
  '35': '8',
  '32 of 35': '8 of 8',
  Sydney: 'Guide feed',
}

const run = async () => {
  const base = await startLoopback({ target: SERVER_URL })
  const browser = await chromium.launch({ channel: 'chrome' })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.25, timezoneId: TIMEZONE })
  const { serverWrites } = await prepareWizardContext({ context, timeZone: TIMEZONE })
  await context.addInitScript(swapText, DEMO_STACK_TEXT)
  const page = await context.newPage()
  await walkToPlex({ page, base }).catch(async (err) => {
    await browser.close()
    throw err
  })
  await installCursor(page)
  await cursorTo(page, 1180, 640)
  const cast = await record({ page, dir: OUT })
  const marks = {}
  const mark = (key) => { marks[key] = +((Date.now() - cast.startedAt) / 1000).toFixed(2); console.log(`${NAME} mark ${key} ${marks[key]}`) }
  try {
    await tourPlex({ page, mark })
  } finally {
    mark('end')
    await cast.stop()
    await writeFile(`${OUT}marks.json`, JSON.stringify(marks, null, 2))
    await browser.close()
  }
  if (serverWrites.length) throw new Error(`writes reached the server:\n  ${serverWrites.join('\n  ')}`)
  console.log('no server writes')
}

const walkToPlex = async ({ page, base }) => {
  await page.goto(`${base}/#/welcome`, { waitUntil: 'domcontentloaded' })
  await press(page, 'Start setup')
  await page.waitForSelector('text=This TVHeadend has no logins yet', { timeout: 15_000 })
  await page.getByLabel('Admin password').fill(ADMIN_PASSWORD)
  await press(page, 'Secure and connect')
  await press(page, 'Save and next', JOB_TIMEOUT_MS)
  await press(page, 'Find channels')
  await page.getByText(/^Added \d+ channels/).waitFor({ timeout: JOB_TIMEOUT_MS })
  await press(page, 'Next')
  await press(page, 'Set up guide')
  await page.getByText(/channels have a guide/).waitFor({ timeout: JOB_TIMEOUT_MS })
  await press(page, /^(Save and next|Next)$/)
  await page.getByText('TV library').first().waitFor({ timeout: 15_000 })
  await wait(page, 1500)
  await press(page, 'Next')
  await page.locator('#wizard-plex-oneoff-section').waitFor({ timeout: 20_000 })
  await wait(page, 1500)
}

const tourPlex = async ({ page, mark }) => {
  mark('plex')
  await wait(page, 1200)
  mark('rows')
  for (const kind of ['tv', 'movies', 'oneoff']) {
    await cursorToBox(page, page.locator(`#wizard-plex-${kind}-section`))
    await wait(page, 900)
  }
  await wait(page, 600)
  await clickWithCursor(page, nextButton(page))
  await wait(page, 600)
  mark('done')
  await wait(page, 5500)
}

const nextButton = (page) => page.getByRole('button', { name: 'Next', exact: true }).last()

const press = async (page, name, timeout = 15_000) => {
  const button = page.getByRole('button', { name, exact: typeof name === 'string' }).last()
  await button.waitFor({ timeout })
  await button.click()
  await wait(page, 700)
}

const swapText = (swaps) => {
  const fix = (node) => {
    if (node.nodeType === 3) {
      const text = node.nodeValue.trim()
      if (swaps[text]) node.nodeValue = node.nodeValue.replace(text, swaps[text])
      return
    }
    node.childNodes?.forEach(fix)
  }
  new MutationObserver((records) => records.forEach((r) => {
    if (r.type === 'characterData') fix(r.target)
    r.addedNodes?.forEach(fix)
  })).observe(document, { subtree: true, childList: true, characterData: true })
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
