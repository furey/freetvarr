import { classificationOf } from './ratings-display.js'

export const NO_GUIDE_TEXT = 'No guide information for this channel.'

export const channelNumberLabel = (number) =>
  (number == null || number === '' ? '' : String(number).padStart(2, '0'))

export const seasonEpisodeOf = (p) => {
  if (p.series_no == null && p.episode_no == null) return ''
  const season = p.series_no != null ? `S${String(p.series_no).padStart(2, '0')}` : ''
  const episode = p.episode_no != null ? `E${String(p.episode_no).padStart(2, '0')}` : ''
  return `${season}${episode}`
}

export const ratingLabel = (p) => classificationOf(p?.classification) || ''

export const watchRowLabel = ({ channel, now }) =>
  (now ? `Watch ${channel.name} live, ${now.title} on now` : `Watch ${channel.name} live`)

export const genreLabel = (genre) => GENRE_LABELS[Number(genre) >> 4] || ''

export const programmeProgress = ({ program, atMs }) => {
  const span = program.end - program.start
  if (span <= 0) return 0
  return Math.min(100, Math.max(0, Math.round(((atMs - program.start) / span) * 100)))
}

export const airingBoundary = ({ now, next }) => now?.end ?? next?.start ?? null

export const airingCovers = ({ airing, atMs }) => {
  if (!airing) return false
  if (airing.now) return airing.now.start <= atMs && airing.now.end > atMs
  return airing.atMs <= atMs && atMs < (airing.next?.start ?? Infinity)
}

const GENRE_LABELS = {
  1: 'Movie / drama',
  2: 'News / current affairs',
  3: 'Show / game show',
  4: 'Sport',
  5: "Children's",
  6: 'Music / dance',
  7: 'Arts / culture',
  8: 'Social / political',
  9: 'Education / science',
  10: 'Leisure / hobbies',
}
