---
title: Recordings
description: >-
  Every finished recording with its image, channel, and import outcome, plus
  live progress bars, re-scans, and markers for recordings removed from
  TVHeadend.
---

# Recordings

The Recordings tab lists every recording TVHeadend has finished, with its programme image, channel, and air time, and what Freetvarr did with it.

Freetvarr saves each programme image while the recording is still scheduled, because guide image links often stop working once the programme has aired. A recording with no saved image shows its channel logo.

![The Recordings tab](../img/screenshot-recordings.png)

## Statuses

- **done**: imported, and the file on disk matches the size TVHeadend reported.
- **partial**: the imported file came up more than `1 MB` short. The next sync redoes it.
- **skipped**: there was nothing to import. Either TVHeadend has no file for the entry yet (it's still recording, or the recording failed), or the path it reported sits outside the recordings folder Freetvarr can see. The error text says which.
- **failed**: the import hit an error.
- **not imported**: Freetvarr left the recording in TVHeadend. You recorded it with **ADD TO LIBRARY** off, or it matches no show rule and **IMPORT EVERY RECORDING** is off in Settings. Press **IMPORT** to add it to the library at once.

With ad removal on, an ad status also appears: `scanning`, `detected`, `no_breaks`, `cut`, `detect_failed`, or `cut_failed`. See [Ad removal](/guide/ad-removal).

> [!NOTE]<br>
> A recording still in progress shows as `skipped`. The next sync after TVHeadend finishes it imports it, up to ten minutes after the programme ends because of the padding.

## Playback

Press **PLAY** on a finished recording to watch it in Freetvarr's player, in any browser, on a phone or a computer. The player uses the imported file, or the TVHeadend copy when the recording is not imported. Freetvarr remembers where you stopped and starts there next time, with a button to start over. On an iPhone, AirPlay sends it to an Apple TV.

The player converts the file as it plays, the same way it converts [live TV](/guide/live-tv#stream-handling), so live channels and recordings share the `LIVE_TV_MAX_SESSIONS` limit. A recording still in progress cannot be played until it finishes. On the TV itself, a media player that reads your library (Plex, Jellyfin, Kodi, or Infuse) is still the better way to watch.

## Live progress

A hardlink import is instant. A copy between filesystems, an ad scan, or a cut takes longer, so the row shows its progress and the time left.

## Re-scan and re-cut

Re-run an ad scan or cut on a file you have already imported. This does not touch TVHeadend.

## Tombstones

A recording removed from TVHeadend shows struck through (a tombstone). The file is still in your Plex library, so you can still re-scan or re-cut it. Tombstones leave the list 30 days after the removal.

## Failed rows

You can delete a `failed`, `skipped`, or `not imported` row from Freetvarr's history. If the recording is still in TVHeadend and the next sync would import it, the row comes back.

## Filters and time

Filter by `ON TVHEADEND` or `DELETED`, or by time with `WHEN`. Times show in the time zone chosen in Settings (or `TZ` from your `.env` until you choose one), whatever device you browse from.
