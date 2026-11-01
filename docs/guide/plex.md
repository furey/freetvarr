---
title: Plex
description: >-
  Optional Plex integration: Plex from the Docker compose file, library creation, token
  detection, a library refresh after each import, watched state in both directions,
  and your whole Plex library in Recordings.
---

# Plex

<Illustration name="plex-integration" />

Plex is optional. Without it, Freetvarr still imports and files episodes (you refresh your media library yourself). With it, Freetvarr refreshes the matching Plex library after every sync that imported something, keeps watched marks and resume points the same in both apps, and can list your whole Plex library in Recordings. A [sync](/guide/syncs) is Freetvarr's pass over TVHeadend's finished recordings. Freetvarr's settings call each Plex library a section.

## No Plex yet?

The Docker compose file can run Plex next to Freetvarr. Freetvarr then finds the Plex [token](#the-token) (the key Freetvarr uses to sign in to Plex) itself, and Freetvarr's [setup](/guide/getting-started#_2-run-setup) creates the Plex libraries.

1. Run the [install script](/guide/getting-started#_1-install) first, if Freetvarr does not run yet. It creates the `freetvarr` folder with `docker-compose.yml` and a `.env` that holds your `PUID` and `PGID` (the user and group that own the files), then starts Freetvarr.
2. Add this line to the `.env` in the `freetvarr` folder:

   ```ini
   COMPOSE_PROFILES=plex
   ```

3. In a terminal in the `freetvarr` folder, run:

   ```sh
   docker compose pull
   ```

   This downloads the Plex Docker image now, so the claim code in the next step does not expire during the download.
4. In a browser, open `https://plex.tv/claim` and sign in to your Plex account (a free account works).
5. Copy the claim code. It expires 4 minutes after Plex shows it, so do the next two steps straight away.
6. Add the claim code to the `.env` on a new line:

   ```ini
   PLEX_CLAIM=claim-xxxxxxxxxxxxxxxxxxxx
   ```

7. In the terminal, start Plex:

   ```sh
   docker compose up -d
   ```

8. In Freetvarr in a browser, proceed to the **Plex** step of setup. Freetvarr finds Plex and its token itself. If you already finished setup, open Settings → RECORDING → Plex instead, enter the URL `http://127.0.0.1:32400` and press **Auto-detect token**.
9. Check the library names and folders, then press **Create libraries** to create the libraries in Plex.

Freetvarr creates a **TV Shows** library for `/data/media/tv` and a **One-offs** library (the Other Videos type) for `/data/media/one-offs`. If you set a [movies folder](/guide/configuration#the-one-off-folder), it also creates a **Movies** library. It skips any folder that a Plex library already reads, and selects each library in Settings → RECORDING → Plex. Each library uses the language and rating system of the country from your time zone.

Plex keeps its settings in `${CONFIG_PATH}/plex`, where `CONFIG_PATH` is the host config folder set in the `.env` ([Configuration](/guide/configuration#compose-environment)). Plex reads your library at `/data/media`, the same paths as Freetvarr. To finish the Plex setup (for example, to name the server), open `http://<host-ip>:32400/web` in a browser.

If the claim code expired before Plex started, Plex runs without an account and Freetvarr finds no token. Get a new code, replace `PLEX_CLAIM` in the `.env`, and run this again in a terminal in the `freetvarr` folder:

```sh
docker compose up -d
```

> [!NOTE]<br>
> Without `COMPOSE_PROFILES=plex` in `.env`, start the Docker containers every time with this command instead:
>
> ```sh
> docker compose --profile plex up -d
> ```

## Point Freetvarr at Plex

The **Plex** step of setup looks for Plex servers on your network and reads the token from Plex's settings file. When setup connects to Plex, it lists your Plex libraries under **TV library**, **Movies library**, and **One-off library**. For each, setup picks the library that reads the matching Freetvarr folder: the TV folder, the movies folder, or the one-off folder. Check each pick, or pick another library. **None** leaves the movies or one-off library out. **Movies library** shows only when you set a movies folder. Setup saves all three, and Freetvarr refreshes each library after an import. If setup finds no Plex server, press **Next**. If it finds Plex but no token, press **Connect Plex by hand** and paste the token ([The token](#the-token)). When Freetvarr cannot list the Plex libraries, **Connect Plex by hand** also has a number box for each library; leave the movies or one-off box blank to leave that library out.

In Settings → RECORDING → Plex, set your Plex server URL and token, then pick the **TV library**, **Movies library**, and **One-off library** from the lists. The URL is `http://<plex-host-ip>:32400`. **Auto-discover Plex** finds Plex servers on your network.

## Create the libraries

When Plex has no library for a Freetvarr folder, the **Plex** step of setup and Settings → RECORDING → Plex show **Create libraries**. The button needs the Plex URL and token. To check for missing libraries, press **Load libraries** in Settings → RECORDING → Plex.

Each library has a name and a folder. The folder is the path as Plex sees it. With the Plex from the Docker compose file, that path is the same as Freetvarr's. For a Plex installed some other way, enter the path that Plex shows when you add a folder to a library. Freetvarr refuses a folder that Plex cannot see.

## The library folder

Freetvarr writes episodes to `${DATA_PATH}/media/tv` on the host (`/data/media/tv` inside its Docker container), where `DATA_PATH` is the host data folder set in the `.env`. The Plex TV library you pick has to include that same host folder, or Plex refreshes the section and finds nothing new. If Plex runs in a Docker container, mount `${DATA_PATH}/media/tv` into it, then edit the library in Plex and add the path Plex sees under **Add folders**. The two Docker containers can use different paths for the folder. Only the host folder has to be the same.

## The movies library

If you set a [movies folder](/guide/configuration#the-one-off-folder), Freetvarr saves films with no series folder there. Point a Plex library of the **Movies** type at that folder, then choose it as the **Movies library** in the **Plex** step of setup or in Settings → RECORDING → Plex. Without a movies folder, films go to the one-off folder and the one-off library.

## The one-off library

Recordings with no series folder go to the [one-off folder](/guide/configuration#the-one-off-folder), `${DATA_PATH}/media/one-offs` on the host (`/data/media/one-offs` inside the Freetvarr Docker container). Add a second Plex library of the **Other Videos** type that reads that folder, then choose it as the **One-off library** in the **Plex** step of setup or in Settings → RECORDING → Plex. Other Videos does no online matching, so a sports final or a special keeps its own title.

## The token

- **Auto-detect** reads `PlexOnlineToken` from Plex's `Preferences.xml`. With the `plex` profile, Freetvarr reads the file from Plex's settings folder, and setup does this for you. If you installed Plex yourself on the same computer, set `PLEX_PREFS_PATH` in `.env` to the host path of the file (see [Configuration](/guide/configuration)), then recreate the Freetvarr Docker container. In a terminal in the `freetvarr` folder, run:

  ```sh
  docker compose up -d freetvarr
  ```

  If you share the file with Freetvarr at another path, open **Token not found?** in Settings → RECORDING → Plex and enter the path Freetvarr sees.
- Otherwise **paste the token manually** into Settings → RECORDING → Plex. Copy it from `app.plex.tv` (Plex's own support article explains how to find your token).

Where `Preferences.xml` lives depends on how Plex is installed:

| Plex install                     | Host path of `Preferences.xml`                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| Linux package                    | `/var/lib/plexmediaserver/Library/Application Support/Plex Media Server/Preferences.xml` |
| Docker (linuxserver or official) | `<plex config folder>/Library/Application Support/Plex Media Server/Preferences.xml`     |
| Synology package (DSM 7)         | `/volume1/PlexMediaServer/AppData/Plex Media Server/Preferences.xml`                     |

Auto-detect fails with `PlexOnlineToken attribute not found` when that Plex server was never signed in to a Plex account. Sign in to that Plex server from Plex's own web app in a browser, then press **Auto-detect token** again.

## Refresh

After any sync that imported a file, Freetvarr refreshes the configured section so new episodes appear without waiting for Plex's own scan interval. Press **Refresh Plex now** in Settings → RECORDING → Plex to refresh at any time.

A recording is only removed from TVHeadend after Plex confirms the file ([Remove from TVHeadend](/guide/remove-from-tvheadend)). The **Wait for Plex before removing recordings from TVHeadend** switch at the end of Settings → RECORDING → Plex controls this. Leave it on.

## Watched state

Freetvarr and Plex keep the same watched state and resume point for each recording. An episode you watch in Plex, or in Infuse through Plex, shows as watched in Freetvarr and loses its **New** pill. An episode you watch or mark in Freetvarr shows as watched in Plex.

The **WATCHED STATE** group in Settings → RECORDING → Plex has these controls:

- **From Plex**: copies watched, unwatched, and resume points from Plex to Freetvarr.
- **Back to Plex**: sends watched, unwatched, and resume points from Freetvarr to Plex.
- **Sync watched now**: runs a full check at once and shows the result.

Freetvarr matches each recording to its Plex item by file path. A recording that Plex has not scanned yet counts as "waiting for Plex" and syncs after the scan. A recording that matches more than one Plex item is left alone. The line beside **Sync watched now** shows the last check, such as `Last synced 9:04pm · 412 matched · 2 waiting for Plex`.

The check runs after each sync, about `10` seconds after you watch or mark something, and when you open Recordings. Most checks read only what changed since the last one. Once a day, and every hour while recordings wait for Plex, it reads every Plex item, so an episode marked unwatched in Plex also shows as unwatched in Freetvarr. **Sync watched now** always reads every item.

When the same episode changes on both sides between checks, the watched mark from Freetvarr wins, and the later resume point wins.

If Plex does not answer, Freetvarr waits `5` minutes before it tries again, then doubles the wait each time, up to `2` hours. The line beside **Sync watched now** says when it tries again. If Plex rejects the token, the line says so; check the token, then press **Sync watched now**.

It uses the Plex account that owns the token. Other Plex Home users keep their own watched state.

## Your whole library

Recordings can list everything in your Plex TV and Movies libraries, not only what Freetvarr recorded. Files from Sonarr, Radarr, and your own copies show on the same shelves and show pages, and play in Freetvarr's player. Freetvarr does not import, rename, or move these files.

The **YOUR WHOLE LIBRARY** group in Settings → RECORDING → Plex has these controls:

- **Show your whole Plex library**: on by default once Plex is connected.
- **Libraries to show**: the Plex TV and movie libraries it lists. At first these are your **TV library** and **Movies library**. The one-off library is never listed, because it holds only Freetvarr's own recordings.

<!-- markdownlint-disable MD033 -->
<BrowserFrame label="http://freetvarr.lan/#/settings/plex">
  <img src="../img/screenshot-plex.png" alt="Settings → RECORDING → Plex, with the YOUR WHOLE LIBRARY and WATCHED STATE groups" width="2560" height="1872" loading="lazy">
</BrowserFrame>
<!-- markdownlint-enable MD033 -->

Freetvarr reads the libraries during the watched state check: new and changed items after each sync (every `30` minutes by default), and every item once a day. Press **Sync watched now** to read them at once. Watched, unwatched, and resume points for these files always go back to Plex, because Plex keeps their watched state.

To delete these files from Freetvarr, connect [Sonarr and Radarr](/guide/sonarr-radarr) first, so a deleted download does not download again.

## Renamed folders

When you [rename a series folder](/guide/series#rename-folder), Plex finds the episodes at the new path at its next scan and matches the show again, this time with the TVDB number in the folder name. Plex keeps the watched state of an episode that it matches to the same show. An episode that Plex now matches to a different show (the reason to rename a wrongly matched folder) starts unwatched in Plex. Freetvarr keeps its own watched state for each recording.

With **Empty trash automatically after every scan** on (the Plex default), Plex removes the old items at that scan. To keep them until the new items show:

1. In Plex, open **Settings → Library**.
2. Turn off **Empty trash automatically after every scan**, then press **Save Changes**.
3. In Freetvarr, rename the folder.
4. In Plex, check that the show appears with its episodes.
5. Empty the trash of the TV library (**⋯ → Manage Library → Empty Trash** on the library), then turn the setting back on if you want it.

## File layout

Imports write under your [media root](/guide/configuration#the-two-recordings-paths) (the TV folder, `/data/media/tv` by default) using each series folder and season template ([Series rules](/guide/series)). Plex reads them as an ordinary TV library.

> [!NOTE]<br>
> Episodes stay `.ts`, the raw broadcast format. Plex plays them, but seeking is slow, because a transport stream has no index. If that bothers you, run the files through Tdarr or similar to remux them to `.mkv` after Freetvarr is done with them.
