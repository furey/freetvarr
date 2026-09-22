# Plainify lexicon — Freetvarr

Jargon-to-plain decisions for this project. Read before a run, extend after.
The docs site is split: `guide/` pages and the repo `README.md` are `docs`
preset for a new user (a self-hoster who can run Docker but is new to
TVHeadend → Plex, and possibly new to aerials); `docs/DEEP_DIVE.md` and
`reference/` stay the technical companion and keep their jargon.

| Term | Plain form | Policy | Reader / preset | Note |
| --- | --- | --- | --- | --- |
| DVB-T | free-to-air digital TV (over an aerial) | gloss | self-hoster / docs | |
| tuner | keep | keep | self-hoster / docs | the subject of the hardware page |
| network tuner | plugs into your router, not the NAS | gloss | self-hoster / docs | the reason USB tuners are out |
| mux | a group of channels on one frequency | gloss | self-hoster / docs | keep the term; TVHeadend's UI uses it |
| service | a stream inside a mux | gloss | self-hoster / docs | keep; TVHeadend distinguishes service from channel |
| scan file / predefined muxes | the ready-made frequency list for your transmitter | gloss | self-hoster / docs | keep the literal `au-<Location>` names |
| EPG | the on-screen TV guide | gloss | self-hoster / docs | keep "EPG" after glossing; TVHeadend's menus say EPG |
| XMLTV | a guide file TVHeadend downloads | gloss | self-hoster / docs | keep the term; it names the thing you configure |
| grabber | the script that fetches the guide | gloss | self-hoster / docs | keep `tv_grab_` literals byte-for-byte |
| autorec | a series rule in TVHeadend | gloss | self-hoster / docs | say "series rule" in guide prose, keep "autorec" in the deep dive |
| DVR | recording | strip | self-hoster / docs | except in TVHeadend UI labels (Video recorder rights) |
| Teletext | the way Australian captions are sent | gloss | self-hoster / docs | the caption caveat needs the term |
| masthead amplifier | the amplifier at the antenna | gloss | self-hoster / docs | keep; it's the thing in the chain |
| power injector | the box at the wall that powers the masthead amplifier | gloss | self-hoster / docs | keep model numbers (`PSK02`) in backticks |
| attenuator | a plug that weakens too-strong signal | gloss | self-hoster / docs | |
| PAL / Belling-Lee / F-type | push-on / threaded antenna connector | gloss | self-hoster / docs | keep the names; you buy the part by them |
| hardlink | a second name for the same file | gloss | self-hoster / docs | keep the term; it explains why imports are instant |
| multicast / broadcast (network) | a message sent to everything on the local network at once | gloss | self-hoster / docs | explains why host networking is needed |
| GDM | Plex's own way of announcing itself on the network | gloss | self-hoster / docs | |
| comskip | the ad-detection tool | gloss | self-hoster / docs | keep the name; it's the subject |
| keyframe stream-copy | copies the video across untouched, without re-encoding | gloss | self-hoster / docs | |
| remuxer / transcoder | converter | strip | self-hoster / docs | |
| re-encode | rebuild the video from scratch | gloss | self-hoster / docs | |
| `.ts` / transport stream | the raw broadcast format | gloss | self-hoster / docs | keep the extension |
| truncation / truncated | cut short / an incomplete file | strip | self-hoster / docs | |
| cron / cron expression | a schedule (the `* * * * *` timing string) | gloss | self-hoster / docs | keep every literal cron string |
| fuzzy-match | match by name even when the names aren't identical | strip | self-hoster / docs | |
| datalist | a dropdown of suggestions | strip | self-hoster / docs | |
| tombstone | a struck-through, dimmed row for a deleted recording | gloss | self-hoster / docs | keep as the concept/heading |
| pills | labels | strip | self-hoster / docs | |
| niced | run at low priority | gloss | self-hoster / docs | |
| CPU-bound | works the CPU hard | strip | self-hoster / docs | |
| NAS-class hardware | a home NAS | strip | self-hoster / docs | |
| heuristic | educated guessing, never perfect | strip | self-hoster / docs | |
| housekeeping / auto-prune | routine cleanup / trims itself | strip | self-hoster / docs | |
| state database | its database | strip | self-hoster / docs | |
| migrations | database updates | gloss | self-hoster / docs | |
| no-op | does nothing | strip | self-hoster / docs | |
| CSRF / CSP / rate-limiting | keep, with a short gloss | gloss | self-hoster / docs | keep the acronyms; gloss the phrase once |
| Docker / Compose / container / bind mount / host networking / env var / token | — | keep | self-hoster / docs | reader knows self-hosting; leave as-is |

## Voice notes
- Guide pages and README: short-ish sentences, Australian, gloss the TV, aerial, TVHeadend, video, and comskip jargon on first use, then use the plain form. Say why a step matters, not just what to do.
- Keep every command, path, filename, env var, cron string, status value, URL, model number, and cross-reference byte-for-byte. Only prose changes.
- Reader knows self-hosting (Docker, Compose, LAN, ports, git); don't gloss those. Reader does not know aerials, DVB, or TVHeadend; gloss those.
- TVHeadend UI paths are quoted from the product, so they keep the product's own wording (`Configuration → DVB Inputs → Networks`), even where it breaks plain style.
- Fetch TV is past tense. It appears only in `guide/migrating-from-fetch.md` and one line of the README; don't reintroduce it elsewhere.
- Never invite "open an issue/PR" (furey repos use Discussions only).
