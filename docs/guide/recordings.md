---
title: Recordings
description: >-
  The per-episode record: import outcomes, live progress bars, re-scans, and
  markers for recordings removed from TVHeadend.
---

# Recordings

The Recordings tab lists every import Freetvarr has attempted, and how each one turned out.

![The Recordings tab](../img/screenshot-recordings.png)

## Statuses

- **done**: imported, and the file on disk matches the size TVHeadend reported.
- **partial**: the imported file came up more than `1 MB` short. The next sync redoes it.
- **skipped**: there was nothing to import. Either TVHeadend has no file for the entry yet (it's still recording, or the recording failed), or the path it reported sits outside the recordings folder Freetvarr can see. The error text says which.
- **failed**: the import hit an error.

With ad removal on, an ad status also appears: `scanning`, `detected`, `no_breaks`, `cut`, `detect_failed`, or `cut_failed`. See [Ad removal](/guide/ad-removal).

> [!NOTE]<br>
> A recording still in progress shows as `skipped`. The next sync after TVHeadend finishes it imports it, up to ten minutes after the programme ends because of the padding.

## Live progress

A hardlink import is instant. A copy between filesystems, an ad scan, or a cut takes longer, so the row shows its progress and the time left.

## Re-scan and re-cut

Re-run an ad scan or cut on a file you have already imported. This does not touch TVHeadend.

## Tombstones

A recording removed from TVHeadend shows struck through (a tombstone). The file is still in your Plex library, so you can still re-scan or re-cut it. Tombstones leave the list 30 days after the removal.

## Failed rows

You can delete a `failed` row from Freetvarr's history once the recording is no longer in TVHeadend. If the recording is still in TVHeadend, the next sync imports it again and the row comes back.

## Filters and time

Filter by `ON TVHEADEND` or `DELETED`, or by time with `WHEN`. Times show in the container's time zone (`TZ`), whatever device you browse from.
