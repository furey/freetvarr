---
title: Settings
description: >-
  What each page of Freetvarr's Settings holds: your preferences, the System
  pages that used to be tabs, and About.
---

# Settings

Settings groups its pages under three headings: **PREFERENCES**, **SYSTEM**, and **ABOUT**. On a phone, Settings opens on the list of pages; press a page to open it. On a tablet or computer, the list sits beside the open page.

<!-- markdownlint-disable MD033 -->
<BrowserFrame label="http://freetvarr.lan/#/settings">
  <img src="../img/screenshot-settings.png" alt="Settings" width="2560" height="1872" loading="lazy">
</BrowserFrame>
<!-- markdownlint-enable MD033 -->

When [Health](/guide/doctor) finds a problem, a dot shows on the Settings icon, on the **SYSTEM** heading, and on the **Health** row.

## Preferences

| Page                 | What it holds                                                                                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Recording**        | The folders: **Media root**, **One-off folder**, **Movies folder**, and the recordings folder as Freetvarr and TVHeadend each see it ([Configuration](/guide/configuration#the-two-recordings-paths)). **Live streams at once** ([Player](/guide/player#live-streams-at-once)). |
| **Library and Plex** | **Add to library by default** and **Import every recording** ([Configuration](/guide/configuration#the-one-off-folder)), and the Plex server, token, and libraries ([Plex](/guide/plex)).                                                                                       |
| **Pictures**         | **Look up missing pictures online** ([Missing pictures](/guide/tv-guide#missing-pictures)) and the optional **TMDB API key** ([TMDB key](/guide/tv-guide#tmdb-key)).                                                                                                            |
| **Ad removal**       | **Enable ad removal**, how long to keep the original after a cut, and the detection settings ([Ad removal](/guide/ad-removal)).                                                                                                                                                 |
| **Watch on TV**      | A TVHeadend login and the addresses for Jellyfin and Kodi ([TV apps](/guide/tv-apps)).                                                                                                                                                                                          |
| **Player**           | **Start muted** and **Hide player controls after** ([Player settings](/guide/player#player-settings)).                                                                                                                                                                          |
| **For you**          | For you, its suggestion level, and your viewing history ([For you](/guide/for-you#for-you-settings)).                                                                                                                                                                           |
| **Schedule**         | The time zone and the **Sync schedule** ([Activity](/guide/syncs#scheduled-and-manual)).                                                                                                                                                                                        |

On the Recording, Library and Plex, Pictures, Ad removal, and Schedule pages, press **Save settings** to keep a change. **Live streams at once**, the TMDB key (**Save key**), and the Player and Suggestions pages save each change at once.

## System

The System pages hold the screens that were tabs before Freetvarr 2.0:

| Page              | What it holds                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Health**        | The checks, the last and next sync, **Sync now**, and the free disk space ([Health](/guide/doctor)).                          |
| **Activity**      | The history of syncs ([Activity](/guide/syncs)).                                                                              |
| **Series rules**  | Every series recording with its folder ([Series rules and folders](/guide/series)).                                           |
| **Folders**       | The title matches that save recordings to a folder without a series recording ([Title matches](/guide/series#title-matches)). |
| **Recording log** | Every recording TVHeadend has finished, with the full import detail ([Recording log](/guide/recordings#recording-log)).       |
| **TVHeadend**     | The TVHeadend address and login, and the TVHeadend open-access check ([TVHeadend](/guide/tvheadend)).                         |

## About

- **About Freetvarr**: **Reopen wizard** to run the [setup wizard](/guide/getting-started#_2-run-the-wizard) again, **Health checks**, the versions of Freetvarr, TVHeadend, and Node with the uptime, the licences, and the data credits.
- **Danger zone**: **Reset Freetvarr** deletes Freetvarr's settings, series folders, list of recordings, and sync history, then the setup wizard starts from the beginning. Your video files, and the recordings and settings in TVHeadend, stay where they are. You cannot undo a reset, and you cannot reset while a sync runs.

## Old addresses

Settings pages have their own addresses, such as `#/settings/player` or `#/settings/system/health`. The addresses of the old tabs open the new pages; [What's new in 2.0](/guide/whats-new#old-links-still-work) lists them.
