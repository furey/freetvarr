export const SCENES = [
  {
    id: 'open',
    chapter: 'Intro',
    lines: [
      '{Freetvarr} installs with one command. Then setup does the rest in a browser.',
      'You check what it finds at each step, and press Next.',
    ],
  },
  {
    id: 'need',
    chapter: 'Before you start',
    lines: [
      'You need a TVHeadend-compatible tuner, such as an HDHomeRun, connected to your aerial and your router.',
      'You also need a computer that stays on, such as a NAS or a mini PC, with Docker.',
      'Docker is free software that runs apps such as TVHeadend and {Freetvarr}.',
      'The install includes TVHeadend, and setup sets it up for you.',
    ],
  },
  {
    id: 'install',
    chapter: 'One command',
    lines: [
      'On a NAS, sign in over S S H first. S S H lets you type commands on the NAS from your computer.',
      'In the terminal, paste the install command from the description, and press Enter.',
      'It makes a {freetvarr} folder, and asks who should own the files.',
      'Press Enter to accept the defaults. Most people do.',
      'The first start downloads the software, which takes a few minutes.',
      'Then it shows the address of setup. Open that address in a browser.',
    ],
  },
  {
    id: 'start',
    chapter: 'Start',
    lines: [
      'Setup opens on your first visit. Confirm your time zone, then press Start setup.',
    ],
  },
  {
    id: 'tvheadend',
    chapter: 'Secure TVHeadend',
    lines: [
      'Next, TVHeadend. Choose an admin username and password, and check the allowed networks.',
      'Press Secure and connect. {Freetvarr} saves the login in TVHeadend, and connects to it.',
      'Already run your own TVHeadend? Press Use my own TVHeadend login instead.',
    ],
  },
  {
    id: 'channels',
    chapter: 'Find channels',
    lines: [
      'Then channels. Check the tuners, and the transmitter your aerial points at.',
      'Press Find channels. The scan takes a few minutes. Press Next when it finishes.',
      'If setup finds no tuner, press Enter the tuner\'s address, and type its IP address.',
    ],
  },
  {
    id: 'guide',
    chapter: 'TV guide',
    lines: [
      'Now the TV guide. Check your region, and press Set up guide.',
      'For a channel with no listings, setup picks its best guess. Check each one, then press Save and next.',
      'In Australia and New Zealand, this gives you a free seven-day guide.',
    ],
  },
  {
    id: 'folders',
    chapter: 'Folders',
    lines: [
      'Folders come next. {Freetvarr} checks the recordings folder, and the TV folder of your media library.',
      'If the checks pass, press Next. If one fails, do what its message says.',
    ],
  },
  {
    id: 'plex',
    chapter: 'Plex',
    lines: [
      'Plex is optional. If {Freetvarr} connects to Plex, check the TV, movies, and one-off libraries, and press Next.',
      'If Plex has no library for your recordings yet, press Create libraries first.',
      'No Plex? Press Next. {Freetvarr} still files every recording into your media library.',
    ],
  },
  {
    id: 'done',
    chapter: 'You\'re set',
    lines: [
      'You\'re set lists what setup saved. Press Start watching to open Home.',
      'To change any part later, open Settings, then System, then Setup.',
      'Next in this playlist: recording from the TV guide.',
    ],
  },
]

export const TIMING = {
  lead: { open: 1.0 },
  tail: { open: 1.0, done: 3.0 },
  hold: { 'install.1': 1.2, 'install.3': 0.6, 'install.4': 1.2 },
}

export const YOUTUBE = {
  title: 'Install Freetvarr and run setup on a NAS or mini PC',
  description: `
Install Freetvarr with one command, then let setup connect TVHeadend, scan for channels, set up the TV guide, check your folders, and connect Plex if you use it.

You need a TVHeadend-compatible tuner (e.g. an HDHomeRun) and a computer that stays on and runs Docker, such as a NAS or a mini PC. The install includes TVHeadend.

Install command (run it in the folder where you want a freetvarr folder):

curl -fsSL https://raw.githubusercontent.com/furey/freetvarr/main/install.sh | sh

Then open http://<host-ip>:3733 in a browser.

On a NAS with no SSH access, use the NAS container app instead; the getting started guide has the steps.

Chapters:
{{chapters}}

Links:
- Getting started: https://furey.github.io/freetvarr/guide/getting-started
- Requirements: https://furey.github.io/freetvarr/guide/requirements
- Leaving Fetch TV guide: https://furey.github.io/freetvarr/guide/leaving-fetch
- Source code: https://github.com/furey/freetvarr
`,
  tags: 'Freetvarr, install Freetvarr, TVHeadend, HDHomeRun, Docker, NAS, Synology, mini PC, home server, self-hosted, free-to-air TV, PVR, DVR, leaving Fetch',
}
