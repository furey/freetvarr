import path from 'path'
import fs from 'fs/promises'

import { db, getSetting, setSetting } from './db.js'
import {
  buildDestPath,
  buildOneOffPath,
  createValidFilename,
  getMediaRoot,
  getMoviesRoot,
  getOneOffRoot,
  matchShow,
  refreshSection,
} from './sync.js'
import { notifyPlexSectionRefresh } from './plex.js'
import { groupKeyOf, groupTitleOf, isInsideFolder, kindOf, seriesByKey } from './library.js'
import { loadKindOverrides } from './programme-kind.js'
import { loadSeriesEvidence } from './series-evidence.js'
import { ensureShowFolder, existingFolderFor } from './show-folders.js'
import { listShowFolders } from './folder-matcher.js'
import { getSeries } from './series.js'
import { backupPathOf, isAdJobRunning, skipMarkerPath } from './commercials.js'
import { trackJob } from './activity.js'

export const RECLASSIFY_DONE_KEY = 'library_reclassify_v1'

let running = null

export const planReclassification = ({
  rows,
  shows = [],
  folders = [],
  ruleKeys = new Set(),
  overrides = new Map(),
  evidence = new Map(),
  roots,
}) => {
  const moves = []
  for (const [key, group] of groupBy(rows.filter(isMovable), groupKeyOf)) {
    const kind = kindOf({
      rows: group,
      hasRule: ruleKeys.has(key),
      moviesRoot: roots.moviesRoot,
      override: overrides.get(key) ?? null,
      evidence: evidence.get(key) ?? null,
    })
    if (kind === 'show') moves.push(...toShowMoves({ group, shows, folders, roots }))
    if (kind === 'oneoff') moves.push(...toOneOffMoves({ group, roots }))
  }
  return moves
}

export const runReclassification = ({ trigger = 'startup', loadSeries = getSeries } = {}) => {
  running ??= reclassify({ trigger, loadSeries }).finally(() => { running = null })
  return running
}

const reclassify = async ({ trigger, loadSeries }) => {
  const inputs = await loadReclassifyInputs({ loadSeries })
  const plan = planReclassification(inputs)
  if (!plan.length) return { moved: 0, skipped: 0, planned: 0 }
  return trackJob(
    { kind: 'reclassify', title: 'Library folders', trigger, total: plan.length, unit: 'recordings' },
    (job) => applyPlan({ plan, shows: inputs.shows, roots: inputs.roots, job }),
  )
}

export const runReclassificationOnce = async (options = {}) => {
  if (await getSetting(RECLASSIFY_DONE_KEY)) return null
  const result = await runReclassification({ trigger: 'startup', ...options })
  if (!result.skipped) await setSetting(RECLASSIFY_DONE_KEY, new Date().toISOString())
  return result
}

export const loadReclassifyInputs = async ({ loadSeries = getSeries } = {}) => {
  const roots = {
    mediaRoot: await getMediaRoot(),
    oneOffRoot: await getOneOffRoot(),
    moviesRoot: await getMoviesRoot(),
  }
  const [rows, shows, folders, seriesData, overrides, evidence] = await Promise.all([
    db('recordings').whereNull('purged_at').whereIn('status', ['done', 'partial']).whereNotNull('file_path'),
    db('shows').where({ enabled: true }),
    listShowFolders(roots.mediaRoot).catch(() => []),
    loadSeries().catch(() => ({ series: [] })),
    loadKindOverrides().catch(() => new Map()),
    loadSeriesEvidence().catch(() => new Map()),
  ])
  const ruleKeys = new Set(seriesByKey(seriesData.series || []).keys())
  return { rows, shows, folders, ruleKeys, overrides, evidence, roots }
}

const toShowMoves = ({ group, shows, folders, roots }) => {
  const title = groupTitleOf(group[0])
  const folder = folderFor({ title, shows, folders })
  return group
    .filter((row) => !isInsideFolder({ filePath: row.file_path, folder: roots.mediaRoot }))
    .filter((row) => isInsideFolder({ filePath: row.file_path, folder: roots.oneOffRoot }))
    .map((row) => moveOf({ row, to: buildDestPath({ item: itemOf(row), show: folder, mediaRoot: roots.mediaRoot }), folder, title }))
}

const toOneOffMoves = ({ group, roots }) => group
  .filter((row) => isInsideFolder({ filePath: row.file_path, folder: roots.mediaRoot }))
  .map((row) => moveOf({ row, to: buildOneOffPath({ item: itemOf(row), oneOffRoot: roots.oneOffRoot }), folder: null, title: groupTitleOf(row) }))

const folderFor = ({ title, shows, folders }) => matchShow(shows, title) ?? {
  id: null,
  show_pattern: title.trim(),
  dest_folder: existingFolderFor({ title, folders }) || createValidFilename(title) || 'Recordings',
}

const moveOf = ({ row, to, folder, title }) => ({
  id: row.recording_id,
  title,
  from: row.file_path,
  to,
  showPattern: folder?.show_pattern ?? null,
  showId: folder?.id ?? null,
  toShows: Boolean(folder),
})

const applyPlan = async ({ plan, shows, roots, job }) => {
  const result = { moved: 0, skipped: 0, planned: plan.length }
  const movedKinds = new Set()
  for (const move of plan.filter((m) => m.from !== m.to)) {
    job.advance()
    const outcome = await applyMove({ move, shows }).catch((err) => ({ state: 'fail', detail: err.message }))
    job.item({ label: `${move.title}: ${path.basename(move.to)}`, state: outcome.state, detail: outcome.detail ?? null })
    if (outcome.state === 'done') {
      result.moved++
      movedKinds.add(move.toShows ? 'tv' : 'oneOff')
      await removeEmptyFolder({ filePath: move.from, roots })
    } else {
      result.skipped++
      job.log(`${move.from}: ${outcome.detail}`, 'warn')
    }
  }
  if (result.moved) {
    await notifyPlexSectionRefresh().catch(() => null)
    await refreshSection('plex_oneoff_section_id').catch(() => null)
  }
  job.outcome(`${result.moved} moved${result.skipped ? ` · ${result.skipped} skipped` : ''}`, result.skipped ? 'warn' : null)
  return result
}

const applyMove = async ({ move, shows }) => {
  if (isAdJobRunning(move.id)) return { state: 'skip', detail: 'ad removal is running; tries again next time' }
  const row = await db('recordings').where({ recording_id: move.id }).first()
  if (!row || row.file_path !== move.from) return { state: 'skip', detail: 'the recording changed since the plan' }
  if (!(await exists(move.from))) return { state: 'skip', detail: 'file not found' }
  if (await exists(move.to)) return { state: 'skip', detail: 'a file already exists there' }
  const showId = move.toShows ? await showIdFor({ move, shows }) : null
  await moveFile({ from: move.from, to: move.to })
  for (const sidecar of [backupPathOf, skipMarkerPath]) {
    const from = sidecar(move.from)
    const to = sidecar(move.to)
    if (await exists(from) && !(await exists(to))) await moveFile({ from, to })
  }
  await db('recordings').where({ recording_id: move.id }).update({ file_path: move.to, show_id: showId })
  return { state: 'done' }
}

const showIdFor = async ({ move, shows }) => {
  if (move.showId != null) return move.showId
  const created = await ensureShowFolder({ title: move.showPattern, shows })
  if (!shows.some((show) => show.id === created.id)) shows.push(created)
  return created.id
}

export const moveFile = async ({ from, to }) => {
  await fs.mkdir(path.dirname(to), { recursive: true })
  try {
    await fs.rename(from, to)
  } catch (err) {
    if (err.code !== 'EXDEV') throw err
    await fs.copyFile(from, to, fs.constants.COPYFILE_EXCL)
    const [source, copy] = await Promise.all([fs.stat(from), fs.stat(to)])
    if (source.size !== copy.size) {
      await fs.rm(to, { force: true })
      throw new Error(`copy size mismatch (${copy.size} of ${source.size} bytes)`)
    }
    await fs.unlink(from)
  }
}

const removeEmptyFolder = async ({ filePath, roots }) => {
  const folder = path.dirname(filePath)
  if ([roots.mediaRoot, roots.oneOffRoot, roots.moviesRoot].some((root) => root && path.resolve(root) === path.resolve(folder))) return
  await fs.rmdir(folder).catch(() => {})
}

const exists = (filePath) => fs.access(filePath).then(() => true, () => false)

const isMovable = (row) => row.purged_at == null && ['done', 'partial'].includes(row.status) && Boolean(row.file_path)

const itemOf = (row) => ({
  title: groupTitleOf(row),
  episode_title: row.episode_title || null,
  season: row.season ?? null,
  episode: row.episode ?? null,
  start: Number(row.aired_at) || Date.parse(row.imported_at ?? '') || Date.now(),
  ext: path.extname(row.file_path).slice(1) || 'ts',
})

const groupBy = (list, keyOf) => {
  const groups = new Map()
  for (const item of list) {
    const key = keyOf(item)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  return groups
}
