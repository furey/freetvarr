import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const HERE = new URL('./', import.meta.url).pathname
const CACHE = join(HERE, '../eleven-cache')
const LEDGER = join(HERE, '../ledger.jsonl')
const API = 'https://api.elevenlabs.io/v1'
const FORMAT = 'mp3_44100_128'

export const synth = async ({ voice, model, settings, text, take = 0 }) => {
  const key = JSON.stringify(take ? { voice, model, settings, text, FORMAT, take } : { voice, model, settings, text, FORMAT })
  const hash = createHash('sha256').update(key).digest('hex').slice(0, 20)
  const file = join(CACHE, `${hash}.mp3`)
  if (existsSync(file)) return { file, cached: true, hash }
  if (!process.env.ELEVENLABS_API_KEY) throw new Error('uncached line and no ELEVENLABS_API_KEY')
  await mkdir(CACHE, { recursive: true })
  const res = await fetch(`${API}/text-to-speech/${voice}?output_format=${FORMAT}`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: model, voice_settings: settings }),
  })
  if (!res.ok) throw new Error(`ElevenLabs TTS ${res.status}: ${await res.text()}`)
  await writeFile(file, Buffer.from(await res.arrayBuffer()))
  const chars = res.headers.get('character-cost') ?? res.headers.get('x-character-count')
  await appendFile(LEDGER, `${JSON.stringify({ hash, text, chars, len: text.length, take, at: new Date().toISOString() })}\n`)
  await writeFile(`${file}.json`, key)
  return { file, cached: false, hash, chars }
}

export const scribe = async (file) => {
  const out = `${file}.stt.json`
  if (existsSync(out)) return JSON.parse(await readFile(out, 'utf8'))
  const form = new FormData()
  form.append('model_id', 'scribe_v1')
  form.append('language_code', 'en')
  form.append('file', new Blob([await readFile(file)]), 'clip.mp3')
  const res = await fetch(`${API}/speech-to-text`, { method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, body: form })
  if (!res.ok) throw new Error(`ElevenLabs STT ${res.status}: ${await res.text()}`)
  const j = await res.json()
  await writeFile(out, JSON.stringify(j))
  return j
}
