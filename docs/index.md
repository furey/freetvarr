---
layout: home

hero:
  name: >-
    <span class="hero-brand"><span class="ftv-wordmark" role="img" aria-label="Freetvarr"><span class="ftv-wordmark-free" aria-hidden="true">Free</span><span class="ftv-wordmark-tv" aria-hidden="true">tv</span><span class="ftv-wordmark-arr" aria-hidden="true">arr</span></span></span>
  text: >-
    <span class="hero-line-1"><em class="hero-em">Live TV</em> on your devices.</span><span class="hero-line-2"><em class="hero-em">Recordings</em> in your media library, <em class="hero-em">ad&nbsp;free.<span style="font-size:0.8em;position:relative;line-height:0;top:-0.2em;left:-0.2em;">*</span></em></span>
  tagline: >-
    Self-hosted TV for any tuner that <a href="https://tvheadend.org/">TVHeadend</a> (free
    recorder software that drives the tuner) can use. Watch live,
    browse the TV guide, and record straight into your media library.<br><span
    style="font-size:0.575em;color:var(--vp-c-text-3)">*optional via
    Comskip</span>
  image:
    src: /logo.svg
    alt: Freetvarr
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: What it is
      link: /guide/
    - theme: alt
      text: Technical deep dive
      link: /deep-dive

features:
  - title: Live TV
    illustration: live-tv
    details: >-
      Watch any channel in the browser, on a phone or a desktop. Pause, rewind,
      start a show over while it records, or watch up to four channels with Multiview.
    link: /guide/player
    linkText: The player
  - title: Free to run
    illustration: free-to-run
    details: >-
      A tuner you own and a free <a href="https://xmltv.org/">XMLTV</a> guide (a TV guide file format). No subscription, no levy, no
      vendor who can retire your recorder.
    link: /guide/hardware-requirements
    linkText: What to buy
  - title: TV guide
    illustration: tv-guide
    details: >-
      A 7-day programme guide in the browser: schedule, cancel, and
      series-record in TVHeadend, see which tuner records what, or watch for a
      show that is not in the guide yet.
    link: /guide/tv-guide
    linkText: Browse and record
  - title: Series folders
    illustration: series-folders
    details: >-
      Record a series from the TV guide, match it to a folder in your media
      library, set a season template, and Freetvarr imports new episodes on your
      schedule.
    link: /guide/series
    linkText: Set it up
  - title: Hardlink imports
    illustration: hardlink-imports
    details: >-
      Recordings are already on disk. When the recordings and the library share
      one Docker mount, the import is a hardlink: instant, and no second copy
      of a 3GB transport stream (the <code>.ts</code> file TVHeadend records).
    link: /deep-dive#import-state-machine
    linkText: The state machine
  - title: Plex integration
    illustration: plex-integration
    details: >-
      Refreshes your <a href="https://www.plex.tv/">Plex</a> library after each sync that imports something, and
      keeps watched marks and resume points the same in Plex and Freetvarr.
    link: /guide/plex
    linkText: Set up Plex
  - title: Optional ad removal
    illustration: ad-removal
    details: >-
      Comskip commercial detection with a detect-only audit mode and
      keyframe stream-copy cutting (cuts at keyframes without re-encoding the video), keeping an .orig backup of
      every cut.
    link: /deep-dive#ad-removal
    linkText: How it works
  - title: Removes that work
    illustration: removes-that-work
    details: >-
      With <strong>Remove from TVHeadend after import</strong> on for a series, Freetvarr deletes
      the file through TVHeadend's DVR API after the import (and the Plex
      refresh, if you use Plex), and keeps the entry so TVHeadend's duplicate
      check still sees the episode.
    link: /guide/remove-from-tvheadend
    linkText: The rules
  - title: Authless LAN service
    illustration: authless-lan
    details: >-
      Backed by <a href="https://www.sqlite.org/">SQLite</a> in a single <a href="https://www.docker.com/">Docker</a> container, with no external runtime
      dependencies. Built for a trusted home network, with rate limiting and
      browser-side protections (details in the security model).
    link: /deep-dive#security-model
    linkText: The security model
---

Already have a Plex Pass? Plex's own DVR may be all you need. See [Plex DVR instead](/guide/plex-dvr).
