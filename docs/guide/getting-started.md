---
title: Getting started
description: >-
  Prerequisites, Docker Compose setup, and the first-run wizard for running
  freetvarr alongside TVHeadend.
---

# Getting started

freetvarr runs as a single Docker container next to TVHeadend, usually on the same host.

## Prerequisites

- A **DVB-T tuner** on your LAN. See [Hardware](/guide/hardware) for what to buy and how to wire it in.
- A **working TVHeadend** with channels scanned, a guide loaded, and a user for freetvarr. See [TVHeadend](/guide/tvheadend). Do this first; freetvarr can do nothing without it.
- **Docker and Docker Compose** on the host.
- **The same recordings folder mounted into both containers.** freetvarr reads the files TVHeadend wrote, so both need to see them.
- **Plex Media Server** is optional. freetvarr runs fine without it; you just won't get the automatic library refresh after a sync. See [Plex](/guide/plex).

## 1. Get the code

```sh
git clone https://github.com/furey/freetvarr
cd freetvarr
```

## 2. Configure

Copy `docker-compose.example.yml` to `docker-compose.yml`, then create a `.env` alongside it with your host paths:

```ini
CONFIG_PATH=/path/to/your/config
DATA_PATH=/path/to/your/data
CSRF_SECRET=paste-openssl-rand-hex-32
TZ=Australia/Sydney
PUID=1000
PGID=1000
FREETVARR_PORT=8124

# Optional: only if Plex runs on this host and you want the Auto-detect token
# button. Leave it out entirely if not; the mount defaults to a no-op.
# PLEX_PREFS_PATH=/path/to/Plex/Preferences.xml
```

`CONFIG_PATH`, `DATA_PATH`, and `CSRF_SECRET` are required; compose stops with a clear message if any is missing rather than starting with broken mounts. Every variable is explained in [Configuration](/guide/configuration).

The compose file defines two services, `tvheadend` and `freetvarr`. They share `${DATA_PATH}/recordings`, which is the whole point: TVHeadend writes a recording there, freetvarr picks it up from the same folder.

> [!TIP]<br>
> Set `PUID`/`PGID` to the owner of your host folders, and give both services the same pair. freetvarr deletes the TVHeadend copy after import, so it needs write access to files TVHeadend created.

## 3. Start it

```sh
docker compose up -d
docker compose logs -f
```

> [!IMPORTANT]<br>
> Both services use `network_mode: host`. TVHeadend needs it to discover the HDHomeRun by network broadcast. With host networking there's no `ports:` mapping: freetvarr binds `${FREETVARR_PORT}` straight onto the host.

## 4. Run the wizard

Browse to `http://<host-ip>:8124`. The first visit opens a setup wizard:

1. **TVHeadend**: its URL (`http://<host-ip>:9981`) and the username and password you made in [step 8 of the TVHeadend setup](/guide/tvheadend#_8-make-a-user-for-freetvarr). The wizard probes port `9981` on every address of the host when the URL field is empty and fills in the one that answers; `DETECT URL` repeats that probe. `TEST CONNECTION` reports the version, the channel count, and the tuner count.
2. **Storage**: where freetvarr reads recordings from and writes episodes to, each with a `TEST PATH` button.
3. **Plex**: server URL, token, and which library section holds your TV shows. Optional.

You can change all of it later in Settings, and reopen the wizard from there whenever you like.

Then mark shows to follow on the Shows tab; see [Following shows](/guide/following-shows).

## Updating

```sh
git pull
docker compose up -d --build freetvarr
```

This rebuilds the image and recreates the container only if the image actually changed. Your database is left alone, and any pending database updates (migrations) run automatically on the next start.

## Where next

- [Following shows](/guide/following-shows): the core loop. Pick shows, point them at folders, sync.
- [TV Guide](/guide/tv-guide): schedule recordings from the browser.
- [Configuration](/guide/configuration): the full `.env` reference.
- [Troubleshooting](/guide/troubleshooting): if the connection, an import, or Plex misbehaves.
