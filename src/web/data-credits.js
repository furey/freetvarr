export const FALLBACK_ATTRIBUTION = [
  { name: 'TVmaze', url: 'https://www.tvmaze.com', licence: 'CC BY-SA 4.0', use: 'show genres, show ratings, cast, some artwork, and the show each TV folder is named after' },
  { name: 'Wikidata', url: 'https://www.wikidata.org', licence: 'CC0', use: 'movie genres and links to film and show articles' },
  { name: 'Wikipedia', url: 'https://en.wikipedia.org', licence: 'CC BY-SA 4.0', use: 'some film and show pictures', notice: 'Some film and show pictures from Wikipedia. Each picture keeps its own licence.' },
  { name: 'date-holidays', url: 'https://github.com/commenthol/date-holidays', licence: 'ISC', use: 'the build tool that works out the Lunar New Year, Eid al-Fitr, and Hanukkah dates for the seasonal rows in For you', notice: 'The Lunar New Year, Eid al-Fitr, and Hanukkah dates for the seasonal rows in For you were worked out with date-holidays when Freetvarr was built.' },
  { name: 'Te Kāhui o Matariki Public Holiday Act 2022', url: 'https://www.legislation.govt.nz/act/public/2022/0014/latest/whole.html', licence: 'No copyright (NZ Copyright Act 1994, s 27)', use: 'the Matariki dates for the seasonal rows in For you', notice: 'The Matariki dates for the seasonal rows in For you come from Schedule 1 of the Te Kāhui o Matariki Public Holiday Act 2022.' },
  { name: 'TMDB', url: 'https://www.themoviedb.org', licence: 'TMDB API terms', use: 'film and show posters, film ratings, reviews, and cast, with a TMDB key', notice: 'This product uses the TMDB API but is not endorsed or certified by TMDB. Film and show posters, film ratings, reviews, and cast come from TMDB when you add a TMDB key.' },
]

export const dataCreditsOf = (attribution) => (attribution?.length ? attribution : FALLBACK_ATTRIBUTION)
  .map((entry) => ({
    name: entry.name,
    siteHref: entry.url,
    lead: sentenceCase(entry.use),
    note: entry.notice || `${sentenceCase(entry.use)} from ${entry.name}.`,
    licence: entry.licence,
    licenceHref: LICENCE_URLS[entry.licence] ?? entry.url,
  }))

const sentenceCase = (text = '') => text.charAt(0).toUpperCase() + text.slice(1)

const LICENCE_URLS = {
  'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
  ISC: 'https://opensource.org/license/isc-license-txt',
  'No copyright (NZ Copyright Act 1994, s 27)': 'https://www.legislation.govt.nz/act/public/1994/0143/latest/DLM345939.html',
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/',
  'TMDB API terms': 'https://www.themoviedb.org/api-terms-of-use',
}
