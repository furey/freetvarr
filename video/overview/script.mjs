export const VOICE = 'en-au-andrew:DragonHDOmniLatestNeural'

export const ELEVEN = {
  voice: 'AsGY6GCuJNcXklospqtq',
  model: 'eleven_multilingual_v2',
  settings: { stability: 0.7, similarity_boost: 0.8, style: 0, use_speaker_boost: true, speed: 1 },
}

export const SCENES = [
  {
    id: 'open',
    chapter: 'Intro',
    lines: [
      'Leaving Fetch? You can keep recording free-to-air TV, and keep watching it on your TV.',
      'With hardware you own, and nothing more to pay each month.',
    ],
  },
  {
    id: 'title',
    chapter: null,
    lines: [
      'This is {Freetvarr}. It turns a TV tuner and a computer at home into your own recorder.',
    ],
  },
  {
    id: 'levy',
    chapter: 'The Fetch levy',
    lines: [
      'If you have a Fetch Mini or Mighty Gen 3, and no Fetch subscription, Fetch now asks for a one-off levy to keep the box working.',
      'The deadline to opt in is the thirty-first of October.',
      'Do nothing, and in November, Fetch suspends the box. A Fetch Mighty loses its recordings for good.',
      'Paying the levy is one choice. The other is to own the whole setup yourself.',
    ],
  },
  {
    id: 'need',
    chapter: 'What you need',
    lines: [
      'You need three things.',
      'A network tuner, like an HDHomeRun. It plugs into your TV aerial, and sends live TV over your home network.',
      'A computer that stays on, such as a NAS or a mini PC. It records the shows and stores them.',
      'And the TV you already have, with a media player app.',
      '{Freetvarr} runs on that computer, next to TVHeadend, the free recording software that drives the tuner.',
    ],
  },
  {
    id: 'setup',
    chapter: 'Install and setup',
    lines: [
      'Installing takes one command.',
      'Then open {Freetvarr} in a browser, and setup does the rest.',
      'It finds TVHeadend, and locks it with a password.',
      'It scans for channels, and sets up a free, seven-day TV guide.',
      'You check what it finds, and press Next.',
    ],
  },
  {
    id: 'guide',
    chapter: 'TV guide and recording',
    lines: [
      'The TV guide shows the week ahead, with pictures.',
      'Press a programme to see what it is about.',
      'You can record one episode, or the whole series.',
      'From then on, every new episode records by itself.',
      'You can even have the ads taken out of your recordings.',
    ],
  },
  {
    id: 'home',
    chapter: 'Home and suggestions',
    lines: [
      'Home picks up where you left off.',
      'The next episode to watch, what is set to record tonight, and what is on now.',
      'And suggestions for the week ahead, worked out on your own computer, from what you watch.',
    ],
  },
  {
    id: 'library',
    chapter: 'Recordings and Plex',
    lines: [
      'Every recording goes into your media library, in a folder for each show and season.',
      'Each show gets its own page, with every episode, ready to play.',
      'If you use Plex, {Freetvarr} tells it about each new episode, so it shows up straight away.',
    ],
  },
  {
    id: 'tv',
    chapter: 'Watching on the TV',
    lines: [
      'On the TV, open your media player app, such as Plex or Infuse.',
      'Your recordings are there, with pause, rewind, and skip.',
      'On a phone, tablet, or laptop, {Freetvarr} plays live TV and recordings right in the browser.',
      'Even two channels at once.',
    ],
  },
  {
    id: 'fetchtv',
    chapter: 'Save your Fetch recordings',
    lines: [
      'Before you cancel Fetch, save your recordings.',
      'The free fetch T V tool copies them off the box, over your home network.',
      'It names each file the way your media library expects, so your old shows sit next to your new ones.',
      'Do it before the thirty-first. Once the box is suspended, you cannot copy them.',
    ],
  },
  {
    id: 'end',
    chapter: 'Get started',
    lines: [
      '{Freetvarr} is free, and open source.',
      'The Leaving Fetch TV guide walks you through every step, from the shopping list to cancelling.',
      'The links are in the description.',
    ],
  },
]

export const CAPTION_TEXT = (line) => line
  .replace(/\{Freetvarr\}/g, 'Freetvarr')
  .replace('fetch T V tool', 'fetchtv tool')

export const SSML_TEXT = (line) => line
  .replace(/\{Freetvarr\}/g, '<sub alias="Free TV R">Freetvarr</sub>')
  .replace('HDHomeRun', '<sub alias="H D Home Run">HDHomeRun</sub>')
  .replace(/TVHeadend/g, '<sub alias="T V Head End">TVHeadend</sub>')
  .replace('NAS', '<sub alias="naz">NAS</sub>')

export const RATE = {
  'need.3': '-7%', 'guide.1': '-7%', 'guide.4': '-9%', 'home.2': '-6%',
  'fetchtv.2': '-6%', 'fetchtv.3': '-6%', 'end.1': '-9%', 'end.2': '-6%',
}

export const SPOKEN_TEXT = (line) => line
  .replace(/\{Freetvarr\}/g, 'Free TV R')
  .replace('HDHomeRun', 'H D Home Run')
  .replace(/TVHeadend/g, 'T V Head End')
