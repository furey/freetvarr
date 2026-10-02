---
title: TV Guide
description: >-
  A 7-day programme guide in the browser: schedule, cancel, and series-record
  in TVHeadend without opening TVHeadend.
---

# TV Guide

The TV Guide tab is a 7-day programme guide, in the browser. Click a programme to record it, cancel it, or set a series recording; the command goes straight to TVHeadend's API. Combined with [following shows](/guide/following-shows), schedule a series here and Freetvarr files each episode into Plex as TVHeadend records it.

The guide is only as good as what you loaded into TVHeadend. With the XMLTV feed set up ([step 6](/guide/tvheadend#_6-load-the-xmltv-guide)) you get seven days with episode numbers. Without it you get whatever the broadcast signal carries, which is about a day and very thin.

![The TV Guide tab](../img/screenshot-guide.png)

## The grid

Channels run down the page, time runs across, and an orange line marks now. The guide opens scrolled to the current half hour.

- **Day chips** switch between today and the next six days; `NOW` and `TONIGHT` jump within the day.
- **Search** scopes to the section you are on. On the grid it searches the full 7 days of programmes; on `UPCOMING` and `SERIES` it filters the list as you type. Switching sections clears the query. Every result card opens the programme detail.
- The **filter box** in the top-left corner narrows the rows by channel name or number as you type.
- Cell borders show recording state: blue for scheduled, gold for a series recording, pulsing orange for recording right now. A cell that is recording fills orange from its left edge up to the now line. A scheduled episode that came from a series rule carries a gold dot next to the blue one. The programme airing now on each channel is lifted brighter.
- The status line above the grid reports the TVHeadend connection, the scheduled count, and how many tuners it found.
- Drag the rail's right edge to resize it, from icons-only up to full channel names; the width is remembered per browser.
- A channel whose name ends `HD` is labelled `HD`, so an HD simulcast is distinguishable from its SD sibling. Whether you see this depends on your broadcaster's naming; Australian free-to-air channels end in `HD`.

## Recording a programme

Click a cell to open its detail: the programme image, synopsis, rating, season and episode. The image comes from the XMLTV feed; a guide fed only by the broadcast has none. From there:

- **RECORD** schedules the single airing. `START EARLY` and `RUN LATE` pad the timer, 2 minutes before and 10 minutes after by default. Free-to-air broadcasts run late; the generous tail is deliberate.
- **RECORD SERIES** creates a TVHeadend autorec rule, with an episodes-to-keep option.
- A scheduled programme shows **CANCEL RECORDING** instead. If the episode belongs to a series rule, cancelling asks whether to cancel just that episode or the whole series.
- A programme whose show already has a series rule but no episode scheduled yet shows the rule with a **CANCEL SERIES** action.

The **UPCOMING** view lists what will record: the timers TVHeadend has set (`SCHEDULED`, marked `SERIES` or `ONE-OFF`), plus the episodes your series rules are expected to catch over the next 7 days (`SERIES` · `EXPECTED`). **SERIES** lists the rules themselves. Cards carry a small programme image when the guide feed has one. A card in either view opens the programme detail, where you record or cancel; a series card opens its next airing.

## How a series recording works

A series in Freetvarr is one TVHeadend autorec rule. It matches on **title plus channel**, across all days and all start times, and it skips an episode whose episode number it has already recorded. Episodes-to-keep maps to TVHeadend's own maximum-count field, so TVHeadend prunes the oldest itself.

Two consequences worth knowing:

- **A rule belongs to one channel.** An SD channel and its HD simulcast are separate channels, so a series set on the HD channel does not cover SD airings. The channel logo on each row shows which is which.
- **Duplicate detection needs episode numbers.** XMLTV feeds carry them inconsistently, so your guide source decides what you get. Where they're missing, TVHeadend records every airing, and Freetvarr's own folder matching is the second line of defence.

## Favourites

Press the ☆ next to a channel in the rail to add it to your favourites (the button reads `Add to favourites`); the star turns to ★, and the row animates up into the favourites block. Press ★ to remove it (`Remove from favourites`). Favourites sit at the top of the grid in your order, with a gold tint; hold a favourite row by any part of its rail cell for a quarter of a second, and it lifts into a drag ghost that you move to reorder (`Drag to reorder favourites`), or use the arrows in the `CHANNELS` dialog. When the favourites block scrolls out of view, a `↑ N FAVOURITES` chip appears; click it to jump back to the top. The same hold-then-drag works in the channel cell of the Live TV page.

`⚙ CHANNELS` (in the panel header, next to `⟳ REFRESH`) also hides channels you never watch (a favourite can't be hidden: its tick box is disabled, with the tooltip `Favourites are always shown`; making a channel a favourite unhides it), sorts the other channels by TVHeadend order, channel number, or name (`SORT OTHER CHANNELS BY`), and has a `HIDE SD SIMULCASTS` switch: it hides an SD channel only when its HD twin is in the lineup, so SD-only channels stay. The switch applies to the grid and search. The dialog lists your favourites under `FAVOURITES · SHOWN FIRST, IN THIS ORDER`, then every channel under `ALL CHANNELS · ★ FAVOURITE, TICK TO SHOW`.

## On a phone

The guide works in the phone browser: the channel rail narrows, programme and channel dialogs open as bottom sheets, and the rail cells reorder favourites by touch (hold a cell briefly until it lifts, then drag). A sheet's buttons (CLOSE, RECORD, CANCEL) sit in a row pinned to its bottom edge, so they stay visible while the sheet content scrolls. On iOS, add Freetvarr to the Home Screen (Share → Add to Home Screen) to run it full-screen without Safari's toolbar. In that app, pull down from the top of a page to refresh it; see [Pull to refresh](/guide/syncs#pull-to-refresh).

## Live TV page

The `LIVE TV` tab, between `DASHBOARD` and `TV GUIDE`, lists every channel with what's on now and next. Channels fall into two groups: `FAVOURITES`, then `ALL CHANNELS`. Type in the `Filter channels or shows` box to narrow the list, or switch on the `★ FAVOURITES ONLY` chip. Tap ☆ next to a channel to add it to your favourites; with none yet, the page says `No favourites yet. Tap ☆ next to a channel to add it.` Hold a favourite's channel cell for a quarter of a second until it lifts, then drag to reorder.

## On the dashboard

The dashboard carries a TV Guide panel, with `Live TV →` and `Guide →` links in its header. Under `On now · favourites` it shows what's on now across your favourite channels (with the start time, minutes remaining, and a progress bar for each programme), what's on next, and the next few scheduled recordings, each marked series or one-off and each starting with its day (`Today`, `Tomorrow`, or a date such as `Mon 5 Oct`) before the time. A favourite that is recording shows an orange bar and `● REC` in place of the minutes remaining. Tap a programme or a recording in the panel to open its details in the TV Guide; closing them returns you to the dashboard. With no favourites, the panel shows `Star channels to see what's on now.` and an `OPEN LIVE TV` button. With no recordings due, the recordings list reads `Nothing scheduled to record.`

While TVHeadend records, a `RECORDING NOW` panel sits at the top of the dashboard, with one card per recording. Each card shows the programme image, channel, title, and episode, and an orange bar from the padded start to the padded stop. The dimmer ends of the bar are the `START EARLY` and `RUN LATE` padding, labelled `pre-roll` and `post-roll` while they run. Below the bar is a live line: file size, bitrate, tuner signal and SNR, and error counts. A recording TVHeadend reports as failed turns red and shows TVHeadend's status text.

When a recording stops, its card becomes a stepper: `Recorded`, `Importing`, `Cutting ads` (only for a show with ad removal on), then `In Plex`. Importing waits for the next sync. The card stays for about ten minutes after the last step, then collapses. The header shows `● REC`, the browser tab title starts with `● REC`, and the tab icon turns into an orange disc. The dashboard polls every 5 seconds while a recording or a stepper is on screen, and every 45 seconds otherwise.

## Caching

Freetvarr holds the guide for an hour and the recording state for 45 seconds, so paging around the week doesn't hammer TVHeadend. `⟳ REFRESH` forces a re-fetch. If TVHeadend goes unreachable, the guide keeps serving its cached copy with a note above the grid, and recovers by itself once TVHeadend answers again.
