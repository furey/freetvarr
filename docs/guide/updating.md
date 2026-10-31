---
title: Updating Freetvarr
description: >-
  Update Freetvarr with Docker Compose, back up first, go back to an
  older version, and read what changes in each release.
---

# Updating Freetvarr

## Update

Before an update, check the [version notes](#version-notes) and [back up](#back-up-first) if they ask you to. In a terminal in the folder with your Docker compose file, download the new Docker images, then restart the Docker containers:

```sh
docker compose pull
docker compose up -d
```

The install script made that folder: it is the `freetvarr` folder in the place where you ran the script. With a NAS container app, it is the folder of the Compose project (such as `docker/freetvarr`); there, pull the images and restart the project in the container app.

The Docker compose file uses the image `ghcr.io/furey/freetvarr:latest`, so `docker compose pull` gets the newest release. It also gets new Docker images for TVHeadend, and for Plex if the Docker compose file runs Plex.

On its first start after an update, Freetvarr updates its own database. Your settings, series rules, connections, and recording history carry over. A Freetvarr browser tab left open during the update offers a card with **Reload** to load the new version.

## Back up first

Back up before an update that changes the database (see [Version notes](#version-notes)). Freetvarr keeps its database and settings in the `config/freetvarr` folder (`${CONFIG_PATH}/freetvarr`, if you changed `CONFIG_PATH`). The database is `state.db`, and recent changes sit in `state.db-wal` and `state.db-shm` beside it, so copy the whole folder:

1. Stop Freetvarr: run `docker compose stop freetvarr` in a terminal in the `freetvarr` folder.
2. Copy the whole `config/freetvarr` folder, including `state.db`, `state.db-wal`, and `state.db-shm`.
3. Update as above.

[Backups](/guide/configuration#backups) covers the TVHeadend folder too.

## Go back to an older version

An older version cannot always open a database that a newer version updated, so go back with your backup:

1. Stop Freetvarr: run `docker compose stop freetvarr`.
2. Put the copied folder back in place of `config/freetvarr`.
3. In your `docker-compose.yml`, change the image of the `freetvarr` service from `ghcr.io/furey/freetvarr:latest` to the version you backed up from, such as `ghcr.io/furey/freetvarr:2.0.1`.
4. Start Freetvarr: run `docker compose up -d`.

To return to the newest release later, change the image back to `ghcr.io/furey/freetvarr:latest`, then update as usual.

## Version notes

These releases change something when you update to them. Other releases need nothing beyond the update; see the [releases on GitHub](https://github.com/furey/freetvarr/releases) for what each one changes.

### 2.0.2

[Release notes for `2.0.2`](https://github.com/furey/freetvarr/releases/tag/2.0.2)

- **New series folders**: a series recorded for the first time after the update gets a folder named after the show, with its TVDB number, such as `Big Brother (AU) {tvdb-76237}`. The country code appears only when shows from other countries have the same title. New episode files take the form `Big Brother (AU) - S17E06.ts`. See [Series folder names](/guide/series#series-folder-names).
- **Existing folders keep their names**: new episodes keep going to each series' current folder.
- **Check which show this is**: the edit form of a series names the show Freetvarr found, and asks you to pick when Freetvarr is not sure ([Check which show this is](/guide/series#check-which-show-this-is)).
- **Rename folder**: renames an existing series folder to the new name. Before you rename a folder that Plex already shows, turn off **Empty trash automatically after every scan** in Plex ([Renamed folders](/guide/plex#renamed-folders)). Freetvarr does not offer the rename for a folder that Sonarr also saves into ([Rename folder](/guide/series#rename-folder)).
- **Database**: the first start runs migrations `0037` and `0038`.

### 2.0.0

[Release notes for `2.0.0`](https://github.com/furey/freetvarr/releases/tag/2.0.0)

This is the update from Freetvarr 1.x. [Back up first](#back-up-first).

- **Database**: the first start runs 30 migrations (`0007` to `0036`). Freetvarr 1.x cannot open the updated database, so keep your backup if you might go back.
- **Files move once**: about 3 minutes after the first start, Freetvarr sorts every title as a show, a one-off, or a movie, and moves the files once to match. A move never overwrites a file; Freetvarr skips it and lists it in Settings → System → Activity under **Library folders**.
- **Plex watched sync**: if Plex is set up, watched state syncs both ways (**From Plex** and **Back to Plex**). Turn either off in Settings → Recording → Plex.
- **Your whole Plex library**: Recordings lists the episodes and films in your Plex TV and Movies libraries. Turn it off in Settings → Recording → Plex → **Show your whole Plex library**.
- **Live streams at once**: to let Freetvarr choose the limit for your computer, change `${LIVE_TV_MAX_SESSIONS:-2}` to `${LIVE_TV_MAX_SESSIONS:-}` in your `docker-compose.yml`, then run `docker compose up -d`.
- **Sonarr and Radarr mounts (optional)**: to let Freetvarr read their API keys, add the lines from [`docker-compose.example.yml`](https://github.com/furey/freetvarr/blob/main/docker-compose.example.yml) to your `docker-compose.yml` ([Sonarr and Radarr](/guide/sonarr-radarr)).
