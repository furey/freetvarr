export const movieChoiceLabelOf = (choice) => MOVIE_CHOICE_LABELS[choice] ?? null

export const movieChoiceIconOf = (choice) => (MOVIE_CHOICE_LABELS[choice] ? choice : null)

export const movieKindRowOf = (choice) => (MOVIE_CHOICE_LABELS[choice]
  ? { key: 'movie-kind', label: MOVIE_CHOICE_LABELS[choice], icon: movieChoiceIconOf(choice) }
  : null)

export const correctionRowsOf = (overrides = []) => overrides
  .filter((override) => CORRECTION_LABELS[override.kind])
  .map((override) => ({ showKey: override.showKey, title: override.title || override.showKey, choice: CORRECTION_LABELS[override.kind] }))

const MOVIE_CHOICE_LABELS = {
  'not-movie': 'Not a movie',
  movie: 'This is a movie',
}

const CORRECTION_LABELS = {
  'not-movie': 'Not a movie',
  movie: 'Movie',
  show: 'Moved to Shows',
  'one-off': 'Moved to One-offs',
}
