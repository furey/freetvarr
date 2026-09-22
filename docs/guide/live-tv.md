---
title: Live TV
description: >-
  Watching free-to-air live off the tuner, from the HDHomeRun app, Plex,
  Jellyfin, or Kodi, with no subscription.
---

# Live TV

The tuner streams live channels to anything on your LAN. None of it costs anything, and none of it needs Freetvarr running; Freetvarr records, these apps watch.

## The options

| App | Platforms | Points at | Note |
| --- | --- | --- | --- |
| HDHomeRun | Apple TV, iOS, Android, Fire TV, Windows | The tuner | No server in the path. Simplest thing that works |
| Plex live TV | Every Plex client | The tuner | Free. Plex Pass is only needed to record, which you already do in TVHeadend |
| Jellyfin live TV | Apple TV, iOS, Android, web | TVHeadend or the tuner | Free, and carries the guide |
| Kodi + TVHeadend PVR add-on | Apple TV, Android, Shield | TVHeadend | Full guide, and it renders captions |

## The HDHomeRun app

Install it, and it finds the tuner by itself. Channels appear in the order TVHeadend never sees, because this path skips TVHeadend entirely: the app talks to the tuner directly. That also means it competes for tuners, so a recording in progress takes one of the four.

## Plex

Plex discovers the HDHomeRun the same way its own DVR feature does, and plays live channels on any client without a Plex Pass. You need a Plex Pass to *record* through Plex, which is exactly the thing TVHeadend and Freetvarr already do for free.

## Captions

Australian broadcasters send captions as Teletext, not as DVB subtitles. This matters:

- **The native HDHomeRun app does not render them.** It is not a settings problem; the app has no Teletext decoder.
- **Kodi, VLC, and Channels do render them.** If captions are a requirement, watch through one of those.

> [!NOTE]<br>
> The same applies to recordings. A `.ts` from TVHeadend carries the Teletext stream, so a player that decodes Teletext shows captions and one that doesn't shows nothing.

## Tuner budget

Four tuners means four things at once, shared between recording and watching. A Flex Quatro recording three overlapping programmes leaves one tuner for live TV. TVHeadend reports what's in use under **Status → Stream**; Freetvarr shows the tuner count on its dashboard.
