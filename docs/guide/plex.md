---
title: Plex
description: >-
  Optional Plex integration; token detection and a library refresh after every
  sync that imported something.
---

# Plex

Plex is optional. Without it, Freetvarr still imports and files episodes; you just refresh the library yourself. With it, Freetvarr refreshes the right section after every sync that imported something.

## Point Freetvarr at Plex

In Settings (or the wizard's Plex step), set your Plex server URL and token, then pick the TV library section from the list. The URL is `http://<plex-host-ip>:32400`. Auto-discover finds a Plex server on your network the same way Plex's own apps do (a protocol called GDM).

## The library folder

Freetvarr writes episodes to `${DATA_PATH}/media/tv` on the host (`/media/tv` inside its container). The Plex TV library you pick has to include that same host folder, or Plex refreshes the section and finds nothing new. If Plex runs in a container, mount `${DATA_PATH}/media/tv` into it then edit the library in Plex and add the path Plex sees under **Add folders**. The two containers can use different paths for the folder; only the host folder has to be the same.

## The token

- **Auto-detect** reads `PlexOnlineToken` from Plex's `Preferences.xml`, which only works when Plex runs on the same host and you've bind-mounted the file (`PLEX_PREFS_PATH`; see [Configuration](/guide/configuration)). Set `PLEX_PREFS_PATH` in `.env` to the host path of the file, then recreate the container with `docker compose up -d freetvarr`.
- Otherwise **paste the token manually**; grab it from `app.plex.tv` or Plex's own support article on finding your token.

Where `Preferences.xml` lives depends on how Plex is installed:

| Plex install                     | Host path of `Preferences.xml`                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| Linux package                    | `/var/lib/plexmediaserver/Library/Application Support/Plex Media Server/Preferences.xml` |
| Docker (linuxserver or official) | `<plex config folder>/Library/Application Support/Plex Media Server/Preferences.xml`     |
| Synology package (DSM 7)         | `/volume1/PlexMediaServer/AppData/Plex Media Server/Preferences.xml`                     |

Auto-detect fails with `PlexOnlineToken attribute not found` when that Plex server was never signed in to a Plex account; sign it in from Plex's own web app, then try again.

## Refresh

After any sync that imported a file, Freetvarr refreshes the configured section so new episodes appear without waiting for Plex's own scan interval. Refresh Plex now triggers it on demand.

The refresh also gates removes: a recording is only removed from TVHeadend after Plex confirms the file ([Remove from TVHeadend](/guide/remove-from-tvheadend)).

## Where the files land

Imports write under your media root using each show's folder and season template ([Following shows](/guide/following-shows)); Plex reads them as an ordinary TV library.

> [!NOTE]<br>
> Episodes stay `.ts`, the raw broadcast format. Plex plays it, but seeks through it clumsily, because a transport stream carries no index. If that bothers you, run the files through Tdarr or similar to remux them to `.mkv` after Freetvarr is done with them.
