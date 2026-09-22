---
title: Configuration
description: >-
  The deploy-level .env knobs, the two storage paths that have to agree, and
  where the runtime settings live instead.
---

# Configuration

Config comes in two layers. The `.env` next to your compose file carries deploy-level knobs. Everything else (the TVHeadend URL and login, the Plex token, the schedule) is a runtime setting you edit in the web UI, not via env.

## Compose environment

Set these in the `.env` alongside `docker-compose.yml`:

| Variable          | Purpose                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| `CONFIG_PATH`     | Host folder for the two containers' config; Freetvarr's database lives in `${CONFIG_PATH}/freetvarr`            |
| `DATA_PATH`       | Host folder holding both `recordings/` (TVHeadend's output) and `media/tv` (your Plex TV library)                |
| `PLEX_PREFS_PATH` | Optional. Path to Plex's `Preferences.xml`, used by the Auto-detect token button; omit if Plex is on another host |
| `CSRF_SECRET`     | 32+ random bytes (`openssl rand -hex 32`); required                                                              |
| `TZ`              | Your IANA timezone (e.g. `Australia/Sydney`); the UI renders all timestamps in it                                |
| `PUID`/`PGID`     | UID/GID to run as; match the owner of your bind-mounted folders, and use the same pair for both services         |
| `FREETVARR_PORT`  | Host port to serve on (default `8124`)                                                                           |
| `TVH_URL`         | Optional. Fixes the address `AUTO-DISCOVER TVHEADEND` offers; omit to let Freetvarr probe port `9981` on the host    |

## The two recordings paths

Freetvarr keeps two settings for one folder, and they are the thing most likely to be wrong:

- **Recordings root** (`recordings_root`, default `/recordings`) is where Freetvarr sees TVHeadend's files, inside the Freetvarr container.
- **TVHeadend recordings path** (`tvh_recordings_path`, default `/recordings`) is the path TVHeadend reports in the filenames it hands out, inside the TVHeadend container.

When both containers mount `${DATA_PATH}/recordings` at `/recordings`, the two are identical and you never touch them. They differ only if you mount the same folder at different paths in each container. Freetvarr rewrites every TVHeadend filename from the second path to the first; a file outside that prefix is skipped with a note saying so.

The third path, **media root** (`media_root`, default `/media/tv`), is where finished episodes land for Plex.

> [!TIP]<br>
> Put `recordings/` and `media/tv` on the same filesystem. Freetvarr then imports by hardlink, which is instant and costs no extra disk; a cross-filesystem import falls back to a full copy.

## Runtime settings

The TVHeadend URL, username, and password, the Plex URL, token, and section, the three storage paths, the ad-removal switches, and the sync schedule are all set in Settings (or the first-run wizard) and stored in the database. The Storage panel shows the paths in use and offers a `TEST PATH` button for each.

![The Settings tab](../img/screenshot-settings.png)

> [!NOTE]<br>
> `MEDIA_ROOT`, `RECORDINGS_ROOT`, `TVH_RECORDINGS_PATH`, and `PLEX_PREFS_PATH` also act as defaults for their matching runtime settings. The fallback chain is settings DB value → env var → hardcoded default.

The full environment reference, including container-side variables like `DB_PATH`, `PORT`, and `NODE_ENV`, is in the [deep dive](/deep-dive#full-environment-reference).
