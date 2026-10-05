---
title: Configuration
description: >-
  The deploy-level .env knobs, the two storage paths that have to agree, and
  where the runtime settings live instead.
---

# Configuration

Freetvarr reads settings from two places. The `.env` next to your compose file holds deploy settings. You set everything else (the TVHeadend URL and login, the Plex token, the schedule) in the web UI.

## Compose environment

Set these in the `.env` alongside `docker-compose.yml`. Every value is optional:

| Variable                 | Purpose                                                                                                                                                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONFIG_PATH`            | Optional. Host folder for the two containers' config (default `./config`); Freetvarr's database lives in `${CONFIG_PATH}/freetvarr`                                                                                                             |
| `DATA_PATH`              | Optional. Host folder (default `./data`) that holds `recordings/` (TVHeadend's output), `media/tv` (your TV library), and `media/one-offs` (recordings with no show rule), and nothing else. [One shared mount](#one-shared-mount) explains why |
| `PLEX_PREFS_PATH`        | Optional. Path to Plex's `Preferences.xml`, used by the Auto-detect token button; omit if Plex is on another host                                                                                                                               |
| `CSRF_SECRET`            | Optional override. Freetvarr otherwise generates a secret on first start and saves it to `${CONFIG_PATH}/freetvarr/csrf-secret`. See [CSRF secret](#csrf-secret)                                                                                |
| `TZ`                     | Optional IANA timezone (e.g. `Australia/Sydney`). Pre-fills Freetvarr's time zone in the wizard; a zone chosen in Settings wins over it. Applies to TVHeadend when set. TVHeadend otherwise follows the host clock                              |
| `PUID`/`PGID`            | Optional. UID and GID to run as (default `1000`). Set your own user, or the files show an unknown owner in the host's file manager. Both services use the same pair                                                                             |
| `FREETVARR_PORT`         | Host port to serve on (default `3733`)                                                                                                                                                                                                          |
| `TVH_URL`                | Optional. Fixes the address `AUTO-DISCOVER TVHEADEND` offers; omit to let Freetvarr probe port `9981` on the host                                                                                                                               |
| `LIVE_TV_MAX_SESSIONS`   | Optional. How many channels the [live TV](/guide/live-tv#stream-handling) player streams at once (default `2`)                                                                                                                                  |
| `LIVE_TV_BUFFER_MINUTES` | Optional. How many minutes of [live TV](/guide/live-tv#pause-and-rewind) the player can pause and rewind (default `30`, `0` turns it off, maximum `120`)                                                                                        |
| `LIVE_TV_TRANSCODE`      | Optional. How [live TV](/guide/live-tv#video-handling) handles H.264: `auto` (default), `hardware`, `software`, or `copy`                                                                                                                       |
| `LIVE_TV_VAAPI_DEVICE`   | Optional. The render device for hardware encoding (default `/dev/dri/renderD128`)                                                                                                                                                               |
| `RENDER_GID`             | Only with [`docker-compose.override.yml`](/guide/hardware#hardware-transcoding). The group ID that owns the render device                                                                                                                       |

## CSRF secret

Freetvarr signs its CSRF cookie with a secret. On first start, with `CSRF_SECRET` unset, it generates a random secret and saves it to the file `csrf-secret` in its config folder (`/config/csrf-secret` in the container, `${CONFIG_PATH}/freetvarr/csrf-secret` on the host). Only the Freetvarr user can read the file. Later starts reuse it. A `CSRF_SECRET` in your `.env` overrides the file.

If the config folder is not writable, Freetvarr exits with a message to check that `CONFIG_PATH` is owned by `PUID:PGID`. To rotate the secret, delete the file; Freetvarr generates a new one at the next start, and browsers get a fresh CSRF token automatically.

## The two recordings paths

Freetvarr keeps two settings for one folder. These are the settings most likely to be wrong:

- **Recordings root** (`recordings_root`; `/recordings` in the code, `/data/recordings` in the example compose file) is where Freetvarr sees TVHeadend's files, inside the Freetvarr container.
- **TVHeadend recordings path** (`tvh_recordings_path`, default `/recordings`) is the path TVHeadend reports in the filenames it hands out, inside the TVHeadend container.

In the example compose file, TVHeadend mounts `${DATA_PATH}/recordings` at `/recordings`, and Freetvarr mounts `${DATA_PATH}` at `/data`. TVHeadend reports `/recordings/...` and Freetvarr sees the same file at `/data/recordings/...`, so the two settings differ and you never touch them. Freetvarr rewrites every TVHeadend filename from the second path to the first; a file outside that prefix is skipped with a note saying so.

The third path, **media root** (`media_root`; `/media/tv` in the code, `/data/media/tv` in the example compose file), is where finished episodes land for Plex.

## The one-off folder

The **one-off folder** (`oneoff_root`; `/media/one-offs` in the code, `/data/media/one-offs` in the example compose file) holds recordings that match no [show rule](/guide/following-shows#recordings-with-no-show-rule). On the host it is `${DATA_PATH}/media/one-offs`. Create the host folder first, owned by `PUID:PGID`. If the folder is missing, these recordings show as `skipped` with a note.

The optional **movies folder** (`movies_root`, or `MOVIES_ROOT`) takes [films](/guide/following-shows#films) with no show rule. Leave it empty to send films to the one-off folder. It must sit inside the same shared mount as the recordings, for example `/data/media/movies`.

**IMPORT EVERY RECORDING** in Settings turns the one-off folder on or off. With it off, Freetvarr imports only recordings that match a show rule, or that you recorded with **ADD TO LIBRARY** on. To have Plex refresh the one-off library after an import, choose it as the **Plex one-off section**; for films, choose the **Plex movies section**.

## One shared mount

Freetvarr imports a recording as a hardlink: a second name for the same file. A hardlink is instant and uses no extra disk. Linux refuses a hardlink between two bind mounts, even when both sit on one disk. The refusal is the `EXDEV` error. Freetvarr then copies the whole file.

The example compose file avoids this. It mounts `${DATA_PATH}` once, at `/data`, and the recordings, the TV library, and the one-off folder are all folders inside that one mount:

```yaml
    volumes:
      - ${DATA_PATH}:/data
    environment:
      - MEDIA_ROOT=/data/media/tv
      - ONEOFF_ROOT=/data/media/one-offs
      - RECORDINGS_ROOT=/data/recordings
      - TVH_RECORDINGS_PATH=/recordings
```

Keep only `recordings/` and `media/` in `${DATA_PATH}`. Freetvarr can write to everything in the mount.

If your folders live in separate places, mount one parent folder that holds both, or move them under one. The [Doctor](/guide/doctor#paths-hardlink) Hardlinks check makes a real test link and says which case you have.

When you change `media_root` or `oneoff_root`, Freetvarr moves the stored file paths on startup and when you save Settings. You do not edit the database.

## Runtime settings

The TVHeadend URL, username, and password, the Plex URL, token, and section, the storage paths, the ad-removal switches, and the sync schedule are all set in Settings (or the first-run wizard) and stored in the database. `TEST PATH` checks the media root and Freetvarr's recordings folder, and `CHECK TVHEADEND` reads TVHeadend's recording path from its DVR profile and compares it with yours.

![The Settings tab](../img/screenshot-settings.png)

> [!NOTE]<br>
> `MEDIA_ROOT`, `ONEOFF_ROOT`, `RECORDINGS_ROOT`, `TVH_RECORDINGS_PATH`, and `PLEX_PREFS_PATH` also act as defaults for their matching runtime settings. Freetvarr uses the value in Settings first, then the environment variable, then the built-in default.

The full environment reference, including container-side variables like `DB_PATH`, `PORT`, and `NODE_ENV`, is in the [deep dive](/deep-dive#full-environment-reference).
