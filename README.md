<p align="center">
  <img src="docs/img/logo.svg" alt="freetvarr" width="240"/>
</p>

<p align="center">
  <strong>Sync TVHeadend recordings into Plex.</strong><br/>
  A self-hosted bridge for Australian free-to-air TV, recorded off an aerial.
</p>

<p align="center">
  <img alt="License: GPL-3.0-or-later" src="https://img.shields.io/badge/license-GPL--3.0--or--later-f10c69.svg?style=flat-square"/>
  <img alt="Node 22+" src="https://img.shields.io/badge/node-22%2B-009be4.svg?style=flat-square"/>
  <img alt="Docker" src="https://img.shields.io/badge/docker-compose-009be4.svg?style=flat-square"/>
  <img alt="Last commit" src="https://img.shields.io/github/last-commit/furey/freetvarr.svg?style=flat-square&color=e2b03c"/>
  <img alt="No auth" src="https://img.shields.io/badge/auth-LAN%20only-8b837e.svg?style=flat-square"/>
  <a href="https://furey.github.io/freetvarr/"><img alt="Documentation" src="https://img.shields.io/badge/docs-vitepress-009be4.svg?style=flat-square"/></a>
</p>

<p align="center">
  <a href="https://furey.github.io/freetvarr/"><strong>Read the documentation →</strong></a>
</p>

## Contents

- [Screenshots](#screenshots)
- [What freetvarr is](#what-freetvarr-is)
- [What freetvarr isn't](#what-freetvarr-isnt)
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

> [!NOTE]<br>
> Fresh captures are pending. The shots below are from the previous Fetch TV build, so the layout is current but the Fetch-specific labels are not.

<p align="center">
  <img src="docs/img/screenshot-dashboard.png" alt="Dashboard" width="100%"/>
  <br/><em>Dashboard</em>
</p>

<p align="center">
  <img src="docs/img/screenshot-guide.png" alt="TV Guide" width="100%"/>
  <br/><em>TV Guide</em>
</p>

<p align="center">
  <img src="docs/img/screenshot-shows.png" alt="Shows" width="100%"/>
  <br/><em>Shows</em>
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
  <img src="docs/img/screenshot-mobile-shows.png" alt="Shows on mobile" width="32%"/>
  <img src="docs/img/screenshot-mobile-recordings.png" alt="Recordings on mobile" width="32%"/>
  <br/><em>Mobile</em>
</p>

## What freetvarr is

TVHeadend records free-to-air TV off an aerial, then the files sit in its recordings folder with names Plex can't read. **freetvarr** watches TVHeadend on your LAN, picks up new episodes of the shows you mark to follow, files them into your Plex TV library under names Plex understands, pokes Plex to scan, and optionally removes the TVHeadend copy once Plex confirms the file.

If your media stack is aerial → HDHomeRun → TVHeadend → Plex, freetvarr is the automation in between: schedule a series from its built-in TV Guide, and the episodes turn up in Plex named and foldered.

It's a fork of [`fetcharr`](https://github.com/furey/fetcharr) with the recorder replaced. Fetch TV's Gen 3 Extended Service Levy made a Fetch-bound tool a dead end; an aerial, a tuner you own, and a free guide cost nothing per year. See [Migrating from Fetch](https://furey.github.io/freetvarr/guide/migrating-from-fetch).

## Where it works

Everywhere TVHeadend works. freetvarr talks only to TVHeadend's HTTP API and the recordings folder, so the broadcast standard is TVHeadend's problem: DVB-T/T2 (Australia, UK, Europe, New Zealand), DVB-C and DVB-S, ATSC (US and Canada), ISDB-T. Three things differ by country and all three are set up in TVHeadend, not here: the tuner model (a DVB-T HDHomeRun in Australia or the UK, an ATSC one in the US), the guide source (a free XMLTV feed in Australia and New Zealand, over-the-air Freeview EIT in the UK, Schedules Direct in the US), and the mux scan list. The docs walk through the Australian setup because that is where it was built; the bundled `comskip.ini` and the HD/SD channel aliases in the guide are tuned for Australian free-to-air but do no harm elsewhere.

## What freetvarr isn't

- ❌ **An indexer integration** (Sonarr / Radarr / Prowlarr): freetvarr works with the recordings TVHeadend has made, and its TV Guide schedules what TVHeadend records next. It doesn't search the internet for content.
- ❌ **A tuner:** TVHeadend drives the hardware, scans the muxes, and writes the files. freetvarr talks to TVHeadend's HTTP API and never touches the tuner.
- ❌ **Authenticated:** designed for a home network you trust. CSRF protection, rate limiting, and a strict content-security policy are in place, but there's no login, so anyone who can reach it can change its settings. Don't expose it to the internet (see [Security](#security)).
- ❌ **A converter:** files arrive from TVHeadend as `.ts` (the raw broadcast format) and stay `.ts`; freetvarr never re-encodes them. The optional ad-cutting copies the video across untouched, so there's no quality loss and no change of format. Add Tdarr or similar afterwards if you need `.mkv`.
- ❌ **A notifier:** no Discord / ntfy / push integration.

> [!IMPORTANT]<br>
> Tested against TVHeadend `4.3` fed by an HDHomeRun Flex Quatro, with Plex Media Server. Other tuners and TVHeadend versions are unverified.

## Features

- **TV Guide**: a 7-day programme guide in the browser; schedule, cancel, and series-record in TVHeadend (with padding and episodes-to-keep options), search the week, pin and reorder favourite channels, and see what's on now from the dashboard.
- **Series recording as autorec rules**: a series becomes one TVHeadend autorec rule matching title plus channel, with TVHeadend's own duplicate detection by episode number and `2`/`10` minute padding by default, because Australian free-to-air runs late.
- **First-run wizard**: walks TVHeadend → storage → Plex. Re-openable from Settings; previously-saved values prefill.
- **Per-show follow**: pick a show TVHeadend records, match it by name to an existing folder under your media root (even when the names aren't identical), and set a season template.
- **Hardlink imports**: the recording is already on disk, so the import is a hardlink when the recordings folder and the media library share a filesystem, and a copy when they don't. No download, no second copy of a 3 GB transport stream.
- **Plex-ready filenames**: `Show - S01E02 - Title.ts`, or `Show - YYYY-MM-DD - Title.ts` when the guide gave no episode number.
- **Short-file detection**: an import more than `1 MB` short of what TVHeadend reported stays `partial`, and the next sync redoes it.
- **Scheduled + manual sync**: checks TVHeadend on a schedule you set (a cron expression), plus on-demand Sync now for everything or a single show.
- **Plex integration**: section refresh after every sync that imported something, plus a Refresh Plex now button.
- **Delete-from-TVHeadend that works**: one `dvr/entry/remove` call drops the entry and the file, gated on Plex confirming its copy. No cloud relay, no handshake, no retry loop.
- **Optional ad removal**: ad detection with comskip, a detect-only mode for checking accuracy, cutting that copies the video across untouched (no re-encode), and a `.orig` backup of every cut file. Off by default; detection accuracy on free-to-air varies by channel, so try detect mode before trusting cuts. See [`docs/DEEP_DIVE.md`](docs/DEEP_DIVE.md#ad-removal).
- **Live operation progress**: copies, ad scans, and cuts show inline in the Recordings tab (a copy bar with speed and time left, a scan bar that counts down from an estimate, a cut segment counter); the list refreshes every 2 s while anything's active instead of the idle 60 s. See [`docs/DEEP_DIVE.md`](docs/DEEP_DIVE.md#live-progress-indicators).
- **Self-housekeeping**: sync history trims itself to the latest 500 rows; recording rows drop off 30 days after the TVHeadend copy is deleted.
- **Timezone-aware UI**: the container's `TZ` carries through to the browser, so timestamps show in that zone whatever device hits the page.
- **Phone-friendly UI**: on a narrow screen every view rearranges (tables become cards, filters become swipeable rows of buttons, and touch targets meet Apple's 44 pt guideline), so checking a sync from the couch works as well as from a desk.
- **Danger Zone**: one-click `NUKE ALL STATE` reset back to the welcome wizard. DB only; imported media files untouched.
- **Authless LAN service**: SQLite-backed, single Docker container, no external runtime dependencies once configured.

## Prerequisites

- A **DVB-T tuner** on your LAN. An [HDHomeRun Flex Quatro](https://furey.github.io/freetvarr/guide/hardware) `HDFX-4DT` is the tested one. USB tuners don't work on a Synology or QNAP NAS, whose kernels ship no DVB drivers.
- A **working TVHeadend** with channels scanned, an XMLTV guide loaded, and a user holding admin, streaming, and DVR rights. The [TVHeadend guide](https://furey.github.io/freetvarr/guide/tvheadend) walks all of it.
- **Docker + Docker Compose** on the host running both.
- **The same recordings folder mounted into both containers**, so freetvarr can read what TVHeadend wrote.
- **Plex Media Server** is optional; freetvarr runs fine without it, you just won't get the automatic Plex library refresh after a sync.

## Quick start

### 1. Get the code

```sh
git clone https://github.com/furey/freetvarr
cd freetvarr
```

### 2. Configure

Copy `docker-compose.example.yml` to `docker-compose.yml`, then create a `.env` alongside it with your host paths:

```env
CONFIG_PATH=/path/to/your/config
DATA_PATH=/path/to/your/data
CSRF_SECRET=paste-openssl-rand-hex-32
TZ=Australia/Sydney
PUID=1000
PGID=1000
FREETVARR_PORT=8124

# Optional: only if Plex runs on this host and you want the Auto-detect token
# button. Leave it out entirely if not (the mount defaults to a no-op).
# PLEX_PREFS_PATH=/path/to/Plex/Preferences.xml
```

`CONFIG_PATH`, `DATA_PATH`, and `CSRF_SECRET` are required; compose stops with a clear message if any is missing rather than starting with broken mounts.

The compose file defines two services, `tvheadend` and `freetvarr`. They share `${DATA_PATH}/recordings`, which is the whole point: TVHeadend writes a recording there, freetvarr picks it up from the same folder. Give both the same `PUID`/`PGID`.

### 3. Start it

```sh
docker compose up -d
docker compose logs -f
```

> [!IMPORTANT]<br>
> The example compose uses `network_mode: host` for both services. TVHeadend discovers the HDHomeRun by broadcasting on the local network, and those broadcasts don't cross Docker's own private bridge network. With host networking there's no `ports:` mapping; each service binds straight onto the host.

### 4. Set up TVHeadend

Browse to `http://<host-ip>:9981` and work through the [TVHeadend guide](https://furey.github.io/freetvarr/guide/tvheadend): first-run wizard, add the HDHomeRun, scan the `au-<Location>` predefined muxes for your transmitter, map services to channels, load a free XMLTV guide, set the recording path to `/recordings`, and make a user for freetvarr.

Do this before step 5. freetvarr can do nothing until TVHeadend has channels and a guide.

### 5. Run the freetvarr wizard

Browse to `http://<host-ip>:8124`. The first visit opens a setup wizard that walks you through TVHeadend (URL plus the user you just made, with a TEST CONNECTION button), storage (with a TEST PATH button for each path), and Plex. You can change all of it later in Settings, and reopen the wizard from there whenever you like.

Mark shows to follow on the Shows tab and freetvarr syncs them on the schedule you set.

### Updating

```sh
git pull
docker compose up -d --build freetvarr
```

This rebuilds the image and recreates the container only if the image actually changed. Your database is left alone, and any pending database updates (migrations) run automatically on the next start.

## Configuration

The TVHeadend URL and login, the Plex token, and the storage paths are runtime settings; configure them in the web UI, not via env. The `.env` next to your compose file only carries deploy-level knobs:

| Variable          | Purpose                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| `CONFIG_PATH`     | Host folder for both containers' config; freetvarr's database lives in `${CONFIG_PATH}/freetvarr`                 |
| `DATA_PATH`       | Host folder holding both `recordings/` (TVHeadend's output) and `media/tv` (your Plex TV library)                 |
| `PLEX_PREFS_PATH` | Optional. Path to Plex's `Preferences.xml`, used by the Auto-detect token button; omit if Plex is on another host |
| `CSRF_SECRET`     | 32+ random bytes (`openssl rand -hex 32`); required                                                               |
| `TZ`              | Your IANA timezone (e.g. `Australia/Sydney`); the UI renders all timestamps in it                                 |
| `PUID`/`PGID`     | UID/GID to run as; match the owner of your bind-mounted folders, and use the same pair for both services          |
| `FREETVARR_PORT`  | Host port to serve on (default `8124`)                                                                            |

freetvarr keeps two settings for one folder: `recordings_root` is where it sees TVHeadend's files, and `tvh_recordings_path` is the path TVHeadend reports in the filenames it hands out. Mount the recordings folder at `/recordings` in both containers and the two are identical. The full environment reference, including the settings fallback chain, is in [`docs/DEEP_DIVE.md`](docs/DEEP_DIVE.md#full-environment-reference).

**Ad removal** is configured at runtime, not via env: turn it on in Settings → AD REMOVAL (off by default), then pick a per-show mode on the Shows tab. `DETECT` notes where the ad breaks are without touching the file; `CUT` removes them and keeps the original as `<file>.ts.orig` for a number of days you choose (default 7). freetvarr ships a comskip.ini tuned for Australian free-to-air; drop your own `comskip.ini` into the `/config` bind mount to override it.

<p align="center">
  <img src="docs/img/screenshot-settings.png" alt="Settings" width="100%"/>
  <br/><em>Settings</em>
</p>

## Security

freetvarr has no login; anyone who can reach the port can see everything and change settings, including the TVHeadend password it holds. CSRF protection, rate limiting, a strict CSP, and `noindex` headers are all in place, but the design assumes a home network you trust: don't port-forward or reverse-proxy it to the internet. Supply-chain hardening, the HTTP security headers, and the reasoning behind each measure are covered in [`docs/DEEP_DIVE.md`](docs/DEEP_DIVE.md#security-model); vulnerability reporting and accepted residual risks are in [SECURITY.md](SECURITY.md).

## Technical deep dive

Architecture diagrams, the TVHeadend API surface, the import state machine, the ad-removal pipeline, the full environment reference, Docker deployment, the security model, local development, and more are all in [`docs/DEEP_DIVE.md`](docs/DEEP_DIVE.md), also browsable on the [documentation site](https://furey.github.io/freetvarr/deep-dive).

## Troubleshooting

**TEST CONNECTION fails**

- Under host networking, neither container is on a Docker bridge network, so container names don't resolve. Use `http://<host-ip>:9981`, not `http://tvheadend:9981`.
- An HTTP `401` or `403` means TVHeadend rejected the credentials. Check the access entry has Admin, Streaming, and Video recorder rights, and check its position in the list; access entries are evaluated top to bottom.

**TVHeadend finds no tuner**

- The TVHeadend container has to run with host networking (the example compose already does this). It discovers an HDHomeRun by broadcasting on the local network, and those broadcasts don't reach across Docker's own private network.
- Check the tuner itself at `http://<hdhr-ip>/tuners.html`. Nothing there is a power or aerial problem, not a TVHeadend one.

**A recording came in as `skipped`**

- Either TVHeadend has no finished file yet (a recording in progress, and post-recording padding keeps it there for up to ten minutes after the programme ends), or it reported a path outside the recordings folder freetvarr can see. The error text on the row says which.

**A recording shows `partial`**

- The imported file came up more than `1 MB` short of what TVHeadend reported. The next sync redoes the import. If it stays short, the source is short; check TVHeadend's own status for that entry, which usually reports data errors from a weak signal.

**Imports are slow**

- A hardlink import is instant. A progress bar means freetvarr is copying, which means the recordings folder and the media library are on different filesystems. Put them on one filesystem and the copy becomes a link.

**Permission errors, or the TVHeadend file won't delete**

- Set `PUID`/`PGID` to match the owner of the bind-mounted host folders, and use the same pair for both services. freetvarr hardlinks and deletes files TVHeadend created.

**The guide is empty or one day deep**

- Without an XMLTV feed you get only what the broadcast signal carries. Set one up; the [TVHeadend guide](https://furey.github.io/freetvarr/guide/tvheadend) covers a free Australian feed and a paid one. Restart TVHeadend after installing a grabber script; it looks for grabbers at startup only.

**Other containers can't reach freetvarr by name**

- A side-effect of host networking: freetvarr isn't on any Docker bridge network. Reach it via the host's LAN IP and `FREETVARR_PORT` instead.

**Ad detection is cutting the wrong things (or missing breaks)**

- Ad detection is educated guessing, never perfect. Comskip's accuracy on Australian free-to-air varies noticeably by channel (logo detection, silence thresholds, and break lengths all differ).
- Run the show in `DETECT` mode first and check the break counts and minutes it reports on the Recordings tab before switching to `CUT`. Scans work the CPU hard: budget ~30 minutes per 75-minute recording on a home NAS.
- Cuts land on the nearest keyframe, so a second or two either side of a break is normal.
- To tune detection, place your own `comskip.ini` in the `/config` bind mount; it overrides the bundled Australian-tuned default. Every cut keeps a `<file>.ts.orig` backup for the retention window, so if a cut goes wrong you can rename the `.orig` back to recover it.

**Timestamps show the wrong time**

- Set `TZ` in your `.env` to your IANA timezone; the UI shows every timestamp in the container's zone, whatever device you're browsing from.

## Disclaimer

This project:

- Is licensed under the [GNU GPLv3 License](./LICENSE).
- Is not affiliated with or endorsed by SiliconDust, TVHeadend, or Plex.
- Began as a fork of [`fetcharr`](https://github.com/furey/fetcharr), with the Fetch TV backend replaced by TVHeadend.
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
