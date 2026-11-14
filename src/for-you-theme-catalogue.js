export const THEME_CATALOGUE_VERSION = 2

export const themeCatalogueOf = ({ country = '' } = {}) => {
  const place = countryNameOf(country)
  const fill = (text) => text.replaceAll('{in}', place ? ` in ${place}` : '')
  return CATEGORIES.map((category) => ({
    ...category,
    title: category.key === LOCAL_LIFE ? localLifeTitleOf(place) : category.title,
    phrase: category.key === LOCAL_LIFE ? localLifePhraseOf(place) : category.phrase,
    subthemes: category.subthemes.map((subtheme) => ({
      ...subtheme,
      title: category.key === SPORT ? sportLabelOf({ code: subtheme.key, country }) : subtheme.title,
      prototypes: subtheme.prototypes.map(fill),
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

export const prototypeTextsOf = (catalogue) => catalogue.flatMap((category) => category.subthemes.flatMap((subtheme) => subtheme.prototypes))

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

const CATEGORIES = [
  {
    key: 'reality',
    title: 'Reality',
    phrase: 'reality',
    slot: 'format',
    row: 'category',
    kinds: FACTUAL,
    subthemes: [
      { key: 'reality-dating', title: 'Dating', prototypes: [
        'Singles go on blind dates hoping to find love.',
        'Strangers marry at first sight and test their relationships.',
        'Islanders couple up in a villa, and the public votes for their favourite couple.',
      ] },
      { key: 'reality-competition', title: 'Reality competitions', prototypes: [
        'Contestants compete in challenges and one is eliminated at the tribal council.',
        'Celebrities take on a jungle challenge in a reality show as the public votes.',
        'Couples compete to renovate houses, with judges scoring each room every week.',
      ] },
      { key: 'reality-life', title: 'Reality life', prototypes: [
        'Cameras follow a famous family through the drama of their everyday lives.',
        'Housemates live together under constant watch, and one is evicted each week.',
        'A reality series about a group of friends, their parties, feuds and break-ups.',
      ] },
    ],
  },
  {
    key: 'quiz',
    title: 'Quiz and game shows',
    phrase: 'quiz and game show',
    slot: 'format',
    row: 'category',
    kinds: FACTUAL,
    subthemes: [
      { key: 'quiz-trivia', title: 'Quiz shows', prototypes: [
        'Contestants answer trivia questions to win cash in a quiz show.',
        'Contestants try to beat the chaser in a general knowledge quiz.',
        'Teams answer questions on history, science and pop culture to win the quiz.',
      ] },
      { key: 'quiz-games', title: 'Game shows', prototypes: [
        'Players spin the wheel and solve puzzles in a game show for prizes.',
        'Contestants play games of luck and strategy to win the jackpot.',
        'Families compete in a game show, guessing the most popular answers.',
      ] },
    ],
  },
  {
    key: 'comedy',
    title: 'Comedy',
    phrase: 'comedy',
    slot: 'format',
    row: 'category',
    kinds: [...FICTION, 'factual'],
    subthemes: [
      { key: 'comedy-sitcom', title: 'Sitcoms', kinds: FICTION, prototypes: [
        'Sitcom about a family whose antics lead to hilarious misunderstandings.',
        'Comedy series about friends sharing an apartment and their dating mishaps.',
        'Workplace comedy about awkward coworkers in the office.',
      ] },
      { key: 'comedy-panel', title: 'Comedy panel shows', kinds: FACTUAL, prototypes: [
        'Comedians compete on a comedy panel show with jokes and banter.',
        'The host chats with celebrity guests on a late night talk show.',
        'A satirical comedy show takes aim at the week in politics and advertising.',
      ] },
      { key: 'comedy-stand-up', title: 'Stand-up', kinds: FACTUAL, prototypes: [
        'Stand-up comedy special from a comedy festival.',
        'Comedians perform their best stand-up routines to a live audience.',
        'A gala of the funniest comics on stage.',
      ] },
    ],
  },
  {
    key: 'drama',
    title: 'Drama',
    phrase: 'drama',
    slot: 'format',
    row: 'category',
    kinds: FICTION,
    subthemes: [
      { key: 'drama-family', title: 'Family drama', prototypes: [
        'Family secrets threaten to tear the family apart in this drama.',
        'Soap opera: she confronts him about the affair while the town gossips.',
        'A drama about relationships, love, betrayal and grief.',
      ] },
      { key: 'drama-period', title: 'Period drama', prototypes: [
        'Period drama: aristocrats and servants at a grand estate in the 1900s.',
        'A historical costume drama set in the nineteenth century.',
        'Romance and scandal in the royal court in the eighteenth century.',
      ] },
      { key: 'drama-fantasy', title: 'Sci-fi and fantasy', prototypes: [
        'A science fiction drama: a starship crew explores strange new worlds.',
        'An epic fantasy of kingdoms, dragons, magic and war.',
        'A supernatural thriller about a town where strange things happen.',
      ] },
      { key: 'drama-workplace', title: 'Medical and legal drama', prototypes: [
        'Doctors juggle patients and their own relationships in a hospital drama.',
        'Lawyers fight a high-stakes case in court in this legal drama.',
        'Firefighters and paramedics face danger on the job and trouble at home in this drama.',
      ] },
    ],
  },
  {
    key: 'crime-drama',
    title: 'Crime drama',
    phrase: 'crime drama',
    slot: 'format',
    row: 'category',
    kinds: FICTION,
    subthemes: [
      { key: 'crime-drama-procedural', title: 'Police procedurals', prototypes: [
        'Detectives investigate a murder and question suspects in this crime drama.',
        'Fictional police procedural: the team hunts a killer as the case takes a twist.',
        'Forensic investigators use evidence to solve a crime in this police series.',
      ] },
      { key: 'crime-drama-mystery', title: 'Mysteries', prototypes: [
        'A detective inspector solves a mystery in a quiet village.',
        'An amateur sleuth investigates a murder at a country house.',
        'A whodunit: one of the guests is a killer.',
      ] },
      { key: 'crime-drama-thriller', title: 'Thrillers', prototypes: [
        'A tense thriller about a spy hunting a traitor inside the agency.',
        'A gangster crime family fights for control of the city.',
        'A conspiracy thriller: a journalist uncovers a dangerous secret.',
      ] },
    ],
  },
  {
    key: 'cooking',
    title: 'Cooking',
    phrase: 'cooking',
    slot: 'topic',
    row: 'category',
    kinds: FACTUAL,
    subthemes: [
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
  },
  {
    key: 'home',
    title: 'Home and property',
    phrase: 'home and property',
    slot: 'topic',
    row: 'category',
    kinds: FACTUAL,
    subthemes: [
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
      { key: 'home-garden', title: 'Gardening', prototypes: [
        'Gardening experts show how to plant, prune and design a backyard garden.',
        'A garden makeover with new lawns, flower beds and outdoor living.',
        'Tips for growing vegetables, fruit trees and herbs at home.',
      ] },
    ],
  },
  {
    key: 'politics',
    title: 'Politics and current affairs',
    phrase: 'politics and current affairs',
    slot: 'topic',
    row: 'category',
    kinds: FACTUAL,
    subthemes: [
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
  },
  {
    key: 'true-crime',
    title: 'True crime',
    phrase: 'true crime',
    slot: 'topic',
    row: 'category',
    kinds: FACTUAL,
    subthemes: [
      { key: 'true-crime-cases', title: 'True crime', prototypes: [
        'The true story of a brutal murder and the detectives who tracked down the killer.',
        'Real-life crime investigation into a cold case, with interviews with police, witnesses and the families of victims.',
        'A convicted killer, a notorious serial murderer and the trial that shocked the nation.',
      ] },
    ],
  },
  {
    key: 'police-rescue',
    title: 'Police and rescue',
    phrase: 'police and rescue',
    slot: 'topic',
    row: 'category',
    kinds: FACTUAL,
    subthemes: [
      { key: 'police-patrol', title: 'Police', prototypes: [
        'Police officers respond to calls, make arrests and chase offenders on the streets.',
        'Highway patrol officers pull over speeding drivers and attend crashes.',
        'Customs and border officers search luggage and question travellers at the airport.',
      ] },
      { key: 'police-rescue-crews', title: 'Emergency and rescue', prototypes: [
        'Paramedics, firefighters and rescue crews race to save lives in emergencies.',
        'Lifeguards rescue swimmers caught in rips at a busy beach.',
        'Rescue helicopter crews fly injured people to hospital.',
      ] },
    ],
  },
  {
    key: 'nature',
    title: 'Nature and animals',
    phrase: 'nature and animal',
    slot: 'topic',
    row: 'category',
    kinds: FACTUAL,
    subthemes: [
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
  },
  {
    key: 'travel',
    title: 'Travel',
    phrase: 'travel',
    slot: 'topic',
    row: 'category',
    kinds: FACTUAL,
    subthemes: [
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
  },
  {
    key: 'history',
    title: 'History',
    phrase: 'history',
    slot: 'topic',
    row: 'category',
    kinds: FACTUAL,
    subthemes: [
      { key: 'history-war', title: 'War history', prototypes: [
        'The history of the Second World War, its battles, generals and soldiers.',
        'Veterans remember the battles of the First World War.',
        'Military historians tell the story of a famous battle.',
      ] },
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
  },
  {
    key: 'science',
    title: 'Science and health',
    phrase: 'science and health',
    slot: 'topic',
    row: 'category',
    kinds: FACTUAL,
    subthemes: [
      { key: 'science-space', title: 'Space and science', prototypes: [
        'Scientists explore space, planets, black holes and the universe.',
        'The science and engineering behind technology, inventions and discoveries.',
        'Experiments explain physics, chemistry, the human brain and the climate.',
      ] },
      { key: 'science-medical', title: 'Hospitals and health', prototypes: [
        'Doctors and nurses treat patients in the hospital emergency department.',
        'Surgeons perform life-saving surgery while patients and families wait.',
        'Health experts explain illness, diet, weight loss and how to live longer.',
      ] },
    ],
  },
  {
    key: LOCAL_LIFE,
    title: 'Local life',
    phrase: 'local life',
    slot: 'topic',
    row: 'category',
    kinds: FACTUAL,
    subthemes: [
      { key: 'local-life-stories', title: 'Local stories', prototypes: [
        'Inspiring stories of everyday people in towns and suburbs{in}.',
        'A documentary about ordinary families and their lives{in}.',
        'Local heroes, small businesses and community life{in}.',
      ] },
      { key: 'local-life-rural', title: 'Rural life', prototypes: [
        'Farmers work the land, harvest crops and muster cattle on their farm{in}.',
        'Life in country towns and regional communities{in}.',
        'Agriculture and rural news for farmers and primary producers{in}.',
      ] },
      { key: 'local-life-first-peoples', title: 'First peoples', prototypes: [
        'Indigenous people share their stories, languages and culture{in}.',
        'First peoples, their history, land and traditions{in}.',
        'Indigenous artists, elders and communities{in}.',
      ] },
    ],
  },
  {
    key: 'music-arts',
    title: 'Music and arts',
    phrase: 'music and arts',
    slot: 'topic',
    row: 'category',
    kinds: FACTUAL,
    subthemes: [
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
  },
  {
    key: LIFESTYLE,
    title: 'Lifestyle',
    phrase: 'lifestyle',
    slot: 'topic',
    row: 'subtheme',
    kinds: FACTUAL,
    subthemes: [
      { key: 'motoring', title: 'Motoring', prototypes: [
        'The hosts review new cars and test drive them on the road.',
        'Mechanics restore classic cars in the workshop.',
        'Truck drivers haul loads across dangerous roads.',
      ] },
      { key: 'fishing', title: 'Fishing', kinds: [...FACTUAL, 'sport'], prototypes: [
        'Anglers go fishing for trout, snapper and marlin.',
        'Fishing show with tips on catching fish from boats and beaches.',
        'A fishing adventure in remote rivers, lakes and seas.',
      ] },
      { key: 'antiques', title: 'Antiques', prototypes: [
        'Antique dealers hunt for collectables and haggle over prices.',
        'Pawn shop experts value rare items and make deals.',
        'Experts appraise family heirlooms and treasures.',
      ] },
      { key: 'fitness', title: 'Fitness', prototypes: [
        'A personal trainer leads a workout to get fit and strong.',
        'Yoga, pilates and exercise routines to do at home.',
        'Contestants lose weight with diet and exercise in a fitness challenge.',
      ] },
    ],
  },
  {
    key: SPORT,
    title: 'Sport',
    phrase: 'sport',
    slot: 'topic',
    row: 'sport',
    kinds: ['sport'],
    subthemes: [
      { key: 'afl', prototypes: [
        'AFL match: Australian rules football live.',
        'AFL footy talk with players, coaches and clubs.',
        'AFLW women\'s Australian rules football match.',
      ] },
      { key: 'rugby-league', prototypes: [
        'NRL rugby league match live.',
        'State of Origin rugby league.',
        'Rugby league World Cup match.',
      ] },
      { key: 'rugby-union', prototypes: [
        'Rugby union test match between two national teams.',
        'Super Rugby match live.',
        'Six Nations rugby union.',
      ] },
      { key: 'cricket', prototypes: [
        'Live cricket: a Test match between two nations.',
        'One day international and T20 cricket.',
        'Twenty20 cricket league match.',
      ] },
      { key: 'soccer', prototypes: [
        'Live football: a league soccer match.',
        'English Premier League soccer.',
        'National soccer teams play in a World Cup qualifier.',
      ] },
      { key: 'american-football', prototypes: [
        'NFL American football game live.',
        'College football game.',
        'The Super Bowl.',
      ] },
      { key: 'tennis', prototypes: [
        'Live tennis from a grand slam tournament.',
        'Wimbledon tennis championship.',
        'ATP and WTA tennis match.',
      ] },
      { key: 'motorsport', prototypes: [
        'Live touring car race.',
        'Formula 1 grand prix race.',
        'MotoGP motorcycle race.',
      ] },
      { key: 'horse-racing', prototypes: [
        'Live horse racing from the racecourse.',
        'Thoroughbred racing: the big cup race.',
        'Harness racing: trotters and pacers race at the track.',
      ] },
      { key: 'greyhound-racing', prototypes: [
        'Live greyhound racing from the track.',
        'Greyhound racing: the dogs chase the lure.',
        'A big night of greyhound racing.',
      ] },
      { key: 'rodeo', prototypes: [
        'Professional bull riding: cowboys ride bucking bulls.',
        'Rodeo: bull riding, bronc riding and barrel racing.',
        'Campdraft: riders work cattle on horseback.',
      ] },
      { key: 'golf', prototypes: [
        'Live golf from the PGA tour.',
        'Golf tournament final round.',
        'A major golf championship.',
      ] },
      { key: 'netball', prototypes: [
        'Live netball league match.',
        'Netball World Cup.',
        'Super Netball match.',
      ] },
      { key: 'basketball', prototypes: [
        'NBA basketball game live.',
        'National basketball league game.',
        'Basketball playoffs.',
      ] },
      { key: 'baseball', prototypes: [
        'MLB baseball game live.',
        'Baseball World Series.',
        'Baseball game: pitchers and home runs.',
      ] },
      { key: 'ice-hockey', prototypes: [
        'NHL ice hockey game live.',
        'Ice hockey playoffs.',
        'Hockey night: ice hockey game.',
      ] },
      { key: 'cycling', prototypes: [
        'Tour de France cycling stage.',
        'Road cycling race through the mountains.',
        'Track cycling championship.',
      ] },
      { key: 'combat-sports', prototypes: [
        'UFC mixed martial arts fight night.',
        'World title boxing bout.',
        'Kickboxing and bare knuckle fighting.',
      ] },
      { key: 'surfing', prototypes: [
        'WSL championship tour surfing event.',
        'Surfers ride big waves in a surfing contest.',
        'Surf league competition at the beach.',
      ] },
      { key: 'swimming', prototypes: [
        'Swimming championships: freestyle and relay finals.',
        'Swim GP racing in the pool.',
        'Diving championships from the pool.',
      ] },
      { key: 'other-sport', prototypes: [
        'Live sport: athletics, swimming and gymnastics.',
        'Sports news and highlights from the weekend.',
        'Olympic Games and Commonwealth Games events.',
      ] },
    ],
  },
  {
    key: NEWS,
    title: 'News',
    phrase: 'news',
    slot: 'topic',
    row: 'none',
    kinds: FACTUAL,
    subthemes: [
      { key: 'news-bulletins', title: 'News', prototypes: [
        'The latest news headlines from home and around the world, with sport and weather.',
        'Breaking news, national and international stories.',
        'Morning news program with headlines, finance and weather updates.',
      ] },
    ],
  },
  {
    key: KIDS,
    title: 'Kids',
    phrase: 'kids',
    slot: 'topic',
    row: 'none',
    kinds: ['kids'],
    subthemes: [
      { key: 'kids-shows', title: 'Kids', prototypes: [
        'Animated cartoon for preschoolers about friends who learn and play together.',
        'Children\'s series where kids go on fun adventures.',
        'Cartoon adventures with talking animals for children.',
      ] },
    ],
  },
  {
    key: 'shopping',
    title: 'Shopping',
    phrase: 'shopping',
    slot: 'topic',
    row: 'none',
    kinds: FACTUAL,
    subthemes: [
      { key: 'shopping-offers', title: 'Shopping', prototypes: [
        'Shopping channel presents products for sale with special offers; call now to order.',
        'Infomercial: buy this product today at a low price.',
        'Hosts present beauty, fashion and kitchen products to buy.',
      ] },
    ],
  },
  {
    key: 'religion',
    title: 'Religion',
    phrase: 'religion',
    slot: 'topic',
    row: 'none',
    kinds: FACTUAL,
    subthemes: [
      { key: 'religion-faith', title: 'Religion', prototypes: [
        'Church service with hymns, prayer and a sermon.',
        'Faith and spiritual teaching from the Bible.',
        'Religious program about God, belief and worship.',
      ] },
    ],
  },
]
