---
title: Troubleshooting
description: 'Fixes keyed by symptom: the TVHeadend login, the setup checks, tuners, channels, the TV guide, logos, imports, and Plex.'
---

# Troubleshooting

<Illustration name="troubleshooting" />

Run [Health](/guide/doctor) first (Settings → SYSTEM → **Health**, or press the alert on Home). It checks TVHeadend, the TV guide, the folders, and Plex, and links each problem it finds to the section below that fixes it.

Each section starts from what you see, then gives the cause and the fix. The sections follow the order of a first install.

> [!NOTE]<br>
> Where a fix below names an HDHomeRun or an Australian broadcaster, that is the author's own setup. Each such entry says what to do with a different tuner or in another country.

## TVHeadend 401 or 403

Freetvarr shows `Failed: TVHeadend rejected the credentials (HTTP 401).` or the same with `HTTP 403`, in setup, in Settings, or on a page that reads from TVHeadend. Settings adds the API path that failed, such as `(stage: serverinfo)`.

- **`401` with an empty username**: TVHeadend asks for a login and Freetvarr sent none. Enter the username and password of the TVHeadend user ([TVHeadend step 8](/guide/tvheadend#_8-make-a-user-for-freetvarr)).
- **`403` at `serverinfo`**: TVHeadend refused the login. Check these in order:
  1. The password. TVHeadend keeps it under **Configuration → Users → Passwords**, not on the access entry (the TVHeadend rule that holds the user's rights, under **Configuration → Users → Access Entries**). The password entry needs **Enabled** ticked and the same username as the access entry.
  2. The access entry has **Enabled** ticked.
  3. **Allowed networks** on the access entry includes the address Freetvarr connects from. Under host networking (`network_mode: host`, [TVHeadend step 1](/guide/tvheadend#_1-run-the-container)) that is the host's LAN address. A URL of `http://127.0.0.1:9981` connects from `127.0.0.1` instead, which a LAN prefix does not cover.
- **`403` at a later stage** (`status/inputs`, `dvr/entry/…`, `epggrab/channel/grid`): the login works but the user lacks a right. Tick the rights in [the rights table](/guide/tvheadend#_8-make-a-user-for-freetvarr), and keep **Rights** ticked in the entry's **Change parameters**.
- **The order of entries**: access entries are an ordered list, evaluated top to bottom, so a broader entry above yours can win.

TVHeadend's default configuration accepts HTTP Digest logins only, and Freetvarr answers Digest. To test the login outside Freetvarr, run this command in a terminal on a computer on your home network. A `200` means the login works; a `403` means it does not.

```sh
curl --digest -u <user>:<password> -o /dev/null -w '%{http_code}\n' \
  http://<host-ip>:9981/api/serverinfo
```

## Setup connection test

**Save and next** on the TVHeadend step of setup tests the connection and stays on the step until it passes. The error shows under the TVHeadend address. **Finish later** opens a dialog: press **Finish later** again to leave setup and keep what you saved, or close the dialog to go back. Freetvarr cannot record until TVHeadend is connected. To resume, open Settings → SYSTEM → Setup.

- **"TVHeadend URL is not configured"**: set the URL. Under host networking it's `http://<host-ip>:9981`, not `http://tvheadend:9981` (neither Docker container is on a Docker bridge network, so container names don't resolve).
- **`TVHeadend request failed: ECONNREFUSED`**, **`ECONNABORTED`** (a timeout), or **`EHOSTUNREACH`**: TVHeadend isn't running, or isn't on that address and port. To read TVHeadend's log, run this in a terminal in the `freetvarr` folder (the folder the install script created, which holds `docker-compose.yml`):

  ```sh
  docker compose logs tvheadend
  ```

- **`TVHeadend request failed: ENOTFOUND`**: the hostname in the URL doesn't resolve. Use the host's IP address.
- **Auto-discover TVHeadend finds nothing**: no TVHeadend answered on port `9981` at any address of the host. Type the URL yourself, or set `TVH_URL` for the Freetvarr Docker container ([Configuration](/guide/configuration#compose-environment)).
- **`Connected` with `0 channels`**: TVHeadend has no enabled channels yet. See [No channels](#no-channels).
- **`Connected` with `0 tuners`**: the Freetvarr user lacks **Admin**, or TVHeadend sees no tuner. See [Missing tuner](#missing-tuner).

## TVHeadend admin login

TVHeadend's web interface answers `403 Forbidden` to the admin login: the password TVHeadend stored is not the one you are typing. [Securing by hand](/guide/tvheadend#securing-by-hand) says how to reset it with `--noacl`.

## Test path failures

**Test path** in Settings → RECORDING → Media library checks a folder inside the Freetvarr Docker container, not on the host.

- **"/data/recordings does not exist inside the container"**: the Docker compose file doesn't mount a folder at that path. Check the `volumes:` of the `freetvarr` service, then apply the change. In a terminal in the `freetvarr` folder, run:

  ```sh
  docker compose up -d freetvarr
  ```

- **"is not readable by the container user"** or **"is not writable by the container user"**: the host folder belongs to a different user from `PUID`/`PGID`. In a terminal on the host, show the owner of the folder the message names, with its host path in place of `<host-folder>`:

  ```sh
  ls -ldn <host-folder>
  ```

  Then give the folder and everything in it to the `PUID:PGID` pair both containers run as, with your values from `.env`:

  ```sh
  sudo chown -R <PUID>:<PGID> <host-folder>
  ```

  The `init` service of the Docker compose file (a one-shot container that runs before the others) gives the subfolders of `CONFIG_PATH` and `DATA_PATH` (the host folders set in `.env`) to `PUID:PGID` on every start, so this appears only when you change `PUID`/`PGID` or put other folders in the mount. Fix the folder the message names.
- **"is on the same disk as the media root but in a separate mount, so imports copy each file"**: this is a notice, not a failure. Imports still work. Mount one folder that holds both `recordings/` and `media/`, as in [One shared mount](/guide/configuration#one-shared-mount), to make them hardlinks.
- **"is on a different disk from the media root, so imports copy each file"**: this is a notice, not a failure. Imports still work. Move `recordings/` and `media/` onto one disk, then mount one folder that holds both.

## Check TVHeadend mismatch

**Check TVHeadend** in Settings → RECORDING → Media library reads the recording path from TVHeadend's default DVR profile and compares it with the "Recordings folder (as TVHeadend sees it)" field.

- **"TVHeadend has no recording path. Set one in its DVR profile."**: set **Recording system path** on the default profile ([TVHeadend step 7](/guide/tvheadend#_7-set-the-recording-path)).
- **"TVHeadend records to /x, not /recordings."**: change TVHeadend's path to the container path of its recordings mount (`/recordings` in the Docker compose file that the install script downloads), or put TVHeadend's path in the field. The field holds the path TVHeadend uses inside its own container, and that path must be the same host folder Freetvarr mounts, as `recordings_root`. [The two recordings paths](/guide/configuration#the-two-recordings-paths) has the detail.

## Missing tuner

In TVHeadend's web interface, **Configuration → DVB Inputs → TV adapters** is empty, or Freetvarr's [setup](/guide/getting-started#_2-run-setup) reports `0 tuners`.

- The TVHeadend container has to run with `network_mode: host` for a tuner it finds by network broadcast, such as an HDHomeRun or a SAT>IP server (those broadcasts don't cross Docker's private bridge network). A USB or PCIe tuner needs its `/dev/dvb` devices passed into the container instead.
- On a Mac, Docker Desktop and OrbStack cannot find a network tuner on their own. In Settings → SYSTEM → Setup, press **Channels**, enter the tuner's IP address and this computer's IP address, then press **Use this address**. The **Tuners** check on [Health](/guide/doctor#tvh-tuners) links there. Or run Freetvarr with Docker on Linux (a NAS, mini PC, or Raspberry Pi).
- The tuner has to be on the same part of the network as the host (those broadcasts don't cross between subnets). For a tuner on another subnet, press **Enter the tuner's address** in the **Channels** step of setup. A tuner plugged straight into a spare NAS port gets a link-local `169.254.x.x` address. TVHeadend still finds it, but nothing else on the LAN can reach it ([Requirements](/guide/hardware#direct-to-a-spare-nas-port)).
- Check the tuner answers at all. On an HDHomeRun, open `http://<hdhr-ip>/tuners.html` in a browser. If the page does not load, the tuner has a power or network cable problem, not a TVHeadend one. See [Requirements](/guide/hardware#checking-the-signal). On a USB or PCIe tuner, check `/dev/dvb` exists on the host and inside the container.
- TVHeadend lists the tuner but Freetvarr reports `0 tuners`: the Freetvarr user lacks **Admin**, which TVHeadend requires for the tuner status.

## No channels

Freetvarr reports `0 channels`, or the TV guide has no rows.

- Each tuner in **TV adapters** needs **Enabled** ticked and your network set in its **Networks** field ([TVHeadend step 3](/guide/tvheadend#_3-add-the-tuner)).
- Every mux in **Configuration → DVB Inputs → Muxes** ending `FAIL` means the wrong pre-defined mux list, or an antenna that doesn't reach that transmitter. Pick the list for the transmitter your antenna points at ([step 4](/guide/tvheadend#_4-scan-the-muxes)).
- Muxes `OK` but no channels: the services are not mapped yet. Press **Map all** under **Configuration → DVB Inputs → Services** ([step 5](/guide/tvheadend#_5-map-services-to-channels)).
- Freetvarr drops channels marked disabled in **Configuration → Channel/EPG → Channels**.

## Empty guide

The TV guide shows channels but no programmes, or only about a day of them.

- Without an XMLTV feed you get only what the broadcast signal carries. In Australia that is about a day of thin data. UK and European Freeview carry up to seven days over the air. Set up the feed ([step 6](/guide/tvheadend#_6-load-the-xmltv-guide)).
- TVHeadend's log says `broadcasts tot= 0`: no feed channel is linked to a TVHeadend channel yet. To read the log, run:

  ```sh
  docker compose logs tvheadend
  ```

  In TVHeadend's web interface, link them under **Configuration → Channel/EPG → EPG Grabber Channels**, then press **Re-run internal EPG grabbers**.
- With the feed loaded but one channel blank, that channel isn't linked to a feed channel. See [Wrong programmes on a channel](#wrong-programmes-on-a-channel).
- After you install a grabber script, restart TVHeadend:

  ```sh
  docker compose restart tvheadend
  ```

  TVHeadend looks for grabbers at startup only, so a running TVHeadend never loads a new one.
- Freetvarr keeps a copy of the TV guide for an hour, or a minute when it has no programmes. Freetvarr loads the TV guide again after guide setup and after a guide link change. After you fix TVHeadend, restart Freetvarr to load the TV guide at once, or wait up to an hour:

  ```sh
  docker compose restart freetvarr
  ```

## Wrong programmes on a channel

The TV guide shows another channel's programmes on a channel, or no programmes on one channel while others have them. The channel is linked to the wrong guide channel, or to none.

- In the TV guide, press **Channels**, press the pencil (**Change guide source**) next to the channel, pick the matching guide channel, then press **Save**. See [Channel listings](/guide/tv-guide#channel-listings).
- Series recordings match on title and channel, so check [Scheduled](/guide/recordings#scheduled) after you change a link.

## Missing channel logos

Freetvarr takes each channel's logo from TVHeadend's own channel icon first, then from the icon the XMLTV guide feed lists for that channel (the XMLTV `<channel>` `<icon>`). A channel with neither shows its name only.

- **TVHeadend prefers picons, but none are installed**: picons are channel logo image files that TVHeadend reads from a folder. With picons preferred and no picon files, TVHeadend reports no icon for any channel. In TVHeadend's web interface, open **Configuration → General → Base** and untick the preference for picons, or install picons and set the picon path. Switch the view level to Expert if the picon fields are hidden.
- **The feed icon doesn't load**: feed icons are usually links to the internet, and the Freetvarr container fetches them itself. To check that the Freetvarr Docker container has outbound internet access, run this in a terminal on the host:

  ```sh
  docker exec freetvarr node -e "fetch('https://example.com').then((r) => console.log(r.status))"
  ```

  It outputs `200` when it does.
- **The Freetvarr user lacks Admin**: TVHeadend serves the guide feed's channel list to admin users only, so the feed fallback finds no icons.
- **The feed channel is unlinked**: a feed icon only reaches a TVHeadend channel through the link in **EPG Grabber Channels**.

## Missing programme images

Programme images come from the guide feed's `<programme>` `<icon>` entries. Over-the-air guide data carries none, and not every XMLTV feed includes them. A programme without an image shows its text only; nothing in Freetvarr needs fixing. The Freetvarr Docker container needs outbound internet access to fetch images from an external feed, as for [channel logos](#missing-channel-logos).

## Recordings an hour out after a clock change

Recordings on the days after a daylight-saving change start an hour early or late, often after a TVHeadend restart. The over-the-air EIT guide data of some broadcasters carries the wrong UTC offset after the change, and TVHeadend uses it until the XMLTV feed covers those dates. The author saw this in Sydney after `2026-10-04`.

- In TVHeadend's web interface, press **Re-run internal EPG grabbers** under **Configuration → Channel/EPG → EPG Grabber**, then check the times in the **Electronic Program Guide** tab.
- Keep the XMLTV module at a higher priority than EIT ([Guide priority](/guide/tvheadend#guide-priority)).

## Scheduled recordings vanished

Upcoming recordings from series recordings disappear after TVHeadend crashes or restarts, and return when the guide reloads. While the TV guide is empty, TVHeadend removes the scheduled entries of each autorec (the TVHeadend entry behind a [series recording](/guide/series#how-a-series-recording-works)). With both of TVHeadend's guide save options off, the TV guide is empty after a restart.

- Turn on periodic save and save after import ([Saving the guide](/guide/tvheadend#saving-the-guide)).
- In TVHeadend's web interface, press **Re-run internal EPG grabbers** to reload the TV guide now (the series recordings schedule again from it).

## Duplicate episode recordings

TVHeadend records the same episode twice in a row. The DVR profile's **Re-record if errors** setting is `10` by default, and a recording with more data errors than that schedules a repeat. Freetvarr shows the first recording as Recorded with a data-error warning, not as failed. In TVHeadend's DVR profile, set **Re-record if errors** to `0` ([TVHeadend step 7](/guide/tvheadend#_7-set-the-recording-path)).

## Setup wizard keeps opening

TVHeadend's first-run wizard opens on every page load. The `wizard` value in **Configuration → General → Base** is still set because the wizard never finished. Open TVHeadend's first-run wizard and finish or cancel it, and the value clears ([Securing by hand](/guide/tvheadend#securing-by-hand)).

## Unimported recordings

TVHeadend finished a recording, but nothing appears in Recordings or in your media library.

- **No series folder matches it, and Import every recording is off.** With **Import every recording** off (Settings → RECORDING → Media library), Freetvarr imports only recordings whose title contains the title of a series folder ([Series rules](/guide/series)), and recordings made with **Add to library** on. Pick **Every episode** and press **Record series** in the TV guide, use **Add title** in Settings → RECORDING → [Title matches](/guide/series#title-matches), or turn on **Import every recording**. The [recording log](/guide/recordings#recording-log) row says `No series folder for this title, and Import every recording is off`.
- **It was recorded with Add to library off.** The recording log row shows **NOT IMPORTED** and says `Recorded with Add to library off`. Press **Import** on the row to import it.
- **The Sync button on its row is dimmed.** The series folder or title match is switched off, and syncs skip it. Freetvarr's pages have no switch for this; only a call to Freetvarr's API turns a folder off. Open the row in Settings → RECORDING → [Series rules](/guide/series) or Title matches and press **Save**; saving switches it back on.
- **The sync hasn't run yet.** Freetvarr syncs about a minute after a recording finishes, and on the **Sync schedule** in Settings → SYSTEM → Schedule (default `Every 30 minutes`). To run one at once, open the **Syncs** tab in Settings → SYSTEM → [Activity](/guide/syncs) and press **Sync now**.
- **It came in as SKIPPED or PARTIAL.** See the next two sections.

## Skipped recordings

The row's error in the [recording log](/guide/recordings#recording-log) says which of the two causes it was. Press the row for the full error and steps to fix it.

- **"file not found" or no filename**: TVHeadend has no finished file yet. A recording in progress shows this, and post-recording padding can keep it here for up to ten minutes after the programme ends. The next sync picks it up.
- **"outside the recordings mount"**: TVHeadend reported a path Freetvarr can't translate. The two recordings paths have to match. Press **Check TVHeadend** in Settings → RECORDING → Media library, and see [the two recordings paths](/guide/configuration#the-two-recordings-paths).

## Partial recordings

- The imported file came up more than `1MB` short of what TVHeadend reported. The next sync imports the file again. If it stays **PARTIAL**, the source itself is short. In TVHeadend's web interface, check the status of that entry (it usually reports data errors from a weak signal).

## Replaced recordings

A recording shows `REPLACED` in the recording log when its library file is gone and another file for the same episode is in its place. Freetvarr checks this at every sync and each time Recordings loads.

The usual cause is Sonarr. When Sonarr and Freetvarr save to the same TV library folder, Sonarr counts Freetvarr's recording as its own file for that episode. When Sonarr downloads a copy its quality profile rates higher, it moves Freetvarr's file to its recycle bin and keeps the download. The INFO panel of the recording names the file that replaced it.

Freetvarr leaves the replacement in place. To keep Freetvarr's recordings, open the series in Sonarr and turn off monitoring for the episodes Freetvarr records. With Sonarr connected ([Sonarr and Radarr](/guide/sonarr-radarr)), the delete dialog in Freetvarr can also delete the downloaded copy through Sonarr.

A recording shows `NOT IN LIBRARY` in the recording log when its file is gone and nothing replaced it. The episode disappears from Recordings, and a show with no episodes left disappears too. Press **Import again** on its recording log row to import the TVHeadend copy again.

## Copy files in the library

A file named like `Show - S01E02 - copy 2.ts` appears in the TV library or the one-off folder. Freetvarr never writes over a file it did not import. When the name an import needs already belongs to another file (e.g. a Sonarr download, a file you copied in, or a Fetch recording saved by [Fetch My Recordings or `fetchtv`](/guide/leaving-fetch#saving-your-fetch-recordings)), Freetvarr leaves that file as it is and saves the recording under the next free `copy` name. The import's log in Settings → SYSTEM → [Activity](/guide/syncs) names both files.

Keep the file you want and delete the other. To delete Freetvarr's copy, press **Delete episode** in its [episode menu](/guide/recordings#episode-menu), so that the TVHeadend copy goes too.

## Slow imports

- A hardlink import is instant. If an import shows progress, Freetvarr is copying, because Freetvarr sees the recordings folder and the media library through separate mounts or on different disks. Put both under one mounted folder on one disk to import by hardlink ([One shared mount](/guide/configuration#one-shared-mount)).

## Repeat recordings

TVHeadend records a repeat of an episode that Freetvarr already imported, and the next sync imports it again.

- **The repeat has no episode number in the TV guide.** Freetvarr's series recordings skip a repeat only when both airings carry the same season and episode number. Some free-to-air guides drop the number from daytime repeats. In TVHeadend's web interface, cancel that repeat in the **Upcoming / Current Recordings** tab.
- **The kept entry is gone.** With [Remove after import](/guide/remove-from-tvheadend) on, TVHeadend keeps an entry for each imported episode in its **Removed Recordings** tab. Delete that entry and TVHeadend no longer knows the episode was recorded. The same happens when you press **Remove** on a finished recording in TVHeadend's own web interface while the DVR profile's **Recording info retention period** is `On file removal` (the default).

## TVHeadend crash on start

TVHeadend stops with a segfault (signal `11`) just after it logs `Purging obsolete autorec entries for current schedule`.

- This is a TVHeadend bug: TVHeadend's cleanup of obsolete autorec entries reads freed memory after it drops a scheduled entry. Commit [`5acec7ee5`](https://github.com/tvheadend/tvheadend/commit/5acec7ee5c294d887b6ad9858d664e36f095df8c) (`2026-09-20`) fixes it. Update TVHeadend to a build that includes it.
- Back up TVHeadend's `/config` folder before you update the TVHeadend Docker image.

## Permission errors

An import fails with a permission error, or the TVHeadend file won't delete.

- Set `PUID`/`PGID` to match the owner of the bind-mounted host folders, and use the same pair for both Docker containers. Freetvarr hardlinks and deletes files that TVHeadend created, so a mismatch fails at those steps.

## Plex not refreshing

Episodes import, but Plex doesn't show them.

- Press **Refresh Plex now** in Settings → RECORDING → Plex. Freetvarr reports `Plex refresh sent (HTTP 200).` or the error.
- **`Plex HTTP 401`**: the Plex token is wrong or expired. In Settings → RECORDING → Plex, detect or paste the Plex token again ([Plex](/guide/plex#the-token)).
- **`Plex HTTP 404`**: the section ID doesn't exist. In Settings → RECORDING → Plex, pick the TV section again from the list.
- **`ECONNREFUSED` or `ECONNABORTED`**: the Plex URL is wrong, or Plex isn't running. Use `http://<plex-host-ip>:32400`.
- **The refresh succeeds but nothing appears**: the Plex library doesn't include the folder Freetvarr writes to. Add the host folder `${DATA_PATH}/media/tv` to the library ([Plex](/guide/plex#the-library-folder)).

## Wrong country in Plex

Plex shows the posters, episode names, or seasons of another country's version of a show, such as the US `Big Brother` for the Australian one. The series folder has a plain name, so Plex matched it by name alone.

1. In Freetvarr, open Settings → RECORDING → Series rules and press the series.
2. Check the **Show** row. If it names the wrong show, press it and pick the right one ([Check which show this is](/guide/series#check-which-show-this-is)).
3. Press **Rename folder**, then **Rename folder** again ([Rename folder](/guide/series#rename-folder)). Read [Renamed folders](/guide/plex#renamed-folders) first to keep the old items in Plex until the new ones match.
4. If Plex still shows the wrong show after the scan, use **Fix Match** on the show in Plex.

When the edit form says Sonarr also saves episodes in the folder, rename the series in Sonarr instead, then use **Fix Match** in Plex.

## Plex token auto-detect

- Auto-detect needs Plex's `Preferences.xml` inside the Freetvarr Docker container. The `plex` profile (the Docker compose profile that runs Plex next to Freetvarr, see [No Plex yet?](/guide/plex#no-plex-yet)) mounts it for you. For another Plex on the same host, set `PLEX_PREFS_PATH` in the `.env`. [Plex](/guide/plex#the-token) lists where the file lives.
- **"Preferences.xml not found at /plex/Library/…"**: the `plex` profile is not running, and `PLEX_PREFS_PATH` is unset. Start the profile, or set the path in `.env`, then run:

  ```sh
  docker compose up -d freetvarr
  ```

- **"Preferences.xml not found at /plex-preferences.xml"**: `PLEX_PREFS_PATH` points at the wrong host file, so the mount is empty. Fix the path in `.env` and run:

  ```sh
  docker compose up -d freetvarr
  ```

- Or paste the Plex token into Settings → RECORDING → Plex yourself. Copy it from `app.plex.tv` (or follow Plex's own support article on finding your token).

## Container name lookups

Other containers can't reach Freetvarr by name.

- Under host networking, Freetvarr is on no Docker bridge network. Use the host's LAN IP and `FREETVARR_PORT` instead.

## Ad detection errors

Ad detection is cutting the wrong things, or missing breaks.

- Ad detection is never perfect. Comskip's accuracy varies a lot by channel.
- Set the series to **Detect** mode first and check the break counts and minutes it reports in the recording log before switching to **Cut**. Allow about 30 minutes of scan per 75-minute recording on a home NAS.
- Cuts snap to the nearest keyframe, so a second or two either side of a break is normal.
- To tune detection, place your own `comskip.ini` in the `/config` bind mount. Your file overrides the bundled default, which the author tuned for Australian channels. Outside Australia, expect to tune your own. If a cut goes wrong, press **Put the original back** in the episode menu while the `<file>.ts.orig` backup exists. See [Ad removal](/guide/ad-removal).

## Playback failed on HD channels

Chrome shows "Playback failed" or a black player on an HD channel, while SD channels play. Chrome cannot decode interlaced H.264, so Freetvarr must re-encode it. To check the method Freetvarr chose, run this command in a terminal in the `freetvarr` folder:

```sh
docker compose logs freetvarr | grep "\[live\] video"
```

The line ends with the reason:

- **`LIVE_TV_TRANSCODE=copy`**: H.264 passes through untouched. Remove the setting or set it to `auto`.
- **`not found; pass /dev/dri into the container`**: the container has no render device. Add [`docker-compose.override.yml`](/guide/hardware#hardware-transcoding). Without it, Freetvarr uses software, which plays but costs much more CPU.
- **`permission denied for uid ...`**: the container user lacks the render group. Set `RENDER_GID` in `.env` to the output of this command:

  ```sh
  stat -c %g /dev/dri/renderD128
  ```

  Then recreate the Freetvarr Docker container:

  ```sh
  docker compose up -d freetvarr
  ```

- **`VAAPI test encode failed`**: ffmpeg's error follows the reason. The graphics chip or its driver does not support the encode. Freetvarr uses software.
- **`is not one of auto, hardware, software, copy`**: `LIVE_TV_TRANSCODE` has a typo. Freetvarr uses software.

If the line says `software` and the channel stutters, the CPU is too slow for the software path. Choose a smaller stream or add hardware transcoding. See [Video handling](/guide/live-tv#video-handling).

## Missing captions

- Your broadcaster sends captions as Teletext or as DVB subtitles. Australian broadcasters send Teletext. Some players decode Teletext and some don't (it isn't a recording fault). See [Captions in other apps](/guide/live-tv#captions-in-other-apps).
- In Freetvarr's player, **Captions** in the **⋯** menu shows only for channels and recordings that carry Teletext subtitles, and some programmes have none. See [Captions](/guide/live-tv#captions).

## Chrome Live Caption

A black box titled **Live Caption** at the bottom of the Chrome window is Chrome's own speech-to-text, not Freetvarr's captions. Chrome makes the text from the sound of any video, so it can show words the broadcaster never sent. The **Captions** item in the video's menu can switch it on, but turning that item off later does not switch it off.

To switch it off:

1. Open `chrome://settings/accessibility` in Chrome.
2. Turn off **Live Caption**.

Freetvarr's own captions show inside the picture. Open **⋯** in the player and press **Captions** to show or hide them.

## Wrong timestamps

- Freetvarr uses the time zone you chose in setup. If Health warns that no zone is chosen and the system runs on `UTC`, or that the zone is not a known one, choose your zone in Settings → SYSTEM → Schedule. Freetvarr shows every time in that zone, on every device.
- A `TZ` in your `.env` only pre-fills the zone. The zone chosen in Settings wins. If `TZ` is wrong and no zone is chosen, choose one in Settings → SYSTEM → Schedule, or correct `TZ` (e.g. `Australia/Sydney`) and recreate the Docker containers:

  ```sh
  docker compose up -d
  ```

- TVHeadend follows the host clock's zone through its `/etc/localtime` mount. Set `TZ` in your `.env` to override it.

## CSRF secret

Freetvarr signs its CSRF cookie (the cookie that protects browser requests from forgery) with a secret it keeps in a file ([CSRF secret](/guide/configuration#csrf-secret)).

- **Exit on start with a message about `CONFIG_PATH`**: Freetvarr could not write its `csrf-secret` file. Check that `CONFIG_PATH` is owned by `PUID:PGID`.
- **Reset the secret**: delete `${CONFIG_PATH}/freetvarr/csrf-secret` and restart Freetvarr:

  ```sh
  docker compose restart freetvarr
  ```

  Freetvarr generates a new secret, and browsers get a fresh CSRF token automatically. Nothing else breaks.

## Source install errors

Running Freetvarr from source (`npm start`) rather than in Docker fails at `better-sqlite3`.

- Freetvarr needs Node `24` (`package.json` sets `engines`), and the pinned `better-sqlite3` ships prebuilt binaries for it. On a Node version with no prebuilt binary, `npm run setup` compiles `better-sqlite3` from source, which needs Python 3, `make`, and a C++ compiler. Use Node 24 instead. [Volta](https://volta.sh) picks the pinned version up from `package.json`. See the [deep dive](/deep-dive#local-development).

## Reporting a bug

Open an issue on [GitHub](https://github.com/furey/freetvarr/issues) with what you did, what you expected, and what happened. Include your versions: **VERSIONS** in Settings → ABOUT → About Freetvarr lists the Freetvarr, TVHeadend, and Node versions and the **Uptime** of Freetvarr (how long it has been running), and **Copy** puts them on the clipboard. It also says whether a newer Freetvarr release is out; press the new version for the update steps ([Updating Freetvarr](/guide/updating#update)).
