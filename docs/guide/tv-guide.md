---
title: TV guide
description: >-
  A 7-day programme guide in the browser: schedule, cancel, series-record, and
  watch for a show in TVHeadend without opening TVHeadend.
---

# TV guide

The TV guide is a 7-day programme guide. Press a programme to record it, cancel it, record a whole [series](/guide/series), or ask to be told when it airs. Freetvarr imports each recording into your library after TVHeadend records it.

The TV guide shows only the listings you loaded into TVHeadend. With the XMLTV guide feed set up ([step 6](/guide/tvheadend#_6-load-the-xmltv-guide)) you get seven days with episode numbers. Without it you get what the broadcast carries: about a day, with little detail.

<!-- markdownlint-disable MD033 -->
<BrowserFrame label="http://freetvarr.lan/#/guide">
  <img src="../img/screenshot-guide.png" alt="The TV guide" width="2560" height="1872" loading="lazy">
</BrowserFrame>
<!-- markdownlint-enable MD033 -->

## The grid

Channels run down the page and time runs across. The TV guide opens at the current half hour.

- The **day chips** switch between today and the next six days. **Now** and **Tonight** jump within the day.
- **Zoom** has three levels, **S**, **M**, and **L**, that change the time scale. In a narrower window, **Zoom** shows **−** and **+** instead. **Images** shows a programme picture on each cell that is wide enough. Each browser remembers both.
- The **search** button searches all 7 days on the grid. It finds a show by nickname, initials, or a close spelling too, as [Search](/guide/home#search) does. When nothing matches, **Add to watchlist** lists the show for later. See [Watchlist](#watchlist).
- The **Channels** button opens the channel settings.
- The `N scheduled` chip opens [Scheduled](/guide/recordings#scheduled). On a phone it shows only the number. It replaces the old `UPCOMING` view.
- A dot on a cell marks a scheduled recording, and a ring marks a recording now. A programme on your watchlist has its own dot; the legend names it **On watchlist**. On a tablet or computer the legend sits above the grid, on the right; on a phone it sits under the grid. Past programmes are dimmed, and programmes on air have a lighter cell.
- A line marks the current time.
- At zoom **L**, a movie has a `Movie` tag beside its start time when the cell is wide enough.
- Programmes that ended earlier today stay in the grid. TVHeadend drops a programme once it ends, but Freetvarr keeps its own copy.
- Hover over a programme, or tab to it, to see its full title, times, and synopsis.
- The **Filter** box narrows the grid to channels whose name contains what you type, or whose number starts with it. On a tablet or computer it sits beside **CHANNELS** above the grid, and the top corner of the grid shows how many channels match. On a phone it sits at the top of the channel column. Press **×** in the box, or the **×** in the count, to clear it. Type `film`, `movie`, `series`, or `one-off` to see only channels with that kind of programme on now or next; the list under the box also offers **Channels named** to match the word in channel names instead.
- Drag the edge of the channel column to make it wider or narrower. At its narrowest the column shows only the stars and channel logos. Each browser remembers the width.
- A dimmed channel with `OFF AIR` beside its name is not broadcasting right now: TVHeadend has switched off every service for it. The note clears by itself once TVHeadend sees the channel again, after a channel scan.
- Each channel in the channel settings shows `HD` or `SD` before its name, read from the TV service type that TVHeadend reports. Where TVHeadend reports no type, a name with `HD` in it (such as `9GemHD Sydney`) counts as HD. **Hide SD simulcasts** uses it to pair an SD channel with its HD twin. The pairing ignores spaces, punctuation, `HD`, and the word Channel, so `ABC TV` pairs with `ABCTV` and `Channel 9 Sydney` with `9HD Sydney`.
- While **Hide SD simulcasts** and **Hide SD channels** are both off, each channel logo shows a small `HD` or `SD` tag: in the grid, on Live TV, in the player, in the Multiview channel list, and on Home. While either setting is on, the tags are gone.

## After midnight

Each day's grid runs to 3am the next morning, so a late film stays on the same page. Programmes after midnight are dimmed, but they work like any other. While midnight is in view, a button with the next day's date opens that day at the same time of night.

## Recording a programme

Press a programme's cell to open its programme sheet: the programme image, title, season and episode, channel, time, and synopsis. On a phone the sheet slides up from the bottom. On a wide screen it opens as a dialog. To close it, press **Close**, press `Esc`, press outside it, or swipe it down on a phone. The image comes from the XMLTV guide feed (a TV guide fed only by the broadcast has none); see [Missing pictures](#missing-pictures) for what Freetvarr shows when the feed has no image.

<!-- markdownlint-disable MD033 -->
<BrowserFrame label="http://freetvarr.lan/#/guide">
  <img src="../img/screenshot-programme.png" alt="A programme sheet with This episode and Every episode" width="2560" height="1872" loading="lazy">
</BrowserFrame>
<!-- markdownlint-enable MD033 -->

A switch in the sheet picks what to do. One line under it says what the main button does.

- **This episode** with **Record** schedules the single airing. For a movie the switch reads **This movie**, and for a programme that is not part of a series it reads **This showing**. **Start early** and **Finish late** pad the recording, 2 minutes before and 10 minutes after by default, because free-to-air broadcasts often run late.
- **Every episode** with **Record series** creates a series recording in TVHeadend. A movie does not offer it. **Keep** sets how many episodes to keep. **Any channel** follows the show to another channel. See [How a series recording works](/guide/series#how-a-series-recording-works).
- **Advanced** holds **Add to library**. It decides what Freetvarr does with the recording. With the switch off, the recording stays in TVHeadend only. With it on, **Record series** also creates the series folder, so the episodes go to the TV library. The note under the switch says where the file will go: the series folder when one matches, the movies folder for a film, or the one-off folder when neither does. The default is in Settings → Library and Plex. To change a folder later, open [Series rules](/guide/series).
- **Watch live** shows when the programme is on air.
- **Show in TV guide** shows when you open the sheet outside the TV guide. It opens the TV guide at that channel and time.
- A scheduled programme shows **Cancel recording** instead. For an episode of a series recording, the button reads **Skip this episode**: TVHeadend keeps the episode disabled, so the series recording does not schedule it again. To turn it back on, open the episode later and press **Record**.
- A programme that is recording now shows **Stop recording**. After `5` minutes or more, the part recorded so far stays and imports to your library; before `5` minutes, Freetvarr deletes it. The sheet says which applies.
- A programme with a series recording also shows **Cancel series**. See [Cancel a series recording](/guide/series#cancel-a-series-recording).

Many networks show the same programme on an SD channel and an HD channel, such as 7 Sydney and 7HD Sydney. If you press **Record** or **Record series** on the SD channel and the TV guide has the same programme at the same time on an HD channel, Freetvarr asks whether to record the HD channel instead. Your padding, episodes-to-keep, and **Add to library** choices carry over.

The same sheet opens from [Home](/guide/home), [For you](/guide/for-you), [Live TV](/guide/live-tv), [Search](/guide/home#search), and the [player](/guide/live-tv#record-from-the-player). It opens over the page you are on, and closing it leaves you there.

Freetvarr decides from the guide whether a programme is a movie, part of a series, or a one-off:

- **Movie**: it runs `75` minutes or more and has no season number, episode number, or episode title, and it airs no more than twice in the next 7 days. A programme the guide lists as a movie counts even when it airs more often. A long documentary special counts as a movie too. News and sport never count, unless the movie lookups for [For you](/guide/for-you) know the title as a film.
- **Series**: it has a season number, an episode number, or an episode title, or it airs `3` or more times in the next 7 days, or TVmaze knows it as a TV show. A show with a series recording always counts as a series.
- **One-off**: anything else, such as a sports final or a short special.

[Scheduled](/guide/recordings#scheduled) lists what will record: the recordings TVHeadend has scheduled, plus the episodes your series recordings will catch over the next 7 days. [Series rules](/guide/series) lists the series recordings themselves.

## Watchlist

**Add to watchlist** lists a show under **Watchlist** in [Scheduled](/guide/recordings#scheduled) when nothing in the next 7 days matches its title. Each time a programme with the same title is in the TV guide, the list shows when it next airs, with a number badge for new airings. Nothing records unless you turn on **Record when it appears**.

To add a show to your watchlist:

1. Search for the title in [Search](/guide/home#search) or in the search of the TV guide.
2. When nothing in the TV guide matches, press **Add “title” to watchlist** at the end of the results.
3. Check the title, and change it if you need to.
4. To record the show as soon as it is in the TV guide, turn on **Record when it appears**.
5. With the switch on, set **Start early** and **Finish late**. They start at `2m` and `10m`, the same as for **This episode** and **Every episode**.
6. Press the button. It reads **Add to watchlist** with the switch off, and **Record when it appears** with the switch on.

Freetvarr matches by title. Case, accents, and punctuation do not matter, so `Gogglebox` also matches `GOGGLEBOX`. A different title does not match: a watchlist entry for `Utopia` does not catch `Utopia: The Series`.

**Record when it appears** sets an any-channel series recording the first time the show is in the TV guide, with the padding you set. Freetvarr checks the TV guide every 15 minutes. To take a show off your watchlist, open **Scheduled**, then **Watchlist**, and press **Remove from watchlist**.

Freetvarr sends no push message or email. The list in Scheduled is the notice.

## Favourites

Press the star next to a channel to make it a favourite. Favourites sit at the top of the grid and of [Live TV](/guide/live-tv).

To reorder them on a tablet or computer:

1. Press **Edit order** at the right of the **Favourites** heading. In a narrow channel column it is an icon with two arrows.
2. Drag a favourite by its handle (three lines) to its new place. With the keyboard, tab to a handle, press Space, move it with the arrow keys, then press Space again.
3. Press **Done**, or press Esc.

**Edit order** shows when you have two or more favourites and the filter box is empty. On a phone, **Edit order** opens a list to reorder instead. You can also reorder favourites in the channel settings, or on the [Live TV](/guide/live-tv#in-freetvarr) page.

In Australia, the channel scan in setup starts you with five favourites: the HD channels of ABC, Seven, Nine, 10, and SBS, or the SD channel where a network has no HD channel. Setup does this only when you have no favourites, and only once. Remove or reorder them like any other favourite.

The **Channels** button (sliders) at the top right, next to search, opens the channel settings. Live TV has the same button in the same place. On a phone, the settings come first and the list follows. The settings are:

- **Favourites, shown first in this order**: remove a favourite, or press **Edit order** to reorder them.
- **Sort other channels by**: channel number or name.
- **Hide SD simulcasts**: hides an SD channel when its HD twin is in the lineup. SD-only channels stay.
- **Hide SD channels**: shows only HD channels. SD-only channels (for example 7flix) are hidden too. It applies to the grid, search, Live TV, and the channel list. Favourites are never hidden. While it is on, **Hide SD simulcasts** is on and locked, because it hides the same channels.
- **All channels**: turn a channel off to hide it. Favourites are always shown.
- **Listings**: fix the shows of a channel that has the wrong ones, or none. See [Channel listings](#channel-listings).

Press **Save** to apply the changes. Press **Cancel** to close without saving.

<!-- markdownlint-disable MD033 -->
<BrowserFrame label="http://freetvarr.lan/#/guide">
  <img src="../img/screenshot-channels.png" alt="The channel settings" width="2560" height="1872" loading="lazy">
</BrowserFrame>
<!-- markdownlint-enable MD033 -->

## Channel listings

Each channel's shows come from one channel in the TV guide you set up, such as the Sydney guide chosen in the **Guide** step of the [setup](/guide/getting-started#_2-run-setup). Setup links each channel to a guide channel for you. If a channel shows the wrong shows, or none, pick a different guide channel for it:

1. In the TV guide, press **Channels** above the grid.
2. Press the pencil next to the channel (**Change guide source**). The row shows the current guide channel in a box you can type in.
3. Type part of the guide channel's name to find it (`7` finds Seven and 7two), then pick the one that matches. Guide channels with no shows in the guide are at the end of the list, marked `(no shows in this guide)`, and you cannot pick them. The arrow keys and `Enter` also work, and `Esc` closes the list. Press the tick (**Use this guide source**, or `Enter` with the list closed). Press the cross (**Keep the current guide source**, or `Esc`) to keep the current pick.
4. Press **Save** to save the new listings.

Each row shows the name of its guide channel, or `No listings`. A row you changed is marked until you press **Save**. Opening another channel's pencil drops an unconfirmed pick.

Pick **No listings** to remove a channel's shows. The channel's shows go at once. Two channels can use the same guide channel, such as `SBS ONE` and `SBS ONE HD`.

Freetvarr saves the pick in TVHeadend, removes the channel's old shows, and asks TVHeadend to load the TV guide again. The channel stays empty while TVHeadend downloads the guide. In the channel's row, after the current time, the TV guide shows `Loading the new listings. This can take a couple of minutes.` When the new shows are in TVHeadend, the TV guide shows them and the note goes.

Freetvarr also turns off TVHeadend's **Auto EPG channel** setting for a channel you change. TVHeadend then does not add a guide channel to it again by name or number.

Shows that already ended stay in the TV guide under their old listings. A scheduled recording on the channel stays at its time, but no longer follows a guide programme.

If the pencils are missing, the TV guide is not set up yet. Open Settings → System → Setup and press **Guide**.

A [series recording](/guide/series#how-a-series-recording-works) matches on title and channel. When you fix a channel's listings, that channel gets different programmes, so its series recordings can catch different episodes. Check [Scheduled](/guide/recordings#scheduled) after the change.

If saving the listings fails, the dialog says so on its own line. Your favourites and hidden channels are still saved.

## On a phone

The TV guide works in a phone browser, with **Now**, **Tonight**, and the zoom buttons over the grid. To run it full-screen, [add Freetvarr to your Home Screen](/guide/getting-started#_4-save-it-as-an-app). In that Home Screen app, pull down from the top of a page to refresh it (see [Pull to refresh](/guide/syncs#pull-to-refresh)).

## Live TV page

The Live TV page lists every channel with what is on now and next, favourites first. See [Live TV](/guide/live-tv).

## Missing pictures

Some programmes in a guide feed have no image, or an image link that no longer works. Freetvarr then looks for a picture in this order:

1. Another airing of the same programme in the guide.
2. The show's background or poster in your Plex TV or movies library, matched by title.
3. The show's picture on [TVmaze](https://www.tvmaze.com), a free online TV database, matched by exact title.
4. With a [TMDB key](#tmdb-key), the film or show's backdrop or poster on [TMDB](https://www.themoviedb.org).
5. The lead picture of the film or show's English [Wikipedia](https://en.wikipedia.org) article.

For steps 4 and 5, Freetvarr finds the film or show on [Wikidata](https://www.wikidata.org) by exact title, then checks the match before it uses a picture: a year in the synopsis must match the release year, a cast list in the synopsis must name someone in the article, and otherwise names and words from the synopsis must appear in the article. A programme with no synopsis gets no picture from these steps. An episode never matches a film.

While Freetvarr looks, the programme sheet shows a title card: the programme's name on a coloured background. The title card stays when no step finds a picture. A grid cell shows only its text until a step finds a picture, then the picture appears beside the text. With **Images** off, the grid does not ask for these pictures.

A lookup sends the programme title to TVmaze, Wikidata, and Wikipedia, and to TMDB when you add a key. Freetvarr keeps each answer for 30 days, or 7 days when there is no match. After 30 days, Freetvarr keeps showing the old answer while it asks again, for up to 6 months. When a service does not answer, Freetvarr keeps the answer it has, waits 10 minutes before it asks about that title again, and stops asking a service that keeps failing for up to 30 minutes. To turn the lookups off, go to Settings → Film and TV info and turn off **Missing pictures**.

### TMDB key

A free [TMDB](https://www.themoviedb.org) API key adds film and TV posters and backdrops, which are often sharper than the Wikipedia picture. It also adds film ratings and a line from a TMDB review on the programme sheet; see [Ratings and reviews](#ratings-and-reviews). To add one:

1. Sign up at [themoviedb.org](https://www.themoviedb.org/signup).
2. Open [TMDB API settings](https://www.themoviedb.org/settings/api) and request a free developer key. TMDB asks about your "application". You are using Freetvarr at home, so answer for that:

| Field               | What to enter                                                                |
| ------------------- | ---------------------------------------------------------------------------- |
| Application Name    | `Freetvarr (personal)`                                                       |
| Application URL     | `https://github.com/furey/freetvarr`                                         |
| Type of Use         | **Personal** or **Other**, whichever the list offers                         |
| Application Summary | `Personal use: posters and backdrops for my own Freetvarr TV guide at home.` |

   TMDB also asks for your name, email address, phone number, and street address before it shows the key.
3. TMDB shows two values: an **API Key** (32 letters and numbers) and an **API Read Access Token** (a much longer one). Either works in Freetvarr. Copy the **API Key**; it is shorter to paste.
4. In Freetvarr, go to Settings → Film and TV info and paste it into **TMDB API key (optional)** under **TMDB key**.
5. Press **Test key**, then **Save key**.

The key stays on the Freetvarr server; the browser never receives it. **Remove key** deletes it, and Freetvarr then makes no requests to TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB. Some show ratings and cast lists come from [TVmaze](https://www.tvmaze.com).

## Ratings and reviews

The programme sheet can show a score, a classification, and a review line for a programme. Each loads after the sheet opens, so the sheet never waits for it.

- **Classification**: a badge such as `G`, `PG`, `M`, `MA15+`, or `R18+` on the bottom-right of the picture. It shows for every programme that has a classification. See [Classification](#classification).
- **Score**: a star and a score out of `10` on the bottom-left of the picture. Press the score to see the source (TMDB users with the number of votes, or TVmaze users) and a link that opens the programme on that site in a new tab. Press outside the card or `Esc` to close it.
- **Review line**: one sentence from a TMDB review, below the synopsis, with a **Read N reviews** link to the reviews on TMDB. Freetvarr picks a sentence that judges the programme and skips ones that give away the plot. It shows no reviewer name.

Scores and reviews appear only after you open a programme or a show. They never appear on the TV guide, Home, For you, Live TV, or the Recordings library.

Only films and scripted, animated, documentary, and miniseries shows get a score or a review line. Reality, game shows, talk, news, sport, variety, panel shows, and lifestyle programmes never do. When no source gives a show's type, Freetvarr uses the guide genre: film and drama count; game show, news, and sport do not.

Films come from [TMDB](https://www.themoviedb.org), which needs a [TMDB key](#tmdb-key). With a TMDB key, series come from TMDB first. Freetvarr uses a TMDB series only when the synopsis matches it, or when it comes from your country and its network matches a channel in your guide. When TMDB has no such match, or fewer than `50` votes for it, the score comes from [TVmaze](https://www.tvmaze.com), which needs no key. Without a TMDB key, series scores come from TVmaze. Freetvarr matches a title with the same checks as [Missing pictures](#missing-pictures), and shows nothing when it is not sure of the match. A score from TMDB with fewer than `50` votes is hidden.

Freetvarr keeps each answer for 30 days, or 7 days when there is no match, and keeps showing an old answer while a service is down. When the site of a link does not answer, the score card shows no link. To turn these off, go to Settings → Film and TV info and turn off **Ratings** or **Reviews**. The **Cast and crew** switch is separate; see [Cast and crew](#cast-and-crew). **Reviews** is switched off and unavailable until you add a TMDB key. Each lookup sends the programme title to TVmaze or TMDB.

### Classification

A classification is the age label of a programme: `G`, `PG`, `M`, `MA15+`, `R18+`, `P`, `C`, or `AV15+`. It shows in these places:

- **Programme sheet**: on the picture, for any programme that has a label. When the broadcaster sends consumer advice, tap the badge (or point at it on a computer) to see it, such as `Language, violence`.
- **Show page**: in the header of a recorded show, with the label of the latest episode ([Recordings](/guide/recordings#show-pages)).
- **Live player**: when you tune in to a channel, and when a new programme starts on it, the label shows over the picture for 5 seconds. The label also shows in the programme info panel ([Live TV](/guide/live-tv#programme-info)). It does not show in the miniplayer or in Multiview.
- **Lists**: no list shows a label. TV guide cells, Live TV rows, and cards on Home, For you, and Recordings stay plain; open a programme or show to see its label.

Freetvarr reads each label from the XMLTV guide feed as it loads the feed. When the feed has no label for a programme, Freetvarr uses the age rating that TVHeadend holds for it, but only when that rating is `MA15+` or `R18+`. A programme with neither source has no label.

A recording keeps the label it had when it was recorded or imported. A recording made before this version has no label, and its show page shows none.

### Cast and crew

The page of a recorded show lists its cast and crew; see [Recordings](/guide/recordings#about-and-cast-and-crew). Freetvarr looks them up by the show title, so reality and game show hosts appear too.

- **Films**: from TMDB, which needs a [TMDB key](#tmdb-key). Without a key, a film page shows no cast.
- **Series with a TMDB key**: the cast of the current season, the creators, and the executive producers, from TMDB, when TMDB has a confident match with a cast list (the same checks as [Ratings and reviews](#ratings-and-reviews)). Otherwise the cast and crew come from TVmaze.
- **Series without a key**: the cast and crew come from TVmaze.

Freetvarr keeps a copy of each photo on the server, so photos still show when TVmaze or TMDB is down. A name links to the person's TMDB or TVmaze page; when that site does not answer, the name has no link.

Each lookup sends the show title to TVmaze or TMDB. To turn it off, go to Settings → Film and TV info and turn off **Cast and crew**. Freetvarr keeps each answer for 30 days, or 7 days when there is no match, and keeps showing an old answer while a service is down.

## Caching

Freetvarr keeps a copy of the TV guide for an hour and the recording state for 45 seconds, to limit the requests to TVHeadend. The TV guide fetches them again every 5 minutes while it is open, and when you come back to it after 5 minutes or more. If TVHeadend stops answering, the TV guide shows its cached copy with a note, and updates when TVHeadend is back.
