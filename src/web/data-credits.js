export const FALLBACK_ATTRIBUTION = [
  { name: 'TVmaze', url: 'https://www.tvmaze.com', licence: 'CC BY-SA 4.0', use: 'show genres and some artwork' },
  { name: 'Wikidata', url: 'https://www.wikidata.org', licence: 'CC0', use: 'movie genres' },
]

export const dataCreditsOf = (attribution) => (attribution?.length ? attribution : FALLBACK_ATTRIBUTION)
  .map((entry) => ({
    name: entry.name,
    siteHref: entry.url,
    lead: sentenceCase(entry.use),
    note: `${sentenceCase(entry.use)} from ${entry.name}.`,
    licence: entry.licence,
    licenceHref: LICENCE_URLS[entry.licence] ?? entry.url,
  }))

const sentenceCase = (text = '') => text.charAt(0).toUpperCase() + text.slice(1)

const LICENCE_URLS = {
  'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/',
}
