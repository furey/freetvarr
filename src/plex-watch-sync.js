import { createHash } from 'node:crypto'

import { createPlexWatchClient } from './plex-watch-client.js'
import { freetvarrStateOf, planRow, planWatchSync, snapshotAfterFailedPush, snapshotStateOf } from './plex-watch-plan.js'

export const FULL_PASS_EVERY_MS = 24 * 60 * 60 * 1000
export const UNMATCHED_FULL_PASS_EVERY_MS = 60 * 60 * 1000
export const QUICK_OVERLAP_MS = 2 * 60 * 1000
export const BACKOFF_FIRST_MS = 5 * 60 * 1000
export const BACKOFF_MAX_MS = 2 * 60 * 60 * 1000
export const PUSH_CONCURRENCY = 4
export const WATCH_CHANGE_DELAY_MS = 10_000
export const LIBRARY_OPEN_EVERY_MS = 2 * 60 * 1000

export const createPlexWatchSync = ({
  loadConfig,
  loadToggles,
  loadRows,
  loadSnapshots,
  saveSnapshots,
  pruneSnapshots,
  applyPull,
  loadStatus,
  saveStatus,
  track = (options, fn) => fn(silentJob),
  afterSync = async () => null,
  createClient = createPlexWatchClient,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) => {
  let inflight = null
  let queued = null
  let timer = null
  let lastLibraryOpenAt = 0

  const run = async ({ trigger = 'manual', full = false } = {}) => {
    if (inflight) {
      queued = mergeRequest(queued, { trigger, full })
      return inflight.then(() => (queued ? drainQueued() : null))
    }
    inflight = runOnce({ trigger, full }).finally(() => { inflight = null })
    return inflight
  }

  const drainQueued = () => {
    const next = queued
    queued = null
    return next ? run(next) : null
  }

  const runOnce = async ({ trigger, full }) => {
    const config = await loadConfig()
    const status = await loadStatus()
    if (!config) {
      await saveStatus({ ...status, configured: false })
      return { skipped: 'not-configured' }
    }
    const manual = trigger === 'manual'
    if (!manual && isTokenBlocked({ status, token: config.token })) return { skipped: 'token-rejected' }
    if (!manual && status.nextAttemptAt && status.nextAttemptAt > now()) return { skipped: 'backing-off' }
    try {
      const result = await track({ kind: 'plex-watch', trigger }, (job) => syncWith({ config, status, full, manual, job }))
      await saveStatus({
        ...status,
        configured: true,
        lastRunAt: result.startedAt,
        lastFullAt: result.full ? result.startedAt : status.lastFullAt ?? null,
        matched: result.full ? result.matched : status.matched ?? result.matched,
        unmatched: result.full ? result.unmatched : status.unmatched ?? null,
        ambiguous: result.full ? result.ambiguous : status.ambiguous ?? null,
        pulled: result.pulled,
        pushed: result.pushed,
        error: null,
        errorKind: null,
        failures: 0,
        nextAttemptAt: null,
        tokenMark: null,
      })
      return result
    } catch (err) {
      const failures = (status.failures ?? 0) + 1
      await saveStatus({
        ...status,
        configured: true,
        lastErrorAt: now(),
        error: err.message,
        errorKind: err.kind ?? 'unreachable',
        failures,
        nextAttemptAt: now() + backoffMs(failures),
        tokenMark: err.kind === 'token' ? tokenMarkOf(config.token) : null,
      })
      throw err
    }
  }

  const syncWith = async ({ config, status, full, manual, job }) => {
    const startedAt = now()
    const client = createClient({ url: config.url, token: config.token })
    job.step('Read recordings')
    const [rows, snapshots] = await Promise.all([loadRows(), loadSnapshots()])
    await pruneSnapshots(rows.map((row) => row.recording_id))
    const snapshotById = new Map(snapshots.map((snapshot) => [snapshot.recording_id, snapshot]))
    const fullPass = full || manual || needsFullPass({ status, rows, snapshotById, nowMs: startedAt })
    const toggles = await loadToggles()
    job.step(fullPass ? 'Read every Plex item' : 'Read recently watched Plex items')
    const planned = fullPass
      ? await planFull({ client, config, rows, snapshots, toggles, nowMs: startedAt })
      : await planQuick({ client, config, rows, snapshotById, status, toggles, nowMs: startedAt })
    job.fact('Pass', fullPass ? 'Full' : 'Recent changes')
    job.fact('Matched', planned.plans.length)
    if (fullPass) job.fact('Not in Plex yet', planned.unmatched)
    if (fullPass && planned.ambiguous) job.fact('More than one match', planned.ambiguous)
    const rowById = new Map(rows.map((row) => [row.recording_id, row]))
    job.step('Copy from Plex')
    const pulled = await applyPulls({ plans: planned.plans, rowById, job })
    job.step('Send to Plex')
    const pushOutcome = await applyPushes({ plans: planned.plans, rowById, client, job })
    job.step('Save state')
    await saveSnapshots(snapshotsToSave({ plans: planned.plans, snapshotById, pushOutcome }))
    const library = await afterSync({ client, full: fullPass, status, job }).catch((err) => {
      if (err.kind === 'token') throw err
      job.log(`Whole library: ${err.message}`, 'warn')
      return null
    })
    job.outcome(outcomeText({
      pulled,
      pushed: pushOutcome.pushed + (library?.pushed ?? 0),
      failed: pushOutcome.failed,
    }), pushOutcome.failed ? 'warn' : null)
    return {
      startedAt,
      full: fullPass,
      matched: planned.plans.length,
      unmatched: planned.unmatched,
      ambiguous: planned.ambiguous,
      pulled,
      pushed: pushOutcome.pushed,
      failed: pushOutcome.failed,
    }
  }

  const planFull = async ({ client, config, rows, snapshots, toggles, nowMs }) => {
    const items = []
    for (const section of config.sections) items.push(...await client.listItems({ section }))
    return planWatchSync({ rows, items, snapshots, ...toggles, nowMs })
  }

  const planQuick = async ({ client, config, rows, snapshotById, status, toggles, nowMs }) => {
    const sinceS = Math.floor(((status.lastRunAt ?? nowMs) - QUICK_OVERLAP_MS) / 1000)
    const viewed = []
    for (const section of config.sections) viewed.push(...await client.listItems({ section, viewedSinceS: sinceS }))
    const viewedKeys = new Set(viewed.map((item) => String(item.ratingKey)))
    const changedKeys = rows
      .map((row) => ({ row, snapshot: snapshotById.get(row.recording_id) }))
      .filter(({ row, snapshot }) => snapshot && !viewedKeys.has(String(snapshot.rating_key)) && freetvarrChanged({ row, snapshot }))
      .map(({ snapshot }) => String(snapshot.rating_key))
    const items = [...viewed, ...(changedKeys.length ? await client.metadata(changedKeys) : [])]
    const itemByKey = new Map(items.map((item) => [String(item.ratingKey), item]))
    const plans = rows
      .map((row) => ({ row, snapshot: snapshotById.get(row.recording_id) }))
      .filter(({ snapshot }) => snapshot && itemByKey.has(String(snapshot.rating_key)))
      .map(({ row, snapshot }) => planRow({ row, item: itemByKey.get(String(snapshot.rating_key)), snapshot, ...toggles, nowMs }))
    return { plans, unmatched: 0, ambiguous: 0 }
  }

  const applyPulls = async ({ plans, rowById, job }) => {
    let pulled = 0
    for (const plan of plans.filter((entry) => entry.pull)) {
      await applyPull({ recordingId: plan.recordingId, patch: plan.pull })
      pulled += 1
      job.item({ label: labelOf(rowById.get(plan.recordingId)), detail: pullText(plan.pull) })
    }
    return pulled
  }

  const applyPushes = async ({ plans, rowById, client, job }) => {
    const pending = plans.filter((plan) => plan.push)
    const outcome = { pushed: 0, failed: 0, failedIds: new Set(), skippedIds: new Set() }
    for (let start = 0; start < pending.length; start += PUSH_CONCURRENCY) {
      const batch = pending.slice(start, start + PUSH_CONCURRENCY)
      const { toPlex } = await loadToggles()
      if (!toPlex) {
        for (const plan of pending.slice(start)) outcome.skippedIds.add(plan.recordingId)
        break
      }
      await Promise.all(batch.map(async (plan) => {
        const label = labelOf(rowById.get(plan.recordingId))
        try {
          await client.write({ ratingKey: plan.ratingKey, ...plan.push })
          outcome.pushed += 1
          job.item({ label, detail: pushText(plan.push) })
        } catch (err) {
          if (err.kind === 'token') throw err
          outcome.failed += 1
          outcome.failedIds.add(plan.recordingId)
          job.item({ label, state: 'failed', detail: err.message })
          job.log(`${label}: ${err.message}`, 'warn')
        }
      }))
    }
    return outcome
  }

  const snapshotsToSave = ({ plans, snapshotById, pushOutcome }) => plans
    .map((plan) => {
      if (pushOutcome.failedIds.has(plan.recordingId)) {
        return snapshotAfterFailedPush({ plan, previous: snapshotById.get(plan.recordingId) })
      }
      if (pushOutcome.skippedIds.has(plan.recordingId)) {
        return { ...plan.snapshot, plex_watched: plan.plexNow.watched, plex_offset_s: plan.plexNow.offsetS }
      }
      return plan.snapshot
    })
    .filter(Boolean)

  const request = ({ trigger, full = false, delayMs = 0 } = {}) => {
    if (timer) clearTimer(timer)
    timer = setTimer(() => {
      timer = null
      run({ trigger, full }).catch((err) => console.warn(`[plex-watch] ${trigger} run failed: ${err.message}`))
    }, delayMs)
    timer?.unref?.()
  }

  const noteWatchChange = () => request({ trigger: 'watch-change', delayMs: WATCH_CHANGE_DELAY_MS })

  const libraryOpened = () => {
    if (now() - lastLibraryOpenAt < LIBRARY_OPEN_EVERY_MS) return
    lastLibraryOpenAt = now()
    request({ trigger: 'library-open' })
  }

  return { run, request, noteWatchChange, libraryOpened, isRunning: () => Boolean(inflight) }
}

export const needsFullPass = ({ status, rows, snapshotById, nowMs }) => {
  if (!status.lastFullAt || !status.lastRunAt) return true
  if (nowMs - status.lastFullAt >= FULL_PASS_EVERY_MS) return true
  const unsnapshotted = rows.some((row) => !snapshotById.has(row.recording_id))
  return unsnapshotted && nowMs - status.lastFullAt >= UNMATCHED_FULL_PASS_EVERY_MS
}

export const backoffMs = (failures) => Math.min(BACKOFF_MAX_MS, BACKOFF_FIRST_MS * 2 ** Math.max(0, failures - 1))

export const tokenMarkOf = (token) => createHash('sha256').update(String(token)).digest('hex').slice(0, 12)

export const isTokenBlocked = ({ status, token }) => status.errorKind === 'token' && status.tokenMark === tokenMarkOf(token)

export const outcomeText = ({ pulled, pushed, failed = 0 }) => {
  const parts = [
    pulled ? `${pulled} from Plex` : null,
    pushed ? `${pushed} to Plex` : null,
    failed ? `${failed} not sent` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'No changes'
}

const freetvarrChanged = ({ row, snapshot }) => {
  const ft = freetvarrStateOf(row)
  const before = snapshotStateOf(snapshot)
  return ft.watched !== before.ftWatched || Math.abs(ft.positionS - before.ftPositionS) > 15
}

const mergeRequest = (queued, next) => ({
  trigger: queued?.trigger === 'manual' ? 'manual' : next.trigger,
  full: Boolean(queued?.full || next.full),
})

const labelOf = (row) => {
  if (!row) return 'Recording'
  const number = row.season != null && row.episode != null ? ` S${row.season} E${row.episode}` : ''
  return `${row.title || 'Recording'}${number}`
}

const pullText = (patch) => {
  if ('watched_at' in patch) return patch.watched_at ? 'Marked watched from Plex' : 'Marked unwatched from Plex'
  return patch.playback_position_s ? `Resume point from Plex: ${clockOf(patch.playback_position_s)}` : 'Resume point cleared from Plex'
}

const pushText = (push) => {
  if (push.action === 'scrobble') return 'Marked watched in Plex'
  if (push.action === 'unscrobble') return 'Marked unwatched in Plex'
  return `Resume point sent to Plex: ${clockOf(push.seconds)}`
}

const clockOf = (seconds) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const mm = String(m).padStart(h ? 2 : 1, '0')
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}

const silentJob = new Proxy({}, { get: () => () => silentJob })
