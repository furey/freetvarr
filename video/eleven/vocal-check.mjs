import { execFileSync } from 'node:child_process'
import { scribe } from './eleven.mjs'
for (const n of process.argv.slice(2)) {
  const clip = `music/tracks/${n}-excerpt.mp3`
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '20', '-t', '45', '-i', `music/tracks/${n}.mp3`, '-ac', '1', '-b:a', '64k', clip])
  const j = await scribe(clip)
  const words = (j.words || []).filter((w) => w.type === 'word').length
  console.log(n, 'words:', words, '|', (j.text || '').slice(0, 160))
}
