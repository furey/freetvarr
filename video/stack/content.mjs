export const CHANNELS = [
  { id: 'coastline.demo', name: 'Coastline', number: 3, clip: 'surf' },
  { id: 'harbour.demo', name: 'Harbour', number: 5, clip: 1666 },
  { id: 'southern.demo', name: 'Southern', number: 6, clip: 4276 },
  { id: 'nightline.demo', name: 'Nightline', number: 8, clip: 1675 },
  { id: 'ridgeline.demo', name: 'Ridgeline', number: 10, clip: 4115 },
  { id: 'bayside.demo', name: 'Bayside', number: 11, clip: 4207 },
  { id: 'greenhouse.demo', name: 'Greenhouse', number: 12, clip: 1891 },
  { id: 'courtside.demo', name: 'Courtside', number: 13, clip: 1216 },
]

export const SHOWS = {
  'Big Wave Season': {
    images: ['surf-a', 'surf-b', 'surf-c', 'surf-d'], category: 'Sport', season: 3,
    lines: [
      'The crew chase a winter swell down the south coast.',
      'A dawn session turns into the biggest day of the year.',
      'Two old rivals share one reef break.',
      'The season finale waits on a storm that may never come.',
    ],
  },
  'Tide Watch': {
    images: [1045, 1090], category: 'Documentary', season: 1,
    lines: ['How one beach changes shape in a single week.', 'Rock pools at the lowest tide of the year.'],
  },
  'Kitchen Heat': {
    images: [1666, 1522], category: 'Cooking', season: 5,
    lines: [
      'Home cooks race the clock with a wood-fired oven.',
      'One market basket, three courses, ninety minutes.',
      'The judges ask for comfort food with a twist.',
    ],
  },
  'Brew Day': {
    images: [1405, 1414], category: 'Lifestyle', season: 2,
    lines: ['A small-town brewer tries a new summer recipe.', 'Roasting coffee in a garden shed.'],
  },
  'Wild Neighbours': {
    images: [4276, 1468, 1477], category: 'Documentary', season: 2,
    lines: [
      'The insects that keep a suburban garden alive.',
      'A lizard claims the warmest rock in the yard.',
      'What lives under the house after dark.',
    ],
  },
  'Reef Diaries': {
    images: [4092], category: 'Documentary', season: 1,
    lines: ['A diver returns to the same reef every month for a year.'],
  },
  'City After Dark': {
    images: [1675, 4023], category: 'Documentary', season: 1,
    lines: ['The people who keep a city running overnight.', 'One street, from midnight to sunrise.'],
  },
  'Nightline News': {
    images: [1594], category: 'News', season: null,
    lines: ['The day\'s news, weather, and sport.'],
  },
  'Mountain Rangers': {
    images: [4115, 4138], category: 'Documentary', season: 4,
    lines: ['Rangers close a high trail before the first snow.', 'A search in fading light.'],
  },
  'Desert Blooms': {
    images: [4230, 4322], category: 'Documentary', season: 1,
    lines: ['Rain falls on the desert for the first time in years.', 'The waterfalls that only run in spring.'],
  },
  'Road Trip Rules': {
    images: [4368, 4161], category: 'Travel', season: 2,
    lines: ['Three friends, one hatchback, and no plan.', 'A slow week in an old hill town.'],
  },
  'The Slow Commute': {
    images: [4207, 4000], category: 'Lifestyle', season: 1,
    lines: ['Is there a better way to get to work?', 'Trading the car for a ferry for a month.'],
  },
  'The Weekend Garden': {
    images: [1891, 4483], category: 'Lifestyle', season: 6,
    lines: [
      'Planting bulbs now for colour in spring.',
      'A small balcony becomes a cut-flower garden.',
      'Roses: pruning, feeding, and patience.',
    ],
  },
  'Backyard Rescue': {
    images: [4069], category: 'Lifestyle', season: 3,
    lines: ['A family takes on a backyard nobody has touched in twenty years.'],
  },
  'Courtside': {
    images: [1216], category: 'Sport', season: null,
    lines: ['Live coverage of the state basketball league.'],
  },
  'Morning Stretch': {
    images: [4828], category: 'Lifestyle', season: 1,
    lines: ['Twenty gentle minutes to start the day.'],
  },
}

export const FILMS = {
  'Lighthouse at Dusk': { image: 1567, year: 2021, line: 'A keeper and her daughter wait out one last storm on a remote headland.' },
  'The Long Paddock': { image: 1604, year: 2019, line: 'Two drovers move a mob of cattle across a drought-struck plain.' },
}

export const LINEUP = {
  'coastline.demo': ['Morning Stretch', 'Tide Watch', 'Big Wave Season', 'Big Wave Season', 'Tide Watch', 'Lighthouse at Dusk'],
  'harbour.demo': ['Kitchen Heat', 'Brew Day', 'Kitchen Heat', 'Kitchen Heat', 'Brew Day'],
  'southern.demo': ['Wild Neighbours', 'Reef Diaries', 'Wild Neighbours', 'Desert Blooms'],
  'nightline.demo': ['Nightline News', 'City After Dark', 'City After Dark', 'Nightline News', 'The Long Paddock'],
  'ridgeline.demo': ['Mountain Rangers', 'Desert Blooms', 'Mountain Rangers', 'Road Trip Rules'],
  'bayside.demo': ['The Slow Commute', 'Road Trip Rules', 'The Slow Commute', 'Road Trip Rules'],
  'greenhouse.demo': ['The Weekend Garden', 'Backyard Rescue', 'The Weekend Garden', 'Backyard Rescue'],
  'courtside.demo': ['Courtside', 'Courtside', 'Morning Stretch', 'Courtside'],
}

export const imageIds = () => [
  ...new Set([
    ...Object.values(SHOWS).flatMap((s) => s.images),
    ...Object.values(FILMS).map((f) => f.image),
  ]),
]
