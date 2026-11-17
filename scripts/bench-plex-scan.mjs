import { managerUpdatesOf } from '../src/plex-library-scan.js'
import { libraryItemRowsOf } from '../src/plex-library.js'

const SIZES = [2_000, 20_000]
const LINEAR_RATIO_LIMIT = 40
const SEEN_AT = Date.parse('2026-10-30T10:00:00Z')

const libraryPathOf = (n) => `/data/media/tv/Show ${n}/Season 01/Show ${n} - S01E01.mkv`
const managerPathOf = (n) => `/tv/Show ${n}/Season 01/Show ${n} - S01E01.mkv`

const timeFor = (size) => {
  const index = new Map(Array.from({ length: size }, (_, n) => [managerPathOf(n), { manager: 'sonarr', path: managerPathOf(n), fileId: n, seriesId: n }]))
  const rows = Array.from({ length: size }, (_, n) => ({ rating_key: String(n), part_id: String(n), file_path: libraryPathOf(n) }))
  const recordingFiles = Array.from({ length: size }, (_, n) => ({ recordingId: `r${n}`, filePath: libraryPathOf(n) }))
  const items = Array.from({ length: size }, (_, n) => ({ ratingKey: String(n), Media: [{ Part: [{ id: n, file: libraryPathOf(n + size) }] }] }))
  const started = performance.now()
  const updates = managerUpdatesOf({ rows, index })
  const itemRows = libraryItemRowsOf({ items, section: { id: '2', type: 'show' }, recordingFiles, roots: ['/data/media/tv'], seenAt: SEEN_AT })
  const elapsed = performance.now() - started
  if (updates.filter((update) => update.manager).length !== size || itemRows.length !== size) throw new Error(`wrong row count at ${size} rows`)
  return elapsed
}

timeFor(1_000)
const [small, large] = SIZES.map(timeFor)
const ratio = large / Math.max(small, 1)

console.log(`path matching: ${SIZES[0]} rows ${small.toFixed(0)} ms, ${SIZES[1]} rows ${large.toFixed(0)} ms, ratio ${ratio.toFixed(1)} (limit ${LINEAR_RATIO_LIMIT})`)
if (ratio >= LINEAR_RATIO_LIMIT) {
  console.error('path matching no longer grows linearly with the library')
  process.exitCode = 1
}
