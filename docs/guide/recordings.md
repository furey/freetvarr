---
title: Recordings
description: >-
  Your library of shows, movies, and one-offs; show pages with episodes, menus,
  and recording options; deleting episodes; the Scheduled list with its tuner
  timeline; and the recording log.
---

# Recordings

<Illustration name="recordings" />

The Recordings page holds everything Freetvarr has recorded and everything TVHeadend will record. Tabs at the top pick **Library** or **Scheduled**. The **Scheduled** label also shows how many recordings are coming up.

When TVHeadend finishes a recording, a [sync](/guide/syncs) imports it: Freetvarr hardlinks or copies the file into your media library folders (the TV folder for series, the one-off folder for one-offs, and the optional movies folder for films; see [Configuration](/guide/configuration#the-two-recordings-paths)). A hardlink is a second name for the same file, so it uses no extra disk space. Freetvarr hardlinks when TVHeadend's recordings folder and the library folders are on one disk, and copies the file otherwise.

Freetvarr saves each programme image while the recording is still scheduled, because TV guide image links often stop working once the programme has aired. A recording with no saved image shows a title card.

<!-- markdownlint-disable MD033 -->
<BrowserFrame label="http://freetvarr.lan/#/recordings">
  <img src="../img/screenshot-recordings.png" alt="Recordings → Library" width="2560" height="1872" loading="lazy">
</BrowserFrame>
<!-- markdownlint-enable MD033 -->

## Library

<!-- markdownlint-disable-next-line MD033 -->
<YouTubeVideo id="ZkVVYPSEmuA" title="Freetvarr recordings library, with Plex, Sonarr, and Radarr" duration="2:38" />

The library groups your recordings in three shelves:

- **Shows**: a poster for each TV series, even when you recorded only one episode. A number badge counts the episodes you have not started. A `REC` badge means an episode is recording now, and a red bar on the picture shows how much of the programme has aired.
- **Movies**: films that Freetvarr filed in the [movies folder](/guide/series#films), and films in your Plex movie library when [Plex](/guide/plex) is connected.
- **Specials and one-offs**: programmes that air once, such as a grand final, an awards night, or a special. The import puts them in the [one-off folder](/guide/configuration#the-one-off-folder).

Library shows each shelf as a row of its 12 most recently added or updated titles, newest first. Swipe or scroll a row sideways to see more. The last tile in each row says **See all** and how many the shelf holds, such as `60 movies`; it opens the same page as **See all** at the right of the row title. A shelf with nothing in it has no row.

**See all** opens one shelf on its own page, such as `#/recordings/movies`, with every title in a grid: posters for Shows and Movies, and wide pictures for Specials and one-offs. Tabs at the top of the page move between **Shows**, **Movies**, and **One-offs** without adding a step to Back. **‹ Library** at the top, or the browser's Back, returns to Library at the same place, with each row scrolled where you left it.

A show that has no recordings yet but has an episode scheduled in TVHeadend also gets a poster on its shelf. The day and time of the recording show under the poster, such as `Tue 8:30pm`.

Freetvarr decides between Shows and One-offs the same way for the shelf, for the TV guide, and for the folder the file goes to. It checks these in order:

1. Your choice wins. **Move to Shows** or **Move to One-offs**, a [series recording](/guide/series#how-a-series-recording-works) (TVHeadend records every new episode), and a series folder or [title match](/guide/series#title-matches) that you made all keep a title where you put it.
2. A film goes to Movies (see [Films](/guide/series#films)).
3. Sport with no entry on TheTVDB or TMDB (the online databases that Plex uses to name TV shows) is a one-off. Freetvarr counts a title as sport when the TV guide marks most of its recordings as sport. It asks TVmaze (an online TV database) once per title and remembers the answer. When the answer is no entry, it asks again after 30 days, and moves the title back to Shows if an entry has appeared. A sport title with a year in it, such as `Rugby League World Cup 2026`, is a one-off before the answer comes back. Plex cannot match these titles as TV shows, so it shows each game as an unnamed episode.
4. Everything else counts as a series when any of these is true:
   - It has a series folder that Freetvarr made at an earlier import, or Plex lists it as a TV show.
   - You recorded it on two or more days.
   - The TV guide shows different episodes of it on two or more days.
   - The TV guide gives it a real season number (not the year).
   - The TV guide numbers its episodes and it is not sport, or its episode numbers start after 1.

Titles such as Grand Final, Awards, Logies, Melbourne Cup, Telethon, Carols, and Concert count as one-offs unless one of the first four checks in step 4 says series.

Sport with an entry on TheTVDB or TMDB, such as `Offsiders`, goes through step 4 like any other programme. While TVmaze has not answered, or when it cannot be reached, a sport title also goes through step 4; Freetvarr moves its files after a later sync once the answer comes back. To keep a sport title in Shows, choose **Move to Shows** or press **Record series**.

If Freetvarr gets one wrong, choose **Move to Shows** or **Move to One-offs** in the show's ⋯ menu. The recorded files move to the matching folder (a series folder in the TV folder, or the title's folder in the one-off folder), and Plex refreshes both libraries. To undo the choice, go to Settings → WATCHING → Film and TV info, press **Movie corrections**, and press **Undo** beside the show. The files then move back.

A recording appears on its shelf as soon as it starts, even before it is in your library. See [Recordings in progress](#recordings-in-progress).

When Plex is connected, the shelves also list every episode and film in your Plex TV and Movies libraries, including files that [Sonarr or Radarr](/guide/sonarr-radarr) downloaded and files you copied in yourself. These episodes sit beside your recordings on the same show page, play in Freetvarr's player, and take their watched state and resume point from Plex. An episode that Plex has as both a recording and a download shows once; **Episode info** in the [episode menu](#episode-menu) lists both versions. Turn this off, or choose the Plex libraries it lists, in Settings → RECORDING → Plex → [YOUR WHOLE LIBRARY](/guide/plex#your-whole-library).

**Sort** and **Unwatched** sit on each **See all** page, under the tabs. **Sort** has two choices: **Recent** (the default) and **A–Z**. A leading "The" is ignored, so `The Block` sorts under B. The **Unwatched** chip hides titles you have finished, and the line under the page title then counts what is left, such as `23 of 60 movies · Unwatched`. When you have watched everything on the shelf, the page says `You are all caught up` and offers **Show everything**. The browser remembers both choices. The rows in Library always show everything, newest first.

Press a poster to open the show page. Press **⋯** under a poster, or hold the poster on a touch screen, to open the [show menu](#show-menu) without opening the show.

When recent imports failed, a banner sits above the rows. Press **Review** to open the [recording log](#recording-log), filtered to the failures.

An empty library says `Nothing recorded yet` and offers **Find a show in the TV guide**.

### Folder moves

Freetvarr moves a recorded file when its shelf and its folder do not match:

- Once, 3 minutes after Freetvarr first starts (after an update from 1.x, the first start of 2.0.0 or later). A recording in the wrong folder, such as the episodes of a weekly series in the one-off folder, moves to the matching folder.
- After each [sync](/guide/syncs), for a title that changed shelf. When Freetvarr cannot read the series recordings from TVHeadend, it moves nothing until a later sync can. When a title moves to One-offs, Freetvarr switches off the title match it made for that title at an earlier import, and removes its TV folder when the folder is empty.
- At once, after you choose **Move to Shows** or **Move to One-offs**, or undo that choice.

Files move only between the TV folder and the one-off folder; films stay where they are. Freetvarr skips a file when a file with the same name is already in the new place, or while [ad removal](/guide/ad-removal) works on it, and tries again after the next sync. Each run shows in Settings → SYSTEM → [Activity](/guide/syncs) as **Library folders**, with each file and its result.

## Show pages

A show page has these parts:

- **Back**: returns to the page you came from, such as Home, Library, or Scheduled. A show page opened from a link, or from the recording chip in the header (it shows while a recording runs; see [Recordings in progress](#recordings-in-progress)), returns to the Library.
- **Play** or **Resume**: plays the next episode you have not watched.
- **Recording options**: opens the [Recording options](#recording-options) of a show with a series recording.
- **⋯**: opens the [show menu](#show-menu).
- **Status line**: what the series recording does next, such as `Next: Tue 8:30pm on 9HD`, `Recording now`, or `Paused`, with a summary such as `Records every new episode on 9HD · keeps the latest 10 · ads removed`. Press it to open Recording options. A show with no series recording says `Not recording new episodes`, with a **TV guide** button. A show with no series recording but an episode scheduled in TVHeadend says when it records instead, such as `Records tonight 8:30pm on 9HD`.
- **Classification**: the age label of the latest episode, such as `M` or `MA15+`. A show recorded before Freetvarr 2.0.0 has none.
- **About**: the synopsis of the show, and a line from a review. See [About and cast and crew](#about-and-cast-and-crew).
- **Cast and crew**: the people in the show. See [About and cast and crew](#about-and-cast-and-crew).
- **Season chips**: pick a season when the show has more than one. When the TV guide uses the year as the season, such as season `26` of `NRL 2026`, the chip says `2026`, and a show with only that season has no chip. One-offs and movies have no season chips; their page lists each recording, newest first.
- **Episodes**: a row for each episode, with a thumbnail and a bar for how much you watched, the title, the air date, the length, and the synopsis. A `New` badge marks an episode you have not started, and a `REC` badge an episode that records now. A recording in progress has a red bar for how much of the programme has aired, and its row says how much is recorded and how many minutes are left.
- **Scheduled episode**: the next episode that TVHeadend has scheduled for the show, at the top of its season, with its day and time, such as `Tomorrow 8:30pm`. Press it to open its [programme sheet](/guide/tv-guide#recording-a-programme), where you can change or cancel the recording.

<!-- markdownlint-disable MD033 -->
<BrowserFrame label="http://freetvarr.lan/#/recordings/show/the-block">
  <img src="../img/screenshot-show.png" alt="A show page with the next scheduled episode above the recorded episodes" width="2560" height="1872" loading="lazy">
</BrowserFrame>
<!-- markdownlint-enable MD033 -->

Press an episode row to play it. Press **⋯** on the row, or hold the row on a touch screen, to open the [episode menu](#episode-menu).

A show with a series recording but no episodes yet still gets a poster. The page says when the first episode records, for example `First episode records Tue 8:30pm`. A show with only a scheduled episode also opens a full show page, with that episode in the list.

<!-- markdownlint-disable MD033 -->
<BrowserFrame label="http://freetvarr.lan/#/recordings/show/1-euro-house">
  <img src="../img/screenshot-show-scheduled.png" alt="A show page with one scheduled episode and no recordings yet" width="2560" height="1872" loading="lazy">
</BrowserFrame>
<!-- markdownlint-enable MD033 -->

### Recordings in progress

A recording shows in the Library from the moment TVHeadend starts it. Its show page opens from the Library, from **RECORDING NOW** in [Scheduled](#scheduled), or from the recording chip in the header. On a phone, a banner under the page title takes the place of the chip: its first line is the show's title, and its second line says `Recording` and how many minutes are left. From the chip or the banner, **Back** goes to the Library; from Scheduled, it goes to Scheduled. When recordings of more than one show run at once, the chip says how many, for example `Recording 2 shows`, the banner lists their titles, and both open Scheduled.

<!-- markdownlint-disable MD033 -->
<div class="phone-frames">
  <BrowserFrame phone label="freetvarr.lan/#/recordings/show/the-block">
    <img src="../img/screenshot-mobile-recording-banner.png" alt="A phone with the recording banner under the page title, showing the show title and Recording with the minutes left" width="780" height="1688" loading="lazy">
  </BrowserFrame>
</div>
<!-- markdownlint-enable MD033 -->

When the show has no other episodes, the line under the title says `Series recording`, `One-off recording`, or `Movie recording`, to match the shelf, and the show page has these parts:

- **Watch from the start**: plays the recording from its first minute while TVHeadend keeps recording it. You can move anywhere in the part that is already recorded, or go to live.
- **Watch live**: opens the channel in the live [player](/guide/player).
- **⋯**: opens the [show menu](#show-menu). It has **Watch from the start** and **Stop recording…** while the recording runs.
- **Recording card**: says when the recording ends, such as `Recording now until 10:10pm`. When the recording started late, the card says so, for example `Recording started at 8:00pm, 30 min after the programme began.` **Watch from the start** then plays from 8:00pm, because the recording has nothing earlier.

When the show already has episodes, **Play** or **Resume** stays the main button, and the recording card has its own **Watch from the start** button. A show with a series recording shows the end time in its status line instead.

To watch a recording from the start while it records:

1. Go to Recordings → Library.
2. Press the poster or card with the `REC` badge.
3. Press **Watch from the start**.

Watching from the start reads the recording file, so it does not use a tuner. It uses one of the streams that Freetvarr can play at once ([Live streams at once](/guide/player#live-streams-at-once)). When all of them are in use, the player says what is already playing; stop one of them and try again. Freetvarr remembers where you stopped, and the episode resumes from there after it is imported.

The player's timeline covers the whole recording slot, from when the recording started to its scheduled end with padding (the **Start early** and **Finish late** minutes in [Recording options](#recording-options)). The end label is the scheduled end time, such as `10:10pm`. The part already recorded is brighter, and a red mark shows how far the recording has got. You can move anywhere before the mark but not past it. If the recording runs past its scheduled end, the timeline gets 10 minutes longer. When the recording finishes, the timeline ends at the end of the recording.

When the recording finishes, the episode row says `Waiting to import`. About a minute later Freetvarr starts a sync that imports it (see [Scheduled and manual](/guide/syncs#scheduled-and-manual)). The imported episode then takes the same place in the list. You cannot delete, select, move, or mark a recording in progress. To stop it, press **⋯** on the row, then **Stop recording…**, then **Stop recording** in the sheet.

A recording that Freetvarr will not import, because Settings → RECORDING → Media library → **Import every recording** is off and no [series folder](/guide/series) matches it, also shows in the Library. Its card says `When it finishes it stays in TVHeadend`, and why. After it finishes, its row says `Not imported`, and its episode menu offers **Import**.

### About and cast and crew

The **About** and **Cast and crew** sections load after the page opens, so the episodes show first.

- **About**: the show synopsis from TMDB or TVmaze (online film and TV databases), or the synopsis of the newest episode when they have none. Below it, one line from a TMDB review shows with a link to the reviews. The score shows in the header; press it for the source. See [Ratings and reviews](/guide/tv-guide#ratings-and-reviews).
- **Cast and crew**: up to 12 cast members, each with a photo (initials when there is no photo), a name, and the character. Crew shows as lines, such as `Director: Jane Smith`. For a film, the crew is the director, up to 2 writers, and up to 2 producers. For a series, it is the creators and up to 2 executive producers. Press a person to open their TMDB or TVmaze page in a new tab. When that site does not answer, the person has no link.

A show with no match gets neither section. Reality and game show hosts appear in the cast. A film needs a [TMDB key](/guide/tv-guide#tmdb-key) for its cast and crew. To turn the lookup off, go to Settings → WATCHING → Film and TV info and turn off **Cast and crew**.

### Show menu

The show menu has these items. An item shows only when it applies.

| Item                                                    | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Watch from the start**                                | Shows while an episode records. Plays the recording from its first minute. See [Recordings in progress](#recordings-in-progress).                                                                                                                                                                                                                                                                                                                                           |
| **Play next unwatched**                                 | Plays the next episode you have not watched.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Mark all as watched** and **Mark all as unwatched**   | Sets the watched mark on every episode.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Recording options**                                   | Opens [Recording options](#recording-options).                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Pause recording** or **Resume recording**             | Pauses or resumes the series recording. Episodes already recorded still import.                                                                                                                                                                                                                                                                                                                                                                                             |
| **Show info**                                           | Shows the episode count, the series recording, the next airing, the folder it saves to, and its other names.                                                                                                                                                                                                                                                                                                                                                                |
| **Merge into another show…**                            | Puts the show's recorded episodes into another show. See [Merge into another show](#merge-into-another-show).                                                                                                                                                                                                                                                                                                                                                               |
| **Move to Shows** or **Move to One-offs**               | Moves the show to the other shelf and its recorded files to the matching folder. See [Library](#library).                                                                                                                                                                                                                                                                                                                                                                   |
| **Open in Plex**                                        | Opens the show in Plex, when the show has a file in your library.                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Change picture**                                      | Lets you pick the show's poster and background from the pictures Plex, TVmaze, TMDB (up to `8` of each), Wikipedia, and the TV guide have for it. Your pick shows on cards, the Home hero, and the show page until you press **Reset to automatic**; Plex stays unchanged. You can also press **Upload picture** (or drop a file on it) to use your own JPEG, PNG, or WebP picture of up to `20 MB`; Freetvarr crops it to fit and removes its location and camera details. |
| **Refresh artwork**                                     | Fetches the show's pictures again.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Stop recording…**                                     | Shows while an episode records. Stops the recording after you confirm. A recording stopped after `5` minutes or more keeps the part recorded so far; a shorter one is deleted.                                                                                                                                                                                                                                                                                              |
| **Delete watched episodes** and **Delete all episodes** | Deletes episodes. See [Delete episodes](#delete-episodes).                                                                                                                                                                                                                                                                                                                                                                                                                  |

### Episode menu

| Item                                                  | What it does                                                                                                                                                                                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Resume**                                            | Plays from where you stopped.                                                                                                                                                                                                                                            |
| **Play from the start** or **Play**                   | Plays from the beginning.                                                                                                                                                                                                                                                |
| **Mark as watched** or **Mark as unwatched**          | Sets the watched mark. Playing an episode to the end sets it too.                                                                                                                                                                                                        |
| **Mark earlier episodes as watched**                  | Marks every earlier episode of the show as watched.                                                                                                                                                                                                                      |
| **Episode info**                                      | Shows when it aired, the channel, the length, how much you watched, and the file it saves to. An episode with more than one version, such as your recording and a Sonarr download, lists each file with where it came from and its size.                                 |
| **Merge into another show…**                          | Puts this episode into another show. See [Merge into another show](#merge-into-another-show).                                                                                                                                                                            |
| **Import** or **Retry**                               | Imports the recording now. **Import** shows for a recording Freetvarr has not imported, and **Retry** for one that failed or was skipped.                                                                                                                                |
| **Find ads**, **Remove ads**, or **Remove ads again** | Finds or removes the ads in the episode, with ad removal on. The label follows the show's ad removal mode and whether the episode is already cut. While a scan runs, the item shows its progress and you cannot press it. See [Re-scan and re-cut](#re-scan-and-re-cut). |
| **Put the original back**                             | Shows while a cut keeps its `.orig` backup. Puts the original recording, with the ads, back in place of the cut episode. See [Ad removal](/guide/ad-removal#backups-and-retention).                                                                                      |
| **Open in Plex**                                      | Opens the episode in Plex.                                                                                                                                                                                                                                               |
| **Delete episode**                                    | Deletes the episode. See [Delete episodes](#delete-episodes). It does not show while the episode records.                                                                                                                                                                |

### Merge into another show

When the TV guide gives some episodes of a show a different title, those episodes show as a second show. To put them with the right show:

1. Open the show menu of the second show, or the episode menu of one of its episodes.
2. Press **Merge into another show…**.
3. Type part of the right show's title.
4. Press that show. To start a new show instead, type its full title and press **New show named "…"**.

<!-- markdownlint-disable MD033 -->
<BrowserFrame label="http://freetvarr.lan/#/recordings/show/the-block">
  <img src="../img/screenshot-merge.png" alt="The Merge into another show sheet, listing shows that match what you type" width="2560" height="1872" loading="lazy">
</BrowserFrame>
<!-- markdownlint-enable MD033 -->

The message that confirms the merge has **Undo**, which puts the episodes back. Only recorded episodes can merge; episodes from your Plex library stay with the show Plex gives them.

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

An episode or film that Freetvarr did not record is deleted by the app that downloaded it:

- **Sonarr or Radarr**: Freetvarr asks it to stop monitoring the episode or film, then to delete the file, so it does not download it again. The file goes to the app's recycle bin when that is on, and the dialog says for how many days. Connect the apps in Settings → RECORDING → [Sonarr and Radarr](/guide/sonarr-radarr).
- **No app**: Freetvarr deletes the file from the disk. The dialog shows the full path first. Plex removes the episode at its next scan.

The dialog also says which files Freetvarr leaves alone:

- A file outside your library folders.
- A file from Sonarr or Radarr when that app is not connected in Settings → RECORDING → Sonarr and Radarr.
- A recording file that another recording also uses. Freetvarr deletes the TVHeadend recording and keeps the file.

When another copy of a file stays on the disk (a hardlink), the dialog says that the delete frees no space.

An episode with two versions, such as your recording and a Sonarr download, offers **Both**, **Recording**, or **Sonarr copy** at the top of the dialog. **Delete all episodes** on a show that Sonarr downloads also offers **Remove the series from Sonarr too**, which is off until you tick it.

## Recording options

**Recording options** is a panel that opens from the show page. On a phone it slides up from the bottom. On a wide screen it opens as a dialog. It changes the series recording of the show, and each change saves by itself. Press **Done** to close it.

| Option              | What it does                                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Channels**        | The channels the series recording uses. Pick **Any channel** to record the show wherever it airs.                                                         |
| **Keep the latest** | The number of episodes TVHeadend keeps. **All** keeps every episode.                                                                                      |
| **Start early**     | Minutes to start before the programme.                                                                                                                    |
| **Finish late**     | Minutes to finish after the programme.                                                                                                                    |
| **Remove ads**      | Cuts the ad breaks from new episodes. It needs ad removal on in Settings → RECORDING → [Ad removal](/guide/ad-removal), and a series folder for the show. |
| **Pause recording** | Stops recording new episodes. Episodes already recorded still import.                                                                                     |

**Advanced** has these parts:

- **Saves to**: the folder the show saves to.
- **Also match titles containing**: the title match for the folder. **Edit folder and title match** opens the same fields as [Series rules](/guide/series#edit-a-series-folder). A show with no folder offers **Assign folder** instead.
- **Also known as**: your own names for the show, such as `MKR`. Type a name and press **Add**. [Search](/guide/home#search) then finds the show by that name too. Press the cross on a name to remove it.

**Stop recording this show** cancels the series recording. A second step asks what to do with an episode that records now, and whether to keep the title match. See [Cancel a series recording](/guide/series#cancel-a-series-recording).

## Scheduled

**Scheduled** lists what TVHeadend records now and what it will record over the next 7 days. The TV guide's `N scheduled` chip and the **Recording tonight** row on Home open it, and so does the recording chip in the header while recordings of more than one show run.

<!-- markdownlint-disable MD033 -->
<BrowserFrame label="http://freetvarr.lan/#/recordings/scheduled">
  <img src="../img/screenshot-scheduled.png" alt="Recordings → Scheduled, with RECORDING NOW, this week, and the tuners" width="2560" height="1872" loading="lazy">
</BrowserFrame>
<!-- markdownlint-enable MD033 -->

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

The recording log lists every recording TVHeadend has finished, with its programme image, show, air time, and what Freetvarr did with it. Open it from Settings → RECORDING → **Recording log**. The library and the show pages show the same recordings for watching; the log keeps the full import detail.

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
- **SKIPPED**: there was nothing to import. Either TVHeadend has no file for the entry yet (it's still recording, or the recording failed), or the path it reported sits outside the [recordings folder](/guide/configuration#the-two-recordings-paths) Freetvarr can see. The row's error says which.
- **FAILED**: the import hit an error.
- **NOT IMPORTED**: Freetvarr left the recording in TVHeadend. You recorded it with **Add to library** off (a switch in the [programme sheet](/guide/tv-guide#recording-a-programme)), or it matches no series folder and **Import every recording** is off in Settings → RECORDING → Media library. Press **Import** to add it to the library at once.
- **REPLACED**: Freetvarr imported the recording, but its library file is gone, and the folder has another file for the same episode. Another app, such as Sonarr, replaced it. See [Replaced recordings](/guide/troubleshooting#replaced-recordings).
- **NOT IN LIBRARY**: Freetvarr imported the recording, but its library file is gone and no other copy of the episode is in the folder. The episode leaves your library shelves, show pages, and counts, and stays in this log. Press **Import again** on its row to import the TVHeadend copy again, while TVHeadend still has it.

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

Filter by show, by status, by whether the recording is in TVHeadend, or by time. Times show in the time zone chosen in Settings → SYSTEM → Schedule (or `TZ` from your `.env` until you choose one; see [Compose environment](/guide/configuration#compose-environment)), whatever device you browse from.
