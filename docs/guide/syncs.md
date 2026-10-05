---
title: Syncs
description: >-
  Scheduled and manual sync passes over TVHeadend's finished recordings, and
  the history of what each one did.
---

# Syncs

A sync is one pass over TVHeadend's finished recordings: list them, match them against your series folders, import anything new, then refresh Plex if something imported. The Syncs tab is the history of those passes.

![The Syncs tab](../img/screenshot-syncs.png)

## Dashboard sync deck

The dashboard shows whether a sync is running, when the last one ran and what it did, and when the next one is due. Press `SYNC NOW` to run one at once, or press `LAST SYNC` to open the Syncs tab.

## Pull to refresh

In the iPhone Home Screen app, pull down from the top of a page to reload its data. Filters and scroll position stay as they were. A pull does not reload the app itself, so after you deploy a new build, close and reopen the app.

## Scheduled and manual

Set a schedule in Settings as a cron expression (the `* * * * *` timing string) and Freetvarr checks TVHeadend on that schedule; changing it takes effect without a restart. You can also Sync now for every series and title match at once, or for a single series from the [SERIES tab](/guide/series#series-rows).

Only one sync runs at a time. A second request while one runs returns the running sync.

## Reading a sync

Each row shows what the pass did: imports, failures, removals, or nothing (empty). A sync is marked `ok` unless something failed. A short import (a `partial` recording) counts as a failure, not a skip.

## History

Sync history keeps the latest 500 rows. Clear individual rows or the whole history from the tab, and filter by activity: `IMPORTS` / `FAILS` / `DELETES` / `EMPTY`.

After each sync, Freetvarr trims the history, drops removed recordings older than 30 days, and deletes expired `.orig` backups from ad cutting.
