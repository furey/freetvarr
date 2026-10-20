---
title: Home and search
description: >-
  Home shows what to watch now: highlights, new recordings, For you, what is on
  your favourite channels, and tonight's recordings. Search finds shows by
  title, nickname, initials, or a close spelling.
---

# Home and search

Home is the first page Freetvarr opens. It answers one question: what can I watch now? Its title greets you for the time of day, such as `Good evening`.

<!-- markdownlint-disable MD033 -->
<BrowserFrame label="http://freetvarr.lan/#/home">
  <img src="../img/screenshot-dashboard.png" alt="Home" width="2560" height="1872" loading="lazy">
</BrowserFrame>
<!-- markdownlint-enable MD033 -->

## Navigation

Freetvarr has five destinations: **Home**, **Live TV**, **Guide**, **Recordings**, and **Settings**. On a phone, a tab bar at the bottom holds them. On a tablet or computer, a rail down the left side holds them, with Settings at the bottom. The rail also has **For you** under Recordings, unless you turn For you off in Settings.

Each page has these controls in its header:

- **Search**: finds a show. See [Search](#search).
- The recording chip, while TVHeadend records, for example `Recording The Block`. Press it to open [Scheduled](/guide/recordings#scheduled). On a phone it is a banner under the page title.
- The clock, on a tablet or computer.

While anything records, the browser tab title also starts with `● REC`.

## Highlights

The top of Home is a set of up to five slides that take turns. Press a dot to pick a slide, or swipe on a touch screen. The pause button keeps the current slide in place.

Freetvarr picks the slides from these, in this order, and leaves out any that has nothing to show:

| Slide                           | What it shows                                                                                  | Buttons                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Continue watching**           | The recording you started most recently and have not finished.                                 | **Resume**, **Episodes**                                                  |
| **New episode**                 | A new episode of a show you watch.                                                             | **Play**, **Episodes**                                                    |
| **Recording now**               | A programme TVHeadend records now.                                                             | **Watch from the start** (when it can play the recording), **Watch live** |
| **For you**                     | A suggestion from [For you](/guide/for-you), with the reason.                                  | **Record** or **Record series**, **Details**                              |
| **Live news** or **Live sport** | A news or sports programme on now on a favourite channel.                                      | **Watch live**, **Record**                                                |
| **Recording tonight**           | The next recording, with **Recording today** or **Recording tomorrow** when it is not tonight. | **Recording options** or **Details**, **Scheduled**                       |
| **Now in the guide**            | A show you asked to be told about, now in the Guide.                                           | **Record** or **Record series**, **Details**                              |
| **Unwatched movie**             | A film you recorded and have not watched.                                                      | **Play** or **Resume**, **Details**                                       |

**Details** opens the programme sheet in the [Guide](/guide/tv-guide#recording-a-programme), where you can record it or ask to be told when it airs.

## Rows

Under the highlights, Home has these rows. A row with nothing in it is left out. A row title opens the same page as the link at the right end of the row.

- **New recordings**: episodes you have not watched, newest first, with a `NEW` badge. Press a card to open the show page. **See all** opens [Recordings](/guide/recordings).
- **For you**: suggestions from the next week of the Guide. Until Freetvarr knows what you like, this row is called **New this week**. **See all** opens the [For you](/guide/for-you) page.
- **On now**: what is on your favourite channels, with a bar that shows how far through each programme is. Press a card to watch the channel live. **Live TV** opens the [Live TV](/guide/live-tv) page.
- **Recording tonight**: up to three recordings for tonight. Press one to open [Scheduled](/guide/recordings#scheduled).

**On now** shows only favourite channels. To fill it, press the star next to some channels in [Live TV](/guide/live-tv) or the [Guide](/guide/tv-guide#favourites).

An empty Home says `Nothing recorded yet` and offers **Find a show in the Guide**.

## Health alert

When something Freetvarr needs is broken, such as TVHeadend not answering or the last sync failing, Home shows the reason under its title. Press it to open [Health](/guide/doctor). Press **×** to hide the alert for a day; a different problem shows at once. The dot on the Settings icon stays until the problem is fixed.

## Search

Press **Search** in any page header, then type at least two letters. Search covers your recordings, your series rules, and the next 7 days of the Guide. The results come in two groups:

- **SHOWS**: shows you have recorded or have a series rule for. Press one to open its [show page](/guide/recordings#show-pages).
- **IN THE GUIDE**: programmes in the next 7 days, best match first. Press one to open its programme sheet.

Search finds a show in these ways:

- **The title**, or any part of it.
- **A nickname** from a list that ships with Freetvarr, such as `MKR` for My Kitchen Rules or `GBBO` for The Great British Bake Off.
- **Your own names** for a show. Add them under **Also known as** in a show's [Recording options](/guide/recordings#recording-options).
- **Other titles** of a show, such as its title in another country. Freetvarr learns these from TVmaze and Wikidata while it looks up pictures and genres, when those lookups are on.
- **Initials**: `bbt` finds The Big Bang Theory.
- **A close spelling**, when nothing else matches. The result says `Did you mean`.

A result found by another name says which, such as `Also known as MKR` or `Initials BBT`.
