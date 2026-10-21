export const PICTURE_KINDS = [
  { key: 'background', label: 'Background' },
  { key: 'poster', label: 'Poster' },
]

export const UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp'

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

export const pictureGroupsOf = ({ candidates = [], kind }) => SOURCE_ORDER
  .map((source) => ({
    source,
    label: SOURCE_LABELS[source],
    pictures: candidates.filter((candidate) => candidate.kind === kind && candidate.source === source),
  }))
  .filter((group) => group.pictures.length)

export const uploadedPicturesOf = ({ candidates = [], kind }) =>
  candidates.filter((candidate) => candidate.kind === kind && candidate.source === 'upload')

export const withUploadedOf = ({ offer, candidate, chosen }) => ({
  ...offer,
  chosen: { ...offer.chosen, [candidate.kind]: chosen },
  candidates: [candidate, ...offer.candidates.filter((entry) => entry.id !== candidate.id)],
})

export const withoutUploadOf = ({ offer, id, kind, chosen }) => ({
  ...offer,
  chosen: { ...offer.chosen, [kind]: chosen },
  candidates: offer.candidates.filter((entry) => entry.id !== id),
})

export const isTooBigToUpload = (file) => file.size > MAX_UPLOAD_BYTES

export const isPictureFile = (file) => Boolean(file) && (!file.type || file.type.startsWith('image/'))

export const pictureChangedText = (kind) => (kind === 'poster' ? 'Poster changed' : 'Background changed')

export const pictureResetText = (kind) => (kind === 'poster' ? 'Poster set to automatic' : 'Background set to automatic')

export const tmdbNoteOf = ({ kind, tmdbKey }) => (tmdbKey
  ? ''
  : `Add a TMDB key in Settings to see ${kind === 'poster' ? 'posters' : 'backgrounds'} from TMDB.`)

export const emptyPicturesText = (kind) => (kind === 'poster' ? 'No posters found.' : 'No backgrounds found.')

export const artworkPathOf = ({ key, kind }) =>
  `/api/library/shows/${encodeURIComponent(key)}/artwork/${encodeURIComponent(kind)}`

export const uploadPathOf = ({ key, kind }) => `${artworkPathOf({ key, kind })}/uploads`

export const uploadRemovePathOf = ({ key, kind, id }) => `${uploadPathOf({ key, kind })}/${encodeURIComponent(id)}`

export const candidatesPathOf = (key) => `/api/library/shows/${encodeURIComponent(key)}/artwork-candidates`

const SOURCE_ORDER = ['plex', 'tvmaze', 'tmdb', 'wikipedia', 'guide']

const SOURCE_LABELS = {
  plex: 'Plex',
  tvmaze: 'TVmaze',
  tmdb: 'TMDB',
  wikipedia: 'Wikipedia',
  guide: 'TV guide',
}
