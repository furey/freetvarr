---
title: Following shows
description: >-
  Mark shows to follow, match them to library folders, and set where episodes
  are saved and how they're named.
---

# Following shows

TVHeadend records shows, and Freetvarr imports every recording it finishes. A followed show (a show rule) files a series into your TV library under its own folder and name. A recording that matches no rule goes to the [one-off folder](#recordings-with-no-show-rule). The Shows tab is where you manage the rules.

## Add a show

Pick a title TVHeadend has recorded, or type one (on a new install the list is empty). Freetvarr suggests a matching folder under your media root, or a new folder named after the show. You can change the folder before you save.

**RECORD SERIES** in the [TV guide](/guide/tv-guide#recording-a-programme) also adds a show rule for the title, unless one already matches or you turn **ADD TO LIBRARY** off. The rule uses an existing folder with the same name, or a new folder named after the show.

![The Shows tab](../img/screenshot-shows.png)

Matching is by name: a recording belongs to the followed show whose pattern appears in its title. When more than one pattern matches, the longest wins, so `NRL Grand Final` beats `NRL`.

## Season template

Each show has a season-folder template that decides where episodes are saved: `{season}`, `{season_padded}` (zero-padded, `01`), or `{season_unpadded}` (`1`). Freetvarr writes to `<media_root>/<dest_folder>/<season>/…`, and it rejects any template that would point outside your media root.

## Filenames

Freetvarr renames every file as it imports it, into the shape Plex reads:

```text
Show Name - S01E02 - Episode Title.ts
```

When the guide gave no episode number, the air date stands in:

```text
Show Name - 2026-09-21 - Episode Title.ts
```

The episode title is dropped when the guide didn't supply one. TVHeadend's own naming is left alone, because nothing downstream reads it.

## Recordings with no show rule

A recording that matches no show rule, such as a sports final, a special, or a film, goes to the one-off folder (`/media/one-offs` by default). Each title gets its own folder, and the file name carries the air date and start time:

```text
NRL Grand Final/NRL Grand Final - 2026-10-04 1930.ts
```

The one-off folder stays out of the TV library on purpose. Plex, Jellyfin, and Infuse match a TV library against online listings, and a one-off title rarely matches. Point a separate library at the folder instead; in Plex, use the **Other Videos** type. See [Configuration](/guide/configuration#the-one-off-folder) for the mount and the Settings switch that turns this off.

## Import, not download

TVHeadend already wrote the file to a folder Freetvarr can see, so there is nothing to download. The import is a hardlink when both folders are on one filesystem, and a copy when they aren't. A hardlink is instant and uses no extra disk; a copy shows its progress in [Recordings](/guide/recordings).

## Enable, sync, remove

- Disable a show to leave it out of scheduled syncs.
- Sync one show to import its new episodes now.
- Delete a follow to stop tracking it; imported files stay on disk.

## Per-show switches

These options are set per show:

- **Remove after import**: remove the TVHeadend copy once Plex confirms the file. See [Remove from TVHeadend](/guide/remove-from-tvheadend).
- **Ad removal mode**: `off`, `DETECT`, or `CUT`. See [Ad removal](/guide/ad-removal).
