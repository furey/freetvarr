import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'

const HERE = new URL('./', import.meta.url).pathname
const slug = process.argv[2]
const DIR = `${HERE}../${slug}/`
const ASSETS = process.env.FTV_VIDEO_ASSETS || `${homedir()}/code/repos/furey/freetvarr-video-assets`
const PYTHON = process.env.FTV_VIDEO_PYTHON || 'python3'
const MUSIC = `${ASSETS}/music/480.mp3`
const timeline = JSON.parse(await readFile(`${DIR}timeline.json`, 'utf8'))
const cues = timeline.scenes.flatMap((s) => s.cues.map((c) => ({ ...c, at: s.start + c.start })))

const inputs = cues.flatMap((c) => ['-i', c.file])
const delays = cues.map((c, i) => `[${i}:a]aresample=48000,adelay=${Math.round(c.at * 1000)}:all=1[a${i}]`)
const mix = `${cues.map((_, i) => `[a${i}]`).join('')}amix=inputs=${cues.length}:normalize=0:dropout_transition=0,apad=whole_dur=${timeline.duration},atrim=0:${timeline.duration}[out]`
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', [...delays, mix].join(';'), '-map', '[out]', '-ar', '48000', '-ac', '1', '-c:a', 'pcm_f32le', `${DIR}voice-dry.wav`])
execFileSync(PYTHON, [`${HERE}mix-music.py`, `${DIR}timeline.json`, `${DIR}voice-dry.wav`, MUSIC, `${DIR}voiceover.wav`], { stdio: 'inherit' })

const stamp = (s) => {
  const ms = Math.round(s * 1000)
  const pad = (n, w = 2) => String(n).padStart(w, '0')
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`
}
const splitCaption = (text) => {
  if (text.length <= 84) return [text]
  const words = text.split(' ')
  const half = text.length / 2
  let line = ''
  const out = []
  for (const w of words) {
    if (!out.length && (line + w).length > half && line) { out.push(line.trim()); line = '' }
    line += `${w} `
  }
  out.push(line.trim())
  return out
}
const srt = cues.map((c, i) => `${i + 1}\n${stamp(c.at)} --> ${stamp(c.at + c.duration + 0.15)}\n${splitCaption(c.caption).join('\n')}\n`).join('\n')
await writeFile(`${DIR}video-${slug}.srt`, srt)
console.log(`voiceover.wav and video-${slug}.srt (${cues.length} captions)`)
