# video

The sources for the Freetvarr YouTube videos: the overview, the guide series (one video for each topic), and the thumbnails. Renders, voice audio, footage frames, and music are not in the repo; the build links them from a local assets folder.

## Contents

- [Parts](#parts)
- [Prerequisites](#prerequisites)
- [Assets folder](#assets-folder)
- [Rebuild](#rebuild)
- [Demo stack and capture](#demo-stack-and-capture)
- [Mixkit sources](#mixkit-sources)
- [Lessons](#lessons)

## Parts

- [Overview video](#parts-overview-video)
- [Guide series](#parts-guide-series)
- [Thumbnails](#parts-thumbnails)
- [Planning notes](#parts-planning-notes)

### Parts: Overview video

- `build.sh`: builds `freetvarr-overview.mp4`, its captions, and `youtube.md`
- `overview/script.mjs`: the voiceover lines, one array for each scene, with the chapter names
- `eleven/build-vo.mjs` and `eleven/eleven.mjs`: turn each line into ElevenLabs speech; each clip is cached by a hash of the voice, the settings, and the text, so an unchanged line costs no credits
- `overview/build-timeline.mjs`: places each line on the timeline and writes `overview/timeline.json` and `stage/timeline.js`
- `overview/build-audio.mjs` and `overview/mix-music.py`: mix the speech over the music, duck the music under speech, and normalise to `-14 LUFS`; they also write the `.srt` captions
- `overview/build-youtube-md.mjs`: writes `youtube.md` (title, description with chapters, tags)
- `stage/`: a web page that draws any moment of the video; `stage/render.mjs` steps through it with Playwright and pipes the screenshots to ffmpeg
- `eleven/` (other scripts): the voice auditions and checks behind `ELEVENLABS-OPTIONS.md`

### Parts: Guide series

- `series/build.sh <slug>`: builds `series/<slug>/video-<slug>.mp4`, a `1280×720` preview, captions, and `youtube-<slug>.md`
- `series/<slug>/script.mjs`: the voiceover lines, timing overrides, and the YouTube title, description, and tags
- `series/<slug>/scenes.js`: the motion design for each scene
- `series/<slug>/takes.json`: picks a new ElevenLabs take for a line that read badly
- `series/tools/`: the voice, timeline, audio, and description steps, plus `check-vo.mjs` (speech-to-text and end-of-sentence pitch check), `stills.sh`, `check.sh`, `dense.sh`, and `review.sh` (contact sheets for review)
- `series/stage/`: the shared stage page; `lib.js` holds the shared parts (app window, terminal, kicker, end card)

The slugs are `leaving-fetch`, `install`, `recording`, `watching`, `library`, and `home-settings`.

### Parts: Thumbnails

- `thumbnails/frames.sh`: grabs one frame from each rendered video
- `thumbnails/build.mjs`: lays out each `1280×720` thumbnail as HTML and screenshots it into `thumbnails/out/`, plus review sheets in `thumbnails/review/`

### Parts: Planning notes

- `SERIES.md`: the series plan, scene by scene
- `ELEVENLABS-OPTIONS.md` and `VOICE-OPTIONS.md`: the voice and music choices, and why
- `youtube.md` and `series/<slug>/youtube-<slug>.md`: the published titles, descriptions, and tags (the builds rewrite them)

## Prerequisites

- Node `24` (the repo's Volta pin)
- ffmpeg and ffprobe on `PATH`
- Python 3 with `numpy` (the music mix) and `praat-parselmouth` (the pitch check only); set `FTV_VIDEO_PYTHON` to that interpreter, for example a venv's `bin/python3`
- Playwright `1.49.0` with Chromium: `assets.sh` installs both into `scripts/.cache/playwright-1.49.0` on the first build
- An ElevenLabs API key in `~/.config/elevenlabs.env` as `ELEVENLABS_API_KEY=...`, only for new or changed lines; cached lines need no key
- The assets folder (see below)

## Assets folder

`FTV_VIDEO_ASSETS` names the folder; the default is `~/code/repos/furey/freetvarr-video-assets`. The build scripts source `assets.sh`, which links these into place (each link is in `.gitignore`):

| Folder in assets  | Linked as                          | Contents                                                                     |
| ----------------- | ---------------------------------- | ---------------------------------------------------------------------------- |
| `voice/overview`  | `eleven/cache`                     | ElevenLabs clips for the overview                                            |
| `voice/series`    | `series/eleven-cache`              | ElevenLabs clips for the series                                              |
| `frames/overview` | `stage/frames`                     | App footage as JPEG frames, one folder for each clip, with `marks.json`      |
| `frames/series`   | `series/stage/frames`              | The same, for the series                                                     |
| `stack-host`      | `stack/host`                       | Show pictures (`hd/`, `img/`), channel logos, and the demo guide `xmltv.xml` |
| `music/480.mp3`   | read by the audio step             | The music track                                                              |
| `mixkit/`         | read by `stack/prep-media.sh`      | The surf clips behind Big Wave Season                                        |
| `renders/`        | `FTV_VIDEO_RENDERS` for thumbnails | The published renders and captions                                           |

`assets.sh` also links `stage/fonts` and `series/stage/fonts` to `docs/.vitepress/theme/fonts`, and the app icon from `src/web/icon-512.png`.

The frames cost the most to remake: they need the demo stack running and a full capture pass. Back up the assets folder with the rest of the machine.

## Rebuild

Stop any old stage server first. The overview uses port `3895` and the series uses `3896`; a build reuses a server that already answers on its port, even one that serves another folder.

```sh
lsof -nP -iTCP:3895 -iTCP:3896 -sTCP:LISTEN
```

Overview (`WORKERS` sets the number of parallel render workers, default `4`):

```sh
FTV_VIDEO_PYTHON=~/venvs/video/bin/python3 video/build.sh
```

One series video:

```sh
FTV_VIDEO_PYTHON=~/venvs/video/bin/python3 video/series/build.sh library
```

Stills only, at chosen seconds, with no audio and no full render:

```sh
video/series/build.sh library --stills=5,20,60
```

Thumbnails from the saved renders:

```sh
FTV_VIDEO_RENDERS=~/code/repos/furey/freetvarr-video-assets/renders video/thumbnails/build.sh
```

Without `FTV_VIDEO_RENDERS`, `frames.sh` reads the renders from `video/` itself, so build the videos first.

## Demo stack and capture

The footage comes from a demo Freetvarr against a TVHeadend container with made-up channels. Rebuild the footage only when the app's screens change.

1. Run `stack/prep-media.sh` to download the Mixkit clips and pictures and cut the channel streams.
2. Start the `lscr.io/linuxserver/tvheadend` container with `stack/clips` mounted at `/clips`.
3. Run `stack/setup-tvh.sh` to add the channels.
4. Run `node stack/make-xmltv.mjs` to write the demo guide; serve it at `MEDIA_HOST`.
5. Run `stack/run-freetvarr.sh` to start Freetvarr on port `3857` (`series/stack2/run.sh` and `series/stack3/run.sh` start ports `3859` and `3860` for the series).
6. Run the capture scripts (`capture/shots.mjs`, `capture/wizard.mjs`, `series/capture/shots.mjs`) to record raw footage.
7. Run `capture/make-frames.sh <clip>` (or `series/capture/make-frames.sh <clip>`) to turn raw footage into frames.

`FTV_DEMO_APP` names the Freetvarr checkout the stack runs; the default is this repo. `stack/PATCHES.txt` lists the demo-only patches that checkout needs (four tuners on an IPTV-only TVHeadend). The capture scripts drive Google Chrome (`channel: 'chrome'`), so Chrome must be installed.

## Mixkit sources

The music and stock footage come from Mixkit. Mixkit's free licences allow use in YouTube videos, monetised ones included, with no attribution required. The video descriptions credit them anyway.

| Asset                                     | Source                                                                 | Licence                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| "Curiosity" by Diego Nava (track `480`)   | <https://assets.mixkit.co/music/480/480.mp3>                           | [Mixkit Stock Music Free License](https://mixkit.co/license/#musicFree) |
| Surf clips `1128`, `1074`, `1127`, `1076` | `https://assets.mixkit.co/videos/<id>/<id>-1080.mp4`                   | [Mixkit Stock Video Free License](https://mixkit.co/license/#videoFree) |
| Show pictures and channel clips           | `https://assets.mixkit.co/videos/<id>/...`, ids in `stack/content.mjs` | Mixkit Stock Video Free License                                         |

A copy of the licence page is in the assets folder at `music/mixkit-licence.html`. A stock track can still draw a Content ID claim; keep the source URL to dispute one.

## Lessons

- Make every chapter at least `10 s` long. YouTube ignores the whole chapter list if one chapter is shorter.
- Keep `<` and `>` out of YouTube descriptions. YouTube rejects a description that contains either character.
- Load every image before the screenshot. `kit.js` waits on `pendingImages()`, and the series capture marks images as eager; without that, frames render with blank posters.
- Write dates so they stay true after the date passes: "the deadline is `31 October 2026`", not "you have until next week".
- After a thumbnail or share image changes, run the URL through the [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) and press Scrape Again. Facebook keeps the old image until then.
