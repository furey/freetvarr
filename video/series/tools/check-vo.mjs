import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { scribe } from './eleven.mjs'

const HERE = new URL('./', import.meta.url).pathname
const PY = process.env.FTV_VIDEO_PYTHON || 'python3'
const DIR = `${HERE}../${process.argv[2]}/`
const vo = JSON.parse(await readFile(`${DIR}vo.json`, 'utf8'))
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const rows = []
for (const l of vo) {
  const stt = await scribe(l.mp3)
  const words = stt.words.filter((w) => w.type === 'word')
  const last = words.at(-1)
  const ends = words.filter((w) => /[.?!]$/.test(w.text) || w === last).map((w) => ({ word: w.text, end: w.end, q: w.text.endsWith('?') }))
  rows.push({ id: l.id, mp3: l.mp3, text: l.text, heard: stt.text, match: norm(stt.text) === norm(l.text), ends })
}
await writeFile(`${DIR}check-in.json`, JSON.stringify(rows))
const pitch = JSON.parse(execFileSync(PY, [`${HERE}end-pitch.py`, `${DIR}check-in.json`]).toString())
for (const r of rows) {
  const rises = pitch[r.id]
  const fail = r.ends.some((e, k) => !e.q && rises[k] !== null && rises[k] > 2)
  console.log(`${r.id.padEnd(14)} ${fail ? 'RISE' : 'ok  '} ${r.match ? 'exact' : 'DIFF '} [${rises.join(', ')}] ${r.match ? '' : `heard: ${r.heard}`}`)
}
