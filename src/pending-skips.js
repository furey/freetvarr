import { db } from './db.js'
import { SIMULCAST_START_TOLERANCE_MS } from './web/simulcast.js'

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
  isSameEvent({ skip, entry }) || isSameAiring({ skip, entry })

export const splitPendingSkips = ({ upcoming = [], pendingSkips = [] }) => {
  const series = upcoming.filter((entry) => entry.source === 'series')
  const held = skipsByEntry({ entries: series, pendingSkips })
  const kept = []
  const skipped = []
  for (const entry of upcoming) {
    if (held.has(entry)) skipped.push({ ...entry, skipped: true })
    else kept.push(entry)
  }
  return { upcoming: kept, skipped }
}

export const entriesToSkip = ({ entries = [], pendingSkips = [] }) => {
  const waiting = entries.filter((entry) => entry.enabled !== false && entry.schedStatus === 'scheduled')
  const held = skipsByEntry({ entries: waiting, pendingSkips })
  return waiting.filter((entry) => held.has(entry)).map((entry) => ({ entry, skip: held.get(entry) }))
}

const skipsByEntry = ({ entries, pendingSkips }) => {
  const held = new Map()
  for (const skip of pendingSkips) {
    const entry = entries.find((e) => isSameEvent({ skip, entry: e })) || nearestAiringOf({ skip, entries })
    if (entry) held.set(entry, skip)
  }
  return held
}

const nearestAiringOf = ({ skip, entries }) => entries
  .filter((entry) => isSameAiring({ skip, entry }))
  .sort((a, b) => startGap({ skip, entry: a }) - startGap({ skip, entry: b }))[0] || null

const isSameEvent = ({ skip, entry }) =>
  String(skip.channelId) === String(entry.channelId) && String(skip.programId) === String(entry.programId)

const isSameAiring = ({ skip, entry }) =>
  String(skip.channelId) === String(entry.channelId)
  && titleKey(skip.name) === titleKey(entry.name)
  && startGap({ skip, entry }) <= SIMULCAST_START_TOLERANCE_MS

const startGap = ({ skip, entry }) => Math.abs(Number(skip.startDate) - Number(entry.startDate))

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
