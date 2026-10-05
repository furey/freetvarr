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
- **TVHeadend.** The compose file runs it next to Freetvarr, the wizard in [step 4](#_4-run-the-wizard) secures it, and [step 5](#_5-set-up-tvheadend) sets it up. Already run TVHeadend somewhere else? See [An existing TVHeadend](#an-existing-tvheadend).
- **Docker with Compose v2** on the host.
- **The same recordings folder mounted into both containers.** Freetvarr reads the files TVHeadend wrote, so both need to see them.
- **Plex Media Server** is optional. Freetvarr runs fine without it; you just won't get the automatic library refresh after a sync. See [Plex](/guide/plex).

## 1. Install

You do not need to clone the repository. Docker pulls the image from `ghcr.io/furey/freetvarr`, and the only file you need is the compose file. Pick one of three ways to get it. Each one starts Freetvarr and TVHeadend.

### Install: Option 1, the script

Run this in the folder where you want a `freetvarr` folder to appear:

```sh
curl -fsSL https://raw.githubusercontent.com/furey/freetvarr/main/install.sh | sh
```

The script does these things, in order:

1. Checks for Docker and Docker Compose v2.
2. Makes the folder `./freetvarr` (set `FREETVARR_DIR` to use another path).
3. Downloads the compose file as `docker-compose.yml`.
4. Writes a `.env` with `PUID` and `PGID` from your user (or the sudo user), and a commented `TZ` line.
5. Asks whether to start, stop, or edit `.env` first, when a terminal is available.
6. Creates the config and data folders.
7. Pulls the images and starts both services.
8. Prints the URL of the setup wizard.

Run it again at any time. It keeps an existing `.env` and compose file.

On a Synology NAS, sign in over SSH first, so `/usr/local/bin` is on the `PATH`. Run the script with `sudo` if your user cannot reach Docker.

### Install: Option 2, by hand

1. Make a folder and move into it: `mkdir freetvarr && cd freetvarr`.
2. Download the compose file: `curl -fsSL https://raw.githubusercontent.com/furey/freetvarr/main/docker-compose.example.yml -o docker-compose.yml`.
3. Optional: write a `.env` with your user and group (`id -u` and `id -g` print them).
4. Start both services: `docker compose up -d`.

With no `.env`, everything lives in `./config` and `./data` beside the compose file, and `PUID` and `PGID` are both `1000`.

### Install: Option 3, Synology Container Manager

Use this when you do not want to use SSH.

1. In File Station, make a folder such as `docker/freetvarr`.
2. Make two subfolders in it: `config` and `data`.
3. Optional: save a `.env` in the folder with your DSM user's `PUID` and `PGID` (often `1026` and `100`). Container Manager reads it.
4. Open Container Manager, choose **Project**, then **Create**.
5. Type a project name and choose the folder you made.
6. Upload the compose file (`docker-compose.example.yml`), or paste its content. If the folder already holds a `docker-compose.yml`, choose **Use existing docker-compose.yml**.
7. Tick **Start the project once it is created**, then finish.

Synology's Docker refuses to mount a host folder that does not exist (standard Docker creates it). On Synology, the `config` and `data` folders must exist before the first start. The script makes them; in Option 3, step 2 does.

## 2. Configure

Every value in the `.env` is optional. These are the defaults. Change a value only when you need to, then run `docker compose up -d` to apply it:

```ini
PUID=1000
PGID=1000
CONFIG_PATH=./config
DATA_PATH=./data
FREETVARR_PORT=3733

# Optional: only if Plex runs on this host and you want the Auto-detect token
# button. Leave it out entirely if not; the mount defaults to a no-op.
# PLEX_PREFS_PATH=/path/to/Plex/Preferences.xml
```

Freetvarr asks for your time zone in the wizard and makes its own CSRF secret on first start, so neither needs a setting. TVHeadend follows the host clock's time zone. Every variable is explained in [Configuration](/guide/configuration).

The compose file defines three services: `init`, `tvheadend`, and `freetvarr`. The `init` service runs once before the others. It makes these folders and gives them to `PUID:PGID`, so you do not run `mkdir` or `chown` yourself:

- `config/tvheadend`
- `config/freetvarr`
- `data/recordings`
- `data/media/tv`
- `data/media/one-offs`

TVHeadend writes recordings to `${DATA_PATH}/recordings`, and Freetvarr reads them from the same folder. Freetvarr mounts the whole of `${DATA_PATH}` once, at `/data`, so imports are hardlinks ([One shared mount](/guide/configuration#one-shared-mount)). Keep only `recordings/` and `media/` in `${DATA_PATH}`, because Freetvarr can write to all of it.

> [!TIP]<br>
> Set `PUID` and `PGID` to your own user. Run `id` on the host to read them: `uid=` is `PUID`, `gid=` is `PGID`. A wrong `PUID` is not fatal, because both containers run as the same user and own the folders. But the files then show an unknown owner in the file manager of the host.

## 3. Check the start

Step 1 starts both services. Follow the log to see when Freetvarr is ready:

```sh
docker compose logs -f
```

The log shows `[entrypoint] starting freetvarr…` when it is ready.

> [!IMPORTANT]<br>
> Both services use `network_mode: host`. TVHeadend needs it to discover a network tuner such as an HDHomeRun by network broadcast. With host networking there's no `ports:` mapping: Freetvarr binds `${FREETVARR_PORT}` straight onto the host.

## 4. Run the wizard

Browse to `http://<host-ip>:3733` (or the port you set in `FREETVARR_PORT`). The first visit opens a setup wizard:

1. **Welcome**: your time zone, pre-filled from your browser. Confirm it or pick another. It sets the guide days, the dates in recording file names, and the sync schedule. Change it later in Settings, in the SCHEDULE panel.
2. **TVHeadend**: its URL, `http://<host-ip>:9981`. If TVHeadend runs on the same host, the wizard usually finds it for you. What comes next depends on TVHeadend:
   - **A fresh TVHeadend** has no logins yet, and anyone on your network can change it. The wizard asks you to choose an admin username and password, and shows the allowed networks it guessed from this host's addresses; correct them if needed. `SECURE TVHEADEND AND CONNECT FREETVARR` makes your admin login and a separate `freetvarr` login for Freetvarr, then turns off the open access. [Secure TVHeadend](/guide/tvheadend#_2-secure-tvheadend) explains each step and how to undo it.
   - **A TVHeadend that already has users**: enter the username and password of the user you made for Freetvarr ([TVHeadend step 8](/guide/tvheadend#_8-make-a-user-for-freetvarr)). To do this on a fresh TVHeadend too, choose `I'll set up users myself`.

   The wizard moves on only when the connection test passes; use `SKIP TO SETTINGS` if TVHeadend is not ready yet. If the test fails, [Troubleshooting](/guide/troubleshooting#tvheadend-401-or-403) explains each error.
3. **Storage**: where Freetvarr reads recordings from and writes episodes to. With the example compose file, the defaults are already right. `TEST PATH` checks a folder, and `CHECK TVHEADEND` checks that the recordings path matches TVHeadend's. See [the two recordings paths](/guide/configuration#the-two-recordings-paths).
4. **Plex**: server URL, token, and which library section holds your TV shows. Optional; see [Plex](/guide/plex).

You can change all of it later in Settings, and reopen the wizard from there.

## 5. Set up TVHeadend

Browse to `http://<host-ip>:9981`, sign in with the admin login, and work through [TVHeadend](/guide/tvheadend): tuner, channels, guide, and recording path. Freetvarr can do little until TVHeadend has channels and a guide.

Then mark shows to follow on the Shows tab; see [Following shows](/guide/following-shows).

To check the whole setup, open **Settings → HEALTH CHECK → RUN DOCTOR**. The [Doctor](/guide/doctor) reads TVHeadend, Plex, and the folders, changes nothing, and says what to fix.

## An existing TVHeadend

If TVHeadend already runs on another host or in another compose project, delete the `tvheadend` service from your `docker-compose.yml`, and remove it from the `depends_on` of `freetvarr`. Keep `init` and `freetvarr`. Two things still have to hold:

- **Freetvarr can reach it.** Use `http://<tvheadend-host>:9981` in the wizard, and make sure the Freetvarr host's address falls inside the allowed networks of the TVHeadend user.
- **Freetvarr can read its recordings.** Mount the folder TVHeadend records into (a NAS share, say) into the Freetvarr container. Set the recordings root to where Freetvarr sees it, such as `/data/recordings`. Put the path TVHeadend writes to on its side, such as `/recordings` or `/mnt/dvr`, in the wizard's "Recordings folder (as TVHeadend sees it)" field. Freetvarr rewrites the one prefix onto the other.

Delete-after-import still works, because TVHeadend deletes the file itself. Imports copy rather than hardlink unless Freetvarr sees the recordings and the media library through one mount ([One shared mount](/guide/configuration#one-shared-mount)).

## On a Synology NAS

> [!NOTE]<br>
> This section is the author's own host, a Synology DS220+. Skip it on any other Linux host.

- DSM keeps the Docker CLI at `/usr/local/bin/docker`, which is not on the `PATH` of a non-login SSH command. Sign in over SSH and run the install script or `docker compose` from that shell, or run `ssh <nas> '/usr/local/bin/docker compose …'`.
- Synology's Docker refuses to mount a host folder that does not exist, so `config` and `data` must exist before the first start ([Install](#_1-install)). The install script makes them.
- `scp` fails against DSM's restricted SFTP service. Copy a file off the NAS with `ssh <nas> 'cat <path>' > <local-file>` instead.
- A DSM user's `id` usually reports `gid=100(users)`, and the first user created is often `uid=1026`. Use your own values for `PUID` and `PGID`.
- USB DVB tuners do not work on DSM, whose kernel ships no DVB drivers; use a network tuner ([Hardware](/guide/hardware)).

## Updating

```sh
docker compose pull
docker compose up -d
```

This downloads the newest published image (`ghcr.io/furey/freetvarr:latest`) and recreates a container only if its image changed. Your database is left alone, and any pending database updates (migrations) run automatically on the next start.

A Freetvarr tab left open during the update says a new version is ready. Press **APPLY & RELOAD** when it suits you; live TV keeps playing until you do.

## Where next

- [Following shows](/guide/following-shows): the core loop. Pick shows, point them at folders, sync.
- [TV Guide](/guide/tv-guide): schedule recordings from the browser.
- [Configuration](/guide/configuration): the full `.env` reference.
- [Troubleshooting](/guide/troubleshooting): if the connection, an import, or Plex misbehaves.
