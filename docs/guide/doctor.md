---
title: Health
description: >-
  A read-only health check of TVHeadend, the TV guide, the folders, Plex, live TV,
  and the host, with the fix for each problem it finds.
---

# Health

Health checks the parts Freetvarr depends on and says what to fix. Open it from Settings → System → **Health**, from the alert on [Home](/guide/home#health-alert), or from **Health checks** in Settings → About. The old address `#/doctor` opens it.

The page has three groups:

- **Sync**: the last sync, the next sync (a sync is Freetvarr's pass over TVHeadend's finished recordings to import them), and the recordings imported in the last `7` days. **Activity** opens the [sync history](/guide/syncs#history). **Sync now** at the top runs a sync at once.
- **Checks**: the read-only checks described below. Settings → About calls them **Health checks**.
- **Storage**: the free space on the recordings and media folders ([Configuration](/guide/configuration#the-two-recordings-paths) describes both), with a bar for each.

The sentence under the page title summarises the result, for example `Everything is working.`

## Health badge

Freetvarr runs the checks by itself 2 minutes after it starts and every 3 hours after that, so the result is up to date without opening Health. When everything works, Freetvarr shows no health marker. When a check or the last sync has a problem, a dot appears on the Settings icon in the tab bar or rail, and on the Health row in Settings. Amber means it needs a look. Red means it needs attention.

While the result is red, Home also shows the reason as an alert under the greeting. Press it to open Health. Press **×** to hide that alert for a day. A new problem shows again at once. The dot stays until the problem is fixed.

## Results

The checks only read. They send `GET` requests to TVHeadend and Plex, and look at folders without writing to them. They never save settings, change TVHeadend, refresh Plex, or start a test encode.

Each check gets one of these results, shown as a dot beside the check:

- **Pass**: nothing to do.
- **Warn**: Freetvarr works, but something costs you space, guide data, or picture quality.
- **Fail**: something Freetvarr needs is broken. The row says how to fix it, and **Read more** opens the matching docs.
- **Skip**: the check cannot run yet, usually because an earlier check failed. Fix that one first.

When every check passes, the page says `Everything's working`. Otherwise the checks are grouped as **Needs attention** (fails), **Needs a look** (warnings), and **Working**. The **Working** group folds into one row, such as `12 checks working`; press it to see each check. Press **Run checks** to check again. A check that gets no answer in `8` seconds fails.

From a source checkout (a clone of the Freetvarr repository), `npm run doctor` outputs the same checks in the terminal. It reads the settings from Freetvarr's database, so run it on the computer that runs Freetvarr.

## Connection {#tvh-reach}

Asks TVHeadend for its version (`/api/serverinfo`). It fails when no TVHeadend address is set, or when nothing answers at that address. It warns when TVHeadend is older than a 4.3 build. See [Setup connection test](/guide/troubleshooting#setup-connection-test).

## Login {#tvh-auth}

Checks that TVHeadend accepts the username and password. A `401` means TVHeadend asked for a login and did not get a valid one. A `403` means a wrong password, an address outside **Allowed networks**, or an access entry with no rights (an access entry is a TVHeadend login and its rights; see [Make a user for Freetvarr](/guide/tvheadend#_8-make-a-user-for-freetvarr)). See [TVHeadend 401 or 403](/guide/troubleshooting#tvheadend-401-or-403).

## User rights {#tvh-rights}

Reads the tuner status, which needs **Admin**, and the upcoming recordings, which need **Video recorder**. A `403` on either names the right to tick on the TVHeadend access entry. The [rights table](/guide/tvheadend#_8-make-a-user-for-freetvarr) lists every right Freetvarr uses. The checks cannot test the **Streaming** rights without starting a stream, so it does not check them.

## Open access {#tvh-open}

Reads TVHeadend's access entries. It warns when an enabled entry with username `*` has **Admin** (then anyone on that network can change TVHeadend without a login). A fresh TVHeadend from the linuxserver Docker image (the one in Freetvarr's Docker compose file) starts with such an entry. See [Secure TVHeadend](/guide/tvheadend#_2-secure-tvheadend).

## Tuners {#tvh-tuners}

Counts the tuners in TVHeadend's hardware list and the inputs in its status page. It fails when there are none, and warns when no tuner is turned on. It also warns when a tuner has a link-local `169.254.x.x` address, because that address can change if you move the tuner. See [Missing tuner](/guide/troubleshooting#missing-tuner).

## Channels {#tvh-channels}

Counts TVHeadend's channels. It fails at `0` (the **Channels** step of [setup](/guide/getting-started#_2-run-setup) adds them). See [No channels](/guide/troubleshooting#no-channels).

## Guide depth {#guide-depth}

Skips with "No channels yet" when TVHeadend has none. Otherwise it finds the last programme in TVHeadend's TV guide and counts the channels with nothing in the next `24` hours. It fails when the TV guide ends within `12` hours. It warns when the TV guide ends within `48` hours, or when more than a quarter of the channels are empty. See [Empty guide](/guide/troubleshooting#empty-guide).

## Channel logos {#guide-logos}

Counts the channels that have a TVHeadend icon. It skips when there are no channels. It warns when the TVHeadend setting **Prefer picons over channel icons** is on but no **Picon path** is set, because TVHeadend then reports no icon at all. See [Missing channel logos](/guide/troubleshooting#missing-channel-logos).

## Recordings folder {#paths-recordings}

Checks that the recordings folder exists inside the Freetvarr Docker container and is readable. See [Test path failures](/guide/troubleshooting#test-path-failures).

## TVHeadend recording path {#paths-match}

Compares **Recording system path** on TVHeadend's default DVR profile with **As TVHeadend sees it**, under **Recordings folder** in Settings → Recording → Media library. They must match. See [Check TVHeadend mismatch](/guide/troubleshooting#check-tvheadend-mismatch).

## Media folder {#paths-media}

Checks that the media folder exists and that Freetvarr can write to it. When it cannot, the row names the folder's owner and the user Freetvarr runs as. See [Permission errors](/guide/troubleshooting#permission-errors).

## Hardlinks {#paths-hardlink}

Makes a real test hardlink from the recordings folder into the media folder and into the one-off folder. If a link fails, each import copies the file, and every episode uses twice the space until TVHeadend's copy is deleted. The warning says either that the folders are on different disks, or that they are on one disk but in separate mounts. For separate mounts, mount one folder that holds both. See [One shared mount](/guide/configuration#one-shared-mount).

## Free space {#disk-free}

Reads the free space on the recordings and media folders. It warns under `20GB` or `10%` free, and fails under `10GB`. Sizes of `1000GB` or more show as `TB`. Recordings fail when the disk fills. With Docker on a Mac or Windows PC, the figure is Docker's virtual disk. The real limit is your computer's own disk.

## Plex library {#plex-reach}

Lists Plex's library sections. It skips when Plex is not set up. It fails when Plex rejects the token or does not answer, or when the chosen section is missing or is not a TV library. It warns when no folder of that section ends in the same two folder names as the media folder. See [Plex not refreshing](/guide/troubleshooting#plex-not-refreshing) and [the library folder](/guide/plex#the-library-folder).

## Syncs {#sync-health}

Reads the last finished sync and the sync schedule. It warns when the last sync failed or had failed imports. It fails when a schedule is set but not running. It works without Plex. See [Activity](/guide/syncs).

## Live TV encoder {#live-encoder}

Reports the video encoder Freetvarr chose for live TV when it started. It fails when `ffmpeg` is not installed. It warns when live TV falls back to software encoding, because HD channels then load the processor. Setting `LIVE_TV_TRANSCODE=software` yourself passes, and so does Docker on a Mac or Windows PC, which cannot use the graphics chip. See [Hardware transcoding](/guide/hardware#hardware-transcoding).

## Live streams {#live-streams}

Reports the result of the live TV speed test that Freetvarr runs when it starts, and how many live streams Freetvarr plays at once. It skips until the test has run. It warns when [Live streams at once](/guide/player#live-streams-at-once) is set higher than the test says the computer can manage, because the picture can then stutter.

## Ad removal tools {#ads-comskip}

Runs only when ad removal is on. It checks that `comskip`, `ffmpeg`, and `ffprobe` are on the `PATH`, without starting them. The Docker image includes all three. See [Ad removal](/guide/ad-removal).

## Time zone and network {#host-env}

Warns when no time zone is chosen and the system runs on `UTC`, or when `TZ` or the stored zone is not a known zone, because the TV guide and recordings then show the wrong times. Choose your zone in Settings → System → Schedule, or correct `TZ` in your `.env` (for example `Australia/Sydney`). It also warns when Freetvarr has only Docker bridge addresses, which means it is not on host networking. See [Wrong timestamps](/guide/troubleshooting#wrong-timestamps) and [Container name lookups](/guide/troubleshooting#container-name-lookups).
