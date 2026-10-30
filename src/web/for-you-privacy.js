export const REPO_HREF = 'https://github.com/furey/freetvarr'
export const PRIVACY_TITLE = 'For you stays on this box'

export const privacyLookupTextOf = ({ genreLookup = true } = {}) => (genreLookup
  ? 'To find genres, Freetvarr sends show titles to TVmaze and Wikidata, and nothing else.'
  : 'Genre lookups on TVmaze and Wikidata are off.')
