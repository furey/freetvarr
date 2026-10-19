---
title: Recordings
description: >-
  Your library of shows, movies, and one-offs; show pages with episodes and
  recording options; the Scheduled list; and the recording log.
---

# Recordings

The Recordings page holds everything Freetvarr has recorded and everything TVHeadend will record. A switch at the top picks **Library** or **Scheduled**. Press a show to open its [show page](#show-pages).

Freetvarr saves each programme image while the recording is still scheduled, because TV guide image links often stop working once the programme has aired. A recording with no saved image shows a title card.

<!-- markdownlint-disable MD033 -->
<BrowserFrame label="http://freetvarr.lan/#/recordings">
  <img src="../img/screenshot-recordings.png" alt="Recordings → Library" width="2560" height="1872" loading="lazy">
</BrowserFrame>
<!-- markdownlint-enable MD033 -->

## Library

The library groups your recordings in shelves:

- **Shows**: a poster for each series. A number badge counts the episodes you have not watched. A red **REC** badge means an episode is recording now.
- **Movies**: films that Freetvarr filed in the movies folder.
- **Specials and one-offs**: single recordings, such as a sports final.

**Sort** has two choices: **Recent** (the default) and **A–Z**. A leading "The" is ignored, so `The Block` sorts under B. The **Unwatched** chip hides shows you have finished. The browser remembers both choices.

When recent imports failed, a red banner sits above the shelves. Press **Review** to open the [recording log](#recording-log), filtered to the failures.

An empty library says `Nothing recorded yet` and links to the Guide.

## Show pages

Press a poster to open the show page. It has these parts:

- **Hero**: the show's picture, its title, and the **Play** or **Resume** button for the next episode you have not watched.
- **Status line**: what the recording rule does, such as `Records every new episode on 9HD`, with the number of episodes it keeps and whether it removes ads. Press it to open [Recording options](#recording-options). A show with no rule says `Not recording new episodes`.
- **Next airing**: when the next episode is on.
- **Season chips**: pick a season when the show has more than one.
- **Episodes**: a row for each episode, with a thumbnail and a bar for how much you watched, the title, the air date and channel, and the synopsis. A **New** badge marks an episode you have not watched.

A show with a rule but no episodes still gets a poster. The status line says when the first episode records, for example `First episode records Tue 8:30 pm`.

### Episode menu

The **⋯** button on an episode opens its menu:

- **Mark watched** or **Mark unwatched**: sets the watched mark. Playing an episode to the end sets it too.
- **Import** or **Import again**: imports the recording now. It shows for a recording that Freetvarr has not imported, or whose library file is gone.
- **Retry**: tries the import again for a recording that failed or was skipped, while TVHeadend still has it.
- **Delete**: for an imported recording that TVHeadend still has, removes the TVHeadend copy. See [Remove from TVHeadend](#remove-from-tvheadend). For other rows, clears the row from the list. A dialog says which before anything changes.

## Recording options

**Recording options** is a panel that opens from the show page. On a phone it slides up from the bottom. On a wide screen it opens as a dialog. It changes the recording rule for the show, and each change saves by itself. Press **Done** to close it.

| Option              | What it does                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Channels**        | The channels the rule records on. Turn on **Any channel** to record the show wherever it airs.                    |
| **Keep the latest** | The number of episodes TVHeadend keeps. **All** keeps every episode.                                              |
| **Start early**     | Minutes to start before the programme.                                                                            |
| **Finish late**     | Minutes to finish after the programme.                                                                            |
| **Remove ads**      | Cuts the ad breaks from new episodes. It needs ad removal on in Settings → Ad removal, and a folder for the show. |
| **Pause recording** | Stops recording new episodes. Episodes already recorded still import.                                             |

**Advanced** shows the folder the show saves to and the title that Freetvarr matches. **Edit folder and title match** opens the same fields as [Series rules](/guide/series#edit-a-series-folder). A show with no folder offers **Assign folder**.

**Stop recording this show** cancels the rule. A second step asks what to do with an episode that records now, and whether to keep the title match. See [Cancel a series recording](/guide/series#cancel-a-series-recording).

## Scheduled

**Scheduled** lists what TVHeadend records now and what it will record. It replaces the `UPCOMING` view of the old TV Guide. The Guide's `N scheduled` chip and the red recording chip in the header open it.

The list has these sections:

- **Recording now**: each recording with a progress bar.
- **Today**, **Tomorrow**, and **Later this week**: the recordings that TVHeadend has scheduled, plus the episodes that your series rules will catch.
- **Watching for**: the shows you asked to be told about. See [Notify me](/guide/tv-guide#notify-me).

Each row has a switch. Turn it off to skip that episode. Turn it on to record it again. The series rule keeps recording the other episodes. A row marked as expected has no switch yet; TVHeadend adds the episode to its schedule nearer the time. Press a row to open the show.

An empty list says `Nothing scheduled. Record from the Guide.`

## Playback

Press the play button on an episode, or **Play** or **Resume** on the show page, to watch it in Freetvarr's player. The player works in any browser, on a phone or a computer, and fills the screen.

- The top bar has a back button, the show and episode title, **Captions**, **Info**, and a full-screen button.
- **Pause** and **Play** sit in the centre. **Start over** plays the episode from the start when Freetvarr resumed where you stopped.
- The position bar under the picture moves through the recording.
- **Captions** turns the broadcast's Teletext subtitles on or off, when the recording kept them. The choice is shared with the [live TV player](/guide/live-tv).
- **Skip ad** appears at the bottom right while you watch an ad break that detection found (see [Ad removal](/guide/ad-removal)). Press it to jump to the end of the break.
- **AirPlay** sends the episode to an Apple TV, on an iPhone.

The player uses the imported file, or the TVHeadend copy when the recording is not imported. Freetvarr remembers where you stopped and starts there next time. Double-tap (phone or tablet) or double-click (computer) the left third of the picture to go back `10` seconds, or the right third to go forward `10` seconds. On a computer, the left and right arrow keys skip `10` seconds too.

### Keyboard shortcuts

On a computer, the player takes these keys:

| Key                   | What it does                                            |
| --------------------- | ------------------------------------------------------- |
| Space or `k`          | Pauses, or carries on.                                  |
| Left and right arrows | Skip back or forward `10` seconds.                      |
| `f`                   | Enters or exits full screen.                            |
| `i`                   | Shows or hides the recording info.                      |
| `c`                   | Turns captions on or off, when the recording kept them. |
| `Esc`                 | Closes the recording info, or else closes the player.   |

### Recording info

**Info** shows the recording's details over the picture:

- The channel, and **FROM LIBRARY** or **FROM TVHEADEND** for the file that plays.
- The title, the season and episode, and the episode title.
- When it aired, with a bar for how much you have watched.
- The length, and the import status.
- The description.
- **ADS**: the ad breaks a scan found or cut.
- **SAVES TO**: the library file. It reads **REPLACED BY** and the other file when another app replaced it, and **FILE MISSING** when Freetvarr cannot find the file. The player then plays the TVHeadend copy if TVHeadend still has it.

The player converts the file as it plays, the same way it converts [live TV](/guide/live-tv#stream-handling), so live channels and recordings share the `LIVE_TV_MAX_SESSIONS` limit. A recording still in progress cannot play until it finishes. On the TV itself, a media player that reads your library (Plex, Jellyfin, Kodi, or Infuse) is still the better way to watch.

## Recording log

The recording log lists every recording TVHeadend has finished, with its programme image, show, air time, and what Freetvarr did with it. Open it from Settings → System → Recording log. The library and the show pages show the same recordings in a friendlier form; the log keeps the full admin detail.

### Sort

**Sort** orders the log. The browser remembers your choice.

- **Newest** (the default) and **Oldest**: by the time the programme aired.
- **A–Z**: by title. A leading "The" is ignored.
- **Show A–Z**: by series. One-off recordings come last.
- **Recently imported**: by import time. Recordings not yet imported come last.
- **Largest**: by file size.

### Recording details

Press a row to open the recording's details under it. Press the row again to close them. The details show the description and these facts, when they are known:

- **CHANNEL**, **AIRED**, **LENGTH**, and **SIZE**.
- **IMPORTED**: when Freetvarr imported the recording.
- **FILE**: the file in your library.
- **TVHEADEND**: whether TVHeadend still has its copy.
- **ADS**: the ad status, with the number of breaks and minutes of ads.
- **PLAYBACK**: where you stopped watching.

The buttons under the facts depend on the recording: **Play**, **Import** or **Import again**, **Scan for ads**, and **Remove from TVHeadend** or **Clear from list**.

### Statuses

- **IMPORTED**: the file on disk matches the size TVHeadend reported.
- **PARTIAL**: the imported file came up more than `1MB` short. The next sync imports it again.
- **SKIPPED**: there was nothing to import. Either TVHeadend has no file for the entry yet (it's still recording, or the recording failed), or the path it reported sits outside the recordings folder Freetvarr can see. The row's error says which.
- **FAILED**: the import hit an error.
- **NOT IMPORTED**: Freetvarr left the recording in TVHeadend. You recorded it with **Add to library** off, or it matches no series folder and **Import every recording** is off in Settings → Library and Plex. Press **Import** to add it to the library at once.
- **REPLACED**: Freetvarr imported the recording, but its library file is gone, and the folder has another file for the same episode. Another app, such as Sonarr, replaced it. See [Replaced recordings](/guide/troubleshooting#replaced-recordings).
- **NOT IN LIBRARY**: Freetvarr imported the recording, but its library file is gone and no other copy of the episode is in the folder. Press **Import again** to import the TVHeadend copy again, while TVHeadend still has it.

An error shows under the status, cut to two lines. Press the row to see the full error, what it means, and steps to fix it, with a link to the matching section of [Troubleshooting](/guide/troubleshooting).

With ad removal on, an ad status also appears: **SCANNING**, **DETECTED**, **NO BREAKS**, **CUT**, **DETECT FAILED**, or **CUT FAILED**. See [Ad removal](/guide/ad-removal).

> [!NOTE]<br>
> A recording still in progress shows as **SKIPPED**. The first sync after TVHeadend finishes the recording imports it, up to ten minutes after the programme ends because of the padding.

### Live progress

A hardlink import is instant. A copy between filesystems, an ad scan, or a cut takes longer, so the row shows its progress and the time left.

### Re-scan and re-cut

In the recording log, re-run an ad scan or cut on a file you have already imported. This does not change TVHeadend. Press the row, then **Scan for ads**. A dialog says what the scan does before it starts:

- When the series folder's ad removal is **Detect** or **Off**, the scan writes the ad break times to a `.edl` file beside the recording, and the recording file stays as it is.
- When it is **Cut**, the scan saves the recording again without the breaks and keeps the original as `<file>.ts.orig` for the days set in Settings → Ad removal. If a second cut of a cut recording finds more ads, it replaces that backup with the first cut, so the full original is lost.

The dialog also gives the expected time: finding the ads takes about half the length of the recording. Press **Find ads** or **Cut ads** to start, or close the dialog to leave the recording as it is.

**Scan for ads** is greyed out when the library file is gone, for example after another app replaced or removed it.

### Remove from TVHeadend

Press an imported recording that TVHeadend still has, then **Remove from TVHeadend**, then **Remove from TVHeadend** in the dialog. TVHeadend deletes its copy of the recording, and your library copy stays. TVHeadend keeps a note that it recorded the episode, so a series recording does not record it again. You cannot undo this. [Remove from TVHeadend](/guide/remove-from-tvheadend) explains the TVHeadend calls.

### Not in TVHeadend

A recording that TVHeadend has deleted shows a **NOT IN TVHEADEND** marker next to its status. Hover over the marker to see when TVHeadend deleted it. The episode is still in your library, so you can play it, scan it for ads, or cut it again.

These rows leave the list 30 days after the removal. To remove them sooner, press **Clear from list** in the toolbar, then **Clear from list** in the dialog. The dialog states the number of rows it clears, across every page and filter. To clear one row, press it, then **Clear from list**, then **Clear from list** in the dialog. Both remove rows from the list only (the files stay in your library). For 10 seconds after a clear, **Undo** puts the rows back.

### Failed rows

To clear a **FAILED**, **SKIPPED**, or **NOT IMPORTED** row, press it, then **Clear from list**, then **Clear from list** in the dialog. TVHeadend keeps the recording. While TVHeadend has it, the next sync adds the row back and decides again whether to import it.

### Filters and time

Filter by show, by whether the recording is in TVHeadend, or by time. Times show in the time zone chosen in Settings → Schedule (or `TZ` from your `.env` until you choose one), whatever device you browse from.
