# Freetvarr guide videos

## Contents

- [Playlist plan](#playlist-plan)
- [Voice and visual rules](#voice-and-visual-rules)
- [Save your Fetch recordings](#save-your-fetch-recordings)
- [Install and setup](#install-and-setup)
- [TV guide and recording](#tv-guide-and-recording)
- [Watching](#watching)
- [Recordings library](#recordings-library)
- [Home and Settings](#home-and-settings)
- [Owner checks](#owner-checks)

## Playlist plan

- [Playlist details](#playlist-plan-playlist-details)
- [Order and length](#playlist-plan-order-and-length)
- [Replacing a video](#playlist-plan-replacing-a-video)

### Playlist plan: Playlist details

**Title**: Freetvarr: record free-to-air TV after Fetch

**Description**:

Leaving Fetch TV? These short videos show how to keep recording free-to-air TV and watch it on your TV, with hardware you own. Start with the overview, then save your Fetch recordings before you cancel. Each video after that covers one part of Freetvarr: install and setup, recording from the TV guide, watching, your recordings library, and Home and Settings. Freetvarr is free, open-source software that works with TVHeadend and a TVHeadend-compatible tuner (e.g. an HDHomeRun), on a computer that stays on, such as a NAS or a mini PC. Full guide: <https://furey.github.io/freetvarr/>

### Playlist plan: Order and length

The order puts the deadline first, then follows the path a new user takes: install, record, watch on the TV. The library, Plex, and Settings come last because most viewers need them later.

| #   | Video                                                                                        | Folder          | Target      | Estimate          | Status                |
| --- | -------------------------------------------------------------------------------------------- | --------------- | ----------- | ----------------- | --------------------- |
| 1   | Leaving Fetch TV? Record free-to-air TV with Freetvarr                                       | `overview`      | `~3.5 min`  | `3:32` (rendered) | Scripted and rendered |
| 2   | [Save your Fetch TV recordings before you cancel, with fetchtv](#save-your-fetch-recordings) | `leaving-fetch` | `2.5–3 min` | `~3:05`           | Draft below           |
| 3   | [Install Freetvarr and run setup on a NAS or mini PC](#install-and-setup)                    | `install`       | `2.5–3 min` | `~2:55`           | Draft below           |
| 4   | [Record free-to-air TV from the Freetvarr TV guide](#tv-guide-and-recording)                 | `recording`     | `2.5–3 min` | `~3:00`           | Draft below           |
| 5   | [Watch recordings and live TV on your TV with Freetvarr](#watching)                          | `watching`      | `2.5–3 min` | `~2:45`           | Draft below           |
| 6   | [Freetvarr recordings library, with Plex, Sonarr, and Radarr](#recordings-library)           | `library`       | `2.5–3 min` | `~2:55`           | Draft below           |
| 7   | [Freetvarr Home, For you, Activity, Health, and Settings](#home-and-settings)                | `home-settings` | `2.5–3 min` | `~2:40`           | Draft below           |

The estimates use the overview's pace: `477` words of voiceover in `3:32`, about `136` words a minute with the visual pauses. Each folder sits beside `overview/` under `video/` and holds its own `script.mjs` with the same `SCENES` shape (`id`, `chapter`, `lines`). The scene ids below are the `id` values.

### Playlist plan: Replacing a video

YouTube cannot replace the file of a published video, so a change means a new upload. The scripts make each video a rebuild, not an edit:

1. Edit the `lines` in that video's `script.mjs`.
2. Run the same build steps as the overview: `build-audio.mjs`, `build-timeline.mjs`, the render, then `build-youtube-md.mjs` for the new chapters.
3. Upload the new render to YouTube with the title, description, tags, and `.srt` captions from `youtube.md`.
4. In the playlist, add the new video at the same position, then remove the old one.
5. Set the old video to Unlisted, so old links still play, and add a card that points to the new one.
6. Upload the render to the `docs-media` release under the same file name with `gh release upload docs-media <file> --clobber`. The docs link to `https://github.com/furey/freetvarr/releases/download/docs-media/<file>`, and that address does not change.

Link the docs and the README to the playlist, not to single video ids, so a swap needs no docs change.

## Voice and visual rules

- [Pronunciation](#voice-and-visual-rules-pronunciation)
- [Visuals](#voice-and-visual-rules-visuals)

### Voice and visual rules: Pronunciation

The voice is `en-au-andrew:DragonHDOmniLatestNeural`, as in the overview. Add an SSML `<sub alias>` for each of these:

| Written   | Spoken       | Caption   |
| --------- | ------------ | --------- |
| Freetvarr | Free TV R    | Freetvarr |
| TVHeadend | T V Head End | TVHeadend |
| NAS       | naz          | NAS       |
| fetchtv   | fetch T V    | fetchtv   |
| HDHomeRun | H D Home Run | HDHomeRun |
| Node.js   | Node J S     | Node.js   |
| SSH       | S S H        | SSH       |
| Sonarr    | Sonar        | Sonarr    |
| Radarr    | Radar        | Radarr    |

The voiceover lines write `fetch T V` and `Node J S` as spoken, the same way the overview writes `fetch T V tool`; `CAPTION_TEXT` turns them back into `fetchtv` and `Node.js`. Numbers that the voice must say a set way (dates, prices) are written as words. The voiceover never reads a command aloud; the command shows on screen and in the description.

### Voice and visual rules: Visuals

- Use the dark 2.0 style of the app: motion graphics, plus screen footage from the demo server.
- Use only the demo channels (Coastline 3, Harbour 5, Southern 6, Nightline 8, Ridgeline 10, Bayside 11, Greenhouse 12, Courtside 13) and the demo shows (Big Wave Season, Kitchen Heat, Wild Neighbours, Mountain Rangers, Road Trip Rules, The Weekend Garden, Tide Watch, Brew Day, Reef Diaries, City After Dark, Backyard Rescue, and the film Lighthouse at Dusk).
- Never show a real channel name, a real show title, or a real organisation logo. Fetch, Plex, Infuse, Jellyfin, Kodi, Node.js, Sonarr, and Radarr appear as plain text only, never as a logo or a real app screen.
- Where a step happens outside Freetvarr (a terminal, a file manager, a website), use a plain mock-up in the same dark style.
- The kicker is the large on-screen text for the scene, `2–6` words.

## Save your Fetch recordings

**Title**: Save your Fetch TV recordings before you cancel, with fetchtv

**Purpose**: Copy every recording off a Fetch box with `fetchtv`, put it in the media library, then cancel Fetch.

The Fetch facts come from the Leaving Fetch guide, which quotes Fetch's levy FAQ as of `30 October 2026`.

### Save your Fetch recordings: Scenes

**1. Intro** (`open`)

- Voiceover:
  1. Before you leave Fetch, copy your recordings off the box.
  2. The free fetch T V tool copies them over your home network, with no Fetch account needed.
- Visual: A generic set-top box (no logo) with recording tiles (Kitchen Heat, Tide Watch, Reef Diaries) that fly along a network line to a laptop.
- Kicker: Save your Fetch recordings

**2. The deadline** (`deadline`)

- Voiceover:
  1. As of the thirtieth of October 2026, Fetch asks for a one-off levy to keep a Gen 3 box working.
  2. The deadline to opt in is the thirty-first of October.
  3. Do nothing, and Fetch suspends the box in November. Then you cannot copy your recordings.
  4. A cancelled box stops working completely. So save first, then cancel.
- Visual: A date card, "As of 30 October 2026", then a timeline: `31 Oct` opt-in deadline, `November` box suspended. The recording tiles fade out at the suspend mark.
- Kicker: Save before 31 October

**3. What you need** (`need`)

- Voiceover:
  1. You need a Windows PC or a Mac, on the same network as the box.
  2. Allow fifteen minutes to set up, then a few hours of copying.
  3. First, install Node J S, the free software that runs the tool. Run the LTS installer from its website.
- Visual: A laptop next to the box on one network line. A text card: `nodejs.org` → LTS installer (no logo).
- Kicker: Install Node.js first

**4. Find the box** (`find`)

- Voiceover:
  1. Open a terminal, a window where you type commands. On a Mac, open Terminal. On Windows, open Command Prompt.
  2. Type the command on screen, and press Enter. If it asks to install fetch T V, type y.
  3. The tool lists each Fetch box it finds, with its IP address.
  4. No box found? Look up its address in your router's list of connected devices.
- Visual: Terminal mock-up. Typed: `npx fetchtv`. Output: one box at `192.168.1.50`, with the address highlighted.
- Kicker: npx fetchtv

**5. List your recordings** (`list`)

- Voiceover:
  1. Next, list your recordings with the shows command.
  2. Check that the computer has enough free space. Each hour of HD takes about three to six gigabytes.
- Visual: Terminal: `npx fetchtv shows --ip=192.168.1.50`. Output lists Kitchen Heat, Wild Neighbours, Tide Watch, and Lighthouse at Dusk. A disk-space bar fills beside it.
- Kicker: 3–6 GB per HD hour

**6. Copy everything** (`copy`)

- Voiceover:
  1. Then copy everything with the recordings command, the for Plex option, and a save folder.
  2. The for Plex option names each file the way your media library expects: a folder for each show and season.
  3. If the copy stops, run the same command again. It skips the files it already copied, and carries on.
- Visual: Terminal: `npx fetchtv recordings --ip=192.168.1.50 --for-plex --save=./fetch-recordings`, with a progress line. A `.part` file renames to `.ts` when it completes. Then the folder tree: `fetch-recordings/Kitchen Heat/Season 03/Kitchen Heat - S03E08.ts`.
- Kicker: Add --for-plex

**7. Into your library** (`library`)

- Voiceover:
  1. Once Freetvarr is set up, open the NAS shared folder from your computer.
  2. Drag each show's folder into the tv folder, inside Freetvarr's media folder.
  3. A film goes into movies, if you set a movies folder. Anything else, such as a news bulletin, goes into one-offs.
  4. Your media library finds them on its next scan.
- Visual: File manager mock-up. Drag `fetch-recordings/Kitchen Heat` into `media/tv`, then `Lighthouse at Dusk` into `media/movies`. A three-row card: series → `tv`; film → `movies` or `one-offs`; anything else → `one-offs`.
- Kicker: tv, movies, one-offs

**8. Cancel Fetch** (`cancel`)

- Voiceover:
  1. Move the aerial cable to your new tuner, and check every channel you watch.
  2. Then sign in to Fetch account management.
  3. Under Packages, choose Cancel Service, then Yes, cancel my service.
  4. Do it on or before the thirty-first of October. It cancels every box on the account.
  5. If your internet provider supplied your Fetch box, cancel through the provider instead.
  6. Not ready in time? Opt in to the levy by the thirty-first. It keeps the box going until at least June 2028.
- Visual: A plain sign-in mock-up (no Fetch branding) with the note "Username: your email address, in lower case", then a menu card: Packages → Cancel Service → Yes, cancel my service. The aerial cable moves from the box to a generic network tuner.
- Kicker: Packages, Cancel Service

**9. More help** (`end`)

- Voiceover:
  1. The Leaving Fetch guide has every step. The link is in the description.
- Visual: End card with the docs address and the next video.
- Kicker: Leaving Fetch guide

### Save your Fetch recordings: YouTube description

Save your Fetch TV recordings before you cancel. The free fetchtv tool copies them off a Fetch box over your home network, names each file the way your media library expects, and does not need your Fetch account.

Facts about the levy come from Fetch's levy FAQ as of 30 October 2026. Check the Leaving Fetch guide for changes.

Commands (replace the address with your box's address):

```text
npx fetchtv
npx fetchtv shows --ip=192.168.1.50
npx fetchtv recordings --ip=192.168.1.50 --for-plex --save=./fetch-recordings
```

If the copy stops, run the last command again; it skips the files it already copied. With hundreds of recordings, expect to run it several times. To copy one show only, add --show= and part of its name. Fetch's episode numbers can differ by one from the TV guide's, so compare air dates where a show has Fetch and Freetvarr recordings from the same weeks.

Chapters:
{{chapters}}

Links:

- Leaving Fetch TV guide: <https://furey.github.io/freetvarr/guide/leaving-fetch>
- fetchtv: <https://github.com/furey/fetchtv>
- Node.js download: <https://nodejs.org/en/download>
- Freetvarr: <https://furey.github.io/freetvarr/>

The channels, shows, and pictures in this video are made up for the demo. Voice: Azure neural text to speech.

### Save your Fetch recordings: Tags

Fetch TV, Fetch levy, leaving Fetch, cancel Fetch, Fetch recordings, Fetch Mighty, Fetch Mini, save Fetch recordings, fetchtv, free-to-air TV, Plex, NAS, Freetvarr

## Install and setup

**Title**: Install Freetvarr and run setup on a NAS or mini PC

**Purpose**: Install Freetvarr with the one-line script, then walk through each step of setup.

### Install and setup: Scenes

**1. Intro** (`open`)

- Voiceover:
  1. Freetvarr installs with one command. Then setup does the rest in a browser.
  2. You check what it finds at each step, and press Next.
- Visual: Title card, then the setup screen in a browser frame.
- Kicker: Install and setup

**2. Before you start** (`need`)

- Voiceover:
  1. You need a TVHeadend-compatible tuner, such as an HDHomeRun, connected to your aerial and your router.
  2. You also need a computer that stays on, such as a NAS or a mini PC, with Docker.
  3. Docker is free software that runs apps such as TVHeadend and Freetvarr.
  4. The install includes TVHeadend, and setup sets it up for you.
- Visual: Diagram: aerial → tuner → NAS (TVHeadend and Freetvarr) → home network → TV, phone, laptop.
- Kicker: Tuner, computer, Docker

**3. One command** (`install`)

- Voiceover:
  1. On a NAS, sign in over SSH first. SSH lets you type commands on the NAS from your computer.
  2. In the terminal, paste the install command from the description, and press Enter.
  3. It makes a freetvarr folder, and asks who should own the files.
  4. Press Enter to accept the defaults. Most people do.
  5. The first start downloads the software, which takes a few minutes.
  6. Then it shows the address of setup. Open that address in a browser.
- Visual: The `install-demo.mp4` terminal recording, from the `curl` command to the setup address on port `3733`.
- Kicker: One command

**4. Start** (`start`)

- Voiceover:
  1. Setup opens on your first visit. Confirm your time zone, then press Start setup.
- Visual: `wizard-demo.mp4`, the Start step, with the time zone and the Start setup button.
- Kicker: Start setup

**5. Secure TVHeadend** (`tvheadend`)

- Voiceover:
  1. Next, TVHeadend. Choose an admin username and password, and check the allowed networks.
  2. Press Secure and connect. Freetvarr saves the login in TVHeadend, and connects to it.
  3. Already run your own TVHeadend? Press Use my own TVHeadend login instead.
- Visual: The TVHeadend step (`screenshot-wizard-secure.png` or the wizard footage), with the eye button that shows the password.
- Kicker: Lock it with a password

**6. Find channels** (`channels`)

- Voiceover:
  1. Then channels. Check the tuners, and the transmitter your aerial points at.
  2. Press Find channels. The scan takes a few minutes. Press Next when it finishes.
  3. If setup finds no tuner, press Enter the tuner's address, and type its IP address.
- Visual: The Channels step and the scan, ending on a list of the demo channels (Coastline 3 to Courtside 13).
- Kicker: Find channels

**7. TV guide** (`guide`)

- Voiceover:
  1. Now the TV guide. Check your region, and press Set up guide.
  2. For a channel with no listings, setup picks its best guess. Check each one, then press Save and next.
  3. In Australia and New Zealand, this gives you a free seven-day guide.
- Visual: The Guide step, with the region and the channel-to-listings matches for the demo channels.
- Kicker: Free 7-day guide

**8. Folders** (`folders`)

- Voiceover:
  1. Folders come next. Freetvarr checks the recordings folder, and the TV folder of your media library.
  2. If the checks pass, press Next. If one fails, do what its message says.
- Visual: The Folders step with passing checks.
- Kicker: Check the folders

**9. Plex, if you use it** (`plex`)

- Voiceover:
  1. Plex is optional. If Freetvarr connects to Plex, check the TV library, and press Next.
  2. If Plex has no library for your recordings yet, press Create libraries first.
  3. No Plex? Press Skip Plex. Freetvarr still files every recording into your media library.
- Visual: The Plex step, then the Skip Plex button. Text only for Plex, no logo.
- Kicker: Plex is optional

**10. You're set** (`done`)

- Voiceover:
  1. You're set lists what setup saved. Press Start watching to open Home.
  2. To change any part later, open Settings, then System, then Setup.
  3. Next in this playlist: recording from the TV guide.
- Visual: The You're set list, then Home on the demo server.
- Kicker: You're set

### Install and setup: YouTube description

Install Freetvarr with one command, then let setup connect TVHeadend, scan for channels, set up the TV guide, check your folders, and connect Plex if you use it.

You need a TVHeadend-compatible tuner (e.g. an HDHomeRun) and a computer that stays on and runs Docker, such as a NAS or a mini PC. The install includes TVHeadend.

Install command (run it in the folder where you want a freetvarr folder):

```text
curl -fsSL https://raw.githubusercontent.com/furey/freetvarr/main/install.sh | sh
```

Then open `http://<host-ip>:3733` in a browser.

On a NAS with no SSH access, use the NAS container app instead; the getting started guide has the steps.

Chapters:
{{chapters}}

Links:

- Getting started: <https://furey.github.io/freetvarr/guide/getting-started>
- Hardware: <https://furey.github.io/freetvarr/guide/hardware>
- Leaving Fetch TV guide: <https://furey.github.io/freetvarr/guide/leaving-fetch>
- Source code: <https://github.com/furey/freetvarr>

The channels, shows, and pictures in this video are made up for the demo. Voice: Azure neural text to speech.

### Install and setup: Tags

Freetvarr, install Freetvarr, TVHeadend, HDHomeRun, Docker, NAS, Synology, mini PC, home server, self-hosted, free-to-air TV, PVR, DVR, leaving Fetch

## TV guide and recording

**Title**: Record free-to-air TV from the Freetvarr TV guide

**Purpose**: Find a programme in the TV guide, record one episode or the whole series, and see what records next.

### TV guide and recording: Scenes

**1. Intro** (`open`)

- Voiceover:
  1. Recording in Freetvarr works like the record button on the Fetch remote.
  2. Find a show in the TV guide, press it, and press Record.
- Visual: The TV guide on a laptop and a phone, side by side.
- Kicker: Record from the guide

**2. The TV guide** (`guide`)

- Voiceover:
  1. The TV guide shows seven days. Channels run down the page, and time runs across.
  2. The day chips switch days. Now and Tonight jump to that time.
  3. Press the star next to a channel to make it a favourite. Favourites sit at the top.
- Visual: Guide grid footage with the demo channels: day chips, Tonight, Images on, then a star on Bayside 11.
- Kicker: Seven days ahead

**3. The programme sheet** (`sheet`)

- Voiceover:
  1. Press a programme to open its sheet. It shows the picture, the episode, the time, and what it is about.
  2. On a phone, the sheet slides up from the bottom.
- Visual: Press Kitchen Heat on Harbour 5; the sheet opens.
- Kicker: Press a programme

**4. Record one episode** (`record`)

- Voiceover:
  1. To record one airing, leave This episode picked, and press Record.
  2. A dot on the guide marks it as scheduled.
  3. About a minute after it finishes, Freetvarr files it into your library.
- Visual: `record-demo.mp4`, This episode then Record, and the dot on the cell.
- Kicker: This episode, Record

**5. Start early, finish late** (`padding`)

- Voiceover:
  1. Free-to-air shows often run late. So each recording starts two minutes early, and finishes ten minutes late.
  2. To change that, set Start early and Finish late before you press Record.
- Visual: Close-up of the Start early and Finish late controls in the sheet, at `2m` and `10m`.
- Kicker: 2 min early, 10 late

**6. Record the series** (`series`)

- Voiceover:
  1. To record every episode, pick Every episode, and press Record series.
  2. Keep sets how many episodes to keep. TVHeadend removes the oldest by itself.
  3. If the show moves to another channel, turn on Any channel.
  4. When the guide has episode numbers, each episode records only once.
- Visual: Every episode on Wild Neighbours, Keep and Any channel, then Record series. The next airings get dots.
- Kicker: Every episode

**7. Change or cancel** (`cancel`)

- Voiceover:
  1. To change your mind, press the programme again, and press Cancel recording.
  2. For a series, Skip this episode skips one airing. Cancel series stops the whole series.
- Visual: The sheet of a scheduled programme with Cancel recording, then a series episode with Skip this episode and Cancel series.
- Kicker: Cancel any time

**8. Watchlist** (`watchlist`)

- Voiceover:
  1. Waiting for a show that is not on yet? Search for it.
  2. When nothing in the guide matches, press Add to watchlist.
  3. Turn on Record when it appears, and Freetvarr records the series as soon as it is in the guide.
  4. The watchlist in Scheduled shows when it next airs.
- Visual: Search for "Road Trip Rules" with no guide match, then Add to watchlist with the Record when it appears switch on.
- Kicker: Add to watchlist

**9. Scheduled** (`scheduled`)

- Voiceover:
  1. To see what will record, open Recordings, then Scheduled.
  2. It lists what records now, today, tomorrow, and later this week.
  3. Turn off a row's switch to skip that episode. The series keeps recording the rest.
  4. On a wide screen, a timeline shows each tuner. It warns when more shows record at once than you have tuners.
- Visual: Recordings → Scheduled with the week strip and the tuner timeline. One row switched off shows `Skipped`.
- Kicker: What records next

**10. Ad removal, if you want it** (`ads`)

- Voiceover:
  1. You can also have the ad breaks taken out of your recordings. It is off until you turn it on.
  2. Turn it on in Settings, under Recording, then Ad removal.
  3. Set a show to Detect first, which only finds the breaks. Check them, then switch the show to Cut.
  4. Freetvarr keeps the original for seven days, in case a cut goes wrong.
- Visual: Settings → Recording → Ad removal, then a series with Ad removal set to Detect, then Cut. A timeline graphic of an episode with the breaks lifted out.
- Kicker: Detect first, then Cut

**11. Next** (`end`)

- Voiceover:
  1. Next in this playlist: watching your recordings and live TV.
- Visual: End card with the docs address and the next video.
- Kicker: Up next: watching

### TV guide and recording: YouTube description

Record free-to-air TV from Freetvarr's 7-day TV guide: one episode or the whole series, with padding for shows that run late. Add a show to your watchlist before it airs, check what records next in Scheduled, and, if you want, have the ad breaks taken out.

Chapters:
{{chapters}}

Links:

- TV guide: <https://furey.github.io/freetvarr/guide/tv-guide>
- Series rules and folders: <https://furey.github.io/freetvarr/guide/series>
- Scheduled: <https://furey.github.io/freetvarr/guide/recordings#scheduled>
- Ad removal: <https://furey.github.io/freetvarr/guide/ad-removal>
- Freetvarr: <https://furey.github.io/freetvarr/>

The channels, shows, and pictures in this video are made up for the demo. Voice: Azure neural text to speech.

### TV guide and recording: Tags

Freetvarr, TV guide, record TV, series recording, free-to-air TV, PVR, DVR, TV recorder Australia, TVHeadend, ad removal, comskip, watchlist, leaving Fetch

## Watching

**Title**: Watch recordings and live TV on your TV with Freetvarr

**Purpose**: Watch recordings on the TV with a media player app, live TV on the TV with a TV app, and both in the browser.

### Watching: Scenes

**1. Intro** (`open`)

- Voiceover:
  1. Your recordings are ordinary video files in your media library.
  2. So the media player app on your TV can play them.
- Visual: A recording tile drops into a folder, and the folder appears on a TV screen.
- Kicker: Watch on the TV

**2. Recordings on the TV** (`tv`)

- Voiceover:
  1. On the TV, open a media player app that reads your library, such as Plex or Infuse.
  2. Each show has its own folder, and each file name has the season and episode.
  3. So your app shows the right title and artwork, with pause, rewind, and skip.
- Visual: A generic media app mock-up on a TV (no real app screen or logo) with posters for Big Wave Season, Kitchen Heat, and Mountain Rangers.
- Kicker: Pause, rewind, skip

**3. Live TV on the TV** (`tv-apps`)

- Voiceover:
  1. For live TV on the TV, with the seven-day guide, use a TV app such as Jellyfin or Kodi.
  2. In Freetvarr, open Settings, then Watching, then Watch on TV. Press Make a TV login.
  3. That login can only watch. It cannot record, or change settings.
  4. Freetvarr then shows each address to copy into the TV app.
  5. Kodi also shows Australian captions, which most other apps do not.
- Visual: Settings → Watching → Watch on TV on the demo server: the TV login, then the address rows with Copy buttons.
- Kicker: Watch on TV

**4. Live TV in the browser** (`live`)

- Voiceover:
  1. On a phone, tablet, or computer, open Live TV in Freetvarr, and press a channel.
  2. It plays right in the browser, with no app to install.
  3. Each row shows what is on now, and what is on next.
- Visual: The Live TV page with the demo channels; press Coastline 3 and the player opens on Big Wave Season.
- Kicker: No app to install

**5. Pause and rewind** (`rewind`)

- Voiceover:
  1. You can pause and rewind live TV, up to thirty minutes back.
  2. Start over plays the programme from its first minute, when TVHeadend is recording it.
  3. Go live takes you back to now.
  4. Double-tap the left or right side of the picture to skip ten seconds.
  5. For captions, open the three-dot menu, and press Captions.
- Visual: Player footage: Pause, drag the position bar back, Start over → From the start, then Go live with the `2 min behind` text.
- Kicker: Pause live TV

**6. Miniplayer** (`mini`)

- Voiceover:
  1. Press Miniplayer to shrink the picture, and keep browsing while you watch.
  2. On a phone, it sits above the tab bar. On a computer, it is a small card in a corner.
- Visual: The player shrinks to a corner card while the TV guide scrolls behind it; then the phone bar.
- Kicker: Keep watching

**7. Multiview** (`multiview`)

- Voiceover:
  1. Multiview plays up to four live channels at once, or two on a phone.
  2. Press Multiview, then pick another channel. Each channel says if it needs a free tuner.
  3. Recordings always come first. If a recording needs a tuner, it takes one from live TV.
- Visual: Multiview sheet with `Uses a free tuner` and `No extra tuner` tags, then a grid of Courtside 13, Coastline 3, Nightline 8, and Ridgeline 10.
- Kicker: Up to four channels

**8. Recordings in the browser** (`playback`)

- Voiceover:
  1. Recordings play in the same player, and it remembers where you stopped.
  2. In Safari, AirPlay sends an episode to an Apple TV.
  3. When ad removal found the breaks, a Skip ad button appears during each one.
- Visual: An episode of Tide Watch resumes; the position bar shows ad break marks, and Skip ad appears at the bottom right.
- Kicker: Same player

**9. Save it as an app** (`home-screen`)

- Voiceover:
  1. On a phone or tablet, add Freetvarr to the Home Screen.
  2. It then opens full screen from its own icon, like an app.
  3. Next in this playlist: your recordings library.
- Visual: `home-screen-demo.mp4`, then the end card.
- Kicker: Add to Home Screen

### Watching: YouTube description

Watch your Freetvarr recordings on the TV in a media player app that reads your library (e.g. Plex or Infuse), with pause, rewind, and skip. For live TV with the 7-day guide on the TV, Freetvarr makes a watch-only TVHeadend login and shows the addresses to copy into a TV app (e.g. Jellyfin or Kodi). On a phone, tablet, or computer, Freetvarr plays live TV and recordings in the browser, with pause and rewind, the Miniplayer, and Multiview.

Chapters:
{{chapters}}

Links:

- Live TV: <https://furey.github.io/freetvarr/guide/live-tv>
- Player and Multiview: <https://furey.github.io/freetvarr/guide/player>
- TV apps: <https://furey.github.io/freetvarr/guide/tv-apps>
- Freetvarr: <https://furey.github.io/freetvarr/>

The channels, shows, and pictures in this video are made up for the demo. Voice: Azure neural text to speech.

### Watching: Tags

Freetvarr, watch recordings on TV, live TV, free-to-air TV, media player, Plex, Infuse, Jellyfin, Kodi, TVHeadend, Multiview, pause live TV, captions, leaving Fetch

## Recordings library

**Title**: Freetvarr recordings library, with Plex, Sonarr, and Radarr

**Purpose**: Find your way around the library and show pages, change or delete recordings, and see what Plex, Sonarr, and Radarr add.

### Recordings library: Scenes

**1. Intro** (`open`)

- Voiceover:
  1. Every recording goes into your media library, in a folder for each show and season.
  2. Freetvarr renames each file with the season and episode, so media players can match it.
- Visual: Folder tree: `media/tv/Kitchen Heat/Season 03/Kitchen Heat - S03E08.ts`.
- Kicker: Filed for you

**2. The library** (`library`)

- Voiceover:
  1. Open Recordings, then Library. Each show has a poster, on a shelf.
  2. Shows, movies, and specials and one-offs each have their own shelf.
  3. A number badge counts the episodes you have not started. A REC badge means one records now.
- Visual: Recordings → Library on the demo server: Shows, Movies (Lighthouse at Dusk), and Specials and one-offs.
- Kicker: Shows, movies, one-offs

**3. Show pages** (`show`)

- Voiceover:
  1. Press a poster to open the show page.
  2. Play, or Resume, starts the next episode you have not watched.
  3. The status line says what records next, and on which channel.
  4. Each episode has a row, with a bar for how much you watched.
- Visual: The Kitchen Heat show page: Resume, the status line `Next: Tue 8:30pm on Harbour 5`, season chips, and episode rows with `New` badges.
- Kicker: Every episode, ready

**4. Episode menus** (`menu`)

- Voiceover:
  1. Press the three dots on a row, or hold the row on a touch screen, for the episode menu.
  2. Mark an episode as watched, see where its file is, or delete it.
- Visual: The episode menu on a Kitchen Heat episode: Mark as watched, Episode info, Delete episode.
- Kicker: Hold for more

**5. Recording options** (`options`)

- Voiceover:
  1. Recording options changes the series recording of that show.
  2. Pick the channels, how many episodes to keep, and how early to start and late to finish.
  3. Pause recording stops new episodes. Episodes already recorded still go into your library.
  4. Each change saves by itself.
- Visual: The Recording options panel: Channels, Keep the latest, Start early, Finish late, Remove ads, Pause recording.
- Kicker: Change one show

**6. Delete** (`delete`)

- Voiceover:
  1. Delete removes the episode from your library, and its recording from TVHeadend.
  2. Before anything changes, a dialog lists what gets deleted, and what stays.
  3. You cannot undo a delete. But the series keeps recording new episodes.
  4. TVHeadend keeps a note of the episode, so it does not record it again.
- Visual: The delete dialog with What gets deleted (size shown) and What stays.
- Kicker: Check, then delete

**7. Plex** (`plex`)

- Voiceover:
  1. If you use Plex, Freetvarr asks it to scan after each new recording, so episodes show up straight away.
  2. Watched marks and resume points stay the same in both.
  3. Watch an episode in Plex, and Freetvarr shows it as watched too.
- Visual: Motion graphic: a new episode tile goes to the library, and a generic "media server" box refreshes (text only for Plex). Then a watched tick appears on both sides.
- Kicker: Plex kept up to date

**8. Your whole Plex library** (`whole-library`)

- Voiceover:
  1. Recordings can also list everything else in your Plex TV and movie libraries.
  2. Shows you copied in yourself sit on the same show pages, and play in Freetvarr.
  3. Freetvarr does not import, rename, or move those files.
  4. To turn this off, open Settings, then Recording, then Plex.
- Visual: A show page that mixes recorded episodes with older copied-in episodes of Reef Diaries.
- Kicker: Everything in one place

**9. Sonarr and Radarr** (`arr`)

- Voiceover:
  1. Sonarr and Radarr are apps that download shows and films. If yours save to the same library, connect them.
  2. Open Settings, then Recording, then Sonarr and Radarr, and press Find Sonarr and Radarr.
  3. A delete in Freetvarr then goes through them, so the file does not download again.
  4. When an episode has two copies, the delete dialog asks which to delete.
- Visual: Settings → Recording → Sonarr and Radarr with Find Sonarr and Radarr and `Connected` results; then the delete dialog with Both, Recording, and Sonarr copy.
- Kicker: Deleted stays deleted

**10. Next** (`end`)

- Voiceover:
  1. Next in this playlist: Home, suggestions, and Settings.
- Visual: End card with the docs address and the next video.
- Kicker: Up next: Home

### Recordings library: YouTube description

Freetvarr files every recording into your media library, in a folder for each show and season. This video covers the Recordings library, show pages, episode menus, Recording options, and deleting episodes, and what changes when you connect Plex (scans after each recording, watched state both ways, your whole library) or Sonarr and Radarr (deletes that do not download again).

Chapters:
{{chapters}}

Links:

- Recordings: <https://furey.github.io/freetvarr/guide/recordings>
- Plex: <https://furey.github.io/freetvarr/guide/plex>
- Sonarr and Radarr: <https://furey.github.io/freetvarr/guide/sonarr-radarr>
- Freetvarr: <https://furey.github.io/freetvarr/>

The channels, shows, and pictures in this video are made up for the demo. Voice: Azure neural text to speech.

### Recordings library: Tags

Freetvarr, recordings library, media library, Plex, Plex watched sync, Sonarr, Radarr, TVHeadend, free-to-air TV, PVR, DVR, home server, self-hosted

## Home and Settings

**Title**: Freetvarr Home, For you, Activity, Health, and Settings

**Purpose**: Show what Home and For you offer each day, and where Activity, Health, and Settings live.

### Home and Settings: Scenes

**1. Intro** (`open`)

- Voiceover:
  1. Freetvarr has five places: Home, Live TV, TV guide, Recordings, and Settings.
  2. On a phone, they sit in the tab bar at the bottom. On a computer, they run down the left side.
- Visual: The phone tab bar and the computer rail, with each destination lit in turn.
- Kicker: Five places

**2. Home** (`home`)

- Voiceover:
  1. Home answers one question: what can I watch now?
  2. The slides at the top show things such as the episode to carry on with, and what records now.
  3. Below them are rows of new recordings, suggestions, what is on now, and what records tonight.
  4. On now shows only your favourite channels. Star a few channels to fill it.
  5. Press and hold any card for more choices.
- Visual: Home on the demo server (`Good evening`), the highlight slides, then the rows. A press and hold on a card opens its menu.
- Kicker: What to watch now

**3. Search** (`search`)

- Voiceover:
  1. Search finds a show in your recordings, and in the next seven days of the guide.
  2. It also finds a show by its initials, and offers a close spelling when nothing matches.
- Visual: Type `kh` and Kitchen Heat appears with `Initials KH`; then a misspelling shows `Did you mean`.
- Kicker: Find any show

**4. For you** (`for-you`)

- Voiceover:
  1. For you suggests programmes from the next week of the guide.
  2. Freetvarr works them out on your own computer, from what you record and watch.
  3. Your viewing history never leaves that computer.
  4. Suggestions start once it knows about five of your shows.
  5. Press the three dots on a card for More like this, Fewer like this, or Why this.
  6. To turn For you off, or pause your history, open Settings, then For you.
- Visual: The For you page with Coming up this week for you and Top rated movies this week; a card menu with Why this? open.
- Kicker: Made on your computer

**5. Activity** (`activity`)

- Voiceover:
  1. A sync is one check of TVHeadend for finished recordings. Freetvarr files any new ones into your library.
  2. Settings, then System, then Activity, shows what the server does now, with progress for each job.
  3. The Syncs tab lists every sync. Press Sync now to check at once.
- Visual: Activity → Now with a running import, then the Syncs tab with day headings and Sync now.
- Kicker: What runs now

**6. Health** (`health`)

- Voiceover:
  1. Health checks everything Freetvarr depends on, and says what to fix.
  2. It runs by itself every three hours.
  3. When something breaks, a dot appears on the Settings icon. A red problem also shows on Home.
  4. Press it to open Health, and read the fix.
- Visual: Health with `Everything's working`, then a mocked warning dot on the Settings icon and the alert under the Home greeting.
- Kicker: Says what to fix

**7. Settings** (`settings`)

- Voiceover:
  1. Settings groups its pages under About, Watching, Recording, and System.
  2. Search settings finds any page or setting by name.
  3. System diagram shows each part of the setup, from the aerial to the TV.
  4. To redo one part of setup, such as the channel scan, open System, then Setup.
- Visual: The Settings list, a search for `plex`, the System diagram, then Settings → System → Setup.
- Kicker: Find any setting

**8. More help** (`end`)

- Voiceover:
  1. The Freetvarr guide has the detail for every page. The link is in the description.
- Visual: End card with the docs address and the playlist.
- Kicker: The Freetvarr guide

### Home and Settings: YouTube description

A tour of the pages you use every day in Freetvarr: Home, with what to watch now; Search, which finds shows by title or initials; For you, with suggestions worked out on your own computer; and Settings, where Activity shows what the server does now and Health says what to fix.

Chapters:
{{chapters}}

Links:

- Home and search: <https://furey.github.io/freetvarr/guide/home>
- For you: <https://furey.github.io/freetvarr/guide/for-you>
- Activity: <https://furey.github.io/freetvarr/guide/syncs>
- Health: <https://furey.github.io/freetvarr/guide/doctor>
- Settings: <https://furey.github.io/freetvarr/guide/settings>
- Freetvarr: <https://furey.github.io/freetvarr/>

The channels, shows, and pictures in this video are made up for the demo. Voice: Azure neural text to speech.

### Home and Settings: Tags

Freetvarr, TV suggestions, For you, home server, self-hosted, TVHeadend, free-to-air TV, PVR, DVR, health check, leaving Fetch

## Owner checks

- Owner check: today is `30 October 2026` and the opt-in deadline is `31 October 2026`; if the Leaving Fetch video goes up after that, re-render its `deadline` and `cancel` scenes with the facts current on that day.
- Owner check: the `fetchtv` terminal scenes need a real box or a mock-up; confirm which, and that every listed show is a demo title.
- Owner check: confirm the existing docs media (`install-demo.mp4`, `wizard-demo.mp4`, `record-demo.mp4`, `home-screen-demo.mp4`, and the screenshots) show only demo channels and shows before reuse.
- Owner check: the Channels and Guide steps of setup need a demo TVHeadend with the demo channels; confirm the capture setup can show them.
- Owner check: confirm that a generic media app mock-up is right for the TV scenes, instead of a real Plex or Infuse screen.
- Owner check: pick the `docs-media` file names for the renders (e.g. `video-leaving-fetch.mp4`) and add them to `scripts/docs-media.txt`.
