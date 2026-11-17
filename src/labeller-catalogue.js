import { CATEGORY_CATALOGUE_VERSION, countryNameOf } from './for-you-category-catalogue.js'

export const LABELLER_PROMPT_VERSION = 1

export const LABELLER_ORIGINS = {
  au: 'Australia', nz: 'New Zealand', gb: 'United Kingdom', us: 'United States', ca: 'Canada', ie: 'Ireland',
  fr: 'France', de: 'Germany', it: 'Italy', dk: 'Denmark', se: 'Sweden', fi: 'Finland', no: 'Norway',
  jp: 'Japan', kr: 'South Korea', cn: 'China', in: 'India',
}

export const labellerCatalogueOf = (index) => {
  const groups = [...index.groups.values()]
  const describe = (info) => ({ key: info.group, title: info.title, scope: SCOPES[info.group] ?? info.title })
  return {
    version: `catalogue-${CATEGORY_CATALOGUE_VERSION}/prompt-${LABELLER_PROMPT_VERSION}`,
    countryName: countryNameOf(index.country) || 'your country',
    formats: groups.filter((info) => info.slot === 'format').map(describe),
    topics: groups.filter((info) => info.slot === 'topic' && info.row !== 'sport').map(describe),
    sports: groups.filter((info) => info.row === 'sport').map(describe),
    origins: Object.entries(LABELLER_ORIGINS).map(([key, title]) => ({ key, title, scope: `Made in ${title}` })),
  }
}

export const TOPIC_NOT = {
  'local-life': 'The programme is only made in {country}, or is about something else such as a competition, crime, or fiction',
  medical: 'Wellbeing, fitness, vets, or fictional hospital drama',
  'health-and-lifestyle': 'Hospitals, surgery, or emergency medicine',
  'true-crime': 'Crime fiction, or police at work without a real-crime investigation focus',
  fishing: 'Business pitches, cooking seafood, or other programmes that only mention fish',
  shopping: 'Game shows with prizes, or programmes that only show products',
}

const SCOPES = {
  comedy: 'Scripted comedy: sitcoms, sketch shows, stand-up, comedy series',
  drama: 'Scripted drama that is not mainly about crime: family, period, medical, and legal drama',
  'crime-drama': 'Scripted crime fiction: police procedurals, detective mysteries, crime thrillers',
  soaps: 'Soap operas: long-running serial dramas that air several times a week',
  'sci-fi-fantasy': 'Scripted science fiction, fantasy, and supernatural series',
  reality: 'Reality television: competitions, renovation contests, dating, fly-on-the-wall, observational series',
  quiz: 'Quiz and game shows: contestants answer questions or play games for prizes',
  documentaries: 'Factual documentaries and documentary series',
  lifestyle: 'Lifestyle magazine shows: presenters cover food, home, travel, gardening, or wellbeing segments',
  'talk-shows': 'Talk shows, chat shows, and morning shows with hosts and guests',
  'panel-shows': 'Comedy panel shows where comedians or celebrities answer questions or discuss topics',
  news: 'News bulletins, current affairs, and news programmes',
  kids: 'Programmes made for children: cartoons, preschool, children\'s series',
  'sport-format': 'Sport: matches, races, sport coverage, and sport programmes',
  antiques: 'Antiques, collectables, valuations, and auctions',
  'business-and-money': 'Business, money, investing, entrepreneurs, and consumer finance',
  cooking: 'Cooking, food, recipes, chefs, and food competitions',
  dating: 'Dating and finding a partner',
  'engineering-and-machines': 'Engineering, construction, machines, aircraft, ships, and big builds',
  'entertainment-news': 'Entertainment and celebrity news',
  fishing: 'Recreational fishing',
  gardening: 'Gardening and gardens',
  'health-and-lifestyle': 'Health and wellbeing, fitness, diet, sexuality (not hospitals or surgery)',
  history: 'History and historical events',
  home: 'Homes, property, renovation, real estate, and interior design',
  'local-life': 'Everyday life, places, and people in {country} (never just "made in {country}")',
  medical: 'Hospitals, surgery, emergency medicine, trauma, and doctors at work',
  'military-and-war': 'Military, armed forces, and war',
  motoring: 'Cars, motorbikes, and motoring',
  'music-arts': 'Music, concerts, performing arts, visual arts, and culture',
  'mystery-and-paranormal': 'Mysteries, the unexplained, and the paranormal',
  nature: 'Nature, wildlife, animals, pets, and vets',
  'police-rescue': 'Police, border security, fire, rescue, lifeguards, and emergency services at work',
  politics: 'Politics, government, and current affairs debate',
  religion: 'Religion, faith, and worship',
  'science-and-technology': 'Science, technology, space, and how things work',
  shopping: 'Home shopping and products for sale',
  travel: 'Travel, holidays, and exploring places',
  'true-crime': 'Real crimes, investigations, courts, and prisons (factual, not fiction)',
}
