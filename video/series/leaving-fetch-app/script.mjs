export const SCENES = [
  {
    id: 'open',
    chapter: 'Intro',
    lines: [
      'Before you leave Fetch, copy your recordings off the box.',
      'Fetch My Recordings is a free app that does it for you, over your home network.',
      'You don\'t need a Fetch account.',
    ],
  },
  {
    id: 'why',
    chapter: 'Copy before you cancel',
    lines: [
      'Fetch\'s levy for Gen 3 boxes applies from the first of November 2026.',
      'Once the box is cancelled or suspended, you cannot copy your recordings.',
      'After you cancel, the box lists no recordings. So save first, then cancel.',
    ],
  },
  {
    id: 'download',
    chapter: 'Download the app',
    lines: [
      'You need a Mac, a Windows PC, or a Linux computer, on the same network as the box.',
      'Download Fetch My Recordings for your computer. The link is in the description.',
    ],
  },
  {
    id: 'warning',
    chapter: 'The first-open warning',
    lines: [
      'The first time you open the app, your computer shows a warning.',
      'That is expected. The app is free, and unsigned, because signing costs a yearly fee.',
      'On a Mac, click Done. Then open Privacy and Security in System Settings, and click Open Anyway.',
      'On Windows, click More info, then Run anyway.',
      'Later, click Allow, so the app can find your box.',
    ],
  },
  {
    id: 'find',
    chapter: 'Find your Fetch box',
    lines: [
      'Click Start. The app looks for your Fetch box on your home network.',
      'No box found? Look up its address in your router\'s list of connected devices.',
      'Then type it in, and click Connect.',
    ],
  },
  {
    id: 'choose',
    chapter: 'Choose recordings and a folder',
    lines: [
      'Every recording you have not saved yet starts ticked.',
      'Click Show next to a show to pick single episodes, then click Next.',
    ],
  },
  {
    id: 'folder',
    lines: [
      'Check that the computer has enough free space. Each hour of HD takes about three to six gigabytes.',
      'If you watch recordings in a media library app, turn on Names for Plex, Jellyfin or Kodi.',
    ],
  },
  {
    id: 'save',
    chapter: 'Save your recordings',
    lines: [
      'Click Save. Your computer stays awake until the save finishes.',
      'A full box can take hours.',
      'If it stops part way, click Save again. It skips what is saved, and carries on.',
    ],
  },
  {
    id: 'files',
    lines: [
      'Click Open folder to see your files.',
      'Then click How to watch your recordings. It shows how to play them on this computer, or on your TV.',
    ],
  },
  {
    id: 'cancel',
    chapter: 'Cancel Fetch',
    lines: [
      'Cancel only once your recordings are safe.',
      'After you cancel, the box restarts at Fetch\'s setup screen. It asks for an activation code, which needs an active Fetch account, and it lists no recordings.',
      'Then sign in to Fetch account management.',
      'Under Packages, choose Cancel Service, then Yes, cancel my service.',
    ],
  },
  {
    id: 'end',
    chapter: 'What next',
    lines: [
      'Prefer the terminal? The fetch T V page on GitHub has the commands.',
      'Next, keep recording free-to-air TV without Fetch, with {Freetvarr}.',
      'The Leaving Fetch guide has every step. The link is in the description.',
    ],
  },
]

export const TIMING = {
  lead: { open: 0.9 },
  tail: { open: 0.8, end: 4.5 },
  hold: {},
}

export const YOUTUBE = {
  title: 'Save your Fetch TV recordings before you cancel, with the free Fetch My Recordings app',
  description: `
Before you cancel Fetch TV, copy your recordings off the box. Fetch My Recordings is a free app for Mac, Windows, and Linux. It finds your Fetch box on your home network and copies the recordings you choose to a folder on your computer. No Fetch account needed.

Download for Mac, Windows PC, or Linux. The download page picks the right file for your computer: https://furey.github.io/freetvarr/guide/leaving-fetch
All files and versions: https://github.com/furey/fetch-my-recordings#download

The first time you open the app, your computer shows a warning. That is expected: the app is free and unsigned. Step-by-step help for Mac, Windows, and Linux: https://github.com/furey/fetch-my-recordings#first-open

Why now: Fetch's Gen 3 Extended Service Levy applies to Mini Gen 3 and Mighty Gen 3 boxes from 1 November 2026. A box whose Fetch account is cancelled lists no recordings, and you cannot copy recordings off a suspended box. So save first, then cancel.

If the save stops part way, click Save again. It skips the recordings that are already saved and carries on. If the app says the box has no recordings, check the TV: a cancelled box shows Fetch's setup screen.

If your internet provider supplied your Fetch box, cancel through the provider instead.

Prefer the terminal? The free fetchtv command-line tool does the same job: https://github.com/furey/fetchtv#usage

Chapters:
{{chapters}}

Links:
- Fetch My Recordings: https://github.com/furey/fetch-my-recordings
- fetchtv (command line): https://github.com/furey/fetchtv
- Leaving Fetch TV guide: https://furey.github.io/freetvarr/guide/leaving-fetch
- Freetvarr (record free-to-air TV without Fetch): https://furey.github.io/freetvarr/

Fetch My Recordings is an independent, free tool made by a Fetch customer. It is not made, endorsed, or supported by Fetch TV. Fetch is a trademark of its owner. The warning messages in this video are illustrations, not screenshots.
`,
  tags: 'Fetch TV, Fetch levy, leaving Fetch, cancel Fetch, Fetch recordings, save Fetch recordings, Fetch Mighty, Fetch Mini, Fetch My Recordings, fetchtv, free app, Mac, Windows, free-to-air TV, Freetvarr',
}
