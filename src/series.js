import path from 'path'

import { db, getSetting } from './db.js'
import { createValidFilename, getMediaRoot, getOneOffRoot, matchShow, seasonFolderName } from './sync.js'
import { getRecordingState, listGuideChannels } from './epg.js'

export const getSeries = async ({
  loadShows = () => db('shows').orderBy('created_at', 'desc'),
  loadState = getRecordingState,
  loadChannels = listGuideChannels,
  loadSaving = savingSettings,
  nowMs = Date.now(),
} = {}) => {
  const [shows, saving] = await Promise.all([loadShows(), loadSaving()])
  try {
    const [state, channels] = await Promise.all([loadState(), loadChannels().catch(() => [])])
    const joined = joinSeries({
      seriesTags: state.seriesTags,
      upcomingRecordings: state.upcomingRecordings,
      shows,
      channels,
      saving,
      nowMs,
    })
    return { ...joined, stale: Boolean(state.stale), error: null }
  } catch (err) {
    return { series: [], titleMatches: withSavesTo({ shows, saving }), stale: false, error: err.message }
  }
}

export const joinSeries = ({
  seriesTags = [],
  upcomingRecordings = [],
  shows = [],
  channels = [],
  saving = DEFAULT_SAVING,
  nowMs = Date.now(),
} = {}) => {
  const channelNames = new Map(channels.map((c) => [String(c.id), c.name]))
  const series = groupByTitle(seriesTags)
    .map(({ key, autorecs }) => describeSeries({ key, autorecs, shows, upcomingRecordings, channelNames, saving, nowMs }))
    .sort((a, b) => a.title.localeCompare(b.title))
  const filedIds = new Set(series.filter((s) => s.folder).map((s) => s.folder.id))
  return { series, titleMatches: withSavesTo({ shows: shows.filter((s) => !filedIds.has(s.id)), saving }) }
}

export const savesTo = ({ folder, title, season, saving = DEFAULT_SAVING }) => {
  if (folder?.enabled) {
    const seasonDir = seasonFolderName({ template: folder.season_template, season: season ?? UNKNOWN })
    return { kind: 'library', path: path.join(saving.mediaRoot, folder.dest_folder, seasonDir) }
  }
  if (!saving.importUnmatched) return { kind: 'held', path: null }
  const titleDir = title ? createValidFilename(title) || UNKNOWN : UNKNOWN
  return { kind: 'oneOff', path: path.join(saving.oneOffRoot, titleDir) }
}

export const folderForTitle = ({ shows, title }) =>
  matchShow(shows.filter((s) => s.enabled), title) || matchShow(shows, title) || null

const UNKNOWN = '…'

const DEFAULT_SAVING = { mediaRoot: '/media/tv', oneOffRoot: '/media/one-offs', importUnmatched: true }

const savingSettings = async () => ({
  mediaRoot: await getMediaRoot(),
  oneOffRoot: await getOneOffRoot(),
  importUnmatched: (await getSetting('import_unmatched')) !== 'false',
})

const withSavesTo = ({ shows, saving }) =>
  shows.map((show) => ({ ...show, savesTo: savesTo({ folder: show, saving }) }))

const describeSeries = ({ key, autorecs, shows, upcomingRecordings, channelNames, saving, nowMs }) => {
  const title = autorecs[0].name
  const links = new Set(autorecs.map((a) => String(a.seriesLinkId)))
  const next = upcomingRecordings
    .filter((r) => links.has(String(r.seriesLinkId)) && r.endDate > nowMs)
    .sort((a, b) => a.startDate - b.startDate)[0]
  const folder = folderForTitle({ shows, title })
  return {
    key,
    title,
    recording: autorecs.some((a) => a.enabled),
    episodesToKeep: Math.max(...autorecs.map((a) => a.episodesToKeep || 0)),
    imageProgramId: autorecs.find((a) => a.imageProgramId != null)?.imageProgramId ?? null,
    autorecs: autorecs.map((a) => ({
      id: a.id,
      seriesLinkId: a.seriesLinkId,
      channelId: a.channelId,
      channelName: channelNames.get(String(a.channelId)) || null,
      enabled: a.enabled,
      episodesToKeep: a.episodesToKeep || 0,
    })),
    nextAiring: next ? nextAiringOf({ next, channelNames }) : null,
    folder,
    savesTo: savesTo({ folder, title, season: next?.season, saving }),
  }
}

const nextAiringOf = ({ next, channelNames }) => ({
  programId: next.programId,
  startDate: next.startDate,
  endDate: next.endDate,
  episodeTitle: next.episodeTitle || null,
  channelId: next.channelId,
  channelName: next.channelName || channelNames.get(String(next.channelId)) || null,
  season: next.season ?? null,
  expected: next.source === 'series',
})

const groupByTitle = (seriesTags) => {
  const groups = new Map()
  for (const tag of seriesTags) {
    const key = String(tag.name || '').trim().toLowerCase()
    if (!key) continue
    if (!groups.has(key)) groups.set(key, { key, autorecs: [] })
    groups.get(key).autorecs.push(tag)
  }
  return [...groups.values()]
}
