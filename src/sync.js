import path from 'path'
import fs from 'fs/promises'

import { db, getSetting, setSetting } from './db.js'
import { notifyPlexSectionRefresh } from './plex.js'
import {
  fetchProgrammeImage,
  listAutorecs,
  listFinished,
  listUpcoming,
  removeRecordings as removeTvhRecordings,
  resolveConnection,
  TvheadendError,
} from './tvheadend.js'
import { processRecordingAds, pruneCutOriginals, shouldQueueAutoDelete } from './commercials.js'
import { makeImportProgress } from './progress.js'
import { sweepLibraryStates } from './library-files.js'
import { findArtwork, pruneRecordingArtwork, removeArtwork, saveArtwork } from './artwork.js'
import { pruneSyncHistory } from './sync-history.js'
import { looksLikeFilm } from './film-rule.js'
import { createClassificationLookup, createClassificationStore } from './classification-labels.js'
import { currentJob, trackJob } from './activity.js'
import { rowAiringOf, seriesKindOf } from './series-kind.js'
import { loadSeriesEvidence } from './series-evidence.js'
import { ONE_OFF_KIND, loadKindOverrides } from './programme-kind.js'
import { ensureShowFolder } from './show-folders.js'
import { showKeyOf } from './web/show-key.js'

export const getActiveSyncId = () => inFlight?.syncId ?? null

export const startSync = async (options = {}) => {
  while (starting) await starting.catch(() => {})
  if (inFlight) return { syncId: inFlight.syncId, alreadyRunning: true }
  const attempt = beginSync(options)
  starting = attempt
  try {
    return await attempt
  } finally {
    if (starting === attempt) starting = null
  }
}

const beginSync = async ({ trigger = 'manual', showId = null }) => {
  const missingUrl = await tvheadendUrlMissing()
  if (missingUrl && AUTOMATIC_TRIGGERS.includes(trigger)) return { skipped: true, reason: missingUrl.message }
  if (missingUrl) throw missingUrl

  const syncId = await createSync(trigger, showId)
  const promise = trackJob({ kind: 'sync', title: `Sync #${syncId}`, trigger, ref: { syncId } }, () => doSync({ syncId, trigger, showId }))
    .catch((err) => {
      console.error('[sync] unhandled error:', err)
    })
    .finally(() => {
      inFlight = null
      syncFinishedListeners.forEach((listener) => notifySyncFinished({ listener, syncId, trigger }))
    })
  inFlight = { syncId, promise }
  return { syncId, alreadyRunning: false }
}

export const onSyncFinished = (listener) => {
  syncFinishedListeners.add(listener)
  return () => syncFinishedListeners.delete(listener)
}

const notifySyncFinished = ({ listener, syncId, trigger }) => {
  try {
    listener({ syncId, trigger })
  } catch (err) {
    console.warn(`[sync] finish listener failed: ${err.message}`)
  }
}

const syncFinishedListeners = new Set()
let starting = null

export const matchShow = (shows, showTitle) => {
  const t = showTitle.toLowerCase()
  return shows
    .filter((s) => t.includes(s.show_pattern.toLowerCase()))
    .sort((a, b) => b.show_pattern.length - a.show_pattern.length)[0]
}

export const libraryDecision = ({ existing, libraryChoice, show, importUnmatched }) => {
  if (existing?.library_choice === 'exclude') return { action: 'hold', reason: HOLD_REASONS.excluded }
  if (existing?.library_choice === 'include') return { action: 'import' }
  if (libraryChoice === 'exclude') return { action: 'hold', reason: HOLD_REASONS.recordedOff }
  if (show || importUnmatched || libraryChoice === 'include') return { action: 'import' }
  return { action: 'hold', reason: HOLD_REASONS.noRule }
}

export const rebaseFilePaths = async () => {
  const roots = [
    { key: 'last_media_root', current: await getMediaRoot() },
    { key: 'last_oneoff_root', current: await getOneOffRoot() },
    { key: 'last_movies_root', current: await getMoviesRoot() },
  ].filter((root) => root.current)
  let moved = 0
  for (const { key, current } of roots) {
    const previous = await getSetting(key)
    if (previous === current) continue
    if (previous) moved += await rebasePrefix({ from: previous, to: current })
    await setSetting(key, current)
  }
  return moved
}

export const rebasePrefix = ({ from, to }) => {
  const oldRoot = from.replace(/\/+$/, '')
  const newRoot = to.replace(/\/+$/, '')
  return db('recordings')
    .where('file_path', 'like', `${oldRoot}/%`)
    .update({ file_path: db.raw('? || substr(file_path, ?)', [newRoot, oldRoot.length + 1]) })
}

export const resetInterruptedImports = () =>
  db('recordings').where({ status: 'importing' }).update({ status: 'pending', error: null })

export const INTERRUPTED_SYNC_ERROR = 'Freetvarr restarted before this sync finished.'

export const interruptedSyncSummaryOf = (summaryJson) => {
  const summary = parseSummary(summaryJson)
  return { ...summary, errors: [...(summary.errors || []), INTERRUPTED_SYNC_ERROR] }
}

export const closeInterruptedSyncs = async () => {
  const stuck = await db('syncs').where({ status: 'running' }).whereNull('finished_at').select('id', 'summary_json')
  for (const { id, summary_json } of stuck) {
    await db('syncs').where({ id }).update({
      status: 'error',
      finished_at: db.fn.now(),
      summary_json: JSON.stringify(interruptedSyncSummaryOf(summary_json)),
    })
  }
  return stuck.length
}

const parseSummary = (summaryJson) => {
  try { return JSON.parse(summaryJson || '{}') || {} } catch { return {} }
}

export const getMoviesRoot = async () => {
  const fromSetting = await getSetting('movies_root')
  if (fromSetting != null) return fromSetting.trim()
  return (process.env.MOVIES_ROOT || '').trim()
}

export { looksLikeFilm }

export const filmName = (item) => {
  const title = createValidFilename(item.title) || 'Film'
  return item.year ? `${title} (${item.year})` : title
}

export const buildFilmPath = ({ item, moviesRoot, copy = 1 }) => {
  const name = filmName(item)
  const suffix = copy > 1 ? ` (${copy})` : ''
  const dest = path.join(moviesRoot, name, `${name}${suffix}.${item.ext || 'ts'}`)
  return guardWithinRoot({ dest, root: moviesRoot })
}

export const libraryKind = ({ show, item, moviesRoot, override = null, evidence = null, keyRows = [] }) => {
  const kind = IMPORT_KINDS[seriesKindOf({
    title: item.title,
    override,
    hasRule: Boolean(show) || Boolean(item.autorecId),
    isFilm: Boolean(moviesRoot) && looksLikeFilm(item),
    recordings: [...keyRows, importAiringOf(item)],
    evidence,
  })]
  return kind === 'film' && !moviesRoot ? 'oneOff' : kind
}

export const importAiringOf = (item) => ({
  start: item.start,
  season: item.season ?? null,
  episode: item.episode ?? null,
  episodeTitle: item.episode_title ?? null,
  genres: item.genres || [],
})

const IMPORT_KINDS = { show: 'tv', movie: 'film', oneoff: 'oneOff' }

export const getOneOffRoot = async () => {
  const fromSetting = await getSetting('oneoff_root')
  if (fromSetting && fromSetting.trim()) return fromSetting.trim()
  return process.env.ONEOFF_ROOT || DEFAULT_ONEOFF_ROOT
}

export const getMediaRoot = async () => {
  const fromSetting = await getSetting('media_root')
  if (fromSetting && fromSetting.trim()) return fromSetting.trim()
  return process.env.MEDIA_ROOT || DEFAULT_MEDIA_ROOT
}

export const getRecordingsRoot = async () => {
  const fromSetting = await getSetting('recordings_root')
  if (fromSetting && fromSetting.trim()) return fromSetting.trim()
  return process.env.RECORDINGS_ROOT || DEFAULT_RECORDINGS_ROOT
}

export const getTvhRecordingsPath = async () => {
  const fromSetting = await getSetting('tvh_recordings_path')
  if (fromSetting && fromSetting.trim()) return fromSetting.trim()
  return process.env.TVH_RECORDINGS_PATH || DEFAULT_RECORDINGS_ROOT
}

export const localPathFor = ({ tvhFilename, tvhRecordingsPath, recordingsRoot }) => {
  const remoteRoot = tvhRecordingsPath.replace(/\/+$/, '')
  const localRoot = recordingsRoot.replace(/\/+$/, '')
  if (tvhFilename === remoteRoot) return localRoot
  if (!tvhFilename.startsWith(`${remoteRoot}/`)) return null
  return path.join(localRoot, tvhFilename.slice(remoteRoot.length + 1))
}

export const createValidFilename = (name) =>
  String(name)
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const isNumberOnlyTitle = (title) => /^episode \d+( of season \d+)?$/i.test(String(title ?? '').trim())

export const episodeFilename = ({ item, show }) => {
  const base = createValidFilename(show.dest_folder)
  const suffix = item.episode_title ? ` - ${createValidFilename(item.episode_title)}` : ''
  const ext = item.ext || 'ts'
  if (item.season != null && item.episode != null) {
    const numberedSuffix = isNumberOnlyTitle(item.episode_title) ? '' : suffix
    const ss = String(item.season).padStart(2, '0')
    const ee = String(item.episode).padStart(2, '0')
    return `${base} - S${ss}E${ee}${numberedSuffix}.${ext}`
  }
  const aired = new Date(item.start).toISOString().slice(0, 10)
  return `${base} - ${aired}${suffix}.${ext}`
}

export const oneOffFilename = (item) => {
  const title = createValidFilename(item.title) || 'Recording'
  const suffix = item.episode_title ? ` - ${createValidFilename(item.episode_title)}` : ''
  return `${title} - ${localStamp(item.start)}${suffix}.${item.ext || 'ts'}`
}

export const buildOneOffPath = ({ item, oneOffRoot }) => {
  const folder = createValidFilename(item.title) || 'Recording'
  return guardWithinRoot({ dest: path.join(oneOffRoot, folder, oneOffFilename(item)), root: oneOffRoot })
}

export const buildDestPath = ({ item, show, mediaRoot }) => {
  const seasonDir = seasonFolderName({ template: show.season_template, season: item.season ?? 0 })
  const dest = path.join(mediaRoot, show.dest_folder, seasonDir, episodeFilename({ item, show }))
  return guardWithinRoot({ dest, root: mediaRoot, label: `${show.dest_folder}/${seasonDir}` })
}

export const seasonFolderName = ({ template, season }) => {
  const seasonRaw = String(season)
  const seasonPadded = /^\d+$/.test(seasonRaw) ? seasonRaw.padStart(2, '0') : seasonRaw
  return (template || 'Season {season}')
    .replaceAll('{season}', seasonPadded)
    .replaceAll('{season_padded}', seasonPadded)
    .replaceAll('{season_unpadded}', seasonRaw)
}

const guardWithinRoot = ({ dest, root, label = dest }) => {
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(dest)
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`destination escapes media root: ${label}`)
  }
  return dest
}

const localStamp = (ms) => {
  const d = new Date(ms)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}`
}

export const classifyImport = ({ expectedSize, actualSize, tolerance = SIZE_TOLERANCE_BYTES }) => {
  const expectedKnown = Number.isFinite(expectedSize) && expectedSize > 0
  const actualKnown = Number.isFinite(actualSize) && actualSize >= 0
  const shortfall = expectedKnown && actualKnown ? expectedSize - actualSize : 0
  if (shortfall > tolerance) {
    return {
      dbStatus: 'partial',
      summaryKey: 'failed',
      sizeToStore: actualSize,
      error: `short copy: on-disk ${actualSize} bytes vs TVHeadend ${expectedSize} bytes (Δ ${shortfall})`,
    }
  }
  return {
    dbStatus: 'done',
    summaryKey: 'imported',
    sizeToStore: actualKnown ? actualSize : expectedSize,
    error: null,
  }
}

const tvheadendUrlMissing = () =>
  resolveConnection().then(() => null, (err) => (err.code === 'no-url' ? err : Promise.reject(err)))

const doSync = async ({ syncId, trigger, showId = null }) => {
  const summary = { trigger, imported: 0, skipped: 0, failed: 0, errors: [], items: [], steps: {} }
  const timeStep = startStepTimer(summary.steps)
  if (showId != null) summary.showId = showId
  const deletables = []
  const imported = { tv: 0, oneOff: 0, film: 0 }
  const roots = {
    mediaRoot: await getMediaRoot(),
    oneOffRoot: await getOneOffRoot(),
    moviesRoot: await getMoviesRoot(),
  }
  const recordingsRoot = await getRecordingsRoot()
  const tvhRecordingsPath = await getTvhRecordingsPath()
  const importUnmatched = (await getSetting('import_unmatched')) !== 'false'

  let shows, finished, conn
  try {
    shows = await db('shows').where({ enabled: true })
    if (showId != null && !shows.some((s) => s.id === showId)) {
      summary.message = `show_id ${showId} not found or not enabled`
      await finishSync(syncId, 'error', summary)
      return
    }
    conn = await resolveConnection()
    finished = await timeStep('list', () => listFinished(conn))
    await captureUpcomingArtwork(conn).catch((err) => console.warn(`[sync] artwork capture: ${err.message}`))
  } catch (err) {
    summary.errors.push(err.message)
    await finishSync(syncId, 'error', summary)
    return
  }

  const classificationOf = await recordingClassifications(finished)
  const context = await importContextOf({ conn })
  const importsStartedAt = Date.now()
  currentJob()?.step(SYNC_STEP_LABELS.imports).total(finished.length, 'recordings')
  for (const entry of finished) {
    currentJob()?.advance()
    const show = matchShow(shows, entry.name)
    if (showId != null && show?.id !== showId) continue
    const item = { ...toItem({ entry, tvhRecordingsPath, recordingsRoot }), classification: classificationOf(entry) }
    try {
      const existing = await saveRecordingDetails({ item, show, conn })
      const decision = libraryDecision({ existing, libraryChoice: entry.libraryChoice, show, importUnmatched })
      if (decision.action === 'hold') {
        await holdRecording({ item, existing, reason: decision.reason })
        continue
      }
      const keyOfItem = showKeyOf(existing?.show_title_override ?? item.title)
      const override = context.overrides.get(keyOfItem) ?? null
      const kind = libraryKind({
        show: override === ONE_OFF_KIND ? null : show,
        item,
        moviesRoot: roots.moviesRoot,
        override,
        evidence: context.evidence.get(keyOfItem) ?? null,
        keyRows: (context.rowsByKey.get(keyOfItem) || []).filter((row) => row.recording_id !== item.id).map(rowAiringOf),
      })
      const folder = kind === 'tv' ? show ?? await folderForSeries({ item, shows, autorecNames: context.autorecNames }) : null
      const itemStartedAt = Date.now()
      const { summaryKey, adResult, size, error } = await processItem({ item, show: folder, kind, roots })
      summary[summaryKey]++
      if (summaryKey !== 'skipped') {
        noteItem({ summary, item, kind, outcome: summaryKey, size, error, adResult, ms: Date.now() - itemStartedAt })
      }
      if (summaryKey === 'imported') imported[kind]++
      if (adResult) accumulateAdSummary(summary, adResult)
      if (
        summaryKey === 'imported'
        && folder?.delete_after_import
        && shouldQueueAutoDelete({ show: folder, adResult })
      ) {
        deletables.push({ recording_id: item.id, title: item.title })
      }
    } catch (err) {
      summary.failed++
      summary.errors.push(`${item.title}: ${err.message}`)
      noteItem({ summary, item, outcome: 'failed', error: err.message })
    }
  }
  summary.steps.imports = Date.now() - importsStartedAt

  if (imported.tv > 0) summary.plex = await timeStep('plexTv', () => notifyPlexSectionRefresh())
  if (imported.oneOff > 0) summary.plexOneOffs = await timeStep('plexOneOffs', () => refreshSection('plex_oneoff_section_id'))
  if (imported.film > 0) summary.plexMovies = await timeStep('plexMovies', () => refreshSection('plex_movies_section_id'))
  if (deletables.length > 0) {
    summary.delete = await timeStep('removals', () => runAutoDelete(deletables, summary.plex))
    markRemovedItems({ items: summary.items, removedIds: summary.delete.removed })
  }
  await timeStep('libraryCheck', () => sweepLibraryStates())
    .catch((err) => console.warn(`[sync] library check: ${err.message}`))

  const finalStatus = summary.failed > 0 ? 'partial' : 'ok'
  await finishSync(syncId, finalStatus, summary)
}

const importContextOf = async ({ conn }) => {
  const [overrides, evidence, rows, autorecs] = await Promise.all([
    loadKindOverrides().catch(() => new Map()),
    loadSeriesEvidence().catch(() => new Map()),
    db('recordings').whereNull('purged_at')
      .select('recording_id', 'title', 'show_title_override', 'season', 'episode', 'episode_title', 'aired_at', 'imported_at', 'genres_json')
      .catch(() => []),
    listAutorecs(conn).catch(() => []),
  ])
  return {
    overrides,
    evidence,
    rowsByKey: rowsByShowKey(rows),
    autorecNames: new Map(autorecs.map((autorec) => [autorec.id, autorec.name])),
  }
}

const rowsByShowKey = (rows) => {
  const groups = new Map()
  for (const row of rows) {
    const key = showKeyOf(row.show_title_override ?? row.title)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  return groups
}

const folderForSeries = async ({ item, shows, autorecNames }) => {
  const title = (item.autorecId && autorecNames.get(item.autorecId)) || item.title
  const created = await ensureShowFolder({ title, shows })
  if (!shows.some((show) => show.id === created.id)) shows.push(created)
  return created
}

const recordingClassifications = async (entries) => {
  const sourceOf = (entry) => ({
    title: entry.name,
    start: entry.startDate,
    rating: entry.rating,
    ratingLabel: entry.ratingLabel,
  })
  const lookup = await createClassificationLookup({ programmes: entries.map(sourceOf), store: classificationStore })
  return (entry) => lookup(sourceOf(entry))
}

const toItem = ({ entry, tvhRecordingsPath, recordingsRoot }) => ({
  id: entry.uuid,
  title: entry.name,
  episode_title: entry.episodeTitle,
  season: entry.season,
  episode: entry.episode,
  start: entry.startDate,
  end: entry.endDate,
  size: entry.filesize,
  statusText: entry.statusText,
  channelId: entry.channelId || null,
  channelName: entry.channelName,
  description: entry.description,
  image: entry.image,
  genres: entry.genres || [],
  year: entry.year ?? null,
  tvhFilename: entry.filename || null,
  autorecId: entry.autorecId || null,
  sourcePath: entry.filename
    ? localPathFor({ tvhFilename: entry.filename, tvhRecordingsPath, recordingsRoot })
    : null,
  ext: entry.filename ? path.extname(entry.filename).slice(1) || 'ts' : 'ts',
})

const saveRecordingDetails = async ({ item, show = null, conn }) => {
  const details = {
    title: item.title,
    episode_title: item.episode_title || null,
    season: item.season,
    episode: item.episode,
    channel_id: item.channelId,
    channel_name: item.channelName,
    aired_at: item.start,
    duration_s: item.end > item.start ? Math.round((item.end - item.start) / 1000) : null,
    synopsis: item.description,
    image_url: item.image,
    tvh_filename: item.tvhFilename,
    genres_json: JSON.stringify(item.genres || []),
    ...(item.year ? { year: item.year } : {}),
  }
  await db('recordings')
    .insert({ recording_id: item.id, status: 'pending', show_id: show?.id ?? null, ...details, classification: item.classification ?? null })
    .onConflict('recording_id')
    .merge({ ...details, classification: db.raw('coalesce(recordings.classification, excluded.classification)') })
  const row = await db('recordings').where({ recording_id: item.id }).first()
  if (!row.image_checked_at) await saveRecordingImage({ item, conn })
  return row
}

export const captureRecordingArtwork = async ({ recordingId, source, conn }) => {
  if (!source || failedArtworkSources.has(source)) return null
  if (await findArtwork({ kind: 'recording', id: recordingId })) return null
  const image = await fetchProgrammeImage({ source, conn })
  if (!image) {
    failedArtworkSources.add(source)
    return null
  }
  return saveArtwork({ kind: 'recording', id: recordingId, image })
}

const captureUpcomingArtwork = async (conn) => {
  const upcoming = (await listUpcoming(conn)).filter((e) => e.enabled && e.image)
  for (const entry of upcoming) {
    await captureRecordingArtwork({ recordingId: entry.uuid, source: entry.image, conn }).catch(() => null)
  }
}

const saveRecordingImage = async ({ item, conn }) => {
  await captureRecordingArtwork({ recordingId: item.id, source: item.image, conn }).catch(() => null)
  const imagePath = (await findArtwork({ kind: 'recording', id: item.id }))
    ? `recordings/${item.id}`
    : null
  await db('recordings').where({ recording_id: item.id }).update({
    image_path: imagePath,
    image_checked_at: db.fn.now(),
  })
}

const holdRecording = async ({ item, existing, reason }) => {
  if (['done', 'importing'].includes(existing?.status) || existing?.deleted_from_tvh_at) return
  await db('recordings').where({ recording_id: item.id }).update({
    status: 'not_imported',
    error: reason,
    file_path: null,
  })
}

export const refreshSection = async (key) => {
  const sectionId = await getSetting(key)
  if (!sectionId) return { skipped: true, reason: 'no Plex library chosen for these recordings' }
  return notifyPlexSectionRefresh({ sectionId })
}

const destinationFor = ({ item, show, kind, roots }) => freeDestination({
  candidateFor: candidateBuilderFor({ item, show, kind, roots }),
  recordingId: item.id,
  sourcePath: item.sourcePath,
})

const candidateBuilderFor = ({ item, show, kind, roots }) => {
  if (kind === 'film') return (copy) => buildFilmPath({ item, moviesRoot: roots.moviesRoot, copy })
  const base = kind === 'tv'
    ? buildDestPath({ item, show, mediaRoot: roots.mediaRoot })
    : buildOneOffPath({ item, oneOffRoot: roots.oneOffRoot })
  return (copy) => withCopySuffix(base, copy)
}

export const withCopySuffix = (filePath, copy) => {
  if (copy <= 1) return filePath
  const ext = path.extname(filePath)
  return path.join(path.dirname(filePath), `${path.basename(filePath, ext)} - copy ${copy}${ext}`)
}

export const freeDestination = async ({
  candidateFor,
  recordingId,
  sourcePath = null,
  ownersOf = recordingIdsAt,
  statOf = statOrNull,
}) => {
  const source = sourcePath ? await statOf(sourcePath) : null
  for (let copy = 1; ; copy++) {
    const filePath = candidateFor(copy)
    if (await isFreeFor({ filePath, recordingId, source, ownersOf, statOf })) {
      return { filePath, takenPath: copy > 1 ? candidateFor(1) : null }
    }
  }
}

const isFreeFor = async ({ filePath, recordingId, source, ownersOf, statOf }) => {
  const owners = (await ownersOf(filePath)).map(String)
  if (owners.some((owner) => owner !== String(recordingId))) return false
  if (owners.length) return true
  const existing = await statOf(filePath)
  return !existing || isSameFile(existing, source)
}

const isSameFile = (a, b) => Boolean(b) && a.dev === b.dev && a.ino === b.ino

const recordingIdsAt = (filePath) => db('recordings').where({ file_path: filePath }).pluck('recording_id')

const statOrNull = (filePath) => fs.stat(filePath).catch(() => null)

const processItem = async ({ item, show, kind, roots }) => {
  const existing = await db('recordings').where({ recording_id: item.id }).first()
  if (existing?.status === 'done') return { summaryKey: 'skipped' }
  if (existing?.deleted_from_tvh_at) return { summaryKey: 'skipped' }

  if (!item.sourcePath) {
    await upsertRecording({
      item, show, file_path: null, status: 'skipped',
      error: `TVHeadend file path is outside the recordings mount (${item.statusText || 'no file'})`,
    })
    return { summaryKey: 'skipped' }
  }

  let sourceStat
  try {
    sourceStat = await fs.stat(item.sourcePath)
  } catch {
    await upsertRecording({
      item, show, file_path: null, status: 'skipped',
      error: `file not found at ${item.sourcePath}; check the recordings mount`,
    })
    return { summaryKey: 'skipped' }
  }

  const kindRoot = { oneOff: roots.oneOffRoot, film: roots.moviesRoot }[kind]
  if (kindRoot && !(await isDirectory(kindRoot))) {
    await upsertRecording({
      item, show, file_path: null, status: 'skipped',
      error: `${kind === 'film' ? 'movies' : 'one-off'} folder ${kindRoot} not found; mount it or change it in Settings`,
    })
    return { summaryKey: 'skipped' }
  }

  const { filePath, takenPath } = await destinationFor({ item, show, kind, roots })
  return trackJob(
    { kind: 'import', title: `Import · ${itemLabelOf(item)}`, ref: { recordingId: item.id } },
    (job) => importItem({ item, show, filePath, takenPath, sourceStat, job }),
  )
}

const importItem = async ({ item, show, filePath, takenPath, sourceStat, job }) => {
  job.fact('Recording', recordingFactOf(item)).fact('File', filePath).fact('Size', formatBytes(sourceStat.size))
  if (takenPath) noteTakenPath({ takenPath, filePath, job })
  job.step('Copy from TVHeadend')
  await upsertRecording({ item, show, file_path: filePath, status: 'importing', error: null })
  await fs.mkdir(path.dirname(filePath), { recursive: true })

  await importFile({ sourcePath: item.sourcePath, filePath, size: sourceStat.size, recordingId: item.id })

  let actualSize = null
  try {
    actualSize = (await fs.stat(filePath)).size
  } catch {
    actualSize = null
  }

  job.step('Check the file')
  const outcome = classifyImport({ expectedSize: sourceStat.size, actualSize })
  if (outcome.error) job.log(outcome.error, 'warn')
  const statusNote = item.statusText && item.statusText !== 'Completed OK'
    ? `TVHeadend reported: ${item.statusText}`
    : null
  await db('recordings').where({ recording_id: item.id }).update({
    status: outcome.dbStatus,
    error: outcome.error || statusNote,
    size: outcome.sizeToStore,
    imported_at: db.fn.now(),
  })

  let adResult = null
  if (outcome.dbStatus === 'done' && show && show.ad_removal !== 'off') {
    const adRemovalEnabled = (await getSetting('ad_removal_enabled')) === 'true'
    if (adRemovalEnabled) {
      job.fact('Ad removal', show.ad_removal === 'cut' ? 'Cut ads' : 'Mark ads')
      adResult = await processRecordingAds({ filePath, mode: show.ad_removal, recordingId: item.id, title: itemLabelOf(item) })
    }
  }
  job.outcome(importOutcomeOf({ outcome, adResult }))
  if (outcome.summaryKey === 'failed') job.fail(outcome.error || 'Import failed')
  return { summaryKey: outcome.summaryKey, adResult, size: outcome.sizeToStore, error: outcome.error }
}

const noteItem = ({ summary, item, kind = null, outcome, size = null, error = null, adResult = null, ms = null }) => {
  if (summary.items.length >= SYNC_ITEMS_CAP) {
    summary.itemsOmitted = (summary.itemsOmitted || 0) + 1
    return
  }
  summary.items.push({
    id: item.id,
    title: item.title,
    episodeTitle: item.episode_title || null,
    season: item.season ?? null,
    episode: item.episode ?? null,
    channel: item.channelName || null,
    airedAt: item.start || null,
    durationS: item.end > item.start ? Math.round((item.end - item.start) / 1000) : null,
    kind,
    outcome,
    size,
    error,
    ads: adResult ? { status: adResult.status, adSeconds: adResult.adSeconds } : null,
    ms,
  })
}

const markRemovedItems = ({ items, removedIds = [] }) => {
  const removed = new Set(removedIds.map(String))
  for (const item of items) if (removed.has(String(item.id))) item.removedFromTvh = true
}

const startStepTimer = (steps) => async (name, run) => {
  const startedAt = Date.now()
  currentJob()?.step(SYNC_STEP_LABELS[name] ?? name)
  try {
    return await run()
  } finally {
    steps[name] = Date.now() - startedAt
  }
}

const takenPathNote = ({ takenPath, filePath }) =>
  `${path.basename(takenPath)} is already in that folder and is not this recording, so it stays untouched; saving as ${path.basename(filePath)}`

const noteTakenPath = ({ takenPath, filePath, job }) => {
  const note = takenPathNote({ takenPath, filePath })
  console.warn(`[sync] ${note}`)
  job.log(note, 'warn')
}

const isDirectory = async (dir) => (await fs.stat(dir).catch(() => null))?.isDirectory() ?? false

const importFile = async ({ sourcePath, filePath, size, recordingId }) => {
  const existing = await fs.stat(filePath).catch(() => null)
  if (existing && existing.size === size) return
  await fs.rm(filePath, { force: true })
  try {
    await fs.link(sourcePath, filePath)
    return
  } catch {
    /* different filesystem or link unsupported; fall through to copy */
  }
  const progress = makeImportProgress(recordingId)
  progress.setTotal(size)
  const ticker = setInterval(async () => {
    const st = await fs.stat(filePath).catch(() => null)
    if (st) progress.update(st.size)
  }, PROGRESS_TICK_MS)
  try {
    await fs.copyFile(sourcePath, filePath)
  } finally {
    clearInterval(ticker)
    progress.stop()
  }
}

const accumulateAdSummary = (summary, adResult) => {
  if (!summary.ads) summary.ads = { scanned: 0, detected: 0, cut: 0, failed: 0, adSeconds: 0 }
  summary.ads.scanned++
  if (adResult.status === 'detected') summary.ads.detected++
  if (adResult.status === 'cut') summary.ads.cut++
  if (adResult.status === 'detect_failed' || adResult.status === 'cut_failed') summary.ads.failed++
  summary.ads.adSeconds += adResult.adSeconds
}

const runAutoDelete = async (deletables, plex) => {
  const ids = deletables.map((d) => d.recording_id)

  const guardSettingRaw = (await getSetting('delete_after_plex_refresh_only')) ?? 'true'
  const guardOn = guardSettingRaw !== 'false'
  const plexAttemptedAndFailed = guardOn && plex && !plex.triggered
  const plexUnconfigured = plex?.skipped && plex?.reason === 'plex not configured'
  if (plexAttemptedAndFailed && !plexUnconfigured) {
    return {
      skipped: true,
      reason: `plex refresh did not succeed (${plex.error || plex.reason || 'unknown'})`,
      candidates: ids.length,
    }
  }

  try {
    const result = await removeTvhRecordings({ recordingIds: ids })
    const now = new Date().toISOString()
    await db('recordings').whereIn('recording_id', result.removed).update({ deleted_from_tvh_at: now })
    return { triggered: true, removed: result.removed, unmapped: result.unknown, removed_at: now }
  } catch (err) {
    const stage = err instanceof TvheadendError ? err.stage : 'unknown'
    const code = err instanceof TvheadendError ? err.code : undefined
    console.error(`[tvheadend] remove-after-import failed for ${ids.length} recording(s) (stage ${stage}): ${err.message}`)
    return { error: err.message, stage, code, candidates: ids.length }
  }
}

const createSync = async (trigger, showId = null) => {
  const seed = { trigger }
  if (showId != null) seed.showId = showId
  const inserted = await db('syncs').insert({
    status: 'running',
    summary_json: JSON.stringify(seed),
  }).returning('id')
  const row = inserted[0]
  return typeof row === 'object' ? row.id : row
}

const finishSync = async (syncId, status, summary) => {
  const job = currentJob()
  job?.outcome(syncOutcomeOf(summary))
  if (status === 'error') job?.fail(summary.errors?.[0] || summary.message || 'Sync failed')
  for (const error of summary.errors ?? []) job?.log(error, 'error')
  await db('syncs').where({ id: syncId }).update({
    status,
    finished_at: db.fn.now(),
    summary_json: JSON.stringify(summary),
  })
  await pruneSyncHistory({ db })
  await pruneTombstonedRecordings()
  await pruneCutOriginals()
}

const pruneTombstonedRecordings = async () => {
  await db('recordings')
    .whereNotNull('deleted_from_tvh_at')
    .andWhereRaw(
      `datetime(deleted_from_tvh_at) < datetime('now', '-${RECORDING_TOMBSTONE_TTL_DAYS} days')`
    )
    .delete()
  const kept = await db('recordings').select('recording_id')
  await pruneRecordingArtwork({ keepIds: kept.map((r) => r.recording_id) }).catch(() => 0)
}

export const forgetRecordingArtwork = (recordingId) =>
  removeArtwork({ kind: 'recording', id: recordingId }).catch(() => null)

const upsertRecording = async ({ item, show, file_path, status, error }) => {
  const payload = {
    recording_id: item.id,
    show_id: show?.id ?? null,
    title: item.title,
    episode_title: item.episode_title || null,
    season: item.season,
    episode: item.episode,
    file_path,
    size: item.size > 0 ? item.size : null,
    status,
    error,
    purged_at: null,
  }
  const { recording_id, ...mergeable } = payload
  await db('recordings')
    .insert(payload)
    .onConflict('recording_id')
    .merge(mergeable)
}

export const syncOutcomeOf = (summary) => {
  const parts = [
    summary.imported && `${summary.imported} imported`,
    summary.failed && `${summary.failed} failed`,
    summary.skipped && `${summary.skipped} skipped`,
    summary.delete?.removed?.length && `${summary.delete.removed.length} removed`,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Nothing new'
}

export const importOutcomeOf = ({ outcome, adResult }) => {
  if (outcome.summaryKey === 'failed') return 'Failed'
  const ads = AD_OUTCOMES[adResult?.status]
  return ads ? `Imported · ${ads}` : 'Imported'
}

const itemLabelOf = (item) => {
  const number = item.season != null && item.episode != null ? `S${item.season} E${item.episode}` : null
  return [item.title, number].filter(Boolean).join(' ')
}

const recordingFactOf = (item) => [item.title, item.episode_title, item.channelName].filter(Boolean).join(' · ')

const formatBytes = (bytes) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${Math.round(bytes / 1e6)} MB`)

const AD_OUTCOMES = {
  cut: 'ads cut',
  detected: 'ads marked',
  no_breaks: 'no ads found',
  detect_failed: 'ad scan failed',
  cut_failed: 'ad cut failed',
}

const SYNC_STEP_LABELS = {
  list: 'List finished recordings',
  imports: 'Import new recordings',
  plexTv: 'Refresh Plex TV',
  plexOneOffs: 'Refresh Plex one-offs',
  plexMovies: 'Refresh Plex movies',
  removals: 'Remove from TVHeadend',
  libraryCheck: 'Check the library',
}

const AUTOMATIC_TRIGGERS = ['cron', 'recording-finished']
const DEFAULT_MEDIA_ROOT = '/media/tv'
const DEFAULT_RECORDINGS_ROOT = '/recordings'
const DEFAULT_ONEOFF_ROOT = '/media/one-offs'
const HOLD_REASONS = {
  excluded: 'Kept out of the library',
  recordedOff: 'Recorded with Add to library off',
  noRule: 'No series folder for this title, and Import every recording is off',
}
const SIZE_TOLERANCE_BYTES = 1_000_000
const PROGRESS_TICK_MS = 1000
const SYNC_ITEMS_CAP = 100
const RECORDING_TOMBSTONE_TTL_DAYS = 30

let inFlight = null
const failedArtworkSources = new Set()
const classificationStore = createClassificationStore()
