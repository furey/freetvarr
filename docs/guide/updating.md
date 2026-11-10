---
title: Updating Freetvarr
description: >-
  Back up, update Freetvarr with Docker Compose, read what changes in each
  release, and go back to an older version.
---

# Updating Freetvarr

Freetvarr runs as a [Docker](https://docs.docker.com/) container. To update it, you download the newest Freetvarr Docker image and restart the container. Your settings, series rules, connections, and recording history carry over.

The steps, in order:

1. Read the [version notes](#version-notes) for the releases between your version and the newest one.
2. [Back up](#back-up) the Freetvarr settings folder.
3. [Update](#update).

## The compose folder

Each command on this page runs in the folder that holds your `docker-compose.yml`:

- **Installed with the install script**: the script made a folder called `freetvarr` in the folder where you ran it (e.g. `~/freetvarr`), and its final message shows the update command with that folder.
- **Set up by hand**: the folder where you saved `docker-compose.yml`.
- **Set up as a project in a NAS container app** (e.g. Synology [Container Manager](https://www.synology.com/en-global/dsm/feature/container-manager)): the folder you made for the project (e.g. `docker/freetvarr`).

## Back up

Freetvarr keeps its database and settings in a folder called `freetvarr`, inside the `config` folder next to your `docker-compose.yml` (the setting `CONFIG_PATH` in the `.env` file beside `docker-compose.yml` can move the `config` folder). The database is the file `state.db`. Its most recent changes sit in two files beside it, `state.db-wal` and `state.db-shm`, so always copy the whole folder:

1. Open a terminal in the [compose folder](#the-compose-folder).
2. Stop Freetvarr:

   ```sh
   docker compose stop freetvarr
   ```

3. Copy the whole `config/freetvarr` folder somewhere safe, such as `config/freetvarr-backup`.

In a NAS container app, stop the project, copy the `config/freetvarr` folder in the NAS file manager, and start the project again.

A backup matters most before an update that changes the database, because an older Freetvarr cannot always open a database that a newer one updated. Without a backup, you can undo database changes one at a time ([Go back without a backup](#go-back-without-a-backup)). [Backups](/guide/configuration#backups) also covers the settings folder of [TVHeadend](https://tvheadend.org/).

## Update

If you set up Freetvarr as a project in a NAS container app, update the project in the container app instead. The app downloads the new Docker images and restarts the project.

Otherwise, in a terminal in the [compose folder](#the-compose-folder), download the new Docker images, then restart the Docker containers:

```sh
docker compose pull
docker compose up -d
```

Your `docker-compose.yml` uses the image `ghcr.io/furey/freetvarr:latest`, so `docker compose pull` downloads the newest Freetvarr release. It also downloads the newest TVHeadend image, and the newest [Plex](https://www.plex.tv/) image if your `docker-compose.yml` runs Plex.

On its first start after an update, Freetvarr updates its database by itself. A Freetvarr browser tab left open during the update shows a card with **Reload** to load the new version.

When a newer release is out, **VERSIONS** in Settings → ABOUT → About Freetvarr shows it beside **Updates**, such as `2.1.0 available`. Press it to open **How to update**: your version and the new one, a link to the release notes, and the backup and update commands from this page, each with **Copy**. If the release notes have a "What changes for existing installs" section, it also asks you to read the [version notes](#version-notes) first.

## Update automatically with Watchtower

Watchtower is a container that checks for new Docker images on a schedule. When it finds one, it downloads the image and restarts the container with the same settings ([Watchtower](https://watchtower.nickfedor.com/)).

Watchtower controls Docker through the Docker socket, `/var/run/docker.sock`, the file that takes commands for Docker. A container with the Docker socket has full control of the host: it can start, stop, and change every container, and through them read and change any file on the computer. Add Watchtower only if you accept that.

The original Watchtower project (`containrrr/watchtower`) stopped on `2025-12-17` ([announcement](https://github.com/containrrr/watchtower/discussions/2135)), and its image fails on Docker Engine `29` with the error `client version 1.25 is too old` ([issue 2124](https://github.com/containrrr/watchtower/issues/2124)). The example below uses the maintained fork by Nick Fedor ([fork documentation](https://watchtower.nickfedor.com/), [source](https://github.com/nicholas-fedor/watchtower)), which takes the same settings. Its images are built from the public source by GitHub Actions and signed, and its HTTP API, Git mode, and lifecycle hooks are off unless you turn them on. One person maintains it, so decide for yourself whether you trust it.

1. In your `docker-compose.yml`, add a label to the `freetvarr` service. Watchtower then updates Freetvarr and leaves the other containers alone:

   ```yaml
     freetvarr:
       labels:
         - com.centurylinklabs.watchtower.enable=true
   ```

2. Add a `watchtower` service under `services:`:

   ```yaml
     watchtower:
       image: ghcr.io/nicholas-fedor/watchtower:1.23.2
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

3. In a terminal in the [compose folder](#the-compose-folder), run:

   ```sh
   docker compose up -d
   ```

   In a NAS container app, add the same lines to the project and start it again.

The settings, from the Watchtower [container selection](https://watchtower.nickfedor.com/v1.23.2/configuration/container-selection/), [scheduling](https://watchtower.nickfedor.com/v1.23.2/configuration/scheduling/), and [update behaviour](https://watchtower.nickfedor.com/v1.23.2/configuration/update-behavior/) pages:

- **`image`**: a fixed version, so Watchtower never pulls a new Watchtower release that nobody reviewed. To update Watchtower, change the version by hand after you read its [release notes](https://github.com/nicholas-fedor/watchtower/releases).
- **`WATCHTOWER_LABEL_ENABLE`**: Watchtower updates only the containers with the label `com.centurylinklabs.watchtower.enable=true`, and leaves the others alone.
- **`WATCHTOWER_SCHEDULE`**: when Watchtower checks, as a cron expression with 6 fields (seconds first). `0 0 4 * * *` checks every day at 4am, in the time zone that `/etc/localtime` gives it.
- **`WATCHTOWER_CLEANUP`**: Watchtower deletes the old Freetvarr image after an update, to free disk space.

Watchtower updates without a [backup](#back-up) and without reading the [version notes](#version-notes). If you want a backup before each update, leave Watchtower out and update by hand. TVHeadend and Plex have no label, so they update only when you run the [update](#update) commands.

## Version notes

These releases change something on your install when you update to them. Read each one between your version and the newest. Other releases need nothing beyond the update; [Releases on GitHub](https://github.com/furey/freetvarr/releases) lists what each release changes.

### 2.23.0

[Release notes for `2.23.0`](https://github.com/furey/freetvarr/releases/tag/2.23.0)

- **Database**: the first start adds one database change (database change `0050`). `0050` adds a table of picture stamps: for each title, a short code that changes when a guide or recording picture of the title changes, so the browser loads the new picture. A version that is older than `0050` cannot open the database; to go back without a backup, see [Go back without a backup](#go-back-without-a-backup).

### 2.22.0

[Release notes for `2.22.0`](https://github.com/furey/freetvarr/releases/tag/2.22.0)

- **Database**: the first start adds one database change (database change `0049`). `0049` adds a table of picture checks: for each guide picture address, a small fingerprint of the picture, so Freetvarr can find channel logos and other stand-in pictures. A version that is older than `0049` cannot open the database; to go back without a backup, see [Go back without a backup](#go-back-without-a-backup).
- **Pictures**: Freetvarr finds pictures again for every title once, and deletes saved guide pictures that are channel logos.

### 2.20.0

[Release notes for `2.20.0`](https://github.com/furey/freetvarr/releases/tag/2.20.0)

- **Database**: the first start adds one database change (database change `0048`). `0048` adds a table of guide source scores: after each build of the merged guide, one row per guide source and channel. A version that is older than `0048` cannot open the database; to go back without a backup, see [Go back without a backup](#go-back-without-a-backup).
- **Guide**: Home and Health show a notice when the merged guide is ready. TVHeadend reads its guide as before until you press **Use the merged guide** on the Settings **Guide** page ([Guide](/guide/settings#guide)).

### 2.19.0

[Release notes for `2.19.0`](https://github.com/furey/freetvarr/releases/tag/2.19.0)

- **Database**: the first start adds one database change (database change `0047`). `0047` adds a table of guide titles: for each title one guide source writes differently from another, the title that series rules use. A version that is older than `0047` cannot open the database; to go back without a backup, see [Go back without a backup](#go-back-without-a-backup).
- **Guide files**: Freetvarr saves guide files in the `guide/` folder of the config folder. After you go back, you can delete that folder.

### 2.16.0

[Release notes for `2.16.0`](https://github.com/furey/freetvarr/releases/tag/2.16.0)

- **Database**: the first start adds one database change (database change `0046`). `0046` adds a table that lists the guide pictures Freetvarr saves, one per picture address and up to `4` per title, so that a programme keeps its picture when the guide source stops serving it. The pictures go in the `artwork/guide/` folder of the config folder. A version that is older than `0046` cannot open the database; to go back without a backup, see [Go back without a backup](#go-back-without-a-backup). After you go back, you can delete the `artwork/guide/` folder.

### 2.14.0

[Release notes for `2.14.0`](https://github.com/furey/freetvarr/releases/tag/2.14.0)

- **Database**: the first start adds one database change (database change `0045`). `0045` adds two columns to the picture table, so that an open page can swap in a picture as soon as Freetvarr finds it. A version that is older than `0045` cannot open the database; to go back without a backup, see [Go back without a backup](#go-back-without-a-backup).

### 2.13.0

[Release notes for `2.13.0`](https://github.com/furey/freetvarr/releases/tag/2.13.0)

- **Database**: the first start adds one database change (database change `0044`). `0044` adds a table that keeps the picture Freetvarr chose for each title, so that lists and show pages use the same picture. A version that is older than `0044` cannot open the database; to go back without a backup, see [Go back without a backup](#go-back-without-a-backup).

### 2.10.2

[Release notes for `2.10.2`](https://github.com/furey/freetvarr/releases/tag/2.10.2)

- **Series recordings follow the country of your time zone**: the country tags that a series recording leaves out, and the words for [other titles in the guide](/guide/series#other-titles-in-the-guide), now come from the country of your time zone ([how a series recording works](/guide/series#how-a-series-recording-works)). Australian and New Zealand installs see no change: the titles in TVHeadend stay as they are. On the first start or sync that reaches TVHeadend, and after a new time zone is saved, an install in another country changes the title of each series recording it made to the form for its country. A series recording of `Say Yes To The Dress` in the UK then records `Say Yes To The Dress: UK` and leaves out `Say Yes To The Dress (US)`. It changes only rules whose comment is `freetvarr`, whose title is the show name, and that use neither **Merge-text** nor full-text search; it deletes no rule. What changes in TVHeadend:
  - TVHeadend drops the scheduled timers of the editions that the new title leaves out, and makes timers for the editions it now records. The Freetvarr log names each dropped timer (`[rules] timer ... stops matching`).
  - TVHeadend makes the other timers of each changed rule again. A padding change you made on one episode goes back to the padding of the rule.
  - When Freetvarr does not know the country of your time zone, it changes no title. Choose your time zone in Settings → SYSTEM → Schedule; Freetvarr then changes the titles for that country.
  - A later change of time zone to another country changes the titles again, once.

### 2.10.0

[Release notes for `2.10.0`](https://github.com/furey/freetvarr/releases/tag/2.10.0)

- **Database**: the first start adds one database change (database change `0043`). `0043` adds a table that keeps the [other titles](/guide/series#other-titles-in-the-guide) you turn on for each series. A version that is older than `0043` cannot open the database; to go back without a backup, see [Go back without a backup](#go-back-without-a-backup).
- **Series recordings leave out foreign editions**: on the first start that reaches TVHeadend, Freetvarr changes the title of each series recording it made, so that `UK`, `US`, or `USA` alone after the show title no longer matches ([how a series recording works](/guide/series#how-a-series-recording-works)). A series recording of `Say Yes To The Dress` then stops recording `Say Yes To The Dress: UK`. It changes only rules whose comment is `freetvarr`, whose title is the show name, and that do not use **Merge-text**; it deletes no rule. What changes in TVHeadend:
  - TVHeadend drops the scheduled timers of foreign editions. The Freetvarr log names each one (`[rules] timer ... stops matching`). To record one, press **Record** on the airing in the TV guide.
  - TVHeadend makes the other timers of each changed rule again. A padding change you made on one episode goes back to the padding of the rule.
  - Going back to an older version keeps the new titles in TVHeadend. The older version then shows the title as a long pattern that starts `^The Chase( ?[:(-]` in Series rules, and **Record series** on that show makes a second rule. To avoid this, cancel each series in Series rules before you go back, then record it again on the older version.

### 2.8.0

[Release notes for `2.8.0`](https://github.com/furey/freetvarr/releases/tag/2.8.0)

- **Hostname check, report only**: Freetvarr notes each hostname it does not know, but refuses nothing yet, except changes to the list from a page opened by an unlisted name. Open [Health](/guide/doctor#host-names) and check **Allowed hostnames**. If it names a hostname you use, such as a reverse proxy name, add it to [Allowed hostnames](/guide/troubleshooting#allowed-hostnames) before `3.0.0`, which refuses unlisted names.
- **`FREETVARR_ALLOWED_HOSTS`**: an old `docker-compose.yml` does not pass this variable to the container. To use it, add `- FREETVARR_ALLOWED_HOSTS=${FREETVARR_ALLOWED_HOSTS:-}` under `environment:` of the `freetvarr` service, as in [`docker-compose.example.yml`](https://github.com/furey/freetvarr/blob/main/docker-compose.example.yml).

### 2.7.0

[Release notes for `2.7.0`](https://github.com/furey/freetvarr/releases/tag/2.7.0)

- **Database**: the first start adds two database changes (database changes `0041` and `0042`). `0041` adds a column that keeps the rating and category labels of a +1 channel apart from those of its main channel. `0042` adds a column that marks a [Remove after import](/guide/remove-from-tvheadend) that Freetvarr must try again. A version that is older than `0041` cannot open the database; to go back without a backup, see [Go back without a backup](#go-back-without-a-backup).
- **Series recordings match the whole title**: on the first start that reaches TVHeadend, Freetvarr changes the title of each series recording it made to the [whole-title form](/guide/series#how-a-series-recording-works). It changes only rules whose comment is `freetvarr`, whose title is the show name, and that do not use **Merge-text**; it deletes no rule. If TVHeadend refuses a change, the rule keeps its old title, Health shows a warning under **Series recordings**, and Freetvarr tries again after the next sync. What changes in TVHeadend:
  - TVHeadend drops the scheduled timers whose title is longer than the show title. The Freetvarr log names each one (`[rules] timer ... stops matching`). Such a timer comes back by itself when the XMLTV guide lists that airing under the show title. To record one that does not come back, press **Record** on the airing in the TV guide.
  - TVHeadend makes the other timers of each changed rule again. A padding change you made on one episode goes back to the padding of the rule.
  - Going back to an older version keeps the new titles in TVHeadend. The older version then shows the title as a pattern, such as `^The Chase( ?[:(-].*)?$`, in Series rules, and **Record series** on that show makes a second rule.
- **Recordings TVHeadend removed itself**: the first sync marks each recording that TVHeadend removed on its own (for example with **Keep the latest**) as not in TVHeadend. Rows that were never imported then leave the Recordings log 30 days later.

### 2.6.4

[Release notes for `2.6.4`](https://github.com/furey/freetvarr/releases/tag/2.6.4)

- **Cleared items stay in the library**: **Clear** on the Recording log no longer hides a recording from the library. The first start moves each cleared date to a new column.
- **Database**: the first start adds one database change (database change `0040`). Version `2.6.3` and older cannot open the database after it; to go back without a backup, see [Go back without a backup](#go-back-without-a-backup).

### 2.4.0

[Release notes for `2.4.0`](https://github.com/furey/freetvarr/releases/tag/2.4.0)

- **Sport with no TVDB or TMDB entry moves to One-offs**: after the first sync, Freetvarr moves the files of a sport title that has no entry on [TheTVDB](https://thetvdb.com/) or [TMDB](https://www.themoviedb.org/) (The Movie Database), such as `Rugby League World Cup 2026` or `AFLW`, from the TV folder to the one-off folder. It switches off the title match it made for that title and removes the empty TV folder. Sport titles that you record with **Record series**, or that you moved with **Move to Shows**, stay in Shows ([Library](/guide/recordings#library)).
- **Title matches match whole words**: `NRL` no longer matches `NRLW` ([Title matches](/guide/series#title-matches)).
- **Placeholder file**: Freetvarr adds an empty hidden file, `.freetvarr-keep`, to the one-off folder ([One-offs that stay in Plex](/guide/troubleshooting#one-offs-that-stay-in-plex)).
- **Database**: the first start adds one database change (database change `0039`).

### 2.0.2

[Release notes for `2.0.2`](https://github.com/furey/freetvarr/releases/tag/2.0.2)

- **New series folders**: a series recorded for the first time after the update gets a folder named after the show, with its TVDB number (the show's ID on TheTVDB, an online TV database), such as `Big Brother (AU) {tvdb-76237}`. The country code appears only when shows from other countries have the same title. New episode files take the form `Big Brother (AU) - S17E06.ts`. See [Series folder names](/guide/series#series-folder-names).
- **Existing folders keep their names**: new episodes keep going to each series' current folder.
- **Check which show this is**: the edit form of a series names the show Freetvarr found, and asks you to pick when Freetvarr is not sure ([Check which show this is](/guide/series#check-which-show-this-is)).
- **Rename folder**: renames an existing series folder to the new name. Before you rename a folder that Plex already shows, turn off **Empty trash automatically after every scan** in Plex ([Renamed folders](/guide/plex#renamed-folders)). Freetvarr does not offer the rename for a folder that [Sonarr](https://sonarr.tv/) or [Radarr](https://radarr.video/) also saves into ([Rename folder](/guide/series#rename-folder)).
- **Database**: the first start adds two database changes (migrations `0037` and `0038`).

### 2.0.0

[Release notes for `2.0.0`](https://github.com/furey/freetvarr/releases/tag/2.0.0)

This is the update from Freetvarr 1.x. Back up first: Freetvarr 1.x cannot open the database after this update.

- **Database**: the first start adds 30 database changes (migrations `0007` to `0036`).
- **Files move once**: about 3 minutes after the first start, Freetvarr sorts every title as a show, a one-off, or a movie, and moves the files once to match. A move never overwrites a file. Freetvarr skips that file and lists it in Settings → SYSTEM → Activity, under the **Library folders** job.
- **Plex watched sync**: if Plex is set up, watched state syncs both ways (**From Plex** and **Back to Plex**). Turn either off in Settings → RECORDING → Plex.
- **Your whole Plex library**: Recordings lists the episodes and films in your Plex TV and Movies libraries. Turn it off in Settings → RECORDING → Plex → **Show your whole Plex library**.
- **Live streams at once**: a `docker-compose.yml` from before 2.0.0 caps live streams at `2`. To let Freetvarr choose the limit for your computer, change `${LIVE_TV_MAX_SESSIONS:-2}` to `${LIVE_TV_MAX_SESSIONS:-}` in your `docker-compose.yml`, then run:

  ```sh
  docker compose up -d
  ```

- **Sonarr and Radarr mounts (optional)**: to let Freetvarr read their API keys, add the lines from [`docker-compose.example.yml`](https://github.com/furey/freetvarr/blob/main/docker-compose.example.yml) to your `docker-compose.yml` ([Sonarr and Radarr](/guide/sonarr-radarr)).

## Go back to an older version

To go back, restore the backup you made before the update:

1. Stop Freetvarr:

   ```sh
   docker compose stop freetvarr
   ```

2. Rename the current `config/freetvarr` folder to `config/freetvarr-new`, then copy your backup (such as `config/freetvarr-backup`) to `config/freetvarr`. In a NAS container app, do this in the NAS file manager.
3. In your `docker-compose.yml`, change the image of the `freetvarr` service from `ghcr.io/furey/freetvarr:latest` to the version you backed up from, such as `ghcr.io/furey/freetvarr:2.0.1`.
4. Start Freetvarr:

   ```sh
   docker compose up -d
   ```

To return to the newest release later, change the image back to `ghcr.io/furey/freetvarr:latest`, then [update](#update) as usual.

## Go back without a backup

Use this when you updated, did not make a backup, and want the older version. The older version fails to start on the newer database: its container stops and restarts again and again, because the database lists a database change that the older version does not have. The fix is to undo those database changes with the newer version, then change the image.

Run these steps on the version you want to leave, before you change the image. If you already changed the image and Freetvarr keeps restarting, change the image back to the newer version first.

1. Find the database changes to undo. Each [version note](#version-notes) names the database change that its release adds:
   - To go back from `2.23.0` to `2.22.x`, undo `0050`.
   - To go back from `2.23.0` to `2.20.0` or `2.21.x`, undo `0050`, then `0049`.
   - To go back from `2.22.0` to `2.20.0` or `2.21.x`, undo `0049`.
   - To go back from `2.22.0` to `2.19.0`, undo `0049`, then `0048`.
   - To go back from `2.20.0` to `2.19.0`, undo `0048`.
   - To go back from `2.20.0` to `2.18.0` or older (down to `2.16.0`), undo `0048`, then `0047`.
   - To go back from `2.19.0` to `2.18.0` or older (down to `2.16.0`), undo `0047`.
   - To go back from `2.19.0` to `2.15.0` or `2.14.0`, undo `0047`, then `0046`.
   - To go back from `2.16.0` to `2.15.0` or `2.14.0`, undo `0046`.
   - To go back from `2.16.0` to `2.13.0`, undo `0046`, then `0045`.
   - To go back from `2.14.0` to `2.13.0`, undo `0045`.
   - To go back from `2.14.0` to `2.12.3` or older (down to `2.10.0`), undo `0045`, then `0044`.
   - To go back from `2.13.0` to `2.12.3` or older (down to `2.10.0`), undo `0044`.
   - To go back from `2.13.0` to `2.9.0` or older (down to `2.7.0`), undo `0044`, then `0043`.
   - To go back from `2.10.0` to `2.9.0` or older (down to `2.7.0`), undo `0043`.
   - To go back from `2.7.0` to `2.6.4`, undo `0042`, then `0041`.
   - To go back from `2.7.0` to `2.6.3` or older, undo `0042`, `0041`, then `0040`.
   - To go back from `2.6.4` to `2.6.3` or older, undo `0040`.
2. Stop Freetvarr:

   ```sh
   docker compose stop freetvarr
   ```

3. Undo the newest database change:

   ```sh
   docker compose run --rm --entrypoint "" freetvarr node node_modules/.bin/knex migrate:down
   ```

4. Run the command in step 3 again for each remaining database change from step 1. Each run undoes the next newest change.
5. In your `docker-compose.yml`, change the image of the `freetvarr` service to the older version, such as `ghcr.io/furey/freetvarr:2.6.3`.
6. Start Freetvarr:

   ```sh
   docker compose up -d
   ```

The command has two parts that matter:

- **`--entrypoint ""`**: the Freetvarr image starts through a script, `docker-entrypoint.sh`, that ignores the command you give it. It runs every pending database change and starts Freetvarr. Without `--entrypoint ""`, the command above would run `knex migrate:latest`, undo nothing, and start the server. The empty value removes the script for this one run.
- **`migrate:down`, not `migrate:rollback`**: `migrate:down` undoes one database change. `migrate:rollback` undoes every change from the last start that ran database changes. If you skipped versions, that is more than one change, and it can include a change that the older version needs.

An undo restores the old columns and keeps your recordings, series, and settings. Data that only the newer version stores, such as the +1 labels of `0041`, is dropped.
