---
title: Following shows
description: >-
  Mark shows to follow, match them to library folders, and set where episodes
  are saved and how they're named.
---

# Following shows

TVHeadend records shows; freetvarr imports the ones you follow. The Shows tab is where you pick them.

## Add a show

The first time you open the Shows tab with TVHeadend set up, it pulls the titles TVHeadend has finished recording into a dropdown. Pick a title and freetvarr matches it against the folders already under your media root (even when the names aren't identical) and suggests where to file it. If nothing matches, it suggests a new folder named after the show. Either way, you can change the folder before saving.

![The Shows tab](../img/screenshot-shows.png)

Matching is by name: a recording is claimed by the first followed show whose pattern appears in the recording's title. Keep patterns specific enough not to collide.

## Season template

Each show has a season-folder template that decides where episodes are saved: `{season}`, `{season_padded}` (zero-padded, `01`), or `{season_unpadded}` (`1`). freetvarr writes to `<media_root>/<dest_folder>/<season>/…`, and it rejects any template that would point outside your media root, so a follow can only ever write inside your library.

## Filenames

freetvarr renames every file as it imports it, into the shape Plex reads:

```
Show Name - S01E02 - Episode Title.ts
```

When the guide gave no episode number, the air date stands in:

```
Show Name - 2026-09-21 - Episode Title.ts
```

The episode title is dropped when the guide didn't supply one. TVHeadend's own naming is left alone, because nothing downstream reads it.

## Import, not download

There is no download step. TVHeadend already wrote the file to a folder freetvarr can see, so the import is a hardlink when both paths are on one filesystem, and a file copy when they aren't. A hardlink is instant and costs no extra disk; a copy shows a progress bar in [Recordings](/guide/recordings).

## Enable, sync, remove

- Toggle a show enabled or disabled; disabled shows are skipped by scheduled syncs.
- Sync now on a single show imports just its new episodes, without waiting for the schedule.
- Delete a follow to stop tracking it; imported files stay on disk.

## Per-show switches

Two options live per show rather than globally:

- **Delete after import**: remove the TVHeadend copy once Plex confirms the file. See [Delete from TVHeadend](/guide/delete-from-tvheadend).
- **Ad removal mode**: `off`, `DETECT`, or `CUT`. See [Ad removal](/guide/ad-removal).
