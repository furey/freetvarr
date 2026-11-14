---
title: Health
description: >-
  A read-only health check of TVHeadend, the TV guide, the folders, Plex, live TV,
  and the host, with the fix for each problem it finds.
---

# Health

Health checks the parts Freetvarr depends on and says what to fix. Open it from Settings → SYSTEM → **Health**, from the alert on [Home](/guide/home#health-alert), or from **Health checks** in Settings → ABOUT → About Freetvarr. The old address `#/doctor` opens it.

The page has three groups:

- **SYNC**: the last sync, the next sync (a sync is Freetvarr's pass over [TVHeadend](https://tvheadend.org/)'s finished recordings to import them), and the recordings imported in the last `7` days. **Activity** opens the [sync history](/guide/syncs#history). **Sync now** at the top runs a sync at once.
- **CHECKS**: the read-only checks described below. Settings → ABOUT → About Freetvarr calls them **Health checks**.
- **STORAGE**: the free space on the recordings and media folders ([Configuration](/guide/configuration#the-two-recordings-paths) describes both), with a bar for each.

The sentence under the page title summarises the result, for example `Everything is working.`

## Health badge

Freetvarr runs the checks by itself 2 minutes after it starts and every 3 hours after that, so the result is up to date without opening Health. When everything works, Freetvarr shows no health marker. When a check or the last sync has a problem, a dot appears on the Settings icon in the tab bar or rail, and on the Health row in Settings. Amber means it needs a look. Red means it needs attention.

While the result is red, Home also shows the reason as an alert under the greeting. Press it to open Health. Press **×** to hide that alert for a day. A new problem shows again at once. The dot stays until the problem is fixed.

## Results

The checks only read. They send `GET` requests to TVHeadend and [Plex](https://www.plex.tv/), and look at folders without writing to them. They never save settings, change TVHeadend, refresh Plex, or start a test encode.

Each check gets one of these results, shown as a dot beside the check:

- **Pass**: nothing to do.
- **Warn**: Freetvarr works, but something costs you space, guide data, or picture quality.
- **Fail**: something Freetvarr needs is broken. The row says how to fix it, and **Read more** opens the matching docs.
- **Skip**: the check cannot run yet, usually because an earlier check failed. Fix that one first.

When every check passes, the page says `Everything's working`. Otherwise the checks are grouped as **Needs attention** (fails), **Needs a look** (warnings), and **Working** (passes and skips). The **Working** group folds into one row, such as `12 checks working`, with `· 2 skipped` added when checks skipped; press it to see each check. Press **Run checks** to check again. A check that gets no answer in `8` seconds fails.

From a source checkout (a clone of the Freetvarr repository), this command outputs the same checks in the terminal:

```sh
npm run doctor
```

It reads the settings from Freetvarr's database, so run it on the computer that runs Freetvarr.

## Connection {#tvh-reach}

Asks TVHeadend for its version (`/api/serverinfo`). It fails when no TVHeadend address is set, or when nothing answers at that address. It warns when TVHeadend is older than a 4.3 build. See [Setup connection test](/guide/troubleshooting#setup-connection-test).

## Login {#tvh-auth}

Checks that TVHeadend accepts the username and password. A `401` means TVHeadend asked for a login and did not get a valid one. A `403` means a wrong password, an address outside **Allowed networks**, or an access entry with no rights (an access entry is a TVHeadend login and its rights; see [Make a user for Freetvarr](/guide/tvheadend#_8-make-a-user-for-freetvarr)). See [TVHeadend 401 or 403](/guide/troubleshooting#tvheadend-401-or-403).

## User rights {#tvh-rights}

Reads the tuner status, which needs **Admin**, and the upcoming recordings, which need **Video recorder**. A `403` on either names the right to tick on the TVHeadend access entry. The [rights table](/guide/tvheadend#_8-make-a-user-for-freetvarr) lists every right Freetvarr uses. The checks cannot test the **Streaming** rights without starting a stream, so it does not check them.

## Open access {#tvh-open}

Reads TVHeadend's access entries. It warns when an enabled entry with username `*` has **Admin** (then anyone on that network can change TVHeadend without a login). A fresh TVHeadend from the [linuxserver](https://www.linuxserver.io/) [Docker](https://docs.docker.com/) image (the one in Freetvarr's Docker Compose file) starts with such an entry. See [Secure TVHeadend](/guide/tvheadend#_2-secure-tvheadend).

## Tuners {#tvh-tuners}

Counts the tuners in TVHeadend's hardware list and the inputs in its status page. It fails when there are none, and warns when no tuner is turned on. It also warns when a tuner has a link-local `169.254.x.x` address, because that address can change if you move the tuner. See [Missing tuner](/guide/troubleshooting#missing-tuner).

## Channels {#tvh-channels}

Counts TVHeadend's channels. It fails at `0` (the **Channels** step of [setup](/guide/getting-started#_2-run-setup) adds them). See [No channels](/guide/troubleshooting#no-channels).

## Series recordings {#tvh-rules}

Reads Freetvarr's own record of the one-off change to the [whole-title form](/guide/series#how-a-series-recording-works) of the series recordings it made. It warns when TVHeadend did not save that change for a series recording, and names the series. That series recording keeps its old title and can still record longer titles that contain it. Freetvarr tries again after the next sync; if the warning stays, the Freetvarr log has the TVHeadend error (`[rules] could not change the title`).

## Guide depth {#guide-depth}

Skips with "No channels yet" when TVHeadend has none. Otherwise it finds the last programme in TVHeadend's TV guide and counts the channels with nothing in the next `24` hours. It fails when the TV guide ends within `12` hours. It warns when the TV guide ends within `48` hours, or when more than a quarter of the channels are empty. It also warns when the TVHeadend guide grabber reads Freetvarr's own +1 guide feed at an address that is not Freetvarr's address now (for example after the NAS address changed), and names both addresses; run the guide step again to fix it. See [Empty guide](/guide/troubleshooting#empty-guide).

## Channel logos {#guide-logos}

Counts the channels that have a TVHeadend icon. It skips when there are no channels. It warns when the TVHeadend setting **Prefer picons over channel icons** is on but no **Picon path** is set (a picon is a channel logo image file), because TVHeadend then reports no icon at all. See [Missing channel logos](/guide/troubleshooting#missing-channel-logos).

## Guide pictures {#guide-pictures}

Counts the titles in the TV guide that have a picture. It takes each title that airs in the next `48` hours, and checks whether Freetvarr has a picture for it from any source: a saved copy, the programme's own picture, a Freeview picture, an online lookup, or a frame from a recording. A channel logo or a channel default image in place of a programme picture counts as no picture. It reads only what Freetvarr already has; it sends no request of its own. It skips when the guide has nothing in the next `48` hours.

Each guide programme can name a picture on a website (the host). Freetvarr notes whether each of its recent picture downloads worked. A host that failed at least half of its last `10` or more downloads counts as failing, and its titles count only when another source covers them. After each guide refresh, Freetvarr saves a copy of each guide picture, so a title keeps its picture after the host stops serving it.

The check passes when at least `80%` of the titles have a picture. The detail names each failing host and how many of its titles other sources cover, for example: "Pictures for 548 of 564 guide titles in the next 48 h. Pictures from images.example.com fail to load; other sources cover 45 of its 51 titles."

It warns when fewer than `80%` of the titles have a picture. Check that Freetvarr can reach the internet, and that **Missing pictures** is on under **SETTINGS → FILM AND TV INFO** ([Missing pictures](/guide/tv-guide#missing-pictures)). Freetvarr fills in pictures after each guide load, so run the check again after the next one.

In Australia, Freetvarr also takes pictures from [Freeview](https://www.freeview.com.au/) for titles whose guide picture fails or is missing. It picks the Freeview region from your time zone (each state and territory capital, plus Broken Hill), and matches each programme by its channel and start time. Outside Australia this step is off. It also needs the Admin right in TVHeadend to read the channel lists; without it, this check warns that Freeview pictures are off and asks you to give the Freetvarr user in TVHeadend the Admin right.

## Guide sources {#guide-sources}

Shows each guide source with the share of channels that have healthy listings, how many days ahead it goes, and when Freetvarr last read it ([Guide](/guide/settings#guide)). Before you confirm the merged guide, it passes and says where to turn it on.

In a country with no listings source (any country except Australia and New Zealand), it measures the TVHeadend guide instead: how many channels have listings for the next `48` hours, and how many days ahead the guide goes (the median of the channels). It warns when fewer than half the channels have listings, or the median is less than `3` days. The fix names a third-party XMLTV feed for your country from **SETTINGS → GUIDE**; Freetvarr has not checked the licences of these feeds. It skips when Freetvarr cannot read the TVHeadend guide.

It warns when:

- The merged guide file is more than `12` hours old, while TVHeadend reads it.
- The first source (Freeview in Australia and New Zealand) is degraded.
- You chose a source, for all channels or for one channel, and that source is degraded. **Switch to Automatic** sets **Use first** to **Automatic** and removes the pins to degraded sources.
- You confirmed the merged guide, but the TVHeadend XMLTV URL grabber no longer reads the Freetvarr address. Running the **Guide** step of setup again with another address does this.

## Recordings folder {#paths-recordings}

Checks that the recordings folder exists inside the Freetvarr Docker container and is readable. See [Test path failures](/guide/troubleshooting#test-path-failures).

## TVHeadend recording path {#paths-match}

Compares **Recording system path** on TVHeadend's default DVR profile with **As TVHeadend sees it**, under **RECORDINGS FOLDER** in Settings → RECORDING → Media library. They must match. See [Check TVHeadend mismatch](/guide/troubleshooting#check-tvheadend-mismatch).

## Media folder {#paths-media}

Checks that the media folder exists and that Freetvarr can write to it. When it cannot, the row names the folder's owner and the user Freetvarr runs as. See [Permission errors](/guide/troubleshooting#permission-errors).

## Library folders {#paths-mounted}

Warns when the media root, the one-off folder, or the movies folder is empty while Freetvarr's imported recordings point into it. Hidden files such as `.freetvarr-keep` do not count. An empty folder on a new install passes. See [Empty library folder](/guide/troubleshooting#empty-library-folder).

## Hardlinks {#paths-hardlink}

Makes a real test hardlink from the recordings folder into the media folder, the one-off folder, and the movies folder (when set). A hardlink is a second name for the same file data, which uses no extra space. If a link fails, each import copies the file, and every episode uses twice the space until TVHeadend's copy is deleted. The warning says either that the folders are on different disks, or that they are on one disk but in separate mounts. A mount is a folder attached to the Docker container from the host. For separate mounts, mount one folder that holds both. See [One shared mount](/guide/configuration#one-shared-mount).

## Free space {#disk-free}

Reads the free space on the recordings and media folders. It warns under `20GB` or `10%` free, and fails under `10GB`. Sizes of `1000GB` or more show as `TB`. Recordings fail when the disk fills. With Docker on a Mac or Windows PC ([Docker Desktop](https://docs.docker.com/desktop/)), the figure is Docker's virtual disk. The real limit is your computer's own disk.

## Plex library {#plex-reach}

Lists Plex's library sections. It skips when Plex is not set up. It fails when Plex rejects the token or does not answer, or when the chosen section is missing or is not a TV library. It warns when no folder of that section ends in the same two folder names as the media folder. See [Plex not refreshing](/guide/troubleshooting#plex-not-refreshing) and [the library folder](/guide/plex#the-library-folder).

## Plex one-off library {#plex-oneoffs}

Counts the items in the Plex library chosen as the **One-off library**. It skips when Plex or that library is not set up. It warns when Plex lists items but the one-off folder has no files, because Plex then keeps items whose files are gone. The `.freetvarr-keep` file is an empty hidden file that stops Plex reading the one-off folder as empty ([The one-off library](/guide/plex#the-one-off-library)). When it is missing, the check offers **Create placeholder file**. See [One-offs that stay in Plex](/guide/troubleshooting#one-offs-that-stay-in-plex).

## Syncs {#sync-health}

Reads the last finished sync and the sync schedule. It warns when the last sync failed or had failed imports. A sync that a [restart stopped](/guide/syncs#restart-during-a-sync) passes. It fails when a schedule is set but not running. It works without Plex. See [Activity](/guide/syncs).

## Live TV encoder {#live-encoder}

Reports the video encoder Freetvarr chose for live TV when it started. It fails when [FFmpeg](https://ffmpeg.org/) is not installed. It warns when live TV falls back to software encoding, because HD channels then load the processor. Setting `LIVE_TV_TRANSCODE=software` yourself passes, and so does Docker on a Mac or Windows PC, which cannot use the graphics chip. See [Hardware transcoding](/guide/hardware-requirements#hardware-transcoding).

## Live streams {#live-streams}

Reports the result of the live TV speed test that Freetvarr runs when it starts, and how many live streams Freetvarr plays at once. It skips until the test has run. It warns when [Live streams at once](/guide/player#live-streams-at-once) is set higher than the test says the computer can manage, because the picture can then stutter.

## Ad removal tools {#ads-comskip}

Runs only when ad removal is on. It checks that [Comskip](https://www.kaashoek.com/comskip/) (`comskip`), FFmpeg (`ffmpeg`), and [FFprobe](https://ffmpeg.org/ffprobe.html) (`ffprobe`) are on the `PATH`, without starting them. The Docker image includes all three. See [Ad removal](/guide/ad-removal).

## Time zone and network {#host-env}

Warns when no time zone is chosen and the system runs on `UTC`, or when `TZ` or the stored zone is not a known zone, because the TV guide and recordings then show the wrong times. Choose your zone in Settings → SYSTEM → Schedule, or correct `TZ` in your `.env` (for example `Australia/Sydney`). It also warns when Freetvarr has only Docker bridge addresses, which means it is not on host networking. See [Wrong timestamps](/guide/troubleshooting#wrong-timestamps) and [Container name lookups](/guide/troubleshooting#container-name-lookups).

## Allowed hostnames {#host-names}

Lists the names Freetvarr was opened by in the last 14 days that are not on [Allowed hostnames](/guide/troubleshooting#allowed-hostnames), with the number of requests, the last time, and the address of the device. From `3.0.0`, Freetvarr refuses these names. **Allow `<name>`** adds the most used name that you opened from the address bar, a bookmark, or the Home Screen. Names seen only in background requests get **Open setup** instead, so a website cannot put its own name on the button. When you opened Health by a name that is not on the list, the button is left out and the row says to open Freetvarr by its IP address, then press **Allow `<name>`** there. Add only names you use yourself: a name you do not know can be a website that tried to reach Freetvarr through a browser on your network. It passes when there are no such names, and warns while the list holds `*`, because Freetvarr then answers to any name.
