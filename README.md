<p align="center">
  <img src="docs/img/logo.svg" alt="Freetvarr" width="240"/>
</p>

<p align="center">
  <strong>Watch live TV in your browser. Sync TVHeadend recordings into your media library.</strong><br/>
  A self-hosted companion for TVHeadend and compatible tuner.
</p>

<p align="center">
  <img alt="License: GPL-3.0-or-later" src="https://img.shields.io/badge/license-GPL--3.0--or--later-ff8a00.svg?style=flat-square"/>
  <img alt="Node 24+" src="https://img.shields.io/badge/node-24%2B-1eb6ff.svg?style=flat-square"/>
  <img alt="Docker" src="https://img.shields.io/badge/docker-compose-1eb6ff.svg?style=flat-square"/>
  <img alt="Last commit" src="https://img.shields.io/github/last-commit/furey/freetvarr.svg?style=flat-square&color=e2b03c"/>
  <img alt="No auth" src="https://img.shields.io/badge/auth-LAN%20only-8b837e.svg?style=flat-square"/>
  <a href="https://furey.github.io/freetvarr/"><img alt="Documentation" src="https://img.shields.io/badge/docs-vitepress-1eb6ff.svg?style=flat-square"/></a>
</p>

<p align="center">
  <a href="https://furey.github.io/freetvarr/"><strong>Read the documentation →</strong></a>
</p>

<p align="center">
  Leaving Fetch TV? See the <a href="https://furey.github.io/freetvarr/guide/leaving-fetch">step-by-step guide</a> to owning your setup before the levy.
</p>

<p align="center">
  Have a Plex Pass? Plex's own DVR may be all you need. See <a href="#why-not-just-plex-dvr">Why not just Plex DVR</a>.
</p>

## Contents

- [Screenshots](#screenshots)
- [What Freetvarr is](#what-freetvarr-is)
- [Where it works](#where-it-works)
- [Why not just TVHeadend](#why-not-just-tvheadend)
- [Why not just Plex DVR](#why-not-just-plex-dvr)
- [What Freetvarr isn't](#what-freetvarr-isnt)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Security](#security)
- [Technical deep dive](#technical-deep-dive)
- [Troubleshooting](#troubleshooting)
- [Disclaimer](#disclaimer)
- [Contributing](#contributing)
- [Support](#support)
- [Licence](#licence)

## Screenshots

<p align="center">
  <img src="docs/img/screenshot-dashboard.png" alt="Dashboard" width="100%"/>
  <br/><em>Dashboard</em>
</p>

<p align="center">
  <img src="docs/img/screenshot-live.png" alt="Live TV" width="100%"/>
  <br/><em>Live TV</em>
</p>

<p align="center">
  <img src="docs/img/screenshot-player.png" alt="Live TV player" width="100%"/>
  <br/><em>Live TV player</em>
</p>

<p align="center">
  <img src="docs/img/screenshot-guide.png" alt="TV Guide" width="100%"/>
  <br/><em>TV Guide</em>
</p>

<p align="center">
  <img src="docs/img/screenshot-series.png" alt="Series" width="100%"/>
  <br/><em>Series</em>
</p>

<p align="center">
  <img src="docs/img/screenshot-recordings.png" alt="Recordings" width="100%"/>
  <br/><em>Recordings</em>
</p>

<p align="center">
  <img src="docs/img/screenshot-syncs.png" alt="Syncs" width="100%"/>
  <br/><em>Syncs</em>
</p>

<p align="center">
  <img src="docs/img/screenshot-mobile-dashboard.png" alt="Dashboard on mobile" width="32%"/>
  <img src="docs/img/screenshot-mobile-live.png" alt="Live TV on mobile" width="32%"/>
  <img src="docs/img/screenshot-mobile-recordings.png" alt="Recordings on mobile" width="32%"/>
  <br/><em>Mobile</em>
</p>

Big Buck Bunny © Blender Foundation (CC BY 3.0)

## What Freetvarr is

**Freetvarr** watches TVHeadend on your home network, picks up every recording it finishes, files episodes of each series you record into your TV library as `Show/Season 01/Show - S01E02.ts` (or by air date when the TV guide has no episode number), files one-offs such as a sports final into a separate folder, asks Plex to scan its library if you use it, and optionally removes the TVHeadend copy once Plex confirms the file.

It is also a TV app for your home network. Open the Live TV tab on a phone or a desktop and watch any channel in the browser, with now and next for every channel and your favourites first. Pause and rewind up to `30` minutes, then jump back to live.

If your media stack is tuner → TVHeadend → media library, Freetvarr is the automation in between: schedule a series from its built-in TV Guide, and the episodes turn up in your library named and foldered. Any TVHeadend-compatible tuner counts: a network tuner such as an HDHomeRun, a USB DVB stick, a PCIe card, SAT>IP, or IPTV.

It's a fork of [Fetcharr](https://github.com/furey/fetcharr) with the recorder replaced. When Fetch TV announced its Gen 3 Extended Service Levy, the author swapped Fetcharr's Fetch pieces for TVHeadend one at a time to get his new HDHomeRun working. Only after all that did he notice that his own Plex Pass already covered [Plex DVR](https://furey.github.io/freetvarr/guide/plex-dvr). Without a Plex Pass, a tuner you own and a free guide cost nothing per year. See [Leaving Fetch TV](https://furey.github.io/freetvarr/guide/leaving-fetch), and [From Fetcharr](https://furey.github.io/freetvarr/guide/from-fetcharr) if you ran Fetcharr.

## Where it works

Everywhere TVHeadend works. Freetvarr talks only to TVHeadend's HTTP API and the recordings folder, so TVHeadend handles the broadcast standard: DVB-T/T2 (Australia, UK, Europe, New Zealand), DVB-C and DVB-S, ATSC (US and Canada), ISDB-T. Three things differ by country and all three are set up in TVHeadend, not here: the tuner model (a DVB-T tuner in Australia or the UK, an ATSC one in the US), the TV guide source (a free XMLTV feed in Australia and New Zealand, over-the-air Freeview EIT in the UK, Schedules Direct in the US), and the mux scan list. The docs walk through an Australian setup because that is where the author lives. Every Australian value in them is an example: swap the timezone, the mux list, the TV guide source, and the tuner model for your own region's. The bundled `comskip.ini` and the HD/SD channel aliases in the TV Guide are tuned for Australian channels but do no harm elsewhere.

Tested with an HDHomeRun Flex Quatro. The [hardware guide](https://furey.github.io/freetvarr/guide/hardware) says why the author recommends it and what else works.

## Why not just TVHeadend

TVHeadend on its own covers most of the job. Its web interface has a TV guide, one-off and series recording with padding and duplicate detection, and a filename template that can write library-ready paths (`$t/Season $s/$t - S$sE$e.$x`) straight into the library folder. Its DVR post-processor hook can run a script that calls Plex's refresh URL or comskip. If that is enough, use it and skip Freetvarr.

Freetvarr adds the parts TVHeadend leaves to you: a phone-friendly TV guide and dashboard, series folders with fuzzy matching to the folders your library already has, the Plex refresh and delete-after-confirm loop, the comskip detect/cut pipeline with a verified swap and `.orig` rollback, live progress, and a sync history you can read. It is a convenience layer on TVHeadend, not a replacement for it.

## Why not just Plex DVR

If you already have a Plex Pass, Plex's own Live TV & DVR may be all you need, and that is a fine choice. It records from a network tuner such as an HDHomeRun straight into your Plex library, with series recording, padding, ad skipping, and live TV in every Plex app. In Australia it needs an XMLTV guide feed, such as [i.mjh.nz](https://i.mjh.nz/au/), because Plex has no built-in Australian guide.

If you don't have a Plex Pass, compare its price (`A$110` a year, or `A$1,190` lifetime, in October 2026) with a free setup. TVHeadend and Freetvarr cost nothing, keep recording when Plex changes, play live TV in any browser, and keep the Teletext captions Australian channels send. [Plex DVR instead](https://furey.github.io/freetvarr/guide/plex-dvr) has the full comparison and a setup guide.

## What Freetvarr isn't

- ❌ **An indexer integration** (Sonarr / Radarr / Prowlarr): Freetvarr works with the recordings TVHeadend has made, and its TV Guide schedules what TVHeadend records next. It doesn't search the internet for content.
- ❌ **A tuner:** TVHeadend drives the hardware, scans the muxes, and writes the files. Freetvarr talks to TVHeadend's HTTP API and never touches the tuner.
- ❌ **Authenticated:** designed for a home network you trust. CSRF protection, rate limiting, and a strict content-security policy are in place, but there's no login, so anyone who can reach it can change its settings. Don't expose it to the internet (see [Security](#security)).
- ❌ **A converter:** files arrive from TVHeadend as `.ts` (the raw broadcast format) and stay `.ts`; Freetvarr never re-encodes them (only the live TV player re-encodes, and only what it streams to the browser). The optional ad-cutting copies the video across untouched, so there's no quality loss and no change of format. Add Tdarr or similar afterwards if you need `.mkv`.
- ❌ **A notifier:** no Discord / ntfy / push integration.

> [!IMPORTANT]<br>
> Tested against TVHeadend `4.3` fed by an HDHomeRun Flex Quatro, with Plex Media Server. Other tuners and TVHeadend versions are unverified.

## Features

- **Live TV in the browser**: watch any channel on a phone or a desktop. Freetvarr checks for a free tuner first and warns when a recording will need it within the hour. Pause and rewind up to `30` minutes, and double-tap to skip on a phone. It converts channels a browser can't play, in hardware through VAAPI when the host has it. See [Live TV](https://furey.github.io/freetvarr/guide/live-tv#in-freetvarr).
- **TV Guide**: a 7-day programme guide. Schedule, cancel, and series-record in TVHeadend, search the week, and put your favourite channels first. Freetvarr keeps the programmes that already aired today (TVHeadend drops them), and each day runs on to 3am so late-night viewing isn't cut off at midnight.
- **Recording Now panel**: the dashboard shows each active recording and its signal health, then shows it through import, ad cutting, and the Plex refresh.
- **Programme images**: the TV Guide and the dashboard show a programme's image when the XMLTV feed supplies one.
- **Series recording as autorec rules**: a series becomes one TVHeadend autorec rule matching title plus channel, with TVHeadend's own duplicate detection by episode number and `2`/`10` minute padding by default, because free-to-air broadcasts run late. The SERIES tab pauses, resumes, or stops each one and shows where its episodes save. Recording on an SD channel offers the HD simulcast instead.
- **Doctor**: a read-only health check of TVHeadend, the TV guide, the folders, Plex, and live TV, with the fix and a docs link for each problem.
- **First-run wizard**: sets up TVHeadend, channels, the TV guide, storage, and Plex. If Freetvarr installed TVHeadend for you, the wizard creates the admin and Freetvarr logins and closes TVHeadend's open access, with undo. It scans for channels and links the free TV guide feed for Australia and New Zealand. You can reopen it from Settings.
- **Series folders**: each series you record gets a folder under your media root, matched by name to an existing folder (even when the names are not identical), with a season template.
- **One-off recordings**: a recording that matches no series folder, such as a final or a special, goes to its own folder for a separate library. The RECORD dialog says where each recording will go, and can keep one out of the library.
- **Films**: with a movies folder set, a film with no series folder is filed as `Title (Year)` for a Movies library.
- **Recording playback**: play any finished recording in the browser player, with a seek bar and resume from where you stopped.
- **Saved artwork**: each recording keeps its programme image and channel logo, so the Recordings tab still shows them after the TV guide moves on.
- **Hardlink imports**: the recording is already on disk, so the import is a hardlink when Freetvarr sees the recordings folder and the media library through one mount, and a copy when it doesn't. A hardlink uses no extra disk space.
- **Library-ready filenames**: `Show - S01E02 - Title.ts`, or `Show - YYYY-MM-DD - Title.ts` when the TV guide gave no episode number.
- **Short-file detection**: an import more than `1MB` short of what TVHeadend reported stays `partial`, and the next sync imports it again.
- **Scheduled + manual sync**: checks TVHeadend on a schedule you choose (every 15 minutes, 30 minutes, or hour, or your own cron expression), plus `SYNC NOW` on the dashboard for everything, or **SYNC** on a single series.
- **Plex integration**: section refresh after every sync that imported something, plus a Refresh Plex now button. With no Plex yet, the Docker compose file can run one (`COMPOSE_PROFILES=plex`), and the wizard creates its TV, one-off, and movie libraries.
- **Remove after import**: once Plex confirms its copy, Freetvarr can delete the recording's file from TVHeadend.
- **Optional ad removal**: ad detection with comskip, a detect-only mode that writes a `.edl` file so Kodi skips the breaks, cutting that copies the video across untouched (no re-encode), and a `.orig` backup of every cut file. Off by default; detection accuracy on free-to-air varies by channel, so try detect mode before trusting cuts. See [`docs/DEEP_DIVE.md`](docs/DEEP_DIVE.md#ad-removal).
- **Live operation progress**: the Recordings tab shows the progress of each copy, ad scan, and cut. See [`docs/DEEP_DIVE.md`](docs/DEEP_DIVE.md#live-progress-indicators).
- **Self-housekeeping**: sync history trims itself to the latest 500 rows; recording rows drop off 30 days after the TVHeadend copy is deleted.
- **Timezone-aware UI**: the wizard asks for your time zone and pre-fills it from the browser. Timestamps show in that zone whatever device opens the page.
- **Phone-friendly UI**: every view works on a phone.
- **Help panel**: Settings reopens the setup wizard, runs the Doctor, and lists the Freetvarr, TVHeadend, and Node versions for bug reports. It also says when a newer Freetvarr release is out.
- **Reset**: **RESET FREETVARR** in Settings deletes Freetvarr's settings, series, list of recordings, and sync history, then returns to the setup wizard. Your video files and TVHeadend stay as they are.
- **Authless LAN service**: SQLite-backed, single Docker container, no external runtime dependencies once configured.

## Prerequisites

- A **TVHeadend-compatible tuner**. The [hardware guide](https://furey.github.io/freetvarr/guide/hardware) covers the choice. A USB tuner needs DVB drivers on the host, and most NAS operating systems do not have them.
- **Docker with Compose v2** on a host that stays on. For a network tuner such as an HDHomeRun, run Docker on Linux (a NAS, mini PC, or Raspberry Pi). Docker Desktop and OrbStack on a Mac cannot find a network tuner on their own; enter the tuner's IP address in the setup wizard's CHANNELS step instead. Freetvarr is untested on Windows, and the install script does not run there.
- **Plex Media Server** is optional.

## Quick start

### Install

In a terminal, run this command in the folder where you want a `freetvarr` folder to appear:

```sh
curl -fsSL https://raw.githubusercontent.com/furey/freetvarr/main/install.sh | sh
```

The script creates the `freetvarr` folder, downloads its Docker compose file, writes its `.env`, and asks for confirmation regarding project file ownership. It then starts the TVHeadend and Freetvarr Docker containers and outputs the URL of the setup wizard. Open that URL in a browser and work through the steps: time zone, TVHeadend, channels, guide, storage, Plex.

On a NAS or another remote host, sign in over SSH first. To install by hand or with a NAS container app, see [Getting started](https://furey.github.io/freetvarr/guide/getting-started#_1-install).

### Record something

In Freetvarr, open the TV Guide, click a programme, and press **RECORD** for one airing or **RECORD SERIES** for every episode. To change TVHeadend by hand, see the [TVHeadend guide](https://furey.github.io/freetvarr/guide/tvheadend).

### Configure

Every value in the `.env` is optional. Set `PUID` and `PGID` to your own user (`id -u` and `id -g`), then run `docker compose up -d` in the `freetvarr` folder to restart the Docker containers:

```env
PUID=1000
PGID=1000
CONFIG_PATH=./config
DATA_PATH=./data
FREETVARR_PORT=3733
```

[Configuration](https://furey.github.io/freetvarr/guide/configuration) covers every variable.

### Updating

In a terminal in the `freetvarr` folder, download the new Docker images, then restart the Docker containers:

```sh
docker compose pull
docker compose up -d
```

## Configuration

The TVHeadend URL and login, the Plex token, and the storage paths are runtime settings. Configure them in Freetvarr's Settings page in a browser, not in the `.env`. The `.env` next to the Docker compose file carries only deploy-level settings:

| Variable           | Purpose                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONFIG_PATH`      | Optional. Host folder for both Docker containers' config (default `./config`); Freetvarr's database lives in `${CONFIG_PATH}/freetvarr`                                                           |
| `DATA_PATH`        | Optional. Host folder (default `./data`) holding `recordings/` (TVHeadend's output) and `media/` (your TV library), and nothing else                                                              |
| `PLEX_PREFS_PATH`  | Optional. Path to Plex's `Preferences.xml`, used by the Auto-detect token button, for a Plex on this host that the `plex` profile did not start                                                   |
| `COMPOSE_PROFILES` | Optional. `plex` adds the Plex service, for a host with no media server yet                                                                                                                       |
| `PLEX_CLAIM`       | Optional, `plex` profile only. The claim code from `https://plex.tv/claim` (expires after 4 minutes)                                                                                              |
| `CSRF_SECRET`      | Optional override. Freetvarr otherwise generates a secret on first start and saves it to `${CONFIG_PATH}/freetvarr/csrf-secret`                                                                   |
| `TZ`               | Optional IANA timezone (e.g. `Australia/Sydney`). Pre-fills Freetvarr's time zone (a zone chosen in Settings wins), and applies to TVHeadend when set. TVHeadend otherwise follows the host clock |
| `PUID`/`PGID`      | Optional. UID and GID to run as (default `1000`); use your own user. Both Docker containers use the same pair                                                                                     |
| `FREETVARR_PORT`   | Host port to serve on (default `3733`)                                                                                                                                                            |
| `TVH_URL`          | Optional. Fixes the address AUTO-DISCOVER TVHEADEND offers; omit to let Freetvarr probe port `9981` on the host                                                                                   |

Freetvarr keeps two settings for one folder: `recordings_root` is where it sees TVHeadend's files, and `tvh_recordings_path` is the path TVHeadend reports in the filenames it hands out. In the example Docker compose file, TVHeadend sees the folder at `/recordings` and Freetvarr at `/data/recordings`. Freetvarr rewrites the one prefix to the other. The full environment reference, including the settings fallback chain, is in [`docs/DEEP_DIVE.md`](docs/DEEP_DIVE.md#full-environment-reference).

**Ad removal** is configured in Freetvarr's Settings, not in the `.env`. Turn it on in Settings → AD REMOVAL (off by default), then press **EDIT** on a series on the SERIES tab and pick its mode. `DETECT` leaves the video as it is and writes the ad breaks to a `.edl` file beside it, which Kodi skips (Jellyfin with an EDL plugin; Plex ignores it). `CUT` removes them and keeps the original as `<file>.ts.orig` for a number of days you choose (default 7). Freetvarr ships a `comskip.ini` tuned for Australian free-to-air, the author's own channels. To override it, put your own `comskip.ini` in the `/config` bind mount.

<p align="center">
  <img src="docs/img/screenshot-settings.png" alt="Settings" width="100%"/>
  <br/><em>Settings</em>
</p>

## Security

Freetvarr has no login. Anyone who can reach the port can see everything and change settings, including the TVHeadend password it holds. CSRF protection, rate limiting, a strict CSP, and `noindex` headers are all in place, but the design assumes a home network you trust: don't port-forward or reverse-proxy it to the internet. Supply-chain hardening, the HTTP security headers, and the reasoning behind each measure are covered in [`docs/DEEP_DIVE.md`](docs/DEEP_DIVE.md#security-model). Vulnerability reporting and accepted residual risks are in [SECURITY.md](SECURITY.md).

## Technical deep dive

Architecture diagrams, the TVHeadend API surface, the import state machine, the ad-removal pipeline, the full environment reference, Docker deployment, the security model, local development, and more are all in [`docs/DEEP_DIVE.md`](docs/DEEP_DIVE.md), also browsable on the [documentation site](https://furey.github.io/freetvarr/deep-dive).

## Troubleshooting

The common snags are below. The [troubleshooting guide](https://furey.github.io/freetvarr/guide/troubleshooting) has the full list, keyed by symptom, including the wizard's path checks, missing channels, missing logos, and Plex refreshes.

### `TEST CONNECTION` failure

- Under host networking, neither Docker container is on a Docker bridge network, so container names don't resolve. Use `http://<host-ip>:9981`, not `http://tvheadend:9981`.
- `TVHeadend rejected the credentials (HTTP 401)` with no username means TVHeadend wants a login. `HTTP 403` means a wrong password (TVHeadend keeps it under Configuration → Users → Passwords, not on the access entry), an allowed-networks prefix that leaves out the host, or a missing right. In TVHeadend's web interface, check that the access entry has Admin, Streaming, and Video recorder rights, and check its position in the list (access entries are evaluated top to bottom).

### No tuner found

- The TVHeadend Docker container has to run with host networking (the example Docker compose file already does this). It discovers a network tuner such as an HDHomeRun by broadcasting on the local network, and those broadcasts don't reach across Docker's own private network.
- On a Mac, Docker Desktop and OrbStack cannot find a network tuner on their own. In the setup wizard's CHANNELS step, enter the tuner's IP address and this computer's IP address, then press USE THIS ADDRESS. On Linux, use **Enter the tuner's address** in the same step for a tuner on another subnet.
- On an HDHomeRun, open `http://<hdhr-ip>/tuners.html` in a browser to check the tuner itself (that page is HDHomeRun-only). If the page shows nothing, the problem is power or the aerial, not TVHeadend.
- On any other tuner, open Configuration → DVB Inputs → TV adapters in TVHeadend's web interface. An empty list means TVHeadend sees no tuner at all: check the USB passthrough, the driver, or the SAT>IP/IPTV settings.

### `skipped` recordings

- Either TVHeadend has no finished file yet (a recording in progress, and post-recording padding keeps it there for up to ten minutes after the programme ends), or it reported a path outside the recordings folder Freetvarr can see. The error text on the row says which.

### `partial` recordings

- The imported file came up more than `1MB` short of what TVHeadend reported. The next sync imports the file again. If it stays short, the source is short. In TVHeadend's web interface, check the status of that entry (it usually reports data errors from a weak signal).

### Slow imports

- A hardlink import is instant. A progress bar means Freetvarr is copying, which means Freetvarr sees the recordings folder and the media library through separate mounts, or on different disks. Put both under one mount on one disk and the copy becomes a link (see [One shared mount](https://furey.github.io/freetvarr/guide/configuration#one-shared-mount)).

### Permission errors

- Set `PUID`/`PGID` to match the owner of the bind-mounted host folders, and use the same pair for both Docker containers. Freetvarr hardlinks and deletes files TVHeadend created.

### Empty or thin guide

- Without an XMLTV feed you get only what the broadcast signal carries. Set one up (the [TVHeadend guide](https://furey.github.io/freetvarr/guide/tvheadend) covers a free Australian feed, a paid one, and the sources to use in other countries). After you install a grabber script, restart TVHeadend (`docker compose restart tvheadend`). TVHeadend looks for grabbers at startup only.

### Container name lookups

- A side-effect of host networking: Freetvarr isn't on any Docker bridge network. Reach it via the host's LAN IP and `FREETVARR_PORT` instead.

### Wrong ad cuts

- Ad detection is never exact. Comskip's accuracy varies by channel.
- Set the series to `DETECT` mode first and check the break counts and minutes it reports on the Recordings tab before switching to `CUT`. A scan uses a lot of CPU: allow about 30 minutes per 75-minute recording on a dual-core Celeron, and less on a faster CPU.
- Cuts fall on the nearest keyframe, so a second or two either side of a break is normal.
- To tune detection, place your own `comskip.ini` in the `/config` bind mount. Your file overrides the bundled default, which is tuned for Australian channels. Every cut keeps a `<file>.ts.orig` backup for the retention window, so if a cut goes wrong you can rename the `.orig` back to recover it.

### Wrong timestamps

- Wrong times, or a Doctor warning about the time zone: choose your zone in Settings, in the SCHEDULE panel. Freetvarr shows every timestamp in that zone, whatever device you're browsing from. A `TZ` in your `.env` only pre-fills the zone. The zone in Settings wins.

## Disclaimer

This project:

- Is licensed under the [GNU GPLv3 License](./LICENSE).
- Is not affiliated with or endorsed by SiliconDust, TVHeadend, or Plex.
- Began as a fork of [Fetcharr](https://github.com/furey/fetcharr), with the Fetch TV backend replaced by TVHeadend.
- Is written with the assistance of AI and may contain errors.
- Is intended for educational and experimental purposes only.
- Is provided as-is with no warranty; use at your own risk.

## Contributing

If you hit a problem or want to compare notes, start a thread in [Discussions](https://github.com/furey/freetvarr/discussions).

## Support

If you've found this project helpful consider supporting my work through:

[Buy Me a Coffee](https://www.buymeacoffee.com/furey) | [GitHub Sponsorship](https://github.com/sponsors/furey)

Your support helps me keep developing the project and adding new features.

## Licence

GPL-3.0-or-later. See [LICENSE](LICENSE).
