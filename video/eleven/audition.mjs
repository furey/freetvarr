import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { synth, scribe } from './eleven.mjs'
import { recordsVowels } from '../voice-ab/stress-check.mjs'

const HERE = new URL('./', import.meta.url).pathname
export const LINES = [
  'Leaving Fetch? You can keep recording free-to-air TV, and keep watching it on your TV.',
  'From then on, every new episode records by itself.',
  'The next episode to watch, what records tonight, and what is on now.',
  'If you have a Fetch Mini or Mighty Gen 3, and no Fetch subscription, Fetch now asks for a one-off levy to keep the box working.',
]
export const V2 = 'eleven_multilingual_v2'
export const V3 = 'eleven_v3'
export const SETTINGS = {
  balanced: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1 },
  loose: { stability: 0.35, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true, speed: 1 },
  steady: { stability: 0.7, similarity_boost: 0.8, style: 0, use_speaker_boost: true, speed: 1 },
  v3natural: { stability: 0.5, similarity_boost: 0.75, use_speaker_boost: true },
}
const ffmpeg = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args])

export const render = async ({ id, voice, model, settings, lines = LINES, dir = 'out' }) => {
  await mkdir(`${HERE}${dir}`, { recursive: true })
  const rows = []
  for (const [i, text] of lines.entries()) {
    const { file } = await synth({ voice, model, settings, text })
    const name = `${HERE}${dir}/${id}${i + 1}`
    ffmpeg(['-i', file, '-ar', '48000', '-ac', '1', `${name}.wav`])
    ffmpeg(['-i', file, '-ar', '16000', '-ac', '1', `${name}-16k.wav`])
    const stt = await scribe(file)
    const stress = /records/.test(text) ? await recordsVowels({ wav16: `${name}-16k.wav`, reference: text }) : null
    rows.push({ id, line: i + 1, heard: stt.text, records: stress?.verdict, stress })
    console.log(`${id}${i + 1} ${stress ? `[${stress.verdict} eh=${stress.nounEh} schwa=${stress.verbSchwa}]` : ''} | ${stt.text}`)
  }
  return rows
}

if (process.env.MODE === 'settings') {
  const josh = 'YCMlNeY0UBmxCWADNMyB'
  const all = [
    ...await render({ id: 'S1', voice: josh, model: V2, settings: SETTINGS.balanced, lines: LINES.slice(0, 2), dir: 'settings' }),
    ...await render({ id: 'S2', voice: josh, model: V2, settings: SETTINGS.loose, lines: LINES.slice(0, 2), dir: 'settings' }),
    ...await render({ id: 'S3', voice: josh, model: V2, settings: SETTINGS.steady, lines: LINES.slice(0, 2), dir: 'settings' }),
    ...await render({ id: 'S4', voice: josh, model: V3, settings: SETTINGS.v3natural, lines: LINES.slice(0, 2), dir: 'settings' }),
  ]
  await writeFile(`${HERE}settings/results.json`, JSON.stringify(all, null, 1))
}
