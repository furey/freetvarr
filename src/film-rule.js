export const FILM_MIN_MS = 75 * 60 * 1000

export const looksLikeFilm = ({ genres = [], season, episode, start, end }) =>
  genres.some((g) => g >= FILM_GENRE_MIN && g <= FILM_GENRE_MAX)
  && season == null
  && episode == null
  && end - start >= FILM_MIN_MS

const FILM_GENRE_MIN = 0x10
const FILM_GENRE_MAX = 0x1f
