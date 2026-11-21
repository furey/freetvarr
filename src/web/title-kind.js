export const isSingleTitleKind = (kind) => SINGLE_TITLE_KINDS.has(kind)

export const canRecordSeriesOf = (programme) =>
  Boolean(programme?.series_link) && programme?.kind !== 'movie' && !isConfirmedOneOff(programme)

const isConfirmedOneOff = (programme) => isSingleTitleKind(programme?.kind) && Boolean(programme?.one_off_confirmed)

const SINGLE_TITLE_KINDS = new Set(['movie', 'oneoff', 'one-off'])
