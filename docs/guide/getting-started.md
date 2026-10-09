---
title: Getting started
description: >-
  Install Freetvarr and TVHeadend with Docker Compose, then run the first-run
  wizard.
---

# Getting started

## Prerequisites

- A **TVHeadend-compatible tuner**. [Hardware](/guide/hardware) covers the choice.
- **Docker with Compose v2** on a host that stays on. For a network tuner such as an HDHomeRun, run Docker on Linux (a NAS, mini PC, or Raspberry Pi). Docker Desktop and OrbStack on a Mac cannot find a network tuner on their own; enter the tuner's address in the wizard's `CHANNELS` step instead ([Missing tuner](/guide/troubleshooting#missing-tuner)). Freetvarr is untested on Windows, and the install script does not run there.

The Docker compose file runs TVHeadend next to Freetvarr. If TVHeadend already runs elsewhere, see [An existing TVHeadend](#an-existing-tvheadend). Plex is optional. With no media server yet, the Docker compose file can run Plex too ([No Plex yet?](/guide/plex#no-plex-yet)).

## 1. Install

In a terminal, run this command in the folder where you want a `freetvarr` folder to appear:

```sh
curl -fsSL https://raw.githubusercontent.com/furey/freetvarr/main/install.sh | sh
```

<BrowserFrame src="/install-demo.mp4" poster="/install-demo-poster.jpg" label="Terminal" credit="" aria-label="The one-line install in a terminal, from the curl command to the address of the setup wizard" />

The script creates the `freetvarr` folder, downloads its Docker compose file, writes its `.env`, and asks for confirmation regarding project file ownership. Press `Enter` to accept the defaults (most people do). The first start downloads the Docker images, which takes a few minutes. The script then starts the Docker containers and outputs the URL of the setup wizard. Open that URL in a browser and proceed to [step 2](#_2-run-the-wizard).

::: details Install script options

After a banner with the Freetvarr name and author credit, the script outputs the `.env` it wrote and asks you to confirm who owns the project files:

```text
[install] wrote .env:
    PUID=501
    PGID=20
    # TZ=Australia/Sydney
Files will be owned by this PUID and PGID. Start now? [Y/n/e = edit .env first]
```

`PUID` and `PGID` are the user and group that own the files Freetvarr writes, such as your recordings. Your numbers will differ from the example. Press `Enter` (or `Y`) to accept and start the Docker containers. This is right for most people.

Press `e` if the files must belong to a different user. On a NAS, for example, use the `PUID` and `PGID` of the user that owns your media share. The script opens its `.env` in a text editor (`vi`, unless you set `EDITOR`). In `vi`, press `i` to type, then `Esc`, then `:wq` and `Enter` to save and close the file. The script then starts the Docker containers.

Press `n` to stop without starting anything. Edit the `.env` in the `freetvarr` folder, then run the script again. `Esc` cancels without starting anything.

Run the script again at any time. It keeps an existing `.env` and Docker compose file, and it asks about file ownership until the Docker containers have started once. On a NAS, sign in over SSH first, and use `sudo` if your user cannot reach Docker.

:::

The script is the quickest way, but you have two other ways to install: [by hand](#install-by-hand) or with a [NAS container app](#install-nas-container-app). Both start the same services.

### Install: by hand

Use this instead of the script if you prefer to run each command yourself in a terminal, or if you want to check the Docker compose file first.

1. Create a folder and move into it: `mkdir freetvarr && cd freetvarr`.
2. Download the Docker compose file: `curl -fsSL https://raw.githubusercontent.com/furey/freetvarr/main/docker-compose.example.yml -o docker-compose.yml`.
3. Optional: write a `.env` with `PUID` and `PGID` set to your user and group (`id -u` and `id -g`).
4. Start both Docker containers: `docker compose up -d`. The first start downloads the Docker images, which takes a few minutes.
5. In a browser, open `http://<host-ip>:3733` and proceed to [step 2](#_2-run-the-wizard).

### Install: NAS container app

Use this instead of the script if your NAS has no SSH access, or if you prefer to manage Freetvarr in the NAS container app.

1. In the NAS file manager, create a folder such as `docker/freetvarr`.
2. Create two subfolders in it: `config` and `data`.
3. Optional: save a `.env` in the folder with your NAS user's `PUID` and `PGID`.
4. In the NAS container app, create a Compose project (some apps call it a stack) in the folder you made.
5. Upload [`docker-compose.example.yml`](https://raw.githubusercontent.com/furey/freetvarr/main/docker-compose.example.yml), or paste its content.
6. Start the project. The NAS container app downloads the Docker images and starts the Docker containers.
7. In a browser, open `http://<nas-ip>:3733` and proceed to [step 2](#_2-run-the-wizard).

> [!NOTE]<br>
> The author's NAS is a Synology. On Synology DSM the file manager is File Station, and the container app is Container Manager (**Project → Create**, then tick **Start the project once it is created**). The first DSM user is often `PUID=1026` and `PGID=100`. Docker is at `/usr/local/bin`, which is on the `PATH` only in an SSH login shell.

## 2. Run the wizard

The first visit to `http://<host-ip>:3733` in a browser opens the setup wizard:

<!-- markdownlint-disable-next-line MD033 -->
<BrowserFrame src="/wizard-demo.mp4" poster="/wizard-demo-poster.jpg" label="http://freetvarr.lan/#/welcome" credit="" aria-label="A walkthrough of the Freetvarr setup wizard, from the time zone to the ready step" />

1. **Welcome**: confirm your time zone.
2. **TVHeadend**: if Freetvarr installed TVHeadend for you, choose an admin username and password (press the eye button to check what you typed), check the allowed networks, then press `SECURE TVHEADEND AND CONNECT FREETVARR` to save the login in TVHeadend and connect Freetvarr to it. If you installed TVHeadend yourself, enter the TVHeadend username and password you created for Freetvarr ([TVHeadend step 8](/guide/tvheadend#_8-make-a-user-for-freetvarr)).
3. **Channels**: check the tuners and the transmitter your antenna points at, then press `FIND CHANNELS` to scan for channels. The scan takes a few minutes. If TVHeadend already has channels, press `NEXT` to skip the scan. If the wizard finds no tuner, enter the tuner's IP address and press `USE THIS ADDRESS`. In Australia, the scan also makes the HD channels of ABC, Seven, Nine, 10, and SBS your favourites, in that order, if you have no favourites yet. The step lists them; to change them, press `CHANNELS` in the TV Guide ([Favourites](/guide/tv-guide#favourites)).
4. **Guide**: check the TV guide region, then press `SET UP GUIDE`. For any channel left without TV guide listings, the wizard pre-selects its best guess (check each one, or choose **No guide**; to change a pick, click it and type part of a channel name or number to find the channel), then press `SAVE & NEXT` to save the choices and move to the next step. Outside Australia and New Zealand, enter an XMLTV guide address if you have one, or press `SKIP`.
5. **Storage**: Freetvarr checks the recordings folder and the TV library folder. If the checks pass, press `NEXT`. If a check fails, do what its message says, or change the folders under **Advanced: change folders**.
6. **Plex**: optional. Freetvarr looks for Plex and its access token. If Freetvarr connects to Plex, check the TV library, press `CREATE LIBRARIES` if Plex has no library for your recordings yet, then press `NEXT`. Without Plex, press `SKIP`. To enter the Plex address and token yourself, open **Advanced: connect Plex by hand** ([Plex](/guide/plex)).

Every value can be changed later in Freetvarr's Settings.

## 3. Record something

In Freetvarr, open the [TV Guide](/guide/tv-guide), click a programme, and press **RECORD** for one airing or **RECORD SERIES** for every episode. Freetvarr checks for finished recordings every `30` minutes (change it in **Settings → SCHEDULE**) and imports each one into your library ([Series](/guide/series)). To check the whole setup, open **Settings → HELP → RUN DOCTOR**.

## 4. Add it to your Home Screen

On a tablet or phone, add Freetvarr to the Home Screen. Freetvarr then opens full-screen from its own icon, like an app.

On an iPad or iPhone:

1. Open `http://<host-ip>:3733` in Safari.
2. Tap the Share button.
3. Tap **Add to Home Screen**, then **Add**.

On Android, open the address in Chrome, tap the `⋮` menu, then tap **Add to Home screen**.

In the Home Screen app, pull down from the top of a page to refresh it ([Pull to refresh](/guide/syncs#pull-to-refresh)).

## Configure

Every value in Freetvarr's `.env` is optional. These are the defaults:

```ini
PUID=1000
PGID=1000
CONFIG_PATH=./config
DATA_PATH=./data
FREETVARR_PORT=3733
```

Set `PUID` and `PGID` to your own user (`id -u` and `id -g`). After a change, run `docker compose up -d` in a terminal in the `freetvarr` folder to restart the Docker containers with the new values. [Configuration](/guide/configuration) covers every variable, the folders under `DATA_PATH`, and the two recordings paths.

## An existing TVHeadend

If TVHeadend already runs on another host or in another compose project:

1. Delete the `tvheadend` service from your `docker-compose.yml`.
2. Remove `tvheadend` from the `depends_on` of `freetvarr`.
3. Mount the folder TVHeadend records into (a NAS share, for example) into the Freetvarr Docker container.
4. In the wizard's TVHeadend step, enter `http://<tvheadend-host>:9981` and the TVHeadend username and password you created for Freetvarr.
5. On the Storage step, open **Advanced: change folders**. Set "Recordings folder (as Freetvarr sees it)" to where Freetvarr sees the folder, and set "Recordings folder (as TVHeadend sees it)" to the path TVHeadend writes to. Press `CHECK TVHEADEND` to compare it with TVHeadend.

The Freetvarr host's address must fall inside the allowed networks of the TVHeadend user. See [The two recordings paths](/guide/configuration#the-two-recordings-paths).

## On a NAS

- Sign in over SSH before you run the install script or `docker compose`, so Docker is on the `PATH`.
- Create the `config` and `data` folders before the first start. Some NAS Docker builds refuse to mount a folder that does not exist. The install script creates them (with a container app, create them in the NAS file manager).
- Set `PUID` and `PGID` in the `.env` to your NAS user's values from `id`.
- Use a network tuner. Most NAS operating systems have no USB DVB drivers ([Hardware](/guide/hardware)).

## Updating

In a terminal in the `freetvarr` folder, download the new Docker images, then restart the Docker containers:

```sh
docker compose pull
docker compose up -d
```

A Freetvarr browser tab left open during the update offers **APPLY & RELOAD** to load the new version.

## Where next

- [TV Guide](/guide/tv-guide): schedule recordings from the browser.
- [Series](/guide/series): assign series folders and sync recordings into your library.
- [Configuration](/guide/configuration): the full `.env` reference.
- [Troubleshooting](/guide/troubleshooting): if the TVHeadend connection, an import, or Plex does not work.
