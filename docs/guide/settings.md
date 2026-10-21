---
title: Settings
description: >-
  What each page of Freetvarr's Settings holds: your preferences, the System
  pages that used to be tabs, and About.
---

# Settings

Settings groups its pages under three headings: **ABOUT**, **PREFERENCES**, and **SYSTEM**. On a phone, Settings opens on the list of pages; press a page to open it. On a tablet or computer, the list sits beside the open page, and Settings opens on **About Freetvarr**.

<!-- markdownlint-disable MD033 -->
<BrowserFrame label="http://freetvarr.lan/#/settings">
  <img src="../img/screenshot-settings.png" alt="Settings" width="2560" height="1872" loading="lazy">
</BrowserFrame>
<!-- markdownlint-enable MD033 -->

When [Health](/guide/doctor) finds a problem, a dot shows on the Settings icon and on the **Health** row.

## About

- **About Freetvarr**: links to **Setup** and **Health checks**, the versions of Freetvarr, TVHeadend, and Node with the uptime, the licences, and the data credits.

## Preferences

| Page                 | What it holds                                                                                                                                                                                                                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Recording**        | The folders: **Media root**, **One-off folder**, **Movies folder**, and the recordings folder as Freetvarr and TVHeadend each see it ([Configuration](/guide/configuration#the-two-recordings-paths)). **Live streams at once**, `1` to `4` ([Player](/guide/player#live-streams-at-once)).                                                           |
| **Library and Plex** | **Add to library by default** and **Import every recording** ([Configuration](/guide/configuration#the-one-off-folder)), and the Plex server, token, and libraries ([Plex](/guide/plex)).                                                                                                                                                             |
| **Film and TV info** | The **Look up online** switches **Missing pictures** ([Missing pictures](/guide/tv-guide#missing-pictures)), **Ratings**, **Reviews** ([Ratings and reviews](/guide/tv-guide#ratings-and-reviews)), and **Cast and crew** ([Cast and crew](/guide/tv-guide#cast-and-crew)), and the optional **TMDB API key** ([TMDB key](/guide/tv-guide#tmdb-key)). |
| **Ad removal**       | **Enable ad removal**, how long to keep the original after a cut, and the detection settings ([Ad removal](/guide/ad-removal)).                                                                                                                                                                                                                       |
| **Watch on TV**      | A TVHeadend login and the addresses for Jellyfin and Kodi ([TV apps](/guide/tv-apps)).                                                                                                                                                                                                                                                                |
| **Channels**         | **Hide SD simulcasts** and **Hide SD channels**, the same switches as in the channel settings of the TV guide and Live TV ([TV guide](/guide/tv-guide#favourites)).                                                                                                                                                                                   |
| **Player**           | **Start muted** and **Hide player controls after** ([Player settings](/guide/player#player-settings)).                                                                                                                                                                                                                                                |
| **For you**          | For you, its suggestion level, and your viewing history ([For you](/guide/for-you#for-you-settings)).                                                                                                                                                                                                                                                 |
| **Schedule**         | The time zone and the **Sync schedule** ([Activity](/guide/syncs#scheduled-and-manual)).                                                                                                                                                                                                                                                              |

Each **Look up online** switch sends programme titles to online services: **Missing pictures** to TVmaze, Wikidata, Wikipedia, and TMDB; **Ratings** to TVmaze and TMDB; **Reviews** to TMDB; and **Cast and crew** to TVmaze and TMDB. TMDB receives titles only after you add a key. Turn a switch off to keep those titles on your network.

On the Recording, Library and Plex, Film and TV info, Ad removal, and Schedule pages, press **Save settings** to keep a change. **Live streams at once**, the TMDB key (**Save key**), and the Channels, Player, and For you pages save each change at once.

## System

The System pages hold the screens that were tabs before Freetvarr 2.0:

| Page              | What it holds                                                                                                                                                                                                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Setup**         | What Freetvarr uses now: TVHeadend, channels, the TV guide, folders, Plex, and the time zone. Press a row to check or change that part, such as **Scan again** for channels. **Run the whole setup from the start** opens setup again ([Getting started](/guide/getting-started#_2-run-setup)).     |
| **Health**        | The checks, the last and next sync, **Sync now**, and the free disk space ([Health](/guide/doctor)).                                                                                                                                                                                                |
| **Activity**      | The history of syncs ([Activity](/guide/syncs)).                                                                                                                                                                                                                                                    |
| **Series rules**  | Every series recording with its folder ([Series rules and folders](/guide/series)).                                                                                                                                                                                                                 |
| **Folders**       | The title matches that save recordings to a folder without a series recording ([Title matches](/guide/series#title-matches)).                                                                                                                                                                       |
| **Recording log** | Every recording TVHeadend has finished, with the full import detail ([Recording log](/guide/recordings#recording-log)).                                                                                                                                                                             |
| **TVHeadend**     | The TVHeadend address and login, and the TVHeadend open-access check ([TVHeadend](/guide/tvheadend)).                                                                                                                                                                                               |
| **Danger zone**   | **Reset Freetvarr** deletes Freetvarr's settings, series folders, list of recordings, and sync history, then setup starts from the beginning. Your video files, and the recordings and settings in TVHeadend, stay where they are. You cannot undo a reset, and you cannot reset while a sync runs. |

## Old addresses

Settings pages have their own addresses, such as `#/settings/player` or `#/settings/system/health`. The addresses of the old tabs open the new pages; [What's new in 2.0](/guide/whats-new#old-links-still-work) lists them.
