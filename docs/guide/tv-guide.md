---
title: TV Guide
description: >-
  A 7-day programme guide in the browser: schedule, cancel, and series-record
  in TVHeadend without opening TVHeadend.
---

# TV Guide

The TV Guide tab is a 7-day programme guide. Click a programme to record it, cancel it, or record a whole [series](/guide/series) in TVHeadend. Freetvarr files each recording into your library after TVHeadend records it.

The guide is only as good as what you loaded into TVHeadend. With the XMLTV feed set up ([step 6](/guide/tvheadend#_6-load-the-xmltv-guide)) you get seven days with episode numbers. Without it you get what the broadcast carries: about a day, with little detail.

![The TV Guide tab](../img/screenshot-guide.png)

## The grid

Channels run down the page and time runs across. The guide opens at the current half hour.

- The **day chips** switch between today and the next six days; `NOW` and `TONIGHT` jump within the day.
- The **zoom buttons** change the time scale. Each browser remembers its zoom.
- **Search** covers all 7 days on the grid, and filters the list on `UPCOMING`.
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
- **RECORD SERIES** makes a series recording in TVHeadend, with an episodes-to-keep option. See [How a series recording works](/guide/series#how-a-series-recording-works).
- **ADD TO LIBRARY** decides what Freetvarr does with the recording. Under the switch, the dialog says where the file will go: the series folder when one matches, the movies folder for a film, or the one-off folder when neither does. With the switch off, the recording stays in TVHeadend only. With it on, **RECORD SERIES** also makes the series folder, so the episodes go to the TV library. To change a folder later, open [SERIES](/guide/series).
- A scheduled programme shows **CANCEL RECORDING** instead. If the episode belongs to a series recording, cancelling asks whether to cancel just that episode or the whole series. Cancelling one episode disables it in TVHeadend instead of deleting it, so the series recording does not schedule it again. Record it later to turn it back on.
- A programme whose series is already recording, with no episode scheduled yet, shows a **CANCEL SERIES** action.

Many networks show the same programme on an SD channel and an HD channel, such as 7 Sydney and 7HD Sydney. If you press **RECORD** or **RECORD SERIES** on the SD channel and the guide has the same programme at the same time on an HD channel, Freetvarr asks whether to record the HD channel instead. Your padding, episodes-to-keep, and **ADD TO LIBRARY** choices carry over.

The **UPCOMING** view lists what will record: the recordings TVHeadend has scheduled, plus the episodes your series recordings will catch over the next 7 days. Click a card to record or cancel. The [SERIES](/guide/series) tab lists the series recordings themselves.

## Favourites

Press the star next to a channel to make it a favourite. Favourites sit at the top of the grid. To reorder them, hold a favourite until it lifts, then drag it. This also works on the Live TV page.

The `CHANNELS` button above the grid opens these settings:

- **Favourites**: reorder or remove them.
- **Sort other channels by**: TVHeadend order, channel number, or name.
- **Hide SD simulcasts**: hides an SD channel when its HD twin is in the lineup. SD-only channels stay.
- **All channels**: untick a channel to hide it. Favourites are always shown.
- **Guide**: pick where each channel gets its listings. See [Channel guide](#channel-guide).

Press `SAVE` to apply the changes.

![The CHANNELS dialog](../img/screenshot-channels.png)

## Channel guide

Each channel takes its listings from one channel in the guide feed. The setup wizard links them for you. If a channel shows the wrong programmes, or none, change its link here:

1. Press `CHANNELS` above the grid.
2. In the `GUIDE` list next to the channel, pick the guide channel that matches it.
3. Press `SAVE`.

Pick **No guide** to remove a channel's listings. Two channels can use the same guide channel, such as `SBS ONE` and `SBS ONE HD`.

Freetvarr saves the link in TVHeadend and asks TVHeadend to load the guide again. The new listings can take a minute or two to show. Press `REFRESH` if they do not.

If the `GUIDE` lists are missing, the guide is not set up yet. Open the setup wizard and go to its `GUIDE` step.

A [series recording](/guide/series#how-a-series-recording-works) matches on title and channel. When you fix a channel's link, that channel gets different programmes, so its series recordings can catch different episodes. Check the `UPCOMING` view after the change.

If saving the guide links fails, the dialog says so on its own line. Your favourites and hidden channels are still saved.

## On a phone

The guide works in a phone browser, and you can reorder favourites by touch. To run it full-screen, [add Freetvarr to your Home Screen](/guide/getting-started#_4-add-it-to-your-home-screen). In that app, pull down from the top of a page to refresh it; see [Pull to refresh](/guide/syncs#pull-to-refresh).

## Live TV page

The `LIVE TV` tab lists every channel with what's on now and next, favourites first. Filter by channel or show, or show favourites only.

## On the dashboard

The dashboard's What's On panel shows what's on now and next on your favourite channels, and the next few scheduled recordings. Tap a programme or a recording to open it in the TV Guide. Star some channels to fill the panel.

While TVHeadend records, a `RECORDING NOW` panel at the top of the dashboard shows each recording's progress, file size, and tuner signal. If TVHeadend reports a recording as failed, the card turns red and shows TVHeadend's reason. After a recording stops, its card shows it through import, ad removal (if on), and into your library. While anything records, the browser tab title starts with `● REC`.

## Caching

Freetvarr holds the guide for an hour and the recording state for 45 seconds, to limit the requests to TVHeadend. Press `REFRESH` to fetch them again. If TVHeadend stops answering, the guide shows its cached copy with a note, and updates when TVHeadend is back.
