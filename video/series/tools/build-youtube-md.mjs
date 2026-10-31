import { readFile, writeFile } from 'node:fs/promises'

const slug = process.argv[2]
const DIR = new URL(`../${slug}/`, import.meta.url).pathname
const timeline = JSON.parse(await readFile(`${DIR}timeline.json`, 'utf8'))
const { YOUTUBE } = await import(`${DIR}script.mjs`)
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const YOUTUBE_MIN_CHAPTER = 10
const lengthOf = (list, i) => (list[i + 1]?.start ?? timeline.duration) - list[i].start
const foldShortChapters = (list) => {
  const i = list.findIndex((_, k) => lengthOf(list, k) < YOUTUBE_MIN_CHAPTER)
  if (i === -1 || list.length < 2) return list
  if (i === 0) return foldShortChapters([{ ...list[1], start: 0 }, ...list.slice(2)])
  return foldShortChapters(list.filter((_, k) => k !== i))
}
const scenes = timeline.scenes.filter((s) => s.chapter).map((s) => ({ start: s.start === 0 ? 0 : Math.round(s.start), name: s.chapter }))
const chapters = foldShortChapters(scenes).map((c) => `${clock(c.start)} ${c.name}`)
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
