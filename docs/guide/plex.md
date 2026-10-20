---
title: Plex
description: >-
  Optional Plex integration: Plex from the Docker compose file, library creation, token
  detection, and a library refresh after every sync that imported something.
---

# Plex

Plex is optional. Without it, Freetvarr still imports and files episodes (you refresh your media library yourself). With it, Freetvarr refreshes the matching Plex library section after every sync that imported something.

## No Plex yet?

The Docker compose file can run Plex next to Freetvarr. Freetvarr then finds the Plex token itself, and Freetvarr's [setup](/guide/getting-started#_2-run-setup) creates the Plex libraries. Do these steps before you run the install script, or now if Freetvarr already runs.

1. In a browser, open `https://plex.tv/claim` and sign in to your Plex account (a free account works).
2. Copy the claim code. It expires 4 minutes after Plex shows it, so do the next steps straight away.
3. Add these lines to the `.env` beside `docker-compose.yml`:

   ```ini
   COMPOSE_PROFILES=plex
   PLEX_CLAIM=claim-xxxxxxxxxxxxxxxxxxxx
   ```

4. In a terminal in the `freetvarr` folder, start the Docker containers: `docker compose up -d`. The first start downloads the Plex Docker image. If you have not installed Freetvarr yet, run the [install script](/guide/getting-started#_1-install) instead.
5. In Freetvarr in a browser, proceed to the **Plex** step of setup. Freetvarr finds Plex and its token itself. If you already finished setup, open Settings → Library and Plex instead, enter the URL `http://127.0.0.1:32400` and press **Auto-detect token**.
6. Check the library names and folders, then press **Create libraries** to create the libraries in Plex.

Freetvarr creates a **TV Shows** library for `/data/media/tv` and a **One-offs** library (the Other Videos type) for `/data/media/one-offs`. If you set a movies folder, it also creates a **Movies** library. It skips any folder that a Plex library already reads, and selects each library in Settings → Library and Plex. Each library uses the language and rating system of the country from your time zone.

Plex keeps its settings in `${CONFIG_PATH}/plex` and reads your library at `/data/media`, the same paths as Freetvarr. To finish the Plex setup (for example, to name the server), open `http://<host-ip>:32400/web` in a browser.

If the claim code expired before Plex started, Plex runs without an account and Freetvarr finds no token. Get a new code, replace `PLEX_CLAIM` in the `.env`, and run `docker compose up -d` again in a terminal in the `freetvarr` folder.

> [!NOTE]<br>
> Without `COMPOSE_PROFILES=plex` in `.env`, run `docker compose --profile plex up -d` instead, every time you start the Docker containers.

## Point Freetvarr at Plex

The **Plex** step of setup looks for Plex servers on your network and reads the token from Plex's settings file. When setup connects to Plex, it picks the TV library that reads Freetvarr's TV folder. Check that library, or pick another. If setup finds no Plex server, press **Next**. If it finds Plex but no token, press **Connect Plex by hand** and paste the token ([The token](#the-token)).

In Settings → Library and Plex, set your Plex server URL and token, then pick the TV library section from the list. The URL is `http://<plex-host-ip>:32400`. **Auto-discover Plex** finds Plex servers on your network.

## Create the libraries

When Plex has no library for a Freetvarr folder, the **Plex** step of setup and Settings → Library and Plex show **Create libraries**. The button needs the Plex URL and token. To check for missing libraries, press **Load sections** in Settings → Library and Plex.

Each library has a name and a folder. The folder is the path as Plex sees it. With the Plex from the Docker compose file, that path is the same as Freetvarr's. For a Plex installed some other way, enter the path that Plex shows when you add a folder to a library. Freetvarr refuses a folder that Plex cannot see.

## The library folder

Freetvarr writes episodes to `${DATA_PATH}/media/tv` on the host (`/data/media/tv` inside its Docker container). The Plex TV library you pick has to include that same host folder, or Plex refreshes the section and finds nothing new. If Plex runs in a Docker container, mount `${DATA_PATH}/media/tv` into it, then edit the library in Plex and add the path Plex sees under **Add folders**. The two Docker containers can use different paths for the folder. Only the host folder has to be the same.

## The one-off library

Recordings with no series folder go to the [one-off folder](/guide/configuration#the-one-off-folder), `${DATA_PATH}/media/one-offs` on the host (`/data/media/one-offs` inside the Freetvarr Docker container). Add a second Plex library of the **Other Videos** type that reads that folder, then choose it as the **One-off section** in Settings → Library and Plex. Other Videos does no online matching, so a sports final or a special keeps its own title.

If you set a movies folder, point a **Movies** library at it and choose that library as the **Movies section**.

## The token

- **Auto-detect** reads `PlexOnlineToken` from Plex's `Preferences.xml`. With the `plex` profile, Freetvarr reads the file from Plex's settings folder, and setup does this for you. If you installed Plex yourself on the same computer, set `PLEX_PREFS_PATH` in `.env` to the host path of the file (see [Configuration](/guide/configuration)), then recreate the Freetvarr Docker container: run `docker compose up -d freetvarr` in a terminal in the `freetvarr` folder. If you share the file with Freetvarr at another path, open **Token not found?** in Settings → Library and Plex and enter the path Freetvarr sees.
- Otherwise **paste the token manually** into Settings → Library and Plex. Copy it from `app.plex.tv` (Plex's own support article explains how to find your token).

Where `Preferences.xml` lives depends on how Plex is installed:

| Plex install                     | Host path of `Preferences.xml`                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| Linux package                    | `/var/lib/plexmediaserver/Library/Application Support/Plex Media Server/Preferences.xml` |
| Docker (linuxserver or official) | `<plex config folder>/Library/Application Support/Plex Media Server/Preferences.xml`     |
| Synology package (DSM 7)         | `/volume1/PlexMediaServer/AppData/Plex Media Server/Preferences.xml`                     |

Auto-detect fails with `PlexOnlineToken attribute not found` when that Plex server was never signed in to a Plex account. Sign in to that Plex server from Plex's own web app in a browser, then press **Auto-detect token** again.

## Refresh

After any sync that imported a file, Freetvarr refreshes the configured section so new episodes appear without waiting for Plex's own scan interval. Press **Refresh Plex now** in Settings → Library and Plex to refresh at any time.

A recording is only removed from TVHeadend after Plex confirms the file ([Remove from TVHeadend](/guide/remove-from-tvheadend)). The **Wait for Plex before removing recordings from TVHeadend** switch at the end of Settings → Library and Plex controls this. Leave it on.

## File layout

Imports write under your media root using each series folder and season template ([Series rules](/guide/series)). Plex reads them as an ordinary TV library.

> [!NOTE]<br>
> Episodes stay `.ts`, the raw broadcast format. Plex plays them, but seeking is slow, because a transport stream has no index. If that bothers you, run the files through Tdarr or similar to remux them to `.mkv` after Freetvarr is done with them.
