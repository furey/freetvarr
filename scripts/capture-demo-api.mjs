import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const TIMEZONE = process.env.TZ || 'Australia/Sydney'

export const simulatedNow = () => {
  const forced = Date.parse(process.env.SIMULATED_NOW || '')
  if (Number.isFinite(forced)) return forced
  const tonight = new Date()
  tonight.setHours(PRIME_TIME.hour, PRIME_TIME.minute, 0, 0)
  if (tonight.getTime() > Date.now()) return tonight.getTime()
  tonight.setDate(tonight.getDate() + 1)
  return tonight.getTime()
}

export const prepareDemoContext = async ({ context, base, simNow }) => {
  const { guide, dayOffset } = await loadSimulatedGuide({ request: context.request, base, simNow })
  const picks = await pickShowcase({ request: context.request, base, guide, simNow })
  const fixtures = demoFixtures({ simNow, recording: picks.recording })
  await context.clock.install({ time: simNow })
  await context.addInitScript((prefs) => {
    try {
      for (const [key, value] of Object.entries(prefs)) localStorage.setItem(key, value)
    } catch {}
  }, DEMO_PREFS)
  await context.route('**/api/**', refuseUnknownGet)
  await context.route('**/api/epg/logo/**', (route) => route.continue())
  await context.route('**/api/epg/image/**', (route) => route.continue())
  await context.route('**/api/csrf-token', (route) => route.continue())
  await context.route('**/api/version', (route) => route.continue())
  await context.route('**/api/epg/guide**', rewriteJson(withSimulatedDay({ dayOffset, simNow }), shiftDay(dayOffset)))
  await context.route('**/api/epg/now**', (route) => fulfillJson(route, onNowAt({ guide, simNow, url: route.request().url() })))
  await context.route('**/api/epg/search**', rewriteJson(futureResults(simNow)))
  await context.route('**/api/epg/state**', rewriteJson(sanitiseState({ simNow, recording: picks.recording })))
  await context.route('**/api/settings', rewriteJson(maskSettings))
  await context.route('**/api/sync-status', (route) => fulfillJson(route, fixtures.syncStatus))
  await context.route('**/api/syncs**', (route) => fulfillJson(route, { syncs: fixtures.syncs }))
  await context.route('**/api/shows', (route) => fulfillJson(route, { shows: fixtures.shows }))
  await context.route('**/api/recordings**', (route) => fulfillJson(route, fixtures.recordingsPage))
  await context.route('**/api/recording-now', (route) => fulfillJson(route, fixtures.recordingNow))
  await context.route('**/api/folder-suggest**', (route) => fulfillJson(route, { match: null, folders: [] }))
  await context.route('**/api/doctor**', (route) => fulfillJson(route, fixtures.doctor))
  await context.route('**/api/**', refuseWrites)
  await context.route(/\/api\/live(\/|\?|$)/, demoLiveTv())
  return picks
}

export const onAirCell = (page, { program }) => page.locator('.epg-cell.on-now')
  .filter({ has: page.locator('.epg-cell-title', { hasText: program.title }) })
  .first()

export const waitForProgrammeImages = (page) => page.waitForFunction(() => [...document.querySelectorAll('.programme-image')]
  .filter((el) => {
    const box = el.getBoundingClientRect()
    return box.width > 0 && box.bottom > 0 && box.top < window.innerHeight && box.right > 0 && box.left < window.innerWidth
  })
  .every((el) => !el.classList.contains('is-loading')), null, { timeout: 15_000 })
  .catch(() => console.log('  programme images still loading'))

export const waitForImages = (page, selector) => page.waitForFunction((sel) => {
  const images = [...document.querySelectorAll(sel)]
    .filter((img) => img.getBoundingClientRect().top < window.innerHeight)
  return images.length > 0 && images.every((img) => img.complete && img.naturalWidth > 0)
}, selector, { timeout: 10_000 }).catch(() => console.log(`  images not ready: ${selector}`))

const PRIME_TIME = { hour: 19, minute: 45 }
const LIVE_DEMO_DIR = process.env.LIVE_DEMO_DIR || '/work/scripts/.cache/live-demo'
const LIVE_SESSION_ID = 'demo-live'
const LIVE_TUNING_MS = 2_600
const LIVE_WINDOW_SEGMENTS = 3
const MINUTE_MS = 60_000
const DAY_MS = 86_400_000
const SYNC_INTERVAL_MIN = 30
const LAST_SYNC_AGO_MIN = 16
const FAVOURITE_CHANNEL_PATTERNS = [/^ABC TV/i, /^SBS\b/i, /^9/i, /^7/i]
const FAVOURITE_COUNT = 3
const SEARCH_TITLE_MAX = 24
const DEMO_PREFS = {
  'freetvarr.welcomeDismissed': '1',
  'freetvarr.guideZoom': 'm',
  'freetvarr.guideImages': '1',
  'freetvarr.liveImages': '1',
  'freetvarr.liveFavouritesOnly': '0',
}

const SANITISED_SETTINGS = {
  tvh_url: 'http://192.168.1.50:9981',
  tvh_username: 'freetvarr',
  recordings_root: '/recordings',
  tvh_recordings_path: '/recordings',
  plex_url: 'http://192.168.1.100:32400',
  plex_prefs_path: '/plex-preferences.xml',
  media_root: '/media/tv',
}

const loadSimulatedGuide = async ({ request, base, simNow }) => {
  const today = await fetchGuideDay({ request, base, day: 0 })
  const dayOffset = Math.round((localMidnight(simNow) - today.dayStart) / DAY_MS)
  const guide = dayOffset === 0 ? today : await fetchGuideDay({ request, base, day: dayOffset })
  return { guide: withFavouriteChannels(guide), dayOffset }
}

const fetchGuideDay = async ({ request, base, day }) => {
  const response = await request.get(`${base}/api/epg/guide?day=${day}`)
  if (!response.ok()) throw new Error(`guide day ${day} failed: HTTP ${response.status()}`)
  return response.json()
}

const pickShowcase = async ({ request, base, guide, simNow }) => {
  const onAir = await withServedImage({ request, base, entries: onAirWithImage({ guide, simNow }) })
  const pinned = onAir.filter(({ channel }) => channel.pinned)
  const [programme, recording] = [...pinned, ...onAir.filter(({ channel }) => !channel.pinned)]
  if (!programme) throw new Error('no on-air programme with an image at the simulated time')
  return { programme, recording: recording ?? null, searchTerm: upNextTitle({ guide, simNow }) }
}

const onAirWithImage = ({ guide, simNow }) => visibleChannels(guide).flatMap((channel) => {
  const program = programsOf(guide, channel).find((p) => airsAt(p, simNow) && p.has_image)
  return program ? [{ channel, program }] : []
})

const withServedImage = async ({ request, base, entries }) => {
  const served = await Promise.all(entries.map(async ({ program }) => {
    const response = await request.get(`${base}/api/epg/image/${encodeURIComponent(program.program_id)}`)
    return response.ok()
  }))
  return entries.filter((_, i) => served[i])
}

const upNextTitle = ({ guide, simNow }) => {
  const channels = visibleChannels(guide)
  const ranked = [...channels.filter((c) => c.pinned), ...channels.filter((c) => !c.pinned)]
  const titles = ranked
    .map((channel) => nowAndNext(programsOf(guide, channel), simNow).next)
    .filter((p) => p?.has_image && (p.title || '').length <= SEARCH_TITLE_MAX)
    .map((p) => p.title)
  return titles[0] ?? null
}

const visibleChannels = (guide) => (guide.channels || []).filter((c) => !c.hidden)

const programsOf = (guide, channel) => guide.programs?.[channel.id] || []

const airsAt = (p, ms) => p.start <= ms && p.end > ms

const onNowAt = ({ guide, simNow, url }) => {
  const entries = visibleChannels(guide).map((channel) => ({
    channel: {
      id: channel.id,
      name: channel.name,
      number: channel.number ?? null,
      hasLogo: (channel.logos || []).length > 0,
      pinned: Boolean(channel.pinned),
    },
    ...nowAndNext(programsOf(guide, channel), simNow),
  }))
  if (new URL(url).searchParams.get('all') !== '1') {
    return { entries: entries.filter((e) => e.channel.pinned) }
  }
  return {
    fetchedAt: simNow,
    stale: false,
    sort: guide.sort,
    hideSdSimulcasts: guide.hideSdSimulcasts,
    hiddenIds: guide.hiddenIds,
    channels: guide.channels,
    entries,
  }
}

const nowAndNext = (programs, ms) => ({
  now: programs.find((p) => airsAt(p, ms)) || null,
  next: programs.filter((p) => p.start > ms).sort((a, b) => a.start - b.start)[0] || null,
})

const shiftDay = (dayOffset) => (url) => {
  const shifted = new URL(url)
  shifted.searchParams.set('day', String(Number(url.searchParams.get('day') || 0) + dayOffset))
  return shifted
}

const withSimulatedDay = ({ dayOffset, simNow }) => (data) => ({
  ...withFavouriteChannels(data),
  day: data.day - dayOffset,
  fetchedAt: simNow,
})

const futureResults = (simNow) => (data) => ({
  ...data,
  results: (data.results || []).filter((r) => r.end > simNow),
})

const sanitiseState = ({ simNow, recording }) => (data) => {
  const upcoming = (rows) => (rows || []).filter((r) => r.endDate > simNow)
  const future = upcoming(data.futureRecordings).map((r) => ({ ...r, filename: null }))
  return {
    ...data,
    storageInfo: data.storageInfo && { free: data.storageInfo.free, total: data.storageInfo.total, used: data.storageInfo.used },
    activeInputs: [],
    futureRecordings: recording ? [...future, scheduledEntry(recording)] : future,
    upcomingRecordings: upcoming(data.upcomingRecordings),
    activeRecordingIds: recording ? [String(recording.program.program_id)] : [],
    fetchedAt: simNow,
  }
}

const scheduledEntry = ({ channel, program }) => ({
  uuid: 'demo-active-recording',
  programId: program.program_id,
  name: program.title,
  episodeTitle: program.episode_title || null,
  channelId: channel.id,
  channelName: channel.name,
  startDate: program.start,
  endDate: program.end,
  schedStatus: 'recording',
  statusText: 'Running',
  filename: null,
  pendingDelete: false,
  seriesLinkId: null,
})

const activeRecordingCard = ({ recording, simNow }) => {
  const { channel, program } = recording
  const plausibleNumber = (n) => (n != null && n < 100 ? n : null)
  return {
    uuid: 'demo-active-recording',
    programId: program.program_id,
    hasImage: true,
    title: program.title,
    episodeTitle: program.episode_title || null,
    season: plausibleNumber(program.series_no),
    episode: plausibleNumber(program.episode_no),
    channelId: channel.id,
    channelName: channel.name,
    start: program.start,
    stop: program.end,
    startPadded: program.start - 2 * MINUTE_MS,
    stopPadded: program.end + 10 * MINUTE_MS,
    phase: 'programme',
    failed: false,
    statusText: 'Running',
    filesize: Math.max(0, simNow - program.start + 2 * MINUTE_MS) * 1_000,
    errors: 0,
    dataErrors: 0,
    bitsPerSecond: 8_200_000,
    signal: 92,
    signalUnit: '%',
    snr: 31.4,
    snrUnit: 'dB',
    continuityErrors: 0,
    transportErrors: 0,
    uncorrectedBlocks: 0,
    tuner: null,
  }
}

const demoFixtures = ({ simNow, recording }) => {
  const sqlTimeAgo = (minutes) => new Date(simNow - minutes * MINUTE_MS).toISOString().slice(0, 19).replace('T', ' ')
  const demoSync = ({ id, slot, status = 'ok', summary }) => ({
    id,
    started_at: sqlTimeAgo(LAST_SYNC_AGO_MIN + slot * SYNC_INTERVAL_MIN),
    finished_at: sqlTimeAgo(LAST_SYNC_AGO_MIN + slot * SYNC_INTERVAL_MIN - 1),
    status,
    summary_json: JSON.stringify(summary),
    summary,
  })
  const recordings = [
    { recording_id: '201', show_id: 1, title: 'Bluey - S03E12 - Family Meeting', season: 3, episode: 12, file_path: '/media/tv/Bluey (2018)/Season 3/Bluey - S03E12.ts', size: 734003200, status: 'done', error: null, imported_at: sqlTimeAgo(LAST_SYNC_AGO_MIN - 1), deleted_from_tvh_at: null, ad_status: 'cut', ad_breaks_json: '[{"start":63.4,"end":210.8}]', ad_processed_at: sqlTimeAgo(LAST_SYNC_AGO_MIN - 3), show_pattern: 'Bluey', show_dest_folder: 'Bluey (2018)', progress: null },
    { recording_id: '202', show_id: 1, title: 'Bluey - S03E11 - Whale Watching', season: 3, episode: 11, file_path: '/media/tv/Bluey (2018)/Season 3/Bluey - S03E11.ts', size: 712031232, status: 'done', error: null, imported_at: sqlTimeAgo(LAST_SYNC_AGO_MIN - 1), deleted_from_tvh_at: null, ad_status: 'detected', ad_breaks_json: '[{"start":63.4,"end":210.8},{"start":640.2,"end":770.6}]', ad_processed_at: sqlTimeAgo(LAST_SYNC_AGO_MIN - 3), show_pattern: 'Bluey', show_dest_folder: 'Bluey (2018)', progress: null },
    { recording_id: '203', show_id: 2, title: 'Gardening Australia - S15E20', season: 15, episode: 20, file_path: '/media/tv/Gardening Australia/Season 15/Gardening Australia - S15E20.ts', size: 2952790016, status: 'done', error: null, imported_at: sqlTimeAgo(LAST_SYNC_AGO_MIN + 4 * SYNC_INTERVAL_MIN - 1), deleted_from_tvh_at: sqlTimeAgo(LAST_SYNC_AGO_MIN + 4 * SYNC_INTERVAL_MIN - 2), ad_status: 'no_breaks', ad_breaks_json: null, ad_processed_at: sqlTimeAgo(LAST_SYNC_AGO_MIN + 4 * SYNC_INTERVAL_MIN - 2), show_pattern: 'Gardening Australia', show_dest_folder: 'Gardening Australia', progress: null },
    { recording_id: '204', show_id: 3, title: 'MasterChef Australia - S16E31', season: 16, episode: 31, file_path: null, size: null, status: 'importing', error: null, imported_at: null, deleted_from_tvh_at: null, ad_status: null, ad_breaks_json: null, ad_processed_at: null, show_pattern: 'MasterChef Australia', show_dest_folder: 'MasterChef Australia', progress: { phase: 'importing', percent: 47, etaSeconds: 72, etaLabel: '1m 12s', detail: '14.8 MB/s', startedAt: simNow - 2 * MINUTE_MS } },
    { recording_id: '205', show_id: 3, title: 'MasterChef Australia - S16E30', season: 16, episode: 30, file_path: '/media/tv/MasterChef Australia/Season 16/MasterChef Australia - S16E30.ts', size: 1288490188, status: 'partial', error: 'downloaded 1.20 GB of 2.10 GB; next sync resumes', imported_at: sqlTimeAgo(LAST_SYNC_AGO_MIN + 2 * SYNC_INTERVAL_MIN - 1), deleted_from_tvh_at: null, ad_status: null, ad_breaks_json: null, ad_processed_at: null, show_pattern: 'MasterChef Australia', show_dest_folder: 'MasterChef Australia', progress: null },
    { recording_id: '206', show_id: 1, title: 'Bluey - S03E10 - Onesies', season: 3, episode: 10, file_path: '/media/tv/Bluey (2018)/Season 3/Bluey - S03E10.ts', size: 698351616, status: 'done', error: null, imported_at: sqlTimeAgo(2 * 24 * 60), deleted_from_tvh_at: sqlTimeAgo(2 * 24 * 60 - 40), ad_status: 'cut', ad_breaks_json: '[{"start":58.0,"end":205.0}]', ad_processed_at: sqlTimeAgo(2 * 24 * 60 - 20), show_pattern: 'Bluey', show_dest_folder: 'Bluey (2018)', progress: null },
  ]
  return {
    syncStatus: {
      activeSyncId: null,
      cron: `*/${SYNC_INTERVAL_MIN} * * * *`,
      nextRunAt: new Date(simNow + (SYNC_INTERVAL_MIN - LAST_SYNC_AGO_MIN) * MINUTE_MS).toISOString(),
    },
    syncs: [
      demoSync({ id: 412, slot: 0, summary: { trigger: 'cron', imported: 2, skipped: 0, failed: 0, errors: [], plex: { triggered: true, status: 200 }, ads: { scanned: 2, detected: 1, cut: 1, failed: 0, adSeconds: 278 } } }),
      demoSync({ id: 411, slot: 1, summary: { trigger: 'cron', imported: 0, skipped: 0, failed: 0, errors: [] } }),
      demoSync({ id: 410, slot: 2, status: 'partial', summary: { trigger: 'manual', imported: 1, skipped: 0, failed: 1, errors: ['MasterChef Australia - S16E30: downloaded 1.20 GB of 2.10 GB; next sync resumes'], plex: { triggered: true, status: 200 } } }),
      demoSync({ id: 409, slot: 3, summary: { trigger: 'cron', imported: 0, skipped: 0, failed: 0, errors: [] } }),
      demoSync({ id: 408, slot: 4, summary: { trigger: 'cron', imported: 1, skipped: 0, failed: 0, errors: [], plex: { triggered: true, status: 200 }, delete: { triggered: true, removed: ['3f9c2a1b'] } } }),
    ],
    shows: [
      { id: 1, show_pattern: 'Bluey', dest_folder: 'Bluey (2018)', season_template: 'Season {season}', enabled: true, delete_after_import: false, created_at: '2026-07-01 09:12:00', ad_removal: 'cut' },
      { id: 2, show_pattern: 'Gardening Australia', dest_folder: 'Gardening Australia', season_template: 'Season {season}', enabled: true, delete_after_import: true, created_at: '2026-06-20 18:00:00', ad_removal: 'detect' },
      { id: 3, show_pattern: 'MasterChef Australia', dest_folder: 'MasterChef Australia', season_template: 'Season {season}', enabled: true, delete_after_import: false, created_at: '2026-06-11 20:30:00', ad_removal: 'off' },
    ],
    recordingsPage: { recordings, total: recordings.length, page: 1, pageSize: 50 },
    recordingNow: {
      active: recording ? [activeRecordingCard({ recording, simNow })] : [],
      journeys: [],
      fetchedAt: simNow,
    },
    doctor: doctorReport(simNow),
  }
}

const doctorCheck = (id, group, title, status, detail, extra = {}) => ({ id, group, title, status, detail, fix: '', doc: null, ...extra })

const doctorStamp = (ms) => {
  const d = new Date(ms)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const doctorReport = (simNow) => ({
  ranAt: new Date(simNow - 4_000).toISOString(),
  durationMs: 1_840,
  checks: [
    doctorCheck('tvh.reach', 'tvheadend', 'Connection', 'pass', `TVHeadend 4.3-2491 at ${SANITISED_SETTINGS.tvh_url}, API version 19.`),
    doctorCheck('tvh.auth', 'tvheadend', 'Login', 'pass', `Signed in as ${SANITISED_SETTINGS.tvh_username}.`),
    doctorCheck('tvh.rights', 'tvheadend', 'User rights', 'pass', `The ${SANITISED_SETTINGS.tvh_username} entry has the Admin and Video recorder rights.`),
    doctorCheck('tvh.tuners', 'tvheadend', 'Tuners', 'pass', '2 tuners: HDHomeRun FLEX DUO Tuner #0; HDHomeRun FLEX DUO Tuner #1.'),
    doctorCheck('tvh.channels', 'tvheadend', 'Channels', 'pass', '38 channels in TVHeadend.'),
    doctorCheck('guide.depth', 'guide', 'Guide depth', 'warn', `The guide runs 172 h ahead, to ${doctorStamp(simNow + 172 * 3_600_000)}. 3 of 38 channels have nothing in the next 24 h.`, {
      fix: 'Link the empty channels under Configuration → Channel/EPG → EPG Grabber Channels.',
      doc: 'guide/troubleshooting#empty-guide',
    }),
    doctorCheck('guide.logos', 'guide', 'Channel logos', 'pass', '38 of 38 channels have a TVHeadend icon.'),
    doctorCheck('paths.recordings', 'storage', 'Recordings folder', 'pass', `${SANITISED_SETTINGS.recordings_root} is readable.`),
    doctorCheck('paths.match', 'storage', 'TVHeadend recording path', 'pass', `TVHeadend and Freetvarr both use ${SANITISED_SETTINGS.tvh_recordings_path}.`),
    doctorCheck('paths.media', 'storage', 'Media folder', 'pass', `${SANITISED_SETTINGS.media_root} is writable.`),
    doctorCheck('paths.hardlink', 'storage', 'Hardlinks', 'pass', 'Recordings and media share a filesystem, so imports hardlink.'),
    doctorCheck('disk.free', 'storage', 'Free space', 'pass', `1452 GB free on ${SANITISED_SETTINGS.recordings_root} (41%); 1452 GB free on ${SANITISED_SETTINGS.media_root} (41%).`),
    doctorCheck('plex.reach', 'plex', 'Plex library', 'pass', `Section TV Shows reads ${SANITISED_SETTINGS.media_root}.`),
    doctorCheck('sync.health', 'plex', 'Syncs', 'pass', `Sync #412 finished ${doctorStamp(simNow - (LAST_SYNC_AGO_MIN - 1) * MINUTE_MS)}. Schedule: */${SYNC_INTERVAL_MIN} * * * *.`),
    doctorCheck('live.encoder', 'live', 'Live TV encoder', 'pass', 'Hardware encoding. VAAPI H.264 on /dev/dri/renderD128.'),
    doctorCheck('ads.comskip', 'host', 'Ad removal tools', 'pass', 'comskip, ffmpeg, and ffprobe are installed.'),
    doctorCheck('host.env', 'host', 'Time zone and network', 'pass', `Time zone ${TIMEZONE}; 192.168.1.20.`),
  ],
})

const favouriteIds = (channels) => {
  const existing = channels.filter((c) => c.pinned).map((c) => String(c.id))
  if (existing.length) return existing
  const visible = channels.filter((c) => !c.hidden)
  const matched = FAVOURITE_CHANNEL_PATTERNS.flatMap((re) => visible.filter((c) => re.test(c.name || '')).slice(0, 1))
  return [...new Set([...matched, ...visible].map((c) => String(c.id)))].slice(0, FAVOURITE_COUNT)
}

const markPinned = (pinIds) => (channel) => {
  const pinned = pinIds.includes(String(channel.id))
  return { ...channel, pinned, hidden: pinned ? false : channel.hidden }
}

const pinnedFirst = ({ items, pinIds }) => {
  const rank = (item) => {
    const i = pinIds.indexOf(String(item.id))
    return i === -1 ? pinIds.length : i
  }
  return [...items].sort((a, b) => rank(a) - rank(b))
}

const withFavouriteChannels = (data) => {
  const pinIds = favouriteIds(data.channels || [])
  return { ...data, channels: pinnedFirst({ items: (data.channels || []).map(markPinned(pinIds)), pinIds }) }
}

const maskSettings = (data) => {
  const masked = { ...data }
  for (const [key, value] of Object.entries(SANITISED_SETTINGS)) {
    if (masked[key]) masked[key] = value
  }
  return masked
}

const localMidnight = (ms) => {
  const midnight = new Date(ms)
  midnight.setHours(0, 0, 0, 0)
  return midnight.getTime()
}

const demoLiveTv = () => {
  let session = null
  const sessionView = () => session && {
    id: LIVE_SESSION_ID,
    channelId: session.channelId,
    status: Date.now() - session.startedAt < LIVE_TUNING_MS ? 'tuning' : 'live',
    reason: null,
    startedAt: session.startedAt,
    playlist: `/api/live/${LIVE_SESSION_ID}/index.m3u8`,
  }
  return async (route) => {
    const request = route.request()
    const { pathname } = new URL(request.url())
    if (request.method() === 'POST') {
      session = { channelId: String(request.postDataJSON()?.channel_id || ''), startedAt: Date.now() }
      return fulfillJson(route, { ok: true, session: sessionView(), shared: false, conflict: null })
    }
    if (request.method() === 'DELETE') {
      session = null
      return fulfillJson(route, { ok: true, left: true })
    }
    if (pathname.endsWith('/preflight')) {
      return fulfillJson(route, { ok: true, code: null, holders: [], conflict: null, session: sessionView() })
    }
    const file = pathname.split('/').pop()
    if (!session) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not found"}' })
    if (file === 'index.m3u8') return fulfillLivePlaylist({ route, liveSince: session.startedAt + LIVE_TUNING_MS })
    return route.fulfill({ path: join(LIVE_DEMO_DIR, file), contentType: 'video/mp4', headers: { 'Cache-Control': 'no-store' } })
  }
}

const fulfillLivePlaylist = async ({ route, liveSince }) => {
  const source = await readFile(join(LIVE_DEMO_DIR, 'index.m3u8'), 'utf8')
  const lines = source.split('\n')
  const segments = lines.flatMap((line, i) => line.startsWith('#EXTINF') ? [[line, lines[i + 1]]] : [])
  const header = lines.filter((line) => /^#EXT(M3U|-X-(VERSION|TARGETDURATION|MAP))/.test(line))
  const targetMs = Number(header.find((line) => line.startsWith('#EXT-X-TARGETDURATION')).split(':')[1]) * 1000
  const published = Math.min(segments.length, LIVE_WINDOW_SEGMENTS + Math.floor((Date.now() - liveSince) / targetMs))
  const body = [
    ...header,
    '#EXT-X-MEDIA-SEQUENCE:0',
    ...segments.slice(0, published).flat(),
    ...(published === segments.length ? ['#EXT-X-ENDLIST'] : []),
    '',
  ].join('\n')
  return route.fulfill({ status: 200, contentType: 'application/vnd.apple.mpegurl', headers: { 'Cache-Control': 'no-store' }, body })
}

const fulfillJson = (route, data) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(data),
})

const rewriteJson = (transform, fetchUrl = (url) => url) => async (route) => {
  const url = new URL(route.request().url())
  const response = await route.fetch({ url: fetchUrl(url).toString() })
  if (!response.ok()) return route.fulfill({ response })
  let data
  try {
    data = await response.json()
  } catch {
    return route.fulfill({ response })
  }
  return fulfillJson(route, transform(data, url))
}

const refuseWrites = (route) => {
  if (route.request().method() === 'GET') return route.fallback()
  console.log(`  blocked ${route.request().method()} ${new URL(route.request().url()).pathname}`)
  return fulfillJson(route, { ok: true })
}

const refuseUnknownGet = (route) => {
  console.log(`  refused unstubbed GET ${new URL(route.request().url()).pathname}`)
  return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
}
