import path from 'node:path'
import { fileURLToPath } from 'node:url'
import knexFactory from 'knex'

import { buildForYou } from '../src/for-you.js'
import { watchFractionOf } from '../src/for-you-profile.js'
import { msOf } from '../src/user-events.js'
import { showKeyOf } from '../src/web/show-key.js'

const DAY_MS = 24 * 60 * 60 * 1000
const WINDOW_MS = 7 * DAY_MS
const TOP_K = 10

const main = async () => {
  const options = optionsFrom(process.argv.slice(2))
  const db = knexFactory({ client: 'better-sqlite3', connection: { filename: options.dbPath, readonly: true }, useNullAsDefault: true })
  try {
    const data = await loadData(db)
    const days = evaluationDaysOf({ events: data.events, recordings: data.recordings, from: options.from, minTrainEvents: options.minTrainEvents })
    if (!days.length) {
      console.log('Not enough viewing history to evaluate yet (need positives after some training events).')
      return
    }
    const rows = days.map((dayMs) => evaluateDay({ ...data, dayMs }))
    printReport(rows)
  } finally {
    await db.destroy()
  }
}

const optionsFrom = (args) => {
  const value = (name) => {
    const index = args.indexOf(name)
    return index >= 0 ? args[index + 1] : null
  }
  const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  return {
    dbPath: value('--db') || process.env.DB_PATH || path.join(repoRoot, 'config', 'state.db'),
    from: value('--from') ? Date.parse(value('--from')) : null,
    minTrainEvents: Number(value('--min-train') || 5),
  }
}

const loadData = async (db) => {
  const [events, recordings, guideRows, genreRows] = await Promise.all([
    db('user_events').orderBy('ts'),
    db('recordings').select('*'),
    db('guide_programs').select('program_json'),
    db('title_genres').select('title_key', 'categories_json', 'genres_json', 'source').catch(() => []),
  ])
  return {
    events,
    recordings,
    guide: guideRows.map((row) => JSON.parse(row.program_json)),
    genresByKey: new Map(genreRows.map((row) => [row.title_key, { categories: JSON.parse(row.categories_json), genres: JSON.parse(row.genres_json), source: row.source }])),
  }
}

const evaluationDaysOf = ({ events, recordings, from, minTrainEvents }) => {
  const positiveTimes = [
    ...events.filter(isPositiveEvent).map((event) => Number(event.ts)),
    ...recordings.map((row) => Number(row.aired_at)).filter(Number.isFinite),
  ].sort((a, b) => a - b)
  if (!positiveTimes.length) return []
  const first = startOfDay(from ?? positiveTimes[0])
  const last = startOfDay(positiveTimes.at(-1))
  const days = []
  for (let dayMs = first; dayMs <= last; dayMs += DAY_MS) {
    const trained = events.filter((event) => Number(event.ts) < dayMs).length + recordings.filter((row) => Number(row.aired_at) < dayMs).length
    if (trained >= minTrainEvents && positivesIn({ events, recordings, fromMs: dayMs, toMs: dayMs + WINDOW_MS }).size) days.push(dayMs)
  }
  return days
}

const evaluateDay = ({ events, recordings, guide, genresByKey, dayMs }) => {
  const positives = positivesIn({ events, recordings, fromMs: dayMs, toMs: dayMs + WINDOW_MS })
  const trainingEvents = events.filter((event) => Number(event.ts) < dayMs)
  const trainingRecordings = recordings
    .filter((row) => Number(row.aired_at) < dayMs)
    .map((row) => ({
      ...row,
      watched_at: msOf(row.watched_at) < dayMs ? row.watched_at : null,
      playback_position_s: msOf(row.played_at) < dayMs ? row.playback_position_s : null,
    }))
  const candidates = candidatesFor({ guide, events, recordings, dayMs })
  const result = buildForYou({
    nowMs: dayMs,
    programmes: candidates.programmes,
    events: trainingEvents,
    recordings: trainingRecordings,
    genresByKey,
    limit: TOP_K * 2,
  })
  const ranked = rankedKeysOf(result).slice(0, TOP_K)
  const popular = popularKeysOf(candidates.programmes).slice(0, TOP_K)
  const hits = [...positives].filter((key) => ranked.includes(key))
  const popularHits = [...positives].filter((key) => popular.includes(key))
  return {
    day: new Date(dayMs).toISOString().slice(0, 10),
    positives: positives.size,
    candidates: new Set(candidates.programmes.map((programme) => showKeyOf(programme.title))).size,
    synthetic: candidates.synthetic,
    coldStart: result.coldStart,
    hits: hits.length,
    hit: hits.length > 0,
    popularHits: popularHits.length,
    hitTitles: hits,
  }
}

const positivesIn = ({ events, recordings, fromMs, toMs }) => {
  const keys = new Set()
  for (const event of events) {
    const ts = Number(event.ts)
    if (ts >= fromMs && ts < toMs && isPositiveEvent(event)) keys.add(event.series_key || showKeyOf(event.title))
  }
  for (const row of recordings) {
    const airedAt = Number(row.aired_at)
    if (airedAt >= fromMs && airedAt < toMs) keys.add(showKeyOf(row.title))
  }
  keys.delete('untitled')
  return keys
}

const isPositiveEvent = (event) => {
  if (event.kind === 'record_request' || event.kind === 'thumb_up' || event.kind === 'suggestion_accepted') return Boolean(event.title || event.series_key)
  if (event.kind !== 'watch_end') return false
  return watchFractionOf({ event, meta: parseMeta(event.meta_json) }) >= 0.8
}

const candidatesFor = ({ guide, events, recordings, dayMs }) => {
  const inWindow = guide.filter((programme) => programme.start >= dayMs && programme.start < dayMs + WINDOW_MS)
  if (inWindow.length) return { programmes: inWindow, synthetic: false }
  const titles = new Map()
  for (const programme of guide) titles.set(showKeyOf(programme.title), programme)
  for (const row of recordings) if (!titles.has(showKeyOf(row.title))) titles.set(showKeyOf(row.title), { title: row.title, synopsis: row.synopsis, channel_id: row.channel_id, series_no: row.season, episode_no: row.episode })
  for (const event of events) if (event.title && !titles.has(showKeyOf(event.title))) titles.set(showKeyOf(event.title), { title: event.title, channel_id: event.channel_id })
  const programmes = [...titles.values()].map((programme, index) => ({
    ...programme,
    program_id: `eval-${index}`,
    start: dayMs + ((index * 7 * 60 * 60 * 1000) % WINDOW_MS),
    end: dayMs + ((index * 7 * 60 * 60 * 1000) % WINDOW_MS) + 60 * 60 * 1000,
    dvr_state: null,
    dvr_uuid: null,
  }))
  return { programmes, synthetic: true }
}

const rankedKeysOf = (result) => {
  const items = result.sections.flatMap((section) => section.items).sort((a, b) => b.score - a.score)
  return [...new Set(items.map((item) => item.seriesKey))]
}

const popularKeysOf = (programmes) => {
  const counts = new Map()
  for (const programme of programmes) counts.set(showKeyOf(programme.title), (counts.get(showKeyOf(programme.title)) || 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1]).map(([key]) => key)
}

const printReport = (rows) => {
  console.table(rows.map(({ hitTitles, ...row }) => ({ ...row, hitTitles: hitTitles.join(', ') })))
  const positives = rows.reduce((sum, row) => sum + row.positives, 0)
  const hits = rows.reduce((sum, row) => sum + row.hits, 0)
  const popularHits = rows.reduce((sum, row) => sum + row.popularHits, 0)
  const dayRate = rows.filter((row) => row.hit).length / rows.length
  console.log(`days evaluated: ${rows.length}`)
  console.log(`hit-rate@${TOP_K} (days with at least one hit): ${(dayRate * 100).toFixed(1)}%`)
  console.log(`recall@${TOP_K} (positive shows in the top ${TOP_K}): ${positives ? ((hits / positives) * 100).toFixed(1) : '0.0'}% (${hits}/${positives})`)
  console.log(`popularity baseline recall@${TOP_K}: ${positives ? ((popularHits / positives) * 100).toFixed(1) : '0.0'}%`)
  if (rows.some((row) => row.synthetic)) console.log('note: some days had no saved guide, so candidates were rebuilt from known titles')
}

const startOfDay = (ms) => {
  const date = new Date(ms)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

const parseMeta = (value) => {
  try {
    return value ? JSON.parse(value) : null
  } catch {
    return null
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
