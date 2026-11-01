import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { chromium } from 'playwright'
import { openStage } from '../stage/open-stage.mjs'

const SERIES = new URL('../', import.meta.url).pathname
const VIDEO = new URL('../../', import.meta.url).pathname
const SLUG = process.argv[2]
const CUT = !existsSync(`${SERIES}${SLUG}/timeline.json`) && existsSync(`${VIDEO}${SLUG}/timeline.json`)
const TARGET = CUT
  ? { timeline: `${VIDEO}${SLUG}/timeline.json`, mp4: `${VIDEO}freetvarr-${SLUG}.mp4`, stage: { root: `${VIDEO}stage/`, path: 'stage.html' } }
  : { timeline: `${SERIES}${SLUG}/timeline.json`, mp4: `${SERIES}${SLUG}/video-${SLUG}.mp4`, stage: { video: SLUG } }
const args = Object.fromEntries(process.argv.slice(3).map((a) => a.replace(/^--/, '').split('=')))
const FPS = 30
const WORKERS = Number(args.workers || process.env.WORKERS || (CUT ? 4 : 6))
const COLD_FRAMES = Number(args.coldFrames || 15)
const MP4_EVERY = Number(args.every || 1)
const MP4_MIN_PSNR = Number(args.minPsnr || 47)
const MP4_MIN_RUN = Number(args.minRun || 3)
const TOLERANCE = 0.5
const run = promisify(execFile)

const main = async () => {
  const timeline = JSON.parse(await readFile(TARGET.timeline, 'utf8'))
  if (CUT) await writeFile(`${VIDEO}stage/timeline.js`, `export const TIMELINE = ${JSON.stringify(timeline)}\n`)
  const total = Math.round(timeline.duration * FPS)
  const browser = await chromium.launch()
  try {
    const findings = 'mp4' in args ? await checkMp4(browser, total) : await checkStage(browser, total)
    report({ timeline, findings })
    process.exitCode = findings.length ? 1 : 0
  } finally {
    await browser.close()
  }
}

const checkStage = async (browser, total) => {
  const cold = await coldStarts(browser, total)
  const warm = await warmPass(browser, total)
  return [...fontFindings(warm), ...shiftFindings(warm), ...coldFindings({ cold, warm })]
}

const checkMp4 = async (browser, total) => {
  const file = args.mp4 && args.mp4 !== 'true' ? args.mp4 : TARGET.mp4
  const dir = await mkdtemp(`${tmpdir()}/layout-shift-`)
  try {
    const frames = await extractFrames({ file, dir, total })
    const page = await openStage(browser, TARGET.stage)
    const findings = []
    for (const [frame, published] of frames) {
      await page.evaluate((t) => window.renderAt(t), frame / FPS)
      const reference = `${dir}/ref-${frame}.jpg`
      await page.screenshot({ path: reference, type: 'jpeg', quality: 93 })
      const psnr = await similarity(published, reference)
      if ('verbose' in args) console.log(`${seconds(frame)} PSNR ${psnr.toFixed(1)} dB`)
      if (psnr < MP4_MIN_PSNR) findings.push({ frame, kind: 'mp4 differs from stage', box: { key: 'frame', text: '' }, detail: `PSNR ${psnr.toFixed(1)} dB` })
    }
    await page.close()
    return sustained(findings, Math.max(1, Math.round(MP4_EVERY * FPS)))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const warmPass = async (browser, total) => {
  const page = await openStage(browser, TARGET.stage)
  const frames = new Map()
  for (let f = 0; f < total; f++) frames.set(f, await measureAt(page, f))
  await page.close()
  return frames
}

const coldStarts = async (browser, total) => {
  const chunk = Math.ceil(total / WORKERS)
  const starts = Array.from({ length: WORKERS }, (_, i) => i * chunk).filter((f) => f < total)
  const runs = await Promise.all(starts.map(async (start) => {
    const page = await openStage(browser, { ...TARGET.stage, prepare: dropFirstFontRequest })
    const end = Math.min(total, start + COLD_FRAMES)
    const frames = []
    for (let f = start; f < end; f++) frames.push([f, await measureAt(page, f)])
    await page.close()
    return frames
  }))
  return new Map(runs.flat())
}

const dropFirstFontRequest = async (page, attempt) => {
  if (attempt > 1) return
  let dropped = false
  await page.route('**/*.woff2', async (route) => {
    if (dropped) return route.fallback()
    dropped = true
    await route.abort('connectionreset')
  })
}

const fontFindings = (warm) => [...warm].flatMap(([frame, boxes]) => boxes
  .filter((b) => !b.fontReady)
  .map((b) => ({ frame, kind: 'font not loaded', box: b, detail: b.font })))

const shiftFindings = (warm) => {
  const out = []
  let previous = new Map()
  for (const [frame, boxes] of warm) {
    for (const box of boxes) {
      const prior = previous.get(box.key)
      if (!prior || prior.text !== box.text || !prior.shown || !box.shown) continue
      const change = layoutChange(prior, box)
      if (change) out.push({ frame, kind: 'layout shift', box, detail: change })
    }
    previous = byKey(boxes)
  }
  return out
}

const coldFindings = ({ cold, warm }) => [...cold].flatMap(([frame, boxes]) => {
  const reference = byKey(warm.get(frame) ?? [])
  return boxes.flatMap((box) => {
    const warmBox = reference.get(box.key)
    const change = warmBox && warmBox.text === box.text ? layoutChange(warmBox, box) : ''
    if (!box.fontReady) return [{ frame, kind: 'cold start, font not loaded', box, detail: [box.font, change].filter(Boolean).join('; ') }]
    return change && box.shown ? [{ frame, kind: 'cold start differs', box, detail: change }] : []
  })
})

const layoutChange = (a, b) => ['x', 'y', 'w', 'h', 'lines']
  .filter((k) => Math.abs(a[k] - b[k]) > TOLERANCE)
  .map((k) => `${k} ${round(a[k])}→${round(b[k])}`)
  .join(', ')

const report = ({ timeline, findings }) => {
  const mode = 'mp4' in args ? `mp4 sampled every ${MP4_EVERY} s` : `${WORKERS} worker cold starts`
  if (!findings.length) return console.log(`${SLUG}: no layout shift (${mode})`)
  const groups = groupFindings(findings)
  console.log(`${SLUG}: ${groups.length} layout problem(s) (${mode})`)
  for (const g of groups) {
    const span = g.from === g.to ? seconds(g.from) : `${seconds(g.from)}–${seconds(g.to)}`
    console.log(`  ${span.padEnd(17)} ${sceneAt(timeline, g.from / FPS).padEnd(14)} ${g.kind.padEnd(28)} ${describe(g)}`)
  }
}

const groupFindings = (findings) => {
  const groups = []
  const open = new Map()
  const gap = 'mp4' in args ? MP4_EVERY * FPS : 1
  for (const f of [...findings].sort((a, b) => a.frame - b.frame)) {
    const id = f.kind === 'layout shift' ? `${f.kind}|${f.box.key}` : f.kind
    const g = open.get(id)
    if (g && f.frame - g.to <= gap) {
      g.to = f.frame
      g.keys.add(f.box.key)
      continue
    }
    const fresh = { kind: f.kind, from: f.frame, to: f.frame, keys: new Set([f.box.key]), text: f.box.text.slice(0, 40), detail: f.detail }
    open.set(id, fresh)
    groups.push(fresh)
  }
  return groups
}

const measureAt = async (page, frame) => {
  await page.evaluate((t) => window.renderAt(t), frame / FPS)
  return page.evaluate(collectTextBoxes)
}

const collectTextBoxes = () => {
  const stage = document.getElementById('stage')
  const ownText = (node) => [...node.childNodes].filter((c) => c.nodeType === 3 && c.textContent.trim())
  const pathOf = (node) => {
    const steps = []
    for (let n = node; n && n !== stage; n = n.parentElement) steps.unshift([...n.parentElement.children].indexOf(n))
    return steps.join('.')
  }
  const isShown = (node) => {
    for (let n = node; n && n !== stage; n = n.parentElement) {
      const style = getComputedStyle(n)
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.02) return false
    }
    return true
  }
  const lineCount = (texts) => texts.reduce((sum, t) => {
    const range = document.createRange()
    range.selectNodeContents(t)
    return sum + [...range.getClientRects()].filter((r) => r.width > 0).length
  }, 0)
  const origin = (node) => {
    let x = 0
    let y = 0
    for (let n = node; n && n !== stage; n = n.offsetParent) {
      x += n.offsetLeft
      y += n.offsetTop
    }
    return { x, y }
  }
  const failedFace = [...document.fonts].some((face) => face.status === 'error')
  return [...stage.querySelectorAll('*')]
    .filter((node) => node instanceof HTMLElement && node.offsetParent !== null && ownText(node).length)
    .map((node) => {
      const style = getComputedStyle(node)
      const font = `${style.fontStyle} ${style.fontWeight} 16px ${style.fontFamily}`
      return {
        key: pathOf(node),
        text: node.textContent.trim().replace(/\s+/g, ' '),
        shown: isShown(node),
        ...origin(node),
        w: node.offsetWidth,
        h: node.offsetHeight,
        lines: lineCount(ownText(node)),
        font,
        fontReady: !failedFace && document.fonts.check(font, node.textContent.trim()),
      }
    })
}

const extractFrames = async ({ file, dir, total }) => {
  const step = Math.max(1, Math.round(MP4_EVERY * FPS))
  await run('ffmpeg', ['-loglevel', 'error', '-i', file, '-vf', `select='not(mod(n\\,${step}))'`, '-vsync', '0', '-q:v', '2', `${dir}/mp4-%05d.jpg`])
  const names = (await readdir(dir)).filter((n) => n.startsWith('mp4-')).sort()
  return names.map((n, i) => [i * step, `${dir}/${n}`]).filter(([frame]) => frame < total)
}

const similarity = async (a, b) => {
  const { stderr } = await run('ffmpeg', ['-i', a, '-i', b, '-lavfi', 'psnr', '-f', 'null', '-'])
  const value = stderr.match(/average:(inf|[\d.]+)/)?.[1]
  return value === 'inf' ? Infinity : Number(value)
}

const sustained = (findings, step) => findings.filter(({ frame }) => {
  const near = (offset) => findings.some((f) => f.frame === frame + offset * step)
  return Array.from({ length: MP4_MIN_RUN }, (_, start) => start).some((start) =>
    Array.from({ length: MP4_MIN_RUN }, (_, k) => k - start).every(near))
})
const describe = (g) => g.keys.size > 1 ? `${g.keys.size} text boxes, e.g. "${g.text}" ${g.detail}` : `"${g.text}" ${g.detail}`
const byKey = (boxes) => new Map(boxes.map((b) => [b.key, b]))
const round = (v) => Math.round(v * 10) / 10
const seconds = (frame) => `${(frame / FPS).toFixed(2)}s`
const sceneAt = (timeline, t) => timeline.scenes.findLast((s) => t >= s.start)?.id ?? ''

await main()
