export const SCENES = [
  { id: 'open', chapter: 'Intro', lines: [
    '{Freetvarr} has five places: Home, Live TV, TV guide, Recordings, and Settings.',
    'On a phone, they sit in the tab bar at the bottom. On a computer, they run down the left side.',
  ] },
  { id: 'home', chapter: 'Home', lines: [
    'Home answers one question: what can I watch now?',
    'The slides at the top show things such as the episode to carry on with, and what records now.',
    'Below them are rows of new recordings, suggestions, what is on now, and what records tonight.',
    'On now shows only your favourite channels. Star a few channels to fill it.',
    'Press and hold any card for more choices.',
  ] },
  { id: 'search', chapter: 'Search', lines: [
    'Search finds a show in your recordings, and in the next seven days of the guide.',
    'It also finds a show by its initials, and offers a close spelling when nothing matches.',
  ] },
  { id: 'for-you', chapter: 'For you', lines: [
    'For you suggests programmes from the next week of the guide.',
    '{Freetvarr} works them out on your own computer, from what you record and watch.',
    'Your viewing history never leaves that computer.',
    'Suggestions start once it knows about five of your shows.',
    'Press the three dots on a card for More like this, Fewer like this, or Why this.',
    'To turn For you off, or pause your history, open Settings, then For you.',
  ] },
  { id: 'activity', chapter: 'Activity', lines: [
    'A sync is one check of TVHeadend for finished recordings. {Freetvarr} files any new ones into your library.',
    'Settings, then System, then Activity, shows what the server does now, with progress for each job.',
    'The Syncs tab lists every sync. Press Sync now to check at once.',
  ] },
  { id: 'health', chapter: 'Health', lines: [
    'Health checks everything {Freetvarr} depends on, and says what to fix.',
    'It runs by itself every three hours.',
    'When something breaks, a dot appears on the Settings icon. A red problem also shows on Home.',
    'Press it to open Health, where the fix is written out.',
  ] },
  { id: 'settings', chapter: 'Settings', lines: [
    'Settings groups its pages under About, Watching, Recording, and System.',
    'Search settings finds any page or setting by name.',
    'System diagram shows each part of the setup, from the aerial to the TV.',
    'To redo one part of setup, such as the channel scan, open System, then Setup.',
  ] },
  { id: 'end', chapter: 'More help', lines: [
    'The {Freetvarr} guide has the detail for every page. The link is in the description.',
  ] },
]

export const TIMING = {
  lead: { open: 1.0 },
  tail: { open: 1.0, end: 3.2 },
}

export const YOUTUBE = {
  title: 'Freetvarr Home, For you, Activity, Health, and Settings',
  description: `
A tour of the pages you use every day in Freetvarr: Home, with what to watch now; Search, which finds shows by title or initials; For you, with suggestions worked out on your own computer; and Settings, where Activity shows what the server does now and Health says what to fix.

Chapters:
{{chapters}}

Links:
- Home and search: https://furey.github.io/freetvarr/guide/home
- For you: https://furey.github.io/freetvarr/guide/for-you
- Activity: https://furey.github.io/freetvarr/guide/syncs
- Health: https://furey.github.io/freetvarr/guide/doctor
- Settings: https://furey.github.io/freetvarr/guide/settings
- Freetvarr: https://furey.github.io/freetvarr/
`,
  tags: 'Freetvarr, TV suggestions, For you, home server, self-hosted, TVHeadend, free-to-air TV, PVR, DVR, health check, leaving Fetch',
}
