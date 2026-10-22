---
title: Series rules and folders
description: >-
  Record a series from the TV guide, give it a series folder, and set where
  episodes are saved and how they are named.
---

# Series rules and folders

A series has two parts: a series recording in TVHeadend and a folder in your media library. TVHeadend records each episode. Freetvarr imports every recording TVHeadend finishes, and files the episodes of a series into its own folder at the next sync. Settings → Recording → **Series rules** lists both parts together. Settings → Recording → **Title matches** lists the [title matches](#title-matches).

Series rules and Title matches replace the SERIES tab of earlier versions; the old addresses `#/series` and `#/shows` open Series rules. To change one show, you can also use [Recording options](/guide/recordings#recording-options) on its show page.

<!-- markdownlint-disable MD033 -->
<BrowserFrame label="http://freetvarr.lan/#/settings/system/series">
  <img src="../img/screenshot-series.png" alt="Settings → Recording → Series rules" width="2560" height="1872" loading="lazy">
</BrowserFrame>
<!-- markdownlint-enable MD033 -->

## Add a series

1. In Freetvarr, open the [TV guide](/guide/tv-guide#recording-a-programme).
2. Press a programme of the series.
3. Pick **Every episode**.
4. Press **Record series**.

Freetvarr creates the series folder at the same time, unless you turn **Add to library** off first. The default for **Add to library** is in Settings → Recording → Media library. The programme sheet shows it under **Advanced**. Freetvarr uses an existing folder with the same name under your media root, or creates a new folder named after the series.

Matching is by title: a recording goes to the folder whose title appears in the recording's title. When more than one folder matches, the longest title wins, so `NRL Grand Final` beats `NRL`.

## Record on any channel

Turn on **Any channel** in the programme sheet before you press **Record series**. The series recording then matches on title alone, and records the show on whichever channel airs it, for example when it moves from 7 to 7mate. Episodes it already has are not recorded again. It is off by default.

Use it for a show that moves between channels, such as a series that airs on 7 one season and on 7mate the next. Series rules shows `Any channel` where it normally shows the channel names.

An episode that airs on two channels records once. The series recording skips an episode whose episode number it has already recorded, on any channel. This needs episode numbers in your TV guide, as in [How a series recording works](#how-a-series-recording-works). Where they are missing, TVHeadend records every airing, so the same episode can record twice.

To change the setting on an existing series, open its show page, press **Recording options**, and pick **Any channel** under **Channels**.

## How a series recording works

A series recording is one TVHeadend autorec entry. It matches on **title plus channel** (or on title alone, with [any channel](#record-on-any-channel)), across all days and all start times. It skips an episode whose episode number it has already recorded. The **Keep the latest** option maps to the maximum-count field of TVHeadend, so TVHeadend removes the oldest episodes itself.

- **One channel**: an SD channel and its HD simulcast are separate channels, so a series recording on the HD channel does not cover SD airings. Series rules shows both as one series.
- **Episode numbers**: duplicate detection needs them. XMLTV feeds carry them inconsistently, so your TV guide source decides what you get. Where they are missing, TVHeadend records every airing.

## Series rows

Each row shows one series:

- The title, with the channels and the number of episodes to keep.
- **Next**: the next airing, or the next expected airing, with its channel.
- **Saves to**: the full path where the next sync saves new episodes, such as `/media/tv/Bluey (2018)/Season 01`. The season comes from the next airing; when the TV guide has no season number, the path shows `Season …`. A series with no series folder shows its folder in the one-off folder, such as `/media/one-offs/Bluey`. When **Import every recording** is off in Settings → Recording → Media library, such a series shows that its episodes wait in the [recording log](/guide/recordings#recording-log).

A row shows a **Paused** badge when the series recording in TVHeadend is paused. A row with no badge records new episodes as normal.

**Sync** (on a row with a series folder) imports the new episodes of this series now.

Press a row to open the series under it. Press the row again, or press `Esc`, to close it. The open series shows:

- **Series recording**: whether TVHeadend records new episodes, with **Pause** and **Cancel series**.
- A series with a series folder shows the [edit form](#edit-a-series-folder).
- A series that saves to the one-off folder shows that path and **Assign folder**, which gives the series a folder in your media library. See [Assign a folder](#assign-a-folder).
- **Pause** stops TVHeadend recording new episodes of this series. Episodes already recorded still import. **Resume** starts it again. On an SD and HD pair, both series recordings pause and resume together.
- **Cancel series** removes the series recording from TVHeadend. See [Cancel a series recording](#cancel-a-series-recording).

## Sort and filter

The controls above the series rows narrow and order the list:

- **Filter series or channels**: type part of a title, a channel name, `any channel`, or part of a **Saves to** path.
- **Sort**: **A–Z** (the default), **Next airing**, or **Recently added**. **A–Z** ignores a leading "The", so `The Block` sorts under B. **Next airing** puts series with nothing in the TV guide last. **Recently added** uses the date the series got its series folder, so a series that saves to the one-off folder sorts last.
- **Status**: **All**, **Paused**, **Not in guide** (nothing in the TV guide for the next `7` days), or **Recording now**.

The group title shows how many series match. **Clear filters** shows all series again. The browser remembers the sort order; the filter and status reset when you leave the page.

## Cancel a series recording

In Series rules, press a row, then **Cancel series**. **Stop recording this show** in [Recording options](/guide/recordings#recording-options), the programme sheet of the TV guide, and the live player reach the same question. TVHeadend stops recording new episodes and removes the upcoming ones. Episodes already recorded stay, and so do their files. Before it cancels, Freetvarr asks:

- **Stop the episode on now** (shown while an episode records): on by default. After `5` minutes or more of recording, the episode stops and the part recorded so far stays. Before `5` minutes, Freetvarr deletes it. Turn the switch off to let the episode record to the end.
- **Keep title match** (shown when a [title match](#title-matches) saves this series): off by default when **Record series** made the title match, so cancelling removes it. A title match records nothing by itself; it only decides the folder for recordings with that text in the title. Turn the switch on to keep saving them to the same folder.

To change nothing, close the question. **Keep series** goes back.

## Assign a folder

Press a series that saves to the one-off folder, then **Assign folder**. A dialog opens before anything changes:

1. Check the folder name. Freetvarr fills in an existing folder with the same name under your media root, or a new folder named after the series.
2. To use another folder, type its name, or choose it from the list of existing folders.
3. Press **Assign folder** to save the folder for the series.

The dialog shows the full path for future episodes. Episodes already imported stay where they are; Freetvarr does not move them. After that, the [edit form](#edit-a-series-folder) opens under the row.

## Edit a series folder

Press a series with a series folder to open these fields under the row:

- **Saves to**: the folder under your media root (shown before the field) where the series goes. As you type, Freetvarr suggests matching folders that are already there.
- **Season folders**: the [season template](#season-template).
- **Recording titles that contain**: the title that Freetvarr matches. It ignores case.
- **Ad removal**: **Off**, **Detect**, or **Cut**. See [Ad removal](/guide/ad-removal). The field is off until you turn on ad removal in Settings → Ad removal.
- **Remove from TVHeadend after import**: remove the TVHeadend copy once Plex confirms the file. See [Remove from TVHeadend](/guide/remove-from-tvheadend).

Press **Save** to keep the changes. To close the form without saving, press the row again, or press `Esc`. A change to **Saves to** applies to future episodes only (episodes already imported stay where they are).

**Unassign folder** removes the folder from the series, after you confirm. Future episodes then save to the one-off folder again. When **Import every recording** is off in Settings → Recording → Media library, they wait in the [recording log](/guide/recordings#recording-log) instead. Episodes already imported stay where they are.

## Season template

Each folder has a season template that decides where episodes are saved: `{season}`, `{season_padded}` (zero-padded, `01`), or `{season_unpadded}` (`1`). Freetvarr writes to `<media_root>/<dest_folder>/<season>/…`, and it rejects any template that would point outside your media root.

## Filenames

Freetvarr renames every file as it imports it, into the shape Plex, Jellyfin, and Kodi read:

```text
Show Name - S01E02 - Episode Title.ts
```

When the TV guide gave no episode number, the air date stands in:

```text
Show Name - 2026-09-21 - Episode Title.ts
```

The episode title is dropped when the TV guide did not supply one. TVHeadend's own naming is left alone, because nothing downstream reads it.

## Title matches

A recording whose title contains this text saves to its folder, even without a series recording. Settings → Recording → **Title matches** lists each title with no series recording: a title you added by hand, such as `NRL`, or a series you cancelled with **Keep title match** on. Each title has a **Saves to** path and **Sync**, like a series row. Press the row to open the edit form under it. In the edit form, **Remove title match** removes the title after you confirm (recordings already imported stay where they are).

To add a title:

1. Under **Add title**, enter the **Recording titles that contain** text. Press **Refresh titles** to list the titles TVHeadend has recorded.
2. Under **Saves to**, enter the folder under your media root. Freetvarr suggests an existing folder, or a new folder named after the title.
3. Set the season folders, ad removal, and **Remove from TVHeadend after import**.
4. Press **Add title**.

## Recordings with no series

A recording that matches no series folder, such as a sports final or a special, goes to the one-off folder (`/data/media/one-offs` in the example Docker compose file). Each title gets its own folder, and the file name carries the air date and start time:

```text
NRL Grand Final/NRL Grand Final - 2026-10-04 1930.ts
```

The one-off folder stays out of the TV folder on purpose. Plex, Jellyfin, and Infuse match a TV library against online listings, and a one-off title rarely matches. In your media server, point a separate library at the folder instead (in Plex, use the **Other Videos** library type). See [Configuration](/guide/configuration#the-one-off-folder) for the mount and the **Import every recording** switch in Settings → Recording → Media library that turns this off.

## Films

Set a **movies folder** in Settings → Recording → Media library, and a film with no series folder goes there instead, named the way movie libraries expect:

```text
Isle Of Dogs (2018)/Isle Of Dogs (2018).ts
```

Freetvarr treats a recording as a film when the TV guide gives it a film or drama genre, no season or episode number, and a length of at least 75 minutes. The year appears only when the TV guide supplies one. Without a movies folder, films go to the one-off folder.

## Import, not download

TVHeadend already wrote the file to a folder Freetvarr can see, so there is nothing to download. The import is a hardlink when Freetvarr sees both folders through one mount, and a copy when it does not ([One shared mount](/guide/configuration#one-shared-mount)). A hardlink is instant and uses no extra disk space. A copy shows its progress in the [recording log](/guide/recordings#recording-log).

## Per-series switches

These options are set per series folder in the [edit form](#edit-a-series-folder):

- **Remove after import**: remove the TVHeadend copy once Plex confirms the file. See [Remove from TVHeadend](/guide/remove-from-tvheadend).
- **Ad removal**: **Off**, **Detect**, or **Cut**. See [Ad removal](/guide/ad-removal).
