---
title: Live TV
description: >-
  Watching free-to-air live off the tuner, in Freetvarr's browser player or
  from the tuner's own app, Plex, Jellyfin, or Kodi, with no subscription.
---

# Live TV

A network tuner streams live channels to any device on your home network, and TVHeadend streams from any tuner it controls. None of it costs anything. Freetvarr has its own player for a quick look in a browser. The apps below suit an evening on the couch and need no Freetvarr at all.

To watch with the TV guide in Jellyfin or Kodi on your TV, copy the addresses from Freetvarr's Settings → Watch on TV ([TV apps](/guide/tv-apps) has the steps).

## The options

| App                                 | Platforms                                | Points at              | Note                                                                        |
| ----------------------------------- | ---------------------------------------- | ---------------------- | --------------------------------------------------------------------------- |
| Freetvarr                           | Any modern browser, phones included      | TVHeadend              | No install. Pause and rewind `30` minutes. Captions                         |
| The tuner's own app, e.g. HDHomeRun | Apple TV, iOS, Android, Fire TV, Windows | The tuner              | No server in the path. Simplest thing that works                            |
| Plex live TV                        | Every Plex client                        | The tuner              | Free. Plex Pass is only needed to record, which you already do in TVHeadend |
| Jellyfin live TV                    | Apple TV, iOS, Android, web              | TVHeadend or the tuner | Free, and carries the TV guide. [TV apps](/guide/tv-apps) sets it up        |
| Kodi + TVHeadend PVR add-on         | Apple TV, Android, Shield                | TVHeadend              | Full guide, and it renders captions. [TV apps](/guide/tv-apps) sets it up   |

## In Freetvarr

<!-- markdownlint-disable MD033 -->
<BrowserFrame label="http://freetvarr.lan/#/live">
  <img src="../img/screenshot-live.png" alt="The Live TV page" width="2560" height="1872" loading="lazy">
</BrowserFrame>
<!-- markdownlint-enable MD033 -->

Open **Live TV** and press a channel to watch it. You can also press a card under **On now** on Home, or press **Watch live** in a programme sheet of the [Guide](/guide/tv-guide). A channel with no guide listing plays too. The player fills the screen and keeps playing while you switch pages. Press the back button at the top left to close the player and free the tuner.

The page has these controls:

- **All channels** and **Favourites** switch the list. The channels under **Favourites** come first.
- The **filter** field narrows the list by channel name or programme title.
- **Images** shows a picture of what is on. **Zoom** has three levels, **S**, **M**, and **L**. Each browser remembers both.
- The **channel settings** button opens the same settings as the Guide: favourites, sort order, hidden channels, and listings. See [Favourites](/guide/tv-guide#favourites).
- The star puts a channel in the favourites. Hold a favourite and drag it to reorder.

Each row shows the channel number and logo, the programme on now with a progress bar and the time left, and **Next** with the programme after it. A red **REC** badge marks a channel that records now. Press the **Next** card or the info button at the end of a row to open that programme's sheet in the Guide.

A dimmed channel marked **OFF AIR** is not broadcasting right now, so a press shows a message instead of starting a stream. The mark clears by itself once TVHeadend sees the channel again, after a channel scan.

<!-- markdownlint-disable MD033 -->
<BrowserFrame label="http://freetvarr.lan/#/live">
  <img src="../img/screenshot-player.png" alt="The full-screen player" width="2560" height="1872" loading="lazy">
</BrowserFrame>
<!-- markdownlint-enable MD033 -->

## Programme info

Press **Info** in the top bar of the player to show what is on. The panel sits over the bottom of the picture and shows:

- The channel logo, number, and name.
- The title, the episode title, and the season and episode number.
- The start and end times, and how much of the programme has played.
- The genre, the classification, and the start of the description.
- The programme that is on next, and when it starts.

On a wide screen, the panel also shows the programme picture. While you watch from the rewind buffer, the panel describes what you are watching, not what is on air, and reads **FROM BUFFER**. The title at the top of the player changes when a new programme starts. If the guide has nothing for the channel, the panel says so.

Press **Info** again, or click the picture above the panel, to close it. That click closes the panel only: it does not pause or skip. The full-screen button at the top right enters and exits full screen. To stop watching, press the back button.

## Captions

Press **Captions** in the top bar to turn captions on. Press it again to turn them off. Captions are off until you turn them on, and each browser remembers your choice for the next channel. While the programme info panel is open, captions hide and the button is dimmed. Closing the panel brings them back if they were on.

Captions come from the broadcast's Teletext subtitles. A channel shows the **Captions** button only when it carries them, and some programmes on that channel have no captions at all. To watch captions in other apps, see [Captions in other apps](#captions-in-other-apps).

## Record from the player

Press **Record** in the top bar to record the programme on now, or **Series** to record every episode. Both buttons open the programme sheet of the [Guide](/guide/tv-guide#recording-a-programme), with **Record** for this airing, **Record series** where the programme belongs to a series, the folder it saves to, and the option to keep it out of your library. A recording starts from the moment you confirm, so the part that already aired is not included.

If the guide has no listing for what is on now, both buttons are dimmed. **Series** turns on while a series recording records the programme; press it to change or cancel the series.

While the programme on now records, the record button reads **Recording** with a flashing red dot. Press it to open the sheet, then press **Stop recording**. The sheet says what happens to the part already recorded:

- After `5` minutes or more, the recording stops and the part recorded so far stays, and imports to your library like any finished recording.
- Before `5` minutes, the recording stops and Freetvarr deletes the part recorded so far.

Stopping an episode of a series recording stops that episode only. The series keeps recording future episodes, and it does not record the stopped episode again.

## Pause and rewind

The controls sit in the centre of the picture. Press the screen to show them when they hide.

- **Pause** (the large button) pauses. The channel keeps recording into the buffer. Press **Play** to carry on from where you paused. Pausing for longer than the buffer resumes from the oldest part the buffer still holds.
- **Start over** jumps to the start of the buffer. It is dimmed until the buffer holds something to go back to.
- **Jump to live** returns to now. It is dimmed while you watch live.

Drag the position bar at the bottom of the picture to rewind up to `30` minutes. While you are behind live, a pill on the bar says how far behind you are, such as `2 min behind`. Set `LIVE_TV_BUFFER_MINUTES` in the `.env` to keep more or fewer minutes, or `0` to turn it off.

To skip, double-tap (phone or tablet) or double-click (computer) the left third of the picture to go back `10` seconds, or the right third to go forward `10` seconds. Keep tapping to skip further. On a computer, the left and right arrow keys skip `10` seconds too. Skipping stops at the start of the buffer and at live. Safari on an iPhone shows no timeline for live TV, so double-tap is the way to rewind there.

If you lock the phone or switch to another app, Freetvarr keeps the channel and its buffer for as long as the buffer lasts (`30` minutes by default), so you can come back to it. The tuner stays in use for that time (press the back button to free it at once).

The buffer starts when you open the channel, so you can rewind only as far back as that. A paused channel keeps its tuner. Changing channel or closing the player deletes the buffer.

Freetvarr keeps the buffer on disk, in the Freetvarr Docker container's temporary folder. At typical broadcast quality, `30` minutes takes about `1–2GB` for each channel that is playing.

## Keyboard shortcuts

On a computer, the player takes these keys:

| Key                   | What it does                                                |
| --------------------- | ----------------------------------------------------------- |
| Space or `k`          | Pauses, or carries on.                                      |
| Left and right arrows | Skip back or forward `10` seconds, within the buffer.       |
| `f`                   | Enters or exits full screen.                                |
| `i`                   | Shows or hides the programme info.                          |
| `c`                   | Turns captions on or off, when the channel has them.        |
| `m`                   | Mutes or unmutes the sound. Freetvarr remembers the choice. |
| `Esc`                 | Closes the programme info, or else closes the player.       |

## Stream handling

If a channel takes longer than about `15` seconds to start, the player says it is still waiting for a signal. If a stream stops, the player says why (for example, a recording took the tuner), and **RETRY** tunes the channel again.

Freetvarr gets the channel from TVHeadend and converts it with ffmpeg into a stream that any browser can play:

- **H.264 video** is deinterlaced and re-encoded to progressive H.264. See [Video handling](#video-handling).
- **MPEG-2 or HEVC video** is re-encoded to H.264 in software, because browsers cannot play MPEG-2. Standard-definition channels stay at `576` lines; HD channels in those formats drop to `540` lines to keep the CPU load down.
- **Audio** becomes stereo, in TVHeadend's default language, without the audio-description track.

Each channel needs a tuner, unless a tuner already carries its multiplex, in which case the two share it. If every tuner is busy, the player says what is using each one. If a recording in the next hour needs the tuner, the player warns you. When the recording starts, the recording takes the tuner and the live stream stops.

Stream limits:

- **Two channels at once** by default. Set `LIVE_TV_MAX_SESSIONS` in the `.env` to change it. Viewers of the same channel share one stream.
- **The stream stops 20 seconds** after the last viewer closes the player or the tab. A locked phone or a hidden tab keeps it for the buffer length instead ([Pause and rewind](#pause-and-rewind)).
- **CPU**: a software re-encode costs far more CPU than a hardware one. See [Video handling](#video-handling).

> [!NOTE]<br>
> The Freetvarr user in TVHeadend needs the streaming right, which the [TVHeadend guide](/guide/tvheadend#_8-make-a-user-for-freetvarr) already grants. TVHeadend gives Freetvarr's stream a low priority (`weight` `50`), so a recording always takes the tuner first.

## Video handling

Many broadcasters send HD as interlaced H.264 (Australian 1080i, for example). Chrome cannot play interlaced H.264; Safari can. So Freetvarr deinterlaces H.264 and re-encodes it to progressive H.264.

At startup Freetvarr reads `LIVE_TV_TRANSCODE` and picks one method:

| Value            | Behaviour                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `auto` (default) | Hardware if a test encode passes on the VAAPI device, software otherwise                                   |
| `hardware`       | The same test and the same fallback as `auto`                                                              |
| `software`       | Always software: `yadif` and `libx264`, capped at `540` lines. Costs much more CPU                         |
| `copy`           | The old behaviour: H.264 passes through untouched. Safari plays it; Chrome cannot play interlaced channels |

Hardware means VAAPI on Intel Quick Sync or AMD, set up as in [Hardware transcoding](/guide/hardware#hardware-transcoding). The result is capped at `720` lines. The device defaults to `/dev/dri/renderD128`; set `LIVE_TV_VAAPI_DEVICE` in the `.env` to use another. NVIDIA (NVENC) is not supported, so an NVIDIA host uses software.

Freetvarr logs the choice and the reason on a line that starts with `[live] video`. To read it, run `docker compose logs freetvarr | grep "\[live\] video"` in a terminal in the `freetvarr` folder.

> [!NOTE]<br>
> The author's NAS (Synology DS220+, Intel Celeron J4025 with two cores) re-encodes `1080i` to `720p` in hardware at about `6.5x` real time, using about `5%` of one core. Software at `720p` ran at only `1.36x` real time on both cores, which is why the software path caps at `540` lines.

## Browser notes

If an HD channel fails in Chrome, see [Playback failed on HD channels](/guide/troubleshooting#playback-failed-on-hd-channels).

## The tuner's own app

The author uses the HDHomeRun app, which finds the tuner by itself. The app talks to the tuner directly and skips TVHeadend, so it competes with recordings for tuners. A USB or PCIe tuner has no app of its own, so watch it through TVHeadend with Jellyfin or Kodi instead ([TV apps](/guide/tv-apps)).

## Plex

Plex discovers an HDHomeRun the same way its own DVR feature does, and plays live channels on any client without a Plex Pass ([Plex: Live TV & DVR](https://support.plex.tv/articles/225877347-live-tv-dvr/)). You need a Plex Pass only to *record* through Plex, and TVHeadend and Freetvarr already do that for free. With a USB or PCIe tuner, watch through Jellyfin or Kodi connected to TVHeadend instead.

## Captions in other apps

Captions arrive either as Teletext or as DVB subtitles, and your broadcaster decides which. Australian broadcasters send Teletext, and not every app shows it:

- **The native HDHomeRun app is unproven.** SiliconDust documents DVB subtitle support but says nothing about Teletext, and the author has not tested it on an Australian channel.
- **Kodi, VLC, and Channels do render them.** If captions are a requirement, watch through one of those.

> [!NOTE]<br>
> The same applies to recordings. A `.ts` from TVHeadend carries the Teletext stream, so a player that decodes Teletext shows captions and one that doesn't shows nothing.

## Tuner budget

Recording and watching share your tuners. The author's Flex Quatro has four tuners, so recording three overlapping programmes leaves one tuner for live TV. In TVHeadend's web interface, **Status → Stream** shows what is using each tuner.
