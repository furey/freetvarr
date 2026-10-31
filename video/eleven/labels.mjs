import { execFileSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { synth } from './eleven.mjs'
import { SETTINGS, V2 } from './audition.mjs'
import { VOICES } from './voices-list.mjs'
const JOSH = 'YCMlNeY0UBmxCWADNMyB'
const WORDS = ['one', 'two', 'three', 'four']
const labels = [
  ...VOICES.map((v) => ({ id: `label-${v.n}`, voice: v.voice, text: `Option ${WORDS[v.n - 1]}. ${v.name.replace(' J N', '')}.` })),
  { id: 'label-A', voice: JOSH, text: 'Music A. Curiosity.' },
  { id: 'label-B', voice: JOSH, text: 'Music B. Close Up.' },
  { id: 'label-C', voice: JOSH, text: 'Music C. Coffee or Tea.' },
]
await mkdir(new URL('./out', import.meta.url).pathname, { recursive: true })
for (const l of labels) {
  const { file } = await synth({ voice: l.voice, model: V2, settings: SETTINGS.steady, text: l.text })
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-ar', '48000', '-ac', '1', new URL(`./out/${l.id}.wav`, import.meta.url).pathname])
  console.log(l.id, l.text)
}
