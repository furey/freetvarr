import SUGGESTED from '../data/suggested-guide-feeds.json' with { type: 'json' }

export const SUGGESTED_FEEDS_CHECKED = SUGGESTED.checked

export const countryNameOf = (country) => SUGGESTED.countries[country] ?? null

export const suggestedFeedsOf = ({ country, timeZone = '' }) => {
  const city = cityOf(timeZone)
  return SUGGESTED.feeds
    .filter((feed) => feed.country === country)
    .filter((feed) => !feed.region || feed.region.toLowerCase() === city)
    .map(({ name, url, provider, source }) => ({ name, url, provider, source }))
}

export const suggestionsOf = ({ country, timeZone = '' }) => ({
  country: countryNameOf(country),
  checked: SUGGESTED_FEEDS_CHECKED,
  feeds: suggestedFeedsOf({ country, timeZone }),
})

const cityOf = (timeZone) => String(timeZone).split('/').pop().replace(/_/g, ' ').toLowerCase()
