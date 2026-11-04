# capture-demo-beginframe

These scripts record the homepage demo in the docs browser frame: `docs/public/demo.mp4` (2x), `demo-1x.mp4`, and `demo-poster.jpg`. With `TOUR=hero`, they record a separate short tour into `docs/img/hero.webp`, the animated image at the top of the repository README. The storyboard is Home, On now, Live TV (images off and on, then a channel plays), the TV guide (zoom, record a film, record a series), Recordings, a show page, For you, and back to Home. The hero tour is Home, a scroll to On now, Live TV, the TV guide, Big Wave Season opened from the guide and played live, then back to Home. In both tours the last frame matches the first, so the video loops with no join.

Chrome renders each frame on demand (`HeadlessExperimental.beginFrame`) with virtual time, so the video plays at a steady `60 fps` however slow the machine is. The on-screen clock stays pinned, the live stream follows virtual time, and the cursor is a macOS arrow or pointing hand on straight eased paths.

## Requirements

- Docker, with the `mcr.microsoft.com/playwright:v1.60.0-jammy` image (it supplies `chrome-headless-shell`)
- Host `node`, `ffmpeg`, and `curl`
- A TVHeadend to read the TV guide from (read-only)
- `gh`, signed in, to upload the result

## Run

1. Start the capture server with the curated library, and leave it running:

   ```bash
   TVH_UPSTREAM=http://192.168.1.50:9981 TVH_CREDENTIALS_FILE=tvh-credentials.txt \
     ./scripts/capture-demo-beginframe/start-server.sh
   ```

2. In a second terminal, record and encode the demo:

   ```bash
   ./scripts/capture-demo-beginframe/capture.sh
   ```

3. Record the README hero:

   ```bash
   TOUR=hero ./scripts/capture-demo-beginframe/capture.sh
   ```

4. Watch `docs/public/demo.mp4` and `docs/img/hero.webp` before you publish them.

`capture.sh` ends by running `scripts/upload-docs-media.sh`, which replaces the `docs-media` release assets and starts a docs deploy. Set `DOCS_MEDIA_UPLOAD=0` to keep the files local.

To remake only `hero.webp` from a hero master you already have, run the same `ffmpeg` command that `capture.sh` runs:

```bash
ffmpeg -y -i scripts/.cache/hero/hero.mp4 -vf "fps=12,scale=800:-1:flags=lanczos" \
  -c:v libwebp_anim -quality 45 -compression_level 6 -loop 0 -an docs/img/hero.webp
```

## Settings

| Variable                   | Default                  | Effect                                                     |
| -------------------------- | ------------------------ | ---------------------------------------------------------- |
| `DEMO_SHOWS`, `DEMO_FILMS` | in `start-server.sh`     | Titles the library can hold, in order, joined by `\|`      |
| `HERO_SHOWCASE`            | in `capture.sh`          | Home hero slides, in order                                 |
| `HIDDEN_TITLES`            | in `capture.sh`          | Guide titles the demo never shows                          |
| `FILM_TITLE`               | `Die Hard`               | Film recorded from the TV guide                            |
| `SERIES_TITLE`             | `NCIS`                   | Series set to record every episode                         |
| `SHOW_TITLE`               | `Home and Away`          | Show page opened from Recordings                           |
| `CAPTURE_PORT`             | `3801`                   | Port of the capture server                                 |
| `TOUR`                     | `demo`                   | `demo` for the docs demo, `hero` for `hero.webp`           |
| `HERO_FPS`, `HERO_QUALITY` | `12`, `45`               | Frame rate and WebP quality of `hero.webp`                 |
| `EXTRA_HIDDEN_TITLES`      | none                     | More titles to hide outside the guide grid, joined by `\|` |
| `LIVE_TUNING_MS`           | `1500`, `900` for `hero` | Time the live channel takes to tune                        |

The film, series, and show must air in the guide that night. The seed keeps a curated title only when its poster and backdrop both load, and fails when fewer than six shows or six films pass.

The Live TV favourites show what airs at the simulated time, and that time moves on in real time while the server runs. For the hero tour, start the server with `SIMULATED_NOW` (for example `2026-11-04T20:06:00+11:00`) at a time when every favourite's programme has art, and record soon after the server is ready. To hide a programme that still shows a title card, add it to `EXTRA_HIDDEN_TITLES`.

## Outputs

- `docs/public/demo.mp4`, `demo-1x.mp4`, and `demo-poster.jpg`
- `docs/img/hero.webp` (`TOUR=hero`): `12 fps`, `800` pixels wide, from its `60 fps` master `scripts/.cache/hero/hero.mp4`
- `scripts/.cache/frames/demo-beginframe/` (or `hero-beginframe/`): the JPEG frames, plus `log.json` (cursor, hover, and video state per frame), `checks.json` (tiles per row), and `art-issues.json` (images that failed to show)
