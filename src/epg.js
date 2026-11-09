import fs from 'fs/promises'

import { db, getSetting, setSetting } from './db.js'
import { anyChannelLinkFor } from './web/series-link.js'
import { scheduledByProgramIdOf, seriesLinkSetOf } from './web/programme-state.js'
import { SIMULCAST_START_TOLERANCE_MS, findHdSimulcast, isHdChannel, sdSimulcastIds } from './web/simulcast.js'
import {
  listChannels,
  listEvents,
  getState,
  scheduleRecording,
  cancelRecording,
  skipScheduledEntry,
  isRepeatAwaitingOriginal,
  isRepeatToSkip,
  enableSeriesTag,
  disableSeriesTag,
  setSeriesTagsEnabled,
  updateSeriesTags,
  setSeriesTitleVariants,
  listSeriesRules,
  seriesKey,
  resolveConnection,
  getChannelIcon,
  fetchProgrammeImageOrThrow,
  listChannelTriplets,
  TvheadendError,
} from './tvheadend.js'
import { createProgrammeImages, guideImageHosts } from './programme-images.js'
import { createGuidePictures, guidePictureCandidatesOf, isGuidePictureOrigin } from './guide-pictures.js'
import { createFreeviewAu, freeviewAiringsOf, freeviewCandidatesOf, freeviewClient, isFreeviewImageSource } from './freeview-au.js'
import { channelShiftHours, createClassificationLookup, createClassificationStore, isRatingsLikely, programmeClassification } from './classification-labels.js'
import { POSTER_SHAPE, portraitPadOf } from './show-poster.js'
import { createThumbnailStore, getThumbnailRoot, imageCacheBytesFrom, landscapeOf } from './image-thumbnails.js'
import { createShowArtwork, showTitleKey, tvmazeLookupEnabled } from './show-artwork.js'
import { artworkClient, createFallbackArtwork, fetchFallbackImage, isFallbackImageSource, storedTmdbKey } from './fallback-artwork.js'
import {
  FINAL_STAGE,
  LANDSCAPE_SHAPE,
  canonicalKindOf,
  createArtResolver,
  episodePictureOrderFrom,
  guideKindsOf,
  guideSourcesOf,
  stillsAllowed,
  isGuessedFilmKind,
  onlineArtworkOf,
  stampKindOf,
} from './art-resolver.js'
import { UNKNOWN_AD_PLAN, adPlanOf, createFrameGrabs, downloadAdPlanOf, frameOriginOf, framePreferenceOrderOf, isFrameOrigin } from './frame-grabs.js'
import { isAdJobRunning, onAdScanResult } from './commercials.js'
import { artFeed } from './art-feed.js'
import { loadKindOverrides } from './programme-kind.js'
import { createLibraryTitles, isCompleteRow } from './library-titles.js'
import { isPersonImageSource } from './programme-credits.js'
import { artworkKindOf, guideKindsByTitle, programmeHintsByTitle } from './artwork-match.js'
import { loadTitleGenres, rememberTvmazeShow } from './genre-enrichment.js'
import { createGuideSearchCache, searchGuideListings } from './guide-search.js'
import { loadSearchAliases, rememberKnownAsFromTvmaze } from './search-aliases.js'
import {
  saveGuidePrograms,
  loadEndedProgramsByChannel,
  mergeGuidePrograms,
  syncSavedDvrState,
  savedProgramFor,
} from './guide-history.js'
import { findArtwork, saveArtwork } from './artwork.js'
import { PLEX_ORIGIN_PREFIX, RECORDING_ORIGIN_PREFIX, UPLOAD_ORIGIN_PREFIX, artworkChoices, plexSourceOf } from './artwork-choices.js'
import { artworkUploads } from './artwork-uploads.js'
import { getPlexConnection } from './plex.js'
import { showKeyOf } from './web/show-key.js'
import { createGuideCache } from './guide-cache.js'
import { createRecordingStateCache } from './recording-state-cache.js'
import { orderChannels } from './channel-order.js'
import { airingIdentityOf, isPreferredAiring, twinAnnotationOf } from './airing-identity.js'
import { invalidateRecordingNow } from './recording-now.js'
import { createDisplayKinds, withDisplayKinds } from './display-kind.js'
import { loadSeriesEvidence, saveGuideEvidence } from './series-evidence.js'
import {
  addPendingSkip,
  entriesToSkip,
  hasPendingSkips,
  listPendingSkips,
  removePendingSkip,
  splitPendingSkips,
} from './pending-skips.js'
import { dvrAiringMatchOf, dvrAiringsOf } from './repeat-match.js'
import { measureJob } from './event-loop-lag.js'
import { loadExternalIds } from './external-ids-store.js'
import { isVariantTitle, nextVariantsOf, saveTitleVariants, variantsForTitle } from './title-variants.js'

export const getGuideDay = async ({ day = 0, nowMs = Date.now() } = {}) => {
  const guide = await getCachedGuide()
  const { dayStart, dayEnd, spillEnd } = guideDayWindow({ startMs: localMidnightMs(nowMs), day })
  const endedByChannel = await loadEndedProgramsByChannel({ fromMs: dayStart, toMs: spillEnd, nowMs })
    .catch(logHistoryError('load'))
  const merged = guide.channels.map((channel) => {
    const rows = guide.programsByChannel[String(channel.epgId)] || []
    const live = programsInWindow({ rows, fromMs: dayStart, toMs: spillEnd })
    const saved = savedWithKinds({ guide, saved: endedByChannel?.get(String(channel.epgId)) })
    return [channel.id, mergeGuidePrograms({ live, saved })]
  })
  const [classificationOf, prefs] = await Promise.all([
    classificationLookupFor(merged.flatMap(([, rows]) => rows)),
    getChannelPrefs(),
  ])
  const twinContext = await twinContextFor({ guide, prefs })
  const programs = Object.fromEntries(merged.map(([channelId, rows]) => [
    channelId,
    rows.map((program) => ({
      ...toGuideCell({ program, nowMs }),
      classification: classificationOf(program),
      ...twinFieldsOf({ programme: program, twinContext }),
    })),
  ]))
  return {
    day,
    dayStart,
    dayEnd,
    spillEnd,
    fetchedAt: guide.fetchedAt,
    stale: Boolean(guide.stale),
    sort: prefs.sort,
    hideSdSimulcasts: prefs.hideSdSimulcasts,
    hideSdChannels: prefs.hideSdChannels,
    hiddenIds: prefs.hiddenIds,
    channels: orderChannels({ channels: guide.channels, ...prefs }),
    programs,
  }
}

export { sdSimulcastIds }

export { orderChannels }

export const getChannelPrefs = async () => {
  const [pinnedRaw, hiddenRaw, sortRaw, hideSdRaw, hideSdChannelsRaw] = await Promise.all([
    getSetting('epg_pinned_channels'),
    getSetting('epg_hidden_channels'),
    getSetting('epg_channel_sort'),
    getSetting('epg_hide_sd_simulcasts'),
    getSetting('epg_hide_sd_channels'),
  ])
  return {
    pinnedIds: parseJsonArray(pinnedRaw),
    hiddenIds: parseJsonArray(hiddenRaw),
    sort: CHANNEL_SORTS.includes(sortRaw) ? sortRaw : 'default',
    hideSdSimulcasts: hideSdRaw === '1',
    hideSdChannels: hideSdChannelsRaw === '1',
  }
}

// Partial update; pinning a channel unhides it, hiding one unpins it.
export const setChannelPrefs = async ({ pinnedIds, hiddenIds, sort, hideSdSimulcasts, hideSdChannels } = {}) => {
  const current = await getChannelPrefs()
  const next = {
    pinnedIds: pinnedIds ?? current.pinnedIds,
    hiddenIds: hiddenIds ?? current.hiddenIds,
    sort: sort ?? current.sort,
    hideSdSimulcasts: hideSdSimulcasts ?? current.hideSdSimulcasts,
    hideSdChannels: hideSdChannels ?? current.hideSdChannels,
  }
  if (!CHANNEL_SORTS.includes(next.sort)) next.sort = 'default'
  const pinnedSet = new Set(next.pinnedIds.map(String))
  next.hiddenIds = next.hiddenIds.map(String).filter((id) => !pinnedSet.has(id))
  next.pinnedIds = next.pinnedIds.map(String)
  next.hideSdSimulcasts = Boolean(next.hideSdSimulcasts)
  next.hideSdChannels = Boolean(next.hideSdChannels)
  await Promise.all([
    setSetting('epg_pinned_channels', JSON.stringify(next.pinnedIds)),
    setSetting('epg_hidden_channels', JSON.stringify(next.hiddenIds)),
    setSetting('epg_channel_sort', next.sort),
    setSetting('epg_hide_sd_simulcasts', next.hideSdSimulcasts ? '1' : '0'),
    setSetting('epg_hide_sd_channels', next.hideSdChannels ? '1' : '0'),
  ])
  return next
}

// On-now / up-next for the pinned channels, served from the guide cache — the
// dashboard's TV Guide panel.
export const getOnNowForPinned = async ({ nowMs = Date.now() } = {}) => {
  const guide = await getCachedGuide()
  const { pinnedIds } = await getChannelPrefs()
  const byId = new Map(guide.channels.map((c) => [String(c.id), c]))
  const airings = pinnedIds
    .map((id) => byId.get(String(id)))
    .filter(Boolean)
    .map((channel) => ({ channel, ...airingPair(guide.programsByChannel[String(channel.epgId)] || [], nowMs) }))
  const classificationOf = await classificationLookupFor(airings.flatMap(({ now, next }) => [now, next]))
  const classified = (program) => program && { ...trimProgram(program), classification: classificationOf(program) }
  const entries = airings.map(({ channel, now, next }) => ({
    channel: {
      id: channel.id,
      name: channel.name,
      number: channel.number ?? null,
      hasLogo: channel.logos.length > 0,
      offAir: Boolean(channel.offAir),
    },
    now: classified(now),
    next: classified(next),
  }))
  return { entries }
}

export const nowAndNext = (programs, nowMs) => {
  const { now, next } = airingPair(programs, nowMs)
  return { now: trimProgram(now), next: trimProgram(next) }
}

const airingPair = (programs, nowMs) => {
  let now = null
  let next = null
  for (const p of programs) {
    if (p.start <= nowMs && p.end > nowMs) now = p
    else if (p.start > nowMs && (!next || p.start < next.start)) next = p
  }
  return { now, next }
}

// On-now / up-next for every channel in channel-prefs order: the Live TV view.
export const getOnNowAll = async ({ nowMs = Date.now() } = {}) => {
  const [guide, prefs] = await Promise.all([getCachedGuide(), getChannelPrefs()])
  const channels = orderChannels({ channels: guide.channels, ...prefs })
  const airings = channels.filter((c) => !c.hidden).map((channel) => ({
    channel,
    ...airingPair(guide.programsByChannel[String(channel.epgId)] || [], nowMs),
  }))
  const classificationOf = await classificationLookupFor(airings.flatMap(({ now, next }) => [now, next]))
  const classified = (program) => program && { ...toBrowserProgram(program), classification: classificationOf(program) }
  const entries = airings.map(({ channel, now, next }) => ({
    channel: {
      id: channel.id,
      name: channel.name,
      number: channel.number ?? null,
      hasLogo: channel.logos.length > 0,
      offAir: Boolean(channel.offAir),
      pinned: channel.pinned,
      hd: channel.hd === true,
    },
    now: classified(now),
    next: classified(next),
  }))
  return {
    fetchedAt: guide.fetchedAt,
    stale: Boolean(guide.stale),
    sort: prefs.sort,
    hideSdSimulcasts: prefs.hideSdSimulcasts,
    hideSdChannels: prefs.hideSdChannels,
    hiddenIds: prefs.hiddenIds,
    channels,
    entries,
  }
}

// TVHeadend holds back autorec timers for episodes it already scheduled, recorded,
// or skipped, and creates them only after an EPG update. Project the next
// episodes from each series rule against the loaded guide and merge them with
// the real timers, so the Upcoming view reflects what will actually record.
// A projected entry is source:'series' (expected); a real timer is source:'timer'.
export const projectUpcomingRecordings = (args) => planUpcomingRecordings(args).upcoming

export const planUpcomingRecordings = ({
  seriesTags = [],
  futureRecordings = [],
  skippedProgramIds = [],
  repeatProgramIds = [],
  dvrAirings = [],
  guide,
  nowMs = Date.now(),
} = {}) => {
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
      season: r.season ?? null,
      hasImage: Boolean(guide?.programByEventId?.get(String(r.programId))?.image),
      kind: guide?.programByEventId?.get(String(r.programId))?.kind ?? null,
      synopsis: guide?.programByEventId?.get(String(r.programId))?.synopsis || null,
      source: 'timer',
    }))
  const timerProgramIds = new Set([
    ...timers.map((t) => String(t.programId)),
    ...skippedProgramIds.map(String),
    ...repeatProgramIds.map(String),
  ])

  const projected = []
  const repeats = []
  if (guide?.channels?.length) {
    const tagByLink = new Map()
    for (const t of seriesTags) {
      const link = t?.seriesLinkId ?? t?.id
      if (link == null || t.enabled === false) continue
      tagByLink.set(String(link), t)
      for (const variant of t.titleVariants || []) tagByLink.set(seriesKey({ channelId: t.channelId || '', title: variant }), t)
    }
    const firstAiringByEpisode = timerEpisodeAirings({ guide, timers })
    const candidates = []
    for (const channel of guide.channels) {
      for (const p of guide.programsByChannel?.[String(channel.epgId)] || []) {
        if (p.start <= nowMs || p.series_link == null) continue
        const tag = tagByLink.get(String(p.series_link)) || tagByLink.get(anyChannelLinkFor(p.series_link))
        if (!tag) continue
        if (tag.channelId && String(tag.channelId) !== String(channel.id)) continue
        if (timerProgramIds.has(String(p.program_id))) continue
        candidates.push({ channel, p, tag })
      }
    }
    for (const { channel, p, tag } of candidates.sort((a, b) => a.p.start - b.p.start)) {
      const firstAiring = earlierAiringOf({ firstAiringByEpisode, programme: p })
      const dvrAiring = firstAiring ? null : dvrAiringMatchOf({ programme: p, tag, airings: dvrAirings })
      if (hasEpisodeNumber(p) && !firstAiring && !dvrAiring) {
        firstAiringByEpisode.set(episodeKey(p), { startDate: p.start, channelName: channel.name || null })
      }
      const entry = {
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
        season: p.series_no ?? null,
        hasImage: Boolean(p.image),
        kind: p.kind ?? null,
        synopsis: p.synopsis || null,
        source: 'series',
      }
      if (firstAiring) repeats.push({ ...entry, repeatOf: { status: 'scheduled', ...firstAiring } })
      else if (dvrAiring) repeats.push({ ...entry, repeatOf: dvrAiring })
      else projected.push(entry)
    }
  }

  return {
    upcoming: [...timers, ...projected].sort((a, b) => a.startDate - b.startDate),
    repeats,
  }
}

export const channelAiringAt = ({ guide, channelId, atMs, endedByChannel = null }) => {
  const channel = guide.channels.find((c) => String(c.id) === String(channelId))
  if (!channel) return { now: null, next: null }
  const live = guide.programsByChannel[String(channel.epgId)] || []
  const saved = savedWithKinds({ guide, saved: endedByChannel?.get(String(channel.epgId)) })
  const rows = mergeGuidePrograms({ live, saved })
  const now = rows.find((p) => p.start <= atMs && p.end > atMs) || null
  const next = earliestStartingFrom({ rows, fromMs: now ? now.end : atMs })
  return { now: now && toBrowserProgram(now), next: next && toBrowserProgram(next) }
}

export const getChannelAiring = async ({ channelId, atMs = Date.now(), nowMs = Date.now() }) => {
  const guide = await getCachedGuide()
  const endedByChannel = await loadEndedProgramsByChannel({ fromMs: atMs, toMs: nowMs, nowMs })
    .catch(logHistoryError('load'))
  const { now, next } = channelAiringAt({ guide, channelId, atMs, endedByChannel })
  const classificationOf = await classificationLookupFor([now, next])
  return {
    now: now && { ...now, classification: classificationOf(now) },
    next: next && { ...next, classification: classificationOf(next) },
  }
}

export const programmeSheetAt = ({ guide, channelId, startMs, nowMs = Date.now(), endedByChannel = null, twinContext = null }) => {
  const channel = guide.channels.find((c) => String(c.id) === String(channelId)) || null
  if (!channel) return { channel: null, programme: null, hdEpisode: null, hdSeries: null }
  const rowsOf = (c) => mergeGuidePrograms({
    live: guide.programsByChannel[String(c.epgId)] || [],
    saved: savedWithKinds({ guide, saved: endedByChannel?.get(String(c.epgId)) }),
  })
  const rows = rowsOf(channel)
  const listed = rows.find((p) => p.start === startMs) || rows.find((p) => p.start <= startMs && p.end > startMs) || null
  const programme = listed && { ...toGuideCell({ program: listed, nowMs }), ...twinFieldsOf({ programme: listed, twinContext }) }
  const programsByChannel = Object.fromEntries(guide.channels
    .filter((c) => c !== channel && isHdChannel(c))
    .map((c) => [c.id, rowsOf(c)
      .filter((p) => Math.abs(p.start - (programme?.start ?? startMs)) <= SIMULCAST_START_TOLERANCE_MS)
      .map((program) => toGuideCell({ program, nowMs }))]))
  const hdTwinFor = (needsSeriesLink) => (programme
    ? findHdSimulcast({ program: programme, channelId: channel.id, channels: guide.channels, programsByChannel, needsSeriesLink })
    : null)
  return { channel, programme, hdEpisode: hdTwinFor(false), hdSeries: hdTwinFor(true) }
}

export const getProgrammeSheet = async ({ channelId, startMs, nowMs = Date.now() }) => {
  const guide = await getCachedGuide()
  const endedByChannel = startMs < nowMs
    ? await loadEndedProgramsByChannel({ fromMs: startMs, toMs: nowMs, nowMs }).catch(logHistoryError('load'))
    : null
  const twinContext = await twinContextFor({ guide, prefs: await getChannelPrefs() })
  const sheet = programmeSheetAt({ guide, channelId, startMs, nowMs, endedByChannel, twinContext })
  return withClassification({ sheet, store: classificationStore })
}

export const withClassification = async ({ sheet, store }) => {
  if (!sheet.programme) return sheet
  const channelName = sheet.channel?.name ?? null
  const shiftHours = channelShiftHours(channelName)
  const [classification, category] = await Promise.all([
    programmeClassification({ programme: { ...sheet.programme, channelName }, store }),
    store.categoryAt?.({ title: sheet.programme.title, startMs: sheet.programme.start, shiftHours }).catch(() => null) ?? null,
  ])
  const ratingsLikely = isRatingsLikely({ kind: sheet.programme.kind, category })
  return { ...sheet, programme: { ...sheet.programme, classification, ratingsLikely } }
}

const classificationStore = createClassificationStore()

const classificationLookupFor = async (programmes) => createClassificationLookup({
  programmes: programmes.filter(Boolean),
  store: classificationStore,
  channels: (await Promise.resolve().then(getCachedGuide).catch(() => null))?.channels || [],
})

export const savedWithKinds = ({ guide, saved = [] }) => (guide?.kindOf
  ? withDisplayKinds({ programmes: saved, kindOf: guide.kindOf })
  : saved)

const earliestStartingFrom = ({ rows, fromMs }) => rows
  .filter((p) => p.start >= fromMs)
  .reduce((earliest, p) => (!earliest || p.start < earliest.start ? p : earliest), null)

export const toBrowserProgram = ({ image, ...program }) => ({ ...program, has_image: Boolean(image) })

export const toGuideCell = ({ program, nowMs }) => {
  const past = program.end <= nowMs
  return { ...toBrowserProgram(program), past, recorded: past && Boolean(program.dvr_uuid) }
}

const logHistoryError = (action) => (err) => {
  console.error(`[epg] guide history ${action} failed: ${err.message}`)
  return null
}

const trimProgram = (p) => p == null ? null : {
  program_id: p.program_id,
  epg_program_id: p.epg_program_id,
  title: p.title,
  episode_title: p.episode_title || null,
  start: p.start,
  end: p.end,
  series_link: p.series_link || null,
  kind: p.kind ?? null,
}

const parseJsonArray = (raw) => {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

export const searchGuide = async ({ q, forYouIds = () => new Set() } = {}) => {
  if ((q || '').trim().length < 2) return { results: [] }
  const [guide, prefs, aliases] = await Promise.all([getCachedGuide(), getChannelPrefs(), loadSearchAliases()])
  const channels = orderChannels({ channels: guide.channels, ...prefs }).filter((c) => !c.hidden)
  const built = guideSearchFor({ guide, aliases })
  const nowMs = Date.now()
  const twinContext = await twinContextFor({ guide, prefs })
  const seriesLinks = seriesLinkSetOf(twinContext.autorecs)
  const results = searchGuideListings({ built, channels, query: q, nowMs, toProgramme: toBrowserProgram, scheduledIds: twinContext.scheduledIds, seriesLinks, forYouIds: forYouIds() })
    .filter((programme) => isPreferredAiring({ identity: twinContext.identity, programme, nowMs }))
    .map((programme) => ({ ...programme, ...twinFieldsOf({ programme, twinContext }) }))
  return { results }
}

export const guideIdentityFor = ({ guide, prefs }) => {
  const key = JSON.stringify(prefs)
  const cached = guideIdentities.get(guide)
  if (cached?.key === key) return cached.identity
  const channels = guide.channels || []
  const channelIdByProgramme = new Map(channels.flatMap((channel) =>
    (guide.programsByChannel?.[String(channel.epgId)] || []).map((programme) => [programme, channel.id])))
  const identity = airingIdentityOf({
    programmes: [...channelIdByProgramme.keys()],
    channels: orderChannels({ channels, ...prefs }),
    channelIdOf: (programme) => channelIdByProgramme.get(programme) ?? programme.channel_id,
  })
  guideIdentities.set(guide, { key, identity })
  return identity
}

const twinContextFor = async ({ guide, prefs }) => {
  const state = await getRecordingState().catch(() => null)
  return { identity: guideIdentityFor({ guide, prefs }), autorecs: state?.seriesTags || [], scheduledIds: scheduledIdsOf(state) }
}

export const scheduledIdsOf = (state) => new Set([
  ...scheduledByProgramIdOf(state?.futureRecordings || []).keys(),
  ...(state?.activeRecordingIds || []).map(String),
])

const twinFieldsOf = ({ programme, twinContext }) => (twinContext
  ? twinAnnotationOf({ identity: twinContext.identity, programme, autorecs: twinContext.autorecs })
  : {})

const guideIdentities = new WeakMap()

// Concurrent requests share one TVHeadend round-trip, a failure opens a
// cooldown during which no new attempt starts, and the last good state is
// served with stale:true instead of an error. Mutations clear the cooldown
// (via invalidateRecordingState) so a successful command retries immediately.
export const getRecordingState = (options) => recordingStateCache.get(options)

const loadRecordingState = async (now) => {
  const [loadedState, guide, storageInfo, loadedSkips] = await Promise.all([
    getState(),
    getCachedGuide().catch(() => null),
    recordingsStorageInfo(),
    listPendingSkips({ nowMs: now }).catch(() => []),
  ])
  const skipsApplied = await withPendingSkipsApplied({ state: loadedState, pendingSkips: loadedSkips })
  const { pendingSkips } = skipsApplied
  const state = await withRecordedRepeatsSkipped({ state: skipsApplied.state })
  const plan = planUpcomingRecordings({
    seriesTags: state.seriesTags,
    futureRecordings: state.futureRecordings,
    skippedProgramIds: state.skippedProgramIds,
    repeatProgramIds: state.repeatProgramIds,
    dvrAirings: dvrAiringsOf({ upcoming: state.upcomingEntries, pastAirings: state.pastAirings }),
    guide,
    nowMs: now,
  })
  const held = splitPendingSkips({ upcoming: plan.upcoming, pendingSkips })
  const upcomingRecordings = await withUpcomingClassifications({
    upcoming: held.upcoming,
    futureRecordings: state.futureRecordings,
    guide,
  })
  const repeatRecordings = [...state.repeatRecordings, ...plan.repeats].sort((a, b) => a.startDate - b.startDate)
  await syncSavedDvrState({ futureRecordings: state.futureRecordings, nowMs: now })
    .catch(logHistoryError('dvr sync'))
  const value = {
    standby: false,
    storageInfo,
    tunerCount: state.tunerCount,
    maxConcurrentRecordings: state.tunerCount,
    activeInputs: state.activeInputs,
    futureRecordings: state.futureRecordings,
    skippedRecordings: [...state.skippedRecordings, ...held.skipped],
    repeatRecordings,
    upcomingRecordings,
    seriesTags: withSeriesImages({ seriesTags: state.seriesTags, guide, nowMs: now }),
    activeRecordingIds: state.activeRecordingIds,
    fetchedAt: now,
  }
  return value
}

export const withUpcomingClassifications = async ({ upcoming, futureRecordings = [], guide }) => {
  const timerById = new Map(futureRecordings.map((recording) => [String(recording.programId), recording]))
  const sources = upcoming.map((recording) => {
    const timer = timerById.get(String(recording.programId))
    const listed = guide?.programByEventId?.get(String(recording.programId))
    return {
      title: recording.name,
      start: recording.startDate,
      channelName: recording.channelName ?? null,
      rating: timer?.rating ?? listed?.rating ?? null,
      ratingLabel: timer?.ratingLabel ?? null,
    }
  })
  const classificationOf = await classificationLookupFor(sources)
  return upcoming.map((recording, i) => ({ ...recording, classification: classificationOf(sources[i]) }))
}

export const withSeriesImages = ({ seriesTags = [], guide, nowMs = Date.now() }) => {
  const imageProgramByLink = new Map()
  for (const rows of Object.values(guide?.programsByChannel || {})) {
    for (const p of rows) {
      if (!p.image || p.series_link == null || p.end <= nowMs) continue
      const known = imageProgramByLink.get(p.series_link)
      if (!known || p.start < known.start) imageProgramByLink.set(p.series_link, p)
    }
  }
  return seriesTags.map((t) => ({
    ...t,
    imageProgramId: imageProgramByLink.get(t.seriesLinkId)?.program_id ?? null,
  }))
}

export const invalidateRecordingState = () => {
  recordingStateCache.invalidate()
  invalidateRecordingNow()
}

export const recordProgram = async (args) => {
  try {
    return (await removePendingSkip(args.programId))
      ? { ok: true, programId: args.programId, pendingSkipRemoved: true }
      : await scheduleRecording(args)
  } finally {
    invalidateRecordingState()
  }
}

export const cancelProgram = async (args) => {
  try {
    return await cancelRecording(args).catch((err) => skipExpectedEpisode({ err, programId: args.programId }))
  } finally {
    invalidateRecordingState()
  }
}

export const enforcePendingSkips = async () => {
  if (await hasPendingSkips() || hasRepeatsAwaitingOriginal()) await getRecordingState({ fresh: true })
}

const hasRepeatsAwaitingOriginal = () => (recordingStateCache.peek()?.repeatRecordings || []).some(isRepeatAwaitingOriginal)

export const watchPendingSkips = () => {
  const enforce = () => enforcePendingSkips().catch((err) => console.warn(`[epg] saved skips: ${err.message}`))
  onGuideLoaded(enforce)
  setInterval(enforce, PENDING_SKIP_CHECK_MS).unref()
}

const skipExpectedEpisode = async ({ err, programId }) => {
  if (!(err instanceof TvheadendError) || err.code !== 'not-found') throw err
  const { upcomingRecordings = [] } = await getRecordingState()
  const expected = upcomingRecordings.find((e) => e.source === 'series' && String(e.programId) === String(programId))
  if (!expected) throw err
  await addPendingSkip(expected)
  return { ok: true, programId, pendingSkip: true }
}

export const withPendingSkipsApplied = async ({
  state,
  pendingSkips,
  skipEntry = skipScheduledEntry,
  forgetSkip = removePendingSkip,
  reloadState = getState,
}) => {
  const due = entriesToSkip({ entries: [...state.futureRecordings, ...state.repeatRecordings], pendingSkips })
  if (due.length === 0) return { state, pendingSkips }
  const appliedIds = new Set()
  for (const { entry, skip } of due) {
    if (await appliedSkip({ entry, skip, skipEntry, forgetSkip })) appliedIds.add(String(skip.programId))
  }
  if (appliedIds.size === 0) return { state, pendingSkips }
  return {
    state: await reloadState(),
    pendingSkips: pendingSkips.filter((skip) => !appliedIds.has(String(skip.programId))),
  }
}

export const withRecordedRepeatsSkipped = async ({ state, skipEntry = skipScheduledEntry, reloadState = getState }) => {
  const due = state.repeatRecordings.filter(isRepeatToSkip)
  if (due.length === 0) return state
  const skipped = []
  for (const entry of due) skipped.push(await skippedRepeat({ entry, skipEntry }))
  return skipped.some(Boolean) ? reloadState() : state
}

const skippedRepeat = async ({ entry, skipEntry }) => {
  try {
    await skipEntry({ uuid: entry.uuid })
  } catch (err) {
    console.warn(`[epg] repeat of "${entry.name}" not skipped yet: ${err.message}`)
    return false
  }
  console.log(`[epg] skipped a repeat of "${entry.name}" at ${new Date(entry.startDate).toISOString()}`)
  return true
}

const appliedSkip = async ({ entry, skip, skipEntry, forgetSkip }) => {
  try {
    await skipEntry({ uuid: entry.uuid })
  } catch (err) {
    console.warn(`[epg] saved skip for "${entry.name}" not applied yet: ${err.message}`)
    return false
  }
  await forgetSkip(skip.programId).catch((err) => console.warn(`[epg] saved skip not cleared: ${err.message}`))
  console.log(`[epg] applied a saved skip to "${entry.name}" at ${new Date(entry.startDate).toISOString()}`)
  return true
}

export const recordSeries = async ({ programId, channelId, ...args }) => {
  const guide = await getCachedGuide()
  const rows = guide.programsByChannel[String(channelId)] || []
  const program = rows.find((p) => String(p.program_id) === String(programId))
  if (!program) {
    throw new TvheadendError('Programme not found in the guide.', { stage: 'series', code: 'not-found' })
  }
  const variants = await variantsForTitle(program.title).catch(() => [])
  const result = await enableSeriesTag({ ...args, channelId, title: program.title, variants })
  invalidateRecordingState()
  const channel = guide.channels.find((entry) => String(entry.id) === String(channelId))
  return { ...result, title: program.title, airing: seriesAiringOf({ program, channelName: channel?.name }) }
}

export const seriesAiringOf = ({ program, channelName = null }) => ({
  channelName: channelName || null,
  start: program.start,
  end: program.end,
  season: program.series_no ?? null,
  episode: program.episode_no ?? null,
})

export const cancelSeries = async (args) => {
  try {
    return await disableSeriesTag(args)
  } finally {
    invalidateRecordingState()
  }
}

export const cancelSeriesRules = async ({ seriesLinkIds, stopRecordingNow = false, cancel = cancelSeries }) => {
  const cancelled = []
  for (const seriesLinkId of seriesLinkIds) {
    cancelled.push(await cancel({ seriesLinkId, stopRecordingNow }).catch((err) => alreadyCancelled({ err, seriesLinkId })))
  }
  return {
    cancelled,
    stopped: cancelled.flatMap((c) => c.stopped),
    stopFailed: cancelled.flatMap((c) => c.stopFailed ?? []),
  }
}

const alreadyCancelled = ({ err, seriesLinkId }) => {
  if (!(err instanceof TvheadendError) || err.code !== 'not-found') throw err
  return { ok: true, seriesLinkId, alreadyCancelled: true, stopped: [], stopFailed: [] }
}

export const pauseSeries = async ({ seriesLinkIds, paused }) => {
  const result = await setSeriesTagsEnabled({ seriesLinkIds, enabled: !paused })
  invalidateRecordingState()
  return result
}

export const setSeriesTitleVariant = async ({
  seriesLinkIds,
  variant,
  enabled,
  loadRules = listSeriesRules,
  loadVariants = variantsForTitle,
  writeRule = setSeriesTitleVariants,
  saveVariants = saveTitleVariants,
}) => {
  const rules = await loadRules({ seriesLinkIds })
  const title = rules[0].name
  const current = distinctTitlesOf([...await loadVariants(title), ...rules.flatMap((rule) => rule.titleVariants || [])])
  const chosen = current.find((known) => known.toLowerCase() === variant.toLowerCase())
  if (!chosen && !isVariantTitle({ title, candidate: variant })) {
    throw new TitleVariantError(`"${variant}" is not another title of "${title}".`)
  }
  const variants = nextVariantsOf({ current, variant: chosen ?? variant, enabled })
  await writeRule({ seriesLinkIds, variants })
  await saveVariants({ title, variants })
  invalidateRecordingState()
  return { ok: true, title, variants }
}

export class TitleVariantError extends Error {
  code = 'not-a-variant'
}

const distinctTitlesOf = (titles) => [...new Map(titles.map((title) => [title.toLowerCase(), title])).values()]

export const listGuideAirings = async () => {
  const guide = await getCachedGuide()
  return guide.channels.flatMap((channel) => (guide.programsByChannel[String(channel.epgId)] || [])
    .map((p) => ({ channelId: channel.id, title: p.title, start: p.start, end: p.end })))
}

export const updateSeriesRule = async ({ seriesLinkIds, patch }) => {
  const result = await updateSeriesTags({ seriesLinkIds, patch })
  invalidateRecordingState()
  return result
}

export const getChannelImage = async ({ channelId } = {}) => {
  const cacheKey = String(channelId)
  const cached = imageCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  const guide = await getCachedGuide().catch(() => null)
  const channel = guide?.channels.find((c) => String(c.id) === String(channelId))
  const fetched = channel ? await getChannelIcon({ sources: channel.logos }).catch(() => null) : null
  if (fetched) await saveArtwork({ kind: 'channel', id: cacheKey, image: fetched }).catch(() => null)
  const value = fetched || await findArtwork({ kind: 'channel', id: cacheKey }).catch(() => null)
  if (!value && !guide) return null
  const ttlMs = value ? IMAGE_TTL_MS : IMAGE_MISS_TTL_MS
  imageCache.set(cacheKey, { value, expiresAt: Date.now() + ttlMs })
  return value
}

export const getChannelThumbnail = async ({ channelId, width } = {}) => {
  const guide = await getCachedGuide().catch(() => null)
  const channel = guide?.channels.find((c) => String(c.id) === String(channelId))
  return thumbnailStore.thumbnailFor({
    key: `channel:${channelId}:${(channel?.logos || []).join('|')}`,
    width,
    loadOriginal: () => getChannelImage({ channelId }),
  })
}

export const getProgrammeImage = async ({ eventId, fallbackSource = null } = {}) => {
  const { own, sameTitle, title, kind } = await programmeImageSources({ eventId, fallbackSource })
  return await firstImageOf({ sources: [own, ...sameTitle].filter(Boolean), load: (source) => programmeImages.imageFor(source) })
    || await firstImageOf({ sources: await showArtSources({ title, kind }), load: showArtOriginal })
}

export const getProgrammeThumbnail = async (options) => (await findProgrammeThumbnail(options)).image

export const findProgrammeThumbnail = async ({ eventId, fallbackSource = null, width } = {}) => {
  const programme = await programmeImageSources({ eventId, fallbackSource })
  if (!programme.title && !programme.own) return NO_IMAGE
  const resolution = await artResolver.resolve({
    title: programme.title,
    kind: programme.kind,
    eventId,
    ownSource: programme.own,
    sameTitleSources: programme.sameTitle,
  })
  return imageOfResolution({ resolution, title: programme.title, width, shape: LANDSCAPE_SHAPE })
}

export const findEpisodeThumbnail = async ({ recordingId, width, loadRow = recordingRowOf, episodeOrder = episodePictureOrder } = {}) => {
  const row = await Promise.resolve().then(() => loadRow(recordingId)).catch(() => null)
  const title = row?.show_title_override ?? row?.title
  if (!title) return NO_IMAGE
  const fileReady = !row.purged_at && isCompleteRow(row)
  const resolution = await artResolver.resolve({
    title,
    recordingId,
    episodeOrder: await episodeOrder().catch(() => undefined),
    episodeFile: { filePath: fileReady ? row.file_path : null, programmeDurationS: row.duration_s ?? null, expectedBytes: row.size ?? null },
  })
  return imageOfResolution({ resolution, title, width, shape: LANDSCAPE_SHAPE })
}

export const episodePictureOrder = async () => episodePictureOrderFrom(await getSetting(EPISODE_PICTURE_ORDER_SETTING))

export const pruneFrameGrabs = async ({ database = db } = {}) => {
  const [recordings, items] = await Promise.all([
    database('recordings').whereNull('purged_at').whereNotNull('file_path').select('file_path'),
    database('library_items').whereNotNull('file_path').select('file_path'),
  ])
  const { removed, removedOrigins } = await frameGrabs.prune({ keepPaths: [...recordings, ...items].map((row) => row.file_path) })
  await deleteFrameResolutions({ database, origins: removedOrigins })
  return removed
}

export const deleteFrameResolutions = async ({ database = db, origins = [] } = {}) => {
  if (!origins.length) return 0
  const removedIds = new Set(origins.map(frameBaseOriginOf))
  const rows = await database('art_resolutions').where('origin', 'like', FRAME_ORIGIN_LIKE).select('resolution_key', 'origin')
  const keys = rows.filter((row) => removedIds.has(frameBaseOriginOf(row.origin))).map((row) => row.resolution_key)
  let deleted = 0
  for (let at = 0; at < keys.length; at += FRAME_PRUNE_BATCH) {
    deleted += await database('art_resolutions').whereIn('resolution_key', keys.slice(at, at + FRAME_PRUNE_BATCH)).del().catch((err) => {
      console.error(`[frames] could not delete frame resolutions: ${err.message}`)
      return 0
    })
  }
  return deleted
}

const frameBaseOriginOf = (origin) => String(origin ?? '').split(FRAME_VERSION_SEPARATOR)[0]

export const findShowThumbnail = ({ title, width, kind = null } = {}) =>
  findTitleImage({ title, width, kind, shape: LANDSCAPE_SHAPE })

export const findShowPoster = ({ title, width, kind = null } = {}) =>
  findTitleImage({ title, width, kind, shape: POSTER_SHAPE })

export const resolveShowArt = ({ title, kind = null, shape = null }) => artResolver.resolve({ title, kind, shape })

export const findArtSourceThumbnail = ({ source, width }) => showThumbnailLoader(width)(source)

export const artworkOriginImage = ({ origin, kind, width }) => thumbnailStore.thumbnailFor({
  key: `chosen-1080:${kind}:${origin}`,
  width,
  loadOriginal: () => originalOfOrigin({ origin, kind }),
})

export const automaticShowSources = async ({ title, kind = null }) => {
  if (!title) return { library: [], fallback: [], guide: [] }
  const artworkKind = kind ?? await guideKindFor(title)
  const [library, fallback, guide] = await Promise.all([
    showArtwork.sourcesFor(title, { kind: artworkKind }).catch(() => []),
    fallbackArtwork.sourcesFor(title, { kind: artworkKind }).catch(() => []),
    guideImagesFor(title),
  ])
  return { library, fallback, guide }
}

const guideImagesFor = async (title) => {
  const guide = await getCachedGuide().catch(() => null)
  return guide?.imagesByTitle?.get(titleKeyOf(title)) || []
}

const originalOfOrigin = async ({ origin, kind }) => {
  const image = await rawImageOfOrigin(origin)
  if (!image || kind !== 'background') return image
  return landscapeOf(image).catch(() => image)
}

const rawImageOfOrigin = (origin) => rawImageOrErrorOf(origin).catch(() => null)

const rawImageOrErrorOf = async (origin) => {
  if (origin.startsWith(UPLOAD_ORIGIN_PREFIX)) return artworkUploads.read(origin)
  if (isFrameOrigin(origin)) return frameGrabs.read(origin)
  if (isGuidePictureOrigin(origin)) return guidePictures.read(origin)
  if (origin.startsWith(RECORDING_ORIGIN_PREFIX)) {
    return findArtwork({ kind: 'recording', id: origin.slice(RECORDING_ORIGIN_PREFIX.length) }).catch(() => null)
  }
  if (!origin.startsWith(PLEX_ORIGIN_PREFIX)) return programmeImages.imageOrErrorFor(origin)
  const connection = await getPlexConnection().catch(() => null)
  return connection ? programmeImages.imageOrErrorFor(plexResizedSourceOf(plexSourceOf({ origin, ...connection }))) : null
}

const showSourceImage = (source) => (source.startsWith(RECORDING_ORIGIN_PREFIX)
  ? findArtwork({ kind: 'recording', id: source.slice(RECORDING_ORIGIN_PREFIX.length) }).catch(() => null)
  : programmeImages.imageFor(plexResizedSourceOf(source)))

export const plexResizedSourceOf = (source) => {
  const parsed = parsedUrlOf(source)
  const token = parsed?.searchParams.get('X-Plex-Token')
  if (!token || !parsed.pathname.startsWith(PLEX_METADATA_PATH)) return source
  const params = new URLSearchParams({
    url: parsed.pathname,
    width: String(PLEX_RESIZE_PX),
    height: String(PLEX_RESIZE_PX),
    upscale: '0',
    'X-Plex-Token': token,
  })
  return `${parsed.origin}/photo/:/transcode?${params}`
}

const parsedUrlOf = (source) => {
  try {
    return new URL(source)
  } catch {
    return null
  }
}

export const prepareThumbnailCache = () => thumbnailStore.prepare()

export const findPersonThumbnail = async ({ source, width }) => {
  if (!isPersonImageSource(source)) return null
  return thumbnailStore.thumbnailFor({ key: `person:${source}`, width, loadOriginal: () => personImages.imageFor(source) })
}

const programmeImageSources = async ({ eventId, fallbackSource }) => {
  const guide = await getCachedGuide().catch(() => null)
  const inGuide = guide?.programByEventId.get(String(eventId))
  const saved = inGuide || fallbackSource
    ? null
    : await savedProgramFor({ programId: eventId }).catch(logHistoryError('image'))
  const own = inGuide?.image || fallbackSource || saved?.image || null
  const title = inGuide?.title ?? saved?.title ?? null
  const sameTitle = (guide?.imagesByTitle.get(titleKeyOf(title)) || []).filter((source) => source !== own).slice(0, MAX_IMAGE_SOURCES - 1)
  const programme = inGuide ?? saved
  return { own, sameTitle, title, kind: inGuide?.kind ?? null, channelId: channelIdOfProgramme({ guide, programme }) }
}

const channelIdOfProgramme = ({ guide, programme }) => {
  if (programme?.channel_id == null) return null
  return guide?.channels.find((channel) => String(channel.epgId) === String(programme.channel_id))?.id ?? null
}

const showArtSources = async ({ title, kind = null }) => {
  if (!title) return []
  const artworkKind = kind ?? await guideKindFor(title)
  const fromPlex = await showArtwork.plexSourcesFor(title, { kind: artworkKind }).catch(() => [])
  if (fromPlex.length) return fromPlex
  const recorded = await recordingImagesFor(title)
  if (recorded.length) return recorded
  const sources = isFilmKind(artworkKind) ? [] : await showArtwork.sourcesFor(title).catch(() => [])
  return sources.length ? sources : fallbackArtwork.sourcesFor(title, { kind: artworkKind }).catch(() => [])
}

const findTitleImage = async ({ title, width, kind, shape }) => {
  if (!title) return NO_IMAGE
  const resolution = await artResolver.resolve({ title, kind, shape })
  const found = await imageOfResolution({ resolution, title, width, shape })
  if (found.image || found.pending || resolution.stage !== CHOICE_STAGE) return found
  const automatic = await artResolver.resolve({ title, kind, shape, withoutChoice: true })
  return imageOfResolution({ resolution: automatic, title, width, shape })
}

const imageOfResolution = async ({ resolution, title, width, shape }) => {
  if (resolution.pending) return PENDING_IMAGE
  if (resolution.stage === FINAL_STAGE) return FINAL_MISS
  const rendering = resolvedThumbnail({ resolution, width, shape })
  const image = await resolveWithin(rendering, SHOW_IMAGE_BUDGET_MS)
  if (image === TIMED_OUT) {
    publishWhenRendered({ rendering, title, shape })
    return PENDING_IMAGE
  }
  if (image) return resolution.provisional ? { image, pending: false, provisional: true } : { image, pending: false }
  return resolution.stage === CHOICE_STAGE ? NO_IMAGE : FINAL_MISS
}

export const publishWhenRendered = ({ rendering, title, shape, publish = artFeed.publish }) => rendering.then((image) => {
  if (image) publish({ key: showKeyOf(title), kind: stampKindOf(shape), stamp: null })
}).catch(() => {})

const resolvedThumbnail = ({ resolution: { origin, transform }, width, shape }) => thumbnailStore.thumbnailFor({
  key: `art:${shape}:${transform}:${origin}`,
  width,
  loadOriginal: () => resolvedOriginalOf({ origin, transform, shape }),
}).catch(() => null)

const resolvedOriginalOf = async ({ origin, transform, shape }) => {
  const image = await rawImageOfOrigin(origin)
  if (!image || transform !== 'pad') return image
  return (shape === POSTER_SHAPE ? portraitPadOf(image) : landscapeOf(image)).catch(() => image)
}

const chosenOriginOf = async ({ title, shape, withoutChoice }) => {
  if (withoutChoice) return null
  const kind = shape === POSTER_SHAPE ? 'poster' : 'background'
  return (await artworkChoices.chosenFor({ key: showKeyOf(title), kind }).catch(() => null))?.origin ?? null
}

const plexStage = async ({ title, kind, shape }) => {
  const found = await showArtwork.plexArtworkFor(title, { kind, shape: shape === POSTER_SHAPE ? POSTER_SHAPE : null }).catch(() => NO_ARTWORK)
  if (!found.sources.length) return found
  const connection = await getPlexConnection().catch(() => null)
  const origins = found.sources.map((source) => plexOriginOf({ source, url: connection?.url })).filter(Boolean)
  return { sources: origins, pending: found.pending }
}

export const plexOriginOf = ({ source, url }) => {
  if (!url || !source.startsWith(`${url}/`)) return null
  const [path, query = ''] = source.slice(url.length).split('?')
  const kept = new URLSearchParams(query)
  kept.delete('X-Plex-Token')
  const rest = kept.toString()
  return `${PLEX_ORIGIN_PREFIX}${path}${rest ? `?${rest}` : ''}`
}

const onlineStage = ({ title, kind }) => onlineArtworkOf({
  kind,
  lookUpFilm: () => fallbackArtwork.artworkFor(title, { kind }).catch(() => NO_ARTWORK),
  lookUpSeries: () => seriesOnlineArtwork({ title, kind: isFilmKind(kind) ? SERIES_LOOKUP_KIND : kind }),
  isGuessedFilm: () => guessedFilm(title),
})

const guessedFilm = async (title) => {
  const [libraryKinds, overrides] = await Promise.all([libraryTitles.kindsFor(title).catch(() => []), kindOverrides()])
  return isGuessedFilmKind({ libraryKinds, override: overrides.get(showKeyOf(title)) ?? null })
}

const seriesOnlineArtwork = async ({ title, kind }) => {
  const tvmaze = await showArtwork.tvmazeArtworkFor(title).catch(() => NO_ARTWORK)
  if (tvmaze.sources.length) return tvmaze
  if (tvmaze.pending) {
    showArtSources({ title, kind })
    return tvmaze
  }
  return fallbackArtwork.artworkFor(title, { kind }).catch(() => NO_ARTWORK)
}

const onlineSettingsKey = async () => {
  const online = `${await tvmazeLookupEnabled().catch(() => false)}|${Boolean(await storedTmdbKey().catch(() => null))}`
  return stillsAllowed(await episodePictureOrder().catch(() => undefined)) ? online : `${online}|stills-off`
}

const canonicalKindFor = async ({ title, hint }) => {
  const [libraryKinds, overrides, guideKind] = await Promise.all([
    libraryTitles.kindsFor(title).catch(() => []),
    kindOverrides(),
    guideDisplayKindFor(title),
  ])
  return canonicalKindOf({ libraryKinds, override: overrides.get(showKeyOf(title)) ?? null, guideKind, hint })
}

const kindOverrides = async () => {
  if (overridesCache.expiresAt > Date.now()) return overridesCache.value
  const value = await loadKindOverrides().catch(() => overridesCache.value)
  overridesCache.value = value
  overridesCache.expiresAt = Date.now() + KIND_OVERRIDES_TTL_MS
  return value
}

const guideDisplayKindFor = async (title) => {
  const guide = await getCachedGuide().catch(() => null)
  if (!guide) return null
  if (!displayKindsByGuide.has(guide)) displayKindsByGuide.set(guide, guideKindsOf([...guide.programByEventId.values()]))
  return displayKindsByGuide.get(guide).get(showTitleKey(title)) ?? null
}

const recordingImagesFor = (title) => libraryTitles.recordingImagesFor(title).catch(() => [])

const recordingRowOf = (recordingId) => db('recordings').where({ recording_id: recordingId }).first()

export const frameStage = async ({ title, kind, recordingId = null, episodeFile = null }) => {
  if (!stillsAllowed(await episodePictureOrder().catch(() => undefined))) return NO_ARTWORK
  const onReady = () => publishFrameReady(title)
  if (recordingId != null) {
    const plans = await adPlansFor([recordingId])
    return frameGrabs.frameFor({ ...episodeFile, adPlan: plans.get(String(recordingId)) ?? UNKNOWN_AD_PLAN, onReady })
  }
  const files = await libraryTitles.frameFilesFor(title, { kind }).catch(() => [])
  const plans = await adPlansFor(files.map((file) => file.recordingId).filter((id) => id != null))
  const planned = files.map((file) => ({ ...file, adPlan: filePlanOf({ file, plans }) }))
  for (const file of framePreferenceOrderOf(planned)) {
    const found = await frameGrabs.frameFor({ ...file, onReady })
    if (found.sources.length || found.pending) return found
  }
  return NO_ARTWORK
}

export const filePlanOf = ({ file, plans }) => (file.recordingId != null
  ? plans.get(String(file.recordingId)) ?? UNKNOWN_AD_PLAN
  : downloadAdPlanOf(file))

const adPlansFor = async (recordingIds) => {
  if (!recordingIds.length) return new Map()
  const [rows, enabled] = await Promise.all([
    db('recordings').leftJoin('shows', 'recordings.show_id', 'shows.id')
      .whereIn('recordings.recording_id', recordingIds)
      .select('recordings.recording_id', 'recordings.ad_status', 'recordings.ad_breaks_json', 'recordings.imported_at', 'recordings.channel_name', 'shows.ad_removal as show_ad_removal')
      .catch(() => []),
    getSetting('ad_removal_enabled').catch(() => null),
  ])
  return new Map(rows.map((row) => [String(row.recording_id), adPlanOf({
    adStatus: row.ad_status,
    breaksJson: row.ad_breaks_json,
    showMode: row.show_ad_removal,
    adRemovalEnabled: enabled === 'true',
    importedAt: row.imported_at,
    scanning: isAdJobRunning(row.recording_id),
    channelName: row.channel_name,
  })]))
}

export const refreshFrameAfterAdScan = async ({ recordingId, filePath, breaks = [] }, { grabs = frameGrabs, loadRow = recordingRowOf, database = db } = {}) => {
  const { stale, awaited } = await grabs.reconsider({ filePath, breaks })
  if (stale) await database('art_resolutions').where('origin', 'like', `${frameOriginOf(filePath)}%`).update({ next_check_at: 0 }).catch(() => 0)
  const row = await Promise.resolve().then(() => loadRow(recordingId)).catch(() => null)
  const title = row?.show_title_override ?? row?.title
  if (!title) return { stale, awaited, grabbing: false }
  if (stale) publishFrameReady(title)
  const allowed = stillsAllowed(await episodePictureOrder().catch(() => undefined))
  if (!allowed || !(stale || awaited) || row.purged_at || !isCompleteRow(row)) return { stale, awaited, grabbing: false }
  const plans = await adPlansFor([recordingId])
  await grabs.frameFor({
    filePath: row.file_path,
    programmeDurationS: row.duration_s ?? null,
    expectedBytes: row.size ?? null,
    adPlan: plans.get(String(recordingId)) ?? UNKNOWN_AD_PLAN,
    onReady: () => publishFrameReady(title),
  })
  return { stale, awaited, grabbing: true }
}

const publishFrameReady = (title) => {
  for (const kind of ['background', 'poster']) artFeed.publish({ key: showKeyOf(title), kind, stamp: null })
}

export const publishStillsChange = async ({ database = db, publish = artFeed.publish } = {}) => {
  const [resolved, recordings] = await Promise.all([
    database('art_resolutions').where('origin', 'like', `${FRAME_ORIGIN_LIKE}`).distinct('show_key').catch(() => []),
    database('recordings').whereNull('purged_at').whereNull('image_path').select('title', 'show_title_override').catch(() => []),
  ])
  const keys = new Set([
    ...resolved.map((row) => row.show_key),
    ...recordings.map((row) => showKeyOf(row.show_title_override ?? row.title)),
  ].filter(Boolean))
  for (const key of keys) for (const kind of ['background', 'poster']) publish({ key, kind, stamp: null })
  return keys.size
}

const isFilmKind = (kind) => Boolean(artworkKindOf(kind))

const guideKindFor = async (title) => {
  const guide = await getCachedGuide().catch(() => null)
  if (!guide) return null
  if (!kindsByGuide.has(guide)) kindsByGuide.set(guide, guideKindsByTitle([...guide.programByEventId.values()]))
  return kindsByGuide.get(guide).get(showTitleKey(title)) || null
}

const programmeHintsFor = async (title) => {
  const guide = await getCachedGuide().catch(() => null)
  if (!guide) return null
  if (!hintsByGuide.has(guide)) {
    hintsByGuide.set(guide, programmeHintsByTitle([...guide.programByEventId.values()], { channels: guide.channels || [] }))
  }
  return hintsByGuide.get(guide).get(showTitleKey(title)) || null
}

const artworkHintsFor = async (title) => {
  const [guide, library] = await Promise.all([
    programmeHintsFor(title).catch(() => null),
    libraryTitles.hintsFor(title).catch(() => null),
  ])
  if (!guide) return library
  return library ? { ...guide, inLibrary: true } : guide
}

const showThumbnailLoader = (width) => (source) => thumbnailStore.thumbnailFor({
  key: `show-1080:${source}`,
  width,
  loadOriginal: () => showArtOriginal(source),
})

const resolveWithin = (promise, ms) => Promise.race([
  promise,
  new Promise((resolve) => setTimeout(resolve, ms, TIMED_OUT).unref?.()),
])

const showArtOriginal = async (source) => {
  const image = await showSourceImage(source)
  return image && landscapeOf(image).catch(() => image)
}

const firstImageOf = async ({ sources, load }) => {
  for (const source of sources) {
    const image = await load(source)
    if (image) return image
  }
  return null
}

const titleKeyOf = (title) => String(title || '').trim().toLowerCase()

const imagesByTitleOf = (events) => {
  const imagesByTitle = new Map()
  const byStart = [...events].sort((a, b) => a.start - b.start)
  for (const e of byStart) {
    const key = titleKeyOf(e.title)
    if (!e.image || !key) continue
    if (!imagesByTitle.has(key)) imagesByTitle.set(key, [])
    const images = imagesByTitle.get(key)
    if (!images.includes(e.image)) images.push(e.image)
  }
  return imagesByTitle
}
export const watchGuidePictures = () => {
  onGuideLoaded((guide) => {
    saveGuidePictures(guide).catch((err) => console.warn(`[guide-pictures] ${err.message}`))
  })
}

export const saveGuidePictures = (guide) => {
  if (guidePictureRun) return guidePictureRun
  guidePictureRun = measureJob('guide-pictures', () => runGuidePictures(guide), { kind: 'guide-pictures' })
    .finally(() => { guidePictureRun = null })
  return guidePictureRun
}

export const pruneGuidePictures = async ({ database = db } = {}) => {
  const [recordings, items, choices] = await Promise.all([
    database('recordings').whereNull('purged_at').select('title', 'show_title_override'),
    database('library_items').select('show_title', 'title'),
    database('show_artwork_choices').select('origin'),
  ])
  const keepTitleKeys = new Set([
    ...recordings.map((row) => showTitleKey(row.show_title_override ?? row.title)),
    ...items.flatMap((row) => [showTitleKey(row.show_title), showTitleKey(row.title)]),
  ].filter(Boolean))
  return guidePictures.prune({ keepTitleKeys, keepOrigins: new Set(choices.map((row) => row.origin)) })
}

export const guidePictureCoverage = () => guidePictures.savedTitleKeys()

const runGuidePictures = async (guide) => {
  const programmes = [...guide.programByEventId.values()]
  const fromGuide = await guidePictures.saveAll({ candidates: guidePictureCandidatesOf(programmes) })
  const fromFreeview = await saveFreeviewPictures({ guide, programmes, titleKeys: fromGuide.unsaved })
  return { saved: fromGuide.saved, freeview: fromFreeview, unsaved: fromGuide.unsaved.length }
}

const saveFreeviewPictures = async ({ guide, programmes, titleKeys }) => {
  if (!freeviewAu.isOn() || !titleKeys.length) return 0
  const triplets = await listChannelTriplets({ channels: guide.channels }).catch(() => new Map())
  const airings = freeviewAiringsOf({ programmes, titleKeys: new Set(titleKeys), triplets, nowMs: Date.now() })
  const matches = await freeviewAu.matchAirings(airings)
  for (const [eventId, url] of matches) {
    freeviewByEvent.delete(eventId)
    freeviewByEvent.set(eventId, url)
    if (freeviewByEvent.size > MAX_FREEVIEW_EVENTS) freeviewByEvent.delete(freeviewByEvent.keys().next().value)
  }
  return (await guidePictures.saveAll({ candidates: freeviewCandidatesOf({ airings, matches }) })).saved
}

export const listGuideChannels = async () => (await getCachedGuide()).channels

export const getGuideSnapshot = () => getCachedGuide()

export const onGuideLoaded = (listener) => {
  guideListeners.add(listener)
  return () => guideListeners.delete(listener)
}

export const keepGuideWarm = () => {
  const warm = () => getCachedGuide()
    .then(() => getRecordingState())
    .catch((err) => console.warn(`[epg] guide warm-up: ${err.message}`))
  const warmAfterMidnight = () => {
    const nextMidnightMs = guideDayWindow({ startMs: localMidnightMs() }).dayEnd
    setTimeout(() => {
      warm()
      warmAfterMidnight()
    }, nextMidnightMs - Date.now() + MIDNIGHT_WARM_DELAY_MS).unref()
  }
  warm()
  warmAfterMidnight()
}

export const localMidnightMs = (now = new Date()) => {
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  return midnight.getTime()
}

export const guideDayWindow = ({ startMs, day = 0 }) => {
  const base = new Date(startMs)
  const dateAt = (offset, minutes = 0) =>
    new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset, 0, minutes).getTime()
  return { dayStart: dateAt(day), dayEnd: dateAt(day + 1), spillEnd: dateAt(day + 1, EPG_SPILL_MIN) }
}

export const programsInWindow = ({ rows, fromMs, toMs }) =>
  rows.filter((p) => p.start < toMs && p.end > fromMs)

const getCachedGuide = () => guideCache.get(localMidnightMs())

const announceGuideLoaded = (guide) => {
  setImmediate(() => guideListeners.forEach((listener) => listener(guide)))
  return guide
}

const loadGuide = async (startMs) => {
  const conn = await resolveConnection()
  const endMs = guideDayWindow({ startMs, day: GUIDE_DAYS - 1 }).dayEnd
  const [channels, listed, recordsByKey, evidence] = await Promise.all([
    listChannels(conn),
    listEvents({ startMs, endMs, conn }),
    loadTitleGenres().catch(() => new Map()),
    loadSeriesEvidence().catch(() => new Map()),
  ])
  const kindOf = createDisplayKinds({ programmes: listed, recordsByKey, evidence })
  const events = withDisplayKinds({ programmes: listed, kindOf })
  if (channels.length === 0) {
    throw new TvheadendError(
      'TVHeadend has no channels yet. Scan the mux and map services to channels in TVHeadend first.',
      { stage: 'epg', code: 'no-channels' },
    )
  }
  const programsByChannel = {}
  const programByEventId = new Map()
  for (const c of channels) programsByChannel[String(c.epgId)] = []
  for (const e of events) {
    const rows = programsByChannel[String(e.channel_id)]
    if (rows) rows.push(e)
    programByEventId.set(String(e.program_id), e)
  }
  saveGuidePrograms({ programs: events }).catch(logHistoryError('save'))
  saveGuideEvidence({ programmes: listed, recordsByKey }).catch(logHistoryError('series evidence'))
  return {
    startMs,
    channels,
    programsByChannel,
    programByEventId,
    imagesByTitle: imagesByTitleOf(events),
    kindOf,
    fetchedAt: Date.now(),
    expiresAt: Date.now() + (events.length ? GUIDE_TTL_MS : GUIDE_EMPTY_TTL_MS),
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

export const clearGuideCache = () => guideCache.clear()

const imageCache = new Map()
const fetchImageSource = (source) => {
  if (isFreeviewImageSource(source)) return freeviewClient.getImage({ url: source })
  if (isFallbackImageSource(source)) return artworkClient.getImage({ url: source })
  return fetchProgrammeImageOrThrow({ source })
}
const programmeImages = createProgrammeImages({ fetchImage: guideImageHosts.watch(fetchImageSource) })
const guidePictures = createGuidePictures({ fetchImage: fetchImageSource })
const freeviewAu = createFreeviewAu()
const freeviewByEvent = new Map()
const PERSON_IMAGE_MEMORY_ENTRIES = 48
const PERSON_IMAGE_MEMORY_BYTES = 4 * 1024 * 1024
const personImages = createProgrammeImages({
  fetchImage: fetchFallbackImage,
  maxEntries: PERSON_IMAGE_MEMORY_ENTRIES,
  maxBytes: PERSON_IMAGE_MEMORY_BYTES,
})
const showArtwork = createShowArtwork({
  externalIdsFor: loadExternalIds,
  onTvmazeShow: (found) => Promise.all([rememberTvmazeShow(found), rememberKnownAsFromTvmaze(found)]),
})
const libraryTitles = createLibraryTitles()
const fallbackArtwork = createFallbackArtwork({ hintsFor: artworkHintsFor, externalIdsFor: loadExternalIds })
const hintsByGuide = new WeakMap()
const kindsByGuide = new WeakMap()
const displayKindsByGuide = new WeakMap()
const overridesCache = { value: new Map(), expiresAt: 0 }
const frameGrabs = createFrameGrabs()
onAdScanResult((result) => refreshFrameAfterAdScan(result))
const artResolver = createArtResolver({
  stages: {
    choice: async (ctx) => ({ sources: [await chosenOriginOf(ctx)].filter(Boolean) }),
    plex: plexStage,
    recording: async ({ title }) => ({ sources: await recordingImagesFor(title) }),
    guide: async ({ title }) => ({
      sources: guideSourcesOf({ saved: await guidePictures.originFor(title), live: await guideImagesFor(title) }).slice(0, MAX_IMAGE_SOURCES),
    }),
    saved: async ({ title }) => ({ sources: [await guidePictures.originFor(title)].filter(Boolean) }),
    freeview: async ({ eventId }) => ({ sources: [freeviewByEvent.get(String(eventId))].filter(Boolean) }),
    online: onlineStage,
    own: async ({ ownSource }) => ({ sources: [ownSource].filter(Boolean) }),
    'same-title': async ({ sameTitleSources = [] }) => ({ sources: sameTitleSources }),
    episode: async ({ recordingId }) => ({ sources: [`${RECORDING_ORIGIN_PREFIX}${recordingId}`] }),
    frame: frameStage,
  },
  kindOf: canonicalKindFor,
  loadImage: rawImageOrErrorOf,
  settingsKeyOf: onlineSettingsKey,
  onResolved: artFeed.publish,
})
export const resolvedArtStamps = () => artResolver.stampsByKey()
const guideSearchFor = createGuideSearchCache()
export const forgetShowArtwork = (title) => Promise.all([showArtwork.forget(title), fallbackArtwork.forget(title), artResolver.forget(title)])
const thumbnailStore = createThumbnailStore({
  dir: getThumbnailRoot(),
  maxBytes: imageCacheBytesFrom(process.env.IMAGE_CACHE_MAX_MB),
})

const CHANNEL_SORTS = ['default', 'number', 'name']
const GUIDE_DAYS = 7
const MAX_IMAGE_SOURCES = 4
const MAX_FREEVIEW_EVENTS = 20_000
let guidePictureRun = null
const SHOW_IMAGE_BUDGET_MS = 3000
const PLEX_METADATA_PATH = '/library/metadata/'
const PLEX_RESIZE_PX = 1920
const TIMED_OUT = Symbol('timed out')
const CHOICE_STAGE = 'choice'
const SERIES_LOOKUP_KIND = 'series'
const EPISODE_PICTURE_ORDER_SETTING = 'episode_picture_order'
const FRAME_ORIGIN_LIKE = 'frame:%'
const FRAME_VERSION_SEPARATOR = '-v'
const FRAME_PRUNE_BATCH = 200
const KIND_OVERRIDES_TTL_MS = 30 * 1000
const NO_IMAGE = { image: null, pending: false }
const NO_ARTWORK = { sources: [], pending: false }
const PENDING_IMAGE = { image: null, pending: true }
const FINAL_MISS = { image: null, pending: false, final: true }
const EPG_SPILL_MIN = 180
const DEFAULT_RECORDINGS_ROOT = '/recordings'
const GUIDE_TTL_MS = 60 * 60 * 1000
const MIDNIGHT_WARM_DELAY_MS = 5 * 1000
const GUIDE_STALE_RETRY_MS = 60 * 1000
const GUIDE_EMPTY_TTL_MS = 60 * 1000
const STATE_TTL_MS = 45 * 1000
const PENDING_SKIP_CHECK_MS = 5 * 60 * 1000
const STATE_RETRY_MS = 60 * 1000
const IMAGE_TTL_MS = 24 * 60 * 60 * 1000
const IMAGE_MISS_TTL_MS = 10 * 60 * 1000
const guideListeners = new Set()
const recordingStateCache = createRecordingStateCache({
  load: (now) => measureJob('recording-state', () => loadRecordingState(now)),
  ttlMs: STATE_TTL_MS,
  retryMs: STATE_RETRY_MS,
})

const guideCache = createGuideCache({
  load: (startMs) => measureJob('guide-load', () => loadGuide(startMs), { kind: 'guide' }).then(announceGuideLoaded),
  staleRetryMs: GUIDE_STALE_RETRY_MS,
})

const episodeKey = (p) => `${anyChannelLinkFor(p.series_link) ?? p.series_link}|${p.series_no}x${p.episode_no}`

const hasEpisodeNumber = (p) => p.series_no != null && p.episode_no != null

const timerEpisodeAirings = ({ guide, timers }) => {
  const timerById = new Map(timers.map((timer) => [String(timer.programId), timer]))
  return new Map(
    Object.values(guide.programsByChannel || {})
      .flat()
      .filter((p) => timerById.has(String(p.program_id)) && hasEpisodeNumber(p))
      .sort((a, b) => b.start - a.start)
      .map((p) => [episodeKey(p), { startDate: p.start, channelName: timerById.get(String(p.program_id)).channelName }]),
  )
}

const earlierAiringOf = ({ firstAiringByEpisode, programme }) => {
  if (!hasEpisodeNumber(programme)) return null
  const first = firstAiringByEpisode.get(episodeKey(programme))
  return first && first.startDate < programme.start ? first : null
}
