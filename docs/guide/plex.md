---
title: Plex
description: >-
  Optional Plex integration; token detection and a library refresh after every
  sync that imported something.
---

# Plex

Plex is optional. Without it, freetvarr still imports and files episodes; you just refresh the library yourself. With it, freetvarr refreshes the right section after every sync that imported something.

## Point freetvarr at Plex

In Settings, set your Plex server URL and token, then Load sections and pick the TV library section. Auto-discover finds a Plex server on your network the same way Plex's own apps do (a protocol called GDM).

## The token

- **Auto-detect** reads `PlexOnlineToken` from Plex's `Preferences.xml`, which only works when Plex runs on the same host and you've bind-mounted the file (`PLEX_PREFS_PATH`; see [Configuration](/guide/configuration)).
- Otherwise **paste the token manually**; grab it from `app.plex.tv` or Plex's own support article on finding your token.

## Refresh

After any sync that imported a file, freetvarr refreshes the configured section so new episodes appear without waiting for Plex's own scan interval. Refresh Plex now triggers it on demand.

The refresh also gates deletes: a recording is only removed from TVHeadend after Plex confirms the file ([Delete from TVHeadend](/guide/delete-from-tvheadend)).

## Where the files land

Imports write under your media root using each show's folder and season template ([Following shows](/guide/following-shows)); Plex reads them as an ordinary TV library.

> [!NOTE]<br>
> Episodes stay `.ts`, the raw broadcast format. Plex plays it, but seeks through it clumsily, because a transport stream carries no index. If that bothers you, run the files through Tdarr or similar to remux them to `.mkv` after freetvarr is done with them.
