---
title: Ad removal
description: >-
  Optional comskip commercial detection and keyframe stream-copy cutting, with
  a detect-only audit mode.
---

# Ad removal

Free-to-air recordings come with their ad breaks. Freetvarr can find those breaks, and optionally cut them out, using comskip (an ad-detection tool) and ffmpeg, both bundled in the image. It is off by default. Detection is sometimes wrong, so Freetvarr keeps the original of every cut.

> [!WARNING]<br>
> Detection accuracy varies channel by channel, because every broadcaster cuts its breaks differently. Run `DETECT` mode first and check the breaks it reports before you let it `CUT`.

## Turn it on

Turn on ad removal in Settings → AD REMOVAL, then pick a mode for each show on the Shows tab. Both must be on.

## Modes

- **DETECT** notes where the breaks are and saves that against the recording, without touching the file. Use it to check how accurate comskip is on your channels.
- **CUT** removes the breaks by copying the video across untouched (no re-encoding; the output stays `.ts`) and keeps the original as `<file>.ts.orig`.

## Backups and retention

Every cut keeps a `.ts.orig` backup for a window you choose (`ad_original_retention_days`, default 7), then routine cleanup removes it. If a cut goes wrong, rename the `.orig` back over it to recover the original.

## The comskip.ini

Freetvarr ships a `comskip.ini` tuned for Australian free-to-air, the author's own channels. It is an example, not a requirement. To use your own, put a `comskip.ini` in the `/config` bind mount. Settings shows which file is in use.

## Cost and gating

Scans work the CPU hard: budget roughly 30 minutes per 75-minute recording on NAS-class hardware (the author's measurement on a dual-core Celeron; faster CPUs finish sooner). Scans run at low priority, so imports still run at full speed. For a `CUT`-mode show, Freetvarr removes the TVHeadend copy only after the cut passes its checks, so a failed cut leaves the original in TVHeadend.

Cuts snap to keyframes, so a second or two either side of a break is expected. The full pipeline (verify-then-swap, keep-segment maths, crash recovery) is in the [deep dive](/deep-dive#ad-removal).
