export const PICTURE_KINDS = [
  { key: 'poster', label: 'Poster' },
  { key: 'background', label: 'Background' },
]

export const pictureGroupsOf = ({ candidates = [], kind }) => SOURCE_ORDER
  .map((source) => ({
    source,
    label: SOURCE_LABELS[source],
    pictures: candidates.filter((candidate) => candidate.kind === kind && candidate.source === source),
  }))
  .filter((group) => group.pictures.length)

export const pictureChangedText = (kind) => (kind === 'poster' ? 'Poster changed' : 'Background changed')

export const pictureResetText = (kind) => (kind === 'poster' ? 'Poster set to automatic' : 'Background set to automatic')

export const tmdbNoteOf = ({ kind, tmdbKey }) => (tmdbKey
  ? ''
  : `Add a TMDB key in Settings to see ${kind === 'poster' ? 'posters' : 'backgrounds'} from TMDB.`)

export const emptyPicturesText = (kind) => (kind === 'poster'
  ? 'No posters found for this yet.'
  : 'No backgrounds found for this yet.')

export const artworkPathOf = ({ key, kind }) =>
  `/api/library/shows/${encodeURIComponent(key)}/artwork/${encodeURIComponent(kind)}`

export const candidatesPathOf = (key) => `/api/library/shows/${encodeURIComponent(key)}/artwork-candidates`

const SOURCE_ORDER = ['plex', 'tvmaze', 'tmdb', 'wikipedia', 'guide']

const SOURCE_LABELS = {
  plex: 'Plex',
  tvmaze: 'TVmaze',
  tmdb: 'TMDB',
  wikipedia: 'Wikipedia',
  guide: 'TV guide',
}
