---
title: Plex DVR instead
description: >-
  If you already have a Plex Pass, Plex's own DVR with a network tuner may be
  all you need. When it is enough, what it costs, and what TVHeadend and
  Freetvarr add.
---

# Plex DVR instead

Before you set up TVHeadend and Freetvarr, check whether you need them at all. Plex has its own recorder, Live TV & DVR. With a network tuner such as an HDHomeRun, it records free-to-air TV straight into your Plex library. If you already have a Plex Pass, that may be all you need.

The author built Freetvarr before he noticed that his own Plex Pass already covered Plex DVR.

> [!TIP]<br>
> If you already have a Plex Pass, try Plex DVR first. If you don't, compare the Plex Pass price with a free setup.

## Cost

Recording in Plex needs a Plex Pass. Watching live TV through Plex is free ([Plex FAQ](https://support.plex.tv/articles/226463767-frequently-asked-questions-dvr-live-tv/)). TVHeadend and Freetvarr are free and open source.

Plex Pass prices, from [Plex's plans page](https://www.plex.tv/en-au/plans/) in October 2026:

| Plan       | AUD       | USD         |
| ---------- | --------- | ----------- |
| Monthly    | `A$11`    | `US$6.99`   |
| Yearly     | `A$110`   | `US$69.99`  |
| Five years | `A$390`   | `US$249.99` |
| Lifetime   | `A$1,190` | `US$749.99` |

The lifetime price rose from `US$249.99` to `US$749.99` on `1 July 2026`.

Over three years, someone without a Plex Pass pays `A$330` on the yearly plan, or `A$390` for the five-year plan. The free route costs `A$0` in fees, but it takes longer to set up. Both need the same tuner and an always-on computer, because Plex Media Server needs one too.

## When Plex DVR is enough

Plex DVR suits you if most of these are true:

- You have a Plex Pass, or you would pay for one anyway.
- Plex Media Server already runs on an always-on computer that can transcode video (Plex needs that for live TV).
- You watch on Plex apps: Apple TV, a smart TV, a phone, or a games console.
- You can live without captions on live TV (see the table below).

## What Plex DVR does well

- **One app for everything.** Live TV and recordings play in every Plex app, the Apple TV app included ([Watching live TV](https://support.plex.tv/articles/115007689648-watching-live-tv/)).
- **No import step.** Recordings go straight into the Plex library you choose.
- **Flexible series rules.** Record all episodes or new ones only, limit to one channel, keep only the latest few, or delete after watching ([Setting up recordings](https://support.plex.tv/articles/226074728-setting-up-recordings/)).
- **Ad skipping without touching the file.** By default Plex marks the ad breaks and the player offers a Skip button, so a wrong detection costs nothing ([Removing commercials](https://support.plex.tv/articles/115003944134-removing-commercials/)).
- **Watching away from home**, with Plex's remote access and a Plex Pass.

## What TVHeadend and Freetvarr add

- **No subscription.** Everything is free, now and later, whatever Plex charges.
- **A recorder that is separate from Plex.** A Plex Media Server update cannot stop a TVHeadend recording. Plex forum users report missed and cut-short recordings after some server updates ([example](https://forums.plex.tv/t/dvr-fails-after-update/916861)).
- **Live TV in any browser**, on a phone or a computer, with no app to install.
- **A careful ad cut.** Detect-only mode to check accuracy first, and an `.orig` backup of every cut file. Plex's "detect and delete" mode cannot be undone.
- **Captions kept in the file.** TVHeadend keeps the Teletext captions that Australian channels send, so Kodi and VLC can show them.
- **Any tuner TVHeadend drives**, including SAT>IP and IPTV.

## Comparison

| Topic          | Plex DVR                                                                                          | TVHeadend + Freetvarr                                                  |
| -------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Cost           | Plex Pass to record (see [Cost](#cost))                                                           | Free                                                                   |
| Guide          | No built-in Australian guide; you give it an XMLTV feed, such as [i.mjh.nz](https://i.mjh.nz/au/) | The same XMLTV feed                                                    |
| Series rules   | All, new only, keep latest, delete after watching                                                 | Title and channel, skip episodes already recorded                      |
| Padding        | Minutes before and after, per show                                                                | The same, `2` and `10` minutes by default                              |
| Ad removal     | Mark and skip (default), or delete (cannot be undone); custom `comskip.ini` allowed               | Detect-only, or cut with an `.orig` backup; `comskip.ini` tuned for AU |
| Live TV        | Every Plex app                                                                                    | Any browser; the tuner's own app on the TV                             |
| Captions       | None on live TV; no Teletext support yet                                                          | Teletext kept in recordings; Kodi and VLC show it                      |
| Library        | Straight into Plex                                                                                | Imported, renamed, and refreshed in Plex                               |
| Away from home | Plex remote access, with a Plex Pass                                                              | Home network only; a VPN for away                                      |
| Setup          | One wizard in Plex                                                                                | TVHeadend (an evening) plus Freetvarr (`30–60 minutes`)                |

Sources: Plex's [Live TV & DVR](https://support.plex.tv/articles/225877347-live-tv-dvr/), [XMLTV](https://support.plex.tv/articles/using-an-xmltv-guide/), and [Watching live TV](https://support.plex.tv/articles/115007689648-watching-live-tv/) articles, and an open [Teletext request](https://forums.plex.tv/t/australian-subtitle-support/932558) on the Plex forum.

## Setup

Plex's own guide is [Live TV & DVR](https://support.plex.tv/articles/225877347-live-tv-dvr/). In short, for an Australian HDHomeRun:

1. Give the tuner a fixed IP address with a DHCP reservation in your router.
2. In Plex Web, open **Settings → Live TV & DVR** and press **DVR Setup**.
3. Pick the tuner, choose **Antenna**, and choose any country.
4. Press **Have an XMLTV program guide on your server? Click here to use that instead.**
5. Enter your region's guide, such as `https://i.mjh.nz/au/Sydney/epg.xml`, and give it a name.
6. Check the channel list, untick the channels you don't want, and continue.
7. In **DVR Settings**, set the padding (`2` minutes before and `10` after suits free-to-air) and set **Remove Commercials** to **Detect commercials and mark for skip**.
8. Open a show in the guide and press **Record**.

> [!WARNING]<br>
> Plex expects to have the tuner to itself ([Supported tuners](https://support.plex.tv/articles/225877427-supported-dvr-tuners-and-antennas/)). Don't record from Plex DVR and TVHeadend on the same tuner at the same time. To try Plex DVR, pause TVHeadend's recordings first.

If Plex DVR does the job, you need nothing else on this site. If you later want a free recorder, browser live TV, or captions in your recordings, [Hardware](/guide/hardware) and [TVHeadend](/guide/tvheadend) are the next steps.
