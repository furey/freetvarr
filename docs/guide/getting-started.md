---
title: Getting started
description: >-
  Prerequisites, Docker Compose setup, and the first-run wizard for running
  Freetvarr alongside TVHeadend.
---

# Getting started

Freetvarr runs as a single Docker container next to TVHeadend, usually on the same host.

## Prerequisites

- A **TVHeadend-compatible tuner**, matched to your broadcast standard: a network tuner, a USB DVB stick, a PCIe card, SAT>IP, or IPTV. See [Hardware](/guide/hardware) for what to buy and how to wire it in.
- **TVHeadend.** The compose file below runs it next to Freetvarr, and [step 4](#_4-set-up-tvheadend) sets it up. Already run TVHeadend somewhere else? See [An existing TVHeadend](#an-existing-tvheadend).
- **Docker and Docker Compose** on the host.
- **The same recordings folder mounted into both containers.** Freetvarr reads the files TVHeadend wrote, so both need to see them.
- **Plex Media Server** is optional. Freetvarr runs fine without it; you just won't get the automatic library refresh after a sync. See [Plex](/guide/plex).

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
TZ=Australia/Sydney          # example; use your own IANA zone
PUID=1000
PGID=1000
FREETVARR_PORT=3733

# Optional: only if Plex runs on this host and you want the Auto-detect token
# button. Leave it out entirely if not; the mount defaults to a no-op.
# PLEX_PREFS_PATH=/path/to/Plex/Preferences.xml
```

`CONFIG_PATH`, `DATA_PATH`, and `CSRF_SECRET` are required; compose stops with a clear message if any is missing rather than starting with broken mounts. Every variable is explained in [Configuration](/guide/configuration).

The compose file defines two services, `tvheadend` and `freetvarr`. They share `${DATA_PATH}/recordings`, which is the whole point: TVHeadend writes a recording there, Freetvarr picks it up from the same folder.

Create the host folders before the first start, owned by the user the containers run as. Docker creates a missing bind-mount folder as `root`, and neither container can then write to it:

```sh
mkdir -p /path/to/your/config/tvheadend /path/to/your/config/freetvarr
mkdir -p /path/to/your/data/recordings /path/to/your/data/media/tv
sudo chown 1000:1000 /path/to/your/config/tvheadend /path/to/your/config/freetvarr
sudo chown 1000:1000 /path/to/your/data/recordings /path/to/your/data/media/tv
```

Use your own paths from the `.env`, and your own `PUID:PGID` in place of `1000:1000`.

> [!TIP]<br>
> Set `PUID`/`PGID` to the owner of your host folders, and give both services the same pair. Run `id` as that user on the host to read them: `uid=` is `PUID`, `gid=` is `PGID`. Freetvarr hardlinks the files TVHeadend wrote and deletes them after import, so both containers need the same owner on the recordings folder.

## 3. Start it

```sh
docker compose up -d
docker compose logs -f
```

The first start builds the Freetvarr image from the repository, which takes a few minutes. The log shows `[entrypoint] starting freetvarr…` when it is ready.

> [!IMPORTANT]<br>
> Both services use `network_mode: host`. TVHeadend needs it to discover a network tuner such as an HDHomeRun by network broadcast. With host networking there's no `ports:` mapping: Freetvarr binds `${FREETVARR_PORT}` straight onto the host.

## 4. Set up TVHeadend

Browse to `http://<host-ip>:9981` and work through [TVHeadend](/guide/tvheadend): tuner, channels, guide, recording path, and a user for Freetvarr. Do this before step 5. Freetvarr can do nothing until TVHeadend has channels and a guide.

## 5. Run the wizard

Browse to `http://<host-ip>:3733` (or the port you set in `FREETVARR_PORT`). The first visit opens a setup wizard:

1. **TVHeadend**: its URL (`http://<host-ip>:9981`) and the username and password you made in [step 8 of the TVHeadend setup](/guide/tvheadend#_8-make-a-user-for-freetvarr). The wizard probes port `9981` on every address of the host when the URL field is empty and fills in the one that answers; `AUTO-DISCOVER TVHEADEND` repeats that probe. `TEST CONNECTION` reports the version, the channel count, and the tuner count. `SAVE & NEXT` runs the same test and stays on the step until it passes; `SKIP TO SETTINGS` is the way out if TVHeadend is not ready yet. A failure shows as `Failed:` and the reason, such as `TVHeadend rejected the credentials (HTTP 403).`; [Troubleshooting](/guide/troubleshooting#tvheadend-401-or-403) lists each one.
2. **Storage**: where Freetvarr reads recordings from and writes episodes to. With the example compose file, the defaults (`/media/tv` and `/recordings` twice) are already right. `TEST PATH` checks each folder inside the container and says whether imports can hardlink; `CHECK TVHEADEND` reads the recording path from TVHeadend's default DVR profile and fills in or checks the path next to it. See [the two recordings paths](/guide/configuration#the-two-recordings-paths).
3. **Plex**: server URL, token, and which library section holds your TV shows. Optional; see [Plex](/guide/plex).

You can change all of it later in Settings, and reopen the wizard from there whenever you like.

Then mark shows to follow on the Shows tab; see [Following shows](/guide/following-shows).

To check the whole setup, open **Settings → HEALTH CHECK → RUN DOCTOR**. The [Doctor](/guide/doctor) reads TVHeadend, Plex, and the folders, changes nothing, and says what to fix.

## An existing TVHeadend

If TVHeadend already runs on another host or in another compose project, delete the `tvheadend` service from your `docker-compose.yml` and keep only `freetvarr`. Two things still have to hold:

- **Freetvarr can reach it.** Use `http://<tvheadend-host>:9981` in the wizard, and make sure the Freetvarr host's address falls inside the allowed networks of the TVHeadend user.
- **Freetvarr can read its recordings.** Mount the folder TVHeadend records into (a NAS share, say) into the Freetvarr container at `/recordings`. If TVHeadend writes to a different path on its side, such as `/mnt/dvr`, put that path in the wizard's "Recordings folder (as TVHeadend sees it)" field. Freetvarr rewrites the one prefix onto the other.

Delete-after-import still works, because TVHeadend deletes the file itself. Imports copy rather than hardlink when the recordings and the media library sit on different filesystems.

## On a Synology NAS

> [!NOTE]<br>
> This section is the author's own host, a Synology DS220+. Skip it on any other Linux host.

- DSM keeps the Docker CLI at `/usr/local/bin/docker`, which is not on the `PATH` of a non-login SSH command. Run `ssh <nas> '/usr/local/bin/docker compose …'`, or sign in first and run it from the shell.
- `scp` fails against DSM's restricted SFTP service. Copy a file off the NAS with `ssh <nas> 'cat <path>' > <local-file>` instead.
- A DSM user's `id` usually reports `gid=100(users)`, and the first user created is often `uid=1026`. Use your own values for `PUID` and `PGID`.
- USB DVB tuners do not work on DSM, whose kernel ships no DVB drivers; use a network tuner ([Hardware](/guide/hardware)).

## Updating

```sh
git pull
docker compose up -d --build freetvarr
```

This rebuilds the image and recreates the container only if the image actually changed. Your database is left alone, and any pending database updates (migrations) run automatically on the next start.

Freetvarr tabs that were open during the update show a bar that says a new version is ready. Press **RELOAD** when it suits you; Freetvarr never reloads by itself, so live TV keeps playing.

## Where next

- [Following shows](/guide/following-shows): the core loop. Pick shows, point them at folders, sync.
- [TV Guide](/guide/tv-guide): schedule recordings from the browser.
- [Configuration](/guide/configuration): the full `.env` reference.
- [Troubleshooting](/guide/troubleshooting): if the connection, an import, or Plex misbehaves.
