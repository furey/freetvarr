export const SCENES = [
  { id: 'open', chapter: 'Intro', lines: [
    'Your recordings are ordinary video files in your media library.',
    'So the media player app on your TV can play them.',
  ] },
  { id: 'tv', chapter: 'Recordings on the TV', lines: [
    'On the TV, open a media player app that reads your library, such as Plex or Infuse.',
    'Each show has its own folder, and each file name has the season and episode.',
    'So your app shows the right title and artwork, with pause, rewind, and skip.',
  ] },
  { id: 'tv-apps', chapter: 'Live TV on the TV', lines: [
    'For live TV on the TV, with the seven-day guide, use a TV app such as Jellyfin or Kodi.',
    'In {Freetvarr}, open Settings, then Watching, then Watch on TV. Press Make a TV login.',
    'That login can only watch. It cannot record, or change settings.',
    '{Freetvarr} then shows each address to copy into the TV app.',
    'Kodi also shows Australian captions, which most other apps do not.',
  ] },
  { id: 'live', chapter: 'Live TV in the browser', lines: [
    'On a phone, tablet, or computer, open Live TV in {Freetvarr}, and press a channel.',
    'It plays right in the browser, with no app to install.',
    'Each channel shows what is on now, and what is on next.',
  ] },
  { id: 'rewind', chapter: 'Pause and rewind', lines: [
    'You can pause and rewind live TV, up to thirty minutes back.',
    'Start over plays the programme from its first minute, when TVHeadend is recording it.',
    'Go live takes you back to now.',
    'Double-tap the left or right side of the picture to skip ten seconds.',
    'For captions, open the three-dot menu, and press Captions.',
  ] },
  { id: 'mini', chapter: 'Miniplayer', lines: [
    'Press Miniplayer to shrink the picture, and keep browsing while you watch.',
    'On a phone, it sits above the tab bar. On a computer, it is a small card in a corner.',
  ] },
  { id: 'multiview', chapter: 'Multiview', lines: [
    'Multiview plays up to four live channels at once, or two on a phone.',
    'Press Multiview, then pick another channel. Each channel says if it needs a free tuner.',
    'Recordings always come first. If a recording needs a tuner, it takes one from live TV.',
  ] },
  { id: 'playback', chapter: 'Recordings in the browser', lines: [
    'Recordings play in the same player, and it remembers where you stopped.',
    'In Safari, AirPlay sends an episode to an Apple TV.',
    'When ad removal found the breaks, a Skip ad button appears during each one.',
  ] },
  { id: 'home-screen', chapter: 'Save it as an app', lines: [
    'On a phone or tablet, add {Freetvarr} to the Home Screen.',
    'It then opens full screen from its own icon, like an app.',
    'Next in this playlist: your recordings library.',
  ] },
]

export const TIMING = {
  lead: { open: 1.0 },
  tail: { open: 1.0, 'home-screen': 3.0 },
}

export const YOUTUBE = {
  title: 'Watch recordings and live TV on your TV with Freetvarr',
  description: `
Watch your Freetvarr recordings on the TV in a media player app that reads your library (e.g. Plex or Infuse), with pause, rewind, and skip. For live TV with the 7-day guide on the TV, Freetvarr makes a watch-only TVHeadend login and shows the addresses to copy into a TV app (e.g. Jellyfin or Kodi). On a phone, tablet, or computer, Freetvarr plays live TV and recordings in the browser, with pause and rewind, the Miniplayer, and Multiview.

Chapters:
{{chapters}}

Links:
- Live TV: https://furey.github.io/freetvarr/guide/live-tv
- Player and Multiview: https://furey.github.io/freetvarr/guide/player
- TV apps: https://furey.github.io/freetvarr/guide/tv-apps
- Freetvarr: https://furey.github.io/freetvarr/
`,
  tags: 'Freetvarr, watch recordings on TV, live TV, free-to-air TV, media player, Plex, Infuse, Jellyfin, Kodi, TVHeadend, Multiview, pause live TV, captions, leaving Fetch',
}
