import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { openStage } from './open-stage.mjs'

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')))
const FPS = 30

const renderStills = async (browser, times, outDir) => {
  const page = await openStage(browser, { video: args.video })
  await mkdir(outDir, { recursive: true })
  for (const t of times) {
    await page.evaluate((t) => window.renderAt(t), t)
    await page.screenshot({ path: `${outDir}/still-${t.toFixed(1).padStart(6, '0')}.jpg`, type: 'jpeg', quality: 85 })
  }
}

const renderRange = async (browser, { from, to, out }) => {
  const page = await openStage(browser, { video: args.video })
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), out], { stdio: ['pipe', 'inherit', 'inherit'] })
  for (let f = from; f < to; f++) {
    await page.evaluate((t) => window.renderAt(t), f / FPS)
    const buf = await page.screenshot({ type: 'jpeg', quality: 93 })
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
    if (f % 600 === 0) console.log(`${out.split('/').pop()} frame ${f}/${to}`)
  }
  ff.stdin.end()
  await new Promise((r) => ff.on('close', r))
}

const browser = await chromium.launch()
if (args.stills) {
  await renderStills(browser, args.stills.split(',').map(Number), args.out)
} else {
  const total = Math.round(Number(args.duration) * FPS)
  const workers = Number(args.workers || 4)
  const chunk = Math.ceil(total / workers)
  await mkdir(args.out, { recursive: true })
  const parts = []
  await Promise.all(Array.from({ length: workers }, (_, i) => {
    const from = i * chunk
    const to = Math.min(total, from + chunk)
    const out = `${args.out}/part-${i}.mp4`
    parts.push(out)
    return renderRange(browser, { from, to, out })
  }))
  await writeFile(`${args.out}/parts.txt`, parts.map((p) => `file '${p}'`).join('\n'))
}
await browser.close()
