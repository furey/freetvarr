import { db, getSetting, setSetting } from './db.js'

export const IN_PROGRESS_POSITIONS_KEY = 'in_progress_positions'
export const POSITION_KEEP_MS = 3 * 24 * 60 * 60 * 1000

export const rememberInProgressPosition = ({ recordingId, seconds, nowMs = Date.now() }) => oneAtATime(async () => {
  const positions = withPosition({ positions: await loadPositions(), recordingId, seconds, nowMs })
  await setSetting(IN_PROGRESS_POSITIONS_KEY, JSON.stringify(positions))
})

export const applyInProgressPositions = ({ watchedAtFor, nowMs = Date.now() }) => oneAtATime(async () => {
  const positions = await loadPositions()
  const ids = Object.keys(positions)
  if (!ids.length) return []
  const rows = await db('recordings').whereIn('recording_id', ids).select('recording_id', 'playback_position_s')
  const applied = []
  for (const row of rows.filter((r) => r.playback_position_s == null)) {
    const { seconds, savedAt } = positions[row.recording_id]
    await db('recordings').where({ recording_id: row.recording_id }).update({
      playback_position_s: seconds,
      played_at: new Date(savedAt).toISOString(),
      watched_at: watchedAtFor({ seconds, nowIso: new Date(nowMs).toISOString() }),
    })
    applied.push(row.recording_id)
  }
  const remaining = prunedPositions({ positions: withoutIds({ positions, ids: rows.map((r) => r.recording_id) }), nowMs })
  await setSetting(IN_PROGRESS_POSITIONS_KEY, JSON.stringify(remaining))
  return applied
})

export const withPosition = ({ positions, recordingId, seconds, nowMs }) =>
  prunedPositions({ positions: { ...positions, [recordingId]: { seconds, savedAt: nowMs } }, nowMs })

export const prunedPositions = ({ positions, nowMs }) => Object.fromEntries(
  Object.entries(positions).filter(([, position]) => nowMs - Number(position?.savedAt) <= POSITION_KEEP_MS),
)

export const parsePositions = (text) => {
  try {
    const value = JSON.parse(text || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

const withoutIds = ({ positions, ids }) => {
  const gone = new Set(ids)
  return Object.fromEntries(Object.entries(positions).filter(([id]) => !gone.has(id)))
}

const oneAtATime = (task) => {
  const run = queue.then(task)
  queue = run.catch(() => {})
  return run
}

let queue = Promise.resolve()

const loadPositions = async () => parsePositions(await getSetting(IN_PROGRESS_POSITIONS_KEY))
