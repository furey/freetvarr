import { writeFile } from 'node:fs/promises'
import { render, SETTINGS, V2 } from './audition.mjs'
import { VOICES } from './voices-list.mjs'
const all = []
for (const v of VOICES) all.push(...await render({ id: `O${v.n}-`, voice: v.voice, model: V2, settings: SETTINGS.steady, dir: 'out' }))
await writeFile(new URL('./out/results.json', import.meta.url), JSON.stringify(all, null, 1))
