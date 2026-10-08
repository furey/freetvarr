---
title: Recordings
description: >-
  Every finished recording with its image, channel, and import outcome, plus
  live progress bars, re-scans, and a marker for recordings no longer in
  TVHeadend.
---

# Recordings

The Recordings tab lists every recording TVHeadend has finished, with its programme image, channel, and air time, and what Freetvarr did with it.

Freetvarr saves each programme image while the recording is still scheduled, because guide image links often stop working once the programme has aired. A recording with no saved image shows its channel logo.

<!-- markdownlint-disable MD033 -->
<BrowserFrame label="http://freetvarr.lan/#/recordings">
  <img src="../img/screenshot-recordings.png" alt="The Recordings tab" width="2560" height="1872" loading="lazy">
</BrowserFrame>
<!-- markdownlint-enable MD033 -->

## Statuses

- **imported**: the file on disk matches the size TVHeadend reported.
- **partial**: the imported file came up more than `1MB` short. The next sync redoes it.
- **skipped**: there was nothing to import. Either TVHeadend has no file for the entry yet (it's still recording, or the recording failed), or the path it reported sits outside the recordings folder Freetvarr can see. The error text says which.
- **failed**: the import hit an error.
- **not imported**: Freetvarr left the recording in TVHeadend. You recorded it with **ADD TO LIBRARY** off, or it matches no series folder and **IMPORT EVERY RECORDING** is off in Settings. Press **IMPORT** to add it to the library at once.

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

The ad scan button is greyed out when the library file is gone, for example after another app replaced or removed it.

## Not in TVHeadend

A recording that TVHeadend has deleted shows a `NOT IN TVHEADEND` marker next to its status. Hover over the marker to see when TVHeadend deleted it. The episode is still in your library, so you can play it, scan it for ads, or cut it again.

These rows leave the list 30 days after the removal. To remove them sooner, press **Clear from list**; it asks first and gives the number of rows it hides, across every page and filter. For 10 seconds after a clear, **Undo** puts the rows back. To remove one row, press its delete button. Both remove rows from the list only; the files stay in your library.

## Failed rows

You can delete a `failed`, `skipped`, or `not imported` row from Freetvarr's history. If the recording is still in TVHeadend and the next sync would import it, the row comes back.

## Filters and time

Filter by `IN TVHEADEND` or `NOT IN TVHEADEND`, or by time with `WHEN`. Times show in the time zone chosen in Settings (or `TZ` from your `.env` until you choose one), whatever device you browse from.
