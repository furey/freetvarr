import fs from 'fs/promises'

import { db, getSetting } from './db.js'
import { peekDoctorReport } from './doctor.js'
import { getRecordingState } from './epg.js'
import { getActiveSyncId, getMediaRoot, getRecordingsRoot } from './sync.js'
import { isTvheadendUrlSet } from './tvheadend-unconfigured.js'

export const HEALTH_LEVELS = ['ok', 'warn', 'fail']

export const healthSummaryOf = ({
  tvheadend = 'ok',
  recentFailures = 0,
  lastSync = null,
  doctorChecks = [],
} = {}) => {
  const findings = [
    TVHEADEND_FINDINGS[tvheadend],
    recentFailures > 0 && { level: 'fail', sentence: recentFailuresSentence(recentFailures) },
    lastSync?.status === 'error' && { level: 'fail', sentence: 'The last sync failed.' },
    lastSync?.status === 'partial' && { level: 'warn', sentence: 'The last sync had problems.' },
    ...doctorChecks.map(doctorFinding),
  ].filter(Boolean)
  return findings.reduce(
    (worst, finding) => (rankOf(finding.level) > rankOf(worst.level) ? finding : worst),
    { level: 'ok', sentence: null },
  )
}

export const distinctDrives = (drives) => drives
  .filter((drive) => drive.total)
  .filter((drive, index, all) => all.findIndex((other) => sameDrive(other, drive)) === index)

export const usableDoctorReport = ({ peeked, maxAgeMs = DOCTOR_MAX_AGE_MS }) =>
  (peeked && peeked.ageMs <= maxAgeMs ? peeked.report : null)

export const getHealthSummary = async ({ nowMs = Date.now(), fresh = false } = {}) => {
  if (!fresh && summaryCache && summaryCache.expiresAt > nowMs) return summaryCache.value
  if (summaryInflight) return summaryInflight
  summaryInflight = buildHealthSummary({ nowMs })
    .then((value) => {
      summaryCache = { value, expiresAt: Date.now() + SUMMARY_TTL_MS }
      return value
    })
    .finally(() => { summaryInflight = null })
  return summaryInflight
}

export const pageHealthOf = async ({ waitMs = PAGE_HEALTH_WAIT_MS } = {}) => {
  if (summaryCache) {
    getHealthSummary().catch(() => null)
    return levelAndSentenceOf(summaryCache.value)
  }
  let timer = null
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), waitMs) })
  const summary = getHealthSummary().then(levelAndSentenceOf, () => null)
  const health = await Promise.race([summary, timeout])
  clearTimeout(timer)
  return health
}

const levelAndSentenceOf = ({ level, sentence }) => ({ level, sentence })

export const healthSummaryRoute = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    res.json(await getHealthSummary({ fresh: req.query.fresh === '1' }))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const buildHealthSummary = async ({ nowMs }) => {
  const doctor = usableDoctorReport({ peeked: peekDoctorReport({ nowMs }) })
  const [tvheadend, lastSync, syncCount, recentFailures, importedLast7Days, storage] = await Promise.all([
    tvheadendState(),
    latestFinishedSync(),
    countRows(db('syncs')),
    countRecentFailures({ nowMs }),
    countRows(db('recordings')
      .whereIn('status', ['done', 'partial'])
      .where('imported_at', '>=', db.raw("datetime('now', '-7 days')"))),
    storageDrives(),
  ])
  const { level, sentence } = healthSummaryOf({
    tvheadend,
    recentFailures,
    lastSync,
    doctorChecks: doctor?.checks ?? [],
  })
  return {
    level,
    sentence,
    sources: {
      doctor: doctor ? { ranAt: doctor.ranAt, summary: doctor.summary } : null,
      tvheadend,
      lastSync,
      syncRunning: getActiveSyncId() != null,
      recentFailures,
    },
    counts: { importedLast7Days, failedLast24Hours: recentFailures, syncs: syncCount },
    storage,
    checkedAt: new Date(nowMs).toISOString(),
  }
}

const tvheadendState = async () => {
  if (!(await tvheadendConfigured())) return 'unconfigured'
  const outcome = await Promise.race([
    getRecordingState().then((state) => (state.stale ? 'stale' : 'ok'), () => 'fail'),
    new Promise((resolve) => { setTimeout(() => resolve('unknown'), TVHEADEND_WAIT_MS).unref?.() }),
  ])
  return outcome
}

const tvheadendConfigured = async () => isTvheadendUrlSet(await getSetting('tvh_url'))

const latestFinishedSync = async () => {
  const row = await db('syncs').whereNot('status', 'running').orderBy('id', 'desc').first()
  if (!row) return null
  return { id: row.id, status: row.status, finishedAt: row.finished_at, summary: parseSummary(row.summary_json) }
}

const countRecentFailures = ({ nowMs }) => countRows(db('recordings')
  .where('status', 'failed')
  .whereNull('purged_at')
  .where((query) => query
    .where('imported_at', '>=', db.raw("datetime('now', '-1 day')"))
    .orWhere('aired_at', '>=', nowMs - DAY_MS)))

const countRows = async (query) => {
  const row = await query.clone().count({ count: '*' }).first()
  return Number(row?.count ?? 0)
}

const storageDrives = async () => {
  const [recordings, media] = await Promise.all([getRecordingsRoot(), getMediaRoot()])
  const drives = await Promise.all([
    driveOf({ key: 'recordings', path: recordings }),
    driveOf({ key: 'media', path: media }),
  ])
  return distinctDrives(drives)
}

const driveOf = async ({ key, path }) => {
  try {
    const stats = await fs.statfs(path)
    return { key, path, total: stats.blocks * stats.bsize, free: stats.bavail * stats.bsize }
  } catch {
    return { key, path, total: null, free: null }
  }
}

const sameDrive = (a, b) => a.total === b.total && a.free === b.free

const doctorFinding = (check) => {
  if (check.status === 'fail') return { level: 'fail', sentence: `The ${checkSubjectOf(check)} check failed.` }
  if (check.status === 'warn') return { level: 'warn', sentence: `The ${checkSubjectOf(check)} check has a warning.` }
  return null
}

const checkSubjectOf = ({ group, title = '' }) => (group === 'tvheadend' && !title.includes('TVHeadend')
  ? `TVHeadend ${lowerFirst(title)}`
  : lowerFirst(title))

const lowerFirst = (text) => (/^[A-Z][a-z]/.test(text) && !KEEP_CASE.some((word) => text.startsWith(word))
  ? text.charAt(0).toLowerCase() + text.slice(1)
  : text)

const recentFailuresSentence = (count) => (count === 1
  ? 'A recording failed in the last day.'
  : `${count} recordings failed in the last day.`)

const parseSummary = (json) => {
  try {
    return JSON.parse(json || 'null')
  } catch {
    return null
  }
}

const rankOf = (level) => HEALTH_LEVELS.indexOf(level)

const TVHEADEND_FINDINGS = {
  unconfigured: { level: 'warn', sentence: 'TVHeadend is not set up yet.' },
  fail: { level: 'fail', sentence: 'TVHeadend is not answering.' },
  stale: { level: 'warn', sentence: 'TVHeadend is slow to answer.' },
}

const KEEP_CASE = ['TVHeadend', 'Plex', 'Live TV']

let summaryCache = null
let summaryInflight = null

const SUMMARY_TTL_MS = 10_000
const PAGE_HEALTH_WAIT_MS = 300
const TVHEADEND_WAIT_MS = 2500
const DAY_MS = 24 * 60 * 60 * 1000
const DOCTOR_MAX_AGE_MS = 6 * 60 * 60 * 1000
