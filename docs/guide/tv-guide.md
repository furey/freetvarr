---
title: TV Guide
description: >-
  A 7-day programme guide in the browser: schedule, cancel, and series-record
  in TVHeadend without opening TVHeadend.
---

# TV Guide

The TV Guide tab is a 7-day programme guide. Click a programme to record it, cancel it, or set a series recording in TVHeadend. Add [following shows](/guide/following-shows), and Freetvarr files each episode of that series into Plex after TVHeadend records it.

The guide is only as good as what you loaded into TVHeadend. With the XMLTV feed set up ([step 6](/guide/tvheadend#_6-load-the-xmltv-guide)) you get seven days with episode numbers. Without it you get what the broadcast carries: about a day, with little detail.

![The TV Guide tab](../img/screenshot-guide.png)

## The grid

Channels run down the page and time runs across. The guide opens at the current half hour.

- The **day chips** switch between today and the next six days; `NOW` and `TONIGHT` jump within the day.
- The **zoom buttons** change the time scale. Each browser remembers its zoom.
- **Search** covers all 7 days on the grid, and filters the list on `UPCOMING` and `SERIES`.
- The **filter box** above the channels narrows them by name or number.
- Cell borders show recording state: blue for scheduled, gold for a series recording, orange for recording now.
- Programmes that ended earlier today stay in the grid. TVHeadend drops a programme once it ends, but Freetvarr keeps its own copy.
- Hover over a programme, or tab to it, to see its full title, times, and synopsis.
- Drag the right edge of the channel list to make it wider or narrower.
- Channels whose names end in `HD` carry an `HD` label, so you can tell an HD simulcast from its SD twin.

## After midnight

Each day's grid runs to 3am the next morning, so a late film stays on the same page. Programmes after midnight are dimmed, but they work like any other. While midnight is in view, a button with the next day's date opens that day at the same time of night.

## Recording a programme

Click a cell to open its detail: the programme image, synopsis, rating, season and episode. The image comes from the XMLTV feed; a guide fed only by the broadcast has none.

![A programme's detail dialog with its image, synopsis, and RECORD buttons](../img/screenshot-programme.png)

From there:

- **RECORD** schedules the single airing. `START EARLY` and `RUN LATE` pad the recording, 2 minutes before and 10 minutes after by default, because free-to-air broadcasts often run late.
- **RECORD SERIES** creates a TVHeadend autorec rule, with an episodes-to-keep option.
- A scheduled programme shows **CANCEL RECORDING** instead. If the episode belongs to a series rule, cancelling asks whether to cancel just that episode or the whole series. Cancelling one episode disables it in TVHeadend instead of deleting it, so the series rule does not schedule it again. Record it later to turn it back on.
- A programme whose show already has a series rule but no episode scheduled yet shows the rule with a **CANCEL SERIES** action.

The **UPCOMING** view lists what will record: the recordings TVHeadend has scheduled, plus the episodes your series rules will catch over the next 7 days. **SERIES** lists the rules themselves. Click a card in either view to record or cancel.

## How a series recording works

A series in Freetvarr is one TVHeadend autorec rule. It matches on **title plus channel**, across all days and all start times, and it skips an episode whose episode number it has already recorded. Episodes-to-keep maps to TVHeadend's own maximum-count field, so TVHeadend prunes the oldest itself.

This has two effects:

- **A rule belongs to one channel.** An SD channel and its HD simulcast are separate channels, so a series set on the HD channel does not cover SD airings. - **Duplicate detection needs episode numbers.** XMLTV feeds carry them inconsistently, so your guide source decides what you get. Where they're missing, TVHeadend records every airing.

## Favourites

Press the star next to a channel to make it a favourite. Favourites sit at the top of the grid. To reorder them, hold a favourite until it lifts, then drag it. This also works on the Live TV page.

The `CHANNELS` button above the grid opens these settings:

- **Favourites**: reorder or remove them.
- **Sort other channels by**: TVHeadend order, channel number, or name.
- **Hide SD simulcasts**: hides an SD channel when its HD twin is in the lineup. SD-only channels stay.
- **All channels**: untick a channel to hide it. Favourites are always shown.

Press `SAVE` to apply the changes.

![The CHANNELS dialog](../img/screenshot-channels.png)

## On a phone

The guide works in a phone browser, and you can reorder favourites by touch. On iOS, add Freetvarr to the Home Screen (Share → Add to Home Screen) to run it full-screen. In that app, pull down from the top of a page to refresh it; see [Pull to refresh](/guide/syncs#pull-to-refresh).

## Live TV page

The `LIVE TV` tab lists every channel with what's on now and next, favourites first. Filter by channel or show, or show favourites only.

## On the dashboard

The dashboard's TV Guide panel shows what's on now and next on your favourite channels, and the next few scheduled recordings. Tap a programme or a recording to open it in the TV Guide. Star some channels to fill the panel.

While TVHeadend records, a `RECORDING NOW` panel at the top of the dashboard shows each recording's progress, file size, and tuner signal. If TVHeadend reports a recording as failed, the card turns red and shows TVHeadend's reason. After a recording stops, its card follows it through import, ad removal (if on), and into Plex. While anything records, the browser tab title starts with `● REC`.

## Caching

Freetvarr holds the guide for an hour and the recording state for 45 seconds, to limit the requests to TVHeadend. Press `REFRESH` to fetch them again. If TVHeadend stops answering, the guide shows its cached copy with a note, and updates when TVHeadend is back.
