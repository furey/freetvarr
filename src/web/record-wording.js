export const recordKindOf = ({ kind, hasRule = false } = {}) => {
  if (hasRule) return 'series'
  return Object.hasOwn(WORDING, kind) ? kind : 'series'
}

export const recordWordingOf = (options) => WORDING[recordKindOf(options)]

export const canRecordSeriesOf = (programme) =>
  Boolean(programme?.series_link) && programme?.kind !== 'movie'

const WORDING = {
  movie: {
    menuLabel: 'Record this movie',
    strengthLabel: 'This movie',
    strengthLine: 'Records this movie.',
    scheduledMeta: 'Records this movie',
    skipLabel: 'Don\'t record this movie',
    skippedText: (title) => `Won't record ${title}`,
  },
  'one-off': {
    menuLabel: 'Record',
    strengthLabel: 'This showing',
    strengthLine: 'Records this showing only.',
    scheduledMeta: 'Records this showing',
    skipLabel: 'Don\'t record this',
    skippedText: (title) => `Won't record ${title}`,
  },
  series: {
    menuLabel: 'Record this episode',
    strengthLabel: 'This episode',
    strengthLine: 'Records this airing only.',
    scheduledMeta: 'Records this episode',
    skipLabel: 'Don\'t record this episode',
    skippedText: (title) => `Won't record this episode of ${title}`,
  },
}
