import { writeFile } from 'node:fs/promises'
import { openBrowser, record, installCursor, cursorToBox, clickWithCursor, wait } from './lib.mjs'

const BASE = 'http://127.0.0.1:3858'
const OUT = new URL('./raw/wizard/', import.meta.url).pathname
const TUNERS = [0, 1, 2, 3].map((n) => ({ id: `tuner-${n}`, name: `HDHomeRun DVB-T Tuner #${n} (192.168.1.50)`, deliverySystem: 'dvbt' }))
const CITIES = ['Adelaide', 'Brisbane', 'Canberra', 'Hobart', 'Melbourne', 'Perth', 'Sydney']
const TRANSMITTERS = CITIES.map((c) => ({ key: `dvbt/au/dvb-t_au-${c}`, country: 'au', countryName: 'Australia', name: `au-${c}` }))
const STEPS = [
  { id: 'network', label: 'Create the TV network', ms: 900 },
  { id: 'tuners', label: 'Turn on the tuners', ms: 900 },
  { id: 'scan', label: 'Scan for channels', ms: 5200 },
  { id: 'map', label: 'Add the channels', ms: 2200 },
  { id: 'recording', label: 'Check the recording settings', ms: 800 },
]
const MUXES = 6

const statusBody = ({ ready }) => ({
  ok: true,
  suggestion: ready
    ? { state: 'has-channels', deliverySystem: { id: 'dvbt', label: 'Antenna (DVB-T)' }, tunerIds: TUNERS.map((t) => t.id), networkId: 'demo-network', country: 'au', transmitterKey: TRANSMITTERS[6].key, countries: [{ code: 'au', name: 'Australia' }] }
    : { state: 'ready', deliverySystem: { id: 'dvbt', label: 'Antenna (DVB-T)' }, tunerIds: TUNERS.map((t) => t.id), networkId: null, country: 'au', transmitterKey: TRANSMITTERS[6].key, countries: [{ code: 'au', name: 'Australia' }] },
  tuners: TUNERS,
  networks: ready ? [{ id: 'demo-network', name: 'au-Sydney', services: 32 }] : [],
  channels: ready ? 8 : 0,
  recordingNow: [],
  transmitters: TRANSMITTERS,
  dockerVm: null,
  tunerAddress: { address: '', hostAddress: '' },
})

const job = { startedAt: 0 }
const snapshot = () => {
  if (!job.startedAt) return null
  const elapsed = Date.now() - job.startedAt
  let from = 0
  const steps = STEPS.map((s) => {
    const start = from
    from += s.ms
    const status = elapsed >= from ? 'done' : elapsed >= start ? 'running' : 'pending'
    const p = Math.max(0, Math.min(1, (elapsed - start) / s.ms))
    let detail = null
    if (s.id === 'scan' && status !== 'pending') {
      const scanned = Math.min(MUXES, Math.floor(p * MUXES))
      detail = { frequencies: MUXES, scanned, received: scanned, queued: MUXES - scanned - (scanned < MUXES ? 1 : 0), active: scanned < MUXES ? 1 : 0, services: scanned * 6, waitingForTuner: false }
    }
    if (s.id === 'map' && status !== 'pending') detail = { total: 32, ok: Math.round(p * 32), fail: 0 }
    return { id: s.id, label: s.label, status, detail }
  })
  const running = elapsed < from
  return { running, steps, result: running ? null : { ok: true, networkId: 'demo-network', channels: 8, channelsBefore: 0, steps } }
}

const { browser, context, page } = await openBrowser({})
await context.route('**/api/tvh-detect', (r) => r.fulfill({ json: { candidates: [{ url: 'http://localhost:9981' }] } }))
await context.route('**/api/tvh-setup/status', (r) => r.fulfill({ json: { ...statusBody({ ready: Boolean(snapshot() && !snapshot().running) }), job: snapshot() } }))
await context.route('**/api/tvh-setup/progress', (r) => r.fulfill({ json: snapshot() || { running: false, steps: [], result: null } }))
await context.route('**/api/tvh-setup/apply', (r) => {
  job.startedAt = Date.now()
  r.fulfill({ status: 202, json: { ok: true, steps: snapshot().steps } })
})

await page.goto(`${BASE}/`)
await wait(page, 3000)
await installCursor(page)
const cast = await record({ page, dir: OUT })
const marks = {}
const mark = (key) => { marks[key] = +((Date.now() - cast.startedAt) / 1000).toFixed(2); console.log(`mark ${key} ${marks[key]}`) }
const next = () => page.locator('.setup-next, .ui-button-primary').filter({ visible: true }).last()
try {
  mark('welcome')
  await wait(page, 2200)
  await clickWithCursor(page, page.getByRole('button', { name: 'Start setup' }))
  await wait(page, 2200)
  mark('tvh')
  const pw = page.locator('#setup-admin-password')
  await cursorToBox(page, pw)
  await pw.click()
  await pw.pressSequentially('DemoAdmin2026', { delay: 70 })
  await wait(page, 500)
  mark('secure')
  await clickWithCursor(page, page.getByRole('button', { name: 'Secure and connect' }))
  await page.getByText('TVHeadend is secured.', { exact: true }).waitFor({ timeout: 30000 })
  await wait(page, 1200)
  mark('secured')
  await clickWithCursor(page, page.getByRole('button', { name: 'Save and next' }))
  await wait(page, 2500)
  mark('channels')
  await clickWithCursor(page, next())
  mark('scan')
  await wait(page, 11500)
  mark('scanned')
  await clickWithCursor(page, next())
  await wait(page, 2200)
  mark('guide-step')
  await page.selectOption('#guide-feed', { label: 'Another address' })
  await wait(page, 500)
  await page.locator('#guide-url').fill('http://192.168.86.246:3890/xmltv.xml')
  await wait(page, 900)
  mark('guide')
  await clickWithCursor(page, page.getByRole('button', { name: 'Set up guide' }))
  await page.getByText(/channels have a guide/).first().waitFor({ timeout: 90000 })
  await wait(page, 1500)
  mark('guided')
  await clickWithCursor(page, next())
  await wait(page, 2500)
  mark('folders')
  await clickWithCursor(page, next())
  await wait(page, 2500)
  mark('plex')
  await clickWithCursor(page, page.getByRole('button', { name: 'Skip Plex' }))
  await wait(page, 600)
  mark('done')
  await wait(page, 5000)
} finally {
  mark('end')
  await cast.stop()
  await writeFile(`${OUT}marks.json`, JSON.stringify(marks, null, 2))
  await browser.close()
}
