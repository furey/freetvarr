import { matchPlexItem } from './library-actions.js'

export const OFFSET_TOLERANCE_S = 15
export const END_MARGIN_S = 30

export const planWatchSync = ({ rows, items, snapshots, fromPlex = true, toPlex = true, nowMs = Date.now() }) => {
  const matches = matchRows({ rows, items })
  const snapshotById = new Map(snapshots.map((snapshot) => [snapshot.recording_id, snapshot]))
  const plans = matches.matched.map(({ row, item }) => planRow({
    row, item, snapshot: snapshotById.get(row.recording_id) ?? null, fromPlex, toPlex, nowMs,
  }))
  return { plans, unmatched: matches.unmatched, ambiguous: matches.ambiguous }
}

export const planRow = ({ row, item, snapshot, fromPlex = true, toPlex = true, nowMs = Date.now() }) => {
  const plex = plexStateOf(item)
  const ft = freetvarrStateOf(row)
  const baseline = !snapshot || String(snapshot.rating_key) !== plex.ratingKey
  const watched = watchedDecision({ plex, ft, snapshot, baseline })
  const position = watched.result || watched.winner ? null : positionDecision({ plex, ft, snapshot, baseline })
  const pull = fromPlex ? pullPatchOf({ watched, position, plex, row, nowMs }) : null
  const push = toPlex ? pushActionOf({ watched, position, plex, ft }) : null
  return {
    recordingId: row.recording_id,
    ratingKey: plex.ratingKey,
    baseline,
    pull,
    push,
    snapshot: snapshotAfter({ row, plex, ft, pull, push }),
    plexNow: { watched: plex.watched, offsetS: plex.offsetS },
  }
}

export const snapshotAfterFailedPush = ({ plan, previous }) => {
  if (!previous || String(previous.rating_key) !== plan.ratingKey) return null
  return {
    ...plan.snapshot,
    plex_watched: plan.plexNow.watched,
    plex_offset_s: plan.plexNow.offsetS,
    ft_watched: Boolean(previous.ft_watched),
    ft_position_s: Number(previous.ft_position_s) || 0,
  }
}

export const plexStateOf = (item) => ({
  ratingKey: String(item.ratingKey),
  watched: Number(item.viewCount) > 0,
  offsetS: item.viewOffset ? Math.floor(Number(item.viewOffset) / 1000) : 0,
  viewedAtMs: item.lastViewedAt ? Number(item.lastViewedAt) * 1000 : null,
  durationS: item.duration ? Math.round(Number(item.duration) / 1000) : null,
})

export const freetvarrStateOf = (row) => ({
  watched: row.watched_at != null,
  positionS: Math.max(0, Math.round(Number(row.playback_position_s) || 0)),
  playedAtMs: timeOf(row.played_at),
})

export const snapshotStateOf = (snapshot) => ({
  plexWatched: Boolean(snapshot.plex_watched),
  plexOffsetS: Number(snapshot.plex_offset_s) || 0,
  ftWatched: Boolean(snapshot.ft_watched),
  ftPositionS: Number(snapshot.ft_position_s) || 0,
})

export const matchRows = ({ rows, items }) => {
  const claimed = new Map()
  const matched = []
  let unmatched = 0
  let ambiguous = 0
  for (const row of rows) {
    const found = uniqueMatchOf({ items, filePath: row.file_path })
    if (found === AMBIGUOUS) ambiguous += 1
    else if (!found) unmatched += 1
    else {
      const key = String(found.ratingKey)
      claimed.set(key, [...(claimed.get(key) ?? []), { row, item: found }])
    }
  }
  for (const pairs of claimed.values()) {
    if (pairs.length === 1) matched.push(pairs[0])
    else ambiguous += pairs.length
  }
  return { matched, unmatched, ambiguous }
}

const uniqueMatchOf = ({ items, filePath }) => {
  const best = matchPlexItem({ items, filePath })
  if (!best) return null
  const rivals = items.filter((item) => item !== best && String(item.ratingKey) !== String(best.ratingKey)
    && matchPlexItem({ items: [item, best], filePath }) === item)
  return rivals.length ? AMBIGUOUS : best
}

const watchedDecision = ({ plex, ft, snapshot, baseline }) => {
  if (plex.watched === ft.watched) return { result: plex.watched, winner: null }
  if (baseline) return plex.watched ? { result: true, winner: 'plex' } : { result: true, winner: 'freetvarr' }
  const before = snapshotStateOf(snapshot)
  const plexChanged = plex.watched !== before.plexWatched
  const ftChanged = ft.watched !== before.ftWatched
  if (ftChanged) return { result: ft.watched, winner: 'freetvarr' }
  if (plexChanged) return { result: plex.watched, winner: 'plex' }
  return { result: ft.watched, winner: null }
}

const positionDecision = ({ plex, ft, snapshot, baseline }) => {
  if (sameOffset(plex.offsetS, ft.positionS)) return null
  if (baseline) {
    if (!ft.positionS) return { winner: 'plex', seconds: plex.offsetS }
    if (!plex.offsetS) return { winner: 'freetvarr', seconds: ft.positionS }
    return newerOffset({ plex, ft })
  }
  const before = snapshotStateOf(snapshot)
  const plexChanged = !sameOffset(plex.offsetS, before.plexOffsetS)
  const ftChanged = !sameOffset(ft.positionS, before.ftPositionS)
  if (plexChanged && ftChanged) return newerOffset({ plex, ft })
  if (plexChanged) return { winner: 'plex', seconds: plex.offsetS }
  if (ftChanged) return { winner: 'freetvarr', seconds: ft.positionS }
  return null
}

const newerOffset = ({ plex, ft }) => ((plex.viewedAtMs ?? 0) > (ft.playedAtMs ?? 0)
  ? { winner: 'plex', seconds: plex.offsetS }
  : { winner: 'freetvarr', seconds: ft.positionS })

const pullPatchOf = ({ watched, position, plex, row, nowMs }) => {
  if (watched.winner === 'plex') return watched.result ? watchPatchOf({ plex, row, nowMs }) : UNWATCH_PATCH
  if (position?.winner !== 'plex') return null
  if (!position.seconds) return { playback_position_s: null }
  const atIso = new Date(plex.viewedAtMs ?? nowMs).toISOString()
  const durationS = Number(row.duration_s) || plex.durationS
  const nearEnd = durationS > 0 && position.seconds >= durationS - END_MARGIN_S
  return { playback_position_s: position.seconds, played_at: atIso, ...(nearEnd ? { watched_at: atIso } : {}) }
}

const watchPatchOf = ({ plex, row, nowMs }) => {
  const atMs = plex.viewedAtMs ?? nowMs
  const playedMs = Math.max(atMs, timeOf(row.played_at) ?? 0)
  return { watched_at: new Date(atMs).toISOString(), played_at: new Date(playedMs).toISOString() }
}

const pushActionOf = ({ watched, position }) => {
  if (watched.winner === 'freetvarr') return { action: watched.result ? 'scrobble' : 'unscrobble' }
  if (position?.winner === 'freetvarr' && position.seconds > 0) return { action: 'progress', seconds: position.seconds }
  return null
}

const snapshotAfter = ({ row, plex, ft, pull, push }) => {
  const plexAfter = plexAfterPush({ plex, push })
  const ftAfter = ftAfterPull({ ft, pull })
  return {
    recording_id: row.recording_id,
    rating_key: plex.ratingKey,
    plex_watched: plexAfter.watched,
    plex_offset_s: plexAfter.offsetS,
    ft_watched: ftAfter.watched,
    ft_position_s: ftAfter.positionS,
  }
}

const plexAfterPush = ({ plex, push }) => {
  if (push?.action === 'scrobble') return { watched: true, offsetS: 0 }
  if (push?.action === 'unscrobble') return { watched: false, offsetS: 0 }
  if (push?.action === 'progress') return { watched: plex.watched, offsetS: push.seconds }
  return plex
}

const ftAfterPull = ({ ft, pull }) => {
  if (!pull) return ft
  return {
    watched: 'watched_at' in pull ? pull.watched_at != null : ft.watched,
    positionS: 'playback_position_s' in pull ? pull.playback_position_s ?? 0 : ft.positionS,
  }
}

const sameOffset = (a, b) => Math.abs(a - b) <= OFFSET_TOLERANCE_S

const timeOf = (value) => {
  if (value == null) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

const UNWATCH_PATCH = { watched_at: null, playback_position_s: null }
const AMBIGUOUS = Symbol('ambiguous')
