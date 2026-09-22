---
title: TV Guide
description: >-
  A 7-day programme guide in the browser: schedule, cancel, and series-record
  in TVHeadend without opening TVHeadend.
---

# TV Guide

The TV Guide tab is a 7-day programme guide, in the browser. Click a programme to record it, cancel it, or set a series recording; the command goes straight to TVHeadend's API. Combined with [following shows](/guide/following-shows), schedule a series here and freetvarr files each episode into Plex as TVHeadend records it.

The guide is only as good as what you loaded into TVHeadend. With the XMLTV feed set up ([step 6](/guide/tvheadend#_6-load-the-xmltv-guide)) you get seven days with episode numbers. Without it you get whatever the broadcast signal carries, which is about a day and very thin.

![The TV Guide tab](../img/screenshot-guide.png)

## The grid

Channels run down the page, time runs across, and an orange line marks now. The guide opens scrolled to the current half hour.

- **Day chips** switch between today and the next six days; `NOW` and `TONIGHT` jump within the day.
- **Search** scopes to the section you are on. On the grid it searches the full 7 days of programmes; on `UPCOMING` and `SERIES` it filters the list as you type. Switching sections clears the query. Every result card opens the programme detail.
- The **filter box** in the top-left corner narrows the rows by channel name or number as you type.
- Cell borders show recording state: blue for scheduled, gold for a series recording, pulsing orange for recording right now. A scheduled episode that came from a series rule carries a gold dot next to the blue one. The programme airing now on each channel is lifted brighter.
- The status line above the grid reports the TVHeadend connection, the scheduled count, and how many tuners it found.
- Drag the rail's right edge to resize it, from icons-only up to full channel names; the width is remembered per browser.
- A channel whose name ends `HD` is labelled `HD`, so an HD simulcast is distinguishable from its SD sibling.

## Recording a programme

Click a cell to open its detail: synopsis, rating, season and episode, and the channel artwork. From there:

- **RECORD** schedules the single airing. `START EARLY` and `RUN LATE` pad the timer, 2 minutes before and 10 minutes after by default. Free-to-air broadcasts run late; the generous tail is deliberate.
- **RECORD SERIES** creates a TVHeadend autorec rule, with an episodes-to-keep option.
- A scheduled programme shows **CANCEL RECORDING** instead. If the episode belongs to a series rule, cancelling asks whether to cancel just that episode or the whole series.
- A programme whose show already has a series rule but no episode scheduled yet shows the rule with a **CANCEL SERIES** action.

The **UPCOMING** view lists what will record: the timers TVHeadend has set (`SCHEDULED`, marked `SERIES` or `ONE-OFF`), plus the episodes your series rules are expected to catch over the next 7 days (`SERIES` · `EXPECTED`). **SERIES** lists the rules themselves. A card in either view opens the programme detail, where you record or cancel; a series card opens its next airing.

## How a series recording works

A series in freetvarr is one TVHeadend autorec rule. It matches on **title plus channel**, across all days and all start times, and it skips an episode whose episode number it has already recorded. Episodes-to-keep maps to TVHeadend's own maximum-count field, so TVHeadend prunes the oldest itself.

Two consequences worth knowing:

- **A rule belongs to one channel.** An SD channel and its HD simulcast are separate channels, so a series set on the HD channel does not cover SD airings. The channel logo on each row shows which is which.
- **Duplicate detection needs episode numbers.** XMLTV feeds carry them inconsistently. Where they're missing, TVHeadend records every airing, and freetvarr's own folder matching is the second line of defence.

## Pinned channels

Press the ★ next to a channel in the rail to pin it; the row animates up into the pinned block. Pinned channels sit at the top of the grid in your order, with a gold tint; drag a pinned row by any part of its rail cell to reorder, or use the arrows in the `CHANNELS` dialog. When the pinned block scrolls out of view, a `↑ PINNED` chip appears; click it to jump back to the top.

`⚙ CHANNELS` (in the panel header, next to `⟳ REFRESH`) also hides channels you never watch (a pinned channel can't be hidden; pinning unhides it), sorts the unpinned rest by TVHeadend order, channel number, or name, and has a `HIDE SD SIMULCASTS` switch: it hides an SD channel only when its HD twin is in the lineup, so SD-only channels stay. The switch applies to the grid and search.

## On a phone

The guide works in the phone browser: the channel rail narrows, programme and channel dialogs open as bottom sheets, and the rail cells drag to reorder pins by touch. A sheet's buttons (CLOSE, RECORD, CANCEL) sit in a row pinned to its bottom edge, so they stay visible while the sheet content scrolls. On iOS, add freetvarr to the Home Screen (Share → Add to Home Screen) to run it full-screen without Safari's toolbar.

## On the dashboard

The dashboard carries a TV Guide panel: what's on now across your pinned channels (with the start time, minutes remaining, and a progress bar for each programme), what's on next, and the next few scheduled recordings, each marked series or one-off.

## Caching

freetvarr holds the guide for an hour and the recording state for 45 seconds, so paging around the week doesn't hammer TVHeadend. `⟳ REFRESH` forces a re-fetch. If TVHeadend goes unreachable, the guide keeps serving its cached copy with a note above the grid, and recovers by itself once TVHeadend answers again.
