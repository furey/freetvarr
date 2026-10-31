export const SCENES = [
  { id: 'open', chapter: 'Intro', lines: [
    'Recording in {Freetvarr} works like the record button on the Fetch remote.',
    'Find a show in the TV guide, press it, and press Record.',
  ] },
  { id: 'guide', chapter: 'The TV guide', lines: [
    'The TV guide shows seven days. Channels run down the page, and time runs across.',
    'The day chips switch days. Now and Tonight jump to that time.',
    'Press the star next to a channel to make it a favourite. Favourites sit at the top.',
  ] },
  { id: 'sheet', chapter: 'The programme sheet', lines: [
    'Press a programme to open its sheet. It shows the picture, the episode, the time, and what it is about.',
    'On a phone, the sheet slides up from the bottom.',
  ] },
  { id: 'record', chapter: 'Record one episode', lines: [
    'To record one airing, leave This episode picked, and press Record.',
    'A dot on the guide marks it as scheduled.',
    'After it finishes, {Freetvarr} files it into your library.',
  ] },
  { id: 'padding', chapter: 'Start early, finish late', lines: [
    'Free-to-air shows often run late. So each recording starts two minutes early, and finishes ten minutes late.',
    'To change that, set Start early and Finish late before you press Record.',
  ] },
  { id: 'series', chapter: 'Record the series', lines: [
    'To record every episode, pick Every episode, and press Record series.',
    'Keep sets how many episodes to keep. TVHeadend removes the oldest by itself.',
    'If the show moves to another channel, turn on Any channel.',
    'When the guide has episode numbers, each episode records only once.',
  ] },
  { id: 'cancel', chapter: 'Change or cancel', lines: [
    'To change your mind, press the programme again, and press Cancel recording.',
    'For a series, Skip this episode skips one airing. Cancel series stops the whole series.',
  ] },
  { id: 'watchlist', chapter: 'Watchlist', lines: [
    'Waiting for a show that is not on yet? Search for it.',
    'When nothing in the guide matches, press Add to watchlist.',
    'Turn on Record when it appears, and {Freetvarr} records the series as soon as it is in the guide.',
    'The watchlist in Scheduled shows when it next airs.',
  ] },
  { id: 'scheduled', chapter: 'Scheduled', lines: [
    'To see what will record, open Recordings, then Scheduled.',
    'It lists what records now, today, tomorrow, and later this week.',
    'Turn off a row\'s switch to skip that episode. The series keeps recording the rest.',
    'On a wide screen, a timeline shows each tuner. It warns when more shows record at once than you have tuners.',
  ] },
  { id: 'ads', chapter: 'Ad removal', lines: [
    'You can also have the ad breaks taken out of your recordings. It is off until you turn it on.',
    'Turn it on in Settings, under Recording, then Ad removal.',
    'Set a show to Detect first, which only finds the breaks. Check them, then switch the show to Cut.',
    '{Freetvarr} keeps the original for seven days, in case a cut goes wrong.',
  ] },
  { id: 'end', chapter: 'Next', lines: [
    'Next in this playlist: watching your recordings and live TV.',
  ] },
]

export const TIMING = {
  lead: { open: 1.0 },
  tail: { open: 1.0, end: 3.0 },
}

export const YOUTUBE = {
  title: 'Record free-to-air TV from the Freetvarr TV guide',
  description: `
Record free-to-air TV from Freetvarr's 7-day TV guide: one episode or the whole series, with padding for shows that run late. Add a show to your watchlist before it airs, check what records next in Scheduled, and, if you want, have the ad breaks taken out.

Chapters:
{{chapters}}

Links:
- TV guide: https://furey.github.io/freetvarr/guide/tv-guide
- Series rules and folders: https://furey.github.io/freetvarr/guide/series
- Scheduled: https://furey.github.io/freetvarr/guide/recordings#scheduled
- Ad removal: https://furey.github.io/freetvarr/guide/ad-removal
- Freetvarr: https://furey.github.io/freetvarr/
`,
  tags: 'Freetvarr, TV guide, record TV, series recording, free-to-air TV, PVR, DVR, TV recorder Australia, TVHeadend, ad removal, comskip, watchlist, leaving Fetch',
}
