import path from 'path'

import { db } from './db.js'
import { removeArtwork } from './artwork.js'
import { groupKeyOf, groupTitleOf, isLibraryMember, ruleTitleOf, setRecordingWatched } from './library.js'
import { forgetShowArtwork } from './epg.js'
import { getPlexConnection, getPlexMachineIdentifier, listPlexSectionItems, plexSectionsToSearch } from './plex.js'

export const setShowWatched = async ({
  key,
  watched,
  throughRecordingId = null,
  loadRows = loadShowRows,
  setWatched = setRecordingWatched,
}) => {
  const rows = await loadRows(key)
  if (!rows.length) return null
  const scoped = throughRecordingId == null ? rows : rowsThrough({ rows, recordingId: throughRecordingId })
  if (!scoped) return { missingThrough: true }
  const targets = scoped.filter((row) => needsWatchedChange({ row, watched }))
  await Promise.all(targets.map((row) => setWatched({ recordingId: row.recording_id, watched })))
  return { changed: targets.length, recording_ids: targets.map((row) => row.recording_id) }
}

export const refreshShowArtwork = async ({
  key,
  loadRows = loadShowRows,
  removeImage = removeArtwork,
  resetRows = resetRecordingImages,
  forgetShow = forgetShowArtwork,
  forgetLookups = async () => {},
  loadRuleTitle = ruleTitleOf,
}) => {
  const rows = await loadRows(key)
  const titles = rows.length
    ? [...new Set(rows.map(groupTitleOf).filter(Boolean))]
    : [await Promise.resolve().then(() => loadRuleTitle(key)).catch(() => null)].filter(Boolean)
  if (!titles.length) return null
  await Promise.all(rows.map((row) => removeImage({ kind: 'recording', id: row.recording_id }).catch(() => {})))
  if (rows.length) await resetRows(rows.map((row) => row.recording_id))
  titles.forEach(forgetShow)
  await Promise.all(titles.map((title) => Promise.resolve().then(() => forgetLookups(title)).catch(() => {})))
  return { cleared: rows.length + titles.length }
}

export const findPlexLink = async ({
  filePaths,
  level = 'episode',
  getConnection = getPlexConnection,
  fetchIdentifier = getPlexMachineIdentifier,
  fetchItems = listPlexSectionItems,
  loadSections = plexSectionsToSearch,
}) => {
  const connection = await getConnection().catch(() => null)
  if (!connection) return { url: null, reason: 'Plex is not set up' }
  const sections = await loadSections()
  if (!sections.length) return { url: null, reason: 'No Plex library is set up' }
  try {
    for (const section of sections) {
      const items = await fetchItems({ ...connection, section })
      const ratingKey = ratingKeyForPaths({ items, filePaths, level: section.type === 'show' ? level : 'episode' })
      if (!ratingKey) continue
      const machineIdentifier = await fetchIdentifier(connection)
      return { url: plexDetailsUrl({ machineIdentifier, ratingKey }) }
    }
  } catch (err) {
    return { url: null, reason: `Plex could not be reached (${err.code || err.message})` }
  }
  return { url: null, reason: 'Plex has not found this recording yet' }
}

export const getRecordingPlexLink = async ({ recordingId, loadRow = loadRecordingRow, find = findPlexLink }) => {
  const row = await loadRow(recordingId)
  if (!row) return null
  if (!row.file_path) return { url: null, reason: 'This recording has no file yet' }
  return find({ filePaths: [row.file_path] })
}

export const getShowPlexLink = async ({ key, loadRows = loadShowRows, find = findPlexLink }) => {
  const rows = await loadRows(key)
  if (!rows.length) return null
  const filePaths = rows.map((row) => row.file_path).filter(Boolean)
  if (!filePaths.length) return { url: null, reason: 'This show has no files yet' }
  return find({ filePaths, level: 'show' })
}

export const needsWatchedChange = ({ row, watched }) => watched
  ? row.watched_at == null
  : row.watched_at != null || row.playback_position_s != null

export const compareEpisodeOrder = (a, b) => {
  const bySeasonEpisode = bothNumbered(a, b)
    ? (a.season ?? 0) - (b.season ?? 0) || a.episode - b.episode
    : 0
  return bySeasonEpisode || airedMsOf(a) - airedMsOf(b)
}

export const rowsThrough = ({ rows, recordingId }) => {
  const target = rows.find((row) => row.recording_id === recordingId)
  if (!target) return null
  return rows.filter((row) => compareEpisodeOrder(row, target) <= 0)
}

export const plexDetailsUrl = ({ machineIdentifier, ratingKey }) =>
  `https://app.plex.tv/desktop#!/server/${encodeURIComponent(machineIdentifier)}/details`
  + `?key=${encodeURIComponent(`/library/metadata/${ratingKey}`)}`

export const plexPartFilesOf = (item) => [item?.Media || []]
  .flat()
  .flatMap((media) => [media?.Part || []].flat())
  .map((part) => part?.file)
  .filter(Boolean)

export const sharedTailLength = (a, b) => {
  const left = pathSegments(a)
  const right = pathSegments(b)
  let shared = 0
  while (shared < left.length && shared < right.length
    && left[left.length - 1 - shared] === right[right.length - 1 - shared]) shared += 1
  return shared
}

export const matchPlexItem = ({ items = [], filePath }) => {
  if (!filePath) return null
  const scored = items
    .map((item) => ({ item, score: Math.max(0, ...plexPartFilesOf(item).map((file) => sharedTailLength(file, filePath))) }))
    .filter(({ score }) => score >= 1)
  if (!scored.length) return null
  return scored.reduce((best, next) => (next.score > best.score ? next : best)).item
}

export const plexRatingKeyOf = ({ item, level }) => {
  const key = level === 'show' ? item?.grandparentRatingKey ?? item?.ratingKey : item?.ratingKey
  return key == null ? null : String(key)
}

const ratingKeyForPaths = ({ items, filePaths, level }) => {
  for (const filePath of filePaths) {
    const item = matchPlexItem({ items, filePath })
    const ratingKey = item && plexRatingKeyOf({ item, level })
    if (ratingKey) return ratingKey
  }
  return null
}

const loadRecordingRow = (recordingId) => db('recordings').where({ recording_id: recordingId }).first()

const bothNumbered = (a, b) => a.episode != null && b.episode != null

const pathSegments = (filePath) => path.normalize(String(filePath)).split(/[\\/]+/).filter(Boolean)

const airedMsOf = (row) => {
  const aired = Number(row.aired_at)
  if (Number.isFinite(aired) && row.aired_at != null) return aired
  const imported = row.imported_at ? new Date(row.imported_at).getTime() : NaN
  return Number.isFinite(imported) ? imported : 0
}

const loadShowRows = async (key) => (await db('recordings').whereNull('purged_at'))
  .filter((row) => isLibraryMember(row) && row.status !== 'failed' && groupKeyOf(row) === key)

const resetRecordingImages = (recordingIds) => db('recordings')
  .whereIn('recording_id', recordingIds)
  .update({ image_path: null, image_checked_at: null })
