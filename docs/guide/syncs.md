---
title: Syncs
description: >-
  Scheduled and manual sync passes over TVHeadend's finished recordings, and
  the history of what each one did.
---

# Syncs

A sync is one pass over TVHeadend's finished recordings: list them, match them against your series folders, import anything new, then refresh Plex if you use it and something imported. The Syncs tab is the history of those passes.

<!-- markdownlint-disable MD033 -->
<BrowserFrame label="http://freetvarr.lan/#/syncs">
  <img src="../img/screenshot-syncs.png" alt="The Syncs tab" width="2560" height="1872" loading="lazy">
</BrowserFrame>
<!-- markdownlint-enable MD033 -->

## Dashboard sync deck

The dashboard shows whether a sync is running, when the last one ran and what it did, and when the next one is due. Press `SYNC NOW` to run one at once, or press `LAST SYNC` to open the Syncs tab.

## Pull to refresh

In the Freetvarr Home Screen app on an iPhone, pull down from the top of a page to reload its data. Filters and scroll position stay as they were. A pull does not reload the app itself, so after you update Freetvarr, close and reopen the Home Screen app.

## Scheduled and manual

Choose how often Freetvarr checks TVHeadend in Settings → SCHEDULE, with **Sync schedule**: `Every 15 minutes`, `Every 30 minutes` (the default), `Every hour`, or `Custom`. `Custom` opens a field for a cron expression (the `* * * * *` timing string), such as `0 */2 * * *` for every two hours. A saved change takes effect without a restart. You can also press `SYNC NOW` on the dashboard to sync every series and title match at once, or press **SYNC** on a single series in the [SERIES tab](/guide/series#series-rows).

Only one sync runs at a time. A second request while one runs returns the running sync.

## Reading a sync

Each row shows what the pass did: imports, failures, removals, or nothing (empty). A sync is marked `ok` unless something failed. A short import (a `partial` recording) counts as a failure, not a skip.

## History

Sync history keeps the latest 500 rows. The tab shows 50 per page (press `PREV` and `NEXT` to see older syncs). Clear individual rows or the whole history from the tab, and filter by activity: `MANUAL` / `CRON` / `IMPORTS` / `FAILS` / `REMOVALS` / `EMPTY`.

After each sync, Freetvarr trims the history, drops removed recordings older than 30 days, and deletes expired `.orig` backups from ad cutting.
