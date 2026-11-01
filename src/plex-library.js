import path from 'path'

export const PLEX_ITEM_PREFIX = 'plex-'
export const NEW_FOR_MS = 14 * 24 * 60 * 60 * 1000

export const itemIdOf = (ratingKey) => `${PLEX_ITEM_PREFIX}${ratingKey}`

export const isPlexItemId = (id) => typeof id === 'string' && id.startsWith(PLEX_ITEM_PREFIX) && id.length > PLEX_ITEM_PREFIX.length

export const ratingKeyOfItemId = (id) => (isPlexItemId(id) ? id.slice(PLEX_ITEM_PREFIX.length) : null)

export const isPlexRow = (row) => row?.source === 'plex'

export const libraryItemRowsOf = ({ items = [], section, recordingFiles = [], roots = [], seenAt }) => {
  const recordingIndex = createPathIndex(recordingFiles.map(({ recordingId, filePath }) => ({ recordingId, path: filePath })))
  return items
    .flatMap((item) => partsOf(item).map(({ media, part }) => itemRowOf({ item, media, part, section, recordingIndex, roots, seenAt })))
    .filter((row) => row.file_path)
}

export const localPathOf = ({ plexFile, roots = [] }) => {
  if (!plexFile) return null
  const resolved = path.resolve(plexFile)
  const usable = roots.filter(Boolean).map((root) => path.resolve(root))
  if (!usable.length || usable.some((root) => isInside(resolved, root))) return resolved
  const segments = segmentsOf(resolved)
  for (const root of usable) {
    const name = path.basename(root)
    const at = segments.lastIndexOf(name)
    if (at >= 0 && at < segments.length - 1) return path.join(root, ...segments.slice(at + 1))
  }
  return resolved
}

export const isSameFileByTail = (a, b) => {
  if (!a || !b) return false
  const left = segmentsOf(a)
  const right = segmentsOf(b)
  const wanted = Math.min(MATCH_SEGMENTS, left.length, right.length)
  if (!wanted) return false
  for (let i = 1; i <= wanted; i += 1) if (left[left.length - i] !== right[right.length - i]) return false
  return true
}

export const createPathIndex = (entries) => {
  const exact = new Map()
  const byName = new Map()
  for (const entry of entries) {
    if (!entry?.path) continue
    if (!exact.has(entry.path)) exact.set(entry.path, entry)
    const name = lastSegmentOf(entry.path)
    if (!byName.has(name)) byName.set(name, [])
    byName.get(name).push(entry)
  }
  return { exact, byName }
}

export const findInPathIndex = ({ index, filePath }) => {
  if (!filePath) return null
  return index.exact.get(filePath)
    ?? (index.byName.get(lastSegmentOf(filePath)) || []).find((entry) => isSameFileByTail(entry.path, filePath))
    ?? null
}

export const baseShowTitleOf = (title) => String(title ?? '').replace(TRAILING_TAGS, '').trim()

export const shownTitlesOf = (itemRows = []) => {
  const titles = [...new Set(itemRows.filter((row) => row.kind === 'episode' && row.show_title).map((row) => row.show_title))]
  const byBase = new Map()
  for (const title of titles) {
    const base = baseShowTitleOf(title)
    byBase.set(base, [...(byBase.get(base) || []), title])
  }
  return new Map(titles.map((title) => {
    const base = baseShowTitleOf(title)
    return [title, base && base !== title && byBase.get(base).length === 1 ? base : title]
  }))
}

export const plexLibraryRowsOf = ({ itemRows = [], nowMs = Date.now() }) => {
  const shownTitles = shownTitlesOf(itemRows)
  const groups = groupBy(itemRows, (row) => String(row.rating_key))
  const rows = []
  const versionsByRecordingId = new Map()
  for (const parts of groups.values()) {
    const own = parts.filter((part) => part.recording_id)
    const foreign = parts.filter((part) => !part.recording_id)
    if (own.length) {
      for (const part of own) {
        if (foreign.length) versionsByRecordingId.set(part.recording_id, foreign.map(versionOf))
      }
      continue
    }
    rows.push(virtualRowOf({ parts, shownTitle: shownTitles.get(parts[0].show_title) ?? parts[0].show_title, nowMs }))
  }
  return { rows, versionsByRecordingId }
}

export const mergeWithRecordings = ({ rows = [], itemRows = [], keyOf, nowMs = Date.now() }) => {
  const { rows: plexRows, versionsByRecordingId } = plexLibraryRowsOf({ itemRows, nowMs })
  const withVersions = rows.map((row) => (versionsByRecordingId.has(row.recording_id)
    ? { ...row, other_versions: [...(row.other_versions || []), ...versionsByRecordingId.get(row.recording_id)] }
    : row))
  const bySlot = new Map(withVersions
    .filter((row) => row.season != null && row.episode != null)
    .map((row) => [slotKeyOf({ key: keyOf(row), season: row.season, episode: row.episode }), row.recording_id]))
  const extraVersions = new Map()
  const kept = []
  for (const plexRow of plexRows) {
    const slot = plexRow.season != null && plexRow.episode != null
      ? slotKeyOf({ key: keyOf(plexRow), season: plexRow.season, episode: plexRow.episode })
      : null
    const twin = slot ? bySlot.get(slot) : null
    if (twin) {
      extraVersions.set(twin, [...(extraVersions.get(twin) || []), ...plexRow.versions.map((version) => ({ ...version, itemId: plexRow.recording_id }))])
      continue
    }
    kept.push(plexRow)
  }
  const merged = withVersions.map((row) => (extraVersions.has(row.recording_id)
    ? { ...row, other_versions: [...(row.other_versions || []), ...extraVersions.get(row.recording_id)] }
    : row))
  return [...merged, ...kept]
}

export const isNewPlexRow = ({ row, nowMs = Date.now() }) => row.watched_at == null
  && !(row.playback_position_s > 0)
  && Number(row.added_at) > 0
  && nowMs - Number(row.added_at) <= NEW_FOR_MS

export const itemImageUrlOf = ({ ratingKey, kind, width }) => `/api/library/items/${encodeURIComponent(ratingKey)}/image?kind=${kind}&w=${width}`

export const versionOf = (part) => ({
  itemId: itemIdOf(part.rating_key),
  ratingKey: String(part.rating_key),
  partId: String(part.part_id),
  filePath: part.file_path,
  sizeBytes: numberOrNull(part.size_bytes),
  videoCodec: part.video_codec ?? null,
  resolution: part.resolution ?? null,
  audioCodec: part.audio_codec ?? null,
  manager: part.manager ?? null,
  managerFileId: part.manager_file_id ?? null,
  managerItemId: part.manager_item_id ?? null,
  managerSeriesId: part.manager_series_id ?? null,
  sectionId: part.section_id != null ? String(part.section_id) : null,
})

const virtualRowOf = ({ parts, shownTitle, nowMs }) => {
  const [first] = parts
  const isEpisode = first.kind === 'episode'
  const watchedMs = numberOrNull(first.watched_at)
  const lastViewedMs = numberOrNull(first.last_viewed_at)
  const row = {
    recording_id: itemIdOf(first.rating_key),
    source: 'plex',
    plex_kind: first.kind,
    rating_key: String(first.rating_key),
    section_id: first.section_id,
    title: isEpisode ? shownTitle || first.show_title || first.title : first.title,
    plex_show_title: first.show_title ?? null,
    plex_show_rating_key: first.show_rating_key ?? null,
    episode_title: isEpisode ? first.title ?? null : null,
    season: isEpisode ? first.season ?? null : null,
    episode: isEpisode ? first.episode ?? null : null,
    year: first.year ?? null,
    aired_at: numberOrNull(first.aired_at),
    duration_s: numberOrNull(first.duration_s),
    synopsis: first.synopsis ?? null,
    status: 'done',
    file_path: first.file_path,
    imported_at: isoOf(first.added_at),
    added_at: numberOrNull(first.added_at),
    watched_at: watchedMs ? isoOf(watchedMs) : null,
    played_at: lastViewedMs ? isoOf(lastViewedMs) : null,
    playback_position_s: first.view_offset_s > 0 ? first.view_offset_s : null,
    library_state: null,
    purged_at: null,
    deleted_from_tvh_at: isoOf(first.added_at) || PLEX_ONLY,
    show_id: null,
    image_url: itemImageUrlOf({ ratingKey: first.rating_key, kind: 'thumb', width: CARD_IMAGE_WIDTH }),
    versions: parts.map(versionOf),
  }
  return { ...row, plex_new: isNewPlexRow({ row, nowMs }) }
}

const itemRowOf = ({ item, media, part, section, recordingIndex, roots, seenAt }) => {
  const isEpisode = section.type === 'show'
  const plexFile = part.file || null
  const localFile = localPathOf({ plexFile, roots })
  const viewed = Number(item.viewCount) > 0
  const lastViewedMs = secondsToMs(item.lastViewedAt)
  return {
    rating_key: String(item.ratingKey),
    part_id: String(part.id ?? `${media.id ?? 0}-${plexFile}`),
    media_id: media.id != null ? String(media.id) : null,
    section_id: String(section.id),
    kind: isEpisode ? 'episode' : 'movie',
    show_title: isEpisode ? item.grandparentTitle ?? null : null,
    show_rating_key: isEpisode && item.grandparentRatingKey != null ? String(item.grandparentRatingKey) : null,
    season: isEpisode ? integerOrNull(item.parentIndex) : null,
    episode: isEpisode ? integerOrNull(item.index) : null,
    title: item.title ?? null,
    year: integerOrNull(item.year),
    aired_at: dateMsOf(item.originallyAvailableAt),
    duration_s: item.duration ? Math.round(Number(item.duration) / 1000) : null,
    added_at: secondsToMs(item.addedAt),
    synopsis: item.summary || null,
    file_path: localFile,
    plex_file: plexFile,
    size_bytes: numberOrNull(part.size),
    video_codec: media.videoCodec ?? null,
    resolution: media.videoResolution ?? null,
    audio_codec: media.audioCodec ?? null,
    thumb: item.thumb ?? item.grandparentThumb ?? null,
    art: item.grandparentArt ?? item.art ?? null,
    watched_at: viewed ? lastViewedMs ?? seenAt : null,
    view_offset_s: item.viewOffset ? Math.round(Number(item.viewOffset) / 1000) : 0,
    last_viewed_at: lastViewedMs,
    pending_push: null,
    recording_id: recordingIdForFile({ files: [localFile, plexFile], recordingIndex }),
    manager: null,
    manager_file_id: null,
    manager_item_id: null,
    manager_series_id: null,
    seen_at: seenAt,
  }
}

const recordingIdForFile = ({ files, recordingIndex }) => {
  for (const file of files) {
    const found = findInPathIndex({ index: recordingIndex, filePath: file })
    if (found) return found.recordingId
  }
  return null
}

const partsOf = (item) => (Array.isArray(item?.Media) ? item.Media : [])
  .flatMap((media) => (Array.isArray(media?.Part) ? media.Part : []).map((part) => ({ media, part })))

const slotKeyOf = ({ key, season, episode }) => `${key}|${season}|${episode}`

const lastSegmentOf = (filePath) => segmentsOf(filePath).at(-1) ?? ''

const segmentsOf = (filePath) => path.normalize(String(filePath)).split(/[\\/]+/).filter(Boolean)

const isInside = (file, root) => {
  const relative = path.relative(root, file)
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
}

const groupBy = (items, keyOf) => {
  const groups = new Map()
  for (const item of items) {
    const key = keyOf(item)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  return groups
}

const dateMsOf = (text) => {
  if (!text) return null
  const ms = Date.parse(`${text}T00:00:00Z`)
  return Number.isFinite(ms) ? ms : null
}

const secondsToMs = (seconds) => (Number(seconds) > 0 ? Number(seconds) * 1000 : null)

const isoOf = (ms) => (Number(ms) > 0 ? new Date(Number(ms)).toISOString() : null)

const integerOrNull = (value) => (Number.isInteger(Number(value)) && value != null && value !== '' ? Number(value) : null)

const numberOrNull = (value) => {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const MATCH_SEGMENTS = 3
const TRAILING_TAGS = /(\s*\((?:\d{4}|[A-Za-z]{2,3})\))+\s*$/
const PLEX_ONLY = '1970-01-01T00:00:00.000Z'
const CARD_IMAGE_WIDTH = 384
