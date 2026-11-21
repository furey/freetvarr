export const isSingleTitleKind = (kind) => SINGLE_TITLE_KINDS.has(kind)

export const canRecordSeriesOf = (programme) =>
  Boolean(programme?.series_link) && !isSingleTitleKind(programme?.kind)

const SINGLE_TITLE_KINDS = new Set(['movie', 'oneoff', 'one-off'])
