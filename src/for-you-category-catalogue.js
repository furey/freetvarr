export const CATEGORY_CATALOGUE_VERSION = 3

export const categoryCatalogueOf = ({ country = '' } = {}) => {
  const place = countryNameOf(country)
  const fill = (text) => text.replaceAll('{in}', place ? ` in ${place}` : '')
  return CATALOGUE.map((category) => ({
    ...category,
    title: category.key === LOCAL_LIFE ? localLifeTitleOf(place) : category.title,
    phrase: category.key === LOCAL_LIFE ? localLifePhraseOf(place) : category.phrase,
    facets: category.facets.map((facet) => ({
      ...facet,
      title: category.key === SPORT ? sportLabelOf({ code: facet.key, country }) : facet.title,
      prototypes: facet.prototypes.map(fill),
    })),
  }))
}

export const countryNameOf = (country) => {
  const code = REGION_CODES[country] || String(country || '').toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return ''
  const name = regionNames()?.of(code)
  if (!name || name === code) return ''
  const plain = name.replace(/\s+SAR China$/, '')
  return WITH_THE.has(code) ? `the ${plain}` : plain
}

export const localLifeTitleOf = (place) => (place ? `Life in ${place}` : 'Local life')

const localLifePhraseOf = (place) => (place ? `life in ${place}` : 'local life')

export const sportLabelOf = ({ code, country = '' }) => {
  const labels = SPORT_LABELS[code]
  if (!labels) return 'Sport'
  return labels[country] ?? labels.default
}

export const prototypeTextsOf = (catalogue) => catalogue.flatMap((category) => category.facets.flatMap((facet) => facet.prototypes))

export const LOCAL_LIFE = 'local-life'
export const SPORT = 'sport'
export const LIFESTYLE = 'lifestyle'
export const NEWS = 'news'
export const KIDS = 'kids'

const regionNames = () => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' })
  } catch {
    return null
  }
}

const REGION_CODES = { uk: 'GB' }

const WITH_THE = new Set(['GB', 'US', 'NL', 'PH', 'AE', 'BS', 'CD', 'CF', 'CG', 'DO', 'GM', 'KM', 'KY', 'MH', 'MV', 'SB', 'VA'])

const SPORT_LABELS = {
  afl: { default: 'Australian rules' },
  'rugby-league': { default: 'Rugby league' },
  'rugby-union': { default: 'Rugby union' },
  soccer: { au: 'Football (soccer)', us: 'Soccer', ca: 'Soccer', default: 'Football' },
  'american-football': { us: 'Football', ca: 'Football', default: 'American football' },
  cricket: { default: 'Cricket' },
  tennis: { default: 'Tennis' },
  motorsport: { default: 'Motorsport' },
  'horse-racing': { default: 'Horse racing' },
  'greyhound-racing': { default: 'Greyhound racing' },
  rodeo: { default: 'Rodeo' },
  golf: { default: 'Golf' },
  netball: { default: 'Netball' },
  basketball: { default: 'Basketball' },
  baseball: { default: 'Baseball' },
  'ice-hockey': { default: 'Ice hockey' },
  cycling: { default: 'Cycling' },
  'combat-sports': { default: 'Combat sports' },
  surfing: { default: 'Surfing' },
  swimming: { default: 'Swimming' },
  'other-sport': { default: 'Sport' },
}

const FACTUAL = ['factual', 'unknown']
const FICTION = ['fiction', 'unknown']

const format = ({ key, title, phrase = title.toLowerCase(), row = 'category', kinds, facets }) => ({ key, title, phrase, slot: 'format', row, kinds, facets })

const topic = ({ key, title, phrase = title.toLowerCase(), row = 'category', kinds = FACTUAL, facets }) => ({ key, title, phrase, slot: 'topic', row, kinds, facets })

const ruleFacet = (key, title) => ({ key, title, prototypes: [] })

const CATALOGUE = [
  format({
    key: 'reality',
    title: 'Reality',
    kinds: FACTUAL,
    facets: [ruleFacet('reality-dating', 'Dating'), ruleFacet('reality-competition', 'Reality competitions'), ruleFacet('reality-life', 'Reality life')],
  }),
  format({
    key: 'quiz',
    title: 'Quiz and game shows',
    phrase: 'quiz and game show',
    kinds: FACTUAL,
    facets: [ruleFacet('quiz-trivia', 'Quiz shows'), ruleFacet('quiz-games', 'Game shows')],
  }),
  format({
    key: 'comedy',
    title: 'Comedy',
    kinds: [...FICTION, 'factual'],
    facets: [ruleFacet('comedy-sitcom', 'Sitcoms'), ruleFacet('comedy-panel', 'Comedy panel shows'), ruleFacet('comedy-stand-up', 'Stand-up')],
  }),
  format({
    key: 'drama',
    title: 'Drama',
    kinds: FICTION,
    facets: [ruleFacet('drama-family', 'Family drama'), ruleFacet('drama-period', 'Period drama'), ruleFacet('drama-fantasy', 'Sci-fi and fantasy'), ruleFacet('drama-workplace', 'Medical and legal drama')],
  }),
  format({
    key: 'crime-drama',
    title: 'Crime drama',
    kinds: FICTION,
    facets: [ruleFacet('crime-drama-procedural', 'Police procedurals'), ruleFacet('crime-drama-mystery', 'Mysteries'), ruleFacet('crime-drama-thriller', 'Thrillers')],
  }),
  format({
    key: 'documentaries',
    title: 'Documentaries',
    phrase: 'documentary',
    kinds: FACTUAL,
    facets: [ruleFacet('documentaries', 'Documentaries')],
  }),
  format({
    key: 'talk-shows',
    title: 'Talk shows',
    phrase: 'talk show',
    kinds: FACTUAL,
    facets: [ruleFacet('talk-shows', 'Talk shows')],
  }),
  format({
    key: KIDS,
    title: 'Kids',
    row: 'none',
    kinds: ['kids'],
    facets: [ruleFacet('kids-shows', 'Kids')],
  }),
  format({
    key: NEWS,
    title: 'News',
    row: 'none',
    kinds: FACTUAL,
    facets: [ruleFacet('news-bulletins', 'News')],
  }),
  topic({
    key: 'cooking',
    title: 'Cooking',
    facets: [
      { key: 'cooking-competition', title: 'Cooking competitions', prototypes: [
        'Amateur cooks race the clock to cook a dish, and the judges taste the food.',
        'Chefs compete in a cooking challenge, plating up their best dishes for the judges.',
        'Bakers bake cakes, pies and pastries in a baking competition.',
      ] },
      { key: 'cooking-recipes', title: 'Recipes and home cooking', prototypes: [
        'The chef shares easy recipes for a delicious dinner cooked in the kitchen.',
        'Cooking show with seasonal produce, ingredients and dishes to make at home.',
        'A cook prepares traditional dishes and desserts, step by step.',
      ] },
      { key: 'cooking-food-culture', title: 'Food and producers', prototypes: [
        'A chef travels to meet farmers, fishers and producers, and cooks with local ingredients.',
        'The story of a famous restaurant and the chefs in its busy kitchen.',
        'A food lover explores street food, markets and family recipes.',
      ] },
    ],
  }),
  topic({
    key: 'home',
    title: 'Home and property',
    facets: [
      { key: 'home-renovation', title: 'Renovation', prototypes: [
        'Couples renovate rooms of their house, battling budgets and deadlines with builders and tradespeople.',
        'A rundown home gets a makeover with new kitchen, bathroom and interior design.',
        'Builders transform an old barn into a stunning modern home.',
        'Teams renovate apartments room by room, and the judges score each finished room.',
      ] },
      { key: 'home-property', title: 'Property', prototypes: [
        'House hunters search for their dream home with the help of real estate agents.',
        'Buyers bid at a property auction while sellers hope for a record price.',
        'Couples decide whether to love it or list it, choosing between houses on the market.',
      ] },
    ],
  }),
  topic({
    key: 'gardening',
    title: 'Gardening',
    facets: [
      { key: 'gardening', title: 'Gardening', prototypes: [
        'Gardening experts show how to plant, prune and design a backyard garden.',
        'A garden makeover with new lawns, flower beds and outdoor living.',
        'Tips for growing vegetables, fruit trees and herbs at home.',
      ] },
    ],
  }),
  topic({
    key: 'politics',
    title: 'Politics and current affairs',
    facets: [
      { key: 'politics-elections', title: 'Politics', prototypes: [
        'Politicians debate policy in parliament as the government faces pressure ahead of the election.',
        'An investigation into the election campaign, voters, the prime minister and the opposition leader.',
        'Political analysis of presidents, parliaments and world leaders.',
      ] },
      { key: 'politics-current-affairs', title: 'Current affairs', prototypes: [
        'Current affairs program with interviews and reports on the issues making news this week.',
        'Investigative journalists expose corruption and wrongdoing in a hard-hitting report.',
        'A panel of journalists discusses the big stories of the week.',
      ] },
    ],
  }),
  topic({
    key: 'true-crime',
    title: 'True crime',
    facets: [
      { key: 'true-crime-cases', title: 'True crime', prototypes: [
        'The true story of a brutal murder and the detectives who tracked down the killer.',
        'Real-life crime investigation into a cold case, with interviews with police, witnesses and the families of victims.',
        'A convicted killer, a notorious serial murderer and the trial that shocked the nation.',
      ] },
    ],
  }),
  topic({
    key: 'police-rescue',
    title: 'Police and rescue',
    facets: [
      { key: 'police-patrol', title: 'Police', prototypes: [
        'Police officers respond to calls, make arrests and chase offenders on the streets.',
        'Highway patrol officers pull over speeding drivers and attend crashes.',
        'Customs and border officers search luggage and question travellers at the airport.',
      ] },
      { key: 'police-rescue-crews', title: 'Fire and rescue', prototypes: [
        'Firefighters and rescue crews race to save people trapped by fire and floods.',
        'Lifeguards rescue swimmers caught in rips at a busy beach.',
        'Search and rescue crews look for lost hikers in the mountains.',
      ] },
    ],
  }),
  topic({
    key: 'medical',
    title: 'Medical',
    facets: [
      { key: 'medical', title: 'Medical', prototypes: [
        'Doctors and nurses treat patients in the hospital emergency department.',
        'Surgeons perform life-saving surgery while patients and families wait.',
        'Paramedics treat trauma patients and rush them to hospital.',
      ] },
    ],
  }),
  topic({
    key: 'health-and-lifestyle',
    title: 'Health and lifestyle',
    facets: [
      { key: 'health-and-lifestyle', title: 'Health and lifestyle', prototypes: [
        'Health experts explain diet, sleep, weight loss and how to live longer.',
        'A personal trainer leads a workout to get fit and strong.',
        'A wellbeing program with tips on mental health, relationships and self-care.',
      ] },
    ],
  }),
  topic({
    key: 'science-and-technology',
    title: 'Science and technology',
    facets: [
      { key: 'science-space', title: 'Space and science', prototypes: [
        'Scientists explore space, planets, black holes and the universe.',
        'Experiments explain physics, chemistry, the human brain and the climate.',
        'Scientists study volcanoes, earthquakes and the forces that shape the planet.',
      ] },
      { key: 'science-technology', title: 'Technology', prototypes: [
        'The science behind technology, inventions and discoveries.',
        'Experts test new gadgets, computers, robots and artificial intelligence.',
        'Inventors build machines and test ideas with experiments.',
      ] },
    ],
  }),
  topic({
    key: 'nature',
    title: 'Nature and animals',
    phrase: 'nature and animal',
    facets: [
      { key: 'nature-wildlife', title: 'Wildlife', prototypes: [
        'Wild animals hunt and survive in the savannah, oceans and rainforests.',
        'A nature documentary about predators, birds, insects and marine life.',
        'Scientists work to protect endangered species and their natural habitat.',
      ] },
      { key: 'nature-pets-vets', title: 'Pets and vets', prototypes: [
        'Vets treat sick and injured pets, dogs and cats at the animal hospital.',
        'Zookeepers and vets care for animals at the zoo.',
        'Animal rescue officers save neglected animals and find them new homes.',
      ] },
    ],
  }),
  topic({
    key: 'travel',
    title: 'Travel',
    facets: [
      { key: 'travel-destinations', title: 'Holidays and destinations', prototypes: [
        'The host travels through Italy, exploring towns, markets, local food and culture.',
        'A journey to holiday destinations, beaches, cities and hotels around the world.',
        'Travel tips for the best places to stay, eat and visit on your next holiday.',
      ] },
      { key: 'travel-journeys', title: 'Journeys', prototypes: [
        'Travellers explore remote landscapes and meet local people on a road trip.',
        'A great railway journey across the country by train.',
        'An adventurer travels on foot and by boat through wild places.',
      ] },
    ],
  }),
  topic({
    key: 'history',
    title: 'History',
    facets: [
      { key: 'history-ancient', title: 'Ancient history', prototypes: [
        'Historians explore ancient civilisations, pyramids, castles and lost cities.',
        'Archaeologists dig up the secrets of an ancient empire.',
        'The rise and fall of the Roman Empire.',
      ] },
      { key: 'history-royals', title: 'Royals and famous lives', prototypes: [
        'The story of kings, queens and the royal family through the centuries.',
        'A biography of a famous leader and the events that shaped their life.',
        'The untold story behind a famous historical event.',
      ] },
    ],
  }),
  topic({
    key: 'military-and-war',
    title: 'Military and war',
    facets: [
      { key: 'military-and-war', title: 'Military and war', prototypes: [
        'The history of the Second World War, its battles, generals and soldiers.',
        'Veterans remember the battles of the First World War.',
        'Soldiers, sailors and pilots train for combat on warships, tanks and fighter jets.',
      ] },
    ],
  }),
  topic({
    key: LOCAL_LIFE,
    title: 'Local life',
    facets: [
      { key: 'local-life-stories', title: 'Local stories', prototypes: [
        'Everyday people tell their own stories of family, work and community{in}.',
        'A documentary about ordinary families and how they live{in}.',
      ] },
      { key: 'local-life-rural', title: 'Rural life', prototypes: [
        'Farmers work the land, harvest crops and muster cattle on their farm{in}.',
        'Life in country towns and remote communities{in}.',
      ] },
    ],
  }),
  topic({
    key: 'music-arts',
    title: 'Music and arts',
    facets: [
      { key: 'music-live', title: 'Music', prototypes: [
        'Live concert performance by singers and bands.',
        'Music documentary about a legendary rock band and their hits.',
        'Music video countdown of the latest hits.',
      ] },
      { key: 'music-arts', title: 'Arts', prototypes: [
        'Artists, writers and performers talk about their work.',
        'A documentary about painting, sculpture and great works of art.',
        'Ballet, opera and theatre performances on stage.',
      ] },
    ],
  }),
  topic({
    key: 'entertainment-news',
    title: 'Entertainment news',
    facets: [
      { key: 'entertainment-news', title: 'Entertainment news', prototypes: [
        'Celebrity news and gossip from Hollywood, with red carpet interviews.',
        'The latest entertainment headlines about film stars, music and television.',
        'Interviews with the stars of new films and television shows.',
      ] },
    ],
  }),
  topic({
    key: 'mystery-and-paranormal',
    title: 'Mystery and paranormal',
    facets: [
      { key: 'mystery-and-paranormal', title: 'Mystery and paranormal', prototypes: [
        'Investigators search a haunted house for ghosts and paranormal activity.',
        'Unexplained mysteries, UFO sightings and strange phenomena.',
        'A psychic medium connects people with loved ones who have died.',
      ] },
    ],
  }),
  topic({
    key: 'engineering-and-machines',
    title: 'Engineering and machines',
    facets: [
      { key: 'engineering-and-machines', title: 'Engineering and machines', prototypes: [
        'Engineers build giant bridges, skyscrapers, tunnels and dams.',
        'The biggest ships, planes, trains and machines in the world, and how they work.',
        'Why great structures failed: an investigation into engineering disasters.',
      ] },
    ],
  }),
  topic({
    key: 'business-and-money',
    title: 'Business and money',
    facets: [
      { key: 'business-and-money', title: 'Business and money', prototypes: [
        'Entrepreneurs pitch their business ideas to investors for money.',
        'Small business owners share how they built their companies.',
        'Advice on saving, investing, the share market and personal finance.',
      ] },
    ],
  }),
  topic({
    key: LIFESTYLE,
    title: 'Lifestyle',
    row: 'facet',
    facets: [
      { key: 'motoring', title: 'Motoring', prototypes: [
        'The hosts review new cars and test drive them on the road.',
        'Mechanics restore classic cars in the workshop.',
        'Car enthusiasts buy, fix up and sell used cars.',
      ] },
      { key: 'fishing', title: 'Fishing', kinds: [...FACTUAL, 'sport'], prototypes: [] },
      { key: 'antiques', title: 'Antiques', prototypes: [
        'Antique dealers hunt for collectables and haggle over prices.',
        'Pawn shop experts value rare items and make deals.',
        'Experts appraise family heirlooms and treasures.',
      ] },
    ],
  }),
  topic({
    key: SPORT,
    title: 'Sport',
    row: 'sport',
    kinds: ['sport'],
    facets: Object.keys(SPORT_LABELS).map((code) => ({ key: code, prototypes: [] })),
  }),
  topic({
    key: 'shopping',
    title: 'Shopping',
    row: 'none',
    facets: [ruleFacet('shopping-offers', 'Shopping')],
  }),
  topic({
    key: 'religion',
    title: 'Religion',
    row: 'none',
    facets: [
      { key: 'religion-faith', title: 'Religion', prototypes: [
        'Church service with hymns, prayer and a sermon.',
        'Faith and spiritual teaching from the Bible.',
        'Religious program about God, belief and worship.',
      ] },
    ],
  }),
]
