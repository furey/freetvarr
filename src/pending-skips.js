import { db } from './db.js'

export const listPendingSkips = async ({ nowMs = Date.now() } = {}) => {
  await db('pending_skips').where('end_ms', '<=', nowMs).delete()
  return (await db('pending_skips')).map(pendingSkipOfRow)
}

export const hasPendingSkips = async ({ nowMs = Date.now() } = {}) =>
  Boolean(await db('pending_skips').where('end_ms', '>', nowMs).first())

export const addPendingSkip = (entry) =>
  db('pending_skips').insert(rowOfEntry(entry)).onConflict('program_id').merge()

export const removePendingSkip = async (programId) =>
  (await db('pending_skips').where({ program_id: String(programId) }).delete()) > 0

export const matchesPendingSkip = ({ skip, entry }) =>
  String(skip.channelId) === String(entry.channelId)
  && Number(skip.startDate) === Number(entry.startDate)
  && (String(skip.programId) === String(entry.programId) || titleKey(skip.name) === titleKey(entry.name))

export const pendingSkipFor = ({ pendingSkips = [], entry }) =>
  pendingSkips.find((skip) => matchesPendingSkip({ skip, entry })) || null

export const splitPendingSkips = ({ upcoming = [], pendingSkips = [] }) => {
  const kept = []
  const skipped = []
  for (const entry of upcoming) {
    if (entry.source === 'series' && pendingSkipFor({ pendingSkips, entry })) skipped.push({ ...entry, skipped: true })
    else kept.push(entry)
  }
  return { upcoming: kept, skipped }
}

export const entriesToSkip = ({ entries = [], pendingSkips = [] }) => entries
  .filter((entry) => entry.enabled !== false && entry.schedStatus === 'scheduled')
  .map((entry) => ({ entry, skip: pendingSkipFor({ pendingSkips, entry }) }))
  .filter(({ skip }) => skip)

const titleKey = (title) => String(title ?? '').trim().toLowerCase()

const rowOfEntry = (entry) => ({
  program_id: String(entry.programId),
  channel_id: String(entry.channelId),
  title: String(entry.name ?? ''),
  start_ms: Number(entry.startDate),
  end_ms: Number(entry.endDate),
  created_at: Date.now(),
})

const pendingSkipOfRow = (row) => ({
  programId: row.program_id,
  channelId: row.channel_id,
  name: row.title,
  startDate: Number(row.start_ms),
  endDate: Number(row.end_ms),
})
