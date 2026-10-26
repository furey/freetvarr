---
title: Recordings
description: >-
  Your library of shows, movies, and one-offs; show pages with episodes, menus,
  and recording options; deleting episodes; the Scheduled list with its tuner
  timeline; and the recording log.
---

# Recordings

The Recordings page holds everything Freetvarr has recorded and everything TVHeadend will record. A switch at the top picks **Library** or **Scheduled**. The **Scheduled** label also shows how many recordings are coming up.

Freetvarr saves each programme image while the recording is still scheduled, because TV guide image links often stop working once the programme has aired. A recording with no saved image shows a title card.

<!-- markdownlint-disable MD033 -->
<BrowserFrame label="http://freetvarr.lan/#/recordings">
  <img src="../img/screenshot-recordings.png" alt="Recordings → Library" width="2560" height="1872" loading="lazy">
</BrowserFrame>
<!-- markdownlint-enable MD033 -->

## Library

The library groups your recordings in shelves:

- **Shows**: a poster for each show with a series recording or a series folder. A number badge counts the episodes you have not started. A `REC` badge means an episode is recording now, and a red bar on the picture shows how much of the programme has aired.
- **Movies**: films that Freetvarr filed in the movies folder.
- **Specials and one-offs**: recordings with no series recording and no series folder, such as a sports final. The import puts them in the [one-off folder](/guide/configuration#the-one-off-folder), and they stay on this shelf even when the TV guide gives them season and episode numbers.

A recording appears on its shelf as soon as it starts, even before it is in your library. See [Recordings in progress](#recordings-in-progress).

**Sort** has two choices: **Recent** (the default) and **A–Z**. A leading "The" is ignored, so `The Block` sorts under B. The **Unwatched** chip hides shows you have finished; when you have watched everything, the page says `You are all caught up`. The browser remembers both choices.

Press a poster to open the show page. Press **⋯** under a poster, or hold the poster on a touch screen, to open the [show menu](#show-menu) without opening the show.

When recent imports failed, a banner sits above the shelves. Press **Review** to open the [recording log](#recording-log), filtered to the failures.

An empty library says `Nothing recorded yet` and offers **Find a show in the TV guide**.

## Show pages

A show page has these parts:

- **Back**: returns to the page you came from, such as Home, Library, or Scheduled. A show page opened from a link, or from the recording chip in the header, returns to the Library.
- **Play** or **Resume**: plays the next episode you have not watched.
- **Recording options**: opens the [Recording options](#recording-options) of a show with a series recording.
- **⋯**: opens the [show menu](#show-menu).
- **Status line**: what the series recording does next, such as `Next: Tue 8:30 pm on 9HD`, `Recording now`, or `Paused`, with a summary such as `Records every new episode on 9HD · keeps the latest 10 · ads removed`. Press it to open Recording options. A show with no series recording says `Not recording new episodes`, with a **Guide** button.
- **Classification**: the age label of the latest episode, such as `M` or `MA15+`. A show recorded before this version has none.
- **About**: the synopsis of the show, and a line from a review. See [About and cast and crew](#about-and-cast-and-crew).
- **Cast and crew**: the people in the show. See [About and cast and crew](#about-and-cast-and-crew).
- **Season chips**: pick a season when the show has more than one. When the TV guide uses the year as the season, such as season `26` of `NRL 2026`, the chip says `2026`, and a show with only that season has no chip. One-offs and movies have no season chips; their page lists each recording, newest first.
- **Episodes**: a row for each episode, with a thumbnail and a bar for how much you watched, the title, the air date and channel, and the synopsis. A `New` badge marks an episode you have not started, and a `REC` badge an episode that records now. A recording in progress has a red bar for how much of the programme has aired, and its row says how much is recorded and how many minutes are left.

Press an episode row to play it. Press **⋯** on the row, or hold the row on a touch screen, to open the [episode menu](#episode-menu).

A show with a series recording but no episodes yet still gets a poster. The page says when the first episode records, for example `First episode records Tue 8:30 pm`.

### Recordings in progress

A recording shows in the Library from the moment TVHeadend starts it. Its show page opens from the Library, from **RECORDING NOW** in [Scheduled](#scheduled), or from the recording chip in the header. From the chip, **Back** goes to the Library; from Scheduled, it goes to Scheduled. When recordings of more than one show run at once, the chip says how many, for example `Recording 2 shows`, and opens Scheduled.

When the show has no other episodes, the line under the title says `Series recording`, `One-off recording`, or `Movie recording`, to match the shelf, and the show page has these parts:

- **Watch from the start**: plays the recording from its first minute while TVHeadend keeps recording it. You can move anywhere in the part that is already recorded, or go to live.
- **Watch live**: opens the channel in the live player.
- **⋯**: opens the [show menu](#show-menu). It has **Watch from the start** and **Stop recording…** while the recording runs.
- **Recording card**: says when the recording ends, such as `Recording now until 10:10 pm`. When the recording started late, the card says so, for example `Recording started at 8:00 pm, 30 min after the programme began.` **Watch from the start** then plays from 8:00 pm, because the recording has nothing earlier.

When the show already has episodes, **Play** or **Resume** stays the main button, and the recording card has its own **Watch from the start** button. A show with a series recording shows the end time in its status line instead.

To watch a recording from the start while it records:

1. Go to Recordings → Library.
2. Press the poster or card with the `REC` badge.
3. Press **Watch from the start**.

Watching from the start reads the recording file, so it does not use a tuner. It uses one of the streams that Freetvarr can play at once. When all of them are in use, the player says what is already playing; stop one of them and try again. Freetvarr remembers where you stopped, and the episode resumes from there after it is imported.

The timeline covers the whole recording slot, from when the recording started to its scheduled end with padding. The end label is the scheduled end time, such as `10:10pm`. The part already recorded is brighter, and a red mark shows how far the recording has got. You can move anywhere before the mark but not past it. If the recording runs past its scheduled end, the timeline gets 10 minutes longer. When the recording finishes, the timeline ends at the end of the recording.

When the recording finishes, the row says `Waiting to import`. About a minute later Freetvarr starts a sync that imports it (see [Scheduled and manual](/guide/syncs#scheduled-and-manual)). The imported episode then takes the same place in the list. You cannot delete, select, move, or mark a recording in progress. To stop it, press **⋯** on the row, then **Stop recording…**, then **Stop recording** in the sheet.

A recording that Freetvarr will not import, because Settings → Recording → Media library → **Import every recording** is off and no series folder matches it, also shows in the Library. Its card says `When it finishes it stays in TVHeadend`. After it finishes, its row says `Not imported` and offers **Import**.

### About and cast and crew

The **About** and **Cast and crew** sections load after the page opens, so the episodes show first.

- **About**: the show synopsis from TMDB or TVmaze, or the synopsis of the newest episode when they have none. Below it, one line from a TMDB review shows with a link to the reviews. The score shows in the header; press it for the source. See [Ratings and reviews](/guide/tv-guide#ratings-and-reviews).
- **Cast and crew**: up to 12 cast members, each with a photo (initials when there is no photo), a name, and the character. Crew shows as lines, such as `Director: Jane Smith`. For a film, the crew is the director, up to 2 writers, and up to 2 producers. For a series, it is the creators and up to 2 executive producers. Press a person to open their TMDB or TVmaze page in a new tab. When that site does not answer, the person has no link.

A show with no match gets neither section. Reality and game show hosts appear in the cast. A film needs a [TMDB key](/guide/tv-guide#tmdb-key) for its cast and crew. To turn the lookup off, go to Settings → Watching → Film and TV info and turn off **Cast and crew**.

### Show menu

The show menu has these items. An item shows only when it applies.

| Item                                                    | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Play next unwatched**                                 | Plays the next episode you have not watched.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Mark all as watched** and **Mark all as unwatched**   | Sets the watched mark on every episode.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Recording options**                                   | Opens [Recording options](#recording-options).                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Pause recording** or **Resume recording**             | Pauses or resumes the series recording. Episodes already recorded still import.                                                                                                                                                                                                                                                                                                                                                                                             |
| **Show info**                                           | Shows the episode count, the series recording, the next airing, the folder it saves to, and its other names.                                                                                                                                                                                                                                                                                                                                                                |
| **Open in Plex**                                        | Opens the show in Plex, when the show has a file in your library.                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Change picture**                                      | Lets you pick the show's poster and background from the pictures Plex, TVmaze, TMDB (up to `8` of each), Wikipedia, and the TV guide have for it. Your pick shows on cards, the Home hero, and the show page until you press **Reset to automatic**; Plex stays unchanged. You can also press **Upload picture** (or drop a file on it) to use your own JPEG, PNG, or WebP picture of up to `20 MB`; Freetvarr crops it to fit and removes its location and camera details. |
| **Refresh artwork**                                     | Fetches the show's pictures again.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Delete watched episodes** and **Delete all episodes** | Deletes episodes. See [Delete episodes](#delete-episodes).                                                                                                                                                                                                                                                                                                                                                                                                                  |

### Episode menu

| Item                                                  | What it does                                                                                                                                                                                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Resume**                                            | Plays from where you stopped.                                                                                                                                                                                                                                            |
| **Play from the start** or **Play**                   | Plays from the beginning.                                                                                                                                                                                                                                                |
| **Mark as watched** or **Mark as unwatched**          | Sets the watched mark. Playing an episode to the end sets it too.                                                                                                                                                                                                        |
| **Mark earlier episodes as watched**                  | Marks every earlier episode of the show as watched.                                                                                                                                                                                                                      |
| **Episode info**                                      | Shows when it aired, the channel, the length, how much you watched, and the file it saves to.                                                                                                                                                                            |
| **Import**, **Import again**, or **Retry**            | Imports the recording now. **Import** shows for a recording Freetvarr has not imported, **Import again** for one whose library file is gone, and **Retry** for one that failed or was skipped.                                                                           |
| **Find ads**, **Remove ads**, or **Remove ads again** | Finds or removes the ads in the episode, with ad removal on. The label follows the show's ad removal mode and whether the episode is already cut. While a scan runs, the item shows its progress and you cannot press it. See [Re-scan and re-cut](#re-scan-and-re-cut). |
| **Put the original back**                             | Shows while a cut keeps its `.orig` backup. Puts the original recording, with the ads, back in place of the cut episode. See [Ad removal](/guide/ad-removal#backups-and-retention).                                                                                      |
| **Open in Plex**                                      | Opens the episode in Plex.                                                                                                                                                                                                                                               |
| **Delete episode**                                    | Deletes the episode. See [Delete episodes](#delete-episodes). It does not show while the episode records.                                                                                                                                                                |

**Move to show…**, in the show menu and the episode menu, puts episodes that the TV guide gave a different title into another show or a new one, and **Undo** in the message puts them back.

### Select mode

Press **Select** above the episodes to mark or delete several episodes at once:

1. Press **Select**.
2. Press each episode you want, or press **Select all** to pick every episode of the season. An episode that records now cannot be picked.
3. Press **Mark watched**, **Mark unwatched**, or **Delete**.
4. Press **Cancel** to leave Select mode.

### Delete episodes

**Delete episode**, **Delete watched episodes**, **Delete all episodes**, and **Delete** in Select mode all work the same way. Freetvarr deletes:

- The episode files in your media library, which removes them from Plex or any other media server that reads the library.
- The recordings in TVHeadend. TVHeadend keeps a note that it recorded each episode, so a series recording does not record it again ([Remove from TVHeadend](/guide/remove-from-tvheadend)).

After the delete, Freetvarr refreshes Plex, if you use it. The series recording stays on, so new episodes still record.

Before anything changes, a dialog lists **What gets deleted**, with the number of episodes and their size, and **What stays**. **Delete all episodes** on a show with a series recording also offers **Stop recording this show too**. Press the delete button in the dialog to go ahead, or **Cancel** to leave everything as it is. You cannot undo a delete.

An episode whose library file is already gone is listed in the dialog. Freetvarr then deletes only its TVHeadend recording.

## Recording options

**Recording options** is a panel that opens from the show page. On a phone it slides up from the bottom. On a wide screen it opens as a dialog. It changes the series recording of the show, and each change saves by itself. Press **Done** to close it.

| Option              | What it does                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Channels**        | The channels the series recording uses. Pick **Any channel** to record the show wherever it airs.                 |
| **Keep the latest** | The number of episodes TVHeadend keeps. **All** keeps every episode.                                              |
| **Start early**     | Minutes to start before the programme.                                                                            |
| **Finish late**     | Minutes to finish after the programme.                                                                            |
| **Remove ads**      | Cuts the ad breaks from new episodes. It needs ad removal on in Settings → Ad removal, and a folder for the show. |
| **Pause recording** | Stops recording new episodes. Episodes already recorded still import.                                             |

**Advanced** has these parts:

- **Saves to**: the folder the show saves to.
- **Also match titles containing**: the title match for the folder. **Edit folder and title match** opens the same fields as [Series rules](/guide/series#edit-a-series-folder). A show with no folder offers **Assign folder** instead.
- **Also known as**: your own names for the show, such as `MKR`. Type a name and press **Add**. [Search](/guide/home#search) then finds the show by that name too. Press the cross on a name to remove it.

**Stop recording this show** cancels the series recording. A second step asks what to do with an episode that records now, and whether to keep the title match. See [Cancel a series recording](/guide/series#cancel-a-series-recording).

## Scheduled

**Scheduled** lists what TVHeadend records now and what it will record over the next 7 days. The TV guide's `N scheduled` chip and the **Recording tonight** row on Home open it, and so does the recording chip in the header while recordings of more than one show run.

The list has these sections:

- **RECORDING NOW**: each recording with a progress bar. Press a row to open its show page, where you can [watch it from the start](#recordings-in-progress).
- **TODAY**, **TOMORROW**, and **LATER THIS WEEK**: the recordings that TVHeadend has scheduled, plus the episodes that your series recordings will catch.
- **WATCHLIST**: the shows you add to your watchlist from Search. Each row says when the show next airs, or `Not in the guide yet`, and whether it will record automatically, with any start and finish padding. A number badge counts new airings. See [Watchlist](/guide/tv-guide#watchlist).

Each row has a switch. Turn it off to skip that episode; the row then says `Skipped`. Turn it on to record it again. The series recording keeps recording the other episodes. A row the series recording will catch has no working switch yet, because TVHeadend adds the episode to its schedule nearer the time. Press a row to open the show.

TVHeadend skips a repeat of an episode it has already recorded or scheduled. Freetvarr also finds the repeats TVHeadend misses, such as a later airing with no episode number, and turns each one off after the first airing records. If the first airing fails, the repeat records. Scheduled hides these repeats. When the list has any, press **Show repeats** above the list to see them; Freetvarr remembers your choice on this device.

### The week

A strip of the next 7 days sits at the top of Scheduled on a phone, and beside the list on a wide screen. Each day shows how many recordings it has. Press a day to jump to it in the list. A day marked with a warning has a tuner clash.

### Tuners

On a wide screen, a timeline beside the list shows what each tuner records over the next few hours, such as `Tonight's tuners`, with one line for each tuner. It looks ahead to the first clash, if there is one.

A clash is a time when more programmes record than you have tuners. The timeline shows the clash on its own line, and a sentence under it says what to do, for example `The Block needs a third tuner from 8:30 to 9:00 pm. Skip one of the three, or it misses its first 30 minutes.` In the list, each clashing row says `No free tuner` with the times. To fix a clash, turn off the switch of one of the recordings, or move one to another airing in the [TV guide](/guide/tv-guide).

An empty list says `Nothing scheduled. Record from the TV guide.` and offers **Open the TV guide**.

## Playback

Press an episode row, or **Play** or **Resume** on the show page, to watch it in Freetvarr's [player](/guide/player). The player works in any browser, on a phone or a computer, and fills the screen. It remembers where you stopped and starts there next time.

The recording player adds these to the [player controls](/guide/player#controls):

- **Skip ad** appears at the bottom right while you watch an ad break that detection found (see [Ad removal](/guide/ad-removal)). Press it to jump to the end of the break.
- The position bar marks the ad breaks, and a pill says how many minutes are left.
- **AirPlay** sends the episode to an Apple TV, from Safari.

The player uses the imported file, or the TVHeadend copy when the recording is not imported. A recording still in progress cannot play here until it finishes; to watch it from the start while it records, use **Start over** → **From the start** in the [live player](/guide/player#start-over).

The player converts the file as it plays, the same way it converts [live TV](/guide/live-tv#stream-handling), so recordings count against [Live streams at once](/guide/player#live-streams-at-once). On the TV itself, a media player that reads your library (Plex, Jellyfin, Kodi, or Infuse) is still the better way to watch.

### Recording info

**Info** shows the recording's details over the picture:

- The channel, and `FROM LIBRARY` or `FROM TVHEADEND` for the file that plays.
- The title, the season and episode, and the episode title.
- When it aired, with a bar for how much you have watched.
- The length, and the import status.
- The description.
- **ADS**: the ad breaks a scan found or cut.
- **SAVES TO**: the library file. It reads **REPLACED BY** and the other file when another app replaced it, and **FILE MISSING** when Freetvarr cannot find the file. The player then plays the TVHeadend copy if TVHeadend still has it.

## Recording log

The recording log lists every recording TVHeadend has finished, with its programme image, show, air time, and what Freetvarr did with it. Open it from Settings → Recording → **Recording log**. The library and the show pages show the same recordings for watching; the log keeps the full import detail.

### Sort

**Sort** orders the log. The browser remembers your choice.

- **Newest** (the default) and **Oldest**: by the time the programme aired.
- **A–Z**: by title. A leading "The" is ignored.
- **Show A–Z**: by series. One-off recordings come last.
- **Recently imported**: by import time. Recordings not yet imported come last.
- **Largest**: by file size.

### Recording details

Press a row to open the recording's details under it. Press the row again to close them. The details show the description and these facts, when they are known:

- **Channel**, **Aired**, **Length**, and **Size**.
- **Imported**: when Freetvarr imported the recording.
- **File**: the file in your library.
- **TVHeadend**: whether TVHeadend still has its copy.
- **Ads**: the ad status, with the number of breaks and minutes of ads.
- **Playback**: where you stopped watching.

The buttons under the facts depend on the recording: **Play**, **Import** or **Import again**, **Find ads** or **Remove ads**, and **Remove from TVHeadend** or **Clear from list**.

### Statuses

- **IMPORTED**: the file on disk matches the size TVHeadend reported.
- **PARTIAL**: the imported file came up more than `1MB` short. The next sync imports it again.
- **SKIPPED**: there was nothing to import. Either TVHeadend has no file for the entry yet (it's still recording, or the recording failed), or the path it reported sits outside the recordings folder Freetvarr can see. The row's error says which.
- **FAILED**: the import hit an error.
- **NOT IMPORTED**: Freetvarr left the recording in TVHeadend. You recorded it with **Add to library** off, or it matches no series folder and **Import every recording** is off in Settings → Recording → Media library. Press **Import** to add it to the library at once.
- **REPLACED**: Freetvarr imported the recording, but its library file is gone, and the folder has another file for the same episode. Another app, such as Sonarr, replaced it. See [Replaced recordings](/guide/troubleshooting#replaced-recordings).
- **NOT IN LIBRARY**: Freetvarr imported the recording, but its library file is gone and no other copy of the episode is in the folder. Press **Import again** to import the TVHeadend copy again, while TVHeadend still has it.

An error shows under the status, cut to two lines. Press the row to see the full error, what it means, and steps to fix it, with a link to the matching section of [Troubleshooting](/guide/troubleshooting).

With ad removal on, an ad status also appears: **SCANNING**, **DETECTED**, **NO BREAKS**, **CUT**, **DETECT FAILED**, or **CUT FAILED**. See [Ad removal](/guide/ad-removal).

> [!NOTE]<br>
> A recording still in progress shows as **SKIPPED**. Freetvarr syncs about a minute after TVHeadend finishes the recording, up to ten minutes after the programme ends because of the padding, and that sync imports it.

### Live progress

A hardlink import is instant. A copy between filesystems, an ad scan, or a cut takes longer, so the row shows its progress and the time left.

### Re-scan and re-cut

Re-run an ad scan or cut on a file you have already imported, from the [episode menu](#episode-menu) or the recording log (press the row, then the ad button). This does not change TVHeadend. A dialog lists **What changes** and **What stays** before the scan starts:

- **Find ads** shows when the series folder's ad removal is **Detect** or **Off**. The scan writes the ad break times to a `.edl` file beside the recording, and the recording file stays as it is.
- **Remove ads** shows when it is **Cut**. The scan saves the episode again without the breaks, at the same picture quality, and keeps the original as `<file>.ts.orig`. The dialog gives the date the backup is kept until.
- **Remove ads again** shows for an episode that is already cut. It starts again from the original while the backup exists, and keeps the backup's first date.

The dialog also gives the expected time: finding the ads takes about half the length of the recording. Press the button in the dialog to start, or **Cancel** to leave the recording as it is. To undo a cut, press **Put the original back** in the episode menu on the show page or Home before the date in the dialog.

The ad button is greyed out when the library file is gone, for example after another app replaced or removed it, and while a scan runs.

### Remove from TVHeadend

Press an imported recording that TVHeadend still has, then **Remove from TVHeadend**, then **Remove from TVHeadend** in the dialog. TVHeadend deletes its copy of the recording, and your library copy stays. TVHeadend keeps a note that it recorded the episode, so a series recording does not record it again. You cannot undo this. [Remove from TVHeadend](/guide/remove-from-tvheadend) explains the TVHeadend calls.

### Not in TVHeadend

A recording that TVHeadend has deleted shows a **NOT IN TVHEADEND** marker next to its status. Hover over the marker to see when TVHeadend deleted it. The episode is still in your library, so you can play it, scan it for ads, or cut it again.

These rows leave the list 30 days after the removal. To remove them sooner, press **Clear N not in TVHeadend** in the toolbar (N is the number of rows), then **Clear from list** in the dialog. The button shows only while some rows are not in TVHeadend. The dialog states the number of rows it clears, across every page and filter. To clear one row, press it, then **Clear from list**, then **Clear from list** in the dialog. Both remove rows from the list only (the files stay in your library). For 10 seconds after a clear, **Undo** puts the rows back.

### Failed rows

To clear a **FAILED**, **SKIPPED**, or **NOT IMPORTED** row, press it, then **Clear from list**, then **Clear from list** in the dialog. TVHeadend keeps the recording. While TVHeadend has it, the next sync adds the row back and decides again whether to import it.

### Filters and time

Filter by show, by whether the recording is in TVHeadend, or by time. Times show in the time zone chosen in Settings → Schedule (or `TZ` from your `.env` until you choose one), whatever device you browse from.
