import { readFile, writeFile } from 'node:fs/promises'

const slug = process.argv[2]
const DIR = new URL(`../${slug}/`, import.meta.url).pathname
const timeline = JSON.parse(await readFile(`${DIR}timeline.json`, 'utf8'))
const { YOUTUBE } = await import(`${DIR}script.mjs`)
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const chapters = timeline.scenes.filter((s) => s.chapter).map((s) => `${clock(s.start === 0 ? 0 : Math.round(s.start))} ${s.chapter}`)
const credits = 'The channels, shows, and pictures in this video are made up for the demo. Stock footage from Mixkit (Mixkit free licence). Music: "Curiosity" by Diego Nava, from Mixkit. Voice: ElevenLabs.'

const md = `# YouTube: ${YOUTUBE.title}

## Title

${YOUTUBE.title}

## Description

${YOUTUBE.description.trim().replace('{{chapters}}', chapters.join('\n'))}

${credits}

## Tags

${YOUTUBE.tags}

## Captions

Upload \`video-${slug}.srt\` as English (Australia) subtitles.

## Duration

${clock(timeline.duration)}
`
await writeFile(`${DIR}youtube-${slug}.md`, md)
console.log(chapters.join('\n'))
