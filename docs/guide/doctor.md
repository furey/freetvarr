---
title: Doctor
description: >-
  A read-only health check of TVHeadend, the guide, the folders, Plex, live TV,
  and the host, with the fix for each problem it finds.
---

# Doctor

The Doctor checks the parts Freetvarr depends on and says what to fix. Open it from **Settings → HEALTH CHECK → RUN DOCTOR**, from the TVHEADEND cell on the dashboard when TVHeadend does not answer, or at `#/doctor` in the address bar.

The Doctor only reads. It sends `GET` requests to TVHeadend and Plex, and it looks at folders without writing to them. It never saves settings, changes TVHeadend, refreshes Plex, or starts a test encode.

Each check gets one of these results:

- **Pass**: nothing to do.
- **Warn**: Freetvarr works, but something costs you space, guide data, or picture quality.
- **Fail**: something Freetvarr needs is broken. The row says how to fix it and links to the matching docs.
- **Skip**: the check cannot run yet, usually because an earlier check failed. Fix that one first.

Failing rows come first. Press `RE-RUN` to check again. A check that gets no answer in `8` seconds fails.

From a source checkout, `npm run doctor` prints the same checks in the terminal. It reads the settings from the database, so run it on the machine that runs Freetvarr.

## Connection {#tvh-reach}

Asks TVHeadend for its version (`/api/serverinfo`). It fails when no TVHeadend address is set, or when nothing answers at that address. It warns when TVHeadend is older than a 4.3 build. See [Wizard connection test](/guide/troubleshooting#wizard-connection-test).

## Login {#tvh-auth}

Checks that TVHeadend accepts the username and password. A `401` means TVHeadend asked for a login and did not get a valid one. A `403` means a wrong password, an address outside **Allowed networks**, or an access entry with no rights. See [TVHeadend 401 or 403](/guide/troubleshooting#tvheadend-401-or-403).

## User rights {#tvh-rights}

Reads the tuner status, which needs **Admin**, and the upcoming recordings, which need **Video recorder**. A `403` on either names the right to tick on the access entry. The [rights table](/guide/tvheadend#_8-make-a-user-for-freetvarr) lists every right Freetvarr uses. The Doctor cannot test the **Streaming** rights without starting a stream, so it does not check them.

## Tuners {#tvh-tuners}

Counts the tuners in TVHeadend's hardware list and the inputs in its status page. It fails when there are none. It warns when a tuner has a link-local `169.254.x.x` address, because that address can change if you move the tuner. See [Missing tuner](/guide/troubleshooting#missing-tuner).

## Channels {#tvh-channels}

Counts TVHeadend's channels. It fails at `0`. See [No channels](/guide/troubleshooting#no-channels).

## Guide depth {#guide-depth}

Finds the last programme in TVHeadend's guide and counts the channels with nothing in the next `24` hours. It fails when the guide ends within `12` hours. It warns when the guide ends within `48` hours, or when more than a quarter of the channels are empty. See [Empty guide](/guide/troubleshooting#empty-guide).

## Channel logos {#guide-logos}

Counts the channels that have a TVHeadend icon. It warns when **Prefer picons over channel icons** is on but no **Picon path** is set, because TVHeadend then reports no icon at all. See [Missing channel logos](/guide/troubleshooting#missing-channel-logos).

## Recordings folder {#paths-recordings}

Checks that the recordings folder exists inside the Freetvarr container and is readable. See [TEST PATH failures](/guide/troubleshooting#test-path-failures).

## TVHeadend recording path {#paths-match}

Compares **Recording system path** on TVHeadend's default DVR profile with the TVHeadend recordings path in Settings. They must match. See [CHECK TVHEADEND mismatch](/guide/troubleshooting#check-tvheadend-mismatch).

## Media folder {#paths-media}

Checks that the media folder exists and that Freetvarr can write to it. When it cannot, the row names the folder's owner and the user Freetvarr runs as. See [Permission errors](/guide/troubleshooting#permission-errors).

## Hardlinks {#paths-hardlink}

Makes a real test hardlink from the recordings folder into the media folder and into the one-off folder. If a link fails, each import copies the file, and every episode uses twice the space until TVHeadend's copy goes. The warning says either that the folders are on different disks, or that they are on one disk but in separate mounts. For separate mounts, mount one folder that holds both. See [One shared mount](/guide/configuration#one-shared-mount).

## Free space {#disk-free}

Reads the free space on the recordings and media folders. It warns under `20 GB` or `10%` free, and fails under `2 GB`. Recordings fail when the disk fills.

## Plex library {#plex-reach}

Lists Plex's library sections. It skips when Plex is not set up. It fails when Plex rejects the token or does not answer, or when the chosen section is missing or is not a TV library. It warns when no folder of that section ends in the same two folder names as the media folder. See [Plex not refreshing](/guide/troubleshooting#plex-not-refreshing) and [the library folder](/guide/plex#the-library-folder).

## Syncs {#sync-health}

Reads the last finished sync and the sync schedule. It warns when the last sync failed or had failed imports. It fails when a schedule is set but not running. See [Syncs](/guide/syncs).

## Live TV encoder {#live-encoder}

Reports the video encoder Freetvarr chose for live TV when it started. It fails when `ffmpeg` is not installed. It warns when live TV falls back to software encoding, because HD channels then load the processor. Setting `LIVE_TV_TRANSCODE=software` yourself passes. See [Hardware transcoding](/guide/hardware#hardware-transcoding).

## Ad removal tools {#ads-comskip}

Runs only when ad removal is on. It checks that `comskip`, `ffmpeg`, and `ffprobe` are on the `PATH`, without starting them. The Docker image includes all three. See [Ad removal](/guide/ad-removal).

## Time zone and network {#host-env}

Warns when the time zone is `UTC` or not a real zone name, because the guide and recordings then show the wrong times; set `TZ` (for example `Australia/Sydney`) on both services. It also warns when Freetvarr has only Docker bridge addresses, which means it is not on host networking. See [Wrong timestamps](/guide/troubleshooting#wrong-timestamps) and [Container name lookups](/guide/troubleshooting#container-name-lookups).
