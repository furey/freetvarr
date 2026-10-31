# YouTube: Save your Fetch TV recordings before you cancel, with fetchtv

## Title

Save your Fetch TV recordings before you cancel, with fetchtv

## Description

Save your Fetch TV recordings before you cancel. The free fetchtv tool copies them off a Fetch box over your home network, names each file the way your media library expects, and does not need your Fetch account.

Fetch set the levy opt-in deadline for 31 October 2026. If you opt in, Fetch keeps a Gen 3 box working until at least 30 June 2028. If you don't, Fetch suspends the box in November 2026, and you cannot copy recordings off a suspended box. Facts about the levy come from Fetch's levy FAQ; check the Leaving Fetch guide for changes.

Commands (replace the address with your box's address):

npx fetchtv
npx fetchtv shows --ip=192.168.1.50
npx fetchtv recordings --ip=192.168.1.50 --for-plex --save=./fetch-recordings

If the copy stops, run the last command again; it skips the files it already copied. With hundreds of recordings, expect to run it several times. To copy one show only, add --show= and part of its name. Fetch's episode numbers can differ by one from the TV guide's, so compare air dates where a show has Fetch and Freetvarr recordings from the same weeks.

Chapters:
0:00 Intro
0:10 The levy deadline
0:37 What you need
0:53 Find the box
1:18 List your recordings
1:31 Copy everything
1:52 Into your library
2:14 Cancel Fetch

Links:
- Leaving Fetch TV guide: https://furey.github.io/freetvarr/guide/leaving-fetch
- fetchtv: https://github.com/furey/fetchtv
- Node.js download: https://nodejs.org/en/download
- Freetvarr: https://furey.github.io/freetvarr/

The channels, shows, and pictures in this video are made up for the demo. Stock footage from Mixkit (Mixkit free licence). Music: "Curiosity" by Diego Nava, from Mixkit. Voice: ElevenLabs.

## Tags

Fetch TV, Fetch levy, leaving Fetch, cancel Fetch, Fetch recordings, Fetch Mighty, Fetch Mini, save Fetch recordings, fetchtv, free-to-air TV, Plex, NAS, Freetvarr

## Captions

Upload `video-leaving-fetch.srt` as English (Australia) subtitles.

## Duration

2:46
