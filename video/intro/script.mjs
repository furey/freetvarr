import { SCENES as OVERVIEW } from '../overview/script.mjs'

export { VOICE, ELEVEN, CAPTION_TEXT, SSML_TEXT, RATE, SPOKEN_TEXT } from '../overview/script.mjs'

const SHARED = ['title', 'need', 'setup', 'guide', 'home', 'library', 'tv']

export const SCENES = [
  {
    id: 'pitch',
    chapter: 'Intro',
    lines: [
      'Free-to-air TV, recorded at home, and ready to watch on any screen.',
      'No subscription, hardware you own, and the ad breaks taken out if you want.',
    ],
  },
  ...OVERVIEW.filter((scene) => SHARED.includes(scene.id)),
  {
    id: 'outro',
    chapter: 'Get started',
    lines: [
      '{Freetvarr} is free, and open source.',
      'The guide walks you through every step, from the shopping list to your first recording.',
      'The links are in the description.',
    ],
  },
]
