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
  const library = await pickLibrary({ request: context.request, base, guide, simNow })
  const fixtures = demoFixtures({ simNow, recording: picks.recording, library })
  await context.clock.install({ time: simNow })
  await context.addInitScript((prefs) => {
    try {
      for (const [key, value] of Object.entries(prefs)) localStorage.setItem(key, value)
    } catch {}
  }, DEMO_PREFS)
  await context.addInitScript(keepRequestsRoutable)
  context.on('response', reportServerWrites)
  await context.route('**/api/**', refuseUnknownGet)
  await context.route('**/api/epg/logo/**', (route) => route.continue())
  await context.route('**/api/epg/image/**', (route) => route.continue())
  await context.route('**/api/csrf-token', (route) => route.continue())
  await context.route('**/api/version**', (route) => route.continue())
  await context.route('**/api/epg/guide**', rewriteJson(withSimulatedDay({ dayOffset, simNow }), shiftDay(dayOffset)))
  await context.route('**/api/epg/now**', (route) => fulfillJson(route, onNowAt({ guide, simNow, url: route.request().url() })))
  await context.route('**/api/epg/search**', rewriteJson(futureResults(simNow)))
  await context.route('**/api/epg/state**', rewriteJson(sanitiseState({ simNow, recording: picks.recording })))
  await context.route('**/api/settings', rewriteJson(maskSettings))
  await context.route('**/api/sync-status', (route) => fulfillJson(route, fixtures.syncStatus))
  await context.route('**/api/syncs**', (route) => fulfillJson(route, { syncs: fixtures.syncs }))
  await context.route('**/api/shows', (route) => fulfillJson(route, { shows: fixtures.shows }))
  await context.route('**/api/recordings**', (route) => fulfillJson(route, fixtures.recordingsPage))
  await context.route('**/api/recordings/*/image', recordingImage({ base, imageSources: fixtures.recordingImages }))
  await context.route('**/api/recording-now', (route) => fulfillJson(route, fixtures.recordingNow))
  await context.route('**/api/folder-suggest**', (route) => fulfillJson(route, { match: null, folders: [] }))
  await context.route('**/api/doctor**', (route) => fulfillJson(route, fixtures.doctor))
  await context.route('**/*', refuseWrites)
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

export const installCursor = (page) =>
  page.evaluate(() => {
    const c = document.createElement('div')
    c.id = '__wtc'
    c.style.cssText =
      'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;' +
      'transition:transform .6s cubic-bezier(.22,.61,.36,1);transform:translate(-80px,-80px)'
    c.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24">' +
      '<path d="M5 3 L5 19 L9.5 14.5 L12.5 21 L15 20 L12 13.5 L18.5 13.5 Z" ' +
      'fill="#fffcfb" stroke="#1a1611" stroke-width="1.3" stroke-linejoin="round"/></svg>'
    document.body.appendChild(c)
    window.__wt = {
      x: -80,
      y: -80,
      move(x, y) {
        this.x = x
        this.y = y
        c.style.transform = `translate(${x}px,${y}px)`
      },
      click() {
        const r = document.createElement('div')
        r.style.cssText =
          `position:fixed;left:${this.x}px;top:${this.y}px;width:10px;height:10px;` +
          'margin:-5px 0 0 -5px;border-radius:50%;border:2px solid #1eb6ff;' +
          'z-index:2147483646;pointer-events:none;opacity:.9;' +
          'transition:transform .5s ease-out,opacity .5s ease-out'
        document.body.appendChild(r)
        requestAnimationFrame(() => {
          r.style.transform = 'scale(4)'
          r.style.opacity = '0'
        })
        setTimeout(() => r.remove(), 600)
      },
    }
  })

export const cursorTo = async (page, x, y) => {
  await page.evaluate(([x, y]) => window.__wt?.move(x, y), [x, y])
  await page.waitForTimeout(680)
}

export const cursorToBox = async (page, locator) => {
  const box = await locator.boundingBox().catch(() => null)
  if (!box) return false
  await cursorTo(page, Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2))
  return true
}

export const clickWithCursor = async (page, locator) => {
  if (!(await cursorToBox(page, locator))) return false
  await page.waitForTimeout(180)
  await page.evaluate(() => window.__wt?.click())
  await locator.click()
  return true
}

export const glideScroll = (page, { selector = null, dx = 0, dy = 0, ms = SCROLL_MS }) =>
  page.evaluate(({ selector, dx, dy, ms }) => new Promise((resolve) => {
    const el = selector ? document.querySelector(selector) : document.scrollingElement
    if (!el) return resolve()
    const clamp = (v, max) => Math.max(0, Math.min(v, max))
    const from = { x: el.scrollLeft, y: el.scrollTop }
    const to = {
      x: clamp(from.x + dx, el.scrollWidth - el.clientWidth),
      y: clamp(from.y + dy, el.scrollHeight - el.clientHeight),
    }
    const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
    const startedAt = performance.now()
    const step = () => {
      const progress = Math.min(1, (performance.now() - startedAt) / ms)
      const eased = easeInOut(progress)
      el.scrollTo({
        left: from.x + (to.x - from.x) * eased,
        top: from.y + (to.y - from.y) * eased,
        behavior: 'instant',
      })
      if (progress < 1) requestAnimationFrame(step)
      else resolve()
    }
    requestAnimationFrame(step)
  }), { selector, dx, dy, ms })

const SCROLL_MS = 1600
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
  oneoff_root: '/media/one-offs',
  movies_root: '/media/movies',
}

const SHOW_PROFILES = [
  { delete_after_import: false, created_at: '2026-07-01 09:12:00' },
  { delete_after_import: true, created_at: '2026-06-20 18:00:00' },
  { delete_after_import: false, created_at: '2026-06-11 20:30:00' },
]
const LIBRARY_SHOW_COUNT = 3
const EPISODES_PER_SHOW = 2
const IMPORT_LAG_MIN = 5
const SPORT_TITLE = /sport|football|rugby|league|\bAFL\b|\bNRL\b|cricket|tennis|golf|racing|indycar|supercars|netball|soccer|motogp|formula|grand prix/i
const NEWSY_TITLE = /news|today|sunrise|weather|update|bundle|offer|skincare|shopping/i
const GENERIC_EPISODE_TITLE = /^(episode \d+|(mon|tues|wednes|thurs|fri|satur|sun)day\b)/i
const BYTES_PER_SECOND = 920_000
const AD_FREE_NETWORKS = ['ABC']

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

const pickLibrary = async ({ request, base, guide, simNow }) => {
  const aired = airedWithImage({ guide, simNow })
  const served = servedImageCheck({ request, base })
  const episodeGroups = spreadAcrossNetworks(groupByTitle(aired.filter(({ program }) => isEpisode(program))))
  const episodes = []
  const shows = []
  for (const group of episodeGroups) {
    if (shows.length === LIBRARY_SHOW_COUNT) break
    const picked = await firstServed({ entries: group, served, count: EPISODES_PER_SHOW })
    if (!picked.length) continue
    shows.push({ title: picked[0].program.title, channel: picked[0].channel })
    const importing = shows.length === LIBRARY_SHOW_COUNT
    episodes.push(...picked.map((entry, i) => ({ ...entry, show: picked[0].program.title, importing: importing && i === 0 })))
  }
  const unclaimed = aired.filter(({ program }) => !shows.some((show) => show.title === program.title) && !isNewsy(program))
  const [sport] = await firstServed({ entries: unclaimed.filter(({ program }) => isSport(program)), served, count: 1 })
  const others = unclaimed.filter(({ program }) => program.title !== sport?.program.title && !isSport(program))
  const [unimported] = await firstServed({ entries: rankOneOffs(others), served, count: 1 })
  if (shows.length < LIBRARY_SHOW_COUNT) throw new Error(`only ${shows.length} shows with aired episodes before the simulated time`)
  return {
    shows,
    rows: [
      ...episodes,
      ...(sport ? [{ ...sport, show: null, oneOff: true }] : []),
      ...(unimported ? [{ ...unimported, show: null, unimported: true }] : []),
    ],
  }
}

const airedWithImage = ({ guide, simNow }) => {
  const importedBy = simNow - (LAST_SYNC_AGO_MIN + IMPORT_LAG_MIN) * MINUTE_MS
  return visibleChannels(guide)
    .flatMap((channel) => programsOf(guide, channel)
      .filter((program) => program.has_image && program.end <= importedBy)
      .map((program) => ({ channel, program })))
    .sort((a, b) => b.program.end - a.program.end)
}

const groupByTitle = (entries) => {
  const groups = new Map()
  for (const entry of entries) {
    const key = entry.program.title
    const episodeKey = `${entry.program.series_no}x${entry.program.episode_no}`
    const group = groups.get(key) ?? []
    if (group.length && group[0].channel.id !== entry.channel.id) continue
    if (!group.some((e) => `${e.program.series_no}x${e.program.episode_no}` === episodeKey)) group.push(entry)
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => groupScore(b) - groupScore(a)
    || b.length - a.length
    || b[0].program.end - a[0].program.end)
}

const spreadAcrossNetworks = (groups) => {
  const seen = new Set()
  const firsts = []
  const rest = []
  for (const group of groups) {
    const network = networkOf(group[0].channel)
    if (seen.has(network)) rest.push(group)
    else firsts.push(group)
    seen.add(network)
  }
  return [...firsts, ...rest]
}

const networkOf = (channel) => (channel.name || '').match(/^(ABC|SBS|NITV|7|9|10)/i)?.[1].toUpperCase() ?? channel.name

const groupScore = (group) => {
  const onFavourite = group.some(({ channel }) => channel.pinned)
  const named = group.every(({ program }) => program.episode_title && !GENERIC_EPISODE_TITLE.test(program.episode_title))
  return (onFavourite ? 2 : 0) + (named ? 1 : 0)
}

const rankOneOffs = (entries) => [
  ...entries.filter(({ program }) => program.series_no == null),
  ...entries.filter(({ program }) => program.series_no != null),
]

const isEpisode = (program) => program.series_no != null && program.series_no < 100
  && program.episode_no != null && !isNewsy(program) && !isSport(program)

const isSport = (program) => SPORT_TITLE.test(program.title || '')

const isNewsy = (program) => NEWSY_TITLE.test(program.title || '')

const servedImageCheck = ({ request, base }) => {
  const cache = new Map()
  return (program) => {
    if (!cache.has(program.program_id)) {
      cache.set(program.program_id, request.get(`${base}/api/epg/image/${encodeURIComponent(program.program_id)}`)
        .then((response) => response.ok() && (response.headers()['content-type'] || '').startsWith('image/'))
        .catch(() => false))
    }
    return cache.get(program.program_id)
  }
}

const firstServed = async ({ entries, served, count }) => {
  const picked = []
  for (const entry of entries) {
    if (picked.length === count) break
    if (await served(entry.program)) picked.push(entry)
  }
  return picked
}

const libraryRecording = ({ row, index, shows, simNow }) => {
  const { channel, program } = row
  const show = shows.find((s) => s.show_pattern === row.show) ?? null
  const durationS = Math.round((program.end - program.start) / 1000)
  const size = Math.round(durationS * BYTES_PER_SECOND * (0.94 + (index % 4) * 0.03))
  const episodeTitle = GENERIC_EPISODE_TITLE.test(program.episode_title || '') ? null : program.episode_title || null
  const importedAt = importSlotAfter({ end: program.end, simNow })
  const status = rowStatus(row)
  const tombstone = status === 'done' && show?.delete_after_import
  const base = {
    recording_id: `demo-${program.program_id}`,
    show_id: show?.id ?? null,
    title: program.title,
    episode_title: episodeTitle,
    season: row.show ? program.series_no : null,
    episode: row.show ? program.episode_no : null,
    channel_id: channel.id,
    channel_name: channel.name,
    aired_at: program.start,
    duration_s: durationS,
    image_path: `artwork/demo-${program.program_id}.jpg`,
    file_path: libraryPath({ program, show }),
    size,
    status,
    error: null,
    imported_at: status === 'done' ? sqlTime(importedAt) : null,
    deleted_from_tvh_at: tombstone ? sqlTime(importedAt + 2 * MINUTE_MS) : null,
    show_pattern: show?.show_pattern ?? null,
    show_dest_folder: show?.dest_folder ?? null,
    playable: true,
    playback_position_s: null,
    progress: null,
    ...adFields({ show, status, durationS, importedAt }),
  }
  if (status === 'importing') {
    return { ...base, file_path: null, progress: { phase: 'importing', percent: 47, etaSeconds: 72, etaLabel: '1m 12s', detail: null, startedAt: simNow - 2 * MINUTE_MS } }
  }
  if (status === 'not_imported') return { ...base, file_path: null, size }
  if (index === 0) return { ...base, playback_position_s: Math.round(durationS * 0.38) }
  return base
}

const serverOrder = (recordings) => [...recordings].sort((a, b) =>
  Number(Boolean(a.deleted_from_tvh_at)) - Number(Boolean(b.deleted_from_tvh_at))
  || (b.imported_at ?? '').localeCompare(a.imported_at ?? ''))

const rowStatus = (row) => {
  if (row.unimported) return 'not_imported'
  if (row.importing) return 'importing'
  return 'done'
}

const adFields = ({ show, status, durationS, importedAt }) => {
  if (status !== 'done' || !show || show.ad_removal === 'off') {
    return { ad_status: null, ad_breaks_json: null, ad_processed_at: null }
  }
  const breaks = adBreaks(durationS)
  return {
    ad_status: show.ad_removal === 'cut' ? 'cut' : 'detected',
    ad_breaks_json: JSON.stringify(breaks),
    ad_processed_at: sqlTime(importedAt + 3 * MINUTE_MS),
  }
}

const adBreaks = (durationS) => {
  const count = Math.max(1, Math.floor(durationS / 900))
  return Array.from({ length: count }, (_, i) => {
    const start = Math.round(((i + 1) * durationS) / (count + 1))
    return { start, end: start + 150 + (i % 2) * 45 }
  })
}

const importSlotAfter = ({ end, simNow }) => {
  const lastSync = simNow - LAST_SYNC_AGO_MIN * MINUTE_MS
  const slotsBack = Math.floor((lastSync - end - IMPORT_LAG_MIN * MINUTE_MS) / (SYNC_INTERVAL_MIN * MINUTE_MS))
  return lastSync - Math.max(0, slotsBack) * SYNC_INTERVAL_MIN * MINUTE_MS + MINUTE_MS
}

const libraryPath = ({ program, show }) => {
  if (!show) return `${SANITISED_SETTINGS.oneoff_root}/${program.title}/${program.title}.ts`
  const se = seasonEpisode(program)
  return `${SANITISED_SETTINGS.media_root}/${show.dest_folder}/Season ${program.series_no}/${show.dest_folder} - ${se}.ts`
}

const seasonEpisode = (program) => `S${String(program.series_no).padStart(2, '0')}E${String(program.episode_no).padStart(2, '0')}`

const recordingLabel = (recording) => (recording.season != null
  ? `${recording.title} - ${seasonEpisode({ series_no: recording.season, episode_no: recording.episode })}`
  : recording.title)

const sqlTime = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ')

const recordingImage = ({ base, imageSources }) => async (route) => {
  const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2))
  const programId = imageSources.get(id)
  if (programId == null) return route.fulfill({ status: 404, body: '' })
  const response = await route.fetch({ url: `${base}/api/epg/image/${encodeURIComponent(programId)}` })
  return route.fulfill({ response })
}

export const keepRequestsRoutable = () => {
  const fetchRoutable = window.fetch.bind(window)
  window.fetch = (input, init) => fetchRoutable(input, init?.keepalive ? { ...init, keepalive: false } : init)
  navigator.sendBeacon = () => true
}

export const isServerWrite = (response) => {
  const method = response.request().method()
  if (method === 'GET' || method === 'HEAD') return false
  return Boolean(response.headers()['x-freetvarr-build'])
}

export const reportServerWrites = (response) => {
  if (!isServerWrite(response)) return
  const request = response.request()
  console.log(`  SERVER WRITE ${request.method()} ${new URL(request.url()).pathname}`)
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

const demoFixtures = ({ simNow, recording, library }) => {
  const sqlTimeAgo = (minutes) => sqlTime(simNow - minutes * MINUTE_MS)
  const demoSync = ({ id, slot, status = 'ok', summary }) => ({
    id,
    started_at: sqlTimeAgo(LAST_SYNC_AGO_MIN + slot * SYNC_INTERVAL_MIN),
    finished_at: sqlTimeAgo(LAST_SYNC_AGO_MIN + slot * SYNC_INTERVAL_MIN - 1),
    status,
    summary_json: JSON.stringify(summary),
    summary,
  })
  const adModes = ['cut', 'detect', 'off']
  const shows = library.shows.map(({ title, channel }, i) => {
    const profile = SHOW_PROFILES[i % SHOW_PROFILES.length]
    const adFree = AD_FREE_NETWORKS.includes(networkOf(channel))
    return {
      id: i + 1,
      show_pattern: title,
      dest_folder: title,
      season_template: 'Season {season}',
      enabled: true,
      ...profile,
      ad_removal: adFree ? 'off' : adModes.shift(),
    }
  })
  const recordings = serverOrder(library.rows.map((row, i) => libraryRecording({ row, index: i, shows, simNow })))
  const partialLabel = recordingLabel(recordings.find((r) => r.status === 'importing') ?? recordings[0])
  return {
    recordingImages: new Map(library.rows.map((row) => [`demo-${row.program.program_id}`, row.program.program_id])),
    syncStatus: {
      activeSyncId: null,
      cron: `*/${SYNC_INTERVAL_MIN} * * * *`,
      nextRunAt: new Date(simNow + (SYNC_INTERVAL_MIN - LAST_SYNC_AGO_MIN) * MINUTE_MS).toISOString(),
    },
    syncs: [
      demoSync({ id: 412, slot: 0, summary: { trigger: 'cron', imported: 2, skipped: 0, failed: 0, errors: [], plex: { triggered: true, status: 200 }, ads: { scanned: 2, detected: 1, cut: 1, failed: 0, adSeconds: 278 } } }),
      demoSync({ id: 411, slot: 1, summary: { trigger: 'cron', imported: 0, skipped: 0, failed: 0, errors: [] } }),
      demoSync({ id: 410, slot: 2, status: 'partial', summary: { trigger: 'manual', imported: 1, skipped: 0, failed: 1, errors: [`${partialLabel}: downloaded 1.20 GB of 2.10 GB; next sync resumes`], plex: { triggered: true, status: 200 } } }),
      demoSync({ id: 409, slot: 3, summary: { trigger: 'cron', imported: 0, skipped: 0, failed: 0, errors: [] } }),
      demoSync({ id: 408, slot: 4, summary: { trigger: 'cron', imported: 1, skipped: 0, failed: 0, errors: [], plex: { triggered: true, status: 200 }, delete: { triggered: true, removed: ['3f9c2a1b'] } } }),
    ],
    shows,
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
    if (request.method() === 'POST' && pathname.endsWith('/hold')) return fulfillJson(route, { ok: true })
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

export const fulfillJson = (route, data) => route.fulfill({
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

export const refuseWrites = (route) => {
  if (route.request().method() === 'GET') return route.fallback()
  console.log(`  blocked ${route.request().method()} ${new URL(route.request().url()).pathname}`)
  return fulfillJson(route, { ok: true })
}

export const refuseUnknownGet = (route) => {
  console.log(`  refused unstubbed GET ${new URL(route.request().url()).pathname}`)
  return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
}
