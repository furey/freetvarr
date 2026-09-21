---
title: Delete from TVHeadend
description: >-
  Optional delete-after-import, once Plex confirms the file, through
  TVHeadend's DVR API.
---

# Delete from TVHeadend

Once an episode is in Plex, the copy in TVHeadend's recordings folder is dead weight. freetvarr can remove it, but only after Plex has the file. It's optional, and set per show.

## How it works

freetvarr calls TVHeadend's `dvr/entry/remove` endpoint with the recording's ID. TVHeadend deletes both its own entry and the file on disk, so the folder doesn't fill up with orphans. There's no cloud service in the path and no second account to hold; it's one authenticated call on your LAN.

If you're coming from fetcharr, this is the part that finally works. The Fetch box advertised a delete action and then refused every request for it, so fetcharr had to route deletes through Fetch's cloud and wait on a handshake that often timed out. None of that applies here.

## Turn it on

Delete-after-import is a per-show switch on the Shows tab. Turn it on for shows you're happy to keep only in Plex; leave it off for anything you want a second copy of.

## When it deletes

A delete is queued only after Plex confirms the imported file. Two guards sit in front of it:

- **The Plex guard.** If the Plex refresh was attempted and failed, the delete is skipped and the recording stays put. Turn this off with the `delete_after_plex_refresh_only` setting if you run without Plex.
- **The cut guard.** For a `CUT`-mode show, the TVHeadend copy is the last untouched original once freetvarr has rewritten the local file. The delete waits for the cut to verify; a failed cut keeps the original ([Ad removal](/guide/ad-removal)).

Deleted recordings show as tombstones in [Recordings](/guide/recordings): struck through, dimmed, still re-scannable, and dropped from the list 30 days later.

## If a delete fails

- **"Recording not in TVHeadend's finished list"** means the entry has already gone, usually because you deleted it in TVHeadend's own UI. Nothing to fix; the row stays as it is.
- **An HTTP `401` or `403`** means the freetvarr user lacks DVR rights. Add them under **Configuration → Users → Access Entries**; see [TVHeadend](/guide/tvheadend#_8-make-a-user-for-freetvarr).
- **A file that won't disappear** is a permissions problem, not an API one. TVHeadend deletes the file as its own user, so check `PUID`/`PGID` match across both containers.
