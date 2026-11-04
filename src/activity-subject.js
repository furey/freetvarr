import path from 'path'

import { db } from './db.js'
import { getMoviesRoot } from './library-roots.js'

export const recordingSubjectOf = ({ row, moviesRoot = '' }) => {
  if (!row) return null
  return {
    recordingId: row.recording_id,
    title: row.show_title_override ?? row.title,
    season: row.season ?? null,
    episode: row.episode ?? null,
    episodeTitle: row.episode_title ?? null,
    channelName: row.channel_name ?? null,
    airedAt: msOrNull(row.aired_at),
    year: row.year ?? null,
    film: isInside({ filePath: row.file_path, folder: moviesRoot }),
    file: row.file_path ?? null,
  }
}

export const importSubjectOf = ({ item, kind, filePath }) => ({
  recordingId: item.id,
  title: item.title,
  season: item.season ?? null,
  episode: item.episode ?? null,
  episodeTitle: item.episode_title || null,
  channelName: item.channelName || null,
  airedAt: msOrNull(item.start),
  year: item.year ?? null,
  film: kind === 'film',
  file: filePath ?? null,
})

export const loadRecordingSubject = async (recordingId) => {
  try {
    const [row, moviesRoot] = await Promise.all([
      db('recordings').where({ recording_id: recordingId }).first(),
      getMoviesRoot(),
    ])
    return recordingSubjectOf({ row, moviesRoot })
  } catch {
    return null
  }
}

const isInside = ({ filePath, folder }) => {
  if (!filePath || !folder) return false
  const relative = path.relative(path.resolve(folder), path.resolve(filePath))
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
}

const msOrNull = (value) => {
  const ms = Number(value)
  return value != null && Number.isFinite(ms) ? ms : null
}
