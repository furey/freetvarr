---
title: Leaving Fetch TV
description: >-
  A step-by-step guide for Fetch TV customers who want to own their
  free-to-air setup before the Gen 3 Extended Service Levy: save your
  recordings, buy a tuner, and cancel.
image: /social/leaving-fetch.png
imageAlt: 'Leaving Fetch TV? Own your free-to-air setup before the levy.'
---

# Leaving Fetch TV

Fetch TV is an Australian set-top box service. If you have a Fetch Mini Gen 3 or Mighty Gen 3, Fetch now charges a one-off levy to keep it working until October 2027, and it removes some apps whatever you pay. The steps below replace the box with hardware you own. Free-to-air TV is free to receive, so after the one-off purchase there is nothing more to pay.

You do not need to be technical for the first path. The second path needs some comfort with a computer, or a friend who has it.

## What the Fetch box did

Each job a Fetch box does has a replacement:

| Job                 | Fetch box                          | Replacement                                                                     |
| ------------------- | ---------------------------------- | ------------------------------------------------------------------------------- |
| Live free-to-air TV | Fetch's guide and remote           | A network tuner and its free app (Path 1), or Freetvarr in any browser (Path 2) |
| Recording           | Mighty only, through Fetch's cloud | TVHeadend on an always-on computer (Path 2)                                     |
| 7-day guide         | Fetch's cloud                      | A free guide feed for your city, loaded into TVHeadend (Path 2)                 |
| Streaming apps      | Netflix, Stan, Disney+, and others | The apps on your smart TV, or a streaming stick ([FAQ](#streaming-apps))        |

Fetch's paid channel packs and streamed international channels have no free replacement. See [Channel packs](#channel-packs).

## The deadline

The facts below come from Fetch's [Extended Service Levy](https://news.fetchtv.com.au/extended-service-levy-1) page and [levy FAQ](https://main.fetchtv.com.au/gen-3-extended-service-levy), as of October 2026:

- **Who pays**: households with a Mini Gen 3 (`H626T`) or Mighty Gen 3 (`M616T`) and no active Fetch subscription (Fetch Access, Multiroom, Movie Box, or a channel pack). Apps billed through Fetch, such as Netflix, do not count.
- **How much**: `$29.99` once per household, however many Gen 3 boxes you have.
- **When**: Fetch charges the card on file on `1 November 2026` unless you cancel by `31 October 2026`.
- **What it buys**: service to `31 October 2027`. Fetch says it will "endeavour" to support Gen 3 boxes after that, with no promise.
- **If you do not pay**: Fetch suspends the account. A suspended Mighty loses "making or viewing recordings".
- **If you cancel**: Fetch says a cancelled box "cannot be reactivated in the future by you or anyone else".
- **Apps**: Fetch removes some apps from Gen 3 boxes whether you pay or not. [CyberShack reports](https://cybershack.com.au/consumer-advice/fetch-tv-gen-3/) that the Mini loses Netflix, Paramount+, SBS On Demand, and Hayu, and the Mighty loses Paramount+.

Fetch's own alternative is a new box, which needs Fetch Access at `$4.99` a month.

> [!WARNING]<br>
> Save your recordings first. Once the box is cancelled or suspended, you cannot play or copy them. [Saving your Fetch recordings](#saving-your-fetch-recordings) takes an afternoon; do it before you cancel and before `1 November 2026`.

## Two paths

Both paths start with the same network tuner: a small box that takes your aerial lead and sends live TV over your home network. Pick the path that fits you. You can start with Path 1 and add Path 2 later with the same tuner.

|                  | Path 1: Watch only                  | Path 2: Watch and record                                                               |
| ---------------- | ----------------------------------- | -------------------------------------------------------------------------------------- |
| Cost             | about `A$280–400` once              | about `A$600–1,400` once, or the tuner alone if you already own an always-on computer  |
| What you get     | Live TV on phones, tablets, and TVs | Live TV in any browser, a 7-day guide, recordings, a Plex library, optional ad removal |
| Your time        | about `30 minutes`                  | `1–2` evenings                                                                         |
| Needs a computer | No                                  | Yes, one that stays on: a NAS or a mini PC                                             |

### Path 1: Watch only

Buy a network tuner, plug the aerial lead and an ethernet lead into it, and install the HDHomeRun app on your phone, tablet, or TV. The app finds the tuner by itself and shows every free-to-air channel with a short guide. [SiliconDust lists the app](https://www.silicondust.com/hdhomerun/) for iPhone and iPad, Android, Apple TV, Google TV and Android TV, Fire TV, Roku, Xbox, Windows, macOS, and Linux. It is free.

SiliconDust also sells a [DVR service](https://info.hdhomerun.com/info/dvr) that covers Australia. Series recording and the longer guide cost `US$35` a year, and the DVR needs a storage device to record to. Path 2 records for free instead.

### Path 2: Watch and record

This is the author's setup. The tuner feeds TVHeadend, a free recorder that runs on an always-on computer at home. Freetvarr runs next to it and gives you:

- [Live TV](/guide/live-tv) in the browser on any phone, tablet, or computer in the house, with no app to install.
- A 7-day [TV Guide](/guide/tv-guide), where you record one programme or a whole series.
- [Recordings](/guide/recordings) filed into a [Plex](/guide/plex) library, so you watch them on the Plex app on your TV. Plex is optional.
- Optional [ad removal](/guide/ad-removal) from recordings.

The always-on computer is a NAS (a small storage box with hard drives) or a mini PC. Setup uses Docker and a few typed commands; each guide below walks through them.

## Shopping list

<!-- affiliate disclosure goes here once links carry tags -->

Prices are in Australian dollars, as of October 2026, and change often. Check the model number before you buy.

### Path 1 shopping

| Item                                              | Why                                                                                                      | Price                                                                                | Where to buy                                                                                                                                                                                                |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HDHomeRun Flex Quatro (`HDFX-4DT`)                | The tuner. Four tuners, so four channels at once                                                         | `US$199.99` direct (about `A$280–330` with GST), `A$370–400` from Australian sellers | [SiliconDust](https://shop.silicondust.com/shop/product/hdfx-4dt/), [Standard Computers](https://www.standard.com.au/silicondust-hd-homerun-quatro-flex-tv-tuner-hdfx-4dt-au-aussie-version/product-detail) |
| HDHomeRun Flex Quatro, refurbished (`HDFX-4DT-R`) | The same tuner, cheaper, `90 day` warranty, stock comes and goes                                         | `US$174.99` direct                                                                   | [SiliconDust](https://shop.silicondust.com/shop/product/dvb-t-t2-c-hdhomerun-flex-quatro-hdfx-4dt-r/)                                                                                                       |
| F-to-PAL adapter                                  | Australian aerial leads have a PAL plug; the tuner has an F socket. Often in the box with an AU/NZ order | `A$4–6`                                                                              | [Jaycar `PA3672`](https://www.jaycar.com.au/f-59-plug-to-pal-tv-socket/p/PA3672)                                                                                                                            |
| 5-port network switch                             | Only if your router has no free ethernet port                                                            | `A$24–29`                                                                            | [Umart `TL-SG105`](https://www.umart.com.au/product/tp-link-5-port-steel-gigabit-switch-tl-sg105-25339)                                                                                                     |

Buy only a `DT` model. Anything with `US` in the model number, any Flex Duo, and anything branded 4K is an American-standard tuner and receives no Australian channels. Most HDHomeRun listings on Amazon AU and eBay AU are these. When you order from SiliconDust, ask for the AU/NZ power adapter in the order notes. Shipping from the US takes about a week, so order early.

### Path 2 shopping

Everything in Path 1, plus an always-on computer and somewhere to store recordings:

| Item                                     | Why                                                                                                                     | Price                  | Where to buy                                                                                                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Synology DS225+ NAS                      | Runs TVHeadend, Freetvarr, and Plex, and holds the recordings. Its Intel graphics re-encode live TV with almost no load | `A$549–620`, no drives | [Amazon AU](https://www.amazon.com.au/Synology-DiskStation-DS225-Diskless-Celeron/dp/B0FC2888KF), [Umart](https://www.umart.com.au/brand/synology-271)                            |
| NAS hard drive, 4 TB                     | Room for about `650–1,300` hours of HD                                                                                  | `A$330–360`            | [Scorptec, Seagate IronWolf](https://www.scorptec.com.au/brand/seagate)                                                                                                           |
| NAS hard drive, 8 TB                     | Twice that                                                                                                              | `A$590–640`            | [Scorptec, Seagate IronWolf](https://www.scorptec.com.au/brand/seagate)                                                                                                           |
| Or: a mini PC with an Intel N150 or N100 | Cheaper than a NAS. Runs Linux and Docker; the Intel graphics re-encode live TV                                         | about `A$290–370`      | [Amazon AU, Beelink EQ14](https://www.amazon.com.au/Beelink-3-6GHz-Computer-Supports-Display/dp/B0G1M7C1V9), [Amazon AU, GMKtec G3 Plus](https://www.amazon.com.au/dp/B0FKYPD8JR) |
| Or, with a mini PC: a USB tuner          | Cheaper than a network tuner, but it works only plugged into the Linux computer that runs TVHeadend, not a NAS          | `A$100–190`            | [PB Tech, Hauppauge WinTV-dualHD](https://www.pbtech.com/au/product/TVNHGR1590/Hauppauge-WinTV-dualHD-Dual-Tuner-DVB-TT2C-Digital)                                                |

An hour of HD free-to-air takes about `3–6 GB` on disk, and SD about half that. Plex is free for watching your own library at home; see [Plex's plans](https://www.plex.tv/en-au/plans/) for what its paid tier adds.

> [!NOTE]<br>
> The author's own hardware: an HDHomeRun Flex Quatro bought direct from SiliconDust (`A$281.56` with GST, September 2026), a Synology DS220+ NAS that was already at home, and a TP-Link `TL-SG105` switch. The DS220+ is no longer sold; the DS225+ above is the current model with a similar Intel chip. Any always-on computer that runs Docker works, and [Hardware](/guide/hardware) has the details.

## Saving your Fetch recordings

The [`fetchtv`](https://github.com/furey/fetchtv) tool copies recordings off a Fetch box over your home network. It needs no Fetch account. It runs on a Windows PC or a Mac on the same network as the box. Allow `15 minutes` to set it up, then a few hours of copying, depending on how much you have.

1. Install Node.js. Download the LTS installer from [nodejs.org](https://nodejs.org/en/download) and run it.
2. Open a terminal: **Terminal** on a Mac, or **PowerShell** on Windows.
3. Find the box. Type `npx fetchtv` and press Enter. Say yes if it asks to install. It searches your network and prints each Fetch box it finds, with its IP address (four numbers such as `192.168.1.50`).
4. If it finds nothing, look up the box's IP address in your router's list of connected devices, or in the network details of the Fetch box's settings menu.
5. List your recordings: `npx fetchtv shows --ip=192.168.1.50`, with your box's address in place of the example.
6. Make sure the computer has room. Each hour of HD takes about `3–6 GB`.
7. Copy everything: `npx fetchtv recordings --ip=192.168.1.50 --save=./fetch-recordings`.

The recordings land in a `fetch-recordings` folder inside the folder the terminal opened in (your home folder, usually), with a folder for each show. The copy shows a progress bar. If it stops, run the same command again: it skips the files it already copied.

To copy one show only, add `--show=` and part of its name: `npx fetchtv recordings --ip=192.168.1.50 --show=MasterChef --save=./fetch-recordings`. If you will use Plex, add `--for-plex` to name the files the way Plex expects. The [`fetchtv` README](https://github.com/furey/fetchtv#usage) lists every option.

The files play in VLC, and Plex reads them. On Path 2, copy them into your Plex TV folder.

## Setting up

Do these in order. The times are for someone doing it the first time.

1. **[Save your Fetch recordings](#saving-your-fetch-recordings)**. `15 minutes`, plus a few hours of copying.
2. **Order the tuner** ([Shopping list](#shopping-list)). `10 minutes`, then about a week for delivery.
3. **Wire the tuner** ([Hardware](/guide/hardware)). Move the aerial lead from the Fetch box to the tuner, through the adapter, and plug the tuner into your router. `15 minutes`.
4. **Path 1 stops here**: install the HDHomeRun app and watch. `10 minutes`.
5. **Set up the NAS or mini PC**, with Docker installed (Container Manager on a Synology). `1–2 hours`.
6. **Set up [TVHeadend](/guide/tvheadend)**: channels, guide, and recording folder. One evening, `2–3 hours`.
7. **Set up Freetvarr** ([Getting started](/guide/getting-started)). `30–60 minutes`.
8. **Connect [Plex](/guide/plex)** if you use it. `30 minutes`.
9. **Watch [Live TV](/guide/live-tv)** in the browser to check it all works. `5 minutes`.

## Switching over

1. Move the aerial lead from the Fetch box to the tuner. If a power injector for a masthead amplifier sits between the wall and the box, keep it in the chain and plug the tuner into its TV port.
2. Watch and record for a week. Check that every channel you care about works.
3. Cancel the Fetch service in the self-service portal on the Fetch website, on or before `31 October 2026`.
4. Remove your card from the Fetch account, so nothing more can be charged.
5. Unplug the Fetch box.

If you want the Fetch box running during the test week, a two-way TV splitter feeds both from one aerial lead. Each side gets less signal, so skip it if your reception is already weak.

If the new setup is not working by the deadline, paying the `$29.99` keeps the Fetch box going for another year while you finish.

## FAQ

### Streaming apps

Netflix, Stan, Disney+, ABC iview, SBS On Demand, and the rest run on most smart TVs. On an older TV, a streaming stick plugged into a spare HDMI port adds them: a Google TV Streamer, a Fire TV Stick, or an Apple TV. Nothing in this guide replaces them, and nothing needs to.

### Channel packs

Fetch's paid channel packs and its streamed international channels are Fetch content. A tuner receives only free-to-air broadcasts, so those channels are gone when you leave. Some of the same content is on the streaming services.

### A NAS

You need one only for Path 2. Path 1 needs no computer at all. For Path 2, any always-on computer that runs Docker works: a NAS, a mini PC, or an old PC with Linux. A NAS is the tidiest choice because it holds the recordings too.

### Watching away from home

Freetvarr works only on your home network and has no login, so never open it to the internet. To watch away from home, connect your phone to your home network with a VPN such as [Tailscale](https://tailscale.com) or WireGuard; Freetvarr then works as if you were at home.

### Captions

Freetvarr's browser player has no captions yet. Australian channels send captions as Teletext, which the HDHomeRun app may not show: SiliconDust does not say it supports Teletext. Kodi and VLC show them. If you need captions, watch through one of those; see [Captions](/guide/live-tv#captions).

### Your aerial

If the Fetch box gets a clear picture now, the tuner will too: it uses the same aerial lead. After setup, the tuner's status page shows signal strength for each channel; [Checking the signal](/guide/hardware#checking-the-signal) explains how to read it.

### Former Fetcharr users

See [From Fetcharr](/guide/from-fetcharr) for what carries over.
