import fs from 'fs/promises'

import { getSetting, setSetting } from './db.js'
import {
  listChannels,
  listEvents,
  getState,
  scheduleRecording,
  cancelRecording,
  enableSeriesTag,
  disableSeriesTag,
  resolveConnection,
  getChannelIcon,
  TvheadendError,
} from './tvheadend.js'

export const getGuideDay = async ({ day = 0 } = {}) => {
  const guide = await getCachedGuide()
  const dayStart = guide.startMs + day * DAY_MS
  const dayEnd = dayStart + DAY_MS
  const programs = {}
  for (const channel of guide.channels) {
    const rows = guide.programsByChannel[String(channel.epgId)] || []
    programs[channel.id] = rows.filter((p) => p.start < dayEnd && p.end > dayStart)
  }
  const prefs = await getChannelPrefs()
  return {
    day,
    dayStart,
    dayEnd,
    fetchedAt: guide.fetchedAt,
    stale: Boolean(guide.stale),
    sort: prefs.sort,
    hideSdSimulcasts: prefs.hideSdSimulcasts,
    hiddenIds: prefs.hiddenIds,
    channels: orderChannels({ channels: guide.channels, ...prefs }),
    programs,
  }
}

// An SD channel is a simulcast sibling when another channel shares its base name
// (name minus a trailing "HD", with AU aliases like Nine↔9) and that sibling is
// the HD one. Anything unpaired stays visible.
const SIMULCAST_ALIASES = { nine: '9', seven: '7', ten: '10' }

const simulcastBaseKey = (name) => {
  const base = (name || '').toLowerCase().replace(/\s*hd$/, '').trim()
  return SIMULCAST_ALIASES[base] || base
}

const isHdChannel = (c) => c.hd === true || /hd$/i.test((c.name || '').trim())

export const sdSimulcastIds = (channels) => {
  const groups = new Map()
  for (const c of channels) {
    const key = simulcastBaseKey(c.name)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(c)
  }
  const ids = new Set()
  for (const group of groups.values()) {
    if (group.length < 2 || !group.some(isHdChannel)) continue
    for (const c of group) {
      if (!isHdChannel(c)) ids.add(String(c.id))
    }
  }
  return ids
}

// Pinned channels float to the top in pin order; the rest follow in the chosen
// sort. Hidden and pinned are mutually exclusive (enforced on save).
export const orderChannels = ({ channels, pinnedIds = [], hiddenIds = [], sort = 'default', hideSdSimulcasts = false }) => {
  const hiddenSet = new Set(hiddenIds.map(String))
  const simulcastSet = hideSdSimulcasts ? sdSimulcastIds(channels) : new Set()
  const pinOrder = new Map(pinnedIds.map((id, i) => [String(id), i]))
  const annotated = channels.map((c) => {
    const pinned = pinOrder.has(String(c.id))
    const id = String(c.id)
    return { ...c, pinned, hidden: !pinned && (hiddenSet.has(id) || simulcastSet.has(id)) }
  })
  const pinned = annotated
    .filter((c) => c.pinned)
    .sort((a, b) => pinOrder.get(String(a.id)) - pinOrder.get(String(b.id)))
  const rest = annotated.filter((c) => !c.pinned)
  if (sort === 'name') {
    rest.sort((a, b) => a.name.localeCompare(b.name, 'en-AU', { numeric: true, sensitivity: 'base' }))
  } else if (sort === 'number') {
    rest.sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity))
  }
  return [...pinned, ...rest]
}

export const getChannelPrefs = async () => {
  const [pinnedRaw, hiddenRaw, sortRaw, hideSdRaw] = await Promise.all([
    getSetting('epg_pinned_channels'),
    getSetting('epg_hidden_channels'),
    getSetting('epg_channel_sort'),
    getSetting('epg_hide_sd_simulcasts'),
  ])
  return {
    pinnedIds: parseJsonArray(pinnedRaw),
    hiddenIds: parseJsonArray(hiddenRaw),
    sort: CHANNEL_SORTS.includes(sortRaw) ? sortRaw : 'default',
    hideSdSimulcasts: hideSdRaw === '1',
  }
}

// Partial update; pinning a channel unhides it, hiding one unpins it.
export const setChannelPrefs = async ({ pinnedIds, hiddenIds, sort, hideSdSimulcasts } = {}) => {
  const current = await getChannelPrefs()
  const next = {
    pinnedIds: pinnedIds ?? current.pinnedIds,
    hiddenIds: hiddenIds ?? current.hiddenIds,
    sort: sort ?? current.sort,
    hideSdSimulcasts: hideSdSimulcasts ?? current.hideSdSimulcasts,
  }
  if (!CHANNEL_SORTS.includes(next.sort)) next.sort = 'default'
  const pinnedSet = new Set(next.pinnedIds.map(String))
  next.hiddenIds = next.hiddenIds.map(String).filter((id) => !pinnedSet.has(id))
  next.pinnedIds = next.pinnedIds.map(String)
  next.hideSdSimulcasts = Boolean(next.hideSdSimulcasts)
  await Promise.all([
    setSetting('epg_pinned_channels', JSON.stringify(next.pinnedIds)),
    setSetting('epg_hidden_channels', JSON.stringify(next.hiddenIds)),
    setSetting('epg_channel_sort', next.sort),
    setSetting('epg_hide_sd_simulcasts', next.hideSdSimulcasts ? '1' : '0'),
  ])
  return next
}

// On-now / up-next for the pinned channels, served from the guide cache — the
// dashboard's TV Guide panel.
export const getOnNowForPinned = async ({ nowMs = Date.now() } = {}) => {
  const guide = await getCachedGuide()
  const { pinnedIds } = await getChannelPrefs()
  const byId = new Map(guide.channels.map((c) => [String(c.id), c]))
  const entries = []
  for (const id of pinnedIds) {
    const channel = byId.get(String(id))
    if (!channel) continue
    const rows = guide.programsByChannel[String(channel.epgId)] || []
    const { now, next } = nowAndNext(rows, nowMs)
    entries.push({
      channel: {
        id: channel.id,
        name: channel.name,
        number: channel.number ?? null,
        hasLogo: Boolean(channel.logo),
      },
      now,
      next,
    })
  }
  return { entries }
}

export const nowAndNext = (programs, nowMs) => {
  let now = null
  let next = null
  for (const p of programs) {
    if (p.start <= nowMs && p.end > nowMs) now = p
    else if (p.start > nowMs && (!next || p.start < next.start)) next = p
  }
  return { now: trimProgram(now), next: trimProgram(next) }
}

// TVHeadend materialises autorec timers only within its EPG update window, so a
// series set for later in the week may have no timer yet. Project the next
// episodes from each series rule against the loaded guide and merge them with
// the real timers, so the Upcoming view reflects what will actually record.
// A projected entry is source:'series' (expected); a real timer is source:'timer'.
export const projectUpcomingRecordings = ({ seriesTags = [], futureRecordings = [], guide, nowMs = Date.now() } = {}) => {
  const timers = futureRecordings
    .filter((r) => !r.pendingDelete)
    .map((r) => ({
      programId: r.programId,
      name: r.name,
      channelId: r.channelId,
      channelName: r.channelName || null,
      startDate: r.startDate,
      endDate: r.endDate,
      episodeTitle: r.episodeTitle || null,
      seriesLinkId: r.seriesLinkId || null,
      source: 'timer',
    }))
  const timerProgramIds = new Set(timers.map((t) => String(t.programId)))

  const projected = []
  if (guide?.channels?.length) {
    const tagByLink = new Map()
    for (const t of seriesTags) {
      const link = t?.seriesLinkId ?? t?.id
      if (link != null) tagByLink.set(String(link), t)
    }
    const seenEpisode = new Set()
    for (const channel of guide.channels) {
      const rows = [...(guide.programsByChannel?.[String(channel.epgId)] || [])]
        .sort((a, b) => a.start - b.start)
      for (const p of rows) {
        if (p.start <= nowMs || p.series_link == null) continue
        const tag = tagByLink.get(String(p.series_link))
        if (!tag || String(tag.channelId) !== String(channel.id)) continue
        if (timerProgramIds.has(String(p.program_id))) continue
        if (p.series_no != null && p.episode_no != null) {
          const key = `${p.series_link}|${p.series_no}x${p.episode_no}`
          if (seenEpisode.has(key)) continue
          seenEpisode.add(key)
        }
        projected.push({
          programId: p.program_id,
          name: p.title,
          channelId: channel.id,
          channelName: channel.name || null,
          startDate: p.start,
          endDate: p.end,
          episodeTitle: p.episode_title || null,
          seriesLinkId: p.series_link,
          seriesNo: p.series_no ?? null,
          episodeNo: p.episode_no ?? null,
          source: 'series',
        })
      }
    }
  }

  return [...timers, ...projected].sort((a, b) => a.startDate - b.startDate)
}

const trimProgram = (p) => p == null ? null : {
  program_id: p.program_id,
  epg_program_id: p.epg_program_id,
  title: p.title,
  episode_title: p.episode_title || null,
  start: p.start,
  end: p.end,
  series_link: p.series_link || null,
}

const parseJsonArray = (raw) => {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

export const searchGuide = async ({ q } = {}) => {
  const needle = (q || '').trim().toLowerCase()
  if (needle.length < 2) return { results: [] }
  const guide = await getCachedGuide()
  const prefs = await getChannelPrefs()
  const searchChannels = orderChannels({ channels: guide.channels, ...prefs })
    .filter((c) => !c.hidden)
  const nowMs = Date.now()
  const results = []
  for (const channel of searchChannels) {
    const rows = guide.programsByChannel[String(channel.epgId)] || []
    for (const p of rows) {
      if (p.end <= nowMs) continue
      const haystack = `${p.title || ''} ${p.episode_title || ''}`.toLowerCase()
      if (!haystack.includes(needle)) continue
      results.push({ ...p, channelId: channel.id, channelName: channel.name })
      if (results.length >= SEARCH_RESULT_CAP) break
    }
    if (results.length >= SEARCH_RESULT_CAP) break
  }
  results.sort((a, b) => a.start - b.start)
  return { results }
}

// Concurrent requests share one TVHeadend round-trip, a failure opens a
// cooldown during which no new attempt starts, and the last good state is
// served with stale:true instead of an error. Mutations clear the cooldown
// (via invalidateRecordingState) so a successful command retries immediately.
export const getRecordingState = async ({ fresh = false } = {}) => {
  const now = Date.now()
  if (!fresh && stateCache && stateCache.expiresAt > now) return stateCache.value
  if (!fresh && now < stateFailedUntil) {
    if (stateCache) return { ...stateCache.value, stale: true }
    throw stateLastError
  }
  if (stateInflight) return stateInflight
  stateInflight = loadRecordingState(now)
    .catch((err) => {
      stateFailedUntil = Date.now() + STATE_RETRY_MS
      stateLastError = err
      if (stateCache) return { ...stateCache.value, stale: true }
      throw err
    })
    .finally(() => { stateInflight = null })
  return stateInflight
}

const loadRecordingState = async (now) => {
  const state = await getState()
  const guide = await getCachedGuide().catch(() => null)
  const upcomingRecordings = projectUpcomingRecordings({
    seriesTags: state.seriesTags,
    futureRecordings: state.futureRecordings,
    guide,
    nowMs: now,
  })
  const value = {
    standby: false,
    storageInfo: await recordingsStorageInfo(),
    tunerCount: state.tunerCount,
    maxConcurrentRecordings: state.tunerCount,
    activeInputs: state.activeInputs,
    futureRecordings: state.futureRecordings,
    upcomingRecordings,
    seriesTags: state.seriesTags,
    activeRecordingIds: state.activeRecordingIds,
    fetchedAt: now,
  }
  stateCache = { value, expiresAt: now + STATE_TTL_MS }
  stateFailedUntil = 0
  return value
}

export const invalidateRecordingState = () => {
  stateCache = null
  stateFailedUntil = 0
}

export const recordProgram = async (args) => {
  const result = await scheduleRecording(args)
  invalidateRecordingState()
  return result
}

export const cancelProgram = async (args) => {
  const result = await cancelRecording(args)
  invalidateRecordingState()
  return result
}

export const recordSeries = async ({ programId, channelId, ...args }) => {
  const guide = await getCachedGuide()
  const rows = guide.programsByChannel[String(channelId)] || []
  const program = rows.find((p) => String(p.program_id) === String(programId))
  if (!program) {
    throw new TvheadendError('Programme not found in the guide.', { stage: 'series', code: 'not-found' })
  }
  const result = await enableSeriesTag({ ...args, channelId, title: program.title })
  invalidateRecordingState()
  return result
}

export const cancelSeries = async (args) => {
  const result = await disableSeriesTag(args)
  invalidateRecordingState()
  return result
}

export const getChannelImage = async ({ channelId, kind = 'logo' } = {}) => {
  if (kind !== 'logo') return null
  const cacheKey = `${kind}:${channelId}`
  const cached = imageCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  const guide = await getCachedGuide()
  const channel = guide.channels.find((c) => String(c.id) === String(channelId))
  const value = await getChannelIcon({ iconPath: channel?.logo })
  if (!value) return null
  imageCache.set(cacheKey, { value, expiresAt: Date.now() + IMAGE_TTL_MS })
  return value
}

export const localMidnightMs = (now = new Date()) => {
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  return midnight.getTime()
}

const getCachedGuide = async () => {
  const now = Date.now()
  const startMs = localMidnightMs()
  if (guideCache && guideCache.startMs === startMs && guideCache.expiresAt > now) {
    return guideCache
  }
  if (guideInflight) return guideInflight
  guideInflight = loadGuide(startMs)
    .then((guide) => {
      guideCache = guide
      return guide
    })
    .catch((err) => {
      if (guideCache && guideCache.startMs === startMs) {
        guideCache = { ...guideCache, stale: true, expiresAt: Date.now() + GUIDE_STALE_RETRY_MS }
        return guideCache
      }
      throw err
    })
    .finally(() => { guideInflight = null })
  return guideInflight
}

const loadGuide = async (startMs) => {
  const conn = await resolveConnection()
  const endMs = startMs + GUIDE_DAYS * DAY_MS
  const [channels, events] = await Promise.all([
    listChannels(conn),
    listEvents({ startMs, endMs, conn }),
  ])
  if (channels.length === 0) {
    throw new TvheadendError(
      'TVHeadend has no channels yet. Scan the mux and map services to channels in TVHeadend first.',
      { stage: 'epg', code: 'no-channels' },
    )
  }
  const programsByChannel = {}
  for (const c of channels) programsByChannel[String(c.epgId)] = []
  for (const e of events) {
    const rows = programsByChannel[String(e.channel_id)]
    if (rows) rows.push(e)
  }
  return {
    startMs,
    channels,
    programsByChannel,
    fetchedAt: Date.now(),
    expiresAt: Date.now() + GUIDE_TTL_MS,
  }
}

const recordingsStorageInfo = async () => {
  const root = (await getSetting('recordings_root')) || process.env.RECORDINGS_ROOT || DEFAULT_RECORDINGS_ROOT
  try {
    const st = await fs.statfs(root)
    const total = st.blocks * st.bsize
    const free = st.bavail * st.bsize
    return { path: root, total, free, used: total - free }
  } catch {
    return { path: root, total: null, free: null, used: null }
  }
}

let guideCache = null
let guideInflight = null
let stateCache = null
let stateInflight = null
let stateFailedUntil = 0
let stateLastError = null
const imageCache = new Map()

const CHANNEL_SORTS = ['default', 'number', 'name']
const DAY_MS = 24 * 60 * 60 * 1000
const GUIDE_DAYS = 7
const DEFAULT_RECORDINGS_ROOT = '/recordings'
const GUIDE_TTL_MS = 60 * 60 * 1000
const GUIDE_STALE_RETRY_MS = 60 * 1000
const STATE_TTL_MS = 45 * 1000
const STATE_RETRY_MS = 60 * 1000
const IMAGE_TTL_MS = 24 * 60 * 60 * 1000
const SEARCH_RESULT_CAP = 100
