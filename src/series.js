import path from 'path'

import { db, getSetting } from './db.js'
import { createValidFilename, getMediaRoot, getOneOffRoot, matchShow, seasonFolderName } from './sync.js'
import { getRecordingState, listGuideChannels } from './epg.js'
import { ONE_OFF_KIND, loadKindOverrides } from './programme-kind.js'
import { showKeyOf } from './web/show-key.js'

export const getSeries = async ({
  loadShows = () => db('shows').orderBy('created_at', 'desc'),
  loadState = getRecordingState,
  loadChannels = listGuideChannels,
  loadSaving = savingSettings,
  loadOverrides = loadKindOverrides,
  nowMs = Date.now(),
} = {}) => {
  const [shows, saving, kindOverrides] = await Promise.all([
    loadShows(),
    loadSaving(),
    loadOverrides().catch(() => new Map()),
  ])
  try {
    const [state, channels] = await Promise.all([loadState(), loadChannels().catch(() => [])])
    const joined = joinSeries({
      seriesTags: state.seriesTags,
      upcomingRecordings: state.upcomingRecordings,
      shows,
      channels,
      saving,
      kindOverrides,
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
  kindOverrides = new Map(),
  nowMs = Date.now(),
} = {}) => {
  const channelNames = new Map(channels.map((c) => [String(c.id), c.name]))
  const series = groupByTitle(seriesTags)
    .map(({ key, autorecs }) => describeSeries({ key, autorecs, shows, upcomingRecordings, channelNames, saving, kindOverrides, nowMs }))
    .sort((a, b) => a.title.localeCompare(b.title))
  const filedIds = new Set(series.filter((s) => s.folder).map((s) => s.folder.id))
  return { series, titleMatches: withSavesTo({ shows: shows.filter((s) => !filedIds.has(s.id)), saving }) }
}

export const savesTo = ({ folder, title, season, saving = DEFAULT_SAVING, series = false, kindOverride = null }) => {
  const filed = Boolean(folder?.enabled)
  if (!filed && !saving.importUnmatched) return { kind: 'held', path: null }
  if (kindOverride === ONE_OFF_KIND) return oneOffPathOf({ title, saving })
  if (filed) {
    const seasonDir = seasonFolderName({ template: folder.season_template, season: season ?? UNKNOWN })
    return { kind: 'library', path: path.join(saving.mediaRoot, folder.dest_folder, seasonDir) }
  }
  if (series) return { kind: 'newFolder', path: path.join(saving.mediaRoot, titleDirOf(title)) }
  return oneOffPathOf({ title, saving })
}

export const folderForTitle = ({ shows, title }) =>
  matchShow(shows.filter((s) => s.enabled), title) || matchShow(shows, title) || null

const UNKNOWN = '…'

const titleDirOf = (title) => (title ? createValidFilename(title) || UNKNOWN : UNKNOWN)

const oneOffPathOf = ({ title, saving }) => ({ kind: 'oneOff', path: path.join(saving.oneOffRoot, titleDirOf(title)) })

const DEFAULT_SAVING = { mediaRoot: '/media/tv', oneOffRoot: '/media/one-offs', importUnmatched: true }

const savingSettings = async () => ({
  mediaRoot: await getMediaRoot(),
  oneOffRoot: await getOneOffRoot(),
  importUnmatched: (await getSetting('import_unmatched')) !== 'false',
})

const withSavesTo = ({ shows, saving }) =>
  shows.map((show) => ({ ...show, savesTo: savesTo({ folder: show, saving }) }))

const describeSeries = ({ key, autorecs, shows, upcomingRecordings, channelNames, saving, kindOverrides, nowMs }) => {
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
      anyChannel: !a.channelId,
      enabled: a.enabled,
      episodesToKeep: a.episodesToKeep || 0,
    })),
    nextAiring: next ? nextAiringOf({ next, channelNames }) : null,
    folder,
    savesTo: savesTo({
      folder,
      title,
      season: next?.season,
      saving,
      series: true,
      kindOverride: kindOverrides.get(showKeyOf(title)) ?? null,
    }),
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
  synopsis: next.synopsis || null,
  classification: next.classification ?? null,
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
