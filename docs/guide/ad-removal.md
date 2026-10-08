---
title: Ad removal
description: >-
  Optional comskip commercial detection and keyframe stream-copy cutting, with
  a detect-only audit mode.
---

# Ad removal

Free-to-air recordings come with their ad breaks. Freetvarr can find those breaks, and optionally cut them out, using comskip (an ad-detection tool) and ffmpeg, both bundled in the Freetvarr Docker image. Ad removal is off by default. Detection is sometimes wrong, so Freetvarr keeps the original of every cut.

> [!WARNING]<br>
> Detection accuracy varies channel by channel, because every broadcaster cuts its breaks differently. Set a series to `DETECT` mode first, and check the breaks Freetvarr reports on the Recordings tab before you switch the series to `CUT`.

## Turn it on

In Freetvarr, turn on ad removal in **Settings → AD REMOVAL**, then press **SAVE SETTINGS**. Then, on the [SERIES tab](/guide/series#edit-a-series-folder), press **EDIT** on each series, pick a mode under **Ad removal**, and press **SAVE**. Ad removal runs only when both the Settings switch and the series mode are on.

## Modes

- **DETECT** leaves the video as it is. It saves where the breaks are against the recording, and in a `.edl` file beside the video (for example `Show - S01E02.edl` next to `Show - S01E02.ts`). Use it to check how accurate comskip is on your channels, or to skip the ads instead of cutting them.
- **CUT** removes the breaks by copying the video across untouched (no re-encoding; the output stays `.ts`) and keeps the original as `<file>.ts.orig`.

## Skip instead of cut

A cut that goes wrong loses part of the show. A skip that goes wrong costs nothing (you rewind). `DETECT` gives you skips in the players that read the `.edl` file:

- **Kodi** skips each break once, by itself, when it plays the video from your library folder. Rewind to watch a break.
- **Jellyfin** needs a plugin that reads `.edl` files (e.g. [EDL to Media Segments](https://github.com/VTRunner/EdlToMediaSegments)), then shows the breaks as commercials you can skip.
- **Plex**, **VLC**, and **Infuse** do not read `.edl` files. Plex skips ads only in recordings made by its own DVR. For these players, use `CUT`.

**Freetvarr's own player** also reads the `.edl` file. While you watch a recording inside a break, a **SKIP AD** button appears at the bottom right of the picture. Press it to jump to the end of the break. Freetvarr never skips by itself. A recording with no `.edl` file, or one cut by `CUT` mode, shows no button.

If you rename or move a video by hand, rename or move its `.edl` with it. A later `CUT` or a scan that finds no breaks deletes the `.edl`.

## Backups and retention

Every cut keeps a `.ts.orig` backup for a window you choose (`ad_original_retention_days`, default 7), then the cleanup after each sync removes it. If a cut goes wrong, rename the `.orig` file back over the cut file to recover the original.

## The comskip.ini

Freetvarr ships a `comskip.ini` tuned for Australian free-to-air, the author's own channels. It is an example, not a requirement. To use your own, put a `comskip.ini` in the `/config` bind mount (`${CONFIG_PATH}/freetvarr` on the host). Settings shows which file is in use.

## Cost and gating

Scans work the CPU hard: budget roughly 30 minutes per 75-minute recording on NAS-class hardware (the author's measurement on a dual-core Celeron; faster CPUs finish sooner). Scans run at low priority, so imports still run at full speed. For a `CUT`-mode show, Freetvarr removes the TVHeadend copy only after the cut passes its checks, so a failed cut leaves the original in TVHeadend.

Cuts snap to keyframes, so a second or two either side of a break is expected. The full pipeline (verify-then-swap, keep-segment maths, crash recovery) is in the [deep dive](/deep-dive#ad-removal).
