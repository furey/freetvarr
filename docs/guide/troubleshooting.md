---
title: Troubleshooting
description: 'Fixes keyed by symptom: the TVHeadend login, the wizard checks, tuners, channels, the guide, logos, imports, and Plex.'
---

# Troubleshooting

Each section below starts from what you see, then gives the cause and the fix. The sections follow the order of a first install: TVHeadend, the Freetvarr wizard, the tuner and channels, the guide, then imports and Plex.

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

TVHeadend's default configuration accepts HTTP Digest logins only, and Freetvarr answers Digest. To test the login outside Freetvarr, run this from a machine on the LAN. A `200` means the login works; a `403` means it does not.

```sh
curl --digest -u <user>:<password> -o /dev/null -w '%{http_code}\n' \
  http://<host-ip>:9981/api/serverinfo
```

## Wizard connection test

`SAVE & NEXT` on the TVHeadend step runs `TEST CONNECTION` and stays on the step until it passes. `SKIP TO SETTINGS` leaves the wizard if TVHeadend is not ready yet.

- **"TVHeadend URL is not configured"**: set the URL. Under host networking it's `http://<host-ip>:9981`, not `http://tvheadend:9981`; neither container is on a Docker bridge network, so container names don't resolve.
- **`TVHeadend request failed: ECONNREFUSED`**, **`ECONNABORTED`** (a timeout), or **`EHOSTUNREACH`**: TVHeadend isn't running, or isn't on that address and port. Run `docker compose logs tvheadend` first.
- **`TVHeadend request failed: ENOTFOUND`**: the hostname in the URL doesn't resolve. Use the host's IP address.
- **`AUTO-DISCOVER TVHEADEND` finds nothing**: no TVHeadend answered on port `9981` at any address of the host. Type the URL yourself, or set `TVH_URL` in `.env` ([Configuration](/guide/configuration)).
- **`Connected` with `0 channels`**: TVHeadend has no enabled channels yet. See [No channels](#no-channels).
- **`Connected` with `0 tuners`**: the Freetvarr user lacks **Admin**, or TVHeadend sees no tuner. See [Missing tuner](#missing-tuner).

## TVHeadend admin login

The TVHeadend web UI answers `403 Forbidden` to the admin login: the password TVHeadend stored is not the one you are typing. [TVHeadend step 2](/guide/tvheadend#_2-first-run-wizard) says how to reset it with `--noacl`.

## TEST PATH failures

`TEST PATH` checks a folder inside the Freetvarr container, not on the host.

- **"/recordings does not exist inside the container"**: the compose file doesn't mount a folder at that path. Check the `volumes:` of the `freetvarr` service, then run `docker compose up -d freetvarr` to apply the change.
- **"is not readable by the container user"** or **"is not writable by the container user"**: the host folder belongs to a different user from `PUID`/`PGID`. Run `ls -ln` on the host folder, then `chown` it to the `PUID:PGID` pair both containers run as. A bind-mount folder that Docker created for you belongs to `root`.
- **"sits on a different filesystem from the media root, so imports copy each file"**: this is a notice, not a failure. Imports still work. Put `recordings/` and `media/tv` on one filesystem to make them hardlinks.

## CHECK TVHEADEND mismatch

`CHECK TVHEADEND` reads the recording path from TVHeadend's default DVR profile and compares it with the "Recordings folder (as TVHeadend sees it)" field.

- **"TVHeadend has no recording path. Set one in its DVR profile."**: set **Recording system path** on the default profile ([TVHeadend step 7](/guide/tvheadend#_7-set-the-recording-path)).
- **"TVHeadend records to /x, not /recordings."**: change TVHeadend's path to the container path of its recordings mount (`/recordings` in the example compose), or put TVHeadend's path in the field. The field holds the path TVHeadend uses inside its own container, and that path must be the same host folder Freetvarr mounts. [The two recordings paths](/guide/configuration#the-two-recordings-paths) has the detail.

## Missing tuner

TVHeadend's **Configuration → DVB Inputs → TV adapters** is empty, or the wizard reports `0 tuners`.

- The TVHeadend container has to run with `network_mode: host` for a tuner it finds by network broadcast, such as an HDHomeRun or a SAT>IP server; those broadcasts don't cross Docker's private bridge network. A USB or PCIe tuner needs its `/dev/dvb` devices passed into the container instead.
- The tuner has to be on the same part of the network as the host; those broadcasts don't cross between subnets without extra setup. A tuner plugged straight into a spare NAS port gets a link-local `169.254.x.x` address. TVHeadend still finds it, but nothing else on the LAN can reach it ([Hardware](/guide/hardware#direct-to-a-spare-nas-port)).
- Check the tuner answers at all. On an HDHomeRun, open `http://<hdhr-ip>/tuners.html` in a browser; nothing there means a power or ethernet problem, not a TVHeadend one. See [Hardware](/guide/hardware#checking-the-signal). On a USB or PCIe tuner, check `/dev/dvb` exists on the host and inside the container.
- TVHeadend lists the tuner but Freetvarr reports `0 tuners`: the Freetvarr user lacks **Admin**, which TVHeadend requires for the tuner status.

## No channels

Freetvarr reports `0 channels`, or the TV Guide has no rows.

- Each tuner in **TV adapters** needs **Enabled** ticked and your network set in its **Networks** field ([TVHeadend step 3](/guide/tvheadend#_3-add-the-tuner)).
- Every mux in **Configuration → DVB Inputs → Muxes** ending `FAIL` means the wrong pre-defined mux list, or an antenna that doesn't reach that transmitter. Pick the list for the transmitter your antenna points at ([step 4](/guide/tvheadend#_4-scan-the-muxes)).
- Muxes `OK` but no channels: the services are not mapped yet. Press **Map all** under **Configuration → DVB Inputs → Services** ([step 5](/guide/tvheadend#_5-map-services-to-channels)).
- Freetvarr drops channels marked disabled in **Configuration → Channel/EPG → Channels**.

## Empty guide

The TV Guide shows channels but no programmes, or only about a day of them.

- Without an XMLTV feed you get only what the broadcast signal carries. In Australia that is about a day of thin data; UK and European Freeview carry up to seven days over the air. Set up the feed ([step 6](/guide/tvheadend#_6-load-the-xmltv-guide)).
- The TVHeadend log says `broadcasts tot= 0`: no feed channel is linked to a TVHeadend channel yet. Link them under **Configuration → Channel/EPG → EPG Grabber Channels**, then press **Re-run internal EPG grabbers**.
- With the feed loaded but one channel blank, that channel isn't linked to a feed channel. Fix it on the same screen.
- After installing a grabber script, restart TVHeadend. It looks for grabbers at startup only, so a running instance never sees a new one.
- Freetvarr holds the guide for an hour. Press `⟳ REFRESH` on the TV Guide after you fix TVHeadend.

## Missing channel logos

Freetvarr takes each channel's logo from TVHeadend's own channel icon first, then from the icon the guide feed lists for that channel (the XMLTV `<channel>` `<icon>`). A channel with neither shows its name only.

- **TVHeadend prefers picons, but none are installed**: with picons preferred and no picon files, TVHeadend reports no icon for any channel. In **Configuration → General → Base**, untick the preference for picons, or install picons and set the picon path. Switch the view level to Expert if the picon fields are hidden.
- **The feed icon doesn't load**: feed icons are usually links to the internet, and the Freetvarr container fetches them itself. Check the container has outbound internet access: `docker exec freetvarr node -e "fetch('https://example.com').then((r) => console.log(r.status))"` prints `200` when it does.
- **The Freetvarr user lacks Admin**: TVHeadend serves the guide feed's channel list to admin users only, so the feed fallback finds no icons.
- **The feed channel is unlinked**: a feed icon only reaches a TVHeadend channel through the link in **EPG Grabber Channels**.

## Missing programme images

Programme images come from the guide feed's `<programme>` `<icon>` entries. Over-the-air guide data carries none, and not every XMLTV feed includes them. A programme without an image shows its text only; nothing in Freetvarr needs fixing. The container needs outbound internet access to fetch images from an external feed, as for [channel logos](#missing-channel-logos).

## Recordings an hour out after a clock change

Recordings on the days after a daylight-saving change start an hour early or late, often after a TVHeadend restart. The over-the-air EIT guide data of some broadcasters carries the wrong UTC offset after the change, and TVHeadend uses it until the XMLTV feed covers those dates. The author saw this in Sydney after `2026-10-04`.

- Press **Re-run internal EPG grabbers** under **Configuration → Channel/EPG → EPG Grabber**, then check the times in the **Electronic Program Guide** tab.
- Keep the XMLTV module at a higher priority than EIT ([Guide priority](/guide/tvheadend#guide-priority)).

## Scheduled recordings vanished

Upcoming recordings from series rules disappear after TVHeadend crashes or restarts, and return when the guide reloads. The autorec purge removes its scheduled entries while the guide is empty, and with both save options off the guide is empty after a restart.

- Turn on periodic save and save after import ([Saving the guide](/guide/tvheadend#saving-the-guide)).
- Press **Re-run internal EPG grabbers** to reload the guide now; the rules schedule again from it.

## Duplicate episode recordings

TVHeadend records the same episode twice in a row. The DVR profile's **Re-record if errors** setting is `10` by default, and a recording with more data errors than that schedules a repeat. Freetvarr shows the first recording as Recorded with a data-error warning, not as failed. Set the option to `0` ([TVHeadend step 7](/guide/tvheadend#_7-set-the-recording-path)).

## Setup wizard keeps opening

TVHeadend's first-run wizard opens on every page load. The `wizard` value in **Configuration → General → Base** is still set because the wizard never finished. Open the wizard and finish or cancel it, and the value clears ([TVHeadend step 2](/guide/tvheadend#_2-first-run-wizard)).

## Unimported recordings

TVHeadend finished a recording, but nothing appears on the Recordings tab or in Plex.

- **No followed show matches it.** Freetvarr imports only recordings whose title contains the pattern of a followed show ([Following shows](/guide/following-shows)). Add a follow for it.
- **The show is disabled.** Scheduled syncs skip a disabled show.
- **The sync hasn't run yet.** The default schedule is every `30` minutes (`*/30 * * * *`). Press Sync now to run one at once.
- **It came in as `skipped` or `partial`.** See the next two sections.

## Skipped recordings

The error text says which of the two causes it was:

- **"file not found" or no filename**: TVHeadend has no finished file yet. A recording in progress lands here, and post-recording padding keeps it there for up to ten minutes after the programme ends. The next sync picks it up.
- **"outside the recordings mount"**: TVHeadend reported a path Freetvarr can't translate. The two paths have to line up; run `CHECK TVHEADEND` in Settings and see [the two recordings paths](/guide/configuration#the-two-recordings-paths).

## Partial recordings

- The imported file came up more than `1 MB` short of what TVHeadend reported. The next sync redoes the import. If it stays `partial`, the source itself is short: check TVHeadend's own status for that entry, which usually reports data errors from a weak signal.

## Slow imports

- A hardlink import is instant. If you're watching a progress bar, Freetvarr is copying, which means the recordings folder and the media library are on different filesystems. Put them on one filesystem and the copy becomes a link.

## Repeat recordings

TVHeadend records a repeat of an episode that Freetvarr already imported, and the next sync imports it again.

- **The repeat has no episode number in the guide.** Freetvarr's series recordings skip a repeat only when both airings carry the same season and episode number. Some free-to-air guides drop the number from daytime repeats. Cancel that repeat in TVHeadend's **Upcoming / Current Recordings** tab.
- **The kept entry is gone.** With [Remove after import](/guide/remove-from-tvheadend) on, TVHeadend keeps an entry for each imported episode in its **Removed Recordings** tab. Delete that entry and TVHeadend no longer knows the episode was recorded. The same happens when you press **Remove** on a finished recording in TVHeadend's own UI while the DVR profile's **Recording info retention period** is `On file removal` (the default).

## TVHeadend crash on start

TVHeadend stops with a segfault (signal `11`) just after it logs `Purging obsolete autorec entries for current schedule`.

- This is a TVHeadend bug: the purge reads freed memory after it drops a scheduled entry. Commit [`5acec7ee5`](https://github.com/tvheadend/tvheadend/commit/5acec7ee5c294d887b6ad9858d664e36f095df8c) (`2026-09-20`) fixes it. Update TVHeadend to a build that includes it.
- Back up TVHeadend's `/config` folder before you update the image.

## Permission errors

An import fails with a permission error, or the TVHeadend file won't delete.

- Set `PUID`/`PGID` to match the owner of the bind-mounted host folders, and use the same pair for both services. Freetvarr hardlinks and deletes files TVHeadend created, so a mismatch shows up as a permission error at exactly those two steps.

## Plex not refreshing

Episodes import, but Plex doesn't show them.

- Press `⟳ REFRESH PLEX NOW` in Settings. It reports `Plex refresh sent (HTTP 200).` or the error.
- **`Plex HTTP 401`**: the token is wrong or expired. Detect or paste it again ([Plex](/guide/plex#the-token)).
- **`Plex HTTP 404`**: the section ID doesn't exist. Pick the TV section again from the list.
- **`ECONNREFUSED` or `ECONNABORTED`**: the Plex URL is wrong, or Plex isn't running. Use `http://<plex-host-ip>:32400`.
- **The refresh succeeds but nothing appears**: the Plex library doesn't include the folder Freetvarr writes to. Add the host folder `${DATA_PATH}/media/tv` to the library ([Plex](/guide/plex#the-library-folder)).

## Plex token auto-detect

- It needs Plex's `Preferences.xml` bind-mounted into the container (`PLEX_PREFS_PATH`), which only works when Plex runs on the same host. [Plex](/guide/plex#the-token) lists where the file lives.
- **"Preferences.xml not found at /plex-preferences.xml"**: `PLEX_PREFS_PATH` is unset or points at the wrong host file, so the mount is empty. Fix the path in `.env` and run `docker compose up -d freetvarr`.
- Paste the token manually instead; grab it from `app.plex.tv` (or Plex's own support article on finding your token).

## Container name lookups

Other containers can't reach Freetvarr by name.

- A side-effect of host networking: Freetvarr isn't on any Docker bridge network. Reach it via the host's LAN IP and `FREETVARR_PORT` instead.

## Ad detection errors

Ad detection is cutting the wrong things, or missing breaks.

- Ad detection is educated guessing, never perfect. Comskip's accuracy varies a lot by channel (logo detection, silence thresholds, and break lengths all differ).
- Run the show in `DETECT` mode first and check the break counts and minutes it reports on the Recordings tab before switching to `CUT`. Scans work the CPU hard: budget ~30 minutes per 75-minute recording on a home NAS.
- Cuts land on the nearest keyframe, so a second or two either side of a break is normal.
- To tune detection, place your own `comskip.ini` in the `/config` bind mount; it overrides the bundled default, which the author tuned for Australian channels. Outside Australia, expect to tune your own. Every cut keeps a `<file>.ts.orig` backup for the retention window, so if a cut goes wrong you can rename the `.orig` back to recover it. See [Ad removal](/guide/ad-removal).

## Playback failed on HD channels

Chrome shows "Playback failed" or a black player on an HD channel, while SD channels play. Chrome cannot decode interlaced H.264, so Freetvarr must re-encode it. Check the method it chose:

```sh
docker compose logs freetvarr | grep "\[live\] video"
```

The line ends with the reason:

- **`LIVE_TV_TRANSCODE=copy`**: H.264 passes through untouched. Remove the setting or set it to `auto`.
- **`not found; pass /dev/dri into the container`**: the container has no render device. Add [`docker-compose.override.yml`](/guide/hardware#hardware-transcoding). Without it, Freetvarr uses software, which plays but costs much more CPU.
- **`permission denied for uid ...`**: the container user lacks the render group. Set `RENDER_GID` in `.env` to the output of `stat -c %g /dev/dri/renderD128`, then recreate the container.
- **`VAAPI test encode failed`**: ffmpeg's error follows the reason. The graphics chip or its driver does not support the encode. Freetvarr uses software.
- **`is not one of auto, hardware, software, copy`**: `LIVE_TV_TRANSCODE` has a typo. Freetvarr uses software.

If the line says `software` and the channel stutters, the CPU is too slow for the software path. Choose a smaller stream or add hardware transcoding. See [Video handling](/guide/live-tv#video-handling).

## Missing captions

- Your broadcaster sends captions as Teletext or as DVB subtitles; Australian broadcasters send Teletext. Some players decode Teletext and some don't; it isn't a recording fault. See [Live TV](/guide/live-tv#captions).

## Wrong timestamps

- Set `TZ` in your `.env` to your IANA timezone; the UI shows every timestamp in the container's zone, whatever device you're browsing from.

## Source install errors

Running Freetvarr from source (`npm start`) rather than in Docker fails at `better-sqlite3`.

- Freetvarr needs Node `24` (`package.json` sets `engines`), and the pinned `better-sqlite3` ships prebuilt binaries for it. On a Node version with no prebuilt binary, `npm run setup` compiles `better-sqlite3` from source, which needs Python 3, `make`, and a C++ compiler. Use Node 24 instead; [Volta](https://volta.sh) picks the pinned version up from `package.json`. See the [deep dive](/deep-dive#local-development).
