---
title: Plex
description: >-
  Optional Plex integration: Plex from the compose file, library creation, token
  detection, and a library refresh after every sync that imported something.
---

# Plex

Plex is optional. Without it, Freetvarr still imports and files episodes; you just refresh the library yourself. With it, Freetvarr refreshes the right section after every sync that imported something.

## No Plex yet?

The compose file can run Plex next to Freetvarr. Freetvarr then finds the Plex token itself, and the wizard creates the Plex libraries.

1. Open `https://plex.tv/claim` and sign in to your Plex account (a free account works).
2. Copy the claim code. It expires 4 minutes after Plex shows it, so do the next steps straight away.
3. Add these lines to the `.env` beside `docker-compose.yml`:

   ```ini
   COMPOSE_PROFILES=plex
   PLEX_CLAIM=claim-xxxxxxxxxxxxxxxxxxxx
   ```

4. Start the services: `docker compose up -d`.
5. In the wizard's Plex step (or Settings → PLEX), keep the URL `http://127.0.0.1:32400`. Freetvarr fills in the token.
6. Check the library names and folders, then press `CREATE LIBRARIES`.

Freetvarr creates a **TV Shows** library for `/data/media/tv` and a **One-offs** library (the Other Videos type) for `/data/media/one-offs`. If you set a movies folder, it also creates a **Movies** library. It skips any folder that a Plex library already reads, and selects each library in Settings. Each library uses the language and rating system of the country from your time zone.

Plex keeps its settings in `${CONFIG_PATH}/plex` and reads your library at `/data/media`, the same paths as Freetvarr. To finish the Plex setup (for example, to name the server), open `http://<host-ip>:32400/web`.

If the claim code expired before Plex started, Plex runs without an account and Freetvarr finds no token. Get a new code, replace `PLEX_CLAIM` in `.env`, and run `docker compose up -d` again.

> [!NOTE]<br>
> Without `COMPOSE_PROFILES=plex` in `.env`, run `docker compose --profile plex up -d` instead, every time you start the services.

## Point Freetvarr at Plex

In Settings (or the wizard's Plex step), set your Plex server URL and token, then pick the TV library section from the list. The URL is `http://<plex-host-ip>:32400`. Auto-discover finds Plex servers on your network.

## Create the libraries

When Plex has no library for a Freetvarr folder, the wizard's Plex step and Settings → PLEX show `CREATE LIBRARIES`. The button needs the Plex URL and token; press `LOAD SECTIONS` in Settings to check for missing libraries.

Each library has a name and a folder. The folder is the path as Plex sees it. With the Plex from the compose file, that path is the same as Freetvarr's. For a Plex installed some other way, enter the path that Plex shows when you add a folder to a library. Freetvarr refuses a folder that Plex cannot see.

## The library folder

Freetvarr writes episodes to `${DATA_PATH}/media/tv` on the host (`/data/media/tv` inside its container). The Plex TV library you pick has to include that same host folder, or Plex refreshes the section and finds nothing new. If Plex runs in a container, mount `${DATA_PATH}/media/tv` into it, then edit the library in Plex and add the path Plex sees under **Add folders**. The two containers can use different paths for the folder; only the host folder has to be the same.

## The one-off library

Recordings with no series folder go to the [one-off folder](/guide/configuration#the-one-off-folder), `${DATA_PATH}/media/one-offs` on the host (`/data/media/one-offs` inside the container). Add a second Plex library of the **Other Videos** type that reads that folder, then choose it as the **Plex one-off section** in Settings. Other Videos does no online matching, so a sports final or a special keeps its own title.

If you set a movies folder, point a **Movies** library at it and choose that library as the **Plex movies section**.

## The token

- **Auto-detect** reads `PlexOnlineToken` from Plex's `Preferences.xml`. With the `plex` profile, Freetvarr reads the file from Plex's settings folder, and the wizard does this for you. If you installed Plex yourself on the same computer, set `PLEX_PREFS_PATH` in `.env` to the host path of the file (see [Configuration](/guide/configuration)), then recreate the container with `docker compose up -d freetvarr`. If you share the file with Freetvarr at another path, open **Token not found?** in Settings → PLEX and enter the path Freetvarr sees.
- Otherwise **paste the token manually**; grab it from `app.plex.tv` or Plex's own support article on finding your token.

Where `Preferences.xml` lives depends on how Plex is installed:

| Plex install                     | Host path of `Preferences.xml`                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| Linux package                    | `/var/lib/plexmediaserver/Library/Application Support/Plex Media Server/Preferences.xml` |
| Docker (linuxserver or official) | `<plex config folder>/Library/Application Support/Plex Media Server/Preferences.xml`     |
| Synology package (DSM 7)         | `/volume1/PlexMediaServer/AppData/Plex Media Server/Preferences.xml`                     |

Auto-detect fails with `PlexOnlineToken attribute not found` when that Plex server was never signed in to a Plex account; sign it in from Plex's own web app, then try again.

## Refresh

After any sync that imported a file, Freetvarr refreshes the configured section so new episodes appear without waiting for Plex's own scan interval. Press `REFRESH PLEX NOW` in Settings to refresh at any time.

A recording is only removed from TVHeadend after Plex confirms the file ([Remove from TVHeadend](/guide/remove-from-tvheadend)). The **Wait for Plex before removing recordings from TVHeadend** switch at the end of Settings → PLEX controls this; leave it on.

## Where the files land

Imports write under your media root using each series folder and season template ([Series](/guide/series)); Plex reads them as an ordinary TV library.

> [!NOTE]<br>
> Episodes stay `.ts`, the raw broadcast format. Plex plays them, but seeking is slow, because a transport stream has no index. If that bothers you, run the files through Tdarr or similar to remux them to `.mkv` after Freetvarr is done with them.
