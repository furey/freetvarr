import { readFile, writeFile } from 'node:fs/promises'

const DIR = new URL(`../${process.argv[2]}/`, import.meta.url).pathname
const vo = JSON.parse(await readFile(`${DIR}vo.json`, 'utf8'))
const { SCENES, TIMING = {} } = await import(`${DIR}script.mjs`)
const { lead = {}, tail = {}, hold = {}, min = {} } = TIMING
const GAP = 0.45
const DEFAULT_LEAD = 0.7
const DEFAULT_TAIL = 0.9

let at = 0
const scenes = SCENES.map((scene) => {
  const lines = vo.filter((l) => l.scene === scene.id)
  let local = lead[scene.id] ?? DEFAULT_LEAD
  const cues = lines.map((l, i) => {
    const cue = { start: +local.toFixed(3), duration: +l.duration.toFixed(3), caption: l.caption, file: l.file }
    local += l.duration + GAP + (hold[`${scene.id}.${i}`] ?? 0)
    return cue
  })
  local += (tail[scene.id] ?? DEFAULT_TAIL) - GAP
  const duration = Math.max(local, min[scene.id] ?? 0)
  const out = { id: scene.id, chapter: scene.chapter, start: +at.toFixed(3), duration: +duration.toFixed(3), cues }
  at += duration
  return out
})

const timeline = { fps: 30, duration: +at.toFixed(3), scenes }
await writeFile(`${DIR}timeline.json`, JSON.stringify(timeline, null, 2))
await writeFile(`${DIR}timeline.js`, `export const TIMELINE = ${JSON.stringify(timeline)}\n`)
console.log(`duration ${at.toFixed(1)}s`)
for (const s of scenes) console.log(`${s.id.padEnd(12)} ${s.start.toFixed(1).padStart(6)} +${s.duration.toFixed(1)}`)
