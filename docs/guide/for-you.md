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
- The **For you** page. Press **See all** or the row title on Home to open it. On a tablet or computer, **For you** in the rail opens it too.

## The For you page

The page groups its suggestions under these headings, and leaves out any heading with nothing in it:

- **Coming up this week for you**, sorted by air time.
- **New seasons and returning**.
- **You might like**.
- **Top rated movies this week**: up to 10 films from the next 7 days with the best TMDB user scores, weighted by the number of votes, so a film with a few high votes does not beat a film with thousands. It needs a [TMDB key](/guide/tv-guide#tmdb-key) and leaves out films you have watched or marked **Fewer like this**.
- **Movies for you**.
- **Premieres and movies this week**.

A suggestion you have already scheduled carries a `Recording` badge and goes to the end of its row. A programme on now carries a `LIVE` badge.

Press a card to act on it. What happens depends on the suggestion:

- On now: plays the channel live.
- Already scheduled: opens the show page.
- A new season or a returning show: opens the programme sheet with **Every episode** picked.
- A premiere or a new show: opens the programme sheet with **Every episode** picked, or **This episode** for a movie.
- Anything else: opens the programme sheet with **This episode** picked (**This movie** for a movie, **This showing** for a one-off).

Press **⋯** on a card (or hold the card on a touch screen) for more choices:

- **Watch live**, **Record this episode**, **Record series**, and **Go to show**, where they apply. For a movie, the menu reads **Record this movie** and has no **Record series**. For a one-off programme it reads **Record**.
- **More like this** and **Fewer like this**: tell Freetvarr what you think of the show.
- **Not interested in** the show: hides it from For you for 90 days.
- **Why this?**: lists the reasons for the suggestion, such as a genre you watched or a channel you often watch at that time.

The reason under a card names how you came to the show:

| Reason                          | What it means                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Because you watched** a show  | You watched at least `10` minutes, or a quarter, of an episode. Watching most of an episode counts most. |
| **Because you recorded** a show | You recorded it, or asked Freetvarr to record it.                                                        |
| **More like** a show            | You pressed **More like this** on it.                                                                    |
| **Because you like** a genre    | Most of what you watched and recorded is in that genre.                                                  |

Only time you spend watching counts: the Freetvarr page is on screen and the picture plays, with or without sound. A hidden tab or a paused picture does not count. In Multiview with more than one picture, a picture counts only when it has the sound or shows captions. Time on a live channel counts towards each programme by the minutes you watched of it. Opening a programme's details counts a little towards a show, but never gives a reason on its own.

## Getting started

Freetvarr needs to know about at least five shows before it makes personal suggestions. A show counts once you have recorded it, watched at least `10` minutes of an episode, asked to record it, or pressed **More like this** on it. Until then:

- The Home row is called **New this week**, and lists premieres and films from the TV guide.
- The For you page asks you to **Pick a few shows you like** from this week's TV guide. This is optional. Press the posters you like, then **Done**. Press **Skip** to hide the question for a week.

## How it works

Freetvarr scores each programme in the next 7 days of the TV guide against what you have recorded and watched. It looks at:

- The genres of the shows you like. Freetvarr looks up the genres of each show on [TVmaze](https://www.tvmaze.com) and [Wikidata](https://www.wikidata.org), two free online databases.
- The channels and times of day you usually watch.
- Shows you watched part of and gave up on, which drop down the list.
- New seasons, returning shows, and premieres.
- At the Standard and Plus levels, what the programme descriptions say, compared with the descriptions of shows you like. See [Suggestion level](#suggestion-level).

Freetvarr updates the genres and the description data once a night, between 2am and 6am, and soon after it starts if the last update is more than a day and a half old.

## For you settings

Open Settings → **For you**, or press the settings button at the top of the For you page.

| Setting                      | What it does                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Show For you**             | Turns For you on or off on Home, in the highlights, and on the For you page. On by default.                                                            |
| **Animate the For you icon** | Plays a short sparkle animation on the For you icon in the menu once each time Freetvarr opens. On by default.                                         |
| **Films in other languages** | **All**, **A few** (the default: up to 2 in each row and 1 highlight), or **None** of the suggested films first made in a language other than English. |
| **Hidden shows**             | Lists the shows you marked **Not interested**. Press **Show again** to get suggestions for a show again.                                               |
| **Suggestion level**         | **Auto**, **Basic**, **Standard**, or **Plus**. See [Suggestion level](#suggestion-level).                                                             |
| **Pause history**            | Stops Freetvarr noting what you watch, until you turn it off.                                                                                          |
| **Clear viewing history**    | Deletes your viewing history, including **More like this** and **Fewer like this**. Suggestions start again from new.                                  |

**Genres**, in Settings → Watching → **Film and TV info**, sends show titles to TVmaze and Wikidata to look up their genres. Nothing else is sent. It is on by default, and **Save settings** keeps a change. The same lookups also teach [search](/guide/home#search) other titles for your shows.

## Suggestion level

The suggestion level decides how much of the processor For you uses:

- **Basic** compares genres, channels, times, and the words in programme descriptions. It suits any computer.
- **Standard** adds a small language model that runs on your computer and compares what descriptions mean, not only their words. Matches are better. Freetvarr picks it when the nightly work takes under about five minutes.
- **Plus** uses a larger language model. It is slower, so Freetvarr picks it only when the nightly work with it takes under about two minutes.

**Auto**, the default, picks the level from a short test of your computer. The setting shows the result, such as `Standard, detected on this box`, and the reason, such as how many seconds a day the work would take. A computer with less than `400MB` of free memory stays at Basic. Press **Check again** to run the test again, for example after a hardware change. To choose a level yourself, press **Basic**, **Standard**, or **Plus**.

The first time it uses Standard or Plus, Freetvarr downloads the language model from Hugging Face into its config folder (`${CONFIG_PATH}/freetvarr/models` on the host). After that it works offline.

## Viewing history

Freetvarr notes what you watch and record so For you can learn from it: live channels you watch, recordings you play, programmes whose details you open, recordings and series you schedule or cancel, and your **More like this**, **Fewer like this**, and **Not interested** choices. The history stays on the computer that runs Freetvarr, in its database. **Pause history** and **Clear viewing history** in Settings → **For you** control it. Freetvarr keeps cards it showed you for 30 days and everything else for up to two years.

Your viewing history never leaves that computer: the genre lookups send TVmaze and Wikidata show titles only, and Freetvarr has no tracking or analytics.
