import { db } from './db.js'
import { titlesAgree } from './freeview-au.js'
import { showTitleKey } from './show-artwork.js'

export const SOURCE_ROW = ''
export const SCORE_WINDOW_HOURS = 48
export const MEDIAN_DAYS = 14
export const LOW_COVERAGE_SHARE = 0.5
export const MIN_HORIZON_HOURS = 72
export const MIN_AGREEMENT = 0.6
export const LISTINGS_AUTOMATIC = 'auto'
export const LISTINGS_MODE_KEY = 'guide_listings_source'
export const LISTINGS_PINS_KEY = 'guide_listings_pins'

export const scoreListings = ({ programmes = [], others = null, nowMs, attempts = 1, failures = 0, toleranceMs = TOLERANCE_MS }) => {
  const windowEnd = nowMs + SCORE_WINDOW_HOURS * HOUR_MS
  const upcoming = inWindow({ programmes, from: nowMs, to: windowEnd })
  const otherUpcoming = others ? inWindow({ programmes: others, from: nowMs - toleranceMs, to: windowEnd + toleranceMs }) : []
  const judged = otherUpcoming.length ? upcoming.length : 0
  const matched = judged ? upcoming.filter((programme) => hasPartner({ programme, others: otherUpcoming, toleranceMs })).length : 0
  const described = upcoming.filter((programme) => programme.title && programme.desc).length
  const lastStop = programmes.reduce((latest, programme) => Math.max(latest, programme.stop), 0)
  return {
    coveredHours: round(coveredMsOf({ programmes: upcoming, from: nowMs, to: windowEnd }) / HOUR_MS),
    horizonHours: round(Math.max(0, lastStop - nowMs) / HOUR_MS),
    describedShare: upcoming.length ? round(described / upcoming.length) : null,
    agreement: judged ? round(matched / judged) : null,
    fetchAttempts: attempts,
    fetchFailures: failures,
    counts: { upcoming: upcoming.length, described, judged, matched },
  }
}

export const sourceScoreOf = (scores) => {
  const total = (pick) => scores.reduce((sum, score) => sum + pick(score), 0)
  const upcoming = total((score) => score.counts.upcoming)
  const judged = total((score) => score.counts.judged)
  return {
    coveredHours: round(total((score) => score.coveredHours)),
    horizonHours: scores.reduce((latest, score) => Math.max(latest, score.horizonHours), 0),
    describedShare: upcoming ? round(total((score) => score.counts.described) / upcoming) : null,
    agreement: judged ? round(total((score) => score.counts.matched) / judged) : null,
    fetchAttempts: total((score) => score.fetchAttempts),
    fetchFailures: total((score) => score.fetchFailures),
  }
}

export const isBelow = ({ score, medianCoverage = null }) => (medianCoverage > 0 && score.coveredHours < medianCoverage * LOW_COVERAGE_SHARE)
  || score.horizonHours < MIN_HORIZON_HOURS
  || (score.agreement !== null && score.agreement < MIN_AGREEMENT)

export const judgeScore = ({ score, history = [] }) => {
  const below = isBelow({ score, medianCoverage: medianOf(history.map((row) => row.coveredHours)) })
  return { below, degraded: below && Boolean(history[0]?.below) }
}

export const leadOf = ({ channel, choice = {}, primaryId, secondaryId, hasPrimary, hasSecondary, primaryDegraded = false, secondaryDegraded = false }) => {
  if (!hasPrimary || !hasSecondary) return { lead: hasPrimary ? 'primary' : 'secondary', pinned: false, fallback: false }
  const pin = choice.pins?.[channel]
  const named = pin ?? (choice.mode && choice.mode !== LISTINGS_AUTOMATIC ? choice.mode : null)
  if (named === primaryId) return { lead: 'primary', pinned: true, fallback: false }
  if (named === secondaryId) return { lead: 'secondary', pinned: true, fallback: false }
  if (primaryDegraded && !secondaryDegraded) return { lead: 'secondary', pinned: false, fallback: true }
  return { lead: 'primary', pinned: false, fallback: false }
}

export const createBuildHealth = ({ history = new Map(), nowMs, primaryId = null, secondaryId = null }) => {
  const rows = []
  const sideScores = new Map([[primaryId, []], [secondaryId, []]])

  const judgeSide = ({ source, channel, score }) => {
    const verdict = judgeScore({ score, history: history.get(keyOf({ source, channel })) ?? [] })
    rows.push({ source, channel, score, ...verdict, led: false })
    sideScores.get(source)?.push(score)
    return verdict
  }

  const channel = ({ id, primary = null, secondary = null }) => {
    const primaryScore = primary && scoreListings({ ...primary, others: secondary?.programmes ?? null, nowMs })
    const secondaryScore = secondary && scoreListings({ ...secondary, others: primary?.programmes ?? null, nowMs })
    return {
      primary: primaryScore ? judgeSide({ source: primaryId, channel: id, score: primaryScore }) : null,
      secondary: secondaryScore ? judgeSide({ source: secondaryId, channel: id, score: secondaryScore }) : null,
    }
  }

  const markLed = ({ source, channel }) => {
    const row = rows.find((candidate) => candidate.source === source && candidate.channel === channel)
    if (row) row.led = true
  }

  const previousLead = ({ source, channel }) => history.get(keyOf({ source, channel }))?.[0]?.led ?? null

  const finish = ({ failedSources = new Map() } = {}) => {
    const sourceRows = [primaryId, secondaryId].filter(Boolean).map((source) => {
      const scores = sideScores.get(source)
      const failed = failedSources.get(source)
      const score = failed || !scores.length
        ? { ...EMPTY_SCORE, fetchAttempts: 1, fetchFailures: failed ? 1 : 0 }
        : sourceScoreOf(scores)
      const verdict = judgeScore({ score, history: history.get(keyOf({ source, channel: SOURCE_ROW })) ?? [] })
      return { source, channel: SOURCE_ROW, score, ...verdict, led: rows.some((row) => row.source === source && row.led) }
    })
    return [...sourceRows, ...rows]
  }

  return { channel, markLed, previousLead, finish }
}

export const createSourceHealthStore = ({ database = db, now = Date.now, keepMs = MEDIAN_DAYS * DAY_MS + DAY_MS } = {}) => {
  const history = async () => {
    const rows = await database('guide_source_health')
      .where('built_at', '>=', now() - MEDIAN_DAYS * DAY_MS)
      .orderBy('built_at', 'desc')
    const byKey = new Map()
    for (const row of rows.map(rowOf)) {
      const key = keyOf(row)
      if (!byKey.has(key)) byKey.set(key, [])
      byKey.get(key).push(row)
    }
    return byKey
  }

  const save = async ({ builtAt, rows }) => {
    const records = rows.map((row) => ({
      built_at: builtAt,
      source: row.source,
      channel: row.channel,
      covered_hours: row.score.coveredHours,
      horizon_hours: row.score.horizonHours,
      described_share: row.score.describedShare,
      agreement: row.score.agreement,
      fetch_attempts: row.score.fetchAttempts,
      fetch_failures: row.score.fetchFailures,
      below: row.below,
      degraded: row.degraded,
      led: row.led,
    }))
    for (let index = 0; index < records.length; index += WRITE_BATCH) {
      await database('guide_source_health').insert(records.slice(index, index + WRITE_BATCH))
    }
    await database('guide_source_health').where('built_at', '<', now() - keepMs).delete()
  }

  const latest = async () => {
    const newest = await database('guide_source_health').max({ builtAt: 'built_at' }).first()
    if (!newest?.builtAt) return { builtAt: null, sources: [], channels: [] }
    const rows = (await database('guide_source_health').where({ built_at: newest.builtAt })).map(rowOf)
    const sourceRows = rows.filter((row) => row.channel === SOURCE_ROW)
    const sources = await Promise.all(sourceRows.map(async (row) => ({
      ...row,
      lastSuccessAt: await lastSuccessOf(row.source),
      score: healthyShareOf(rows.filter((other) => other.source === row.source && other.channel !== SOURCE_ROW)),
    })))
    return { builtAt: Number(newest.builtAt), sources, channels: rows.filter((row) => row.channel !== SOURCE_ROW) }
  }

  const lastSuccessOf = async (source) => {
    const row = await database('guide_source_health')
      .where({ source, channel: SOURCE_ROW })
      .where('covered_hours', '>', 0)
      .max({ at: 'built_at' })
      .first()
    return row?.at ? Number(row.at) : null
  }

  return { history, save, latest }
}

export const healthyShareOf = (channelRows) => (channelRows.length
  ? Math.round((100 * channelRows.filter((row) => !row.degraded).length) / channelRows.length)
  : null)

export const medianOf = (values) => {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (!sorted.length) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const rowOf = (row) => ({
  builtAt: Number(row.built_at),
  source: row.source,
  channel: row.channel,
  coveredHours: Number(row.covered_hours),
  horizonHours: Number(row.horizon_hours),
  describedShare: row.described_share == null ? null : Number(row.described_share),
  agreement: row.agreement == null ? null : Number(row.agreement),
  fetchAttempts: Number(row.fetch_attempts),
  fetchFailures: Number(row.fetch_failures),
  below: Boolean(row.below),
  degraded: Boolean(row.degraded),
  led: Boolean(row.led),
})

const keyOf = ({ source, channel }) => `${source}|${channel}`

const inWindow = ({ programmes, from, to }) => programmes.filter((programme) => programme.stop > from && programme.start < to)

const coveredMsOf = ({ programmes, from, to }) => {
  const spans = programmes
    .map((programme) => [Math.max(from, programme.start), Math.min(to, programme.stop)])
    .filter(([start, stop]) => stop > start)
    .sort((a, b) => a[0] - b[0])
  let covered = 0
  let reach = from
  for (const [start, stop] of spans) {
    if (stop <= reach) continue
    covered += stop - Math.max(start, reach)
    reach = stop
  }
  return covered
}

const hasPartner = ({ programme, others, toleranceMs }) => {
  const key = showTitleKey(programme.title)
  return others.some((other) => Math.abs(other.start - programme.start) <= toleranceMs && titlesAgree(showTitleKey(other.title), key))
}

const round = (value) => Math.round(value * 100) / 100

const EMPTY_SCORE = { coveredHours: 0, horizonHours: 0, describedShare: null, agreement: null, fetchAttempts: 0, fetchFailures: 0 }
const HOUR_MS = 60 * 60_000
const DAY_MS = 24 * HOUR_MS
const TOLERANCE_MS = 5 * 60_000
const WRITE_BATCH = 200
