import { db } from './db.js'
import { showTitleKey } from './show-artwork.js'
import { programmeHintsOf } from './artwork-match.js'
import { RECORDING_ORIGIN_PREFIX } from './artwork-choices.js'

export const createLibraryTitles = ({ loadRows = loadLibraryTitleRows, ttlMs = LIBRARY_TITLES_TTL_MS, now = Date.now } = {}) => {
  let byKey = null
  let loadedAt = 0
  let loading = null

  const refresh = () => {
    loading ??= Promise.resolve()
      .then(loadRows)
      .then((rows) => { byKey = rowsByTitleKey(rows) })
      .catch(() => { byKey ??= new Map() })
      .finally(() => {
        loadedAt = now()
        loading = null
      })
    return loading
  }

  const rowsFor = async (title) => {
    if (!byKey || now() - loadedAt >= ttlMs) {
      const pending = refresh()
      if (!byKey) await pending
    }
    return byKey?.get(showTitleKey(title)) || []
  }

  const hintsFor = async (title) => libraryHintsOf(await rowsFor(title))

  const recordingImagesFor = async (title) => recordingImageSourcesOf(await rowsFor(title))

  const kindsFor = async (title) => libraryKindsOf(await rowsFor(title))

  const frameFilesFor = async (title, { kind = null } = {}) => frameFilesOf({ rows: await rowsFor(title), kind })

  return { hintsFor, recordingImagesFor, kindsFor, frameFilesFor }
}

export const libraryHintsOf = (rows = []) => {
  const newest = newestFirst(rows).slice(0, MAX_ROWS_PER_TITLE)
  if (!newest.length) return null
  const channelNames = new Map(newest.filter((row) => row.channel_id && row.channel_name).map((row) => [String(row.channel_id), row.channel_name]))
  const hints = programmeHintsOf(newest, { channelNameOf: (id) => channelNames.get(String(id)) ?? null })
  if (!hints) return null
  const filmYears = newest.filter((row) => !isEpisodeRow(row) && Number.isInteger(row.year)).map((row) => row.year)
  return {
    ...hints,
    years: uniqueOf([...hints.years, ...filmYears]),
    releaseYears: uniqueOf([...hints.releaseYears, ...filmYears]),
    inLibrary: true,
  }
}

export const libraryKindsOf = (rows = []) => [...new Set(rows.map((row) => row.library_kind).filter(Boolean))]

export const recordingImageSourcesOf = (rows = []) => newestFirst(rows)
  .filter((row) => row.recording_id && row.has_image)
  .map((row) => `${RECORDING_ORIGIN_PREFIX}${row.recording_id}`)

export const frameFilesOf = ({ rows = [], kind = null }) => newestFirst(rows)
  .filter((row) => row.file_path && (!kind || !row.library_kind || row.library_kind === kind))
  .map((row) => ({ filePath: row.file_path, programmeDurationS: row.duration_s ?? null }))
  .slice(0, MAX_FRAME_FILES)

export const libraryTitleRowsOf = ({ items = [], recordings = [] }) => [
  ...items.map((item) => (item.kind === 'episode'
    ? {
        title: item.show_title,
        episode_title: item.title,
        series_no: item.season,
        episode_no: item.episode,
        synopsis: item.synopsis,
        aired_at: item.aired_at,
        library_kind: 'series',
        file_path: item.file_path ?? null,
        duration_s: item.duration_s ?? null,
      }
    : {
        title: item.title,
        synopsis: item.synopsis,
        year: item.year,
        aired_at: item.aired_at,
        library_kind: 'movie',
        file_path: item.file_path ?? null,
        duration_s: item.duration_s ?? null,
      })),
  ...recordings.map((recording) => ({
    title: recording.show_title_override ?? recording.title,
    episode_title: recording.episode_title,
    series_no: recording.season,
    episode_no: recording.episode,
    synopsis: recording.synopsis,
    channel_id: recording.channel_id,
    channel_name: recording.channel_name,
    aired_at: recording.aired_at,
    recording_id: recording.recording_id,
    has_image: Boolean(recording.image_path),
    file_path: recording.purged_at ? null : recording.file_path ?? null,
    duration_s: recording.duration_s ?? null,
  })),
].filter((row) => row.title)

const loadLibraryTitleRows = async () => {
  const [items, recordings] = await Promise.all([
    db('library_items').select('kind', 'title', 'show_title', 'season', 'episode', 'year', 'synopsis', 'aired_at', 'file_path', 'duration_s'),
    db('recordings').select(
      'recording_id', 'title', 'show_title_override', 'episode_title', 'season', 'episode', 'synopsis', 'channel_id', 'channel_name', 'aired_at',
      'image_path', 'file_path', 'duration_s', 'purged_at',
    ),
  ])
  return libraryTitleRowsOf({ items, recordings })
}

const rowsByTitleKey = (rows) => {
  const grouped = new Map()
  for (const row of rows) {
    const key = showTitleKey(row.title)
    if (!key) continue
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(row)
  }
  return grouped
}

const isEpisodeRow = (row) => row.series_no != null || row.episode_no != null

const newestFirst = (rows) => [...rows].sort((a, b) => Number(b.aired_at ?? 0) - Number(a.aired_at ?? 0))

const uniqueOf = (values) => [...new Set(values)]

const LIBRARY_TITLES_TTL_MS = 5 * 60 * 1000
const MAX_ROWS_PER_TITLE = 20
const MAX_FRAME_FILES = 3
