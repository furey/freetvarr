import { readFile, writeFile } from 'node:fs/promises'

const HERE = new URL('.', import.meta.url).pathname
const timeline = JSON.parse(await readFile(`${HERE}timeline.json`, 'utf8'))
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const chapters = timeline.scenes.filter((s) => s.chapter).map((s) => `${clock(s.start === 0 ? 0 : Math.round(s.start))} ${s.chapter}`)

const md = `# YouTube: Freetvarr overview

## Title

Leaving Fetch TV? Record free-to-air TV with Freetvarr

## Description

Leaving Fetch? Keep recording free-to-air TV and watching it on your TV, with hardware you own and nothing more to pay each month.

Freetvarr is free, open-source software. It works with TVHeadend and a network tuner (e.g. an HDHomeRun) on a computer that stays on, such as a NAS or a mini PC. It gives you a 7-day TV guide with pictures, series recording, recordings filed into your media library for Plex, Infuse, or another media player on your TV, and live TV in the browser.

If you have a Fetch Mini Gen 3 or Mighty Gen 3 with no Fetch subscription, the levy opt-in deadline is 31 October 2026. Save your Fetch recordings with the free fetchtv tool before the box is suspended.

Chapters:
${chapters.join('\n')}

Links:
- Leaving Fetch TV guide: https://furey.github.io/freetvarr/guide/leaving-fetch
- Freetvarr website and docs: https://furey.github.io/freetvarr/
- Getting started: https://furey.github.io/freetvarr/guide/getting-started
- Source code: https://github.com/furey/freetvarr
- fetchtv (save your Fetch recordings): https://github.com/furey/fetchtv

The channels, shows, and pictures in this video are made up for the demo. Stock footage from Mixkit (Mixkit free licence). Music: "Curiosity" by Diego Nava, from Mixkit. Voice: ElevenLabs.

## Tags

Fetch TV, Fetch levy, leaving Fetch, Fetch Mighty, Fetch Mini, free-to-air TV, free to air recorder, PVR, DVR, TV recorder Australia, HDHomeRun, TVHeadend, Plex, Infuse, Jellyfin, NAS, Synology, home server, self-hosted, Freetvarr, fetchtv

## Captions

Upload \`overview.srt\` as English (Australia) subtitles.

## Duration

${clock(timeline.duration)}
`
await writeFile(`${HERE}../youtube.md`, md)
console.log(md)
