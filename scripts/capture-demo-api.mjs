import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const TIMEZONE = process.env.TZ || 'Australia/Sydney'

export const simulatedNow = () => {
  const offset = Number(process.env.CAPTURE_CLOCK_OFFSET_MS)
  if (Number.isFinite(offset) && offset !== 0) return Date.now() + offset
  const forced = Date.parse(process.env.SIMULATED_NOW || '')
  if (Number.isFinite(forced)) return forced
  const tonight = new Date()
  tonight.setHours(PRIME_TIME.hour, PRIME_TIME.minute, 0, 0)
  if (tonight.getTime() > Date.now()) return tonight.getTime()
  tonight.setDate(tonight.getDate() + 1)
  return tonight.getTime()
}

export const prepareDemoContext = async ({ context, base, simNow }) => {
  const guide = withLiveDemoSlot(simNow)(await fetchJson({ request: context.request, url: `${base}/api/epg/guide?day=0` }))
  const picks = await pickShowcase({ request: context.request, base, guide, simNow })
  const fixtures = demoFixtures({ simNow, picks })
  const desk = createRecordingDesk({ guide, simNow })
  await context.clock.install({ time: simNow })
  await context.addInitScript(({ local, session }) => {
    try {
      for (const [key, value] of Object.entries(local)) localStorage.setItem(key, value)
      for (const [key, value] of Object.entries(session)) sessionStorage.setItem(key, value)
    } catch {}
  }, { local: DEMO_PREFS, session: DEMO_SESSION_PREFS })
  await context.addInitScript(keepRequestsRoutable)
  context.on('response', reportServerWrites)
  await context.route('**/*', refuseWrites)
  await context.route('**/api/**', passThroughRead)
  await context.route('**/api/epg/guide**', rewriteJson(withLiveDemoSlot(simNow)))
  await context.route('**/api/epg/now**', rewriteJson(withLiveDemoNow(simNow)))
  await context.route('**/api/epg/channel-now**', rewriteJson(withLiveDemoChannelNow({ guide, simNow })))
  await context.route('**/api/epg/state**', rewriteJson((data) => desk.applyTo(withActiveRecording({ data, simNow, recording: picks.recording }))))
  await context.route('**/api/settings', rewriteJson(maskSettings))
  await context.route(/\/api\/sync-status(\?|$)/, (route) => fulfillJson(route, fixtures.syncStatus))
  await context.route(/\/api\/recording-now(\?|$)/, (route) => fulfillJson(route, fixtures.recordingNow))
  await context.route(/\/api\/activity(\?|$)/, (route) => fulfillJson(route, fixtures.activity))
  await context.route(/\/api\/activity\/summary(\?|$)/, (route) => fulfillJson(route, { running: fixtures.activity.runningCount }))
  await context.route('**/api/activity/stream', (route) => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: `event: jobs\ndata: ${JSON.stringify(jobsOf(fixtures.activity))}\n\n`,
  }))
  await context.route(/\/api\/health-summary(\?|$)/, (route) => fulfillJson(route, fixtures.healthSummary))
  await context.route('**/api/doctor**', (route) => fulfillJson(route, fixtures.doctor))
  await context.route(/\/api\/plex\/whole-library(\?|$)/, (route) => fulfillJson(route, fixtures.wholeLibrary))
  await context.route(/\/api\/plex\/watch-sync(\?|$)/, (route) => fulfillJson(route, fixtures.watchSync))
  await context.route(/\/api\/arr(\?|$)/, (route) => fulfillJson(route, fixtures.arr))
  await context.route('**/api/arr/*/test', (route) => fulfillJson(route, fixtures.arrTest(route.request().url())))
  await context.route('**/api/live/tuner-status', (route) => fulfillJson(route, fixtures.tunerStatus))
  await context.route('**/api/library/items/*/image**', plexItemImage({ base }))
  await context.route('**/api/tv-login', (route) => fulfillJson(route, {}))
  await context.route('**/api/library/delete/preview', (route) => route.continue())
  await context.route('**/api/tvh-guide/links', (route) => fulfillJson(route, demoGuideLinks(guide)))
  await context.route(/\/api\/live(\/|\?|$)(?!tuner-status)/, demoLiveTv())
  await context.route('**/api/epg/record', desk.recordOneOff)
  await context.route('**/api/epg/record-series', desk.recordSeries)
  return picks
}

export const onAirCell = (page, { program }) => page.locator('.epg-cell.is-now, .epg-cell.on-now')
  .filter({ hasText: program.title })
  .first()

export const waitForProgrammeImages = (page) => page.waitForFunction(() => [...document.querySelectorAll('img')]
  .filter((img) => {
    const box = img.getBoundingClientRect()
    return box.width > 0 && box.bottom > 0 && box.top < window.innerHeight && box.right > 0 && box.left < window.innerWidth
  })
  .every((img) => img.complete), null, { timeout: 15_000 })
  .catch(() => console.log('  images still loading'))

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
          'margin:-5px 0 0 -5px;border-radius:50%;border:2px solid #5ee0c5;' +
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
  await page.mouse.move(-1, -1)
  await page.evaluate(([x, y]) => window.__wt?.move(x, y), [x, y])
  await page.waitForTimeout(680)
  await page.mouse.move(x, y)
}

export const cursorToBox = async (page, locator) => {
  const box = await locator.boundingBox().catch(() => null)
  if (!box) return false
  await cursorTo(page, Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2))
  return true
}

export const clickWithCursor = async (page, locator, { dwellMs = 180 } = {}) => {
  if (!(await cursorToBox(page, locator))) return false
  await page.waitForTimeout(dwellMs)
  await page.evaluate(() => window.__wt?.click())
  await locator.click()
  return true
}

export const clickTab = async (page, route) => {
  const link = page.locator(`a.app-nav-item[href="#/${route}"]:visible`).first()
  await cursorToBox(page, link)
  await page.waitForTimeout(220)
  await page.evaluate(() => window.__wt?.click())
  await Promise.all([
    page.waitForFunction(
      (r) => [...document.querySelectorAll(`a.app-nav-item[href="#/${r}"]`)].some((a) => a.getAttribute('aria-current') === 'page'),
      route,
      { timeout: 8000 },
    ).catch(() => {}),
    link.click(),
  ])
  await page.waitForTimeout(VIEW_REVEAL_MS)
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

export const keepRequestsRoutable = () => {
  const fetchRoutable = window.fetch.bind(window)
  window.fetch = (input, init) => fetchRoutable(input, init?.keepalive ? { ...init, keepalive: false } : init)
  navigator.sendBeacon = () => true
}

const READ_ONLY_POSTS = ['/api/library/delete/preview']

export const isServerWrite = (response) => {
  const method = response.request().method()
  if (method === 'GET' || method === 'HEAD') return false
  if (READ_ONLY_POSTS.includes(new URL(response.url()).pathname)) return false
  return Boolean(response.headers()['x-freetvarr-build'])
}

export const reportServerWrites = (response) => {
  if (!isServerWrite(response)) return
  const request = response.request()
  console.log(`  SERVER WRITE ${request.method()} ${new URL(request.url()).pathname}`)
}

export const fulfillJson = (route, data) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(data),
})

export const refuseWrites = (route) => {
  if (['GET', 'HEAD'].includes(route.request().method())) return route.fallback()
  console.log(`  blocked ${route.request().method()} ${new URL(route.request().url()).pathname}`)
  return fulfillJson(route, { ok: true })
}

export const refuseUnknownGet = (route) => {
  console.log(`  refused unstubbed GET ${new URL(route.request().url()).pathname}`)
  return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
}

const SCROLL_MS = 1600
const VIEW_REVEAL_MS = 850
const PRIME_TIME = { hour: 19, minute: 45 }
const LIVE_DEMO_DIR = process.env.LIVE_DEMO_DIR || '/work/scripts/.cache/live-demo'
const PATH_ROOT = process.env.CAPTURE_PATH_ROOT || ''
const SHOWN_PATH_ROOT = '/data'
const LIVE_SESSION_ID = 'demo-live'
const LIVE_TUNING_MS = 2_600
const LIVE_WINDOW_SEGMENTS = 3
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const SYNC_INTERVAL_MIN = 30
const LAST_SYNC_AGO_MIN = 16
const SEARCH_TITLE_MAX = 24
const TUNER_NAMES = ['HDHomeRun DVB-T Tuner #0', 'HDHomeRun DVB-T Tuner #1', 'HDHomeRun DVB-T Tuner #2', 'HDHomeRun DVB-T Tuner #3']
const LIVE_DEMO_CHANNEL_PATTERN = /^7mate\b/i
const LIVE_DEMO_CHANNEL_NAME = '7mate'
const LIVE_DEMO_PROGRAMME = {
  title: 'Big Wave Season',
  episode_title: 'Winter Swell',
  synopsis: 'Surfers and photographers follow a run of winter swells along the east coast, from dawn glassy sessions to heavy afternoon sets.',
  series_no: null,
  episode_no: null,
  genre: null,
  kind: 'series',
  has_image: false,
  classification: 'PG',
}
const DEMO_PREFS = {
  'freetvarr.guideZoom': 'm',
  'freetvarr.guideImages': '1',
  'freetvarr.liveImages': '1',
  'freetvarr.liveFavouritesOnly': '0',
}
const DEMO_SESSION_PREFS = { 'freetvarr.introPlayed': '1' }
const SANITISED_SETTINGS = {
  tvh_url: 'http://192.168.1.50:9981',
  tvh_username: 'freetvarr',
  recordings_root: '/data/media/recordings',
  tvh_recordings_path: '/recordings',
  plex_url: 'http://192.168.1.100:32400',
  plex_prefs_path: '/plex-preferences.xml',
  media_root: '/data/media/tv',
  oneoff_root: '/data/media/one-offs',
  movies_root: '/data/media/movies',
  sync_cron: '*/30 * * * *',
  sync_cron_effective: '*/30 * * * *',
}

const fetchJson = async ({ request, url }) => {
  const response = await request.get(url)
  if (!response.ok()) throw new Error(`${url} failed: HTTP ${response.status()}`)
  return response.json()
}

const pickShowcase = async ({ request, base, guide, simNow }) => {
  const onAir = await withServedImage({ request, base, entries: onAirWithImage({ guide, simNow }) })
  const pinned = onAir.filter(({ channel }) => channel.pinned)
  const [programme, recording] = [...pinned, ...onAir.filter(({ channel }) => !channel.pinned)]
  if (!programme) throw new Error('no on-air programme with an image at the simulated time')
  return {
    programme,
    recording: recording ?? null,
    upNext: upNextOf({ guide, simNow, fits: (p) => p.kind === 'series' && p.series_no != null && p.episode_no != null }),
    upNextFilm: upNextOf({ guide, simNow, fits: (p) => p.kind === 'movie' && p.movieChoice }),
    searchTerm: upNextTitle({ guide, simNow }),
    guide,
  }
}

const upNextOf = ({ guide, simNow, fits }) => {
  const channels = visibleChannels(guide)
  return [...channels.filter((c) => c.pinned), ...channels.filter((c) => !c.pinned)]
    .flatMap((channel) => programsOf(guide, channel)
      .filter((p) => p.start > simNow && p.start < simNow + 3 * HOUR_MS && p.has_image && fits(p))
      .slice(0, 1)
      .map((program) => ({ channel, program })))[0] ?? null
}

const onAirWithImage = ({ guide, simNow }) => visibleChannels(guide).flatMap((channel) => {
  const program = programsOf(guide, channel).find((p) => airsAt(p, simNow) && p.has_image && p.kind !== 'movie')
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

const nowAndNext = (programs, ms) => ({
  now: programs.find((p) => airsAt(p, ms)) || null,
  next: programs.filter((p) => p.start > ms).sort((a, b) => a.start - b.start)[0] || null,
})

const isLiveDemoChannel = (channel) => LIVE_DEMO_CHANNEL_PATTERN.test(channel?.name || '')

const liveDemoProgramme = (program) => ({ ...program, ...LIVE_DEMO_PROGRAMME, series_link: `${program.channel_id}|big wave season` })

const withLiveDemoSlot = (simNow) => (data) => {
  const channel = (data.channels || []).find(isLiveDemoChannel)
  if (!channel) return data
  const programs = (data.programs?.[channel.id] || []).map((p) => (airsAt(p, simNow) ? liveDemoProgramme(p) : p))
  return {
    ...data,
    channels: data.channels.map((c) => (c === channel ? { ...c, name: LIVE_DEMO_CHANNEL_NAME } : c)),
    programs: { ...data.programs, [channel.id]: programs },
  }
}

const withLiveDemoNow = (simNow) => (data) => ({
  ...data,
  ...(data.channels ? { channels: data.channels.map((c) => (isLiveDemoChannel(c) ? { ...c, name: LIVE_DEMO_CHANNEL_NAME } : c)) } : {}),
  entries: (data.entries || []).map((entry) => (isLiveDemoChannel(entry.channel)
    ? {
      ...entry,
      channel: { ...entry.channel, name: LIVE_DEMO_CHANNEL_NAME },
      now: entry.now && airsAt(entry.now, simNow) ? liveDemoProgramme(entry.now) : entry.now,
    }
    : entry)),
})

const withLiveDemoChannelNow = ({ guide, simNow }) => (data, url) => {
  const channel = (guide.channels || []).find((c) => String(c.id) === url.searchParams.get('channel'))
  if (!isLiveDemoChannel(channel) && channel?.name !== LIVE_DEMO_CHANNEL_NAME) return data
  return { ...data, now: data.now && airsAt(data.now, simNow) ? liveDemoProgramme(data.now) : data.now }
}

const withActiveRecording = ({ data, simNow, recording }) => {
  if (!recording) return data
  return {
    ...data,
    futureRecordings: [...(data.futureRecordings || []), scheduledEntry(recording)],
    activeRecordingIds: [...(data.activeRecordingIds || []), String(recording.program.program_id)],
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
  startPadded: program.start - 2 * MINUTE_MS,
  stopPadded: program.end + 10 * MINUTE_MS,
  schedStatus: 'recording',
  statusText: 'Running',
  filename: null,
  pendingDelete: false,
  seriesLinkId: null,
})

const createRecordingDesk = ({ guide, simNow }) => {
  const entries = []
  const seriesTags = []
  const answer = (handler) => (route) => {
    const body = route.request().postDataJSON() || {}
    const channel = (guide.channels || []).find((c) => String(c.id) === String(body.channel_id))
    const program = programsOf(guide, { id: body.channel_id }).find((p) => String(p.program_id) === String(body.program_id))
    if (!channel || !program) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not found"}' })
    return fulfillJson(route, handler({ body, channel, program }))
  }
  const recordOneOff = answer(({ channel, program }) => {
    const uuid = `demo-desk-${program.program_id}`
    entries.push(deskEntry({ channel, program, uuid, seriesLinkId: null, simNow }))
    return { ok: true, uuid }
  })
  const recordSeries = answer(({ body, channel, program }) => {
    const uuid = `demo-desk-${program.program_id}`
    entries.push(deskEntry({ channel, program, uuid, seriesLinkId: body.series_link, simNow }))
    seriesTags.push({
      id: `demo-desk-series-${seriesTags.length}`,
      seriesLinkId: body.series_link,
      name: program.title,
      channelId: channel.id,
      enabled: true,
      leadTime: 2,
      lagTime: 10,
      episodesToKeep: 0,
      imageProgramId: program.program_id,
    })
    return { ok: true, uuid, title: program.title, showRule: null }
  })
  const applyTo = (state) => ({
    ...state,
    futureRecordings: [...(state.futureRecordings || []), ...entries],
    upcomingRecordings: [...(state.upcomingRecordings || []), ...entries.filter((e) => e.schedStatus === 'scheduled')],
    seriesTags: [...(state.seriesTags || []), ...seriesTags],
    activeRecordingIds: [
      ...(state.activeRecordingIds || []),
      ...entries.filter((e) => e.schedStatus === 'recording').map((e) => String(e.programId)),
    ],
  })
  return { recordOneOff, recordSeries, applyTo }
}

const deskEntry = ({ channel, program, uuid, seriesLinkId, simNow }) => {
  const onAir = airsAt(program, simNow)
  return {
    ...scheduledEntry({ channel, program }),
    uuid,
    schedStatus: onAir ? 'recording' : 'scheduled',
    statusText: onAir ? 'Running' : 'Scheduled for recording',
    seriesLinkId,
  }
}

const activeRecordingCard = ({ recording, simNow }) => {
  const { channel, program } = recording
  const plausibleNumber = (n) => (n != null && n < 100 ? n : null)
  return {
    uuid: 'demo-active-recording',
    programId: program.program_id,
    autorecId: null,
    recordingSince: program.start - 2 * MINUTE_MS,
    hasImage: true,
    title: program.title,
    episodeTitle: program.episode_title || null,
    season: plausibleNumber(program.series_no),
    episode: plausibleNumber(program.episode_no),
    channelId: channel.id,
    channelName: channel.name,
    genres: [],
    dvrUuid: 'demo-active-recording',
    canPlayFromStart: true,
    recordingStartedAt: program.start - 2 * MINUTE_MS,
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
    tuner: TUNER_NAMES[1],
  }
}

const demoFixtures = ({ simNow, picks }) => {
  const active = picks.recording ? [activeRecordingCard({ recording: picks.recording, simNow })] : []
  const activity = demoActivity({ simNow, active, picks })
  return {
    recordingNow: { active, journeys: [], finishing: [], fetchedAt: simNow },
    syncStatus: {
      activeSyncId: null,
      cron: `*/${SYNC_INTERVAL_MIN} * * * *`,
      nextRunAt: new Date(simNow + (SYNC_INTERVAL_MIN - LAST_SYNC_AGO_MIN) * MINUTE_MS).toISOString(),
    },
    activity,
    healthSummary: {
      level: 'ok',
      sentence: null,
      sources: {
        doctor: { ranAt: new Date(simNow - 2 * HOUR_MS).toISOString(), summary: { pass: 19, warn: 0, fail: 0, skip: 0 } },
        tvheadend: 'ok',
        lastSync: {
          id: 336,
          status: 'ok',
          finishedAt: new Date(simNow - (LAST_SYNC_AGO_MIN - 1) * MINUTE_MS).toISOString().slice(0, 19).replace('T', ' '),
          summary: { trigger: 'cron', imported: 2, skipped: 14, failed: 0, errors: [], items: [], steps: { list: 640, imports: 2700, libraryCheck: 90 } },
        },
        syncRunning: false,
        recentFailures: 0,
      },
      counts: { importedLast7Days: 14, failedLast24Hours: 0, syncs: 336 },
      storage: [{ key: 'recordings', path: SANITISED_SETTINGS.recordings_root, total: 3_925_264_318_464, free: 2_129_770_651_648 }],
      checkedAt: new Date(simNow - MINUTE_MS).toISOString(),
    },
    doctor: doctorReport(simNow),
    wholeLibrary: {
      enabled: true,
      sectionIds: ['2', '1'],
      sections: [{ id: '1', title: 'Movies', type: 'movie' }, { id: '2', title: 'TV Shows', type: 'show' }, { id: '5', title: 'One-offs', type: 'movie' }],
      itemCount: 1043,
    },
    watchSync: {
      configured: true,
      fromPlex: true,
      toPlex: true,
      running: false,
      lastRunAt: simNow - 6 * MINUTE_MS,
      lastFullAt: simNow - 3 * HOUR_MS,
      matched: 58,
      unmatched: 0,
      ambiguous: 0,
      error: null,
      errorKind: null,
      lastErrorAt: null,
      nextAttemptAt: null,
    },
    arr: {
      sonarr: { url: 'http://192.168.1.100:8989', hasKey: true, keySource: 'config.xml', configFound: true },
      radarr: { url: 'http://192.168.1.100:7878', hasKey: true, keySource: 'config.xml', configFound: true },
      unmonitorOnDelete: true,
    },
    arrTest: (url) => (url.includes('/sonarr/')
      ? { ok: true, version: '4.0.15.2941', count: 186, recycleBin: '/data/media/.recycle' }
      : { ok: true, version: '5.26.2.10099', count: 412, recycleBin: '/data/media/.recycle' }),
    tunerStatus: tunerStatus({ active }),
  }
}

const tunerStatus = ({ active }) => {
  const names = TUNER_NAMES
  const tuners = names.map((name, i) => {
    const recording = active[i - 1]
    return recording
      ? { name, inUseBy: `Recording ${recording.title}`, label: `Recording ${recording.title}` }
      : { name, inUseBy: null, label: 'Free' }
  })
  const inUse = tuners.filter((t) => t.inUseBy).length
  return { configured: true, total: tuners.length, inUse, recording: inUse, free: tuners.length - inUse, tuners }
}

const demoActivity = ({ simNow, active, picks }) => {
  const at = (minutesAgo) => simNow - minutesAgo * MINUTE_MS
  const done = ({ id, kind, title, minutesAgo, seconds, outcome = null, trigger = null, progress = null }) => ({
    id, kind, title, state: 'done', trigger, parentId: null, ref: null, detail: null, step: null, stepIndex: 0,
    outcome, tone: null, error: null, progress, percent: progress ? 100 : null, etaSeconds: null,
    startedAt: at(minutesAgo), finishedAt: at(minutesAgo) + seconds * 1000,
  })
  const recent = [
    done({ id: 'sync-demo-1', kind: 'sync', title: 'Sync and TV guide refresh', minutesAgo: LAST_SYNC_AGO_MIN, seconds: 41, outcome: '2 imported', trigger: 'schedule' }),
    done({ id: 'ads-demo-1', kind: 'ads', title: 'Ad removal', minutesAgo: LAST_SYNC_AGO_MIN - 1, seconds: 96, outcome: '1 cut, 1 marked', progress: { done: 2, total: 2, unit: 'recordings' } }),
    done({ id: 'plex-watch-demo-1', kind: 'plex-watch', title: 'Plex watched sync', minutesAgo: 6, seconds: 1, outcome: 'No changes', trigger: 'library-open' }),
    done({ id: 'for-you-demo-1', kind: 'for-you', title: 'For you rebuild', minutesAgo: LAST_SYNC_AGO_MIN - 2, seconds: 1 }),
    done({ id: 'hero-demo-1', kind: 'hero', title: 'Home hero rebuild', minutesAgo: LAST_SYNC_AGO_MIN - 2, seconds: 1 }),
    done({ id: 'focus-demo-1', kind: 'focus', title: 'Picture focus', minutesAgo: LAST_SYNC_AGO_MIN - 3, seconds: 2, progress: { done: 6, total: 6, unit: 'pictures' } }),
    done({ id: 'health-demo-1', kind: 'health', title: 'Health checks', minutesAgo: 120, seconds: 2, outcome: '19 passed' }),
    done({ id: 'ratings-demo-1', kind: 'ratings', title: 'Ratings warm-up', minutesAgo: 45, seconds: 3, trigger: 'schedule' }),
  ]
  const liveChannel = (picks.guide.channels || []).find((c) => c.name === LIVE_DEMO_CHANNEL_NAME) ?? picks.programme.channel
  const liveSession = {
    id: 'demo-live-session',
    kind: 'live',
    channelId: liveChannel.id,
    label: liveChannel.name,
    status: 'live',
    client: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
    viewers: 1,
    videoMode: 'vaapi',
    startedAt: at(12),
  }
  return {
    running: [],
    upNext: [
      { kind: 'sync', title: 'Sync and TV guide refresh', every: 'every 30 minutes', nextAt: at(LAST_SYNC_AGO_MIN - SYNC_INTERVAL_MIN) },
      { kind: 'ratings', title: 'Ratings warm-up', every: 'every hour', nextAt: at(-15) },
      { kind: 'health', title: 'Health checks', every: 'every 3 hours', nextAt: at(-60) },
      { kind: 'prune', title: 'Cache prune', every: 'every day', nextAt: at(-6 * 60 - 15) },
    ],
    recent,
    runningCount: 0,
    recordings: active.map((recording) => ({
      id: `recording-${recording.dvrUuid}`,
      dvrUuid: recording.dvrUuid,
      title: recording.title,
      episodeTitle: recording.episodeTitle,
      season: recording.season,
      episode: recording.episode,
      channelName: recording.channelName,
      start: recording.start,
      stop: recording.stop,
      stopPadded: recording.stopPadded,
      recordingStartedAt: recording.recordingStartedAt,
      failed: false,
      statusText: 'Running',
      filesize: recording.filesize,
      tuner: recording.tuner,
    })),
    sessions: [liveSession],
    server: { uptimeSeconds: 5 * 86_400 + 4 * 3600, stalls: 3, worstStallMs: 240, thresholdMs: 100, tuners: { inUse: 1 + active.length, total: TUNER_NAMES.length } },
  }
}

const jobsOf = ({ running, upNext, recent, runningCount }) => ({ running, upNext, recent, runningCount })

const doctorCheck = (id, group, title, detail, doc = null) => ({ id, group, title, doc, fix: '', status: 'pass', detail })

const doctorStamp = (ms) => new Intl.DateTimeFormat('en-AU', {
  day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: TIMEZONE,
}).format(new Date(ms)).replace(' am', 'am').replace(' pm', 'pm')

const doctorReport = (simNow) => {
  const checks = [
    doctorCheck('tvh.reach', 'tvheadend', 'Connection', `TVHeadend 4.3 at ${SANITISED_SETTINGS.tvh_url}.`, 'guide/troubleshooting#setup-connection-test'),
    doctorCheck('tvh.auth', 'tvheadend', 'Login', `Signed in as ${SANITISED_SETTINGS.tvh_username}.`, 'guide/troubleshooting#tvheadend-401-or-403'),
    doctorCheck('tvh.rights', 'tvheadend', 'User rights', `The ${SANITISED_SETTINGS.tvh_username} entry has the Admin and Video recorder rights.`),
    doctorCheck('tvh.open', 'tvheadend', 'Open access', 'Every TVHeadend admin needs a login.'),
    doctorCheck('tvh.tuners', 'tvheadend', 'Tuners', `${TUNER_NAMES.length} tuners: ${TUNER_NAMES.map((name) => `${name} (192.168.1.60)`).join('; ')}.`),
    doctorCheck('tvh.channels', 'tvheadend', 'Channels', '35 channels in TVHeadend.'),
    doctorCheck('guide.depth', 'guide', 'Guide depth', `The guide runs 167 hrs ahead, to ${doctorStamp(simNow + 167 * HOUR_MS)}. Every channel has listings in the next 24 hrs.`),
    doctorCheck('guide.logos', 'guide', 'Channel logos', '35 of 35 channels have a TVHeadend icon.'),
    doctorCheck('paths.recordings', 'storage', 'Recordings folder', `${SANITISED_SETTINGS.recordings_root} is readable.`),
    doctorCheck('paths.match', 'storage', 'TVHeadend recording path', `TVHeadend and Freetvarr both use ${SANITISED_SETTINGS.tvh_recordings_path}.`),
    doctorCheck('paths.media', 'storage', 'Media folder', `${SANITISED_SETTINGS.media_root} is writable.`),
    doctorCheck('paths.hardlink', 'storage', 'Hardlinks', `Imports from ${SANITISED_SETTINGS.recordings_root} into ${SANITISED_SETTINGS.media_root} and ${SANITISED_SETTINGS.oneoff_root} and ${SANITISED_SETTINGS.movies_root} hardlink.`),
    doctorCheck('disk.free', 'storage', 'Free space', `2.1TB free on ${SANITISED_SETTINGS.recordings_root} (54% of the disk); 2.1TB free on ${SANITISED_SETTINGS.media_root} (54% of the disk).`),
    doctorCheck('plex.reach', 'plex', 'Plex library', `Section TV Shows reads ${SANITISED_SETTINGS.media_root}.`),
    doctorCheck('sync.health', 'syncs', 'Syncs', `Last sync finished ${doctorStamp(simNow - (LAST_SYNC_AGO_MIN - 1) * MINUTE_MS)}. Runs every 30 minutes.`, 'guide/syncs'),
    doctorCheck('live.encoder', 'live', 'Live TV encoder', 'Hardware encoding. VAAPI test encode passed on /dev/dri/renderD128.'),
    doctorCheck('live.streams', 'live', 'Live streams', 'Hardware transcoding measured smooth for 4 live streams at once, each at 1.4× real time or better. Freetvarr plays up to 2 at once, one per free tuner.'),
    doctorCheck('ads.comskip', 'host', 'Ad removal tools', 'comskip, ffmpeg, and ffprobe are installed.'),
    doctorCheck('host.env', 'host', 'Time zone and network', `Time zone ${TIMEZONE} (from Settings); 192.168.1.20.`),
  ]
  return {
    ranAt: new Date(simNow - 4_000).toISOString(),
    durationMs: 1_840,
    summary: { pass: checks.length, warn: 0, fail: 0, skip: 0 },
    checks,
  }
}

const SHARED_GUIDE_CHANNELS = {
  22: [{ id: 'abc-kids', name: 'ABC Kids' }, { id: 'abc-family', name: 'ABC Family' }],
}

const demoGuideLinks = (guide) => {
  const guideOptionsFor = (channel) => SHARED_GUIDE_CHANNELS[channel.number]
    || [{ id: channel.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: channel.name }]
  const channels = (guide.channels || []).map((channel) => ({
    id: channel.id,
    name: channel.name,
    number: channel.number,
    guideIds: guideOptionsFor(channel).map((option) => option.id),
  }))
  const options = new Map((guide.channels || []).flatMap(guideOptionsFor).map((option) => [option.id, option]))
  return {
    ok: true,
    ready: true,
    channels,
    options: [...options.values()].sort((a, b) => a.name.localeCompare(b.name)),
  }
}

const maskSettings = (data) => {
  const masked = { ...data }
  for (const [key, value] of Object.entries(SANITISED_SETTINGS)) masked[key] = value
  return masked
}

const maskPaths = (text) => (PATH_ROOT ? text.split(PATH_ROOT).join(SHOWN_PATH_ROOT) : text)

const ignoreClosed = (handler) => (route) => handler(route).catch(() => route.abort().catch(() => {}))

const passThroughRead = ignoreClosed(async (route) => {
  const request = route.request()
  if (!['GET', 'HEAD'].includes(request.method())) return route.fallback()
  const response = await route.fetch()
  const type = response.headers()['content-type'] || ''
  if (!type.includes('application/json')) return route.fulfill({ response })
  return route.fulfill({ response, body: maskPaths(await response.text()) })
})

const rewriteJson = (transform) => ignoreClosed(async (route) => {
  const url = new URL(route.request().url())
  const response = await route.fetch()
  if (!response.ok()) return route.fulfill({ response })
  let data
  try {
    data = JSON.parse(maskPaths(await response.text()))
  } catch {
    return route.fulfill({ response })
  }
  return fulfillJson(route, transform(data, url))
})

const plexItemImage = ({ base }) => ignoreClosed(async (route) => {
  const ratingKey = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2))
  const programId = ratingKey.replace(/^9/, '').slice(0, -2)
  const response = await route.fetch({ url: `${base}/api/epg/image/${encodeURIComponent(programId)}` })
  return route.fulfill({ response })
})

const demoLiveTv = () => {
  let session = null
  const sessionView = () => session && {
    id: LIVE_SESSION_ID,
    channelId: session.channelId,
    status: Date.now() - session.startedAt < LIVE_TUNING_MS ? 'tuning' : 'live',
    reason: null,
    startedAt: session.startedAt,
    bufferSeconds: 0,
    captions: false,
    playlist: `/api/live/${LIVE_SESSION_ID}/index.m3u8`,
  }
  return async (route) => {
    const request = route.request()
    const { pathname } = new URL(request.url())
    if (pathname.endsWith('/tuner-status')) return route.fallback()
    if (request.method() === 'POST' && /\/(hold|attention)$/.test(pathname)) return fulfillJson(route, { ok: true, held: true, changed: false })
    if (request.method() === 'POST' && pathname.endsWith('/benchmark')) return fulfillJson(route, { ok: true })
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
    if (file.endsWith('.m3u8')) return fulfillLivePlaylist({ route, liveSince: session.startedAt + LIVE_TUNING_MS })
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
