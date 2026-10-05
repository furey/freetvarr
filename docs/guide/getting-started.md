---
title: Getting started
description: >-
  Install Freetvarr and TVHeadend with Docker Compose, then run the first-run
  wizard.
---

# Getting started

## Prerequisites

- A **TVHeadend-compatible tuner**. [Hardware](/guide/hardware) covers the choice.
- **Docker with Compose v2** on a host that stays on.

The compose file runs TVHeadend next to Freetvarr. If TVHeadend already runs elsewhere, see [An existing TVHeadend](#an-existing-tvheadend). Plex is optional.

## 1. Install

Run this in the folder where you want a `freetvarr` folder to appear:

```sh
curl -fsSL https://raw.githubusercontent.com/furey/freetvarr/main/install.sh | sh
```

The script writes a `.env` with your user and group, asks you to confirm it, starts both services, and prints the URL of the setup wizard. Open that URL and go to [step 2](#_2-run-the-wizard).

Run the script again at any time. It keeps an existing `.env` and compose file. On a NAS, sign in over SSH first, and use `sudo` if your user cannot reach Docker.

### Install: by hand

1. Make a folder and move into it: `mkdir freetvarr && cd freetvarr`.
2. Download the compose file: `curl -fsSL https://raw.githubusercontent.com/furey/freetvarr/main/docker-compose.example.yml -o docker-compose.yml`.
3. Optional: write a `.env` with `PUID` and `PGID` set to your user and group (`id -u` and `id -g`).
4. Start both services: `docker compose up -d`.
5. Browse to `http://<host-ip>:3733`.

### Install: NAS container app

1. In the NAS file manager, make a folder such as `docker/freetvarr`.
2. Make two subfolders in it: `config` and `data`.
3. Optional: save a `.env` in the folder with your NAS user's `PUID` and `PGID`.
4. In the NAS container app, create a Compose project (some apps call it a stack) in the folder you made.
5. Upload [`docker-compose.example.yml`](https://raw.githubusercontent.com/furey/freetvarr/main/docker-compose.example.yml), or paste its content.
6. Start the project.
7. Browse to `http://<nas-ip>:3733`.

> [!NOTE]<br>
> The author's NAS is a Synology. On Synology DSM the file manager is File Station, and the container app is Container Manager (**Project → Create**, then tick **Start the project once it is created**). The first DSM user is often `PUID=1026` and `PGID=100`. Docker is at `/usr/local/bin`, which is on the `PATH` only in an SSH login shell.

## 2. Run the wizard

The first visit to `http://<host-ip>:3733` opens the setup wizard:

1. **Welcome**: confirm your time zone.
2. **TVHeadend**: on a fresh TVHeadend, choose an admin username and password, check the allowed networks, then press `SECURE TVHEADEND AND CONNECT FREETVARR`. On a TVHeadend that already has users, enter the login you made for Freetvarr ([TVHeadend step 8](/guide/tvheadend#_8-make-a-user-for-freetvarr)).
3. **Storage**: keep the defaults.
4. **Plex**: optional. Enter the server URL and token, and choose the TV library ([Plex](/guide/plex)).

Every value can be changed later in Settings.

## 3. Set up TVHeadend

Browse to `http://<host-ip>:9981`, sign in with the admin login, and work through [TVHeadend](/guide/tvheadend): tuner, channels, guide, and recording path.

Then follow shows on the Shows tab ([Following shows](/guide/following-shows)). To check the whole setup, open **Settings → HEALTH CHECK → RUN DOCTOR**.

## Configure

Every value in the `.env` is optional. These are the defaults:

```ini
PUID=1000
PGID=1000
CONFIG_PATH=./config
DATA_PATH=./data
FREETVARR_PORT=3733
```

Set `PUID` and `PGID` to your own user (`id -u` and `id -g`). After a change, run `docker compose up -d`. [Configuration](/guide/configuration) covers every variable, the folders under `DATA_PATH`, and the two recordings paths.

## An existing TVHeadend

If TVHeadend already runs on another host or in another compose project:

1. Delete the `tvheadend` service from your `docker-compose.yml`.
2. Remove `tvheadend` from the `depends_on` of `freetvarr`.
3. Mount the folder TVHeadend records into (a NAS share, say) into the Freetvarr container.
4. In the wizard, enter `http://<tvheadend-host>:9981` and the login you made for Freetvarr.
5. On the Storage step, set the recordings root to where Freetvarr sees the folder, and set "Recordings folder (as TVHeadend sees it)" to the path TVHeadend writes to.

The Freetvarr host's address must fall inside the allowed networks of the TVHeadend user. See [The two recordings paths](/guide/configuration#the-two-recordings-paths).

## On a NAS

- Sign in over SSH before you run the install script or `docker compose`, so Docker is on the `PATH`.
- Make the `config` and `data` folders before the first start. Some NAS Docker builds refuse to mount a folder that does not exist. The install script makes them; with a container app, make them in the NAS file manager.
- Set `PUID` and `PGID` to your NAS user's values from `id`.
- Use a network tuner. Most NAS operating systems have no USB DVB drivers ([Hardware](/guide/hardware)).

## Updating

```sh
docker compose pull
docker compose up -d
```

A Freetvarr tab left open during the update offers **APPLY & RELOAD**.

## Where next

- [Following shows](/guide/following-shows): pick shows, point them at folders, sync.
- [TV Guide](/guide/tv-guide): schedule recordings from the browser.
- [Configuration](/guide/configuration): the full `.env` reference.
- [Troubleshooting](/guide/troubleshooting): if the connection, an import, or Plex misbehaves.
