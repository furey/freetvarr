---
title: TV apps
description: >-
  Live TV with the TV guide in Jellyfin or Kodi on your TV, tablet, or phone,
  straight from TVHeadend, with addresses you copy from Freetvarr.
---

# TV apps

TVHeadend already serves your channels and the TV guide to other apps. In Freetvarr, **Settings → WATCH ON YOUR TV** creates a TVHeadend login for those apps and shows each address to copy, so you never open TVHeadend's own settings. You still record in Freetvarr's [TV Guide](/guide/tv-guide).

| App      | On the TV                                                                          | Needs                                                     |
| -------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Jellyfin | Apple TV, Google TV and Android TV, Fire TV, some smart TVs (e.g. LG)              | A Jellyfin server on an always-on computer (e.g. the NAS) |
| Kodi     | Google TV and Android TV (from Google Play); Apple TV and Fire TV take extra steps | Nothing else; the app talks to TVHeadend itself           |

If you already run Jellyfin, use it: one server feeds every Jellyfin app in the house, and it can show your recordings too. If you don't, Kodi on a Google TV or Android TV is the quickest start.

## The TV login

1. In Freetvarr, open **Settings → WATCH ON YOUR TV**.
2. Check the login name. `tv` is the default; any name with no spaces works.
3. Press `MAKE A TV LOGIN` to create the TV login in TVHeadend.

Freetvarr creates a TVHeadend login that can only watch: it cannot record, change settings, or open TVHeadend's web pages. The login works only from the same networks as Freetvarr's own login. Freetvarr keeps the password and shows it in the panel, so you can copy it again later.

Freetvarr then fills in **TVHeadend address for TV apps** with the address your browser used to open Freetvarr. Check the address. It must be the IP address of the computer that runs TVHeadend (e.g. `192.168.1.10`). Change it if it is wrong (the addresses below it change too).

> [!NOTE]<br>
> The playlist and TV guide addresses carry a code instead of a password. Anyone on your home network who has them can watch your channels, but they cannot change TVHeadend or your recordings.

## Jellyfin

Jellyfin has its own TVHeadend plugin, but each plugin release suits only some Jellyfin versions. The tuner and TV guide addresses below work with any recent Jellyfin.

1. Open Jellyfin in a browser and sign in as an administrator.
2. Open the user menu (top right), then **Dashboard → Live TV**.
3. Under **Tuner Devices**, press **Add Tuner Device**.
4. Set **Tuner Type** to **M3U Tuner**.
5. In Freetvarr, press `COPY` beside **Tuner (M3U) URL**.
6. In Jellyfin, paste the address into **File or URL**, then press **Save**.
7. Under **TV Guide Data Providers**, press **Add Provider** and choose **XMLTV**.
8. In Freetvarr, press `COPY` beside **Guide (XMLTV) URL**.
9. In Jellyfin, paste the address into **File or URL**, then press **Save**.
10. Press **Refresh Guide Data**, beside **Add Provider**, and wait for the progress bar to finish.

Open **Live TV** in any Jellyfin app on your TV, tablet, or phone. The channels show TVHeadend's channel names and logos, and the TV guide fills in after the refresh.

If Jellyfin cannot load the tuner, Jellyfin may connect from a network the TV login does not allow (e.g. Jellyfin in Docker without host networking). In TVHeadend's web interface, open **Configuration → Users → Access Entries**, open the TV login, and add that network to **Allowed networks**.

## Kodi

1. In Kodi, open **Settings → Add-ons → Install from repository → PVR clients**.
2. Choose **Tvheadend HTSP Client** and press **Install**.
3. Press **Configure** on the add-on.
4. Enter the values from the **KODI** rows in Freetvarr's **Settings → WATCH ON YOUR TV**: **Hostname**, **HTTP port**, **HTSP port**, **Username**, and **Password**.
5. Press **OK**, then go back to the Kodi home screen.

**TV** on the home screen now lists the channels, and its **Guide** shows the TV guide. Kodi shows Australian captions, which most other apps do not ([Captions](/guide/live-tv#captions)).

## Plex

Plex Live TV accepts only HDHomeRun-style tuners. It cannot read TVHeadend's channels without an extra program in between, so Freetvarr does not set Plex up. With an HDHomeRun, Plex finds the tuner itself (see [Live TV](/guide/live-tv#plex)). Plex still plays your recordings as usual.

## Tuners

Each app that watches a channel uses a tuner, the same as a recording. If every tuner is busy, the app cannot start the channel. In TVHeadend's web interface, the **Status → Stream** page shows what is using each tuner.
