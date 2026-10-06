---
title: Getting started
description: >-
  Install Freetvarr and TVHeadend with Docker Compose, then run the first-run
  wizard.
---

# Getting started

## Prerequisites

- A **TVHeadend-compatible tuner**. [Hardware](/guide/hardware) covers the choice.
- **Docker with Compose v2** on a host that stays on. For a network tuner such as an HDHomeRun, run Docker on Linux (a NAS, mini PC, or Raspberry Pi). Docker Desktop and OrbStack on a Mac or Windows PC cannot find a network tuner on their own; enter the tuner's address in the wizard's `CHANNELS` step instead ([Missing tuner](/guide/troubleshooting#missing-tuner)).

The compose file runs TVHeadend next to Freetvarr. If TVHeadend already runs elsewhere, see [An existing TVHeadend](#an-existing-tvheadend). Plex is optional. With no media server yet, the compose file can run Plex too ([No Plex yet?](/guide/plex#no-plex-yet)).

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

<!-- markdownlint-disable-next-line MD033 -->
<BrowserFrame src="/wizard-demo.mp4" poster="/wizard-demo-poster.jpg" label="http://freetvarr.lan/#/welcome" credit="" aria-label="A walkthrough of the Freetvarr setup wizard, from the time zone to the ready step" />

1. **Welcome**: confirm your time zone.
2. **TVHeadend**: if TVHeadend came with Freetvarr (the install script sets it up), choose an admin username and password (press the eye button to check what you typed), check the allowed networks, then press `SECURE TVHEADEND AND CONNECT FREETVARR`. If you already run your own TVHeadend, enter the login you made for Freetvarr ([TVHeadend step 8](/guide/tvheadend#_8-make-a-user-for-freetvarr)).
3. **Channels**: check the tuners and the transmitter your antenna points at, then press `FIND CHANNELS`. The scan takes a few minutes. If TVHeadend already has channels, press `NEXT`. If the wizard finds no tuner, enter the tuner's address and press `USE THIS ADDRESS`.
4. **Guide**: check the guide region, then press `SET UP GUIDE`. For any channel left without a guide, the wizard pre-selects its best guess; check each one or choose **No guide**, then press `SAVE & NEXT`. Outside Australia and New Zealand, enter an XMLTV guide address if you have one, or press `SKIP`.
5. **Storage**: Freetvarr checks the recordings folder and the TV library folder. If the checks pass, press `NEXT`. If a check fails, do what the message says, or change the folders under **Advanced: change folders**.
6. **Plex**: optional. Freetvarr looks for Plex and its token. If it connects, check the TV library, press `CREATE LIBRARIES` if Plex has no library for your recordings yet, then press `NEXT`. Without Plex, press `SKIP`. To enter the Plex address and token yourself, open **Advanced: connect Plex by hand** ([Plex](/guide/plex)).

Every value can be changed later in Settings.

## 3. Record something

Open the [TV Guide](/guide/tv-guide), click a programme, and press **RECORD** for one airing or **RECORD SERIES** for every episode. Freetvarr checks for finished recordings every `30` minutes (change it in **Settings → SCHEDULE**) and imports each one into your library ([Series](/guide/series)). To check the whole setup, open **Settings → HELP → RUN DOCTOR**.

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
5. On the Storage step, open **Advanced: change folders**. Set "Recordings folder (as Freetvarr sees it)" to where Freetvarr sees the folder, and set "Recordings folder (as TVHeadend sees it)" to the path TVHeadend writes to. Press `CHECK TVHEADEND` to compare it with TVHeadend.

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

- [TV Guide](/guide/tv-guide): schedule recordings from the browser.
- [Series](/guide/series): set series folders and sync.
- [Configuration](/guide/configuration): the full `.env` reference.
- [Troubleshooting](/guide/troubleshooting): if the connection, an import, or Plex misbehaves.
