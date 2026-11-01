import fs from 'node:fs/promises'
import path from 'node:path'
import knex from 'knex'

import knexConfig from '../knexfile.js'
import { saveArtwork } from '../src/artwork.js'
import { pickBigFive } from '../src/default-favourites.js'

const BASE = (process.env.FREETVARR_URL || 'http://127.0.0.1:3801').replace(/\/$/, '')
const GUIDE_DAYS = 7
const SHOW_COUNT = 14
const FILM_COUNT = 3
const ONE_OFF_COUNT = 2
const PLEX_SHOW_COUNT = 2
const PLEX_EPISODES_PER_SHOW = 3
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS
const SYNC_INTERVAL_MIN = 30
const LAST_SYNC_AGO_MIN = 16
const BYTES_PER_SECOND = 920_000
const SPORT_TITLE = /sport|football|rugby|league|\bAFL\b|\bNRL\b|cricket|tennis|golf|racing|indycar|supercars|netball|soccer|motogp|formula|grand prix/i
const NEWSY_TITLE = /news|today|sunrise|weather|update|bundle|offer|skincare|shopping|infomercial|religious|church|paid|programming|close|hour of power|lotto|gemporia|live shop|judge/i
const UNSUITABLE_ONE_OFF = /\bsale\b|% off|penis/i
const LIVE_DEMO_CHANNEL = /^7mate\b/i
const PRIME_HOURS = [18, 19, 20, 21, 22]
const AD_FREE_NETWORKS = ['ABC', 'SBS', 'NITV']
const EPISODES_PER_SHOW = [6, 4, 5, 3, 7, 2, 4, 3, 5, 2, 3, 4, 2, 3]

export const seedCaptureLibrary = async () => {
  const nowMs = Date.now()
  const [guide, settings, series] = await Promise.all([loadGuide(), getJson('/api/settings'), getJson('/api/series')])
  const roots = { tv: settings.media_root, oneoff: settings.oneoff_root, movies: settings.movies_root }
  const scheduledOnly = scheduledOnlyTitle({ series: series.series || [], nowMs })
  const ruleTitles = (series.series || []).map((s) => s.title).filter((title) => title !== scheduledOnly)
  const airings = airingsOf(guide)
  const ruleChannels = new Map((series.series || []).map((s) => [s.title, (s.autorecs || []).map((a) => String(a.channelId))]))
  const onRuleChannel = ({ channel, program }) => !ruleChannels.has(program.title) || ruleChannels.get(program.title).includes(String(channel.id))
  const shows = pickShows({ airings: airings.filter((a) => a.program.title !== scheduledOnly && onRuleChannel(a)), ruleTitles })
  const films = pickFilms({ airings, shows })
  const oneOffs = pickOneOffs({ airings, shows, films })
  const db = knex(knexConfig)
  try {
    await clearLibrary(db)
    const showRows = await insertShowRules({ db, shows, ruleTitles: (series.series || []).map((s) => s.title), nowMs })
    const recordings = [
      ...shows.flatMap((show, i) => showRecordings({ show, rule: showRows.get(show.title), count: EPISODES_PER_SHOW[i] ?? 3, nowMs, roots })),
      ...films.map((entry, i) => filmRecording({ entry, index: i, nowMs, roots })),
      ...oneOffs.map((entry, i) => oneOffRecording({ entry, index: i, nowMs, roots })),
    ]
    await writeFiles(recordings)
    await saveImages(recordings)
    await db.batchInsert('recordings', recordings.map(({ programId, ...row }) => row), 50)
    const sonarrCopy = sonarrCopyOf({ recordings, shows, nowMs })
    const plexItems = [
      ...plexOnlyItems({ shows: shows.slice(0, PLEX_SHOW_COUNT), films: pickPlexFilms({ airings, shows, films, oneOffs }), nowMs, roots }),
      ...(sonarrCopy ? [sonarrCopy] : []),
    ]
    await writeFiles(plexItems.map((item) => ({ file_path: item.file_path, size: item.size_bytes })))
    await db.batchInsert('library_items', plexItems, 50)
    await db.batchInsert('syncs', demoSyncs({ recordings, nowMs }), 50)
    await saveSettings(db, {
      plex_url: 'http://192.168.1.100:32400',
      plex_token: 'capture-demo-token',
      plex_tv_section_id: '2',
      plex_movies_section_id: '1',
      plex_oneoff_section_id: '5',
      plex_whole_library: 'true',
      sonarr_url: 'http://127.0.0.1:9',
      sonarr_api_key: 'capture-demo-key',
      radarr_url: 'http://127.0.0.1:9',
      radarr_api_key: 'capture-demo-key',
      arr_unmonitor_on_delete: 'true',
      ad_removal_enabled: 'true',
      welcome_dismissed: 'true',
    })
    console.log(`[seed] ${shows.length} shows, ${films.length} films, ${oneOffs.length} one-offs, ${recordings.length} recordings, ${plexItems.length} Plex items`)
    console.log(`[seed] shows: ${shows.map((s) => s.title).join(' | ')}`)
    console.log(`[seed] films: ${films.map((f) => f.program.title).join(' | ')}`)
  } finally {
    await db.destroy()
  }
}

const getJson = async (urlPath) => {
  const response = await fetch(`${BASE}${urlPath}`)
  if (!response.ok) throw new Error(`${urlPath} failed: HTTP ${response.status}`)
  return response.json()
}

const loadGuide = async () => {
  const days = []
  for (let day = 0; day < GUIDE_DAYS; day += 1) days.push(await getJson(`/api/epg/guide?day=${day}`).catch(() => null))
  return days.filter(Boolean)
}

const airingsOf = (guide) => {
  const seen = new Set()
  const airings = []
  for (const day of guide) {
    const channels = new Map((day.channels || []).filter((c) => !c.hidden).map((c) => [c.id, c]))
    for (const [channelId, programs] of Object.entries(day.programs || {})) {
      const channel = channels.get(channelId)
      if (!channel || LIVE_DEMO_CHANNEL.test(channel.name || '')) continue
      for (const program of programs) {
        if (seen.has(program.program_id) || !program.has_image) continue
        seen.add(program.program_id)
        airings.push({ channel, program })
      }
    }
  }
  return airings
}

const networkOf = (channel) => (channel.name || '').match(/^(ABC|SBS|NITV|7|9|10)/i)?.[1].toUpperCase() ?? channel.name

const isPrimeTime = (program) => PRIME_HOURS.includes(new Date(program.start).getHours())

const isEpisodic = ({ program }) => program.kind === 'series'
  && program.series_no != null && program.series_no < 100 && program.episode_no != null
  && !SPORT_TITLE.test(program.title || '') && !NEWSY_TITLE.test(program.title || '')

const groupByTitle = (entries) => {
  const groups = new Map()
  for (const entry of entries) {
    const group = groups.get(entry.program.title) ?? []
    if (group.length && group[0].channel.id !== entry.channel.id) continue
    if (!group.some((e) => e.program.series_no === entry.program.series_no && e.program.episode_no === entry.program.episode_no)) group.push(entry)
    groups.set(entry.program.title, group)
  }
  return [...groups.entries()].map(([title, entries]) => ({ title, entries, channel: entries[0].channel }))
}

const showScore = ({ group, ruleTitles }) => (ruleTitles.includes(group.title) ? 100 : 0)
  + group.entries.filter(({ program }) => isPrimeTime(program)).length * 3
  + Math.min(group.entries.length, 5)
  + (group.entries.every(({ program }) => program.episode_title) ? 2 : 0)

const scheduledOnlyTitle = ({ series, nowMs }) => series
  .filter((s) => s.nextAiring?.startDate > nowMs + DAY_MS)
  .sort((a, b) => b.nextAiring.startDate - a.nextAiring.startDate)[0]?.title ?? null

const pickShows = ({ airings, ruleTitles }) => {
  const latestSeason = new Map()
  for (const { channel, program } of airings) {
    const key = `${channel.id}|${program.title}`
    if (program.series_no != null && program.series_no < 100) latestSeason.set(key, Math.max(latestSeason.get(key) ?? 0, program.series_no))
  }
  const groups = groupByTitle(airings.filter(isEpisodic)
    .filter(({ channel, program }) => program.series_no === latestSeason.get(`${channel.id}|${program.title}`)))
    .sort((a, b) => showScore({ group: b, ruleTitles }) - showScore({ group: a, ruleTitles }))
  const perNetwork = new Map()
  const picked = []
  for (const group of groups) {
    if (picked.length === SHOW_COUNT) break
    const network = networkOf(group.channel)
    const count = perNetwork.get(network) ?? 0
    if (count >= 4 && !ruleTitles.includes(group.title)) continue
    perNetwork.set(network, count + 1)
    picked.push(group)
  }
  return picked
}

const isFilmAiring = ({ program }) => program.kind === 'movie'
  && program.end - program.start >= 85 * MINUTE_MS && !SPORT_TITLE.test(program.title || '') && !NEWSY_TITLE.test(program.title || '')

const pickFilms = ({ airings, shows }) => uniqueTitles(airings.filter(isFilmAiring)
  .filter(({ program }) => !shows.some((s) => s.title === program.title))
  .sort((a, b) => Number(isPrimeTime(b.program)) - Number(isPrimeTime(a.program))))
  .slice(0, FILM_COUNT)

const pickPlexFilms = ({ airings, shows, films, oneOffs }) => {
  const taken = new Set([...shows.map((s) => s.title), ...[...films, ...oneOffs].map((e) => e.program.title)])
  return uniqueTitles(airings.filter(isFilmAiring).filter(({ program }) => !taken.has(program.title))).slice(0, 2)
}

const pickOneOffs = ({ airings, shows, films }) => {
  const taken = new Set([...shows.map((s) => s.title), ...films.map((f) => f.program.title)])
  const candidates = airings.filter(({ program }) => !taken.has(program.title) && program.kind !== 'movie'
    && program.series_no == null && !NEWSY_TITLE.test(program.title || '') && !UNSUITABLE_ONE_OFF.test(program.title || '')
    && program.end - program.start >= 55 * MINUTE_MS && isPrimeTime(program))
  return uniqueTitles(candidates).slice(0, ONE_OFF_COUNT)
}

const uniqueTitles = (entries) => {
  const seen = new Set()
  return entries.filter(({ program }) => !seen.has(program.title) && seen.add(program.title))
}

const clearLibrary = async (db) => {
  for (const table of ['recordings', 'shows', 'syncs', 'library_items', 'plex_watch_state', 'user_events', 'job_runs']) {
    await db(table).delete()
  }
  await db('settings').whereIn('key', ['user_events_backfilled_at', 'user_events_series_backfilled_at']).delete()
}

const saveSettings = async (db, values) => {
  for (const [key, value] of Object.entries(values)) {
    await db('settings').insert({ key, value }).onConflict('key').merge()
  }
}

const insertShowRules = async ({ db, shows, ruleTitles, nowMs }) => {
  const ruled = [
    ...shows.filter((s) => ruleTitles.includes(s.title)),
    ...shows.filter((s) => !ruleTitles.includes(s.title)).slice(0, 3),
  ]
  const adModes = ['cut', 'detect', 'off']
  const rows = new Map()
  for (const [i, show] of ruled.entries()) {
    const adFree = AD_FREE_NETWORKS.includes(networkOf(show.channel))
    const [id] = await db('shows').insert({
      show_pattern: show.title,
      dest_folder: show.title,
      season_template: 'Season {season}',
      enabled: true,
      delete_after_import: i === 1,
      ad_removal: adFree ? 'off' : adModes[i % adModes.length],
      created_at: sqlTime(nowMs - (40 + i * 9) * DAY_MS),
    })
    rows.set(show.title, { id, ad_removal: adFree ? 'off' : adModes[i % adModes.length] })
  }
  for (const title of ruleTitles.filter((t) => !rows.has(t))) {
    const [id] = await db('shows').insert({ show_pattern: title, dest_folder: title, season_template: 'Season {season}', enabled: true, delete_after_import: false, ad_removal: 'off', created_at: sqlTime(nowMs - 12 * DAY_MS) })
    rows.set(title, { id, ad_removal: 'off' })
  }
  return rows
}

const weeksBackToPast = ({ start, nowMs }) => Math.max(1, Math.ceil((start - nowMs + 3 * HOUR_MS) / WEEK_MS))

const firstRunsOf = (entries) => {
  let newest = 0
  return [...entries].sort((a, b) => a.program.start - b.program.start).filter(({ program }) => {
    if (program.episode_no <= newest) return false
    newest = program.episode_no
    return true
  })
}

const showRecordings = ({ show, rule, count, nowMs, roots }) => {
  const season = Math.max(...show.entries.map(({ program }) => program.series_no))
  const firstRuns = firstRunsOf(show.entries.filter(({ program }) => program.series_no === season))
  const next = firstRuns.find(({ program }) => program.end > nowMs)
  const template = next ?? firstRuns.at(-1)
  const lastFirstRun = firstRuns.at(-1).program.episode_no
  const topEpisode = next && next.program.episode_no > 2 ? next.program.episode_no - 1 : lastFirstRun
  const baseWeeks = weeksBackToPast({ start: template.program.start, nowMs })
  const rows = Array.from({ length: count }, (_, k) => topEpisode - k)
    .filter((episode) => episode >= 1)
    .map((episode, k) => {
      const aired = firstRuns.find(({ program }) => program.episode_no === episode && program.end <= nowMs - 10 * MINUTE_MS)
      const entry = aired ?? firstRuns.find(({ program }) => program.episode_no === episode) ?? template
      const airedAt = aired ? aired.program.start : template.program.start - (baseWeeks + k) * WEEK_MS
      return recordingRow({ entry, airedAt, idSuffix: `e${episode}`, season, episode, rule, nowMs, roots, kind: 'show' })
    })
  console.log(`[seed]   ${show.title}: S${season} E${rows.map((r) => r.episode).join(',')}`)
  return withWatchStates(rows.sort((a, b) => b.aired_at - a.aired_at))
}

const withWatchStates = (rows) => rows.map((row, i) => {
  if (i === 0) return row
  if (i === 1 && rows.length > 3) return { ...row, playback_position_s: Math.round(row.duration_s * 0.42), played_at: watchedTime(row.aired_at + 2 * DAY_MS) }
  if (i >= 2) return { ...row, watched_at: watchedTime(row.aired_at + DAY_MS), played_at: watchedTime(row.aired_at + DAY_MS) }
  return row
})

const watchedTime = (ms) => isoTime(Math.min(ms, Date.now() - HOUR_MS))

const filmRecording = ({ entry, index, nowMs, roots }) => {
  const row = recordingRow({ entry, weeks: weeksBackToPast({ start: entry.program.start, nowMs }) + index, rule: null, nowMs, roots, kind: 'movie' })
  if (index === 1) return { ...row, playback_position_s: Math.round(row.duration_s * 0.3), played_at: watchedTime(row.aired_at + DAY_MS) }
  if (index === 2) return { ...row, watched_at: watchedTime(row.aired_at + DAY_MS), played_at: watchedTime(row.aired_at + DAY_MS) }
  return row
}

const oneOffRecording = ({ entry, index, nowMs, roots }) => recordingRow({
  entry, weeks: weeksBackToPast({ start: entry.program.start, nowMs }) + index, rule: null, nowMs, roots, kind: 'oneoff',
})

const recordingRow = ({ entry, weeks = 0, airedAt: airedAtGiven = null, idSuffix = `w${weeks}`, season = null, episode = null, rule, nowMs, roots, kind }) => {
  const { channel, program } = entry
  const airedAt = airedAtGiven ?? program.start - weeks * WEEK_MS
  const durationS = Math.round((program.end - program.start) / 1000)
  const recordingId = `demo${program.program_id}${idSuffix}`
  const importedAt = Math.min(nowMs - LAST_SYNC_AGO_MIN * MINUTE_MS, airedAt + durationS * 1000 + 6 * MINUTE_MS)
  const adMode = kind === 'show' && !AD_FREE_NETWORKS.includes(networkOf(channel)) ? rule?.ad_removal ?? 'off' : 'off'
  return {
    programId: program.program_id,
    recording_id: recordingId,
    show_id: rule?.id ?? null,
    title: program.title,
    season,
    episode,
    file_path: libraryPath({ title: program.title, season, episode, kind, airedAt, roots }),
    size: Math.round(durationS * BYTES_PER_SECOND * (0.94 + (episode ?? 1) % 4 * 0.03)),
    status: 'done',
    error: null,
    imported_at: sqlTime(importedAt),
    deleted_from_tvh_at: sqlTime(importedAt + 2 * MINUTE_MS),
    episode_title: kind === 'show' && program.episode_no === episode && program.episode_title && !/^episode \d+/i.test(program.episode_title) ? program.episode_title : null,
    channel_id: channel.id,
    channel_name: channel.name,
    aired_at: airedAt,
    duration_s: durationS,
    synopsis: kind !== 'show' || program.episode_no === episode ? program.synopsis || null : null,
    image_checked_at: sqlTime(importedAt),
    library_choice: 'auto',
    classification: program.classification ?? null,
    genres_json: '[]',
    ...adFields({ mode: adMode, durationS, importedAt }),
  }
}

const adFields = ({ mode, durationS, importedAt }) => {
  if (mode === 'off') return {}
  const count = Math.max(1, Math.floor(durationS / 900))
  const breaks = Array.from({ length: count }, (_, i) => {
    const start = Math.round(((i + 1) * durationS) / (count + 1))
    return { start, end: start + 150 + (i % 2) * 45 }
  })
  return {
    ad_status: mode === 'cut' ? 'cut' : 'detected',
    ad_breaks_json: JSON.stringify(breaks),
    ad_processed_at: sqlTime(importedAt + 3 * MINUTE_MS),
    ad_cut_at: mode === 'cut' ? sqlTime(importedAt + 4 * MINUTE_MS) : null,
  }
}

const libraryPath = ({ title, season, episode, kind, airedAt, roots }) => {
  const folder = safeName(title)
  if (kind === 'movie') return path.join(roots.movies, folder, `${folder}.ts`)
  if (kind === 'oneoff') return path.join(roots.oneoff, folder, `${folder} - ${localStamp(airedAt)}.ts`)
  const se = `S${pad(season)}E${pad(episode)}`
  return path.join(roots.tv, folder, `Season ${pad(season)}`, `${folder} - ${se}.ts`)
}

const plexOnlyItems = ({ shows, films, nowMs, roots }) => [
  ...shows.flatMap((show, s) => {
    const source = show.entries[0]
    const season = Math.max(1, source.program.series_no - 1)
    return Array.from({ length: PLEX_EPISODES_PER_SHOW }, (_, i) => plexItem({
      entry: source,
      key: `${source.program.program_id}${s}${i}`,
      kind: 'episode',
      season,
      episode: i + 1,
      addedAt: nowMs - (200 + i) * DAY_MS,
      filePath: path.join(roots.tv, safeName(show.title), `Season ${pad(season)}`, `${safeName(show.title)} - S${pad(season)}E${pad(i + 1)}.mkv`),
      watched: i < 2,
      sectionId: '2',
      manager: 'sonarr',
    }))
  }),
  ...films.map((entry, i) => plexItem({
    entry,
    key: `${entry.program.program_id}9${i}`,
    kind: 'movie',
    addedAt: nowMs - (90 + i * 30) * DAY_MS,
    filePath: path.join(roots.movies, safeName(entry.program.title), `${safeName(entry.program.title)}.mkv`),
    watched: false,
    sectionId: '1',
    manager: 'radarr',
  })),
]

const sonarrCopyOf = ({ recordings, shows, nowMs }) => {
  const show = shows[0]
  const recording = recordings.filter((r) => r.title === show.title && r.season != null).sort((a, b) => b.aired_at - a.aired_at)[1]
  if (!recording) return null
  const source = show.entries[0]
  return {
    ...plexItem({
      entry: source,
      key: `${source.program.program_id}77`,
      kind: 'episode',
      season: recording.season,
      episode: recording.episode,
      addedAt: recording.aired_at + 3 * HOUR_MS,
      filePath: recording.file_path.replace(/\.ts$/, ' WEBDL-1080p.mkv'),
      watched: false,
      sectionId: '2',
      manager: 'sonarr',
    }),
    title: recording.episode_title || `Episode ${recording.episode}`,
    manager_file_id: 4211,
    manager_item_id: 9312,
    manager_series_id: 118,
  }
}

const plexItem = ({ entry, key, kind, season = null, episode = null, addedAt, filePath, watched, sectionId, manager }) => ({
  rating_key: `9${key}`,
  part_id: `8${key}`,
  media_id: `7${key}`,
  section_id: sectionId,
  kind,
  show_title: kind === 'episode' ? entry.program.title : null,
  show_rating_key: kind === 'episode' ? `6${entry.program.program_id}` : null,
  season,
  episode,
  title: kind === 'episode' ? `Episode ${episode}` : entry.program.title,
  year: null,
  aired_at: addedAt - 2 * DAY_MS,
  duration_s: Math.round((entry.program.end - entry.program.start) / 1000),
  added_at: addedAt,
  synopsis: entry.program.synopsis || null,
  file_path: filePath,
  plex_file: filePath,
  size_bytes: Math.round((entry.program.end - entry.program.start) / 1000 * 610_000),
  video_codec: 'h264',
  resolution: '1080',
  audio_codec: 'aac',
  thumb: `/library/metadata/9${key}/thumb`,
  art: `/library/metadata/9${key}/art`,
  watched_at: watched ? addedAt + 3 * DAY_MS : null,
  view_offset_s: null,
  last_viewed_at: watched ? addedAt + 3 * DAY_MS : null,
  pending_push: null,
  recording_id: null,
  manager,
  manager_file_id: null,
  manager_item_id: null,
  manager_series_id: null,
  seen_at: addedAt,
})

const demoSyncs = ({ recordings, nowMs }) => {
  const imported = [...recordings].sort((a, b) => b.aired_at - a.aired_at)
  const slotStart = (slot) => nowMs - (LAST_SYNC_AGO_MIN + slot * SYNC_INTERVAL_MIN) * MINUTE_MS
  const sync = ({ slot, status = 'ok', summary }) => ({
    started_at: sqlTime(slotStart(slot)),
    finished_at: sqlTime(slotStart(slot) + 40_000),
    status,
    summary_json: JSON.stringify(summary),
  })
  const item = (row, outcome, ms, extra = {}) => row && ({
    id: row.recording_id,
    title: row.title,
    episodeTitle: row.episode_title,
    season: row.season,
    episode: row.episode,
    channel: row.channel_name,
    airedAt: row.aired_at,
    durationS: row.duration_s,
    kind: row.season != null ? 'tv' : 'oneOff',
    outcome,
    size: row.size,
    error: null,
    ads: null,
    ms,
    removedFromTvh: true,
    ...extra,
  })
  const shortCopy = 'short copy: on-disk 1200000000 bytes vs TVHeadend 2100000000 bytes (Δ 900000000)'
  const empty = (slot) => sync({ slot, summary: { trigger: 'cron', imported: 0, skipped: 14, failed: 0, errors: [], items: [], steps: { list: 610, imports: 40, libraryCheck: 80 } } })
  return [
    sync({ slot: 9, summary: { trigger: 'cron', imported: 1, skipped: 12, failed: 0, errors: [], plex: { triggered: true, status: 200 }, items: [item(imported[5], 'imported', 1300)].filter(Boolean), steps: { list: 620, imports: 1300, plexTv: 390, libraryCheck: 85 } } }),
    empty(8),
    empty(7),
    sync({ slot: 6, status: 'partial', summary: { trigger: 'manual', imported: 1, skipped: 13, failed: 1, errors: [`${imported[4]?.title}: ${shortCopy}`], plex: { triggered: true, status: 200 }, items: [item(imported[3], 'imported', 1100), item(imported[4], 'failed', 64000, { error: shortCopy, size: 1200000000 })].filter(Boolean), steps: { list: 700, imports: 65200, plexTv: 410, libraryCheck: 95 } } }),
    empty(5),
    empty(4),
    empty(3),
    empty(2),
    empty(1),
    sync({ slot: 0, summary: { trigger: 'recording-finished', imported: 2, skipped: 14, failed: 0, errors: [], plex: { triggered: true, status: 200 }, ads: { scanned: 2, detected: 1, cut: 1, failed: 0, adSeconds: 278 }, items: [item(imported[0], 'imported', 1800, { ads: { status: 'cut', adSeconds: 278 } }), item(imported[1], 'imported', 900, { ads: { status: 'detected', adSeconds: 0 } })].filter(Boolean), steps: { list: 640, imports: 2700, plexTv: 380, libraryCheck: 90 } } }),
  ]
}

const writeFiles = async (recordings) => {
  for (const row of recordings) {
    await fs.mkdir(path.dirname(row.file_path), { recursive: true })
    const handle = await fs.open(row.file_path, 'w')
    await handle.truncate(row.size)
    await handle.close()
  }
}

const saveImages = async (recordings) => {
  for (const row of recordings) {
    const response = await fetch(`${BASE}/api/epg/image/${encodeURIComponent(row.programId)}`)
    if (!response.ok) continue
    const image = { body: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get('content-type') || 'image/jpeg' }
    row.image_path = await saveArtwork({ kind: 'recording', id: row.recording_id, image })
  }
}

const safeName = (title) => String(title).replace(/[/\\:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()

const pad = (n) => String(n).padStart(2, '0')

const localStamp = (ms) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}`
}

const sqlTime = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ')

const isoTime = (ms) => new Date(ms).toISOString()

export const pinFavouriteChannels = async () => {
  const { channels = [] } = await getJson('/api/epg/guide?day=0')
  const liveDemo = channels.filter((c) => LIVE_DEMO_CHANNEL.test(c.name || ''))
  const pinnedIds = [...liveDemo, ...pickBigFive(channels)].map((c) => String(c.id))
  const tokenResponse = await fetch(`${BASE}/api/csrf-token`)
  const cookie = (tokenResponse.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  const { token } = await tokenResponse.json()
  const response = await fetch(`${BASE}/api/epg/channel-prefs`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-csrf-token': token, cookie },
    body: JSON.stringify({ pinned_ids: pinnedIds }),
  })
  if (!response.ok) throw new Error(`channel favourites failed: HTTP ${response.status}`)
  console.log(`[seed] favourite channels: ${pinnedIds.length}`)
}

export const warmCaptureArtwork = async () => {
  const { shows = [] } = await getJson('/api/library/shows')
  const urls = shows.flatMap((show) => [show.poster, show.image, show.art].filter((u) => typeof u === 'string' && u.startsWith('/api/')))
  for (let round = 0; round < 3; round += 1) {
    await Promise.all(urls.map((u) => fetch(`${BASE}${u}`).then((r) => r.arrayBuffer()).catch(() => null)))
  }
  await getJson('/api/for-you')
  for (let tries = 0; tries < 60; tries += 1) {
    const hero = await getJson('/api/home/hero').catch(() => ({}))
    if ((hero.candidates || []).length >= 3) break
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  console.log(`[seed] warmed ${urls.length} show pictures`)
}

if (process.argv.includes('--warm')) {
  await pinFavouriteChannels()
  await warmCaptureArtwork()
}
else await seedCaptureLibrary()
