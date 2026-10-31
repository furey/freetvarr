import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { synth } from './eleven.mjs'
import { ELEVEN, SPOKEN_TEXT, CAPTION_TEXT } from './speech.mjs'

const SERIES = new URL('../', import.meta.url).pathname
const slug = process.argv[2]
const DIR = `${SERIES}${slug}/`
const VO = `${SERIES}vo/`
const { SCENES } = await import(`${DIR}script.mjs`)
const takes = existsSync(`${DIR}takes.json`) ? JSON.parse(readFileSync(`${DIR}takes.json`, 'utf8')) : {}
const ffmpeg = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args])
const trimSilence = 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,adelay=60:all=1,apad=pad_dur=0.08'
const probe = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString())

await mkdir(VO, { recursive: true })
const out = []
let spent = 0
for (const scene of SCENES) {
  for (const [i, line] of scene.lines.entries()) {
    const id = `${scene.id}.${i}`
    const text = SPOKEN_TEXT(line)
    const { file: mp3, hash, cached, chars } = await synth({ ...ELEVEN, text, take: takes[id] ?? 0 })
    if (!cached) spent += Number(chars || 0)
    const file = `${VO}${hash}.wav`
    if (!existsSync(file)) ffmpeg(['-i', mp3, '-af', trimSilence, '-ar', '48000', '-ac', '1', file])
    const duration = probe(file)
    out.push({ scene: scene.id, index: i, id, text, caption: CAPTION_TEXT(line), mp3, file, duration })
    console.log(`${id} ${cached ? 'cached' : 'new   '} ${duration.toFixed(2)}s ${text}`)
  }
}
await writeFile(`${DIR}vo.json`, JSON.stringify(out, null, 2))
console.log(`total speech ${out.reduce((s, l) => s + l.duration, 0).toFixed(1)}s, credits this run ${spent}`)
