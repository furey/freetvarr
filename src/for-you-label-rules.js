export const guideGenreKeysOf = (guideGenres = []) => [...new Set([...guideGenres]
  .flatMap((genre) => String(genre).toLowerCase().replaceAll('&amp;', '&').split('/'))
  .map((genre) => genre.replace(/\s+/g, ' ').trim())
  .filter(Boolean))]

export const genreLabelsOf = ({ kind, tvmazeType = null, tvmazeGenres = [], wikidataGenres = [] }) => {
  const tvmaze = new Set(tvmazeGenres)
  const wikidata = wikidataGenres.map((genre) => String(genre).toLowerCase())
  const hasWikidata = (pattern) => wikidata.some((genre) => pattern.test(genre))
  return {
    format: genreFormatOf({ kind, tvmazeType, tvmaze, hasWikidata }),
    topics: kind === 'fiction' ? [] : uniqueOf([
      ...TVMAZE_TOPICS.filter(([genre]) => tvmaze.has(genre)).map(([, topic]) => topic),
      ...WIKIDATA_TOPICS.filter(([pattern]) => hasWikidata(pattern)).map(([, topic]) => topic),
      ...(tvmazeType === 'Award Show' ? ['music-arts'] : []),
      ...(kind === 'factual' && tvmaze.has('Crime') ? ['true-crime'] : []),
    ]),
  }
}

export const ruleLabelsOf = ({ kind, title = '', genreTags = [], guideGenres = [], genre = null, country = '' }) => {
  const text = String(title || '')
  const tags = new Set(genreTags)
  const guide = new Set(guideGenreKeysOf(guideGenres))
  const nibble = byteLabelOf({ genre, country })
  const factual = kind !== 'fiction'
  return {
    format: ruleFormatOf({ kind, text, tags, guide, nibble }),
    formatFacet: realityFacetOf(text),
    titleTopics: factual ? TOPIC_KEYWORDS.filter(([, pattern]) => pattern.test(text)).map(([topic]) => topic) : [],
    guideTopics: factual ? uniqueOf([
      ...GUIDE_TOPICS.filter(([names]) => names.some((name) => guide.has(name))).map(([, topic]) => topic),
      ...(nibble.topic ? [nibble.topic] : []),
    ]) : [],
  }
}

export const hasStrongDocumentaryEvidence = ({ wikidataGenres = [], guideGenres = [], genre = null, country = '' }) => wikidataGenres.some((name) => /documentary/i.test(name))
  || guideGenreKeysOf(guideGenres).some((name) => DOCUMENTARY_GUIDE.has(name))
  || byteLabelOf({ genre, country }).format === 'documentaries'

export const byteLabelOf = ({ genre, country = '' }) => {
  const code = Number(genre)
  if (!Number.isInteger(code) || code <= 0) return {}
  if (code === ETSI_DOCUMENTARY) return { format: 'documentaries' }
  const group = code >> 4
  if (country === 'au' && AU_ONLY_GROUPS[group]) return AU_ONLY_GROUPS[group]
  return BYTE_GROUPS[group] ?? {}
}

export const realityFacetOf = (title) => (DATING.test(String(title || '')) ? 'reality-dating' : null)

export const isLiveEventTitle = (title) => LIVE_EVENT.test(String(title || ''))

export const isFishingTitle = (title) => FISHING.test(String(title || ''))

const genreFormatOf = ({ kind, tvmazeType, tvmaze, hasWikidata }) => {
  if (kind === 'kids') return 'kids'
  if (kind === 'fiction') return fictionFormatOf({ tvmaze, hasWikidata })
  if (tvmaze.has('Comedy') || hasWikidata(/sitcom|comedy|satir/)) return 'comedy'
  if (TVMAZE_FORMATS[tvmazeType]) return TVMAZE_FORMATS[tvmazeType]
  return WIKIDATA_FORMATS.find(([pattern]) => hasWikidata(pattern))?.[1] ?? null
}

const fictionFormatOf = ({ tvmaze, hasWikidata }) => {
  if (CRIME_GENRES.some((genre) => tvmaze.has(genre)) || hasWikidata(/crime|detective|police procedural/)) return 'crime-drama'
  if (tvmaze.has('Comedy') || hasWikidata(/sitcom|comedy/)) return 'comedy'
  if (tvmaze.size || hasWikidata(/drama|soap opera|telenovela/)) return 'drama'
  return null
}

const ruleFormatOf = ({ kind, text, tags, guide, nibble }) => {
  if (kind === 'kids') return 'kids'
  if (kind === 'fiction' || kind === 'unknown') {
    if (tags.has('crime')) return kind === 'fiction' ? 'crime-drama' : null
    if (tags.has('comedy') && kind === 'fiction') return 'comedy'
    if ((tags.has('drama') || tags.has('sci-fi')) && kind === 'fiction') return 'drama'
  }
  if (kind === 'fiction') return fictionRuleFormatOf({ text, guide, nibble })
  if (TALK_SHOW.test(text) || guide.has('talk') || guide.has('talk show')) return 'talk-shows'
  if (QUIZ.test(text) || tags.has('quiz')) return 'quiz'
  if (FACTUAL_COMEDY.test(text)) return 'comedy'
  if (DATING.test(text) || REALITY.test(text) || tags.has('reality') || REALITY_GUIDE.some((name) => guide.has(name))) return 'reality'
  if ((tags.has('news') || guide.has('news')) && !CURRENT_AFFAIRS.test(text)) return 'news'
  return null
}

const fictionRuleFormatOf = ({ text, guide, nibble }) => {
  if (CRIME_TITLE.test(text)) return 'crime-drama'
  if (nibble.format === 'comedy' || guide.has('comedy')) return 'comedy'
  if (nibble.format === 'drama' || FICTION_GUIDE.some((name) => guide.has(name))) return 'drama'
  return null
}

const uniqueOf = (list) => [...new Set(list)]

const TVMAZE_FORMATS = {
  Reality: 'reality',
  'Game Show': 'quiz',
  'Panel Show': 'comedy',
  'Talk Show': 'talk-shows',
  News: 'news',
}

const CRIME_GENRES = ['Crime', 'Legal', 'Espionage']

const TVMAZE_TOPICS = [
  ['Supernatural', 'mystery-and-paranormal'],
  ['Food', 'cooking'],
  ['DIY', 'home'],
  ['Nature', 'nature'],
  ['Travel', 'travel'],
  ['Medical', 'medical'],
  ['Music', 'music-arts'],
  ['History', 'history'],
]

const WIKIDATA_FORMATS = [
  [/game show|quiz|panel game/, 'quiz'],
  [/talk show/, 'talk-shows'],
  [/reality/, 'reality'],
  [/news program/, 'news'],
]

const WIKIDATA_TOPICS = [
  [/cooking|food/, 'cooking'],
  [/current affairs|political/, 'politics'],
  [/true crime/, 'true-crime'],
  [/nature|wildlife/, 'nature'],
  [/travel/, 'travel'],
  [/^(?!.*fiction).*histor/, 'history'],
  [/war film|war television|military/, 'military-and-war'],
  [/music|concert/, 'music-arts'],
  [/^(?!.*fiction).*science/, 'science-and-technology'],
  [/paranormal|supernatural/, 'mystery-and-paranormal'],
  [/medical/, 'medical'],
]

const FISHING = /\b((i|spear)?fish(ing|'n)?|angl(er|ers|ing)|tackle)\b/i

const TOPIC_KEYWORDS = [
  ['home', /\b(renovat\w*|reno|the block|house rules|grand designs|property|real estate|dream homes?|house hunt\w*|holiday homes|open homes|homes|houses|house wars|builds?|building|builders|flip(ping|s)?|chateau|listing|renters|superhomes|fixer|amazing spaces|architecture|country house|ugliest house|escape to the country|bargain (block|mansions))\b/i],
  ['cooking', /\b(kitchens?|cook\w*|chefs?|recipes?|bak(e|er|ers|ing)|masterchef|food|gourmet|flavour|feast|eat(ing)?|snack\w*|dinner)\b/i],
  ['gardening', /\bgarden(s|ing|ers)?\b/i],
  ['religion', /\b(church|ministr(y|ies)|mass|praise|gospel|bible|sermon|worship|prophecy|christian|catholic)\b/i],
  ['police-rescue', /\b(police|cops|highway patrol|border security|border force|coastwatch|lifeguards?|rescue|rbt|custody|firefighters?)\b/i],
  ['medical', /\b(emergency|hospital|surgery|surgeons?|paramedics?|medical|doctors|nurses|botched|pimple popper|ambulance|a&e)\b/i],
  ['nature', /\b(vets?|zoo|wildlife|animals?|pets?|safari|wild isles|planet earth|sharks?(?! tank)|crocs?|crocodiles?|dogs|attenborough|bushwhacked)\b/i],
  ['history', /\b(history|histories|historic|historical|ancient|empire|byzantium|vikings?|royals?|world war|ww(1|2|i|ii)|superstructures|temple|unearthed)\b/i],
  ['military-and-war', /\b(world war|ww(1|2|i|ii)|army|navy|military|soldiers|das boot|u-boat|warships?)\b/i],
  ['travel', /\b(travel\w*|holidays?|journeys?|getaway|weekender|destinations?|explore|adventures|tour|trails?|odyssey|road trips?|railways?|by train|isles of|abroad|next stop|going places|on the road|great outdoors|best drives)\b/i],
  ['science-and-technology', /\b(science|scientists?|how things work|mythbusters|technology|tech|space|universe|volcano\w*|experiments?|inventions?)\b/i],
  ['engineering-and-machines', /\b(engineering|mighty ships|machines?|megastructures?|transportation marvels)\b/i],
  ['music-arts', /\b(music|musical|concerts?|songs?|rage|orchestra|symphony|opera|ballet|dancing|dancers|art|arts|artists?|festival|glastonbury|awards|eurovision|song contest)\b/i],
  ['politics', /\b(politics|political|parliament|question time|press club|insiders|media watch|7\.30|four corners|60 minutes|current affairs?|election|senate|briefing|planet america|washington week|landline|insight)\b/i],
  ['true-crime', /\b(murders?|murderers?|killers?|kill|true crime|crime|criminals?|prisoners?|prison|behind bars|forensics?|assassins?|shoplifters|cold case)\b/i],
  ['mystery-and-paranormal', /\b(paranormal|ghosts?|haunted|haunting|unexplained|unxplained|unbelievable|medium|psychics?|ufos?)\b/i],
  ['business-and-money', /\b(business|money|finance|financial|wealth|invest\w*|entrepreneurs?)\b/i],
  ['entertainment-news', /\b(entertainment tonight|entertainment news|e! news|access hollywood|showbiz|red carpet|celebrity news)\b/i],
  ['health-and-lifestyle', /\b(health|healthy|wellness|wellbeing|well-being|fitness|yoga|workout|diet|weight loss|sex)\b/i],
  ['motoring', /\b(motoring|wheeler dealers|top gear|cars?|auto|4wd|4x4|rigs|truckers|tow truck\w*|drive tv|bike show|dashcam)\b/i],
    ['fishing', FISHING],
  ['antiques', /\b(antiques?|pawn|pickers|collectables|collectibles|auction house|bargain hunt|restoration|storage wars)\b/i],
  ['local-life', /\b(country life|outback life|rural life|bush life)\b/i],
  ['shopping', /\b(shop|shopping|infomercial)\b/i],
]

const GUIDE_TOPICS = [
  [['house & garden', 'home & garden', 'property', 'home improvement'], 'home'],
  [['food & cooking', 'cooking', 'food'], 'cooking'],
  [['gardening'], 'gardening'],
  [['true crime'], 'true-crime'],
  [['nature', 'animals', 'wildlife'], 'nature'],
  [['travel'], 'travel'],
  [['history'], 'history'],
  [['war', 'military'], 'military-and-war'],
  [['science', 'technology', 'science & technology'], 'science-and-technology'],
  [['music', 'arts & culture', 'arts', 'performing arts'], 'music-arts'],
  [['medical'], 'medical'],
  [['health', 'health & fitness', 'fitness'], 'health-and-lifestyle'],
  [['business', 'finance', 'business & finance'], 'business-and-money'],
  [['politics', 'current affairs'], 'politics'],
  [['religion', 'religious', 'faith'], 'religion'],
  [['shopping', 'infomercial', 'home shopping'], 'shopping'],
  [['motoring', 'motors', 'cars'], 'motoring'],
  [['paranormal'], 'mystery-and-paranormal'],
]

const BYTE_GROUPS = {
  0x6: { topic: 'music-arts' },
  0x7: { topic: 'music-arts' },
  0x8: { topic: 'politics' },
}

const AU_ONLY_GROUPS = {
  0xc: { format: 'comedy' },
  0xd: { format: 'drama' },
  0xe: { format: 'documentaries' },
}

const ETSI_DOCUMENTARY = 0x23
const DOCUMENTARY_GUIDE = new Set(['documentary', 'documentaries', 'documentary series', 'other documentary series', 'society documentary'])
const REALITY_GUIDE = ['reality', 'reality series', 'unscripted competition', 'other reality television']
const DATING = /\b(love island|married at first sight|bachelor(ette)?|first dates|dating|farmer wants a wife|if you are the one)\b/i
const REALITY = /\b(big brother|survivor|the amazing race|the voice|idol|got talent|dancing with the stars|i'm a celebrity|lego masters|real housewives|below deck|undercover boss)\b/i
const QUIZ = /\b(quiz\w*|the chase|chasers|jeopardy|pointless|tipping point|millionaire|million dollar minute|lingo|scrabble|letters and numbers|mastermind|it's academic|bridge of lies|1% club|house of games|deal or no deal|wheel of fortune|family feud|countdown|spelling bee)\b/i
const CRIME_TITLE = /\b(murders?|mysteries|detective|inspector|ncis|csi|fbi|crime|police)\b/i
const FICTION_GUIDE = ['drama', 'action & adventure', 'drama serial', 'soap', 'soap opera', 'sci-fi', 'fantasy']
const TALK_SHOW = /\b(tonight show|late show|late night|morning show|talk show|the project|the view|loose women|this morning)\b/i
const FACTUAL_COMEDY = /\b(comedy|stand-?up|funniest|laughs|gruen|ridiculousness|the last leg|whose line)\b/i
const CURRENT_AFFAIRS = /\b(a current affair|60 minutes|7\.30|four corners|insiders|media watch|landline|insight|briefing|planet america|question time|press club)\b/i
const LIVE_EVENT = /\b(awards?|song contest|ceremony|telethon|festival|concert|gala|parade|new year'?s eve)\b/i
