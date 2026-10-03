---
title: What Freetvarr is
description: >-
  Freetvarr is a self-hosted TVHeadend companion: watch live TV in the browser,
  and file recordings into Plex, named and foldered, on your LAN.
---

# What Freetvarr is

> [!TIP]<br>
> Already have a Plex Pass? You may not need Freetvarr. Plex's own DVR records free-to-air TV from a network tuner straight into your library, and that is a fine choice. See [Plex DVR instead](/guide/plex-dvr) for when it is enough and what it costs if you don't have a Plex Pass.

TVHeadend records free-to-air TV into its recordings folder. By default it names each file after the programme title only, for example `The Block.ts`. Plex's TV library matches a file to an episode only when the name has a season and episode number (`S01E02`) or an air date. Freetvarr watches TVHeadend on your LAN, picks up new episodes of the shows you follow, files them into your Plex TV library as `Show/Season 01/Show - S01E02.ts` (or by air date when the guide has no episode number), and asks Plex to scan. Once Plex confirms the file, it can remove the recording from TVHeadend.

It is also a TV app for your home network: the [Live TV](/guide/live-tv) tab plays any channel in the browser, on a phone or a desktop.

If your media stack is tuner → TVHeadend → Plex, Freetvarr is the automation in between: schedule a series from its built-in TV Guide, and the episodes turn up in Plex named and foldered. Any tuner TVHeadend can drive counts: a network tuner such as an HDHomeRun, a USB DVB stick, a PCIe card, SAT>IP, or IPTV. [Hardware](/guide/hardware) covers the choice.

![The Freetvarr dashboard](../img/screenshot-dashboard.png)

## Where it works

Everywhere TVHeadend works. Freetvarr talks only to TVHeadend's HTTP API and the recordings folder, so the broadcast standard is TVHeadend's problem: DVB-T/T2 (Australia, New Zealand, UK, Europe), DVB-C and DVB-S, ATSC (United States and Canada), ISDB-T. The tuner model, the guide source, and the mux scan list differ by country, and all of them are TVHeadend settings.

> [!NOTE]<br>
> These pages use Australian values in their examples (`TZ=Australia/Sydney`, the `au-Sydney` mux list, a Sydney XMLTV feed, a `comskip.ini` tuned for Australian channels) because that is where the author lives. Each one is an example. Substitute your own region's values as you go; [Hardware](/guide/hardware) and [TVHeadend](/guide/tvheadend) say what to pick instead.

## What Freetvarr isn't

- **Not an indexer integration** (Sonarr / Radarr / Prowlarr). Freetvarr works with the recordings TVHeadend has made, and its [TV Guide](/guide/tv-guide) schedules what TVHeadend records next. It doesn't search the internet for content.
- **Not a tuner.** TVHeadend drives the tuner, scans the muxes, and writes the files. Freetvarr talks to TVHeadend's HTTP API; it never touches the hardware. See [TVHeadend](/guide/tvheadend).
- **Not authenticated.** There's no login, so it's built for a home network you trust. The usual web hardening is in place (CSRF protection, rate limiting, a strict content-security policy), but anyone who can reach the page can change its settings, so don't expose it to the internet. See the [security model](/deep-dive#security-model).
- **Not a converter.** Files arrive from TVHeadend as `.ts` (the raw broadcast format) and stay `.ts`; Freetvarr never re-encodes them. The optional ad removal drops the ad sections without re-encoding, so there's no quality loss. If you want `.mkv`, run the files through Tdarr or similar afterwards.
- **Not a notifier.** No Discord / ntfy / push integration.

> [!IMPORTANT]<br>
> Tested against TVHeadend `4.3` fed by an HDHomeRun Flex Quatro, with Plex Media Server. Other tuners and TVHeadend versions are unverified.

## Background

The author first wrote [Fetcharr](https://github.com/furey/fetcharr), which copied recordings off a Fetch TV box into Plex. When Fetch announced its Gen 3 levy, he bought an HDHomeRun tuner, set up TVHeadend, and swapped Fetcharr's pieces one at a time until the new setup worked. That became Freetvarr. Only after all that did he notice that his own Plex Pass already covered Plex DVR, which records from the same tuner with no extra software; [Plex DVR instead](/guide/plex-dvr) compares the two. For people without a Plex Pass, Freetvarr is one option, but the hardware still costs a few hundred dollars. [Leaving Fetch TV](/guide/leaving-fetch) compares that cost with a new Fetch box.

## Where next

- **[Hardware](/guide/hardware)**: what to buy, and how it wires into the aerial you already have.
- **[TVHeadend](/guide/tvheadend)**: the recorder itself, from Docker container to scanned channels and a working guide.
- **[Getting started](/guide/getting-started)**: run Freetvarr with Docker and walk the first-run wizard.
- **[TV Guide](/guide/tv-guide)**: browse 7 days of programmes and schedule recordings from the browser.
- **[Following shows](/guide/following-shows)**: mark shows to follow and point them at library folders.
- **[Recordings](/guide/recordings)** and **[Syncs](/guide/syncs)**: watch imports happen and read the status of each one.
- **[Ad removal](/guide/ad-removal)**: the optional comskip detect/cut pass.
- **[Plex](/guide/plex)**, **[Remove from TVHeadend](/guide/remove-from-tvheadend)**, and **[Live TV](/guide/live-tv)**: the optional extras.
- **[Leaving Fetch TV](/guide/leaving-fetch)**: save your recordings, buy a tuner, and cancel before the levy. Former Fetcharr users also read **[From Fetcharr](/guide/from-fetcharr)**.
- **[Configuration](/guide/configuration)** and **[Troubleshooting](/guide/troubleshooting)**: the deploy knobs and the fixes for common snags.

It works on a phone, too.

<div class="freetvarr-mobile-shots">

![Dashboard on a phone](../img/screenshot-mobile-dashboard.png)
![The TV Guide on a phone](../img/screenshot-mobile-guide.png)
![Live TV on a phone](../img/screenshot-mobile-live.png)

</div>

<style>
.freetvarr-mobile-shots {
  margin-top: 1.5rem;
}
.freetvarr-mobile-shots p {
  display: flex;
  gap: 12px;
  margin: 0;
}
.freetvarr-mobile-shots img {
  flex: 1 1 0;
  min-width: 0;
  width: 100%;
  border-radius: 10px;
  border: 1px solid var(--vp-c-divider);
}
</style>
