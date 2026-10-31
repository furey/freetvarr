import { render, SETTINGS, V2 } from './audition.mjs'
import { VOICES } from './voices-list.mjs'
const lines = ['The next episode to watch, what is set to record tonight, and what is on now.']
for (const v of VOICES) await render({ id: `O${v.n}-3b`, voice: v.voice, model: V2, settings: SETTINGS.steady, lines, dir: 'out' })
