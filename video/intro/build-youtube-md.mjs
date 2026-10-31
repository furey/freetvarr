import { readFile, writeFile } from 'node:fs/promises'

const HERE = new URL('.', import.meta.url).pathname
const timeline = JSON.parse(await readFile(`${HERE}timeline.json`, 'utf8'))
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const chapters = timeline.scenes.filter((s) => s.chapter).map((s) => `${clock(s.start === 0 ? 0 : Math.round(s.start))} ${s.chapter}`)

const md = `# YouTube: Freetvarr intro

## Title

Freetvarr: your own free-to-air TV recorder

## Description

Record free-to-air TV at home and watch it on any screen, with no subscription, on hardware you own, and with the ad breaks taken out if you want.

Freetvarr is free, open-source software. It works with TVHeadend and a network tuner (e.g. an HDHomeRun) on a computer that stays on, such as a NAS or a mini PC. It gives you a 7-day TV guide with pictures, series recording, recordings filed into your media library for Plex, Infuse, or another media player on your TV, and live TV in the browser.

Chapters:
${chapters.join('\n')}

Links:
- Getting started: https://furey.github.io/freetvarr/guide/getting-started
- Freetvarr website and docs: https://furey.github.io/freetvarr/
- Source code: https://github.com/furey/freetvarr

The channels, shows, and pictures in this video are made up for the demo. Stock footage from Mixkit (Mixkit free licence). Music: "Curiosity" by Diego Nava, from Mixkit. Voice: ElevenLabs.

## Tags

Freetvarr, free-to-air TV, free to air recorder, PVR, DVR, TV recorder Australia, HDHomeRun, TVHeadend, Plex, Infuse, Jellyfin, NAS, Synology, home server, self-hosted, series recording, ad removal

## Captions

Upload \`freetvarr-intro.srt\` as English (Australia) subtitles.

## Duration

${clock(timeline.duration)}
`
await writeFile(`${HERE}youtube-intro.md`, md)
console.log(md)
