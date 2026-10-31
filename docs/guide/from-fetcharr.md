---
title: From Fetcharr
description: >-
  For former Fetcharr users: what carries over to Freetvarr, and what you
  set up again.
---

# From Fetcharr

If you ran [Fetcharr](https://github.com/furey/fetcharr) against a Fetch TV box, the notes below cover the move. If you never used Fetcharr, read [Leaving Fetch TV](/guide/leaving-fetch) instead. That page covers the levy, saving your recordings, the tuner, and cancelling.

Freetvarr is Fetcharr with the recorder swapped out. The series folders, the filing of episodes into your media library, and the ad removal work the same way. TVHeadend and a TVHeadend-compatible tuner replace the Fetch box.

## The database

Your Fetcharr database does not carry over. Freetvarr starts with an empty database. Install Freetvarr and run its [setup](/guide/getting-started#_2-run-setup) as in [Leaving Fetch TV](/guide/leaving-fetch#setting-up). Setup sets up TVHeadend too. Then come back here.

## Series folders

Recreate each series folder in Settings → RECORDING → [Series rules](/guide/series). The titles now come from TVHeadend, so a title can differ slightly from Fetch's. Point each series at the folder it already uses under your media root (the folder where Freetvarr files TV episodes; see [Configuration](/guide/configuration#the-two-recordings-paths)), and nothing in your media library moves. When you press **Record series** for a title with no series folder yet, Freetvarr uses a show folder of the same name under the media root, or the one folder with that name plus a year or country (e.g. `Bluey (2018)`), and creates a new folder only when neither exists. For a title with no series recording, use **Add title** in Settings → RECORDING → [Title matches](/guide/series#title-matches).

## Series recordings

In Freetvarr's [TV guide](/guide/tv-guide), pick **Every episode** and press **Record series** on each series again. A Fetch series tag has nothing to import into. A series recording in Freetvarr is a TVHeadend autorec entry (an automatic recording rule) that matches on title and channel.

## What changed

|                     | Fetcharr                                     | Freetvarr                                 |
| ------------------- | -------------------------------------------- | ----------------------------------------- |
| Recorder            | Fetch Mighty Gen 3                           | TVHeadend + a TVHeadend-compatible tuner  |
| Guide               | Fetch's cloud API                            | XMLTV, 7 days, free                       |
| Series recording    | Fetch series tag                             | TVHeadend autorec entry (title + channel) |
| Getting the file    | HTTP download from the box                   | Hardlink or copy from a shared folder     |
| Deleting the source | Fetch cloud, WebSocket, often flaky          | One TVHeadend API call, reliable          |
| Ongoing cost        | `$29.99` levy, or a new box at `$4.99`/month | `$0`                                      |
