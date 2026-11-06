import { currentTimeZone } from './time-zone.js'
import { countryForTimeZone } from './zone-countries.js'

export const installCountry = () => {
  const zoneSetting = process.env.TZ ?? ''
  if (lastCountry?.zoneSetting !== zoneSetting) lastCountry = { zoneSetting, country: countryForTimeZone(currentTimeZone()) }
  return lastCountry.country
}

export const countryTitleWordsOf = (country = installCountry()) => {
  if (!country) return []
  return OWN_TITLE_WORDS[country] ?? displayWordsOf(country)
}

export const excludedEditionTagsOf = (country = installCountry()) => {
  if (!excludedTags.has(country)) excludedTags.set(country, excludedTagsOf(country))
  return excludedTags.get(country)
}

export const knownEditionTagSets = () => {
  const sets = [[], EDITION_TAGS, ...Object.keys(OWN_TITLE_WORDS).map(excludedEditionTagsOf)]
  const seen = new Set()
  return sets.filter((tags) => {
    const key = tags.join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const excludedTagsOf = (country) => {
  if (!country) return []
  const own = new Set(countryTitleWordsOf(country).map((word) => word.toUpperCase()))
  return EDITION_TAGS.filter((tag) => !own.has(tag))
}

const displayWordsOf = (country) => {
  const code = country === 'uk' ? 'GB' : country.toUpperCase()
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' }).of(code)
    return name && name !== code ? [name, code] : [code]
  } catch {
    return [code]
  }
}

let lastCountry = null
const excludedTags = new Map()

const EDITION_TAGS = ['UK', 'US', 'USA', 'AU', 'AUS', 'NZ']

const TRANS_TASMAN_WORDS = ['Australia', 'AU', 'AUS', 'NZ', 'New Zealand', 'Aotearoa']

const OWN_TITLE_WORDS = {
  au: TRANS_TASMAN_WORDS,
  nz: TRANS_TASMAN_WORDS,
  uk: ['UK', 'Britain'],
  us: ['US', 'USA', 'America'],
  ca: ['Canada'],
  ie: ['Ireland'],
}
