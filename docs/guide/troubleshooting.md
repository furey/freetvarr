---
title: Troubleshooting
description: 'Fixes keyed by symptom: the TVHeadend login, the wizard checks, tuners, channels, the TV guide, logos, imports, and Plex.'
---

# Troubleshooting

Run the [Doctor](/guide/doctor) first (**Settings → HELP → RUN DOCTOR**). It checks TVHeadend, the TV guide, the folders, and Plex, and links each problem it finds to the section below that fixes it.

Each section starts from what you see, then gives the cause and the fix. The sections follow the order of a first install.

> [!NOTE]<br>
> Where a fix below names an HDHomeRun or an Australian broadcaster, that is the author's own setup. Each such entry says what to do with a different tuner or in another country.

## TVHeadend 401 or 403

Freetvarr shows `Failed: TVHeadend rejected the credentials (HTTP 401).` or the same with `HTTP 403`, in the wizard, in Settings, or on a tab that reads from TVHeadend. Settings adds the API path that failed, such as `(stage: serverinfo)`.

- **`401` with an empty username**: TVHeadend asks for a login and Freetvarr sent none. Enter the username and password of the TVHeadend user ([TVHeadend step 8](/guide/tvheadend#_8-make-a-user-for-freetvarr)).
- **`403` at `serverinfo`**: TVHeadend refused the login. Check these in order:
  1. The password. TVHeadend keeps it under **Configuration → Users → Passwords**, not on the access entry. The password entry needs **Enabled** ticked and the same username as the access entry.
  2. The access entry has **Enabled** ticked.
  3. **Allowed networks** on the access entry includes the address Freetvarr connects from. Under host networking that is the host's LAN address. A URL of `http://127.0.0.1:9981` connects from `127.0.0.1` instead, which a LAN prefix does not cover.
- **`403` at a later stage** (`status/inputs`, `dvr/entry/…`, `epggrab/channel/grid`): the login works but the user lacks a right. Tick the rights in [the rights table](/guide/tvheadend#_8-make-a-user-for-freetvarr), and keep **Rights** ticked in the entry's **Change parameters**.
- **The order of entries**: access entries are an ordered list, evaluated top to bottom, so a broader entry above yours can win.

TVHeadend's default configuration accepts HTTP Digest logins only, and Freetvarr answers Digest. To test the login outside Freetvarr, run this command in a terminal on a computer on your home network. A `200` means the login works; a `403` means it does not.

```sh
curl --digest -u <user>:<password> -o /dev/null -w '%{http_code}\n' \
  http://<host-ip>:9981/api/serverinfo
```

## Wizard connection test

`SAVE & NEXT` on the TVHeadend step runs `TEST CONNECTION` and stays on the step until it passes. `FINISH LATER` leaves the wizard after you confirm, and keeps what you saved. Freetvarr cannot record until TVHeadend is connected. To resume, open `Settings → Setup wizard → REOPEN WIZARD`.

- **"TVHeadend URL is not configured"**: set the URL. Under host networking it's `http://<host-ip>:9981`, not `http://tvheadend:9981` (neither Docker container is on a Docker bridge network, so container names don't resolve).
- **`TVHeadend request failed: ECONNREFUSED`**, **`ECONNABORTED`** (a timeout), or **`EHOSTUNREACH`**: TVHeadend isn't running, or isn't on that address and port. To read TVHeadend's log, run `docker compose logs tvheadend` in a terminal in the `freetvarr` folder.
- **`TVHeadend request failed: ENOTFOUND`**: the hostname in the URL doesn't resolve. Use the host's IP address.
- **`AUTO-DISCOVER TVHEADEND` finds nothing**: no TVHeadend answered on port `9981` at any address of the host. Type the URL yourself, or set `TVH_URL` in `.env` ([Configuration](/guide/configuration)).
- **`Connected` with `0 channels`**: TVHeadend has no enabled channels yet. See [No channels](#no-channels).
- **`Connected` with `0 tuners`**: the Freetvarr user lacks **Admin**, or TVHeadend sees no tuner. See [Missing tuner](#missing-tuner).

## TVHeadend admin login

TVHeadend's web interface answers `403 Forbidden` to the admin login: the password TVHeadend stored is not the one you are typing. [Securing by hand](/guide/tvheadend#securing-by-hand) says how to reset it with `--noacl`.

## TEST PATH failures

`TEST PATH` checks a folder inside the Freetvarr Docker container, not on the host.

- **"/data/recordings does not exist inside the container"**: the Docker compose file doesn't mount a folder at that path. Check the `volumes:` of the `freetvarr` service, then run `docker compose up -d freetvarr` in a terminal in the `freetvarr` folder to apply the change.
- **"is not readable by the container user"** or **"is not writable by the container user"**: the host folder belongs to a different user from `PUID`/`PGID`. In a terminal on the host, run `ls -ln` on the host folder, then `chown` it to the `PUID:PGID` pair both containers run as. The `init` service gives the subfolders of `CONFIG_PATH` and `DATA_PATH` to `PUID:PGID` on every start, so this appears only when you change `PUID`/`PGID` or put other folders in the mount. Fix the folder the message names.
- **"is on the same disk as the media root but in a separate mount, so imports copy each file"**: this is a notice, not a failure. Imports still work. Mount one folder that holds both `recordings/` and `media/`, as in [One shared mount](/guide/configuration#one-shared-mount), to make them hardlinks.
- **"is on a different disk from the media root, so imports copy each file"**: this is a notice, not a failure. Imports still work. Move `recordings/` and `media/` onto one disk, then mount one folder that holds both.

## CHECK TVHEADEND mismatch

`CHECK TVHEADEND` reads the recording path from TVHeadend's default DVR profile and compares it with the "Recordings folder (as TVHeadend sees it)" field.

- **"TVHeadend has no recording path. Set one in its DVR profile."**: set **Recording system path** on the default profile ([TVHeadend step 7](/guide/tvheadend#_7-set-the-recording-path)).
- **"TVHeadend records to /x, not /recordings."**: change TVHeadend's path to the container path of its recordings mount (`/recordings` in the example Docker compose file), or put TVHeadend's path in the field. The field holds the path TVHeadend uses inside its own container, and that path must be the same host folder Freetvarr mounts, as `recordings_root`. [The two recordings paths](/guide/configuration#the-two-recordings-paths) has the detail.

## Missing tuner

In TVHeadend's web interface, **Configuration → DVB Inputs → TV adapters** is empty, or Freetvarr's setup wizard reports `0 tuners`.

- The TVHeadend container has to run with `network_mode: host` for a tuner it finds by network broadcast, such as an HDHomeRun or a SAT>IP server (those broadcasts don't cross Docker's private bridge network). A USB or PCIe tuner needs its `/dev/dvb` devices passed into the container instead.
- On a Mac or Windows PC, Docker Desktop and OrbStack cannot find a network tuner on their own. In the wizard's `CHANNELS` step, enter the tuner's IP address and this computer's IP address, then press `USE THIS ADDRESS`. The Doctor's **Tuners** check links to the wizard. Or run Freetvarr with Docker on Linux (a NAS, mini PC, or Raspberry Pi).
- The tuner has to be on the same part of the network as the host (those broadcasts don't cross between subnets). For a tuner on another subnet, press **Enter the tuner's address** in the wizard's `CHANNELS` step. A tuner plugged straight into a spare NAS port gets a link-local `169.254.x.x` address. TVHeadend still finds it, but nothing else on the LAN can reach it ([Hardware](/guide/hardware#direct-to-a-spare-nas-port)).
- Check the tuner answers at all. On an HDHomeRun, open `http://<hdhr-ip>/tuners.html` in a browser. If the page does not load, the tuner has a power or network cable problem, not a TVHeadend one. See [Hardware](/guide/hardware#checking-the-signal). On a USB or PCIe tuner, check `/dev/dvb` exists on the host and inside the container.
- TVHeadend lists the tuner but Freetvarr reports `0 tuners`: the Freetvarr user lacks **Admin**, which TVHeadend requires for the tuner status.

## No channels

Freetvarr reports `0 channels`, or the TV Guide has no rows.

- Each tuner in **TV adapters** needs **Enabled** ticked and your network set in its **Networks** field ([TVHeadend step 3](/guide/tvheadend#_3-add-the-tuner)).
- Every mux in **Configuration → DVB Inputs → Muxes** ending `FAIL` means the wrong pre-defined mux list, or an antenna that doesn't reach that transmitter. Pick the list for the transmitter your antenna points at ([step 4](/guide/tvheadend#_4-scan-the-muxes)).
- Muxes `OK` but no channels: the services are not mapped yet. Press **Map all** under **Configuration → DVB Inputs → Services** ([step 5](/guide/tvheadend#_5-map-services-to-channels)).
- Freetvarr drops channels marked disabled in **Configuration → Channel/EPG → Channels**.

## Empty guide

The TV Guide shows channels but no programmes, or only about a day of them.

- Without an XMLTV feed you get only what the broadcast signal carries. In Australia that is about a day of thin data. UK and European Freeview carry up to seven days over the air. Set up the feed ([step 6](/guide/tvheadend#_6-load-the-xmltv-guide)).
- TVHeadend's log (`docker compose logs tvheadend`) says `broadcasts tot= 0`: no feed channel is linked to a TVHeadend channel yet. In TVHeadend's web interface, link them under **Configuration → Channel/EPG → EPG Grabber Channels**, then press **Re-run internal EPG grabbers**.
- With the feed loaded but one channel blank, that channel isn't linked to a feed channel. See [Wrong programmes on a channel](#wrong-programmes-on-a-channel).
- After you install a grabber script, restart TVHeadend (`docker compose restart tvheadend`). TVHeadend looks for grabbers at startup only, so a running TVHeadend never loads a new one.
- Freetvarr keeps a copy of the TV guide for an hour, or a minute when it has no programmes. Freetvarr loads the TV guide again after guide setup and after a guide link change. After you fix TVHeadend, press `REFRESH` on the TV Guide.

## Wrong programmes on a channel

The TV Guide shows another channel's programmes on a channel, or no programmes on one channel while others have them. The channel is linked to the wrong guide channel, or to none.

- On the TV Guide, press `CHANNELS`, press the pencil (**Change listings**) next to the channel, pick the matching guide channel, then press `SAVE`. See [Channel listings](/guide/tv-guide#channel-listings).
- Series recordings match on title and channel, so check the `UPCOMING` view after you change a link.

## Missing channel logos

Freetvarr takes each channel's logo from TVHeadend's own channel icon first, then from the icon the XMLTV guide feed lists for that channel (the XMLTV `<channel>` `<icon>`). A channel with neither shows its name only.

- **TVHeadend prefers picons, but none are installed**: with picons preferred and no picon files, TVHeadend reports no icon for any channel. In TVHeadend's web interface, open **Configuration → General → Base** and untick the preference for picons, or install picons and set the picon path. Switch the view level to Expert if the picon fields are hidden.
- **The feed icon doesn't load**: feed icons are usually links to the internet, and the Freetvarr container fetches them itself. To check that the Freetvarr Docker container has outbound internet access, run `docker exec freetvarr node -e "fetch('https://example.com').then((r) => console.log(r.status))"` in a terminal on the host (it outputs `200` when it does).
- **The Freetvarr user lacks Admin**: TVHeadend serves the guide feed's channel list to admin users only, so the feed fallback finds no icons.
- **The feed channel is unlinked**: a feed icon only reaches a TVHeadend channel through the link in **EPG Grabber Channels**.

## Missing programme images

Programme images come from the guide feed's `<programme>` `<icon>` entries. Over-the-air guide data carries none, and not every XMLTV feed includes them. A programme without an image shows its text only; nothing in Freetvarr needs fixing. The Freetvarr Docker container needs outbound internet access to fetch images from an external feed, as for [channel logos](#missing-channel-logos).

## Recordings an hour out after a clock change

Recordings on the days after a daylight-saving change start an hour early or late, often after a TVHeadend restart. The over-the-air EIT guide data of some broadcasters carries the wrong UTC offset after the change, and TVHeadend uses it until the XMLTV feed covers those dates. The author saw this in Sydney after `2026-10-04`.

- In TVHeadend's web interface, press **Re-run internal EPG grabbers** under **Configuration → Channel/EPG → EPG Grabber**, then check the times in the **Electronic Program Guide** tab.
- Keep the XMLTV module at a higher priority than EIT ([Guide priority](/guide/tvheadend#guide-priority)).

## Scheduled recordings vanished

Upcoming recordings from series recordings disappear after TVHeadend crashes or restarts, and return when the guide reloads. While the TV guide is empty, TVHeadend removes the scheduled entries of each autorec. With both of TVHeadend's guide save options off, the TV guide is empty after a restart.

- Turn on periodic save and save after import ([Saving the guide](/guide/tvheadend#saving-the-guide)).
- In TVHeadend's web interface, press **Re-run internal EPG grabbers** to reload the TV guide now (the series recordings schedule again from it).

## Duplicate episode recordings

TVHeadend records the same episode twice in a row. The DVR profile's **Re-record if errors** setting is `10` by default, and a recording with more data errors than that schedules a repeat. Freetvarr shows the first recording as Recorded with a data-error warning, not as failed. In TVHeadend's DVR profile, set **Re-record if errors** to `0` ([TVHeadend step 7](/guide/tvheadend#_7-set-the-recording-path)).

## Setup wizard keeps opening

TVHeadend's first-run wizard opens on every page load. The `wizard` value in **Configuration → General → Base** is still set because the wizard never finished. Open TVHeadend's first-run wizard and finish or cancel it, and the value clears ([Securing by hand](/guide/tvheadend#securing-by-hand)).

## Unimported recordings

TVHeadend finished a recording, but nothing appears on the Recordings tab or in your library.

- **No series folder matches it.** Freetvarr imports only recordings whose title contains the title of a series folder ([Series](/guide/series)). Press **RECORD SERIES** in the TV Guide, or use **ADD TITLE** in [TITLE MATCHES](/guide/series#title-matches).
- **The folder is off.** Scheduled syncs skip a series folder that is switched off.
- **The sync hasn't run yet.** The default **Sync schedule** is `Every 30 minutes`. Press `SYNC NOW` on the dashboard to run one at once.
- **It came in as `skipped` or `partial`.** See the next two sections.

## Skipped recordings

The row's error text on the Recordings tab says which of the two causes it was:

- **"file not found" or no filename**: TVHeadend has no finished file yet. A recording in progress shows this, and post-recording padding can keep it here for up to ten minutes after the programme ends. The next sync picks it up.
- **"outside the recordings mount"**: TVHeadend reported a path Freetvarr can't translate. The two recordings paths have to match. Press `CHECK TVHEADEND` in Settings, and see [the two recordings paths](/guide/configuration#the-two-recordings-paths).

## Partial recordings

- The imported file came up more than `1MB` short of what TVHeadend reported. The next sync imports the file again. If it stays `partial`, the source itself is short. In TVHeadend's web interface, check the status of that entry (it usually reports data errors from a weak signal).

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

- Press `REFRESH PLEX NOW` in Settings. Freetvarr reports `Plex refresh sent (HTTP 200).` or the error.
- **`Plex HTTP 401`**: the Plex token is wrong or expired. In Settings, detect or paste the Plex token again ([Plex](/guide/plex#the-token)).
- **`Plex HTTP 404`**: the section ID doesn't exist. In Settings, pick the TV section again from the list.
- **`ECONNREFUSED` or `ECONNABORTED`**: the Plex URL is wrong, or Plex isn't running. Use `http://<plex-host-ip>:32400`.
- **The refresh succeeds but nothing appears**: the Plex library doesn't include the folder Freetvarr writes to. Add the host folder `${DATA_PATH}/media/tv` to the library ([Plex](/guide/plex#the-library-folder)).

## Plex token auto-detect

- Auto-detect needs Plex's `Preferences.xml` inside the Freetvarr Docker container. The `plex` profile mounts it for you. For another Plex on the same host, set `PLEX_PREFS_PATH` in the `.env`. [Plex](/guide/plex#the-token) lists where the file lives.
- **"Preferences.xml not found at /plex/Library/…"**: the `plex` profile is not running, and `PLEX_PREFS_PATH` is unset. Start the profile, or set the path in `.env`, then run `docker compose up -d freetvarr`.
- **"Preferences.xml not found at /plex-preferences.xml"**: `PLEX_PREFS_PATH` points at the wrong host file, so the mount is empty. Fix the path in `.env` and run `docker compose up -d freetvarr`.
- Or paste the Plex token into Settings yourself. Copy it from `app.plex.tv` (or follow Plex's own support article on finding your token).

## Container name lookups

Other containers can't reach Freetvarr by name.

- Under host networking, Freetvarr is on no Docker bridge network. Use the host's LAN IP and `FREETVARR_PORT` instead.

## Ad detection errors

Ad detection is cutting the wrong things, or missing breaks.

- Ad detection is never perfect. Comskip's accuracy varies a lot by channel.
- Set the series to `DETECT` mode first and check the break counts and minutes it reports on the Recordings tab before switching to `CUT`. Allow about 30 minutes of scan per 75-minute recording on a home NAS.
- Cuts snap to the nearest keyframe, so a second or two either side of a break is normal.
- To tune detection, place your own `comskip.ini` in the `/config` bind mount. Your file overrides the bundled default, which the author tuned for Australian channels. Outside Australia, expect to tune your own. If a cut goes wrong, rename its `<file>.ts.orig` backup back to recover the original. See [Ad removal](/guide/ad-removal).

## Playback failed on HD channels

Chrome shows "Playback failed" or a black player on an HD channel, while SD channels play. Chrome cannot decode interlaced H.264, so Freetvarr must re-encode it. To check the method Freetvarr chose, run this command in a terminal in the `freetvarr` folder:

```sh
docker compose logs freetvarr | grep "\[live\] video"
```

The line ends with the reason:

- **`LIVE_TV_TRANSCODE=copy`**: H.264 passes through untouched. Remove the setting or set it to `auto`.
- **`not found; pass /dev/dri into the container`**: the container has no render device. Add [`docker-compose.override.yml`](/guide/hardware#hardware-transcoding). Without it, Freetvarr uses software, which plays but costs much more CPU.
- **`permission denied for uid ...`**: the container user lacks the render group. Set `RENDER_GID` in `.env` to the output of `stat -c %g /dev/dri/renderD128`, then run `docker compose up -d freetvarr` to recreate the Freetvarr Docker container.
- **`VAAPI test encode failed`**: ffmpeg's error follows the reason. The graphics chip or its driver does not support the encode. Freetvarr uses software.
- **`is not one of auto, hardware, software, copy`**: `LIVE_TV_TRANSCODE` has a typo. Freetvarr uses software.

If the line says `software` and the channel stutters, the CPU is too slow for the software path. Choose a smaller stream or add hardware transcoding. See [Video handling](/guide/live-tv#video-handling).

## Missing captions

- Your broadcaster sends captions as Teletext or as DVB subtitles. Australian broadcasters send Teletext. Some players decode Teletext and some don't (it isn't a recording fault). See [Live TV](/guide/live-tv#captions).

## Wrong timestamps

- Freetvarr uses the time zone you chose in the wizard. If Doctor warns that no zone is chosen and the system runs on `UTC`, or that the zone is not a known one, choose your zone in Settings, in the SCHEDULE panel. Freetvarr shows every time in that zone, on every device.
- A `TZ` in your `.env` only pre-fills the zone. The zone chosen in Settings wins. If `TZ` is wrong and no zone is chosen, choose one in Settings, or correct `TZ` (e.g. `Australia/Sydney`) and run `docker compose up -d` to recreate the Docker containers.
- TVHeadend follows the host clock's zone through its `/etc/localtime` mount. Set `TZ` in your `.env` to override it.

## CSRF secret

- **Exit on start with a message about `CONFIG_PATH`**: Freetvarr could not write its `csrf-secret` file. Check that `CONFIG_PATH` is owned by `PUID:PGID`.
- **Reset the secret**: delete `${CONFIG_PATH}/freetvarr/csrf-secret` and restart Freetvarr (`docker compose restart freetvarr`). Freetvarr generates a new secret, and browsers get a fresh CSRF token automatically. Nothing else breaks.

## Source install errors

Running Freetvarr from source (`npm start`) rather than in Docker fails at `better-sqlite3`.

- Freetvarr needs Node `24` (`package.json` sets `engines`), and the pinned `better-sqlite3` ships prebuilt binaries for it. On a Node version with no prebuilt binary, `npm run setup` compiles `better-sqlite3` from source, which needs Python 3, `make`, and a C++ compiler. Use Node 24 instead. [Volta](https://volta.sh) picks the pinned version up from `package.json`. See the [deep dive](/deep-dive#local-development).

## Reporting a bug

Open an issue on [GitHub](https://github.com/furey/freetvarr/issues) with what you did, what you expected, and what happened. Include your versions: **VERSIONS** in **Settings → HELP** lists the Freetvarr, TVHeadend, and Node versions, and **COPY** puts them on the clipboard. It also says whether a newer Freetvarr release is out.
