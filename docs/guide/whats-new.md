---
title: What's new in 2.0
description: >-
  The Freetvarr 2.0 redesign: five destinations, a Home page with suggestions,
  shows with their own pages, a new player with Multiview, Scheduled
  recordings with tuners, and where each old screen went.
---

# What's new in 2.0

## 2.0.0

Freetvarr 2.0 redesigns the app around five destinations: **Home**, **Live TV**, **TV guide**, **Recordings**, and **Settings**. Your recordings, series rules, folders, settings, and sync history carry over.

### Navigation

On a phone, a tab bar at the bottom holds the five destinations. On a tablet or computer, a rail down the left side holds them, with Settings at the bottom. The page title is the header, so there is no separate brand bar.

Each page header has **Search**, which finds a show by its title, a nickname, its initials, or a close spelling, and a recording chip while TVHeadend records, for example `Recording The Block`. See [Home and search](/guide/home).

When a check fails, a dot shows on the Settings icon, and a red problem also shows an alert on Home. See [Health badge](/guide/doctor#health-badge).

### Where each screen went

| Before                                  | Now                                                                                                                         |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Dashboard                               | [Home](/guide/home)                                                                                                         |
| LIVE TV tab                             | [Live TV](/guide/live-tv)                                                                                                   |
| TV GUIDE tab                            | [TV guide](/guide/tv-guide)                                                                                                 |
| `UPCOMING` view in the TV Guide         | Recordings → [Scheduled](/guide/recordings#scheduled)                                                                       |
| RECORDINGS tab                          | Recordings → [Library](/guide/recordings#library), and Settings → System → [Recording log](/guide/recordings#recording-log) |
| SERIES tab                              | Settings → System → [Series rules](/guide/series) and [Folders](/guide/series#title-matches)                                |
| SYNCS tab                               | Settings → System → [Activity](/guide/syncs)                                                                                |
| Doctor, and `SYNC NOW` on the dashboard | Settings → System → [Health](/guide/doctor)                                                                                 |
| SETTINGS tab                            | [Settings](/guide/settings), grouped as Preferences, System, and About                                                      |

### Old links still work

A bookmark to an old address opens the new page:

| Old address                                                          | Opens                                                    |
| -------------------------------------------------------------------- | -------------------------------------------------------- |
| `#/dashboard`                                                        | Home                                                     |
| `#/series` and `#/shows`                                             | Settings → System → Series rules                         |
| `#/series/<title>`                                                   | The show page for that title                             |
| `#/syncs` and `#/syncs/<number>`                                     | Settings → System → Activity                             |
| `#/doctor`                                                           | Settings → System → Health                               |
| `#/recordings?status=failed` and other filtered `#/recordings` links | Settings → System → Recording log, with the same filters |

### Home

- **Highlights**: up to five slides at the top of Home, such as the episode to carry on with, a new episode, what records now, and a suggestion. Each slide has its own buttons, such as **Resume**, **Watch live**, or **Record series**.
- **For you**: suggestions from the next week of the TV guide, made on your own computer from what you record and watch. Home has a **For you** row, and **See all** opens the For you page. Suggestions start once Freetvarr knows about five of your shows; until then the row lists what is new this week. Settings → **Suggestions** turns them off, picks how much processor time they use, and pauses or clears your viewing history. See [For you](/guide/for-you).
- **New recordings**, **On now**, and **Recording tonight** rows. See [Home and search](/guide/home#rows).

### Recordings

Recordings has two views: **Library** and **Scheduled**.

- **Library** shows your recordings as posters, grouped as Shows, Movies, and Specials and one-offs. A banner at the top lists recent failures, with a **Review** link to the Recording log.
- **Show pages** list the episodes of one show, with a **Play** or **Resume** button, the next airing, and a status line for its series recording. Press an episode row to play it.
- **⋯ menus** on each show and episode hold the actions in one place: play, mark as watched or unwatched, recording options, show and episode info, **Open in Plex**, **Refresh artwork**, and delete. See [Show menu](/guide/recordings#show-menu) and [Episode menu](/guide/recordings#episode-menu).
- **Delete** removes the episode from your library and its recording from TVHeadend, then refreshes Plex. A dialog lists what it deletes, with the size, before anything changes. See [Delete episodes](/guide/recordings#delete-episodes).
- **Select** on a show page marks or deletes several episodes at once.
- **Recording options** holds the channels, how many episodes to keep, the start and finish padding, ad removal, and pause. Under **Advanced**, **Also known as** adds your own names for a show to search. See [Recording options](/guide/recordings#recording-options).
- **Scheduled** lists what records now, today, tomorrow, and later this week, with a strip of the week's days. On a wide screen, a timeline shows what each tuner records and warns when two recordings need more tuners than you have. It replaces the `UPCOMING` view. See [Scheduled](/guide/recordings#scheduled).

### TV guide

The programme sheet has a third choice beside **This episode** and **Every episode**: **Notify me**. Freetvarr lists the show under **Watching for** in Scheduled whenever it is in the TV guide. For a show that is not in the next 7 days, search for its title and press **Watch for**. Turn on **Record when it appears** to start an any-channel series recording, with your start and finish padding, the first time the show is in the TV guide. See [Notify me](/guide/tv-guide#notify-me).

**Add to library** now has a default. Set it in Settings → Library and Plex. The programme sheet shows the choice under **Advanced**, so you can change it for one recording.

### Player

Live TV and recordings play in one full-screen player with its own controls. See [Player](/guide/player).

- **Start over** on live TV offers **From the start**, which plays a programme TVHeadend is recording from its first minute, and **Back to when you tuned in**. **Go live** returns to now.
- **Sound** and **Muted** in the top bar, and the `m` key, switch the sound. Settings → **Player** has **Start muted** and how soon the controls hide.
- **Miniplayer** shrinks the player to a bar or a corner card, so you can browse Freetvarr while you watch.
- **Pop out (picture in picture)** and **Captions** are in the **⋯** menu.
- On a phone, turning the phone sideways goes full screen.
- **Multiview** plays two live channels at once, **Side by side** or **Big and small**, with one sound button for each picture. The channel list says which channels need a free tuner.
- **Live streams at once**, in Settings → Recording, sets whether Freetvarr plays one or two live streams. Freetvarr measures what your computer can manage and sets the default for you.

### Settings

Settings groups its pages as Preferences, System, and About. System holds the admin screens that used to be tabs: Health, Activity, Series rules, Folders, Recording log, and TVHeadend. Preferences adds **Player** and **Suggestions**. See [Settings](/guide/settings).

### Upgrading

Freetvarr 2.0 keeps the Docker image name, the `.env` values, and your data. On the first start, Freetvarr adds tables to its database for watched marks, the Notify me list, your viewing history, suggestions, and the extra show names that search uses. Nothing needs setting up again.

If you set `LIVE_TV_MAX_SESSIONS` in your `.env`, it is now the upper limit for **Live streams at once**. Without it, Freetvarr picks the number from a measurement of your computer.
