---
title: Remove from TVHeadend
description: >-
  Optional remove-after-import, once Plex confirms the file, through
  TVHeadend's DVR API.
---

# Remove from TVHeadend

Once an episode is in your library, you no longer need the copy in TVHeadend's recordings folder. Freetvarr can remove it after Plex has the file. This is optional, and you turn it on per show.

## How it works

Freetvarr deletes the recording file and keeps TVHeadend's entry for it. That entry is how TVHeadend knows the episode is already recorded. Before a series recording records a repeat, TVHeadend's duplicate check looks for an earlier entry with the same episode. If the entry is gone, TVHeadend records the repeat, and the next sync imports the same episode again.

For each recording, Freetvarr makes these calls to TVHeadend's DVR API, in this order:

1. `idnode/delete` on any re-record TVHeadend has scheduled for the recording ([Re-records](#re-records)).
2. `idnode/save` sets the entry's **DVR log retention** to `Forever`. The entry otherwise takes the DVR profile's **Recording info retention period**, which defaults to `On file removal` and drops the entry as soon as the file goes.
3. `dvr/entry/prevrec/set` marks the entry as previously recorded. The mark survives a TVHeadend restart and stops TVHeadend from re-recording the entry.
4. `dvr/entry/remove` deletes the file. The entry moves to TVHeadend's **Removed Recordings** tab.

These calls go straight to TVHeadend on your LAN, with no cloud service involved.

## Re-records

A TVHeadend DVR profile can re-record a recording that has too many data errors. TVHeadend then schedules the next broadcast of the same episode as a child entry of the first recording. Freetvarr still imports the first recording and shows the errors as a warning on the Recorded step. Once that import succeeds, the re-record is unwanted, so Freetvarr deletes the child entry before it touches the parent. On TVHeadend `4.3-2794~g5ce3ff63c`, a parent removed while its re-record was still scheduled was followed by a TVHeadend crash; deleting the child first avoids that state.

## Duplicate detection

Freetvarr's series recordings use the TVHeadend `Record if different episode number` setting. The kept entries let that setting skip a repeat of an imported episode. The setting needs an episode number on both sides: a repeat that the EPG lists without one still records, and Freetvarr imports it again.

To let TVHeadend record an episode again, delete its entry in the **Removed Recordings** tab. The entries hold no video, so they use almost no disk.

## Turn it on

Remove after import is a per-series switch on the [SERIES tab](/guide/series#edit-a-series-folder). Turn it on for series you are happy to keep only in your library; leave it off for anything you want a second copy of.

## When it removes

Freetvarr removes a recording only after Plex confirms the imported file, and only when both of these checks pass:

- **The Plex guard.** If the Plex refresh was attempted and failed, the remove is skipped and the recording stays put. To turn this off, switch off **Wait for Plex before removing recordings from TVHeadend** in Settings → PLEX.
- **The cut guard.** For a `CUT`-mode show, the TVHeadend copy is the last untouched original once Freetvarr has rewritten the local file. The remove waits for the cut to verify; a failed cut keeps the original ([Ad removal](/guide/ad-removal)).

Removed recordings stay in [Recordings](/guide/recordings#not-in-tvheadend), marked `NOT IN TVHEADEND`, for 30 days.

## If a remove fails

- **"Recording not in TVHeadend's finished list"** means the entry has left TVHeadend's **Finished Recordings** tab, usually because you removed or deleted it in TVHeadend's own UI. Nothing to fix; the row stays as it is.
- **An HTTP `401` or `403`** means the Freetvarr user lacks DVR rights. Tick **Video recorder** `Basic` and `Manage all` under **Configuration → Users → Access Entries**; `Manage all` covers recordings another user scheduled. See [TVHeadend](/guide/tvheadend#_8-make-a-user-for-freetvarr).
- **A file that won't disappear** is a permissions problem, not an API one. TVHeadend deletes the file as its own user, so check `PUID`/`PGID` match across both containers.
