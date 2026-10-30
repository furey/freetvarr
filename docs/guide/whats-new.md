---
title: What's new in 2.0
description: >-
  The Freetvarr 2.0 redesign: five destinations, a Home page with suggestions,
  show pages, a new player with Multiview, Scheduled recordings with tuners,
  two-way Plex watched sync, your whole Plex library, Sonarr and Radarr, and
  what changes when you upgrade.
---

# What's new in 2.0

## 2.0.0

Freetvarr 2.0 redesigns the app around five destinations: **Home**, **Live TV**, **TV guide**, **Recordings**, and **Settings**. Your recordings, series rules, folders, settings, and sync history carry over.

> [!IMPORTANT]<br>
> Before you upgrade from 1.x, back up the whole Freetvarr config folder, and read [Upgrading](#upgrading). On its first start, 2.0 can move some recorded files between your one-off folder and your TV folder.

### Navigation

On a phone, a tab bar at the bottom holds the five destinations. On a tablet or computer, a rail down the left side holds them, with Settings at the bottom. The page title is the header, so there is no separate brand bar.

Each page header has **Search**, which finds a show by its title, a nickname, its initials, or a close spelling. While TVHeadend records, the header shows what records, for example `Recording The Block`; on a phone it is a banner with the title and the time left. Press it to open the show page. See [Home and search](/guide/home).

When a check fails, a dot shows on the Settings icon, and a red problem also shows an alert on Home. See [Health badge](/guide/doctor#health-badge).

### Where each screen went

| Before                                  | Now                                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Dashboard                               | [Home](/guide/home)                                                                                                            |
| LIVE TV tab                             | [Live TV](/guide/live-tv)                                                                                                      |
| TV GUIDE tab                            | [TV guide](/guide/tv-guide)                                                                                                    |
| `UPCOMING` view in the TV Guide         | Recordings → [Scheduled](/guide/recordings#scheduled)                                                                          |
| RECORDINGS tab                          | Recordings → [Library](/guide/recordings#library), and Settings → Recording → [Recording log](/guide/recordings#recording-log) |
| SERIES tab                              | Settings → Recording → [Series rules](/guide/series) and [Title matches](/guide/series#title-matches)                          |
| SYNCS tab                               | Settings → System → [Activity](/guide/syncs), on its **Syncs** tab                                                             |
| Doctor, and `SYNC NOW` on the dashboard | Settings → System → [Health](/guide/doctor)                                                                                    |
| SETTINGS tab                            | [Settings](/guide/settings), grouped as About, Watching, Recording, System, and Danger zone                                    |

### Old links still work

A bookmark to an old address opens the new page:

| Old address                                                          | Opens                                                       |
| -------------------------------------------------------------------- | ----------------------------------------------------------- |
| `#/dashboard`                                                        | Home                                                        |
| `#/series` and `#/shows`                                             | Settings → Recording → Series rules                         |
| `#/series/<title>`                                                   | The show page for that title                                |
| `#/syncs` and `#/syncs/<number>`                                     | Settings → System → Activity                                |
| `#/doctor`                                                           | Settings → System → Health                                  |
| `#/recordings?status=failed` and other filtered `#/recordings` links | Settings → Recording → Recording log, with the same filters |

### Home

- **Highlights**: up to five slides at the top of Home, such as the episode to carry on with, a new episode, what records now, a top-rated film, and a suggestion. Each slide has its own buttons, such as **Resume**, **Watch live**, or **Record series**.
- **For you**: suggestions from the next week of the TV guide, made on your own computer from what you record and watch. Home has a **For you** row, and **See all** opens the For you page, with **Top rated movies this week**. On a tablet or computer, For you is also in the rail. Suggestions start once Freetvarr knows about five of your shows. Settings → Watching → **For you** turns them off, picks how much processor time they use, and pauses or clears your viewing history. See [For you](/guide/for-you).
- **New recordings**, **On now**, and **Recording tonight** rows. See [Home and search](/guide/home#rows).

### Recordings

Recordings has two views: **Library** and **Scheduled**.

- **Library** shows your recordings as posters, on the shelves Shows, Movies, and Specials and one-offs. A banner at the top lists recent failures, with a **Review** link to the Recording log. A show with a scheduled episode but no recordings yet is on the Shows shelf too.
- **Show pages** list the episodes of one show, with a **Play** or **Resume** button, the next scheduled episode, and a status line for its series recording. Press an episode row to play it. While an episode records, the show page offers **Watch from the start**.
- **Shows, one-offs, and movies**: Freetvarr decides which shelf and folder a title belongs on from its series rule, recordings on two or more days, the TV guide's repeats of the title, real season numbers, and titles such as a grand final or an awards night. If it gets one wrong, **Move to Shows** or **Move to One-offs** in the show's **⋯** menu moves it, and **Not a movie** or **This is a movie** corrects a film. Freetvarr then moves the files to the matching folder. See [Folder moves](/guide/recordings#folder-moves).
- **Merge into another show…** joins the episodes of one title to another show, for example when the TV guide changes a show's name ([Merge into another show](/guide/recordings#merge-into-another-show)).
- **⋯ menus** on each show and episode hold the actions in one place: play, mark as watched or unwatched, recording options, show and episode info, **Open in Plex**, **Change picture**, **Refresh artwork**, and delete. See [Show menu](/guide/recordings#show-menu) and [Episode menu](/guide/recordings#episode-menu).
- **Delete** removes the episode from your library and its recording from TVHeadend, then refreshes Plex. A dialog lists what it deletes, with the size, before anything changes. See [Delete episodes](/guide/recordings#delete-episodes).
- **Select** on a show page marks or deletes several episodes at once.
- **Recording options** holds the channels, how many episodes to keep, the start and finish padding, ad removal, and pause. Under **Advanced**, **Also known as** adds your own names for a show to search. See [Recording options](/guide/recordings#recording-options).
- **Scheduled** lists what records now, today, tomorrow, and later this week, with a strip of the week's days. On a wide screen, a timeline shows what each tuner records and warns when two recordings need more tuners than you have. Repeats that TVHeadend skips are hidden behind **Show repeats**. It replaces the `UPCOMING` view. See [Scheduled](/guide/recordings#scheduled).
- **Deleted outside Freetvarr**: an episode whose file you deleted in Plex, in a file manager, or by hand drops out of the Library. The Recording log keeps it.

### Plex

- **Watched state**: what you watch in Plex (or in a player that uses your Plex account) shows as watched in Freetvarr, with its resume point, and what you watch or mark in Freetvarr shows as watched in Plex. Both directions are on by default, for the Plex account that owns the token. Settings → Recording → Plex has the **From Plex** and **Back to Plex** switches and **Sync watched now**. See [Watched state](/guide/plex#watched-state).
- **Your whole library**: Recordings also lists the episodes and films in your Plex TV and Movies libraries that Freetvarr did not record, such as what Sonarr or Radarr downloaded. They play in Freetvarr, and a recorded episode that Plex also has as a download shows both copies. Settings → Recording → Plex → **Show your whole Plex library** turns it off or picks the libraries. Freetvarr never imports or moves these files. See [Your whole library](/guide/plex#your-whole-library).

### Sonarr and Radarr

Settings → Recording → **Sonarr and Radarr** connects Freetvarr to Sonarr and Radarr. **Find Sonarr and Radarr** looks for them on the same server; otherwise enter each address and API key. When you delete an episode or film that Sonarr or Radarr downloaded, Freetvarr asks it to stop monitoring the file and to delete it, so it does not download again. When an episode has a recording and a downloaded copy, the delete dialog asks which to delete: **Both**, **Recording**, or the **Sonarr copy** (or **Radarr copy**). See [Sonarr and Radarr](/guide/sonarr-radarr).

### TV guide

- **Watchlist**: for a show that is not in the next 7 days, search for its title and press **Add to watchlist**. Freetvarr lists the show under **Watchlist** in Scheduled whenever it is in the TV guide. Turn on **Record when it appears** to start an any-channel series recording, with your start and finish padding, the first time the show is in the TV guide. See [Watchlist](/guide/tv-guide#watchlist).
- **Record wording**: the programme sheet says **Record this movie** for a film, **Record** for a one-off, and **Record this episode** for an episode of a series.
- **Ratings, reviews, classification, and cast**: the programme sheet and show pages show scores and a review for films and scripted series, the classification, and the cast and crew with their photos. Settings → Watching → **Film and TV info** turns each lookup off. See [TV guide](/guide/tv-guide#ratings-and-reviews).
- **Add to library** now has a default. Set it in Settings → Recording → Media library. The programme sheet shows the choice under **Advanced**, so you can change it for one recording.

### Player

Live TV and recordings play in one full-screen player with its own controls. See [Player](/guide/player).

- **Start over** on live TV offers **From the start**, which plays a programme TVHeadend is recording from its first minute, and **Back to when you tuned in**. **Go live** returns to now.
- **Sound** and **Muted** in the top bar, and the `m` key, switch the sound. Settings → Watching → **Playback** has **Start muted** and how soon the controls hide.
- **Miniplayer** shrinks the player to a bar or a corner card, so you can browse Freetvarr while you watch.
- **Pop out (picture in picture)** and **Captions** are in the **⋯** menu.
- On a phone, turn the phone sideways to fill the screen with the picture. On an iPhone, the picture stays in Freetvarr's player, with its controls.
- **Multiview** plays up to four live channels at once (two on a phone), with one sound button for each picture. The channel list says which channels need a free tuner.
- **Live streams at once**, in Settings → Watching → Playback, sets how many live streams Freetvarr plays at the same time, for every device in the home. Freetvarr measures the computer at startup to pick the default; `LIVE_TV_MAX_SESSIONS` in your `.env`, when set, is the upper limit. See [Live streams at once](/guide/player#live-streams-at-once).

### Settings

Settings groups its pages as About, Watching, Recording, System, and Danger zone. The screens that used to be tabs moved there: Series rules, Title matches, and Recording log under Recording, and Health and Activity under System. **Search settings** at the top of Settings finds any page or setting. **System diagram**, under About, shows each component from the aerial to the TV. See [Settings](/guide/settings).

### Activity

Settings → System → **Activity** has two tabs. **Now** lists what the server is doing, such as a sync, an import, ad removal, or a library folder move, with the progress of each, what records and plays now, and what runs next. Press a finished job to see its steps and its log; failed jobs stay for 7 days. **Syncs** is the sync history that used to be the SYNCS tab. While a job runs, Settings shows the number running beside **Activity**. See [Activity](/guide/syncs).

### Upgrading

Freetvarr 2.0 keeps the Docker image name, the `.env` values, and your data. To upgrade, run `docker compose pull`, then `docker compose up -d`, in the `freetvarr` folder ([Updating](/guide/getting-started#updating)).

Before you upgrade, stop Freetvarr and copy the whole Freetvarr config folder. Freetvarr 2.0 keeps its database in SQLite's write-ahead log mode, so a backup must include `state.db-wal` and `state.db-shm` beside `state.db`. A copy of `state.db` alone can miss recent changes.

These change on the first start:

- **Database**: Freetvarr adds tables for watched marks, the watchlist, your viewing history, suggestions, pictures, ratings, the server's jobs, the Plex watched state, and your Plex library. Freetvarr 1.x does not start on the upgraded database, so keep your backup if you might go back.
- **Folder move**: Freetvarr sorts each title as a show, a one-off, or a movie with the new rules, then moves the files once to match, in the background, about 3 minutes after the first start. A title the TV guide numbers as episodes (such as a series filed with the year as its season), or that recorded on two or more days, moves from the one-off folder into the TV folder; a one-off filed in the TV folder moves to the one-off folder. A move never overwrites a file; Freetvarr skips that file instead. After the moves, Freetvarr refreshes Plex. Settings → System → Activity lists each move under **Library folders** ([Folder moves](/guide/recordings#folder-moves)). After that, Freetvarr checks again after each sync and when you change a shelf, for example with **Move to Shows**.
- **Plex**: if Plex is set up, **Watched state** and **Your whole library** are on. Freetvarr reads what you have watched in Plex, sends what you watched in Freetvarr back, and lists your Plex TV and Movies libraries in Recordings. Turn either off in Settings → Recording → Plex.
- **File names**: new TV episodes no longer have an episode title that only repeats the number, such as `Episode 3 of Season 2`, in their file names. Files already in your library keep their names.
- **Imports never overwrite**: when a file with the same name already exists and Freetvarr does not own it, the import saves the episode as a copy, for example `Show - S01E02 - copy 2.ts`. When two recordings point at one library file, deleting one of them keeps the file.
- **Series rules**: a new series recording made from a TV guide title saves the title escaped, so a title with characters such as `?`, `+`, or `(` matches only itself in TVHeadend. Your existing series rules stay as they are.
- **Live streams**: Freetvarr measures the computer at startup and sets **Live streams at once** from the result. `LIVE_TV_MAX_SESSIONS`, when set, is the upper limit and the default. A Docker compose file from before `2.0.0` sets it to `2`, so to let the measurement decide, change `${LIVE_TV_MAX_SESSIONS:-2}` to `${LIVE_TV_MAX_SESSIONS:-}` in your `docker-compose.yml`, then run `docker compose up -d` ([Configuration](/guide/configuration)).
- **Sonarr and Radarr**: to let Freetvarr read their API keys, set `SONARR_CONFIG_PATH` and `RADARR_CONFIG_PATH` in your `.env` and add their environment and volume lines to your `docker-compose.yml`. The install script keeps an existing Docker compose file, so copy the lines from [`docker-compose.example.yml`](https://github.com/furey/freetvarr/blob/main/docker-compose.example.yml). The same file now also passes `TVH_URL`, `MOVIES_ROOT`, and `LIVE_TV_VAAPI_DEVICE` from the `.env`. Both are optional; you can paste each API key in Settings instead ([Configuration](/guide/configuration)).

Nothing needs setting up again.
