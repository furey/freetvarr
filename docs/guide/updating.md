---
title: Updating Freetvarr
description: >-
  Back up, update Freetvarr with Docker Compose, read what changes in each
  release, and go back to an older version.
---

# Updating Freetvarr

Freetvarr runs as a Docker container. To update it, you download the newest Freetvarr Docker image and restart the container. Your settings, series rules, connections, and recording history carry over.

The steps, in order:

1. Read the [version notes](#version-notes) for the releases between your version and the newest one.
2. [Back up](#back-up) the Freetvarr settings folder.
3. [Update](#update).

## The compose folder

Each command on this page runs in the folder that holds your `docker-compose.yml`:

- **Installed with the install script**: the script made a folder called `freetvarr` in the folder where you ran it (e.g. `~/freetvarr`), and its final message shows the update command with that folder.
- **Set up by hand**: the folder where you saved `docker-compose.yml`.
- **Set up as a project in a NAS container app** (e.g. Synology Container Manager): the folder you made for the project (e.g. `docker/freetvarr`).

## Back up

Freetvarr keeps its database and settings in a folder called `freetvarr`, inside the `config` folder next to your `docker-compose.yml` (the setting `CONFIG_PATH` in the `.env` file beside `docker-compose.yml` can move the `config` folder). The database is the file `state.db`. Its most recent changes sit in two files beside it, `state.db-wal` and `state.db-shm`, so always copy the whole folder:

1. Open a terminal in the [compose folder](#the-compose-folder).
2. Stop Freetvarr: run `docker compose stop freetvarr`.
3. Copy the whole `config/freetvarr` folder somewhere safe, such as `config/freetvarr-backup`.

A backup matters most before an update that changes the database, because an older Freetvarr cannot always open a database that a newer one updated. [Backups](/guide/configuration#backups) also covers the TVHeadend settings folder.

## Update

If you set up Freetvarr as a project in a NAS container app, update the project in the container app instead. The app downloads the new Docker images and restarts the project.

Otherwise, in a terminal in the [compose folder](#the-compose-folder), download the new Docker images, then restart the Docker containers:

```sh
docker compose pull
docker compose up -d
```

Your `docker-compose.yml` uses the image `ghcr.io/furey/freetvarr:latest`, so `docker compose pull` downloads the newest Freetvarr release. It also downloads the newest TVHeadend image, and the newest Plex image if your `docker-compose.yml` runs Plex.

On its first start after an update, Freetvarr updates its database by itself. A Freetvarr browser tab left open during the update shows a card with **Reload** to load the new version.

When a newer release is out, **VERSIONS** in Settings → ABOUT → About Freetvarr shows it beside **Updates**, such as `2.1.0 available`. Press it to open **How to update**: your version and the new one, a link to the release notes, and the backup and update commands from this page, each with **Copy**. If the release notes have a "What changes for existing installs" section, it also asks you to read the [version notes](#version-notes) first.

## Update automatically with Watchtower

Watchtower is a container that checks for new Docker images on a schedule. When it finds one, it downloads the image and restarts the container with the same settings ([Watchtower](https://containrrr.dev/watchtower/)).

Watchtower controls Docker through the Docker socket, `/var/run/docker.sock`, the file that takes commands for Docker. A container with the Docker socket has full control of the host: it can start, stop, and change every container, and through them read and change any file on the computer. Add Watchtower only if you accept that.

The original Watchtower project (`containrrr/watchtower`) stopped on `2025-12-17` ([announcement](https://github.com/containrrr/watchtower/discussions/2135)), and its image fails on Docker Engine `29` with the error `client version 1.25 is too old` ([issue 2124](https://github.com/containrrr/watchtower/issues/2124)). The example below uses `nickfedor/watchtower`, a fork that is still maintained and takes the same settings ([fork documentation](https://watchtower.nickfedor.com/)).

1. In your `docker-compose.yml`, add a label to the `freetvarr` service. Watchtower then updates Freetvarr and leaves the other containers alone:

   ```yaml
     freetvarr:
       labels:
         - com.centurylinklabs.watchtower.enable=true
   ```

2. Add a `watchtower` service under `services:`:

   ```yaml
     watchtower:
       image: nickfedor/watchtower:latest
       container_name: watchtower
       restart: unless-stopped
       environment:
         - WATCHTOWER_LABEL_ENABLE=true
         - WATCHTOWER_SCHEDULE=0 0 4 * * *
         - WATCHTOWER_CLEANUP=true
       volumes:
         - /var/run/docker.sock:/var/run/docker.sock
         - /etc/localtime:/etc/localtime:ro
   ```

3. In a terminal in the [compose folder](#the-compose-folder), run `docker compose up -d`. In a NAS container app, add the same lines to the project and start it again.

The settings, from the Watchtower [container selection](https://watchtower.nickfedor.com/v1.23.2/configuration/container-selection/), [scheduling](https://watchtower.nickfedor.com/v1.23.2/configuration/scheduling/), and [update behaviour](https://watchtower.nickfedor.com/v1.23.2/configuration/update-behavior/) pages:

- **`WATCHTOWER_LABEL_ENABLE`**: Watchtower updates only the containers with the label `com.centurylinklabs.watchtower.enable=true`.
- **`WATCHTOWER_SCHEDULE`**: when Watchtower checks, as a cron expression with 6 fields (seconds first). `0 0 4 * * *` checks every day at 4am, in the time zone that `/etc/localtime` gives it.
- **`WATCHTOWER_CLEANUP`**: Watchtower deletes the old Freetvarr image after an update, to free disk space.

Watchtower updates without a [backup](#back-up) and without reading the [version notes](#version-notes). If you want a backup before each update, leave Watchtower out and update by hand. TVHeadend and Plex have no label, so they update only when you run the [update](#update) commands.

## Version notes

These releases change something on your install when you update to them. Read each one between your version and the newest. Other releases need nothing beyond the update; [Releases on GitHub](https://github.com/furey/freetvarr/releases) lists what each release changes.

### 2.0.2

[Release notes for `2.0.2`](https://github.com/furey/freetvarr/releases/tag/2.0.2)

- **New series folders**: a series recorded for the first time after the update gets a folder named after the show, with its TVDB number (the show's ID on TheTVDB, an online TV database), such as `Big Brother (AU) {tvdb-76237}`. The country code appears only when shows from other countries have the same title. New episode files take the form `Big Brother (AU) - S17E06.ts`. See [Series folder names](/guide/series#series-folder-names).
- **Existing folders keep their names**: new episodes keep going to each series' current folder.
- **Check which show this is**: the edit form of a series names the show Freetvarr found, and asks you to pick when Freetvarr is not sure ([Check which show this is](/guide/series#check-which-show-this-is)).
- **Rename folder**: renames an existing series folder to the new name. Before you rename a folder that Plex already shows, turn off **Empty trash automatically after every scan** in Plex ([Renamed folders](/guide/plex#renamed-folders)). Freetvarr does not offer the rename for a folder that Sonarr or Radarr also saves into ([Rename folder](/guide/series#rename-folder)).
- **Database**: the first start adds two database changes (migrations `0037` and `0038`).

### 2.0.0

[Release notes for `2.0.0`](https://github.com/furey/freetvarr/releases/tag/2.0.0)

This is the update from Freetvarr 1.x. Back up first: Freetvarr 1.x cannot open the database after this update.

- **Database**: the first start adds 30 database changes (migrations `0007` to `0036`).
- **Files move once**: about 3 minutes after the first start, Freetvarr sorts every title as a show, a one-off, or a movie, and moves the files once to match. A move never overwrites a file. Freetvarr skips that file and lists it in Settings → SYSTEM → Activity, under the **Library folders** job.
- **Plex watched sync**: if Plex is set up, watched state syncs both ways (**From Plex** and **Back to Plex**). Turn either off in Settings → RECORDING → Plex.
- **Your whole Plex library**: Recordings lists the episodes and films in your Plex TV and Movies libraries. Turn it off in Settings → RECORDING → Plex → **Show your whole Plex library**.
- **Live streams at once**: a `docker-compose.yml` from before 2.0.0 caps live streams at `2`. To let Freetvarr choose the limit for your computer, change `${LIVE_TV_MAX_SESSIONS:-2}` to `${LIVE_TV_MAX_SESSIONS:-}` in your `docker-compose.yml`, then run `docker compose up -d`.
- **Sonarr and Radarr mounts (optional)**: to let Freetvarr read their API keys, add the lines from [`docker-compose.example.yml`](https://github.com/furey/freetvarr/blob/main/docker-compose.example.yml) to your `docker-compose.yml` ([Sonarr and Radarr](/guide/sonarr-radarr)).

## Go back to an older version

To go back, restore the backup you made before the update:

1. Stop Freetvarr: run `docker compose stop freetvarr`.
2. Put the backup in place of the `config/freetvarr` folder.
3. In your `docker-compose.yml`, change the image of the `freetvarr` service from `ghcr.io/furey/freetvarr:latest` to the version you backed up from, such as `ghcr.io/furey/freetvarr:2.0.1`.
4. Start Freetvarr: run `docker compose up -d`.

To return to the newest release later, change the image back to `ghcr.io/furey/freetvarr:latest`, then [update](#update) as usual.
