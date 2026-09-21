---
title: Troubleshooting
description: 'Fixes for the common snags: the TVHeadend connection, missing files, Plex, deletes, ad detection.'
---

# Troubleshooting

## TEST CONNECTION fails

- **"TVHeadend URL is not configured"**: set it in Settings. Under host networking it's `http://<host-ip>:9981`, not `http://tvheadend:9981`; neither container is on a Docker bridge network, so container names don't resolve.
- **HTTP `401` or `403`**: TVHeadend rejected the credentials. Check the username and password, and check the access entry has Admin, Streaming, and Video recorder rights ([TVHeadend](/guide/tvheadend#_8-make-a-user-for-freetvarr)). Access entries are an ordered list, so a broader entry above yours can win.
- **A connection refused or timeout**: TVHeadend isn't running, or isn't on that port. `docker compose logs tvheadend` first.

## TVHeadend finds no tuner

- The TVHeadend container has to run with `network_mode: host`. It discovers an HDHomeRun by broadcasting on the local network, and those broadcasts don't cross Docker's private bridge network.
- The tuner has to be on the same part of the network as the host; those broadcasts don't cross between subnets without extra setup.
- Check the tuner answers at all: open `http://<hdhr-ip>/tuners.html` in a browser. Nothing there means a power or ethernet problem, not a TVHeadend one. See [Hardware](/guide/hardware#checking-the-signal).

## The guide is empty or one day deep

- Without an XMLTV feed you get only what the broadcast signal carries, which is about a day of thin data. Set up the feed ([step 6](/guide/tvheadend#_6-load-the-xmltv-guide)).
- With the feed loaded but one channel blank, that channel isn't linked to a feed channel. Fix it under **Configuration → Channel/EPG → EPG Grabber Channels**.
- After installing the grabber script, restart TVHeadend. It looks for grabbers at startup only, so a running instance never sees a new one.

## A recording came in as `skipped`

The error text says which of the two causes it was:

- **"file not found" or no filename**: TVHeadend has no finished file yet. A recording in progress lands here, and post-recording padding keeps it there for up to ten minutes after the programme ends. The next sync picks it up.
- **"outside the recordings mount"**: TVHeadend reported a path freetvarr can't translate. The two paths have to line up; see [the two recordings paths](/guide/configuration#the-two-recordings-paths).

## A recording shows `partial`

- The imported file came up more than `1 MB` short of what TVHeadend reported. The next sync redoes the import. If it stays `partial`, the source itself is short: check TVHeadend's own status for that entry, which usually reports data errors from a weak signal.

## Imports are slow

- A hardlink import is instant. If you're watching a progress bar, freetvarr is copying, which means the recordings folder and the media library are on different filesystems. Put them on one filesystem and the copy becomes a link.

## Permission errors, or the TVHeadend file won't delete

- Set `PUID`/`PGID` to match the owner of the bind-mounted host folders, and use the same pair for both services. freetvarr hardlinks and deletes files TVHeadend created, so a mismatch shows up as a permission error at exactly those two steps.

## Plex token auto-detect fails

- It needs Plex's `Preferences.xml` bind-mounted into the container (`PLEX_PREFS_PATH`), which only works when Plex runs on the same host.
- Paste the token manually instead; grab it from `app.plex.tv` (or Plex's own support article on finding your token). See [Plex](/guide/plex).

## Other containers can't reach freetvarr by name

- A side-effect of host networking: freetvarr isn't on any Docker bridge network. Reach it via the host's LAN IP and `FREETVARR_PORT` instead.

## Ad detection is cutting the wrong things (or missing breaks)

- Ad detection is educated guessing, never perfect. Comskip's accuracy on Australian free-to-air varies a lot by channel (logo detection, silence thresholds, and break lengths all differ).
- Run the show in `DETECT` mode first and check the break counts and minutes it reports on the Recordings tab before switching to `CUT`. Scans work the CPU hard: budget ~30 minutes per 75-minute recording on a home NAS.
- Cuts land on the nearest keyframe, so a second or two either side of a break is normal.
- To tune detection, place your own `comskip.ini` in the `/config` bind mount; it overrides the bundled Australian-tuned default. Every cut keeps a `<file>.ts.orig` backup for the retention window, so if a cut goes wrong you can rename the `.orig` back to recover it. See [Ad removal](/guide/ad-removal).

## Captions are missing

- Australian broadcasters send captions as Teletext. Some players decode it and some don't; it isn't a recording fault. See [Live TV](/guide/live-tv#captions).

## Timestamps show the wrong time

- Set `TZ` in your `.env` to your IANA timezone; the UI shows every timestamp in the container's zone, whatever device you're browsing from.
