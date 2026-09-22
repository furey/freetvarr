---
title: Migrating from Fetch
description: >-
  Moving from a Fetch TV box and Fetcharr to an HDHomeRun, TVHeadend, and
  Freetvarr, before the Fetch levy bites.
---

# Migrating from Fetch

Freetvarr is Fetcharr with the recorder swapped out. The web UI, the shows, the Plex pipeline, and the ad removal are the same; only the thing holding the tuner changed. If you ran Fetcharr, everything below is familiar except the first hour.

## The deadline

Fetch charges a one-off [Extended Service Levy](https://news.fetchtv.com.au/extended-service-levy-1) of `$29.99` per household to keep a Gen 3 box recording. The opt-out deadline is `2026-10-31`, the card on file is charged `2026-11-01`, and the service it buys ends `2027-10-31` with no statement about what follows. A suspended box loses both recording and playback of what it already holds, and the Gen 2 retirement in `2023` is the precedent: those boxes and their recordings became inaccessible. A replacement box is `$4.99` per month, forever. The levy buys 13 months; an aerial and a tuner you own buy the rest.

> [!WARNING]<br>
> Get your recordings off the box before `2026-11-01`. Nobody has tested whether a suspended box still serves files over the network, and finding out afterwards is not a plan.

## 1. Evacuate the box

Pull everything off the Fetch box with the [`fetchtv`](https://github.com/furey/fetchtv) CLI. It needs no account and no cloud; it browses the box on the LAN and downloads over HTTP:

```sh
npx fetchtv recordings --ip=<box-ip> --save=./downloads
```

Do this while the box still works. `fetchtv` is not retired and stays published for exactly this job.

## 2. Buy and wire the tuner

Order the HDHomeRun Flex Quatro and an F-to-PAL adapter; [Hardware](/guide/hardware) has the model numbers, the sourcing, and the wiring. Allow about a week for shipping from the US.

When it arrives, unplug the aerial lead from the Fetch box and plug it into the HDHomeRun through the adapter. If a masthead amplifier power injector sits in the chain, leave it there. Nothing else in the wall changes.

There is no parallel-running period. The aerial goes to one box or the other.

## 3. Set up TVHeadend

Follow [TVHeadend](/guide/tvheadend) end to end: container, wizard, tuner, mux scan for your transmitter, channel mapping, XMLTV guide, recording path, and a user for Freetvarr. Allow an evening. The mux scan and the guide linking are the slow parts.

## 4. Move Freetvarr in

Follow [Getting started](/guide/getting-started). Your Fetcharr database does not carry over; Freetvarr starts clean.

Recreate your follows on the Shows tab. The show names come from TVHeadend now, so the titles may differ slightly from Fetch's. Point each one at the folder it already used under your media root and nothing in Plex moves.

Re-set your series recordings from the [TV Guide](/guide/tv-guide). A Fetch series tag has no equivalent to import; a series in Freetvarr becomes a TVHeadend autorec rule, matching on title and channel.

## 5. Decide on the levy

Once Freetvarr has recorded a clean week off the HDHomeRun, unplug the Fetch box. Cancel the levy by `2026-10-31` and check the card on file is removed as well as the subscription.

If the replacement is not recording cleanly by then, paying the `$29.99` is cheap insurance for another 13 months. It buys time, not a solution.

## What changed

| | Fetcharr | Freetvarr |
| --- | --- | --- |
| Recorder | Fetch Mighty Gen 3 | TVHeadend + HDHomeRun |
| Guide | Fetch's cloud API | XMLTV, 7 days, free |
| Series recording | Fetch series tag | TVHeadend autorec rule (title + channel) |
| Getting the file | HTTP download from the box | Hardlink or copy from a shared folder |
| Deleting the source | Fetch cloud, WebSocket, often flaky | One TVHeadend API call, reliable |
| Ongoing cost | `$29.99`, then `$4.99`/month | `$0` |
