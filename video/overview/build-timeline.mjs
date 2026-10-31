import { readFile, writeFile } from 'node:fs/promises'

const HERE = process.env.FTV_CUT_DIR || new URL('.', import.meta.url).pathname
const STAGE = new URL('../stage/', import.meta.url).pathname
const vo = JSON.parse(await readFile(`${HERE}vo.json`, 'utf8'))
const { SCENES } = await import(`${HERE}script.mjs`)

const LEAD = { open: 0.8, pitch: 0.8, title: 0.6 }
const TAIL = { open: 0.5, pitch: 0.5, title: 1.4, end: 3.0, outro: 3.0 }
const GAP = 0.45
const HOLD = { 'setup.0': 1.2 }
const DEFAULT_LEAD = 0.7
const DEFAULT_TAIL = 0.9
const MIN = { title: 7.5 }

let at = 0
const scenes = SCENES.map((scene) => {
  const lines = vo.filter((l) => l.scene === scene.id)
  let local = LEAD[scene.id] ?? DEFAULT_LEAD
  const cues = lines.map((l, i) => {
    const cue = { start: +local.toFixed(3), duration: +l.duration.toFixed(3), caption: l.caption, file: l.file }
    local += l.duration + GAP + (HOLD[`${scene.id}.${i}`] ?? 0)
    return cue
  })
  local += (TAIL[scene.id] ?? DEFAULT_TAIL) - GAP
  const duration = Math.max(local, MIN[scene.id] ?? 0)
  const out = { id: scene.id, chapter: scene.chapter, start: +at.toFixed(3), duration: +duration.toFixed(3), cues }
  at += duration
  return out
})

const timeline = { fps: 30, duration: +at.toFixed(3), scenes }
await writeFile(`${HERE}timeline.json`, JSON.stringify(timeline, null, 2))
await writeFile(`${STAGE}timeline.js`, `export const TIMELINE = ${JSON.stringify(timeline)}\n`)
console.log(`duration ${at.toFixed(1)}s`)
for (const s of scenes) console.log(`${s.id.padEnd(8)} ${s.start.toFixed(1).padStart(6)} +${s.duration.toFixed(1)}`)
