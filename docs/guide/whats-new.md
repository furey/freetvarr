---
title: What's new in 2.0
description: >-
  The Freetvarr 2.0 redesign: five destinations, shows with their own pages,
  Scheduled recordings, a System section in Settings, and where each old screen
  went.
---

# What's new in 2.0

Freetvarr 2.0 redesigns the app around five destinations: **Home**, **Live TV**, **Guide**, **Recordings**, and **Settings**. Your recordings, series rules, folders, settings, and sync history carry over unchanged. Nothing needs setting up again.

## Navigation

On a phone, a tab bar at the bottom holds the five destinations. On a tablet or computer, a rail down the left side holds them, with Settings at the bottom. The page title is the header, so there is no separate brand bar.

The header of each page has these controls:

- **Search**: the magnifier opens a search over your shows and the Guide.
- **Health dot**: green means all is well. Amber or red adds a short sentence, such as `The last sync failed.` Press it to open [Health](/guide/doctor).
- **Recording chip**: appears while TVHeadend records, for example `Recording The Block`. Press it to open [Scheduled](/guide/recordings#scheduled).

## Where each screen went

| Before                                  | Now                                                                                                                         |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Dashboard                               | [Home](/guide/tv-guide#on-the-dashboard)                                                                                    |
| LIVE TV tab                             | [Live TV](/guide/live-tv)                                                                                                   |
| TV GUIDE tab                            | [Guide](/guide/tv-guide)                                                                                                    |
| `UPCOMING` view in the TV Guide         | Recordings → [Scheduled](/guide/recordings#scheduled)                                                                       |
| RECORDINGS tab                          | Recordings → [Library](/guide/recordings#library), and Settings → System → [Recording log](/guide/recordings#recording-log) |
| SERIES tab                              | Settings → System → [Series rules](/guide/series) and [Folders](/guide/series#title-matches)                                |
| SYNCS tab                               | Settings → System → [Activity](/guide/syncs)                                                                                |
| Doctor, and `SYNC NOW` on the dashboard | Settings → System → [Health](/guide/doctor)                                                                                 |
| SETTINGS tab                            | [Settings](/guide/configuration#runtime-settings), grouped as Preferences, System, and About                                |

## Old links still work

A bookmark to an old address opens the new page:

| Old address                                                          | Opens                                                    |
| -------------------------------------------------------------------- | -------------------------------------------------------- |
| `#/dashboard`                                                        | Home                                                     |
| `#/series` and `#/shows`                                             | Settings → System → Series rules                         |
| `#/series/<title>`                                                   | The show page for that title                             |
| `#/syncs` and `#/syncs/<number>`                                     | Settings → System → Activity                             |
| `#/doctor`                                                           | Settings → System → Health                               |
| `#/recordings?status=failed` and other filtered `#/recordings` links | Settings → System → Recording log, with the same filters |

## New in Recordings

Recordings now has two views: **Library** and **Scheduled**.

- **Library** shows your recordings as posters, grouped as Shows, Movies, and Specials and one-offs. A banner at the top lists recent failures, with a **Review** link to the Recording log.
- **Show pages** list the episodes of one show, with a **Play** or **Resume** button, the next airing, and a status line for its recording rule.
- **Recording options** opens from the status line. It holds the channels, how many episodes to keep, the start and finish padding, ad removal, and pause. See [Recording options](/guide/recordings#recording-options).
- **Scheduled** lists what is recording now, tonight, and later this week. It replaces the `UPCOMING` view.

## New in the Guide

The programme sheet has a third choice beside **This episode** and **Every episode**: **Notify me**. Pick it for a show that is not in the Guide yet. Freetvarr watches the Guide and lists the show under **Watching for** in Scheduled. Turn on **Record when it appears** to start an any-channel series recording the first time the show is in the Guide. See [Notify me](/guide/tv-guide#notify-me).

**Add to library** now has a default. Set it in Settings → Library and Plex. The programme sheet shows the choice under **Advanced**, so you can change it for one recording.

## New in Live TV

The player is full screen. **Start over** jumps to the start of the 30-minute buffer, and **Jump to live** returns to now. A pill on the position bar says how far behind live you are. See [Live TV](/guide/live-tv#in-freetvarr).

## New in Settings

Settings groups its pages as Preferences, System, and About. System holds the admin screens that used to be tabs: Health, Activity, Series rules, Folders, Recording log, and TVHeadend.

## Upgrading

Freetvarr 2.0 keeps the Docker image, the `.env` values, and your data. On the first start, Freetvarr adds two small tables to its database, for watched marks and the Notify me list. Nothing needs setting up again.
