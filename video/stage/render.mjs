import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const HERE = new URL('.', import.meta.url).pathname
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')))
const FPS = 30

const openStage = async (browser) => {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  page.on('pageerror', (e) => console.error('pageerror', e.message))
  await page.goto(`http://127.0.0.1:3895/stage.html`, { timeout: 180000 })
  await page.waitForFunction(() => window.renderAt && window.stageReady, null, { timeout: 180000 })
  await page.evaluate(() => window.stageReady)
  return page
}

const renderStills = async (browser, times, outDir) => {
  const page = await openStage(browser)
  await mkdir(outDir, { recursive: true })
  for (const t of times) {
    await page.evaluate((t) => window.renderAt(t), t)
    await page.screenshot({ path: `${outDir}/still-${String(t).padStart(6, '0')}.jpg`, type: 'jpeg', quality: 90 })
  }
}

const renderRange = async (browser, { from, to, out }) => {
  const page = await openStage(browser)
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), out], { stdio: ['pipe', 'inherit', 'inherit'] })
  for (let f = from; f < to; f++) {
    await page.evaluate((t) => window.renderAt(t), f / FPS)
    const buf = await page.screenshot({ type: 'jpeg', quality: 93 })
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
    if (f % 300 === 0) console.log(`${out.split('/').pop()} frame ${f}/${to}`)
  }
  ff.stdin.end()
  await new Promise((r) => ff.on('close', r))
}

const browser = await chromium.launch()
if (args.stills) {
  await renderStills(browser, args.stills.split(',').map(Number), args.out || `${HERE}../check/stills`)
} else {
  const total = Math.round(Number(args.duration) * FPS)
  const workers = Number(args.workers || 4)
  const chunk = Math.ceil(total / workers)
  const outDir = args.out
  await mkdir(outDir, { recursive: true })
  const parts = []
  await Promise.all(Array.from({ length: workers }, (_, i) => {
    const from = i * chunk
    const to = Math.min(total, from + chunk)
    const out = `${outDir}/part-${i}.mp4`
    parts.push(out)
    return renderRange(browser, { from, to, out })
  }))
  await writeFile(`${outDir}/parts.txt`, parts.map((p) => `file '${p}'`).join('\n'))
}
await browser.close()
