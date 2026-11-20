import path from 'node:path'

import { loadTitleKinds, MOVIE_KIND, ONE_OFF_KIND, SERIES_KIND } from './title-kinds.js'
import { showKeyOf } from './web/show-key.js'
import { getMoviesRoot, getOneOffRoot } from './library-roots.js'

export const createRecordingTitleKinds = async ({
  titleKinds = loadTitleKinds,
  moviesRoot = getMoviesRoot,
  oneOffRoot = getOneOffRoot,
} = {}) => {
  const [kinds, movies, oneOffs] = await Promise.all([
    Promise.resolve().then(titleKinds).catch(() => new Map()),
    Promise.resolve().then(moviesRoot).catch(() => null),
    Promise.resolve().then(oneOffRoot).catch(() => null),
  ])
  return (recording) => recordingTitleKindOf({ recording, kinds, movies, oneOffs })
}

export const recordingTitleKindOf = ({ recording, kinds = new Map(), movies = null, oneOffs = null }) => {
  const stored = kinds.get(showKeyOf(recording.show_title_override ?? recording.title))?.kind
  if (STORED_KINDS.has(stored)) return stored
  if (isInside({ filePath: recording.file_path, root: movies })) return MOVIE_KIND
  if (isInside({ filePath: recording.file_path, root: oneOffs })) return ONE_OFF_KIND
  return null
}

const isInside = ({ filePath, root }) => {
  if (!filePath || !root) return false
  const relative = path.relative(path.resolve(root), path.resolve(filePath))
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
}

const STORED_KINDS = new Set([MOVIE_KIND, SERIES_KIND, ONE_OFF_KIND])
