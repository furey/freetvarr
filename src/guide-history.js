import { db, deleteInChunks } from './db.js'

export const saveGuidePrograms = async ({ programs = [], nowMs = Date.now() } = {}) => {
  await db.transaction(async (trx) => {
    for (const { channelId, fromMs, toMs } of snapshotSpans(programs)) {
      await yieldToEventLoop()
      await trx('guide_programs')
        .where('channel_id', channelId)
        .andWhere('end', '>', fromMs)
        .andWhere('start', '<', toMs)
        .delete()
    }
    for (const chunk of chunksOf(programs, UPSERT_CHUNK_SIZE)) {
      await yieldToEventLoop()
      await trx('guide_programs').insert(chunk.map(toSavedRow)).onConflict(['channel_id', 'start']).merge()
    }
    await yieldToEventLoop()
    await deleteInChunks({ database: trx, table: 'guide_programs', where: (query) => query.where('end', '<', startOfYesterdayMs(nowMs)) })
  })
  savedVersion += 1
}

export const guideHistoryVersion = () => savedVersion

export const createEndedHistory = ({ load = loadEndedProgramJson, version = guideHistoryVersion } = {}) => {
  let cached = null
  let queue = Promise.resolve()
  const refresh = async ({ nowMs }) => {
    const current = version()
    const reusable = cached && cached.version === current && nowMs >= cached.untilMs
    const added = await load({ fromMs: reusable ? cached.untilMs : null, toMs: nowMs })
    cached = { version: current, untilMs: nowMs, rows: reusable ? [...cached.rows, ...added] : added }
    return cached.rows
  }
  return {
    read: ({ nowMs }) => {
      const next = queue.then(() => refresh({ nowMs }))
      queue = next.catch(() => {})
      return next
    },
  }
}

export const loadEndedProgramsByChannel = async ({ fromMs, toMs, nowMs = Date.now() }) => {
  const byChannel = new Map()
  if (fromMs >= nowMs) return byChannel
  const rows = await db('guide_programs')
    .where('end', '>', fromMs)
    .andWhere('start', '<', toMs)
    .andWhere('end', '<=', nowMs)
    .orderBy('start')
  for (const row of rows) {
    const program = fromSavedRow(row)
    programsFor({ byChannel, channelId: String(program.channel_id) }).push(program)
  }
  return byChannel
}

export const mergeGuidePrograms = ({ live = [], saved = [] }) => {
  const gapFillers = saved.filter((s) => !live.some((l) => overlaps(l, s)))
  return [...gapFillers, ...live].sort((a, b) => a.start - b.start)
}

export const syncSavedDvrState = async ({ futureRecordings = [], nowMs = Date.now() } = {}) => {
  const scheduled = futureRecordings.filter((r) => r.programId != null)
  await db.transaction(async (trx) => {
    await trx('guide_programs')
      .where('end', '>', nowMs)
      .whereNotNull('dvr_uuid')
      .whereNotIn('program_id', scheduled.map((r) => String(r.programId)))
      .update({ dvr_state: null, dvr_uuid: null })
    for (const r of scheduled) {
      await trx('guide_programs')
        .where({ program_id: String(r.programId) })
        .andWhere('end', '>', nowMs)
        .update({ dvr_state: r.schedStatus || 'scheduled', dvr_uuid: r.uuid ?? null })
    }
  })
}

export const savedProgramFor = async ({ programId }) => {
  const row = await db('guide_programs')
    .where({ program_id: String(programId) })
    .orderBy('start', 'desc')
    .first()
  return row ? JSON.parse(row.program_json) : null
}

export const savedImageFor = async ({ programId }) =>
  (await savedProgramFor({ programId }))?.image || null

export const startOfYesterdayMs = (nowMs) => {
  const yesterday = new Date(nowMs)
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)
  return yesterday.getTime()
}

const toSavedRow = ({ dvr_state, dvr_uuid, ...program }) => ({
  channel_id: String(program.channel_id),
  start: program.start,
  end: program.end,
  program_id: String(program.program_id),
  dvr_state: dvr_state ?? null,
  dvr_uuid: dvr_uuid ?? null,
  program_json: JSON.stringify(program),
})

const loadEndedProgramJson = async ({ fromMs, toMs }) => {
  const rows = await db('guide_programs')
    .where('end', '<=', toMs)
    .modify((query) => {
      if (fromMs !== null) query.andWhere('end', '>', fromMs)
    })
    .select('program_json')
  return rows.map((row) => row.program_json)
}

const fromSavedRow = (row) => ({
  ...JSON.parse(row.program_json),
  dvr_state: row.dvr_state,
  dvr_uuid: row.dvr_uuid,
})

const programsFor = ({ byChannel, channelId }) => {
  if (!byChannel.has(channelId)) byChannel.set(channelId, [])
  return byChannel.get(channelId)
}

const snapshotSpans = (programs) => {
  const spans = new Map()
  for (const program of programs) {
    const { start, end } = program
    const channel_id = String(program.channel_id)
    const span = spans.get(channel_id)
    spans.set(channel_id, span
      ? { channelId: channel_id, fromMs: Math.min(span.fromMs, start), toMs: Math.max(span.toMs, end) }
      : { channelId: channel_id, fromMs: start, toMs: end })
  }
  return spans.values()
}

const overlaps = (a, b) => a.start < b.end && b.start < a.end

const chunksOf = (items, size) => Array.from(
  { length: Math.ceil(items.length / size) },
  (_, i) => items.slice(i * size, (i + 1) * size),
)

const yieldToEventLoop = () => new Promise(setImmediate)

let savedVersion = 0

const UPSERT_CHUNK_SIZE = 500
