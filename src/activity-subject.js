import path from 'path'

import { db } from './db.js'
import { getMoviesRoot } from './library-roots.js'
import { MOVIE } from './programme-kind.js'
import { showKeyOf } from './web/show-key.js'

export const recordingSubjectOf = ({ row, moviesRoot = '', kindOverride = null }) => {
  if (!row) return null
  return {
    recordingId: row.recording_id,
    title: showTitleOf(row),
    season: row.season ?? null,
    episode: row.episode ?? null,
    episodeTitle: row.episode_title ?? null,
    channelName: row.channel_name ?? null,
    airedAt: msOrNull(row.aired_at),
    year: row.year ?? null,
    film: kindOverride === MOVIE || isInside({ filePath: row.file_path, folder: moviesRoot }),
    file: row.file_path ?? null,
  }
}

export const importSubjectOf = ({ item, kind, filePath, showTitle = item.title, kindOverride = null }) => ({
  recordingId: item.id,
  title: showTitle,
  season: item.season ?? null,
  episode: item.episode ?? null,
  episodeTitle: item.episode_title || null,
  channelName: item.channelName || null,
  airedAt: msOrNull(item.start),
  year: item.year ?? null,
  film: kind === 'film' || kindOverride === MOVIE,
  file: filePath ?? null,
})

export const loadRecordingSubject = async (recordingId, {
  loadRow = recordingRowOf,
  loadMoviesRoot = getMoviesRoot,
  loadKindOverride = kindOverrideOf,
} = {}) => {
  const row = await Promise.resolve().then(() => loadRow(recordingId)).catch(() => null)
  if (!row) return null
  const [moviesRoot, kindOverride] = await Promise.all([
    Promise.resolve().then(loadMoviesRoot).catch(() => ''),
    Promise.resolve().then(() => loadKindOverride(showKeyOf(showTitleOf(row)))).catch(() => null),
  ])
  return recordingSubjectOf({ row, moviesRoot, kindOverride })
}

const recordingRowOf = (recordingId) => db('recordings').where({ recording_id: recordingId }).first()

const kindOverrideOf = async (showKey) =>
  (await db('programme_kind_overrides').where({ show_key: showKey }).first('kind'))?.kind ?? null

const showTitleOf = (row) => row.show_title_override ?? row.title

const isInside = ({ filePath, folder }) => {
  if (!filePath || !folder) return false
  const relative = path.relative(path.resolve(folder), path.resolve(filePath))
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
}

const msOrNull = (value) => {
  const ms = Number(value)
  return value != null && Number.isFinite(ms) ? ms : null
}
