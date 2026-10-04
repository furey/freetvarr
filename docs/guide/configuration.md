---
title: Configuration
description: >-
  The deploy-level .env knobs, the two storage paths that have to agree, and
  where the runtime settings live instead.
---

# Configuration

Freetvarr reads settings from two places. The `.env` next to your compose file holds deploy settings. You set everything else (the TVHeadend URL and login, the Plex token, the schedule) in the web UI.

## Compose environment

Set these in the `.env` alongside `docker-compose.yml`:

| Variable                 | Purpose                                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONFIG_PATH`            | Host folder for the two containers' config; Freetvarr's database lives in `${CONFIG_PATH}/freetvarr`                                                     |
| `DATA_PATH`              | Host folder holding `recordings/` (TVHeadend's output), `media/tv` (your TV library), and `media/one-offs` (recordings with no show rule)                |
| `PLEX_PREFS_PATH`        | Optional. Path to Plex's `Preferences.xml`, used by the Auto-detect token button; omit if Plex is on another host                                        |
| `CSRF_SECRET`            | 32+ random bytes (`openssl rand -hex 32`); required                                                                                                      |
| `TZ`                     | Your IANA timezone (e.g. `Australia/Sydney`); the UI renders all timestamps in it                                                                        |
| `PUID`/`PGID`            | UID/GID to run as; match the owner of your bind-mounted folders, and use the same pair for both services                                                 |
| `FREETVARR_PORT`         | Host port to serve on (default `3733`)                                                                                                                   |
| `TVH_URL`                | Optional. Fixes the address `AUTO-DISCOVER TVHEADEND` offers; omit to let Freetvarr probe port `9981` on the host                                        |
| `LIVE_TV_MAX_SESSIONS`   | Optional. How many channels the [live TV](/guide/live-tv#stream-handling) player streams at once (default `2`)                                           |
| `LIVE_TV_BUFFER_MINUTES` | Optional. How many minutes of [live TV](/guide/live-tv#pause-and-rewind) the player can pause and rewind (default `30`, `0` turns it off, maximum `120`) |
| `LIVE_TV_TRANSCODE`      | Optional. How [live TV](/guide/live-tv#video-handling) handles H.264: `auto` (default), `hardware`, `software`, or `copy`                                |
| `LIVE_TV_VAAPI_DEVICE`   | Optional. The render device for hardware encoding (default `/dev/dri/renderD128`)                                                                        |
| `RENDER_GID`             | Only with [`docker-compose.override.yml`](/guide/hardware#hardware-transcoding). The group ID that owns the render device                                |

## The two recordings paths

Freetvarr keeps two settings for one folder. These are the settings most likely to be wrong:

- **Recordings root** (`recordings_root`, default `/recordings`) is where Freetvarr sees TVHeadend's files, inside the Freetvarr container.
- **TVHeadend recordings path** (`tvh_recordings_path`, default `/recordings`) is the path TVHeadend reports in the filenames it hands out, inside the TVHeadend container.

When both containers mount `${DATA_PATH}/recordings` at `/recordings`, the two are identical and you never touch them. They differ only if you mount the same folder at different paths in each container. Freetvarr rewrites every TVHeadend filename from the second path to the first; a file outside that prefix is skipped with a note saying so.

The third path, **media root** (`media_root`, default `/media/tv`), is where finished episodes land for Plex.

## The one-off folder

The **one-off folder** (`oneoff_root`, default `/media/one-offs`) holds recordings that match no [show rule](/guide/following-shows#recordings-with-no-show-rule). The example compose file mounts `${DATA_PATH}/media/one-offs` there. Create the host folder first, owned by `PUID:PGID`; otherwise Docker creates it owned by root, and Freetvarr cannot write to it. If the folder is missing, these recordings show as `skipped` with a note.

**IMPORT EVERY RECORDING** in Settings turns the one-off folder on or off. With it off, Freetvarr imports only recordings that match a show rule, or that you recorded with **ADD TO LIBRARY** on. To have Plex refresh the one-off library after an import, choose it as the **Plex one-off section**.

> [!TIP]<br>
> Put `recordings/`, `media/tv`, and `media/one-offs` on the same filesystem. Freetvarr then imports by hardlink, which is instant and costs no extra disk; a cross-filesystem import falls back to a full copy.

## Runtime settings

The TVHeadend URL, username, and password, the Plex URL, token, and section, the storage paths, the ad-removal switches, and the sync schedule are all set in Settings (or the first-run wizard) and stored in the database. `TEST PATH` checks the media root and Freetvarr's recordings folder, and `CHECK TVHEADEND` reads TVHeadend's recording path from its DVR profile and compares it with yours.

![The Settings tab](../img/screenshot-settings.png)

> [!NOTE]<br>
> `MEDIA_ROOT`, `ONEOFF_ROOT`, `RECORDINGS_ROOT`, `TVH_RECORDINGS_PATH`, and `PLEX_PREFS_PATH` also act as defaults for their matching runtime settings. Freetvarr uses the value in Settings first, then the environment variable, then the built-in default.

The full environment reference, including container-side variables like `DB_PATH`, `PORT`, and `NODE_ENV`, is in the [deep dive](/deep-dive#full-environment-reference).
