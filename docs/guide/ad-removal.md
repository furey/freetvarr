---
title: Ad removal
description: >-
  Optional comskip commercial detection and keyframe stream-copy cutting, with
  a detect-only audit mode.
---

# Ad removal

Free-to-air recordings come with their ad breaks. freetvarr can find those breaks, and optionally cut them out, using comskip (an ad-detection tool) and ffmpeg, both bundled in the image. It's off by default, and built on the assumption that detection is sometimes wrong.

> [!WARNING]<br>
> Detection accuracy varies channel by channel on Australian free-to-air. Run `DETECT` mode first and check the breaks it reports before you let it `CUT`.

## Turn it on

Turn on the master switch in Settings → AD REMOVAL (off by default), then pick a per-show mode on the Shows tab; both have to be on.

## Modes

- **DETECT** notes where the breaks are and saves that against the recording, without touching the file. Use it to check how accurate comskip is on your channels.
- **CUT** removes the breaks by copying the video across untouched (no re-encoding; the output stays `.ts`) and keeps the original as `<file>.ts.orig`.

## Backups and retention

Every cut keeps a `.ts.orig` backup for a window you choose (`ad_original_retention_days`, default 7), then routine cleanup removes it. If a cut goes wrong, rename the `.orig` back over it to recover the original.

## The comskip.ini

freetvarr ships a `comskip.ini` tuned for AU free-to-air. Drop your own `comskip.ini` into the `/config` bind mount to override it; Settings shows which one is active.

## Cost and gating

Scans work the CPU hard: budget roughly 30 minutes per 75-minute recording on NAS-class hardware. The scan runs at low priority so it doesn't starve a concurrent import. For a `CUT`-mode show, delete-from-TVHeadend is only queued once the cut verifies, so TVHeadend keeps the untouched copy if a cut fails.

Cuts snap to keyframes, so a second or two either side of a break is expected. The full pipeline (verify-then-swap, keep-segment maths, crash recovery) is in the [deep dive](/deep-dive#ad-removal).
