---
title: Syncs
description: >-
  Scheduled and manual sync passes over TVHeadend's finished recordings, and
  the history of what each one did.
---

# Syncs

A sync is one pass over TVHeadend's finished recordings: list them, match them against your followed shows, import anything new, then refresh Plex if something imported. The Syncs tab is the history of those passes.

![The Syncs tab](../img/screenshot-syncs.png)

## Dashboard sync deck

The dashboard's sync panel shows a status row of four cells over a pipeline strip.

- **`STATUS`**: `Idle`, or `Syncing` with an LED while a sync runs.
- **`LAST SYNC`**: the time since the last sync (`12 min ago`) with a dot for its outcome: ok, partial, or error. While a sync runs, the cell shows the elapsed time as `m:ss`. Hover for the sync number, time, and trigger. Press it to open the Syncs tab.
- **`RESULT`**: what the sync did (`3 imported`, `nothing new`), with failures in orange and any error text. A message such as a Sync now confirmation shows here under the label `NOTICE`.
- **`▶ SYNC NOW`**: runs a sync at once.

The panel header reads `NEXT SYNC · in N min`; hover for the cron rule. A sync with nothing to import finishes in under a second, so after you press `▶ SYNC NOW` the deck shows `SYNC` and `SYNCING…` for at least `1.5` seconds.

Below the row, the pipeline strip has four cells: `TVHEADEND`, `SHOWS`, `RECORDINGS 7D`, and `PLEX`, separated by dashed dividers. The `TVHEADEND` and `PLEX` cells link to their panels in Settings. On a phone both rows lay out as 2×2.

## Pull to refresh

In the iPhone Home Screen app, pull down from the top of a page to refresh it. A spinner of eight ticks fills in as you pull and spins once you pass the trigger distance. On release the page holds briefly, reloads the current page's data in place, then springs back. Filters and scroll position survive, because the page does not reload. A touch that starts on a favourite's drag handle never starts a pull.

Because a pull does not reload the app, a newly deployed build needs the app closed and reopened.

## Scheduled and manual

Set a schedule in Settings as a cron expression (the `* * * * *` timing string) and Freetvarr checks TVHeadend on that schedule; changing it takes effect without a restart. You can also Sync now for every enabled show at once, or for a single show from the [Shows tab](/guide/following-shows).

Only one sync runs at a time. Asking for a second while one is in flight returns the running one rather than starting another.

## Reading a sync

Each row shows what the pass did: imports, failures, removals, or nothing (empty). A sync is marked `ok` unless something failed. A short import (a `partial` recording) counts as a failure rather than a skip, so it stands out at a glance.

## History

Sync history keeps the latest 500 rows. Clear individual rows or the whole history from the tab, and filter by activity: `IMPORTS` / `FAILS` / `DELETES` / `EMPTY`.

Each finished sync also runs routine cleanup: it trims the history, drops tombstoned recordings older than 30 days, and removes expired `.orig` backups from ad cutting.
