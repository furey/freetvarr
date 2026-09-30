---
title: Live TV
description: >-
  Watching free-to-air live off the tuner, in Freetvarr's browser player or
  from the tuner's own app, Plex, Jellyfin, or Kodi, with no subscription.
---

# Live TV

A network tuner streams live channels to anything on your LAN, and TVHeadend streams from any tuner it drives. None of it costs anything. Freetvarr has its own player for a quick look in the browser; the apps below suit an evening on the couch and need no Freetvarr at all.

## The options

| App                                 | Platforms                                | Points at              | Note                                                                        |
| ----------------------------------- | ---------------------------------------- | ---------------------- | --------------------------------------------------------------------------- |
| Freetvarr                           | Any modern browser, phones included      | TVHeadend              | No install. No captions yet                                                 |
| The tuner's own app, e.g. HDHomeRun | Apple TV, iOS, Android, Fire TV, Windows | The tuner              | No server in the path. Simplest thing that works                            |
| Plex live TV                        | Every Plex client                        | The tuner              | Free. Plex Pass is only needed to record, which you already do in TVHeadend |
| Jellyfin live TV                    | Apple TV, iOS, Android, web              | TVHeadend or the tuner | Free, and carries the guide                                                 |
| Kodi + TVHeadend PVR add-on         | Apple TV, Android, Shield                | TVHeadend              | Full guide, and it renders captions                                         |

## In Freetvarr

Open a programme that is on air in the TV Guide and press **▶ WATCH LIVE**, or press **▶** beside a channel under **On now** on the dashboard. The player opens over the page and keeps playing while you switch tabs. **■ STOP** or **✕** ends the stream and frees the tuner.

Freetvarr asks TVHeadend for the channel and turns it into an HLS stream (short video segments that any browser can play) with the ffmpeg already in its container:

- **H.264 video** passes through untouched.
- **MPEG-2 or HEVC video** is re-encoded to H.264, because browsers cannot play MPEG-2. Standard-definition channels are deinterlaced and stay at `576` lines; HD channels in those formats drop to `540` lines to keep the CPU load down.
- **Audio** becomes stereo AAC. Freetvarr picks the main soundtrack in TVHeadend's default language and skips the audio-description track.

Before it tunes, Freetvarr checks the tuners. A channel on a multiplex that a tuner already carries shares that tuner at no cost. Otherwise it needs an idle tuner, and if every tuner is busy the player says so and lists what holds each one. If a scheduled recording in the next hour will need the tuner, the player shows the recording's name and a countdown; the recording wins when the time comes, and the player says which recording took the tuner.

Stream limits:

- **Two channels at once** by default. Set `LIVE_TV_MAX_SESSIONS` to change it. Viewers of the same channel share one stream.
- **The stream stops 20 seconds** after the last viewer closes the player or the tab.
- **CPU**: a re-encoded channel costs far more CPU than one that passes through, so prefer an H.264 simulcast where your broadcaster has one.

> [!NOTE]<br>
> The Freetvarr user in TVHeadend needs the streaming right, which the [TVHeadend guide](/guide/tvheadend#_8-make-a-user-for-freetvarr) already grants. TVHeadend gives Freetvarr's stream a low priority (`weight` `50`), so a recording always takes the tuner first.

## The tuner's own app

The author uses the HDHomeRun app. Install it, and it finds the tuner by itself. Channels appear in the order TVHeadend never sees, because this path skips TVHeadend entirely: the app talks to the tuner directly. That also means it competes for tuners, so a recording in progress takes one of them. A USB or PCIe tuner has no app of its own, so watch it through TVHeadend with Jellyfin or Kodi instead.

## Plex

Plex discovers an HDHomeRun the same way its own DVR feature does, and plays live channels on any client without a Plex Pass. You need a Plex Pass to *record* through Plex, which is exactly the thing TVHeadend and Freetvarr already do for free. With a USB or PCIe tuner, watch through Jellyfin or Kodi against TVHeadend instead.

## Captions

Captions arrive either as Teletext or as DVB subtitles, and your broadcaster decides which. Australian broadcasters send Teletext. This matters:

- **The native HDHomeRun app does not render them.** It is not a settings problem; the app has no Teletext decoder.
- **Kodi, VLC, and Channels do render them.** If captions are a requirement, watch through one of those.

> [!NOTE]<br>
> The same applies to recordings. A `.ts` from TVHeadend carries the Teletext stream, so a player that decodes Teletext shows captions and one that doesn't shows nothing.

## Tuner budget

Your tuner count is the limit, shared between recording and watching. The author's Flex Quatro has four tuners, so recording three overlapping programmes leaves one tuner for live TV. TVHeadend reports what's in use under **Status → Stream**; Freetvarr shows the tuner count on its dashboard.
