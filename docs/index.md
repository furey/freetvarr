---
layout: home

hero:
  name: Freetvarr
  text: >-
    Free-to-air TV in&nbsp;Plex, ad&nbsp;free.<span style="font-size:0.8em;position:relative;line-height:0;top:-0.2em;left:-0.2em;">*</span>
  tagline: >-
    A self-hosted bridge between TVHeadend and Plex. An HDHomeRun records
    free-to-air; Freetvarr picks up new episodes of the shows you follow,
    optionally removes the ads, files them into your Plex TV
    library, and pokes Plex to scan.<br><span
    style="font-size:0.575em;color:var(--vp-c-text-3)">*optional via
    <code>comskip</code></span>
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
  - title: Free to run
    details: >-
      A tuner you own and a free XMLTV guide. No subscription, no levy, no
      vendor who can retire your recorder.
    link: /guide/hardware
    linkText: What to buy
  - title: TV Guide
    details: >-
      A 7-day programme guide in the browser: schedule, cancel, and
      series-record in TVHeadend, with pinned favourite channels.
    link: /guide/tv-guide
    linkText: Browse and record
  - title: Per-show follow
    details: >-
      Pick a show TVHeadend records, match it to a folder under your media root,
      set a season template, and Freetvarr imports new episodes on your schedule.
    link: /guide/following-shows
    linkText: Set it up
  - title: Hardlink imports
    details: >-
      Recordings are already on disk, so the import is a hardlink, not a
      download: instant, and no second copy of a 3 GB transport stream.
    link: /deep-dive#import-state-machine
    linkText: The state machine
  - title: Plex integration
    details: >-
      Refreshes the library section after any sync that imported something, with
      a Refresh Plex now button when you want it sooner.
    link: /guide/plex
    linkText: Set up Plex
  - title: Optional ad removal
    details: >-
      <code>comskip</code> commercial detection with a detect-only audit mode and
      keyframe stream-copy cutting (no transcode), keeping an .orig backup of
      every cut.
    link: /deep-dive#ad-removal
    linkText: How it works
  - title: Deletes that work
    details: >-
      One call to TVHeadend's DVR API removes the entry and the file, once Plex
      has confirmed its copy. No cloud, no handshake, no retry loop.
    link: /guide/delete-from-tvheadend
    linkText: The rules
  - title: Authless LAN service
    details: >-
      SQLite-backed, single Docker container, no external runtime dependencies.
      CSRF, rate limiting, and a strict CSP, built for a trusted home network.
    link: /deep-dive#security-model
    linkText: The security model
---
