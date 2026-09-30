import { db, getSetting } from './db.js'
import {
  resolveConnection,
  listActiveRecordings,
  listRecentlyEnded,
  listInputs,
  listSubscriptions,
  loadRecording,
} from './tvheadend.js'
import { getActiveSyncId, matchShow } from './sync.js'
import { snapshotProgress } from './progress.js'

export const getRecordingNow = async ({ nowMs = Date.now() } = {}) => {
  if (cache && cache.expiresAt > nowMs) return cache.value
  if (inflight) return inflight
  inflight = loadRecordingNow(nowMs)
    .then((value) => {
      cache = { value, expiresAt: nowMs + CACHE_MS }
      return value
    })
    .catch((err) => {
      if (cache) return { ...cache.value, stale: true }
      throw err
    })
    .finally(() => { inflight = null })
  return inflight
}

export const recordingImageSource = (eventId) => {
  for (const { recording } of tracked.values()) {
    const ids = [recording.programId, recording.uuid].filter((id) => id != null).map(String)
    if (ids.includes(String(eventId))) return recording.image
  }
  return null
}

export const recordingPhase = ({ start, stop, nowMs }) => {
  if (nowMs < start) return 'pre-roll'
  if (nowMs >= stop) return 'post-roll'
  return 'programme'
}

export const inputForRecording = ({ recording, inputs = [], subscriptions = [] }) => {
  const subscription = subscriptions.find((s) =>
    s.channelName === recording.channelName && s.title.endsWith(recording.name))
    || subscriptions.find((s) => s.channelName === recording.channelName)
    || null
  const input = subscription
    ? inputs.find((i) => i.input && subscription.service.startsWith(`${i.input}/`)) || null
    : null
  return { subscription, input }
}

export const describeActiveRecording = ({ recording, inputs, subscriptions, nowMs }) => {
  const { subscription, input } = inputForRecording({ recording, inputs, subscriptions })
  return {
    ...cardBasics(recording),
    start: recording.startDate,
    stop: recording.endDate,
    startPadded: recording.startPadded,
    stopPadded: recording.stopPadded,
    phase: recordingPhase({ start: recording.startDate, stop: recording.endDate, nowMs }),
    failed: isRecordingFailure(recording),
    statusText: recording.statusText,
    filesize: recording.filesize,
    errors: recording.errors,
    dataErrors: recording.dataErrors,
    bitsPerSecond: subscription?.bytesInPerSecond != null ? subscription.bytesInPerSecond * 8 : null,
    signal: input?.signal ?? null,
    signalUnit: input?.signalUnit ?? null,
    snr: input?.snr ?? null,
    snrUnit: input?.snrUnit ?? null,
    continuityErrors: input?.continuityErrors ?? 0,
    transportErrors: input?.transportErrors ?? 0,
    uncorrectedBlocks: input?.uncorrectedBlocks ?? 0,
    tuner: input?.input || null,
  }
}

export const recordingOutcome = (recording) => {
  if (!recording) return { failed: false, statusText: '' }
  return {
    failed: isRecordingFailure(recording),
    statusText: recording.statusText,
    warning: isMarkedForRerecord(recording) ? rerecordDetail(recording) : null,
  }
}

export const describeJourney = ({
  outcome,
  row = null,
  show = null,
  adRemovalOn = false,
  progress = null,
  activeSyncId = null,
  importSync = null,
}) => {
  if (outcome.failed) {
    return {
      settled: true,
      steps: [step({ key: 'recorded', label: 'Recorded', state: 'failed', detail: outcome.statusText })],
    }
  }
  const recorded = outcome.warning
    ? step({ key: 'recorded', label: 'Recorded', state: 'warn', detail: outcome.warning })
    : step({ key: 'recorded', label: 'Recorded', state: 'done' })
  const importing = importingStep({ row, show, progress, activeSyncId })
  if (importing.state === 'skipped' || importing.state === 'failed') {
    return { settled: true, steps: [recorded, importing] }
  }
  const ads = adsApply({ show, adRemovalOn }) ? adsStep({ row, show, progress, activeSyncId }) : null
  const plex = plexStep({ row, ads, activeSyncId, importSync })
  return {
    settled: !IN_PROGRESS_STATES.includes(plex.state),
    steps: [recorded, importing, ads, plex].filter(Boolean),
  }
}

export const isRecordingFailure = (recording) =>
  (recording.errorCode ?? 0) !== 0 || /error/i.test(recording.schedStatus || '')

export const isMarkedForRerecord = (recording) => /rerecord/i.test(recording.schedStatus || '')

const rerecordDetail = (recording) =>
  `${recording.dataErrors ?? 0} data errors · TVHeadend will re-record the next airing`

const loadRecordingNow = async (nowMs) => {
  const conn = await resolveConnection()
  const active = await listActiveRecordings(conn)
  const [inputs, subscriptions] = active.length
    ? await Promise.all([
      listInputs(conn).catch(() => []),
      listSubscriptions(conn).catch(() => []),
    ])
    : [[], []]
  if (!bootstrapped) {
    await trackRecentlyEnded({ conn, nowMs })
    bootstrapped = true
  }
  trackActive({ active, nowMs })
  await resolveOutcomes(conn)
  const journeys = await describeJourneys(nowMs)
  return {
    active: active.map((recording) => describeActiveRecording({ recording, inputs, subscriptions, nowMs })),
    journeys,
    fetchedAt: nowMs,
  }
}

const trackActive = ({ active, nowMs }) => {
  const activeIds = new Set(active.map((r) => r.uuid))
  for (const recording of active) {
    tracked.set(recording.uuid, { recording, endedAt: null, outcome: null, settledAt: null })
  }
  for (const entry of tracked.values()) {
    if (!activeIds.has(entry.recording.uuid) && entry.endedAt == null) entry.endedAt = nowMs
  }
}

const trackRecentlyEnded = async ({ conn, nowMs }) => {
  const ended = await listRecentlyEnded(conn).catch(() => [])
  for (const recording of ended) {
    if (nowMs - recording.stopPadded > BOOTSTRAP_WINDOW_MS || tracked.has(recording.uuid)) continue
    tracked.set(recording.uuid, {
      recording,
      endedAt: recording.stopPadded,
      outcome: recordingOutcome(recording),
      settledAt: null,
    })
  }
}

const resolveOutcomes = async (conn) => {
  const pending = [...tracked.values()].filter((t) => t.endedAt != null && !t.outcome)
  await Promise.all(pending.map(async (entry) => {
    const latest = await loadRecording({ uuid: entry.recording.uuid, conn }).catch(() => undefined)
    if (latest === undefined) return
    if (latest && /^recording/.test(latest.schedStatus)) return
    if (latest) entry.recording = { ...entry.recording, ...latest, image: entry.recording.image }
    entry.outcome = recordingOutcome(latest)
  }))
}

const describeJourneys = async (nowMs) => {
  const ended = [...tracked.values()].filter((t) => t.outcome)
  if (!ended.length) return []
  const [rows, shows, adRemovalSetting] = await Promise.all([
    db('recordings').whereIn('recording_id', ended.map((t) => t.recording.uuid)),
    db('shows').where({ enabled: true }),
    getSetting('ad_removal_enabled'),
  ])
  const rowById = new Map(rows.map((r) => [r.recording_id, r]))
  const progress = snapshotProgress(ended.map((t) => t.recording.uuid))
  const activeSyncId = getActiveSyncId()
  const journeys = []
  for (const entry of ended) {
    const row = rowById.get(entry.recording.uuid) || null
    const show = (row?.show_id && shows.find((s) => s.id === row.show_id))
      || matchShow(shows, entry.recording.name || '')
      || null
    const journey = describeJourney({
      outcome: entry.outcome,
      row,
      show,
      adRemovalOn: adRemovalSetting === 'true',
      progress: progress[entry.recording.uuid] || null,
      activeSyncId,
      importSync: row?.imported_at ? await findImportSync(row.imported_at) : null,
    })
    if (journey.settled && entry.settledAt == null) entry.settledAt = nowMs
    if (isExpired({ entry, nowMs })) {
      tracked.delete(entry.recording.uuid)
      continue
    }
    journeys.push({
      ...cardBasics(entry.recording),
      stopPadded: entry.recording.stopPadded,
      filesize: entry.recording.filesize,
      failed: entry.outcome.failed,
      statusText: entry.outcome.statusText,
      endedAt: entry.endedAt,
      steps: journey.steps,
      settled: journey.settled,
      expiresAt: entry.settledAt != null ? entry.settledAt + JOURNEY_LINGER_MS : null,
    })
  }
  return journeys
}

const findImportSync = async (importedAt) => {
  const sync = await db('syncs')
    .where('status', '!=', 'running')
    .whereRaw('datetime(finished_at) >= datetime(?)', [importedAt])
    .orderBy('finished_at', 'asc')
    .first()
  return sync ? { ...sync, summary: parseJson(sync.summary_json) } : null
}

const isExpired = ({ entry, nowMs }) =>
  (entry.settledAt != null && nowMs - entry.settledAt > JOURNEY_LINGER_MS)
  || nowMs - entry.endedAt > JOURNEY_MAX_AGE_MS

const cardBasics = (recording) => ({
  uuid: recording.uuid,
  programId: recording.programId,
  hasImage: Boolean(recording.image),
  title: recording.name,
  episodeTitle: recording.episodeTitle,
  season: recording.season,
  episode: recording.episode,
  channelId: recording.channelId,
  channelName: recording.channelName,
})

const importingStep = ({ row, show, progress, activeSyncId }) => {
  const base = { key: 'importing', label: 'Importing' }
  if (!row && !show) return step({ ...base, state: 'skipped', detail: 'No show rule matches this title' })
  if (!row) {
    return step({ ...base, state: 'pending', detail: activeSyncId ? 'Sync running' : 'Waiting for the next sync' })
  }
  if (row.status === 'importing') {
    const percent = progress?.phase === 'importing' ? progress.percent : null
    return step({ ...base, state: 'active', percent, detail: progress?.etaLabel || null })
  }
  if (row.status === 'done') return step({ ...base, state: 'done' })
  return step({ ...base, state: row.status === 'skipped' ? 'skipped' : 'failed', detail: row.error || row.status })
}

const adsApply = ({ show, adRemovalOn }) => adRemovalOn && show && show.ad_removal !== 'off'

const adsStep = ({ row, show, progress, activeSyncId }) => {
  const base = { key: 'ads', label: show.ad_removal === 'cut' ? 'Cutting ads' : 'Finding ads' }
  if (row?.status !== 'done') return step({ ...base, state: 'pending' })
  if (row.ad_status === 'scanning') {
    const scanning = progress?.phase === 'scanning'
    return step({
      ...base,
      state: 'active',
      percent: scanning ? progress.percent : null,
      detail: scanning ? 'comskip' : progress?.phase || null,
    })
  }
  if (AD_DONE_STATUSES.includes(row.ad_status)) {
    return step({ ...base, state: 'done', detail: AD_STATUS_DETAILS[row.ad_status] })
  }
  if (AD_FAILED_STATUSES.includes(row.ad_status)) return step({ ...base, state: 'warn', detail: 'Ad scan failed' })
  return step({ ...base, state: activeSyncId ? 'pending' : 'skipped' })
}

const plexStep = ({ row, ads, activeSyncId, importSync }) => {
  const base = { key: 'plex', label: 'In Plex' }
  const upstreamBusy = row?.status !== 'done' || ads?.state === 'pending' || ads?.state === 'active'
  if (upstreamBusy) return step({ ...base, state: 'pending' })
  if (!importSync) return step({ ...base, state: activeSyncId ? 'active' : 'pending', detail: 'Refreshing Plex' })
  const plex = importSync.summary?.plex
  if (plex?.triggered) return step({ ...base, state: 'done' })
  if (plex?.skipped) return step({ ...base, state: 'skipped', detail: plex.reason || 'Plex refresh skipped' })
  return step({ ...base, state: 'warn', detail: plex?.error || 'Plex refresh did not run' })
}

const step = ({ key, label, state, detail = null, percent = null }) => ({ key, label, state, detail, percent })

const parseJson = (text) => {
  try { return JSON.parse(text || 'null') } catch { return null }
}

const tracked = new Map()
let bootstrapped = false
let cache = null
let inflight = null

const CACHE_MS = 4000
const JOURNEY_LINGER_MS = 10 * 60 * 1000
const JOURNEY_MAX_AGE_MS = 12 * 60 * 60 * 1000
const BOOTSTRAP_WINDOW_MS = 60 * 60 * 1000
const IN_PROGRESS_STATES = ['pending', 'active']
const AD_DONE_STATUSES = ['cut', 'no_breaks', 'detected']
const AD_FAILED_STATUSES = ['cut_failed', 'detect_failed']
const AD_STATUS_DETAILS = { cut: 'Ads cut', no_breaks: 'No ads found', detected: 'Ads marked' }
