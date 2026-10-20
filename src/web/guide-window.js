export const GUIDE_WINDOW_MIN_CHUNK_MIN = 15
export const GUIDE_WINDOW_MIN_CHUNK_PX = 100

export const GUIDE_WINDOW_CHUNKS_PER_VIEW = 4
export const GUIDE_WINDOW_PAD_CHUNKS = 1
export const GUIDE_WINDOW_LEAD_CHUNKS = 4

export const chunkedSpanOf = ({ start, size, minChunk, lead = 0 }) => {
  const chunk = Math.max(Math.ceil(size / GUIDE_WINDOW_CHUNKS_PER_VIEW), minChunk)
  const behind = GUIDE_WINDOW_PAD_CHUNKS + (lead < 0 ? GUIDE_WINDOW_LEAD_CHUNKS : 0)
  const ahead = GUIDE_WINDOW_PAD_CHUNKS + (lead > 0 ? GUIDE_WINDOW_LEAD_CHUNKS : 0)
  return {
    from: (Math.floor(start / chunk) - behind) * chunk,
    to: (Math.ceil((start + size) / chunk) + ahead) * chunk,
  }
}

export const scrollLeadOf = ({ delta, previous = 0 }) => {
  if (delta > 0) return 1
  if (delta < 0) return -1
  return previous
}

export const cellWindowOf = ({ dayStart, leftMin, widthMin, topPx, heightPx, leadX = 0, leadY = 0 }) => {
  const minutes = chunkedSpanOf({ start: leftMin, size: widthMin, minChunk: GUIDE_WINDOW_MIN_CHUNK_MIN, lead: leadX })
  const pixels = chunkedSpanOf({ start: topPx, size: heightPx, minChunk: GUIDE_WINDOW_MIN_CHUNK_PX, lead: leadY })
  return {
    dayStart,
    startMs: dayStart + minutes.from * 60_000,
    endMs: dayStart + minutes.to * 60_000,
    topPx: pixels.from,
    bottomPx: pixels.to,
  }
}

export const sameCellWindow = (a, b) => Boolean(a && b)
  && a.dayStart === b.dayStart && a.startMs === b.startMs && a.endMs === b.endMs
  && a.topPx === b.topPx && a.bottomPx === b.bottomPx

export const lastPinnedBandOf = (bands) => bands.filter((band) => band.pinned).at(-1) || null

export const pinsScrolledAway = ({ bands, scrollTop, rulerHeight }) => {
  const last = lastPinnedBandOf(bands)
  return Boolean(last) && last.bottom - scrollTop < rulerHeight
}

export const crossesRailEdge = ({ programme, edgeMs, slackMs }) =>
  programme.start < edgeMs + slackMs && programme.end > edgeMs - slackMs

export const spanOnScreen = ({ x, scrollLeft, viewWidth }) => x >= scrollLeft && x <= scrollLeft + viewWidth

export const nearRowKeysOf = ({ bands, topPx, bottomPx }) => new Set(bands
  .filter((band) => band.bottom > topPx && band.top < bottomPx)
  .map((band) => band.key))

export const sameItems = (a, b) => a.length === b.length && a.every((item, i) => item === b[i])

export const windowedCellsByRow = ({ rows, isNear, startMs, endMs, keepKey, keyOf, previous, retain = false }) => {
  const byRow = new Map()
  for (const row of rows) {
    const near = isNear(row.key)
    const before = previous?.get(row.key)
    const kept = retain && before ? new Set(before) : null
    const cells = (row.programmes || []).filter((p) => (near && p.end > startMs && p.start < endMs)
      || kept?.has(p)
      || (keepKey != null && keyOf(row, p) === keepKey))
    if (!cells.length) continue
    byRow.set(row.key, before && sameItems(before, cells) ? before : cells)
  }
  return byRow
}

export const cellArtOf = ({ hasImage, widthPx, thumbMinPx }) => {
  if (widthPx < thumbMinPx) return 'none'
  return hasImage ? 'own' : 'fallback'
}
