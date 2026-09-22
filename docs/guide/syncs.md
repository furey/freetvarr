---
title: Syncs
description: >-
  Scheduled and manual sync passes over TVHeadend's finished recordings, and
  the history of what each one did.
---

# Syncs

A sync is one pass over TVHeadend's finished recordings: list them, match them against your followed shows, import anything new, then refresh Plex if something imported. The Syncs tab is the history of those passes.

![The Syncs tab](../img/screenshot-syncs.png)

## Scheduled and manual

Set a schedule in Settings as a cron expression (the `* * * * *` timing string) and Freetvarr checks TVHeadend on that schedule; changing it takes effect without a restart. You can also Sync now for every enabled show at once, or for a single show from the [Shows tab](/guide/following-shows).

Only one sync runs at a time. Asking for a second while one is in flight returns the running one rather than starting another.

## Reading a sync

Each row shows what the pass did: imports, failures, deletes, or nothing (empty). A sync is marked `ok` unless something failed. A short import (a `partial` recording) counts as a failure rather than a skip, so it stands out at a glance.

## History

Sync history keeps the latest 500 rows. Clear individual rows or the whole history from the tab, and filter by activity: `IMPORTS` / `FAILS` / `DELETES` / `EMPTY`.

Each finished sync also runs routine cleanup: it trims the history, drops tombstoned recordings older than 30 days, and removes expired `.orig` backups from ad cutting.
