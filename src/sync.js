import path from 'path'
import fs from 'fs/promises'

import { db, getSetting, setSetting } from './db.js'
import { notifyPlexSectionRefresh } from './plex.js'
import {
  listAutorecs,
  listFinished,
  listRemovedIds,
  listUpcoming,
  removeRecordings as removeTvhRecordings,
  resolveConnection,
  TvheadendError,
} from './tvheadend.js'
import { processRecordingAds, pruneCutOriginals, shouldQueueAutoDelete } from './commercials.js'
import { makeImportProgress } from './progress.js'
import { sweepLibraryStates } from './library-files.js'
import { findArtwork, pruneRecordingArtwork, removeArtwork } from './artwork.js'
import {
  RECORDING_PICTURE_MISSED,
  RECORDING_PICTURE_RETRY,
  RECORDING_PICTURE_DEFERRED,
  RECORDING_PICTURE_SAVED,
  createRecordingPictureRun,
  saveRecordingPicture,
} from './epg.js'
import { pruneSyncHistory } from './sync-history.js'
import { looksLikeFilm } from './film-rule.js'
import { createClassificationLookup, createClassificationStore } from './classification-labels.js'
import { currentJob, trackJob } from './activity.js'
import { importSubjectOf } from './activity-subject.js'
import { isMostlySport, rowAiringOf, seriesKindOf } from './series-kind.js'
import { loadSeriesEvidence } from './series-evidence.js'
import { ONE_OFF_KIND, loadKindOverrides } from './programme-kind.js'
import { ensureShowFolder } from './show-folders.js'
import { showKeyOf } from './web/show-key.js'
import { AUTO_ORIGIN, USER_ORIGIN, isAutoTitleMatch } from './show-origin.js'
import { isSameShowTitle } from './autorec-match.js'
import { loadTitleVariants, withTitleVariants } from './title-variants.js'
import { isLibraryChanging, libraryChangesSettled } from './library-busy.js'
import { lookUpDatabaseIds, needsDatabaseIds } from './database-ids.js'
import { showIdentityFor } from './show-identity.js'
import { ROOT_EMPTY, createRootCheck, getMediaRoot, getMoviesRoot, getOneOffRoot } from './library-roots.js'

export { getMediaRoot, getMoviesRoot, getOneOffRoot }

export const getActiveSyncId = () => inFlight?.syncId ?? null

export const isSyncBusy = () => starting != null || inFlight != null

export const hasSyncStartedSinceBoot = () => syncStartedSinceBoot

export const startSync = async (options = {}) => {
  const deadline = Date.now() + (options.libraryWaitMs ?? LIBRARY_WAIT_MS)
  if (isLibraryChanging()) console.warn('[sync] waiting for a library delete or folder rename to finish before the sync starts')
  while (starting || isLibraryChanging()) {
    if (!(await libraryChangesSettled({ timeoutMs: deadline - Date.now() }))) return giveUpBehindLibraryChange(options)
    while (starting) await starting.catch(() => {})
  }
  if (inFlight) {
    if (options.followUp) followUpTrigger = options.trigger ?? 'manual'
    return { syncId: inFlight.syncId, alreadyRunning: true, ...(options.followUp ? { followUp: true } : {}) }
  }
  const attempt = beginSync(options)
  starting = attempt
  try {
    return await attempt
  } finally {
    if (starting === attempt) starting = null
  }
}

const giveUpBehindLibraryChange = async ({ trigger = 'manual', showId = null }) => {
  const message = LIBRARY_WAIT_ERROR
  console.warn(`[sync] ${message}`)
  const syncId = await createSync(trigger, showId)
  await finishSync(syncId, 'error', { trigger, imported: 0, skipped: 0, failed: 0, errors: [message], items: [], steps: {}, message })
  return { syncId, alreadyRunning: false, gaveUp: true }
}

export const syncErrorLogOf = (err) => err?.stack || String(err?.message ?? err)

const beginSync = async ({ trigger = 'manual', showId = null, identityFor = showIdentityFor }) => {
  const missingUrl = await tvheadendUrlMissing()
  if (missingUrl && AUTOMATIC_TRIGGERS.includes(trigger)) return { skipped: true, reason: missingUrl.message }
  if (missingUrl) throw missingUrl

  const syncId = await createSync(trigger, showId)
  syncStartedSinceBoot = true
  const promise = trackJob({ kind: 'sync', title: `Sync #${syncId}`, trigger, ref: { syncId } }, () => doSync({ syncId, trigger, showId, identityFor }))
    .catch((err) => {
      console.error(`[sync] unhandled error: ${syncErrorLogOf(err)}`)
    })
    .finally(() => {
      inFlight = null
      syncFinishedListeners.forEach((listener) => notifySyncFinished({ listener, syncId, trigger }))
      startFollowUpSync()
    })
  inFlight = { syncId, promise }
  return { syncId, alreadyRunning: false }
}

const startFollowUpSync = () => {
  if (!followUpTrigger) return
  const nextTrigger = followUpTrigger
  followUpTrigger = null
  startSync({ trigger: nextTrigger }).catch((err) => console.warn(`[sync] follow-up sync failed to start: ${err.message}`))
}

let followUpTrigger = null

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
const UPDATE_CHUNK = 500
const LIBRARY_WAIT_MS = 10 * 60 * 1000
const LIBRARY_WAIT_ERROR = 'A library delete or folder rename was still running after 10 minutes, so this sync did not run. The next sync tries again.'
let starting = null
let syncStartedSinceBoot = false

export const matchShow = (shows, showTitle, { sport = false } = {}) => {
  const title = String(showTitle ?? '')
  return shows
    .filter((show) => titleMatchesShow({ show, title, sport }))
    .sort((a, b) => b.show_pattern.length - a.show_pattern.length)[0]
}

const titleMatchesShow = ({ show, title, sport }) => {
  if (isVariantOfShow({ show, title, sport })) return true
  if (!isAutoTitleMatch(show)) return wordPatternOf(show.show_pattern)?.test(title) ?? false
  const sameKey = showKeyOf(show.show_pattern) === showKeyOf(title)
  return sport ? sameKey : sameKey || isSameShowTitle({ title, show: String(show.show_pattern ?? '').trim() })
}

const isVariantOfShow = ({ show, title, sport }) => (show.title_variants || []).some((variant) =>
  showKeyOf(variant) === showKeyOf(title) || (!sport && isSameShowTitle({ title, show: variant })))

const wordPatternOf = (pattern) => {
  const text = String(pattern ?? '').trim()
  if (!text) return null
  if (!wordPatterns.has(text)) wordPatterns.set(text, wordBoundedPattern(text))
  return wordPatterns.get(text)
}

const wordBoundedPattern = (text) => {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const start = WORD_CHAR.test(text.at(0)) ? '(?<![\\p{L}\\p{N}])' : ''
  const end = WORD_CHAR.test(text.at(-1)) ? '(?![\\p{L}\\p{N}])' : ''
  return new RegExp(`${start}${escaped}${end}`, 'iu')
}

const wordPatterns = new Map()
const WORD_CHAR = /[\p{L}\p{N}]/u

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
  const currentRoots = roots.map((root) => root.current)
  let moved = 0
  for (const { key, current } of roots) {
    const previous = await getSetting(key)
    if (previous === current) continue
    if (previous) moved += await rebasePrefix({ from: previous, to: current, keepUnder: currentRoots })
    await setSetting(key, current)
  }
  return moved
}

export const rebasePrefix = ({ from, to, keepUnder = [] }) => {
  const oldRoot = withoutTrailingSlash(from)
  const newRoot = withoutTrailingSlash(to)
  const nestedRoots = keepUnder.map(withoutTrailingSlash).filter((root) => root.startsWith(`${oldRoot}/`))
  return nestedRoots
    .reduce((query, root) => query.whereRaw('substr(file_path, 1, ?) <> ?', [root.length + 1, `${root}/`]), startsWithFolder(db('recordings'), oldRoot))
    .update({ file_path: db.raw('? || substr(file_path, ?)', [newRoot, oldRoot.length + 1]) })
}

const startsWithFolder = (query, root) => query.whereRaw('substr(file_path, 1, ?) = ?', [root.length + 1, `${root}/`])

const withoutTrailingSlash = (root) => root.replace(/\/+$/, '')

export const resetInterruptedImports = () =>
  db('recordings').where({ status: 'importing' }).update({ status: 'pending', error: null })

export const STOPPED_BY_RESTART = 'stopped'

export const closeInterruptedSyncs = async () => {
  const stuck = await db('syncs').where({ status: 'running' }).whereNull('finished_at').select('id', 'summary_json')
  for (const { id } of stuck) {
    await db('syncs').where({ id }).update({ status: STOPPED_BY_RESTART, finished_at: db.fn.now() })
  }
  return stuck.map(({ id, summary_json }) => ({ id, trigger: parseSummary(summary_json).trigger ?? null }))
}

export const noteSyncRanAgain = async ({ ids, syncId, at = new Date() }) => {
  const rows = await db('syncs').whereIn('id', ids).select('id', 'summary_json')
  for (const { id, summary_json } of rows) {
    const summary = { ...parseSummary(summary_json), ranAgainAt: at.toISOString(), ranAgainSyncId: syncId }
    await db('syncs').where({ id }).update({ summary_json: JSON.stringify(summary) })
  }
}

const parseSummary = (summaryJson) => {
  try { return JSON.parse(summaryJson || '{}') || {} } catch { return {} }
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
    hasRule: hasUserRule({ show, item }),
    hasTitleMatch: Boolean(show),
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

export const hasUserRule = ({ show, item }) => Boolean(item?.autorecId) || (Boolean(show) && !isAutoTitleMatch(show))

const isFiled = (existing) => existing?.status === 'done' || Boolean(existing?.deleted_from_tvh_at)

const IMPORT_KINDS = { show: 'tv', movie: 'film', oneoff: 'oneOff' }

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
  const relative = tvhFilename.slice(remoteRoot.length + 1)
  if (relative.split('/').includes('..')) return null
  const result = path.join(localRoot, relative)
  return isInside({ filePath: result, root: localRoot }) ? result : null
}

const isInside = ({ filePath, root }) => {
  const resolvedRoot = path.resolve(root)
  const relative = path.relative(resolvedRoot, path.resolve(filePath))
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

const isInsideRealRoot = async ({ filePath, root }) => {
  const [realFile, realRoot] = await Promise.all([fs.realpath(filePath), fs.realpath(root)]).catch(() => [])
  return Boolean(realFile && realRoot) && isInside({ filePath: realFile, root: realRoot })
}

export const createValidFilename = (name) =>
  String(name)
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const isNumberOnlyTitle = (title) => /^episode \d+( of season \d+)?$/i.test(String(title ?? '').trim())

export const withoutIdHint = (folder) => String(folder ?? '').replace(ID_HINT, ' ').replace(/\s+/g, ' ').trim()

export const episodeFilename = ({ item, show }) => {
  const base = createValidFilename(withoutIdHint(show.dest_folder))
  const suffix = item.episode_title ? ` - ${createValidFilename(item.episode_title)}` : ''
  const ext = item.ext || 'ts'
  if (item.season != null && item.episode != null) {
    const numberedSuffix = isNumberOnlyTitle(item.episode_title) ? '' : suffix
    const ss = String(item.season).padStart(2, '0')
    const ee = String(item.episode).padStart(2, '0')
    return `${base} - S${ss}E${ee}${numberedSuffix}.${ext}`
  }
  return `${base} - ${localDate(item.start)}${suffix}.${ext}`
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

const localDate = (ms) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const localStamp = (ms) => {
  const d = new Date(ms)
  return `${localDate(ms)} ${pad(d.getHours())}${pad(d.getMinutes())}`
}

const pad = (n) => String(n).padStart(2, '0')

export const classifyImport = ({ expectedSize, actualSize, tolerance = SIZE_TOLERANCE_BYTES }) => {
  const expectedKnown = Number.isFinite(expectedSize) && expectedSize > 0
  const actualKnown = Number.isFinite(actualSize) && actualSize >= 0
  const shortfall = expectedKnown && actualKnown ? expectedSize - actualSize : 0
  if (shortfall > tolerance) {
    return {
      dbStatus: 'partial',
      summaryKey: 'failed',
      sizeToStore: actualSize,
      error: `short copy: on-disk ${actualSize} bytes vs source ${expectedSize} bytes (Δ ${shortfall})`,
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

const doSync = async ({ syncId, trigger, showId = null, identityFor }) => {
  const summary = { trigger, imported: 0, skipped: 0, failed: 0, errors: [], items: [], steps: {} }
  const timeStep = startStepTimer(summary.steps)
  if (showId != null) summary.showId = showId
  const deletables = []
  const imported = { tv: 0, oneOff: 0, film: 0 }
  const roots = {
    mediaRoot: await getMediaRoot(),
    oneOffRoot: await getOneOffRoot(),
    moviesRoot: await getMoviesRoot(),
    recordingsRoot: await getRecordingsRoot(),
  }
  const { recordingsRoot } = roots
  const tvhRecordingsPath = await getTvhRecordingsPath()
  const importUnmatched = (await getSetting('import_unmatched')) !== 'false'
  const rootProblemOf = createRootCheck()

  let shows, finished, conn
  try {
    shows = withTitleVariants({ shows: await db('shows').where({ enabled: true }), variants: await loadTitleVariants() })
    if (showId != null && !shows.some((s) => s.id === showId)) {
      summary.message = `show_id ${showId} not found or not enabled`
      await finishSync(syncId, 'error', summary)
      return
    }
    conn = await resolveConnection()
    finished = await timeStep('list', () => listFinished(conn))
  } catch (err) {
    summary.errors.push(err.message)
    await finishSync(syncId, 'error', summary)
    return
  }
  await markRemovedByTvheadend({ conn, finished })
    .catch((err) => console.warn(`[sync] removed recordings check: ${err.message}`))

  const classificationOf = await recordingClassifications(finished)
  const context = await importContextOf({ conn })
  const importsStartedAt = Date.now()
  currentJob()?.step(SYNC_STEP_LABELS.imports).total(finished.length, 'recordings')
  for (const entry of finished) {
    currentJob()?.advance()
    const show = matchShow(shows, entry.name, { sport: isMostlySport([{ genres: entry.genres }]) })
    if (showId != null && show?.id !== showId) continue
    const item = { ...toItem({ entry, tvhRecordingsPath, recordingsRoot }), classification: classificationOf(entry) }
    try {
      const existing = await saveRecordingDetails({ item, show })
      const decision = libraryDecision({ existing, libraryChoice: entry.libraryChoice, show, importUnmatched })
      if (decision.action === 'hold') {
        await holdRecording({ item, existing, reason: decision.reason })
        continue
      }
      const titleOfItem = existing?.show_title_override ?? item.title
      const keyOfItem = showKeyOf(titleOfItem)
      const override = context.overrides.get(keyOfItem) ?? null
      const rule = override === ONE_OFF_KIND ? null : show
      const keyRows = (context.rowsByKey.get(keyOfItem) || []).filter((row) => row.recording_id !== item.id).map(rowAiringOf)
      if (!isFiled(existing) && needsDatabaseIds({
        recordings: [...keyRows, importAiringOf(item)],
        evidence: context.evidence.get(keyOfItem) ?? null,
        override,
        hasRule: hasUserRule({ show: rule, item }),
      })) {
        await lookUpDatabaseIds({ key: keyOfItem, request: { ...airingOf(item), title: titleOfItem }, identityFor, evidence: context.evidence })
      }
      const kind = libraryKind({
        show: rule,
        item,
        moviesRoot: roots.moviesRoot,
        override,
        evidence: context.evidence.get(keyOfItem) ?? null,
        keyRows,
      })
      const folder = kind === 'tv' ? show ?? await folderForSeries({ item, shows, autorecNames: context.autorecNames, identityFor }) : null
      const itemStartedAt = Date.now()
      const { summaryKey, adResult, size, error } = await processItem({ item, show: folder, kind, override, roots, rootProblemOf })
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
  startRecordingPictures(conn)

  const retries = showId == null ? await pendingRemovals({ finished, shows, queued: deletables }) : []
  deletables.push(...retries)
  if (imported.tv > 0 || retries.length > 0) summary.plex = await timeStep('plexTv', () => notifyPlexSectionRefresh())
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

const folderForSeries = async ({ item, shows, autorecNames, identityFor }) => {
  const title = (item.autorecId && autorecNames.get(item.autorecId)) || item.title
  const origin = item.autorecId ? USER_ORIGIN : AUTO_ORIGIN
  const sport = isMostlySport([importAiringOf(item)])
  const created = await ensureShowFolder({ title, shows, airing: airingOf(item), identityFor, origin, sport })
  if (!shows.some((show) => show.id === created.id)) shows.push(created)
  return created
}

export const airingOf = (item) => ({
  channelName: item.channelName || null,
  start: Number.isFinite(Number(item.start)) ? Number(item.start) : null,
  durationS: item.end && item.start ? Math.round((Number(item.end) - Number(item.start)) / 1000) : null,
  season: item.season ?? null,
  episode: item.episode ?? null,
})

const recordingClassifications = async (entries) => {
  const sourceOf = (entry) => ({
    title: entry.name,
    start: entry.startDate,
    channelName: entry.channelName,
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
  programId: entry.programId ?? null,
  genres: entry.genres || [],
  year: entry.year ?? null,
  tvhFilename: entry.filename || null,
  autorecId: entry.autorecId || null,
  sourcePath: entry.filename
    ? localPathFor({ tvhFilename: entry.filename, tvhRecordingsPath, recordingsRoot })
    : null,
  ext: entry.filename ? path.extname(entry.filename).slice(1) || 'ts' : 'ts',
})

const saveRecordingDetails = async ({ item, show = null }) => {
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
  if (!row.image_checked_at) queuedRecordingPictures.set(item.id, item)
  return row
}

export const recordingPicturesIdle = () => recordingPictures ?? Promise.resolve()

const startRecordingPictures = (conn) => {
  recordingPictures ??= captureRecordingPictures(conn)
    .catch((err) => console.warn(`[sync] recording pictures: ${err.message}`))
    .finally(() => { recordingPictures = null })
  return recordingPictures
}

const captureRecordingPictures = async (conn) => {
  const run = createRecordingPictureRun()
  await runRecordingPictureQueue({
    queue: queuedRecordingPictures,
    delayed: delayedRecordingPictures,
    saveItem: (item) => saveRecordingImage({ item, run }),
    captureUpcoming: () => captureUpcomingArtwork({ conn, run }),
  })
}

export const runRecordingPictureQueue = async ({ queue, delayed, saveItem, captureUpcoming, warn = console.warn }) => {
  await drainRecordingPictures({ queue, delayed, saveItem, warn })
  await captureUpcoming().catch((err) => warn(`[sync] upcoming recording pictures: ${err.message}`))
  await drainRecordingPictures({ queue, delayed, saveItem, warn })
}

const drainRecordingPictures = async ({ queue, delayed, saveItem, warn }) => {
  while (queue.size) {
    const item = delayedLastOf({ items: [...queue.values()], idOf: (queued) => queued.id, delayed })[0]
    queue.delete(item.id)
    await saveItem(item).catch((err) => warn(`[sync] recording picture ${item.id}: ${err.message}`))
  }
}

export const delayedLastOf = ({ items, idOf, delayed }) => [
  ...items.filter((item) => !delayed.has(idOf(item))),
  ...items.filter((item) => delayed.has(idOf(item))),
]

const captureRecordingArtwork = async ({ recordingId, airing, attempts }) => {
  if (await findArtwork({ kind: 'recording', id: recordingId })) return settleOutcome({ recordingId, outcome: RECORDING_PICTURE_SAVED })
  const attempt = (attempts.get(recordingId) ?? 0) + 1
  const lastAttempt = attempt >= ARTWORK_ATTEMPTS
  const outcome = await saveRecordingPicture({ recordingId, ...airing, lastAttempt })
    .catch(() => (lastAttempt ? RECORDING_PICTURE_MISSED : RECORDING_PICTURE_RETRY))
  const counted = countedOutcomeOf({ recordingId, outcome, lastAttempt })
  if (counted === RECORDING_PICTURE_RETRY) attempts.set(recordingId, attempt)
  else if (counted !== RECORDING_PICTURE_DEFERRED) attempts.delete(recordingId)
  return settleOutcome({ recordingId, outcome: counted })
}

const countedOutcomeOf = ({ recordingId, outcome, lastAttempt }) => {
  if (outcome !== RECORDING_PICTURE_DEFERRED) {
    deferredOnce.delete(recordingId)
    return outcome
  }
  if (!deferredOnce.has(recordingId)) {
    deferredOnce.add(recordingId)
    return outcome
  }
  deferredOnce.delete(recordingId)
  return lastAttempt ? RECORDING_PICTURE_MISSED : RECORDING_PICTURE_RETRY
}

const settleOutcome = ({ recordingId, outcome }) => {
  if (isSettledOutcome(outcome)) delayedRecordingPictures.delete(recordingId)
  else delayedRecordingPictures.add(recordingId)
  return outcome
}

const isSettledOutcome = (outcome) => outcome === RECORDING_PICTURE_SAVED || outcome === RECORDING_PICTURE_MISSED

const airingOfEntry = ({ entry, run }) => ({ eventId: entry.programId, title: entry.name, source: entry.image, run })

const airingOfItem = ({ item, run }) => ({ eventId: item.programId, title: item.title, source: item.image, run })

const captureUpcomingArtwork = async ({ conn, run }) => {
  const upcoming = (await listUpcoming(conn)).filter((entry) => entry.enabled && !settledUpcomingArtwork.has(entry.uuid))
  for (const entry of delayedLastOf({ items: upcoming, idOf: (candidate) => candidate.uuid, delayed: delayedRecordingPictures })) {
    const outcome = await captureRecordingArtwork({ recordingId: entry.uuid, airing: airingOfEntry({ entry, run }), attempts: upcomingArtworkAttempts })
      .catch((err) => console.warn(`[sync] upcoming recording picture ${entry.uuid}: ${err.message}`))
    if (isSettledOutcome(outcome)) settledUpcomingArtwork.add(entry.uuid)
  }
}

export const forgetFailedArtwork = (recordingIds) => recordingIds.forEach((recordingId) => {
  settledUpcomingArtwork.delete(recordingId)
  upcomingArtworkAttempts.delete(recordingId)
  finishedArtworkAttempts.delete(recordingId)
  delayedRecordingPictures.delete(recordingId)
  deferredOnce.delete(recordingId)
})

const saveRecordingImage = async ({ item, run }) => {
  const outcome = await captureRecordingArtwork({ recordingId: item.id, airing: airingOfItem({ item, run }), attempts: finishedArtworkAttempts })
  if (!isSettledOutcome(outcome)) return
  const imagePath = (await findArtwork({ kind: 'recording', id: item.id }))
    ? `recordings/${item.id}`
    : null
  await db('recordings').where({ recording_id: item.id }).update({
    image_path: imagePath,
    image_checked_at: db.fn.now(),
  })
}

const holdRecording = async ({ item, existing, reason }) => {
  if (['done', 'partial', 'importing'].includes(existing?.status) || existing?.deleted_from_tvh_at) return
  await db('recordings').where({ recording_id: item.id }).where(notChosenForImport).update({
    status: 'not_imported',
    error: reason,
    file_path: null,
    purged_at: null,
    log_cleared_at: null,
  })
}

const notChosenForImport = (query) => query.whereNull('library_choice').orWhereNot('library_choice', 'include')

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
  return !existing || isSameFile(existing, source) || isSameSize(existing, source)
}

const isSameFile = (a, b) => Boolean(b) && a.dev === b.dev && a.ino === b.ino

const isSameSize = (a, b) => Boolean(b) && b.size > 0 && a.size === b.size

const recordingIdsAt = (filePath) => db('recordings')
  .where({ file_path: filePath })
  .whereNull('library_deleted_at')
  .whereNull('purged_at')
  .pluck('recording_id')

const statOrNull = (filePath) => fs.stat(filePath).catch(() => null)

const processItem = async ({ item, show, kind, override = null, roots, rootProblemOf }) => {
  const existing = await db('recordings').where({ recording_id: item.id }).first()
  if (existing?.status === 'done') return { summaryKey: 'skipped' }
  if (existing?.deleted_from_tvh_at) return { summaryKey: 'skipped' }

  if (!item.sourcePath) {
    return skipItem({ item, show, existing, error: `TVHeadend file path is outside the recordings mount (${item.statusText || 'no file'})` })
  }

  let sourceStat
  try {
    sourceStat = await fs.stat(item.sourcePath)
  } catch {
    return skipItem({ item, show, existing, error: `file not found at ${item.sourcePath}; check the recordings mount` })
  }

  if (!(await isInsideRealRoot({ filePath: item.sourcePath, root: roots.recordingsRoot }))) {
    return skipItem({ item, show, existing, error: `${item.sourcePath} is outside the recordings folder ${roots.recordingsRoot}` })
  }

  const kindRoot = { tv: roots.mediaRoot, oneOff: roots.oneOffRoot, film: roots.moviesRoot }[kind]
  const rootProblem = kindRoot ? await rootProblemOf(kindRoot) : null
  if (rootProblem) return skipItem({ item, show, existing, error: rootProblemMessage({ kind, root: kindRoot, problem: rootProblem }) })

  const { filePath, takenPath } = await destinationFor({ item, show, kind, roots })
  const showTitle = existing?.show_title_override ?? item.title
  return trackJob(
    { kind: 'import', title: `Import · ${showTitle}`, ref: { recordingId: item.id }, subject: importSubjectOf({ item, kind, filePath, showTitle, kindOverride: override }) },
    (job) => importItem({ item, show, filePath, takenPath, sourceStat, job }),
  )
}

const skipItem = async ({ item, show, existing, error }) => {
  if (existing?.status === 'partial') {
    await db('recordings').where({ recording_id: item.id }).update({ error })
  } else {
    await upsertRecording({ item, show, file_path: null, status: 'skipped', error })
  }
  return { summaryKey: 'skipped' }
}

const rootProblemMessage = ({ kind, root, problem }) => (problem === ROOT_EMPTY
  ? `${ROOT_NAMES[kind]} folder ${root} is empty, but imported recordings point into it; check that it is mounted`
  : `${ROOT_NAMES[kind]} folder ${root} not found; mount it or change it in Settings`)

const importItem = async ({ item, show, filePath, takenPath, sourceStat, job }) => {
  job.fact('Size', formatBytes(sourceStat.size))
  if (takenPath) noteTakenPath({ takenPath, filePath, job })
  job.step('Copy from TVHeadend')
  await upsertRecording({ item, show, file_path: filePath, status: 'importing', error: null })
  try {
    await db('recordings').where({ file_path: filePath }).whereNot({ recording_id: item.id }).update({ file_path: null })
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await importFile({ sourcePath: item.sourcePath, filePath, size: sourceStat.size, recordingId: item.id })
  } catch (err) {
    await upsertRecording({ item, show, file_path: null, status: 'failed', error: err.message })
    throw err
  }

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
      adResult = await processRecordingAds({ filePath, mode: show.ad_removal, recordingId: item.id })
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
  } catch (err) {
    await fs.rm(filePath, { force: true })
    throw err
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

export const usePlaybackCheck = (isPlaying) => {
  isRecordingPlaying = isPlaying
}

let isRecordingPlaying = () => false

const markRemovedByTvheadend = async ({ conn, finished }) => {
  const removed = new Set(await listRemovedIds(conn))
  const finishedIds = new Set(finished.map((entry) => entry.uuid))
  const ids = (await db('recordings').whereNull('deleted_from_tvh_at').pluck('recording_id'))
    .filter((id) => removed.has(id) && !finishedIds.has(id))
  const now = new Date().toISOString()
  for (let at = 0; at < ids.length; at += UPDATE_CHUNK) {
    await db('recordings').whereIn('recording_id', ids.slice(at, at + UPDATE_CHUNK))
      .update({ deleted_from_tvh_at: now, tvh_remove_pending_at: null })
  }
  return ids.length
}

const pendingRemovals = async ({ finished, shows, queued }) => {
  const finishedIds = new Set(finished.map((entry) => entry.uuid))
  const queuedIds = new Set(queued.map((d) => d.recording_id))
  const showById = new Map(shows.map((show) => [show.id, show]))
  const rows = await db('recordings')
    .whereNotNull('tvh_remove_pending_at')
    .whereNull('deleted_from_tvh_at')
    .where({ status: 'done' })
    .select('recording_id', 'title', 'show_id', 'ad_status')
  return rows
    .filter((row) => finishedIds.has(row.recording_id) && !queuedIds.has(row.recording_id))
    .filter((row) => {
      const show = showById.get(row.show_id)
      return Boolean(show?.delete_after_import) && shouldQueueAutoDelete({ show, adResult: { status: row.ad_status } })
    })
    .map((row) => ({ recording_id: row.recording_id, title: row.title }))
}

const markRemovalPending = async (ids) => {
  if (ids.length === 0) return
  await db('recordings').whereIn('recording_id', ids).whereNull('tvh_remove_pending_at')
    .update({ tvh_remove_pending_at: new Date().toISOString() })
}

const runAutoDelete = async (deletables, plex) => {
  const ids = deletables.map((d) => d.recording_id)
  const playing = ids.filter((id) => isRecordingPlaying(id))
  const ready = ids.filter((id) => !playing.includes(id))

  const guardSettingRaw = (await getSetting('delete_after_plex_refresh_only')) ?? 'true'
  const guardOn = guardSettingRaw !== 'false'
  const plexAttemptedAndFailed = guardOn && plex && !plex.triggered
  const plexUnconfigured = plex?.skipped && plex?.reason === 'plex not configured'
  if (plexAttemptedAndFailed && !plexUnconfigured) {
    await markRemovalPending(ids)
    return {
      skipped: true,
      reason: `plex refresh did not succeed (${plex.error || plex.reason || 'unknown'})`,
      candidates: ids.length,
    }
  }
  await markRemovalPending(playing)
  if (ready.length === 0) return { skipped: true, reason: 'playing now', candidates: ids.length, playing }

  try {
    const result = await removeTvhRecordings({ recordingIds: ready })
    const now = new Date().toISOString()
    await db('recordings').whereIn('recording_id', result.removed)
      .update({ deleted_from_tvh_at: now, tvh_remove_pending_at: null })
    await db('recordings').whereIn('recording_id', result.unknown).update({ tvh_remove_pending_at: null })
    await markRemovalPending(result.failed)
    return {
      triggered: true,
      removed: result.removed,
      unmapped: result.unknown,
      ...(result.failed.length ? { failed: result.failed } : {}),
      ...(playing.length ? { playing } : {}),
      removed_at: now,
    }
  } catch (err) {
    await markRemovalPending(ready)
    const stage = err instanceof TvheadendError ? err.stage : 'unknown'
    const code = err instanceof TvheadendError ? err.code : undefined
    console.error(`[tvheadend] remove-after-import failed for ${ready.length} recording(s) (stage ${stage}): ${err.message}`)
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

export const pruneTombstonedRecordings = async () => {
  await db('recordings')
    .whereNotNull('deleted_from_tvh_at')
    .andWhereRaw(
      `datetime(deleted_from_tvh_at) < datetime('now', '-${RECORDING_TOMBSTONE_TTL_DAYS} days')`
    )
    .where((q) => q.whereNotNull('purged_at').orWhereNotIn('status', IMPORTED_STATUSES))
    .whereNull('ad_backup_saved_at')
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
    log_cleared_at: null,
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

const AUTOMATIC_TRIGGERS = ['cron', 'recording-finished', 'restart']
const DEFAULT_RECORDINGS_ROOT = '/recordings'
const HOLD_REASONS = {
  excluded: 'Kept out of the library',
  recordedOff: 'Recorded with Add to library off',
  noRule: 'No series folder for this title, and Import every recording is off',
}
const SIZE_TOLERANCE_BYTES = 1_000_000
const PROGRESS_TICK_MS = 1000
const SYNC_ITEMS_CAP = 100
const RECORDING_TOMBSTONE_TTL_DAYS = 30
const IMPORTED_STATUSES = ['done', 'partial']
const ROOT_NAMES = { tv: 'TV', oneOff: 'one-off', film: 'movies' }
const ARTWORK_ATTEMPTS = 3

let inFlight = null
const settledUpcomingArtwork = new Set()
const queuedRecordingPictures = new Map()
const delayedRecordingPictures = new Set()
const deferredOnce = new Set()
let recordingPictures = null
const upcomingArtworkAttempts = new Map()
const finishedArtworkAttempts = new Map()
const classificationStore = createClassificationStore()
const ID_HINT = /\s*\{(?:tvdb|tmdb|imdb)-[^}]*\}/gi
