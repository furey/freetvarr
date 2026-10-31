export const SCENES = [
  { id: 'open', chapter: 'Intro', lines: [
    'Every recording goes into your media library, in a folder for each show and season.',
    '{Freetvarr} renames each file with the season and episode, so media players can match it.',
  ] },
  { id: 'library', chapter: 'The library', lines: [
    'Open Recordings, then Library. Each show has a poster, on a shelf.',
    'Shows, movies, and specials and one-offs each have their own shelf.',
    'A number badge counts the episodes you have not started. A REC badge means one records now.',
  ] },
  { id: 'show', chapter: 'Show pages', lines: [
    'Press a poster to open the show page.',
    'Play, or Resume, starts the next episode you have not watched.',
    'The status line says what records next, and on which channel.',
    'Each episode has a row, with a bar for how much you watched.',
  ] },
  { id: 'menu', chapter: 'Episode menus', lines: [
    'Press the three dots on a row, or hold the row on a touch screen, for the episode menu.',
    'Mark an episode as watched, see where its file is, or delete it.',
  ] },
  { id: 'options', chapter: 'Recording options', lines: [
    'Recording options changes the series recording of that show.',
    'Pick the channels, how many episodes to keep, and how early to start and late to finish.',
    'Pause recording stops new episodes. Episodes already recorded still go into your library.',
    'Each change saves by itself.',
  ] },
  { id: 'delete', chapter: 'Delete', lines: [
    'Delete removes the episode from your library, and its recording from TVHeadend.',
    'Before anything changes, a dialog lists what gets deleted, and what stays.',
    'You cannot undo a delete. But the series keeps recording new episodes.',
    'TVHeadend keeps a note of the episode, so it does not record it again.',
  ] },
  { id: 'plex', chapter: 'Plex', lines: [
    'If you use Plex, {Freetvarr} asks it to scan after each new recording, so episodes show up straight away.',
    'Watched marks and resume points stay the same in both.',
    'Watch an episode in Plex, and {Freetvarr} shows it as watched too.',
  ] },
  { id: 'whole-library', chapter: 'Your whole Plex library', lines: [
    'Recordings can also list everything else in your Plex TV and movie libraries.',
    'Shows you copied in yourself sit on the same show pages, and play in {Freetvarr}.',
    '{Freetvarr} does not import, rename, or move those files.',
    'To turn this off, open Settings, then Recording, then Plex.',
  ] },
  { id: 'arr', chapter: 'Sonarr and Radarr', lines: [
    'Sonarr and Radarr are apps that download shows and films. If yours save to the same library, connect them.',
    'Open Settings, then Recording, then Sonarr and Radarr, and press Find Sonarr and Radarr.',
    'A delete in {Freetvarr} then goes through them, so the file does not download again.',
    'When an episode has two copies, the delete dialog asks which to delete.',
  ] },
  { id: 'end', chapter: 'Next', lines: [
    'Next in this playlist: Home, suggestions, and Settings.',
  ] },
]

export const TIMING = {
  lead: { open: 1.0 },
  tail: { open: 1.0, end: 3.0 },
}

export const YOUTUBE = {
  title: 'Freetvarr recordings library, with Plex, Sonarr, and Radarr',
  description: `
Freetvarr files every recording into your media library, in a folder for each show and season. This video covers the Recordings library, show pages, episode menus, Recording options, and deleting episodes, and what changes when you connect Plex (scans after each recording, watched state both ways, your whole library) or Sonarr and Radarr (deletes that do not download again).

Chapters:
{{chapters}}

Links:
- Recordings: https://furey.github.io/freetvarr/guide/recordings
- Plex: https://furey.github.io/freetvarr/guide/plex
- Sonarr and Radarr: https://furey.github.io/freetvarr/guide/sonarr-radarr
- Freetvarr: https://furey.github.io/freetvarr/
`,
  tags: 'Freetvarr, recordings library, media library, Plex, Plex watched sync, Sonarr, Radarr, TVHeadend, free-to-air TV, PVR, DVR, home server, self-hosted',
}
