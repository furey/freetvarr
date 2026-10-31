export const SCENES = [
  {
    id: 'open',
    chapter: 'Intro',
    lines: [
      'Before you leave Fetch, copy your recordings off the box.',
      'The free fetch T V tool copies them over your home network, with no Fetch account needed.',
    ],
  },
  {
    id: 'deadline',
    chapter: 'The levy deadline',
    lines: [
      'Fetch asked for a one-off levy to keep a Gen 3 box working.',
      'Fetch set the opt-in deadline for the thirty-first of October 2026.',
      'If you opt in, the box keeps working until at least June 2028. So you have time to copy your recordings.',
      'If you don\'t, Fetch suspends the box in November. Then you cannot copy your recordings.',
      'A cancelled box stops working completely. So save first, then cancel.',
    ],
  },
  {
    id: 'need',
    chapter: 'What you need',
    lines: [
      'You need a Windows PC or a Mac, on the same network as the box.',
      'Allow fifteen minutes to set up, then a few hours of copying.',
      'First, install Node J S, the free software that runs the tool. Run the LTS installer from its website.',
    ],
  },
  {
    id: 'find',
    chapter: 'Find the box',
    lines: [
      'Open a terminal, a window where you type commands. On a Mac, open Terminal. On Windows, open Command Prompt.',
      'Type the command on screen, and press Enter. If it asks to install fetch T V, type y.',
      'The tool lists each Fetch box it finds, with its IP address.',
      'No box found? Look up its address in your router\'s list of connected devices.',
    ],
  },
  {
    id: 'list',
    chapter: 'List your recordings',
    lines: [
      'Next, list your recordings with the shows command.',
      'Check that the computer has enough free space. Each hour of HD takes about three to six gigabytes.',
    ],
  },
  {
    id: 'copy',
    chapter: 'Copy everything',
    lines: [
      'Then copy everything with the recordings command, the for Plex option, and a save folder.',
      'The for Plex option names each file the way your media library expects: a folder for each show and season.',
      'If the copy stops, run the same command again. It skips the files it already copied, and carries on.',
    ],
  },
  {
    id: 'library',
    chapter: 'Into your library',
    lines: [
      'Once {Freetvarr} is set up, open the NAS shared folder from your computer.',
      'Drag each show\'s folder into the tv folder, inside {Freetvarr}\'s media folder.',
      'A film goes into movies, if you set a movies folder. Anything else, such as a news bulletin, goes into one-offs.',
      'Your media library finds them on its next scan.',
    ],
  },
  {
    id: 'cancel',
    chapter: 'Cancel Fetch',
    lines: [
      'Move the aerial cable to your new tuner, and check every channel you watch.',
      'Then sign in to Fetch account management.',
      'Under Packages, choose Cancel Service, then Yes, cancel my service.',
      'It cancels every box on the account.',
      'If your internet provider supplied your Fetch box, cancel through the provider instead.',
      'Cancel only once your recordings are safe. A cancelled box cannot be switched back on.',
    ],
  },
  {
    id: 'end',
    chapter: 'More help',
    lines: [
      'The Leaving Fetch guide has every step. The link is in the description.',
    ],
  },
]

export const TIMING = {
  lead: { open: 0.9 },
  tail: { open: 0.8, end: 3.2 },
  hold: { 'deadline.1': 0.4, 'find.1': 1.6, 'list.0': 1.4, 'copy.0': 2.2 },
}

export const YOUTUBE = {
  title: 'Save your Fetch TV recordings before you cancel, with fetchtv',
  description: `
Windows tip: if PowerShell says "running scripts is disabled on this system", Windows is blocking PowerShell scripts (its default setting). Open Command Prompt instead (search the Start menu for cmd) and type the same commands, or in PowerShell type npx.cmd instead of npx.

Save your Fetch TV recordings before you cancel. The free fetchtv tool copies them off a Fetch box over your home network, names each file the way your media library expects, and does not need your Fetch account.

Fetch set the levy opt-in deadline for 31 October 2026. If you opt in, Fetch keeps a Gen 3 box working until at least 30 June 2028. If you don't, Fetch suspends the box in November 2026, and you cannot copy recordings off a suspended box. Facts about the levy come from Fetch's levy FAQ; check the Leaving Fetch guide for changes.

Commands (replace the address with your box's address):

npx fetchtv
npx fetchtv shows --ip=192.168.1.50
npx fetchtv recordings --ip=192.168.1.50 --for-plex --save=./fetch-recordings

If the copy stops, run the last command again; it skips the files it already copied. With hundreds of recordings, expect to run it several times. To copy one show only, add --show= and part of its name. Fetch's episode numbers can differ by one from the TV guide's, so compare air dates where a show has Fetch and Freetvarr recordings from the same weeks.

Chapters:
{{chapters}}

Links:
- Leaving Fetch TV guide: https://furey.github.io/freetvarr/guide/leaving-fetch
- fetchtv: https://github.com/furey/fetchtv
- Node.js download: https://nodejs.org/en/download
- Freetvarr: https://furey.github.io/freetvarr/
`,
  tags: 'Fetch TV, Fetch levy, leaving Fetch, cancel Fetch, Fetch recordings, Fetch Mighty, Fetch Mini, save Fetch recordings, fetchtv, free-to-air TV, Plex, NAS, Freetvarr',
}
