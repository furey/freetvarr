---
title: For you
description: >-
  Suggestions from the next week of the TV guide, made on your own computer from
  what you record and watch. How they work, how to tune them, and the
  For you settings.
---

# For you

**For you** suggests programmes from the next 7 days of the TV guide, based on what you record and watch. Freetvarr works out the suggestions on the computer that runs it. Your viewing history never leaves that computer.

Suggestions show in three places:

- The **For you** row on [Home](/guide/home#rows).
- A **For you** slide in the [highlights](/guide/home#highlights) on Home.
- The **For you** page. Press **See all**, the row title, or the last tile of the row on Home to open it. On a tablet or computer, **For you** in the rail (the menu down the left side; see [Navigation](/guide/home#navigation)) opens it too.

## The For you page

<!-- markdownlint-disable MD033 -->
<BrowserFrame label="http://freetvarr.lan/#/for-you">
  <img src="../img/screenshot-for-you.png" alt="The For you page, with suggestions grouped under headings" width="2560" height="1872" loading="lazy">
</BrowserFrame>
<!-- markdownlint-enable MD033 -->

The page groups its suggestions under these headings, in this order, and leaves out any heading with nothing in it. Each heading shows up to 12 cards. A show appears under the first heading that fits it only.

- **Ready to watch**: one card for each show with recordings you have not watched yet. The card shows the oldest of those episodes. A recording counts as watched when you finish it in Freetvarr, or when [Plex](https://www.plex.tv) marks it watched.
- **Finish what you started**: shows you watched 1 to 3 episodes of in the last 60 days, with the next episode this week.
- **Coming up this week for you**, sorted by air time.
- **New seasons and returning**.
- **Movies worth recording tonight**: films that start between 5pm and 3am, ranked by how well they fit what you watch and, with a [TMDB key](/guide/tv-guide#tmdb-key), by their user score on [TMDB](https://www.themoviedb.org) (The Movie Database, an online film database).
- **You might like**.
- Up to three theme rows and one sport row, such as **Cooking**, **Home and property**, or **AFL**. See [Theme rows](#theme-rows).
- **Top rated series this week**: drama, comedy, animation, and documentary series in the next 7 days with a user score of 7 or more out of 10 on [TVmaze](https://www.tvmaze.com), a free online database of TV shows. A show must be popular enough on TVmaze for the score to count, and Freetvarr must be sure it found the right show: when two shows share a title, such as the US and UK versions of *Ghosts*, it shows no score. It needs no key. With **Ratings** or **Genres** off, the row is left out. Each card shows its TVmaze score, and the **TVmaze** link beside the heading opens TVmaze.
- **Top rated movies this week**: up to 10 films from the next 7 days with the best user scores on TMDB, weighted by the number of votes, so a film with a few high votes does not beat a film with thousands. It needs a [TMDB key](/guide/tv-guide#tmdb-key) and leaves out films you have watched or marked **Fewer like this**. Each card shows its TMDB score.
- **Movies for you**.
- **Premieres and movies this week**.

A suggestion you have already scheduled carries a `Recording` badge and goes to the end of its row. A programme on now carries a `LIVE` badge.

Press a card to act on it. What happens depends on the suggestion:

- **Ready to watch**: plays the episode. If the file does not play, it opens the [show page](/guide/recordings#show-pages).
- On now: plays the channel live.
- Already scheduled: opens the [show page](/guide/recordings#show-pages).
- A new season or a returning show: opens the [programme sheet](/guide/tv-guide#recording-a-programme) with **Every episode** picked.
- A premiere or a new show: opens the programme sheet with **Every episode** picked, or **This episode** for a movie.
- Anything else: opens the programme sheet with **This episode** picked (**This movie** for a movie, **This showing** for a one-off).

Press **⋯** on a card (or hold the card on a touch screen) for more choices:

- **Play**, **Watch live**, **Record this episode**, **Record series**, **Go to show**, and **Programme info**, where they apply. For a movie, the menu reads **Record this movie** and has no **Record series**. For a one-off programme it reads **Record**.
- **More like this** and **Fewer like this**: tell Freetvarr what you think of the show. **Fewer like this** also hides the show from For you, until you press it again on the same card or press **Show again** in **Hidden shows**.
- **Not interested in** the show: hides it from For you for 90 days.
- **Hide** and the theme of the row, such as **Hide Cooking**: on cards in a theme row only. It does the same as **Hide** in the row menu; see [Theme rows](#theme-rows).
- **Not a movie** or **This is a movie**: corrects how Freetvarr lists the programme. See [TV guide](/guide/tv-guide#recording-a-programme).
- **Why this?**: lists the reasons for the suggestion, such as a genre you watched or a channel you often watch at that time.

The reason under a card names how you came to the show:

| Reason                          | What it means                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Because you watched** a show  | You watched at least `10` minutes, or a quarter, of an episode. Watching most of an episode counts most. |
| **Because you recorded** a show | You recorded it, or asked Freetvarr to record it.                                                        |
| **More like** a show            | You pressed **More like this** on it.                                                                    |
| **Because you like** a genre    | Most of what you watched and recorded is in that genre.                                                  |

Only time you spend watching counts: the Freetvarr page is on screen and the picture plays, with or without sound. A hidden tab or a paused picture does not count. In [Multiview](/guide/player#multiview) with more than one picture, a picture counts only when it has the sound or shows captions. Time on a live channel counts towards each programme by the minutes you watched of it. Opening a programme's details counts a little towards a show, but never gives a reason on its own.

## Theme rows

A theme row collects programmes of one kind that you record and watch a lot, such as cooking shows or police shows. Freetvarr reads the title, description, and genres of each show and files it under a theme. A show can have one format, such as **Reality** or **Drama**, and one topic, such as **Cooking** or **Travel**. For example, a renovation competition is under **Reality** and **Home and property**.

These are the themes:

- Formats: **Reality**, **Quiz and game shows**, **Comedy**, **Drama**, and **Crime drama**.
- Topics: **Cooking**, **Home and property**, **Politics and current affairs**, **True crime**, **Police and rescue**, **Nature and animals**, **Travel**, **History**, **Science and health**, **Music and arts**, and a row about life in your country, such as **Life in Australia** or **Life in the United Kingdom**. Freetvarr finds the country from the time zone in Settings → SYSTEM → **Schedule**.
- **Motoring**, **Fishing**, **Antiques**, and **Fitness**.
- Sport: one row per sport, named by the sport, not by a league: **Rugby league**, **Australian rules**, **Rugby union**, **Cricket**, **Basketball**, **Tennis**, **Golf**, **Motorsport**, **Horse racing** (with harness racing), **Greyhound racing**, **Netball**, **Cycling**, **American football**, **Baseball**, and **Ice hockey**. Football is **Football (soccer)** in Australia, **Soccer** in the United States and Canada, and **Football** elsewhere. Leagues, competitions, and shows about a sport go in its row, so the NRL, the NRLW, and State of Origin are all **Rugby league**. When you watch more than one sport a lot, they share one row, **Sport this week**.

News, kids' programmes, shopping, and religious programmes never get a row.

A theme row shows when at least 4% of what you recorded and watched in the last few months is in that theme, from at least three shows (one is enough for a sport), and at least four other programmes in that theme air in the next 7 days. Recent viewing counts most. Recording an episode counts more than watching it. Watching counts more than opening its details. Each episode counts once, however many times it airs, and one show alone cannot make a theme (except a sport). News bulletins do not count towards the share.

A theme row leaves out the shows you already record or watch, as these show under the headings above it. A show appears in one row only. A theme row is left out when most of its programmes are already under earlier headings. The sport row lists each match: live and upcoming matches first, then shows about the sport, such as magazine and panel shows, and replays, highlights, and classic matches last. It shows up to three airings of one title.

Press **⋯** beside the title of a theme row or the sport row for these choices:

- **More** and the theme, such as **More Cooking**: makes the theme count half as much again towards its row. Press **Undo** on the message to take it back.
- **Hide** and the theme, such as **Hide Cooking**: hides the row for 90 days. After that, the theme counts as before. Press **Undo** on the message to bring the row back, with any **More** you chose before. Pressing **More** later also brings the row back.

To turn a theme off before it ever shows, or to turn a hidden theme back on, open **Themes** in the [For you settings](#for-you-settings).

At the Basic [suggestion level](#suggestion-level), Freetvarr files shows by their titles and genres only, so you can get fewer theme rows.

## Getting started

Freetvarr needs to know about at least five shows before it makes personal suggestions. A show counts once you have recorded it, watched at least `10` minutes of an episode, asked to record it, or pressed **More like this** on it. Until then:

- The Home row is called **New this week**, and lists premieres and films from the TV guide.
- The For you page asks you to **Pick a few shows you like** from this week's TV guide. This is optional. Press the posters you like, then **Done**. Press **Skip** to hide the question for a week.

## How it works

Freetvarr scores each programme in the next 7 days of the TV guide against what you have recorded and watched. It looks at:

- The genres of the shows you like. Freetvarr looks up the genres of each show on TVmaze and on [Wikidata](https://www.wikidata.org), a free online database.
- The channels and times of day you usually watch.
- Shows you watched part of and gave up on, which drop down the list.
- New seasons, returning shows, and premieres.
- At the Standard and Plus levels, what the programme descriptions say, compared with the descriptions of shows you like. See [Suggestion level](#suggestion-level).

Freetvarr updates the genres, the TVmaze series scores, and the description data once a night, between 2am and 6am, and soon after it starts if the last update is more than a day and a half old. The first start with no series scores saved also updates the series scores after a minute.

## For you settings

Open Settings → WATCHING → **For you**, or press the settings button at the top of the For you page.

| Setting                      | What it does                                                                                                                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Show For you**             | Turns For you on or off on Home, in the highlights, and on the For you page. On by default.                                                                                                                |
| **Animate the For you icon** | Plays a short sparkle animation on the For you icon in the menu once each time Freetvarr opens. On by default.                                                                                             |
| **Films in other languages** | **All**, **A few** (the default: up to 2 in each row and 1 highlight), or **None** of the suggested films first made in a language other than English.                                                     |
| **Themes**                   | Lists every theme and sport, each with a switch, on by default. Turn one off to stop its row, and its shows stop counting towards the rows. A hidden theme shows as off; turn it on to bring the row back. |
| **Hidden shows**             | Lists the shows you marked **Not interested** or **Fewer like this**, and the themes you hid. Press **Show again** to get suggestions for a show or a theme again.                                         |
| **SUGGESTION LEVEL**         | **Auto**, **Basic**, **Standard**, or **Plus**. See [Suggestion level](#suggestion-level).                                                                                                                 |
| **Pause history**            | Stops Freetvarr noting what you watch, until you turn it off. **More like this**, **Fewer like this**, and **Not interested** still count.                                                                 |
| **Clear viewing history**    | Deletes your viewing history, including **More like this**, **Fewer like this**, and your hidden shows. Suggestions start again from new.                                                                  |

**Genres**, in Settings → WATCHING → **Film and TV info**, sends show titles to TVmaze and Wikidata to look up their genres, and, with **Ratings** on, asks TVmaze for the scores of the series it found. Nothing else is sent. It is on by default, and **Save settings** keeps a change. The same lookups also teach [search](/guide/home#search) other titles for your shows.

## Suggestion level

The suggestion level decides how much of the processor For you uses:

- **Basic** compares genres, channels, times, and the words in programme descriptions. It suits any computer.
- **Standard** adds a small language model (a program that reads text for its meaning) that runs on your computer and compares what descriptions mean, not only their words. Matches are better. Freetvarr picks it when the nightly work takes under about five minutes.
- **Plus** uses a larger language model. It is slower, so Freetvarr picks it only when the nightly work with it takes under about two minutes.

**Auto**, the default, picks the level from a short test of your computer. The setting shows the result, such as `Standard, detected on this box`, and the reason, such as how many seconds a day the work would take. A computer with less than `400MB` of free memory stays at Basic. Press **Check again** to run the test again, for example after a hardware change. To choose a level yourself, press **Basic**, **Standard**, or **Plus**.

The first time it uses Standard or Plus, Freetvarr downloads the language model from [Hugging Face](https://huggingface.co) into its config folder (`${CONFIG_PATH}/freetvarr/models` on the host; `CONFIG_PATH` is set in the `.env`, see [Configuration](/guide/configuration#compose-environment)). After that it works offline.

## Viewing history

Freetvarr notes what you watch and record so For you can learn from it: live channels you watch, recordings you play, programmes whose details you open, recordings and series you schedule or cancel, and your **More like this**, **Fewer like this**, and **Not interested** choices. The history stays on the computer that runs Freetvarr, in its database. **Pause history** and **Clear viewing history** in Settings → WATCHING → **For you** control it. **Pause history** still keeps your **More like this**, **Fewer like this**, and **Not interested** choices. Freetvarr keeps cards it showed you for 30 days and everything else for up to two years.

Your viewing history never leaves that computer: the lookups send TVmaze and Wikidata show titles only, and Freetvarr has no tracking or analytics.
