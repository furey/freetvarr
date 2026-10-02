---
title: From Fetcharr
description: >-
  For former Fetcharr users: what carries over to Freetvarr, and what you
  set up again.
---

# From Fetcharr

If you ran [Fetcharr](https://github.com/furey/fetcharr) against a Fetch TV box, the notes below cover the move. If you never used Fetcharr, read [Leaving Fetch TV](/guide/leaving-fetch) instead; it covers the levy, saving your recordings, the tuner, and cancelling.

Freetvarr is Fetcharr with the recorder swapped out. The web UI, the shows, the Plex pipeline, and the ad removal are the same. TVHeadend and a TVHeadend-compatible tuner replace the Fetch box.

## The database

Your Fetcharr database does not carry over; Freetvarr starts clean. Set up TVHeadend and Freetvarr as in [Leaving Fetch TV](/guide/leaving-fetch#setting-up), then come back here.

## Follows

Recreate your follows on the Shows tab. The show names now come from TVHeadend, so a title can differ slightly from Fetch's. Point each show at the folder it already uses under your media root, and nothing in Plex moves.

## Series recordings

Set your series recordings again from the [TV Guide](/guide/tv-guide). A Fetch series tag has nothing to import into. A series in Freetvarr is a TVHeadend autorec rule that matches on title and channel.

## What changed

|                     | Fetcharr                                     | Freetvarr                                |
| ------------------- | -------------------------------------------- | ---------------------------------------- |
| Recorder            | Fetch Mighty Gen 3                           | TVHeadend + a TVHeadend-compatible tuner |
| Guide               | Fetch's cloud API                            | XMLTV, 7 days, free                      |
| Series recording    | Fetch series tag                             | TVHeadend autorec rule (title + channel) |
| Getting the file    | HTTP download from the box                   | Hardlink or copy from a shared folder    |
| Deleting the source | Fetch cloud, WebSocket, often flaky          | One TVHeadend API call, reliable         |
| Ongoing cost        | `$29.99` levy, or a new box at `$4.99`/month | `$0`                                     |
