import {
  createApp,
  ref,
  reactive,
  computed,
  onMounted,
  onUnmounted,
  watch,
  nextTick,
} from '/vendor/vue.esm-browser.prod.js'
import { isStaleBuild, shouldReloadOnPull } from '/stale-build.js'
import { isNewerRelease, latestReleaseTag } from '/version-check.js'
import {
  localDayNumber,
  weekdayOfDayNumber,
  localClockMs,
  dayLengthMin,
  spillLengthMin,
  rulerTickMinutes,
} from '/guide-time.js'

let csrfToken = null

const BUILD_HEADER = 'X-Freetvarr-Build'
const loadedBuild = document.querySelector('meta[name="freetvarr-build"]')?.content || null
const latestBuild = ref(null)
const dismissedBuild = ref(null)

const noteBuild = (res) => {
  const build = res.headers.get(BUILD_HEADER)
  if (build) latestBuild.value = build
  return res
}

const serverAbout = ref({})

const fetchServerAbout = async (query = '') => {
  const res = noteBuild(await fetch(`/api/version${query}`, { cache: 'no-store' }))
  const about = await res.json()
  serverAbout.value = { ...serverAbout.value, ...about }
  return about
}

const checkForNewBuild = () => fetchServerAbout().catch(() => {})

const REPO_URL = 'https://github.com/furey/freetvarr'
const releaseUrl = (version) => `${REPO_URL}/tree/${encodeURIComponent(version)}`

const staleBuild = computed(() => isStaleBuild({
  loaded: loadedBuild,
  latest: latestBuild.value,
  dismissed: dismissedBuild.value,
}))

const getCsrf = async ({ force = false } = {}) => {
  if (csrfToken && !force) return csrfToken
  const res = noteBuild(await fetch('/api/csrf-token'))
  if (!res.ok) throw new Error(`csrf-token HTTP ${res.status}`)
  const data = await res.json().catch(() => {
    throw new Error(`csrf-token returned non-JSON (HTTP ${res.status})`)
  })
  csrfToken = data.token
  return csrfToken
}

const apiCall = async (method, url, body, headersExtra = {}) => {
  const headers = { 'Content-Type': 'application/json', ...headersExtra }
  const res = noteBuild(await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  }))
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || data.reason || `HTTP ${res.status}`)
    err.code = data.code || null
    err.stage = data.stage || null
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

const api = async (method, url, body) => {
  if (method === 'GET') return apiCall(method, url, body)
  try {
    return await apiCall(method, url, body, { 'x-csrf-token': await getCsrf() })
  } catch (err) {
    if (!/HTTP 403/.test(err.message)) throw err
    csrfToken = null
    return apiCall(method, url, body, { 'x-csrf-token': await getCsrf({ force: true }) })
  }
}

const fmtBytes = (n) => {
  if (!n || n <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = Number(n)
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(1)} ${units[i]}`
}

const tvhDetectSummary = (c) => {
  const where = c.version ? `TVHeadend ${c.version}` : 'TVHeadend'
  const auth = c.needsAuth ? ' (asks for a login)' : ''
  const loop = c.loopback ? ' — only loopback answered; use a LAN IP so logos and live TV load in the browser' : ''
  return `Found ${where} at ${c.url}${auth}${loop}.`
}

const tvhTestSummary = (r) => {
  const bits = []
  if (r.version) bits.push(`v${r.version}`)
  if (r.apiVersion != null) bits.push(`api ${r.apiVersion}`)
  bits.push(`${r.channels} channel${r.channels === 1 ? '' : 's'}`)
  bits.push(`${r.tuners} tuner${r.tuners === 1 ? '' : 's'}`)
  return `Connected — TVHeadend ${bits.join(' · ')}.`
}

const tz = ref('UTC')

const dateFormatters = new Map()

const dateFormat = (options) => {
  const key = `${tz.value}|${JSON.stringify(options)}`
  if (!dateFormatters.has(key)) {
    dateFormatters.set(key, new Intl.DateTimeFormat('en-AU', { timeZone: tz.value, ...options }))
  }
  return dateFormatters.get(key)
}

const toIso = (s) => (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? `${s.replace(' ', 'T')}Z` : s)

const fmtTime = (s) => {
  if (!s) return ''
  const iso = toIso(s)
  return dateFormat({
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(iso)).replace(', ', ' ').replace(/\s(am|pm)$/, '$1')
}

const fmtAgo = ({ at, nowMs }) => {
  const mins = Math.floor((nowMs - Date.parse(toIso(at))) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  if (mins < 1440) return `${Math.floor(mins / 60)} h ago`
  return fmtTime(at)
}

const fmtElapsed = ({ at, nowMs }) => {
  const secs = Math.max(0, Math.floor((nowMs - Date.parse(toIso(at))) / 1000))
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
}

const plexSummary = (p) => {
  if (p.triggered) return { kind: 'mark', label: 'plex', mark: 'done', text: `(${p.status})` }
  if (p.skipped) return { kind: 'text', text: 'plex —' }
  if (p.error) return { kind: 'mark', label: 'plex', mark: 'failed', text: p.error }
  return { kind: 'text', text: 'plex ?' }
}

const deleteSummary = (d) => {
  if (d.triggered) return { kind: 'mark', label: 'rm', mark: 'done', text: String(d.removed?.length ?? '?') }
  if (d.skipped) return { kind: 'text', text: `rm — ${d.reason || ''}`.trim() }
  if (d.error) return { kind: 'mark', label: 'rm', mark: 'failed', text: d.error }
  return { kind: 'text', text: 'rm ?' }
}

const adsSummary = (a) => {
  const bits = []
  if (a.detected) bits.push(`${a.detected} detected`)
  if (a.cut) bits.push(`${a.cut} cut`)
  if (a.failed) bits.push(`${a.failed} failed`)
  return `ads ${bits.length ? bits.join(' · ') : `${a.scanned} scanned`}`
}

const triggerMeta = (t) => {
  if (t === 'cron') return { kind: 'trigger-cron', title: 'Cron-scheduled sync' }
  if (t === 'manual-single') return { kind: 'trigger-manual', title: 'Manual single-show sync' }
  if (t === 'manual') return { kind: 'trigger-manual', title: 'Manual full sync' }
  return { kind: 'text', text: t }
}

const summaryParts = (s) => {
  if (!s) return []
  const parts = []
  if (s.trigger) parts.push(triggerMeta(s.trigger))
  if (s.imported !== undefined) parts.push({ kind: 'import', text: String(s.imported) })
  if (s.skipped !== undefined) parts.push({ kind: 'text', text: `skip ${s.skipped}` })
  if (s.failed) parts.push({ kind: 'text', text: `fail ${s.failed}` })
  if (s.plex) parts.push(plexSummary(s.plex))
  if (s.delete) parts.push(deleteSummary(s.delete))
  if (s.ads) parts.push({ kind: 'text', text: adsSummary(s.ads) })
  if (s.message) parts.push({ kind: 'text', text: s.message })
  if (s.errors?.length) {
    const tail = s.errors.length > 2 ? '…' : ''
    parts.push({ kind: 'text', text: `errors: ${s.errors.slice(0, 2).join('; ')}${tail}` })
  }
  return parts
}

const SummaryLine = {
  props: ['summary'],
  computed: {
    parts() { return summaryParts(this.summary) }
  },
  template: `
    <code v-if="parts.length" class="inline-flex items-center gap-1.5 flex-wrap align-middle">
      <template v-for="(p, i) in parts" :key="i">
        <span v-if="i > 0" class="text-ink-mute">·</span>
        <span v-if="p.kind === 'trigger-cron'" class="inline-flex items-center align-middle text-ink-dim" :title="p.title" :aria-label="p.title">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 align-middle" aria-hidden="true">
            <circle cx="8" cy="8" r="5.75"/>
            <path d="M8 5v3.25l2.25 1.5"/>
          </svg>
        </span>
        <span v-else-if="p.kind === 'trigger-manual'" class="inline-flex items-center align-middle text-ink-dim" :title="p.title" :aria-label="p.title">
          <svg viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5 align-middle" aria-hidden="true">
            <path d="M5 3.5v9a0.5 0.5 0 0 0 0.78 0.42l6.8-4.5a0.5 0.5 0 0 0 0-0.84l-6.8-4.5A0.5 0.5 0 0 0 5 3.5z"/>
          </svg>
        </span>
        <span v-else class="inline-flex items-center gap-1 align-middle">
          <svg v-if="p.kind === 'import'" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 align-middle text-ink-dim" aria-hidden="true">
            <path d="M8 2.5v7.5M5 7l3 3 3-3M3 13.5h10"/>
          </svg>
          <template v-if="p.kind === 'mark'">
            <span>{{ p.label }}</span>
            <step-mark-icon :state="p.mark" :class="['w-3.5', 'h-3.5', 'align-middle', p.mark === 'done' ? 'text-plex-yellow' : 'text-signal-orange-hi']" />
          </template>
          <span>{{ p.text }}</span>
        </span>
      </template>
    </code>
  `,
}

const ProgressBlock = {
  props: ['progress', 'caption', 'bar'],
  template: `
    <div class="progress">
      <div v-if="bar" class="progress-track">
        <div class="progress-fill" :class="{ indeterminate: progress.percent == null }"
          :style="progress.percent == null ? {} : { width: (progress.percent || 0) + '%' }"></div>
      </div>
      <span class="progress-caption">{{ caption }}</span>
    </div>
  `,
}

const ChannelLogo = {
  props: { channelId: { type: [String, Number], default: null }, hasLogo: Boolean },
  setup(props) {
    const failed = ref(false)
    watch(() => props.channelId, () => { failed.value = false })
    const showsImage = computed(() => props.hasLogo && props.channelId != null && !failed.value)
    return { failed, showsImage }
  },
  template: `
    <img v-if="showsImage" class="epg-rail-logo" :src="'/api/epg/logo/' + channelId" alt="" loading="lazy"
      draggable="false" @error="failed = true" />
    <tv-icon v-else class="epg-rail-logo channel-logo-fallback" />
  `,
}

const imageStatusOf = (img) => {
  if (!img?.complete) return 'loading'
  return img.naturalWidth > 0 ? 'loaded' : 'failed'
}

const ProgrammeImage = {
  props: {
    eventId: { type: [String, Number], default: null },
    variant: { type: String, default: 'thumb' },
    channelId: { type: [String, Number], default: null },
    hasLogo: Boolean,
  },
  setup(props) {
    const img = ref(null)
    const status = ref('loading')
    const instant = ref(false)
    const src = computed(() => `/api/epg/image/${encodeURIComponent(props.eventId)}`)
    const settleFromCache = () => {
      if (props.eventId == null) {
        status.value = 'failed'
        return
      }
      const cached = imageStatusOf(img.value)
      instant.value = cached !== 'loading'
      status.value = cached
    }
    const onLoad = () => { if (status.value === 'loading') status.value = 'loaded' }
    const onError = () => { status.value = 'failed' }
    onMounted(settleFromCache)
    watch(() => props.eventId, async () => {
      status.value = 'loading'
      instant.value = false
      await nextTick()
      settleFromCache()
    })
    return { img, status, instant, src, onLoad, onError }
  },
  template: `
    <div :class="['programme-image', variant, 'is-' + status, { 'no-fade': instant }]">
      <img v-if="eventId != null && status !== 'failed'" ref="img" :src="src" alt=""
        :loading="variant === 'hero' ? 'eager' : 'lazy'" decoding="async" @load="onLoad" @error="onError" />
      <span v-if="status === 'failed'" class="programme-image-fallback">
        <channel-logo :channel-id="channelId" :has-logo="hasLogo" />
      </span>
    </div>
  `,
}

const ToggleSwitch = {
  props: { modelValue: Boolean, label: { type: String, default: '' } },
  emits: ['update:modelValue'],
  template: `
    <button type="button" role="switch" :class="['toggle', { on: modelValue }]" :aria-checked="String(modelValue)"
      @click="$emit('update:modelValue', !modelValue)">
      <span class="toggle-track" aria-hidden="true"><span class="toggle-knob"></span></span>
      <span class="toggle-label"><slot>{{ label }}</slot></span>
    </button>
  `,
}

const ChannelIdentity = {
  props: { channel: { type: Object, required: true }, hasLogo: Boolean, number: { type: String, default: '' } },
  emits: ['pin'],
  template: `
    <button type="button" :class="['epg-pin', { pinned: channel.pinned }]" :aria-pressed="Boolean(channel.pinned)"
      :title="channel.pinned ? 'Remove from favourites' : 'Add to favourites'"
      :aria-label="channel.pinned ? 'Remove ' + channel.name + ' from favourites' : 'Add ' + channel.name + ' to favourites'"
      @click="$emit('pin')"><star-icon /></button>
    <span class="channel-logo"><channel-logo :channel-id="channel.id" :has-logo="hasLogo" /></span>
    <span class="channel-name" :title="channel.name">
      <span v-if="number" class="channel-number">{{ number }}</span>
      {{ channel.name }}
    </span>
  `,
}

const channelGroupLabel = ({ pinned, anyPinned }) => {
  if (pinned) return 'Favourites'
  return anyPinned ? 'Other channels' : 'Channels'
}

const storedFlag = ({ key, fallback }) => {
  const read = () => {
    try {
      const stored = localStorage.getItem(key)
      return stored == null ? fallback : stored === '1'
    } catch {
      return fallback
    }
  }
  const flag = ref(read())
  watch(flag, (on) => {
    try { localStorage.setItem(key, on ? '1' : '0') } catch {}
  })
  return flag
}

const storedChoice = ({ key, options, fallback }) => {
  const read = () => {
    try {
      const stored = localStorage.getItem(key)
      return options.includes(stored) ? stored : fallback
    } catch {
      return fallback
    }
  }
  const choice = ref(read())
  watch(choice, (value) => {
    try { localStorage.setItem(key, value) } catch {}
  })
  return choice
}

const useMediaQuery = (query) => {
  const list = window.matchMedia(query)
  const matches = ref(list.matches)
  const update = () => { matches.value = list.matches }
  onMounted(() => list.addEventListener('change', update))
  onUnmounted(() => list.removeEventListener('change', update))
  return matches
}

const makeStatus = () => {
  const text = ref('')
  const kind = ref('ok')
  const set = (msg, k = 'ok', ms = FLASH_DEFAULT_MS) => {
    text.value = msg
    kind.value = k
    if (ms > 0) setTimeout(() => (text.value = ''), ms)
  }
  const clear = () => (text.value = '')
  return [text, kind, set, clear]
}

const usePathCheck = (request) => {
  const checking = ref(false)
  const [text, kind, set] = makeStatus()
  const run = async () => {
    checking.value = true
    set('Checking…', 'info', 0)
    try {
      const result = await request()
      set(result.text, result.kind, 0)
    } catch (err) {
      set(`Check failed: ${err.message}`, 'err', 0)
    } finally {
      checking.value = false
    }
  }
  return reactive({ checking, text, kind, run })
}

const recordingsFolderStatus = async ({ path, mediaRoot }) => {
  const r = await api('POST', '/api/recordings-root-test', { path, media_root: mediaRoot })
  if (!r.ok) return { text: r.error, kind: 'err' }
  if (r.sameFilesystem === false) {
    return {
      text: `${r.path} is readable, but it sits on a different filesystem from the media root, so imports copy each file instead of hardlinking it.`,
      kind: 'info',
    }
  }
  const hardlinks = r.sameFilesystem ? ' and shares a filesystem with the media root, so imports hardlink' : ''
  return { text: `OK — ${r.path} is readable${hardlinks}.`, kind: 'ok' }
}

const tvhRecordingsPathStatus = async ({ path, fill }) => {
  const r = await api('POST', '/api/tvh-recordings-path-check', { path })
  if (!r.tvhPath) {
    return { text: 'TVHeadend has no recording path. Set one in its DVR profile.', kind: 'err' }
  }
  if (!r.configured) {
    fill(r.tvhPath)
    return { text: `Filled in from TVHeadend: ${r.tvhPath}. Save to keep it.`, kind: 'ok' }
  }
  if (r.matches) return { text: `OK — TVHeadend records to ${r.tvhPath}.`, kind: 'ok' }
  return { text: `TVHeadend records to ${r.tvhPath}, not ${r.configured}.`, kind: 'err' }
}

const useFlash = () => {
  const flashText = ref('')
  const flashKind = ref('ok')
  const flash = ({ msg, kind = 'ok', ms = FLASH_DEFAULT_MS }) => {
    flashText.value = msg
    flashKind.value = kind
    if (ms > 0) setTimeout(() => (flashText.value = ''), ms)
  }
  const flashUntilSyncDone = ({ msg, kind = 'ok' }) => {
    flashText.value = msg
    flashKind.value = kind
    const ourMsg = msg
    const clearIfStillOurs = () => {
      if (flashText.value === ourMsg) flashText.value = ''
    }
    const stop = watch(() => syncStatus.value.activeSyncId, (curr, prev) => {
      if (!curr && prev) {
        clearIfStillOurs()
        stop()
      }
    })
    setTimeout(() => {
      clearIfStillOurs()
      stop()
    }, SYNC_FLASH_SAFETY_MS)
  }
  return { flashText, flashKind, flash, flashUntilSyncDone }
}

const FLASH_DEFAULT_MS = 4500
const SYNC_DOTS = { ok: '#e2b03c', partial: '#ffcd00', error: '#ffab3d', running: '#62cfff' }
const SYNC_FLASH_SAFETY_MS = 60_000
const MIN_SYNC_DISPLAY_MS = 1500

const ROUTES = ['dashboard', 'live', 'guide', 'shows', 'syncs', 'recordings', 'settings', 'doctor', 'welcome']
const WELCOME_DISMISSED_KEY = 'freetvarr.welcomeDismissed'
const DEFAULT_ROUTE = 'dashboard'

const DASHBOARD_POLL_MS = 30_000
const SYNCS_POLL_MS = 30_000
const RECORDINGS_POLL_MS = 60_000
const RECORDINGS_ACTIVE_POLL_MS = 2_000
const UNIMPORTED_STATUSES = ['failed', 'skipped']

const hashSegments = () => (window.location.hash || '').replace(/^#\/?/, '').toLowerCase().split('/')

const parseHash = () => {
  const [view] = hashSegments()
  return ROUTES.includes(view) ? view : DEFAULT_ROUTE
}

const parseHashSection = () => hashSegments()[1] || ''

const route = ref(parseHash())
const routeSection = ref(parseHashSection())
window.addEventListener('hashchange', () => {
  route.value = parseHash()
  routeSection.value = parseHashSection()
})

const scrollToRouteSection = async () => {
  if (!routeSection.value) return
  await nextTick()
  const behavior = document.visibilityState === 'visible' ? 'smooth' : 'auto'
  document.getElementById(`section-${routeSection.value}`)?.scrollIntoView({ behavior, block: 'start' })
}

const guideHandoff = ref(null)
const refreshTick = ref(0)

const openInGuide = (handoff) => {
  guideHandoff.value = handoff
  window.location.hash = '#/guide'
}

const syncStatus = ref({ activeSyncId: null, cron: '' })
let syncPollTimer = null

const loadSyncStatus = async () => {
  try {
    syncStatus.value = await api('GET', '/api/sync-status')
  } catch {
    /* leave previous value */
  }
  return syncStatus.value
}

const stopSyncPolling = () => {
  if (syncPollTimer) clearInterval(syncPollTimer)
  syncPollTimer = null
}

const ensureSyncPolling = () => {
  if (syncPollTimer || !syncStatus.value.activeSyncId) return
  syncPollTimer = setInterval(async () => {
    await loadSyncStatus()
    if (!syncStatus.value.activeSyncId) stopSyncPolling()
  }, 3000)
}

watch(() => syncStatus.value.activeSyncId, (curr) => {
  if (curr) ensureSyncPolling()
})

const FAVICON_SIZE = 32
const FAVICON_BG = '#28231b'
const FAVICON_CHIP_BASE_Y = 13
const FAVICON_CHIP_WIDTH = 8
const FAVICON_CHIP_HEIGHT = 6
const FAVICON_BOB_AMPLITUDE = 4
const FAVICON_BOB_PERIOD_MS = 900
const FAVICON_FRAME_INTERVAL_MS = 90
const FAVICON_CHIPS = [
  { x: 3,  color: '#1eb6ff' },
  { x: 12, color: '#ff8a00' },
  { x: 21, color: '#e2b03c' },
]

const FAVICON_REC_DISC = { x: 16, y: 16, radius: 6.5, color: '#ff8a00' }

let faviconCanvas = null
let faviconCtx = null
let faviconLink = null
let faviconTimer = null
let faviconStart = 0
let faviconRecording = false

const ensureFaviconCanvas = () => {
  if (faviconCanvas) return
  faviconCanvas = document.createElement('canvas')
  faviconCanvas.width = FAVICON_SIZE
  faviconCanvas.height = FAVICON_SIZE
  faviconCtx = faviconCanvas.getContext('2d')
  faviconLink = document.querySelector('link[rel="icon"]')
  faviconLink.type = 'image/png'
}

const drawFaviconFrame = (now, { bob = true } = {}) => {
  if (faviconRecording) return drawFaviconRecording()
  const phase = ((now - faviconStart) / FAVICON_BOB_PERIOD_MS) * Math.PI * 2
  faviconCtx.fillStyle = FAVICON_BG
  faviconCtx.fillRect(0, 0, FAVICON_SIZE, FAVICON_SIZE)
  FAVICON_CHIPS.forEach((chip, index) => {
    const stagger = (index / FAVICON_CHIPS.length) * Math.PI * 2
    const offset = bob ? Math.sin(phase + stagger) * FAVICON_BOB_AMPLITUDE : 0
    faviconCtx.fillStyle = chip.color
    faviconCtx.fillRect(chip.x, FAVICON_CHIP_BASE_Y - offset, FAVICON_CHIP_WIDTH, FAVICON_CHIP_HEIGHT)
  })
  faviconLink.href = faviconCanvas.toDataURL('image/png')
}

const drawFaviconRecording = () => {
  faviconCtx.fillStyle = FAVICON_BG
  faviconCtx.fillRect(0, 0, FAVICON_SIZE, FAVICON_SIZE)
  faviconCtx.fillStyle = FAVICON_REC_DISC.color
  faviconCtx.beginPath()
  faviconCtx.arc(FAVICON_REC_DISC.x, FAVICON_REC_DISC.y, FAVICON_REC_DISC.radius, 0, Math.PI * 2)
  faviconCtx.fill()
  faviconLink.href = faviconCanvas.toDataURL('image/png')
}

const showFaviconAtRest = () => {
  if (!faviconRecording) {
    if (faviconLink) {
      faviconLink.type = 'image/svg+xml'
      faviconLink.href = '/favicon.svg'
    }
    return
  }
  ensureFaviconCanvas()
  drawFaviconFrame(0, { bob: false })
}

const setFaviconRecording = (recording) => {
  faviconRecording = recording
  if (!faviconTimer) showFaviconAtRest()
}

const startFaviconAnimation = () => {
  ensureFaviconCanvas()
  if (faviconTimer) return
  faviconStart = performance.now()
  faviconTimer = setInterval(() => drawFaviconFrame(performance.now()), FAVICON_FRAME_INTERVAL_MS)
}

const stopFaviconAnimation = () => {
  if (faviconTimer) {
    clearInterval(faviconTimer)
    faviconTimer = null
  }
  showFaviconAtRest()
}

watch(() => syncStatus.value.activeSyncId, (curr) => {
  if (curr) startFaviconAnimation()
  else stopFaviconAnimation()
})

const now = ref(new Date())
setInterval(() => { now.value = new Date() }, 1000)

const recordingNow = ref({ active: [], journeys: [] })
let recordingNowTimer = null

const recordingCount = computed(() => recordingNow.value.active.length)

const recordingNowBusy = computed(() =>
  recordingNow.value.active.length > 0 || recordingNow.value.journeys.length > 0)

const loadRecordingNow = async () => {
  try {
    recordingNow.value = await api('GET', '/api/recording-now')
  } catch {
    recordingNow.value = { active: [], journeys: [] }
  }
}

const pollRecordingNow = async () => {
  clearTimeout(recordingNowTimer)
  await loadRecordingNow()
  const fast = recordingNowBusy.value && !document.hidden
  recordingNowTimer = setTimeout(pollRecordingNow, fast ? RECORDING_NOW_FAST_POLL_MS : RECORDING_NOW_IDLE_POLL_MS)
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && recordingNowBusy.value) pollRecordingNow()
})

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkForNewBuild()
})

watch(recordingCount, (count) => {
  document.title = count > 0 ? `● REC · ${APP_TITLE}` : APP_TITLE
  setFaviconRecording(count > 0)
})

const APP_TITLE = 'Freetvarr'
const RECORDING_NOW_FAST_POLL_MS = 5_000
const RECORDING_NOW_IDLE_POLL_MS = 45_000

const clockReadout = computed(() => dateFormat({
  hour12: true,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
}).format(now.value))

const tzShortName = computed(() => {
  try {
    const parts = dateFormat({ timeZoneName: 'short' }).formatToParts(now.value)
    return parts.find((p) => p.type === 'timeZoneName')?.value || tz.value
  } catch {
    return tz.value
  }
})

const seasonEpisodeLabel = (r) => {
  if (r.season == null && r.episode == null) return ''
  const s = r.season != null ? `S${String(r.season).padStart(2, '0')}` : ''
  const e = r.episode != null ? `E${String(r.episode).padStart(2, '0')}` : ''
  return `${s}${e}`
}

const within7Days = (s) => {
  if (!s) return false
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? `${s.replace(' ', 'T')}Z` : s
  const t = new Date(iso).getTime()
  return Number.isFinite(t) && (Date.now() - t) < 7 * 24 * 60 * 60 * 1000
}

const hostOf = (url) => {
  if (!url) return ''
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

const HEALTH_COLOURS = { ok: '#e2b03c', err: '#ff8a00', off: '#544e47' }

const fmtClockTz = (ms) => dateFormat({ hour: 'numeric', minute: '2-digit' }).format(new Date(ms)).replace(/\s/g, '').toLowerCase()

const dayKey = (ms) => dateFormat({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms))

const fmtRelativeDay = (ms) => {
  const daysAhead = localDayNumber({ ms, timeZone: tz.value }) - localDayNumber({ ms: Date.now(), timeZone: tz.value })
  if (daysAhead === 0) return 'Today'
  if (daysAhead === 1) return 'Tomorrow'
  return dateFormat({ weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(ms)).replace(',', '')
}

const tsOfMs = (v) => {
  if (v == null) return 0
  if (typeof v === 'number') return v
  const n = Number(v)
  if (Number.isFinite(n)) return n
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? t : 0
}

const RecordingCard = {
  props: ['rec', 'kind'],
  setup(props) {
    const geometry = computed(() => recordingBarGeometry({ rec: props.rec, nowMs: now.value.getTime() }))
    const phaseLabel = computed(() => {
      if (props.rec.phase !== 'programme') return props.rec.phase
      const mins = Math.max(0, Math.ceil((props.rec.stop - now.value.getTime()) / 60_000))
      return `${mins} min left`
    })
    const liveLine = computed(() => recordingLiveLine(props.rec))
    const metaLine = computed(() =>
      [seasonEpisodeLabel(props.rec), props.rec.episodeTitle].filter(Boolean).join(' · '))
    const stepDetail = computed(() => {
      if (props.rec.failed) return ''
      const current = (props.rec.steps || []).find((st) => st.state !== 'done' && st.detail)
      return current ? `${current.label}: ${current.detail}` : ''
    })
    return { geometry, phaseLabel, liveLine, metaLine, stepDetail, fmtClockTz }
  },
  template: `
    <article :class="['rec-card', { failed: rec.failed }]">
      <programme-image v-if="rec.hasImage" :event-id="rec.programId ?? rec.uuid" variant="rec" :channel-id="rec.channelId" has-logo />
      <div class="rec-card-body">
        <div class="rec-card-head">
          <channel-logo class="shrink-0" :channel-id="rec.channelId" has-logo />
          <span class="rec-card-channel">{{ rec.channelName }}</span>
          <span v-if="rec.failed" class="rec-badge failed"><cross-icon /> FAILED</span>
          <span v-else-if="kind === 'active'" class="rec-badge"><span class="led-dot sm live"></span>REC</span>
          <span v-else class="rec-badge ended">ENDED {{ fmtClockTz(rec.endedAt) }}</span>
        </div>
        <div class="rec-card-title">{{ rec.title }}</div>
        <div v-if="metaLine" class="rec-card-meta">{{ metaLine }}</div>
        <template v-if="kind === 'active'">
          <div class="rec-bar" role="progressbar" aria-label="Recording progress"
            :aria-valuenow="Math.round(geometry.fill)" aria-valuemin="0" aria-valuemax="100">
            <span class="rec-bar-pad" :style="{ left: 0, width: geometry.pre + '%' }"></span>
            <span class="rec-bar-pad" :style="{ right: 0, width: geometry.post + '%' }"></span>
            <span class="rec-bar-fill" :style="{ width: geometry.fill + '%' }"></span>
            <span class="rec-bar-shade" :style="{ left: 0, width: Math.min(geometry.pre, geometry.fill) + '%' }"></span>
            <span class="rec-bar-shade" :style="{ left: (100 - geometry.post) + '%', width: Math.max(0, geometry.fill - 100 + geometry.post) + '%' }"></span>
          </div>
          <div class="rec-bar-labels">
            <span>{{ fmtClockTz(rec.startPadded) }}</span>
            <span :class="['rec-phase', rec.phase]">{{ phaseLabel }}</span>
            <span>{{ fmtClockTz(rec.stopPadded) }}</span>
          </div>
          <p class="rec-live">{{ liveLine }}</p>
          <p v-if="rec.failed" class="rec-error">{{ rec.statusText || 'TVHeadend reported an error' }}</p>
        </template>
        <template v-else>
          <p v-if="rec.failed" class="rec-error">{{ rec.statusText || 'Recording failed' }}</p>
          <ol class="rec-steps">
            <li v-for="st in rec.steps" :key="st.key" :class="['rec-step', st.state]">
              <step-mark-icon class="rec-step-mark" :state="st.state" />{{ st.label }}{{ st.percent != null ? ' ' + st.percent + '%' : '' }}
            </li>
          </ol>
          <p v-if="stepDetail" class="rec-card-meta">{{ stepDetail }}</p>
        </template>
      </div>
    </article>
  `,
}

const RecordingNowPanel = {
  setup() {
    const cards = computed(() => [
      ...recordingNow.value.active.slice(0, RECORDING_CARDS_MAX).map((rec) => ({ rec, kind: 'active' })),
      ...recordingNow.value.journeys.map((rec) => ({ rec, kind: 'journey' })),
    ])
    const title = computed(() => recordingNow.value.active.length ? 'RECORDING NOW' : 'JUST RECORDED')
    const summary = computed(() => recordingCount.value ? `${recordingCount.value} active` : '')
    return { cards, title, summary }
  },
  template: `
    <section v-if="cards.length" class="panel rec-panel">
      <header class="panel-header">
        <span class="panel-heading">
          <span class="panel-title">{{ title }}</span>
          <info-button :title="title" doc="guide/tv-guide#on-the-dashboard">
            <p>One card for each programme TVHeadend is recording now. The orange bar runs from the padded start to the padded stop; the dim ends are the early start and the late finish.</p>
            <p>The line under the bar shows the file size, bitrate, tuner signal, and errors, as TVHeadend reports them.</p>
            <p>When a recording stops, its card steps through <strong>Recorded</strong>, <strong>Importing</strong>, <strong>Cutting ads</strong>, and <strong>In Plex</strong>. Importing waits for the next sync. The card goes about ten minutes after the last step.</p>
          </info-button>
        </span>
        <span v-if="summary" class="text-xs font-mono uppercase tracking-[0.16em] text-signal-orange">{{ summary }}</span>
      </header>
      <div class="panel-body">
        <transition-group name="rec-card" tag="div" class="rec-grid">
          <recording-card v-for="c in cards" :key="c.kind + '-' + c.rec.uuid" :rec="c.rec" :kind="c.kind" />
        </transition-group>
      </div>
    </section>
  `,
}

const recordingBarGeometry = ({ rec, nowMs }) => {
  const total = rec.stopPadded - rec.startPadded
  if (!(total > 0)) return { pre: 0, post: 0, fill: 0 }
  const share = (ms) => Math.min(100, Math.max(0, (ms / total) * 100))
  return {
    pre: share(rec.start - rec.startPadded),
    post: share(rec.stopPadded - rec.stop),
    fill: share(nowMs - rec.startPadded),
  }
}

const recordingLiveLine = (rec) => {
  const bits = []
  if (rec.filesize) bits.push(fmtBytes(rec.filesize))
  if (rec.bitsPerSecond) bits.push(`${(rec.bitsPerSecond / 1_000_000).toFixed(1)} Mb/s`)
  if (rec.signal != null) bits.push(`signal ${fmtReading(rec.signal, rec.signalUnit)}`)
  if (rec.snr != null) bits.push(`SNR ${fmtReading(rec.snr, rec.snrUnit)}`)
  const errors = (rec.errors || 0) + (rec.dataErrors || 0)
  bits.push(errors ? `${errors} error${errors === 1 ? '' : 's'}` : 'no errors')
  if (rec.continuityErrors) bits.push(`${rec.continuityErrors} CC`)
  return bits.join(' · ')
}

const fmtReading = (value, unit) => unit === '%' ? `${value}%` : `${Number(value).toFixed(1)} ${unit}`

const RECORDING_CARDS_MAX = 4

const setDragLock = (on) => {
  try { document.body.classList.toggle('epg-drag-lock', on) } catch { /* ignore */ }
}

// Pointer-based drag (not HTML5 drag-and-drop) so reordering works with a
// finger on iOS as well as a mouse. A pinned row's handle (the guide's rail
// cell, Live TV's channel cell) is the drag surface; the drag only starts after
// a small movement threshold so plain clicks and taps (the star button) still
// register. Rows are hit-tested by their live bounding boxes on every move,
// and a cloned ghost of the handle follows the pointer.
const usePinDrag = ({ rowSelector, currentPins, onReorder }) => {
  const dragPinId = ref(null)
  const dropTargetId = ref(null)
  const dropAfter = ref(false)
  let pendingDrag = null
  let liftTimer = null
  let dragDidMove = false
  let ghostEl = null
  let ghostDX = 0
  let ghostDY = 0

  const distanceToBox = (clientY, box) => {
    if (clientY < box.top) return box.top - clientY
    if (clientY > box.bottom) return clientY - box.bottom
    return 0
  }

  const pinRowUnderPointer = (clientY) => {
    const nearest = [...document.querySelectorAll(rowSelector)]
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.height > 0)
      .reduce((best, row) => {
        const distance = distanceToBox(clientY, row.box)
        return !best || distance < best.distance ? { ...row, distance } : best
      }, null)
    return nearest?.el.dataset.channelId || null
  }

  const isBelow = (from, to) => {
    const order = currentPins()
    return order.indexOf(from) < order.indexOf(to)
  }

  const moveGhost = (e) => {
    if (!ghostEl) return
    ghostEl.style.left = `${e.clientX - ghostDX}px`
    ghostEl.style.top = `${e.clientY - ghostDY}px`
  }

  const removeGhost = () => {
    if (!ghostEl) return
    ghostEl.remove()
    ghostEl = null
  }

  const startPinDrag = () => {
    clearTimeout(liftTimer)
    if (!pendingDrag) return
    const { ch, cell, pointerId, x, y } = pendingDrag
    pendingDrag = null
    dragDidMove = true
    setDragLock(true)
    try { cell.setPointerCapture(pointerId) } catch { /* ignore */ }
    dragPinId.value = String(ch.id)
    dropTargetId.value = null
    const box = cell.getBoundingClientRect()
    ghostDX = x - box.left
    ghostDY = y - box.top
    ghostEl = cell.cloneNode(true)
    ghostEl.classList.add('epg-ghost')
    ghostEl.style.width = `${box.width}px`
    ghostEl.style.height = `${box.height}px`
    document.body.appendChild(ghostEl)
    moveGhost({ clientX: x, clientY: y })
  }

  const onPinPointerDown = (ch, e) => {
    if (!ch.pinned) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    pendingDrag = { ch, cell: e.currentTarget, pointerId: e.pointerId, x: e.clientX, y: e.clientY }
    clearTimeout(liftTimer)
    liftTimer = setTimeout(startPinDrag, PIN_LIFT_HOLD_MS)
  }

  const onPinPointerMove = (e) => {
    if (pendingDrag) {
      if (Math.hypot(e.clientX - pendingDrag.x, e.clientY - pendingDrag.y) < EPG_DRAG_THRESHOLD_PX) return
      startPinDrag()
    }
    if (!dragPinId.value) return
    e.preventDefault()
    moveGhost(e)
    const over = pinRowUnderPointer(e.clientY)
    dropTargetId.value = over && over !== dragPinId.value ? over : null
    dropAfter.value = Boolean(dropTargetId.value) && isBelow(dragPinId.value, dropTargetId.value)
  }

  const onPinPointerUp = async () => {
    pendingDrag = null
    clearTimeout(liftTimer)
    setDragLock(false)
    removeGhost()
    if (dragDidMove) setTimeout(() => { dragDidMove = false }, 0)
    const from = dragPinId.value
    const to = dropTargetId.value
    dragPinId.value = null
    dropTargetId.value = null
    dropAfter.value = false
    if (!from || !to || from === to) return
    const movingDown = isBelow(from, to)
    const pins = currentPins().filter((id) => id !== from)
    pins.splice(pins.indexOf(to) + (movingDown ? 1 : 0), 0, from)
    await onReorder(pins)
  }

  const onPinPointerCancel = () => {
    pendingDrag = null
    clearTimeout(liftTimer)
    setDragLock(false)
    removeGhost()
    dragDidMove = false
    dragPinId.value = null
    dropTargetId.value = null
    dropAfter.value = false
  }

  return {
    dragPinId, dropTargetId, dropAfter, didDrag: () => dragDidMove,
    onPinPointerDown, onPinPointerMove, onPinPointerUp, onPinPointerCancel,
  }
}

const recordingChannelIds = computed(() =>
  new Set(recordingNow.value.active.filter((r) => !r.failed).map((r) => String(r.channelId))))

const isRecordingChannel = (channelId) => recordingChannelIds.value.has(String(channelId))

const onNowPercent = (p) => {
  const span = p.end - p.start
  if (span <= 0) return 0
  return Math.min(100, Math.max(0, Math.round(((now.value.getTime() - p.start) / span) * 100)))
}

const onNowMeta = (p) => {
  const mins = Math.max(0, Math.ceil((p.end - now.value.getTime()) / 60_000))
  return `${fmtClockTz(p.start)} · ${mins} min${mins === 1 ? '' : 's'} remaining`
}

const LiveView = {
  template: `
    <div class="view-reveal space-y-6">
      <section class="panel">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title">LIVE TV</span>
            <info-button title="LIVE TV" doc="guide/live-tv#in-freetvarr">
              <p>Every channel in TVHeadend, with what is on now and next. Press the TV button on a channel to watch it in the browser.</p>
              <p>Freetvarr converts the TVHeadend stream into video the browser can play. It needs a free tuner, and a recording always takes the tuner first.</p>
              <p>Star a channel to put it in your favourites at the top. <strong>CHANNELS</strong> hides, sorts, and orders the channels.</p>
            </info-button>
          </span>
          <div class="flex flex-wrap items-center justify-end gap-3">
            <span v-if="flashText" :class="['status-readout', flashKind]">{{ flashText }}</span>
            <toggle-switch v-model="pinnedOnly" label="FAVOURITES ONLY" />
            <toggle-switch v-model="showImages" label="IMAGES" />
            <button type="button" class="btn btn-sm" @click="channelsModal = true" :disabled="!data"><sliders-icon /> CHANNELS</button>
          </div>
        </header>
        <div class="panel-body space-y-5">
          <input v-model="filterQ" type="search" class="field-input w-full"
            placeholder="Filter channels or shows" aria-label="Filter channels or shows"
            style="padding-top: 0.35rem; padding-bottom: 0.35rem;" />
          <p v-if="tvhConfigured === false" class="text-sm text-ink-dim">
            Connect TVHeadend in <a href="#/settings/tvheadend">Settings</a> to watch live TV.
          </p>
          <div v-else-if="error" class="flex flex-wrap items-center gap-3">
            <span class="status-readout err">Guide unavailable: {{ error }}</span>
            <button type="button" class="btn btn-sm" @click="load"><refresh-icon /> RETRY</button>
          </div>
          <p v-else-if="!data" class="text-sm text-ink-dim">Loading channels…</p>
          <p v-else-if="!groups.length && favouritesHint" class="text-sm text-ink-dim">No favourites yet. Tap <star-icon class="icon-inline" /> next to a channel to add it.</p>
          <p v-else-if="!groups.length" class="text-sm text-ink-dim">{{ emptyText }}</p>
          <div v-for="g in groups" :key="g.key" class="live-group">
            <div class="channel-group-heading">{{ g.label }}</div>
            <ul class="live-list">
              <li v-for="e in g.entries" :key="e.channel.id" :data-channel-id="e.channel.id"
                :class="['live-row', { pinned: e.channel.pinned, 'epg-drop-target': dropTargetId === String(e.channel.id), 'epg-drop-after': dropAfter && dropTargetId === String(e.channel.id), 'epg-dragging': dragPinId === String(e.channel.id) }]">
                <div class="live-row-handle" :title="e.channel.pinned ? 'Drag to reorder favourites' : null"
                  @pointerdown="onPinPointerDown(e.channel, $event)"
                  @pointermove="onPinPointerMove"
                  @pointerup="onPinPointerUp"
                  @pointercancel="onPinPointerCancel">
                  <channel-identity :channel="e.channel" :has-logo="e.channel.hasLogo"
                    :number="e.channel.number == null ? '' : String(e.channel.number)" @pin="togglePin(e.channel)" />
                </div>
                <div class="live-row-now">
                  <button v-if="e.now" type="button" class="on-now-open live-now-open"
                    :aria-label="'Show details for ' + e.now.title" @click="openDetails(e, e.now)">
                    <span v-if="showImages" class="live-now-thumb">
                      <programme-image :event-id="e.now.has_image ? e.now.program_id : null"
                        :channel-id="e.channel.id" :has-logo="e.channel.hasLogo" />
                    </span>
                    <div class="live-now-text">
                    <span class="block truncate">
                      <span class="text-sm font-semibold text-ink mr-3">{{ e.now.title }}</span>
                      <span v-if="isRecordingChannel(e.channel.id)" class="on-now-rec"><span class="led-dot sm live"></span>REC</span>
                      <span v-else class="font-mono text-xs text-ink-dim">{{ onNowMeta(e.now) }}</span>
                    </span>
                    <div class="progress" style="margin-top: 0.25rem; max-width: none;">
                      <div class="progress-track">
                        <div :class="['progress-fill', { rec: isRecordingChannel(e.channel.id) }]" :style="{ width: onNowPercent(e.now) + '%' }"></div>
                      </div>
                    </div>
                    </div>
                  </button>
                  <span v-else class="text-sm text-ink-mute">No guide data</span>
                </div>
                <button v-if="e.next" type="button" class="on-now-open live-row-next font-mono text-xs text-ink-dim min-w-0 truncate"
                  :aria-label="'Show details for ' + e.next.title" @click="openDetails(e, e.next)">
                  next: <span class="text-xs font-semibold font-sans text-ink">{{ e.next.title }}</span> {{ fmtClockTz(e.next.start) }}
                </button>
                <button type="button" class="btn btn-sm btn-icon btn-watch live-row-watch" title="Watch live"
                  :aria-label="'Watch ' + e.channel.name + ' live'"
                  @click="watchLive({ channel: e.channel, nowTitle: e.now?.title || '' })"><tv-icon /></button>
              </li>
            </ul>
          </div>
        </div>
      </section>
      <teleport to="body">
      <transition name="epg-sheet">
      <channels-modal v-if="channelsModal" :channels="data?.channels || []" :hidden-ids="data?.hiddenIds || []"
        :sort="data?.sort" :hide-sd-simulcasts="data?.hideSdSimulcasts"
        @close="channelsModal = false" @saved="onChannelPrefsSaved" />
      </transition>
      </teleport>
    </div>
  `,
  setup() {
    const { flashText, flashKind, flash } = useFlash()
    const data = ref(null)
    const error = ref('')
    const tvhConfigured = ref(null)
    const filterQ = ref('')
    const pinnedOnly = storedFlag({ key: LIVE_FAVOURITES_ONLY_KEY, fallback: false })
    const showImages = storedFlag({ key: LIVE_IMAGES_KEY, fallback: true })
    const channelsModal = ref(false)
    let pollTimer = null
    let boundaryTimer = null

    const matchesFilter = (e) => {
      const q = filterQ.value.trim().toLowerCase()
      if (!q) return true
      return [e.channel.name, e.channel.number, e.now?.title, e.next?.title]
        .some((v) => v != null && String(v).toLowerCase().includes(q))
    }

    const groups = computed(() => {
      const entries = (data.value?.entries || []).filter(matchesFilter)
      const pinned = entries.filter((e) => e.channel.pinned)
      const rest = pinnedOnly.value ? [] : entries.filter((e) => !e.channel.pinned)
      const anyPinned = pinned.length > 0
      return [
        ...(anyPinned ? [{ key: 'pinned', label: channelGroupLabel({ pinned: true }), entries: pinned }] : []),
        ...(rest.length ? [{ key: 'other', label: channelGroupLabel({ pinned: false, anyPinned }), entries: rest }] : []),
      ]
    })

    const favouritesHint = computed(() => pinnedOnly.value && !filterQ.value.trim())

    const emptyText = computed(() => {
      if (filterQ.value.trim()) return `No channels or shows match "${filterQ.value.trim()}".`
      return 'No channels to show. Open CHANNELS to unhide some.'
    })

    const scheduleBoundaryReload = () => {
      clearTimeout(boundaryTimer)
      const ends = (data.value?.entries || []).map((e) => e.now?.end).filter(Boolean)
      if (!ends.length) return
      const wait = Math.max(LIVE_BOUNDARY_MIN_MS, Math.min(...ends) - Date.now() + LIVE_BOUNDARY_GRACE_MS)
      boundaryTimer = setTimeout(load, wait)
    }

    const load = async () => {
      if (tvhConfigured.value === null) {
        const settings = await api('GET', '/api/settings').catch(() => ({}))
        tvhConfigured.value = Boolean(settings.tvh_url)
      }
      if (!tvhConfigured.value) return
      try {
        data.value = await api('GET', '/api/epg/now?all=1')
        error.value = ''
        scheduleBoundaryReload()
      } catch (err) {
        error.value = err.message
      }
    }

    const currentPins = () => (data.value?.channels || []).filter((c) => c.pinned).map((c) => String(c.id))

    const reorderPins = async (pins) => {
      try {
        await api('PUT', '/api/epg/channel-prefs', { pinned_ids: pins })
        await load()
      } catch (err) {
        flash({ msg: `Reorder failed: ${err.message}`, kind: 'err', ms: 6000 })
      }
    }

    const pinDrag = usePinDrag({ rowSelector: '.live-row.pinned', currentPins, onReorder: reorderPins })

    const togglePin = async (channel) => {
      if (pinDrag.didDrag()) return
      const pinnedIds = currentPins()
      try {
        await togglePinnedChannel({ pinnedIds, channelId: channel.id })
        await load()
      } catch (err) {
        flash({ msg: `Favourite failed: ${err.message}`, kind: 'err', ms: 6000 })
      }
    }

    const onChannelPrefsSaved = async () => {
      channelsModal.value = false
      await load()
      flash({ msg: 'Channel preferences saved.' })
    }

    const openDetails = (e, program) => openInGuide({ channelId: e.channel.id, program, returnTo: '#/live' })

    const onVisibility = () => {
      if (document.visibilityState === 'visible') load()
    }

    onMounted(() => {
      load()
      pollTimer = setInterval(load, LIVE_LIST_POLL_MS)
      document.addEventListener('visibilitychange', onVisibility)
    })
    onUnmounted(() => {
      clearInterval(pollTimer)
      clearTimeout(boundaryTimer)
      document.removeEventListener('visibilitychange', onVisibility)
    })

    return {
      data, error, tvhConfigured, filterQ, pinnedOnly, showImages, channelsModal, groups, favouritesHint, emptyText,
      load, togglePin, onChannelPrefsSaved, openDetails, watchLive,
      dragPinId: pinDrag.dragPinId, dropTargetId: pinDrag.dropTargetId, dropAfter: pinDrag.dropAfter,
      onPinPointerDown: pinDrag.onPinPointerDown, onPinPointerMove: pinDrag.onPinPointerMove,
      onPinPointerUp: pinDrag.onPinPointerUp, onPinPointerCancel: pinDrag.onPinPointerCancel,
      isRecordingChannel, onNowPercent, onNowMeta, fmtClockTz, flashText, flashKind,
    }
  },
}

const LIVE_LIST_POLL_MS = 30_000
const LIVE_BOUNDARY_MIN_MS = 5_000
const LIVE_BOUNDARY_GRACE_MS = 2_000
const LIVE_IMAGES_KEY = 'freetvarr.liveImages'
const LIVE_FAVOURITES_ONLY_KEY = 'freetvarr.liveFavouritesOnly'

const DashboardView = {
  template: `
    <div class="view-reveal space-y-6">
      <recording-now-panel />

      <section v-if="tvhConfigured" class="panel">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title">TV GUIDE</span>
            <info-button title="TV GUIDE" doc="guide/tv-guide#on-the-dashboard">
              <p>What is on now on your favourite channels, what is on next, and the next recordings TVHeadend has scheduled. All of it comes from TVHeadend.</p>
              <p>Star a channel in Live TV or the TV Guide to add it here.</p>
              <p>Tap a programme or a recording to open its details in the TV Guide. The TV button plays the channel live.</p>
            </info-button>
          </span>
          <div class="flex items-center gap-4">
            <a href="#/live" class="link-arrow text-xs font-mono uppercase tracking-[0.16em]">Live TV <arrow-right-icon /></a>
            <a href="#/guide" class="link-arrow text-xs font-mono uppercase tracking-[0.16em]">Guide <arrow-right-icon /></a>
          </div>
        </header>
        <div v-if="!guideOk" class="panel-body flex flex-wrap items-center gap-3">
          <span class="status-readout err">Guide unavailable. TVHeadend did not answer.</span>
          <button type="button" class="btn btn-sm" @click="loadGuidePanel"><refresh-icon /> RETRY</button>
        </div>
        <div v-else class="panel-body space-y-5">
          <div v-if="onNow.length">
            <div class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim mb-3">On now · favourites</div>
            <div class="space-y-3">
            <div v-for="e in onNow" :key="e.channel.id" class="flex items-center gap-3 md:gap-4">
              <channel-logo class="shrink-0" :channel-id="e.channel.id" :has-logo="e.channel.hasLogo" />
              <span class="font-mono text-xs text-ink-dim w-20 md:w-28 shrink-0 truncate" :title="e.channel.name">{{ e.channel.name }}</span>
              <div class="flex-1 min-w-0">
                <button v-if="e.now" type="button" class="on-now-open block w-full"
                  :aria-label="'Show details for ' + e.now.title"
                  @click="openInGuide({ channelId: e.channel.id, program: e.now })">
                  <span class="block truncate">
                    <span class="text-sm font-semibold text-ink mr-3">{{ e.now.title }}</span>
                    <span v-if="isRecordingChannel(e.channel.id)" class="on-now-rec"><span class="led-dot sm live"></span>REC</span>
                    <span v-else class="font-mono text-xs text-ink-dim">{{ onNowMeta(e.now) }}</span>
                  </span>
                  <div class="progress" style="margin-top: 0.25rem; max-width: none;">
                    <div class="progress-track">
                      <div :class="['progress-fill', { rec: isRecordingChannel(e.channel.id) }]" :style="{ width: onNowPercent(e.now) + '%' }"></div>
                    </div>
                  </div>
                </button>
                <span v-else class="text-sm text-ink-mute">off air</span>
              </div>
              <button v-if="e.next" type="button" class="on-now-open hidden sm:block font-mono text-xs text-ink-dim min-w-0 max-w-[16rem] truncate"
                :aria-label="'Show details for ' + e.next.title"
                @click="openInGuide({ channelId: e.channel.id, program: e.next })">
                next: <span class="text-xs font-semibold font-sans text-ink">{{ e.next.title }}</span> {{ fmtClockTz(e.next.start) }}
              </button>
              <button type="button" class="btn btn-sm btn-icon btn-watch shrink-0" title="Watch live"
                :aria-label="'Watch ' + e.channel.name + ' live'"
                @click="watchLive({ channel: e.channel, nowTitle: e.now?.title || '' })"><tv-icon /></button>
            </div>
            </div>
          </div>
          <div v-else class="flex flex-wrap items-center gap-3">
            <p class="text-xs text-ink-dim">Star channels to see what's on now.</p>
            <a href="#/live" class="btn btn-sm no-hover-underline">OPEN LIVE TV</a>
          </div>
          <div>
            <div class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim mb-3">Next recordings</div>
            <p v-if="!guideUpcoming.length" class="text-xs text-ink-dim">Nothing scheduled to record.</p>
            <div v-else class="space-y-2">
              <button v-for="r in guideUpcoming" :key="r.id" type="button"
                class="on-now-open flex w-full items-center gap-2.5 font-mono text-xs text-ink-dim min-w-0"
                :aria-label="'Show details for ' + r.name"
                @click="openInGuide({ upcoming: r })">
                <span class="led-dot sm shrink-0" :style="{ background: isSeriesRec(r) ? '#e2b03c' : '#1eb6ff' }"></span>
                <span class="truncate min-w-0"><span class="text-ink">{{ r.name }}</span>
                · {{ fmtRelativeDay(tsOfMs(r.startDate)) }} {{ fmtClockTz(tsOfMs(r.startDate)) }}<template v-if="r.episodeTitle"> · {{ r.episodeTitle }}</template> · {{ isSeriesRec(r) ? 'series' : 'one-off' }}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="panel">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title">SYNC DECK</span>
            <info-button title="SYNC DECK" doc="guide/syncs#dashboard-sync-deck">
              <p>A sync reads the finished recordings in TVHeadend, imports the episodes of the shows you follow into your media folder, then asks Plex to refresh.</p>
              <ul><li><strong>STATUS</strong>: idle, or syncing.</li><li><strong>LAST SYNC</strong>: when the last sync ran, and how it went.</li><li><strong>RESULT</strong>: what it imported, or what failed.</li><li><strong>SYNC NOW</strong>: runs a sync at once, without waiting for the schedule.</li></ul>
              <p>The strip below shows TVHeadend, your followed shows, the last 7 days of recordings, and Plex. Press a cell to open its page.</p>
            </info-button>
          </span>
          <span v-if="nextSyncLabel" class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim" :title="'Cron: ' + syncStatus.cron">NEXT SYNC · <span class="text-ink">{{ nextSyncLabel }}</span></span>
        </header>
        <div class="deck-status">
          <div class="deck-cell deck-cell-status">
            <span class="deck-cell-label"><span :class="['led-dot', 'sm', shownSyncId ? 'live' : 'idle']"></span>STATUS</span>
            <span :class="['deck-cell-value', { 'deck-cell-live': shownSyncId }]">{{ shownSyncId ? 'Syncing' : 'Idle' }}</span>
          </div>
          <div class="deck-zone-action">
            <button type="button" class="btn btn-primary" @click="syncNow" :disabled="!!shownSyncId || starting">
              <play-icon v-if="!shownSyncId && !starting" /> {{ syncButtonLabel }}
            </button>
          </div>
          <a href="#/syncs" class="deck-cell deck-cell-last no-hover-underline" :title="lastSyncCell.title">
            <span class="deck-cell-label">
              <span v-if="lastSyncCell.dot" :class="['led-dot', 'sm', { live: lastSyncCell.live }]" :style="{ background: lastSyncCell.dot }"></span>{{ lastSyncCell.label }}
            </span>
            <span :class="['deck-cell-value', { 'deck-cell-dim': lastSyncCell.dim }]">{{ lastSyncCell.value }}</span>
          </a>
          <div :key="resultCell.key" class="deck-cell deck-cell-result deck-fade" :title="resultCell.title">
            <span class="deck-cell-label">{{ resultCell.label }}</span>
            <span :class="['deck-cell-value', resultCell.tone]">{{ resultCell.value }}<span v-if="resultCell.failed" class="deck-cell-err"> · {{ resultCell.failed }} failed</span></span>
          </div>
        </div>
        <div class="deck-pipeline">
          <a v-for="cell in pipeline" :key="cell.label" :href="cell.href" class="deck-cell no-hover-underline">
            <span class="deck-cell-label">
              <span v-if="cell.health" class="led-dot sm" :style="{ background: HEALTH_COLOURS[cell.health] }"></span>{{ cell.label }}
            </span>
            <span :class="['deck-cell-value', { 'deck-cell-cta': cell.cta }]" :title="cell.title || cell.value">{{ cell.value }}</span>
          </a>
        </div>
      </section>

      <section class="panel">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title">RECENT SYNCS</span>
            <info-button title="RECENT SYNCS" doc="guide/syncs#reading-a-sync">
              <p>The last few syncs Freetvarr ran, newest first, with what each one imported.</p>
              <p>A sync is <strong>ok</strong> unless something failed. <strong>See all</strong> opens the Syncs tab with the full history.</p>
            </info-button>
          </span>
          <a href="#/syncs" class="link-arrow text-xs font-mono uppercase tracking-[0.16em]">See all <arrow-right-icon /></a>
        </header>
        <div class="panel-body">
          <table v-if="recentSyncs.length" class="deck-table hidden md:table">
            <thead><tr>
              <th>Started</th><th>Status</th><th>Summary</th>
            </tr></thead>
            <tbody>
              <tr v-for="s in recentSyncs" :key="s.id" :class="{ active: s.id === syncStatus.activeSyncId }">
                <td class="font-mono">{{ fmtTime(s.started_at) }}</td>
                <td><span :class="['pill', s.status]">{{ s.status }}</span></td>
                <td><summary-line :summary="s.summary"/></td>
              </tr>
            </tbody>
          </table>
          <div v-if="recentSyncs.length" class="md:hidden space-y-3">
            <article v-for="s in recentSyncs" :key="s.id"
              :class="['deck-card', 'space-y-2', { active: s.id === syncStatus.activeSyncId }]">
              <div class="flex items-start justify-between gap-3">
                <span class="deck-card-meta">{{ fmtTime(s.started_at) }}</span>
                <span :class="['pill', s.status]">{{ s.status }}</span>
              </div>
              <summary-line :summary="s.summary"/>
            </article>
          </div>
          <p v-else class="text-ink-dim text-sm">No syncs yet.</p>
        </div>
      </section>
    </div>
  `,
  setup() {
    const { flashText, flashKind, flash } = useFlash()
    const starting = ref(false)
    const heldSyncId = ref(null)
    const heldSyncStartedAt = ref(null)
    const shownSyncId = computed(() => syncStatus.value.activeSyncId || heldSyncId.value)
    const recentSyncs = ref([])
    const statsLoaded = ref(false)
    const showCount = ref(0)
    const showEnabledCount = ref(0)
    const recordings7dCount = ref(0)
    const plexConfigured = ref(false)
    const plexHost = ref('')
    const tvhState = ref(null)
    const tvhReachable = ref(false)
    const tvhConfigured = ref(false)
    const onNow = ref([])
    const guideUpcoming = ref([])
    const guideSeriesLinks = ref(new Set())
    const guideOk = ref(true)

    const lastSync = computed(() => recentSyncs.value[0] || null)

    const deckSync = computed(() => {
      const held = heldSyncId.value
      if (!held || lastSync.value?.id === held) return lastSync.value
      return { id: held, status: 'running', started_at: heldSyncStartedAt.value, summary: null }
    })


    const loadGuidePanel = async () => {
      if (!tvhConfigured.value) {
        tvhState.value = null
        tvhReachable.value = false
        return
      }
      const [s, onNowResult] = await Promise.all([
        api('GET', '/api/epg/state').catch(() => null),
        api('GET', '/api/epg/now').catch(() => null),
      ])
      tvhState.value = s
      tvhReachable.value = Boolean(s) && !s.stale
      guideSeriesLinks.value = new Set((s?.seriesTags || []).map((t) => String(t.seriesLinkId ?? t.id)))
      guideUpcoming.value = (s?.futureRecordings || [])
        .filter((r) => !r.pendingDelete)
        .sort((a, b) => tsOfMs(a.startDate) - tsOfMs(b.startDate))
        .slice(0, 3)
      guideOk.value = Boolean(onNowResult)
      if (onNowResult) onNow.value = onNowResult.entries || []
    }

    const isSeriesRec = (r) =>
      r?.seriesLinkId != null && guideSeriesLinks.value.has(String(r.seriesLinkId))


    const refresh = async () => {
      const [syncs, , shows, recordings, settings] = await Promise.all([
        api('GET', '/api/syncs').catch(() => ({ syncs: [] })),
        loadSyncStatus().then(ensureSyncPolling),
        api('GET', '/api/shows').catch(() => ({ shows: [] })),
        api('GET', '/api/recordings').catch(() => ({ recordings: [] })),
        api('GET', '/api/settings').catch(() => ({})),
      ])
      recentSyncs.value = (syncs.syncs || []).slice(0, 5)
      showCount.value = shows.shows?.length || 0
      showEnabledCount.value = shows.shows?.filter((s) => s.enabled).length || 0
      recordings7dCount.value = recordings.recordings?.filter((r) => within7Days(r.imported_at)).length || 0
      plexConfigured.value = Boolean(settings.plex_url && settings.plex_token_set && settings.plex_tv_section_id)
      plexHost.value = hostOf(settings.plex_url)
      tvhConfigured.value = Boolean(settings.tvh_url)
      await loadGuidePanel()
      statsLoaded.value = true
    }

    const tvhCell = computed(() => {
      const base = { label: 'TVHEADEND', href: '#/settings/tvheadend' }
      if (!statsLoaded.value) return { ...base, value: '—' }
      if (!tvhConfigured.value) return { ...base, health: 'off', value: 'not set up', cta: true }
      if (!tvhReachable.value) return { ...base, href: '#/doctor/tvheadend', health: 'err', value: 'unreachable' }
      const s = tvhState.value
      const bits = [
        ...(s?.tunerCount ? [`${s.tunerCount} tuner${s.tunerCount === 1 ? '' : 's'}`] : []),
        ...(s?.storageInfo?.free ? [`${fmtBytes(s.storageInfo.free)} free`] : []),
      ]
      return { ...base, health: 'ok', value: bits.join(' · ') || 'reachable' }
    })

    const showsCell = computed(() => {
      if (!statsLoaded.value) return { label: 'SHOWS', href: '#/shows', value: '—' }
      if (!showCount.value) return { label: 'SHOWS', href: '#/guide', value: 'follow a show', cta: true }
      return { label: 'SHOWS', href: '#/shows', value: `${showCount.value} · ${showEnabledCount.value} enabled` }
    })

    const recordingsCell = computed(() => ({
      label: 'RECORDINGS 7D',
      href: '#/recordings',
      value: statsLoaded.value ? `${recordings7dCount.value} imported` : '—',
    }))

    const plexCell = computed(() => {
      const base = { label: 'PLEX', href: '#/settings/plex' }
      if (!statsLoaded.value) return { ...base, value: '—' }
      if (!plexConfigured.value) return { ...base, health: 'off', value: 'not set up', cta: true }
      return { ...base, health: 'ok', value: plexHost.value || 'connected' }
    })

    const pipeline = computed(() => [tvhCell.value, showsCell.value, recordingsCell.value, plexCell.value])

    const lastSyncCell = computed(() => {
      const s = deckSync.value
      if (!s) return { label: 'LAST SYNC', value: 'never', dim: true }
      const nowMs = now.value.getTime()
      const title = [`#${s.id}`, fmtTime(s.started_at), s.summary?.trigger].filter(Boolean).join(' · ')
      if (s.status === 'running') {
        return { label: 'ELAPSED', value: fmtElapsed({ at: s.started_at, nowMs }), dot: SYNC_DOTS.running, live: true, title }
      }
      return { label: 'LAST SYNC', value: fmtAgo({ at: s.finished_at || s.started_at, nowMs }), dot: SYNC_DOTS[s.status], title }
    })

    const resultCell = computed(() => {
      if (flashText.value) {
        return { key: `flash-${flashText.value}`, label: 'NOTICE', value: flashText.value, tone: flashKind.value, title: flashText.value }
      }
      const s = deckSync.value
      if (!s) return { key: 'none', label: 'RESULT', value: '—', tone: 'deck-cell-dim' }
      if (s.status === 'running') return { key: `run-${s.id}`, label: 'RESULT', value: 'in progress', tone: 'deck-cell-dim' }
      const sum = s.summary || {}
      const errors = (sum.errors || []).join('\n')
      if (s.status === 'error') {
        const text = sum.message || sum.errors?.[0] || 'failed'
        return { key: `err-${s.id}`, label: 'RESULT', value: text, tone: 'err', title: errors || text }
      }
      if (sum.imported) return { key: `ok-${s.id}`, label: 'RESULT', value: `${sum.imported} imported`, failed: sum.failed, title: errors }
      if (sum.failed) return { key: `fail-${s.id}`, label: 'RESULT', value: `${sum.failed} failed`, tone: 'err', title: errors }
      return { key: `none-${s.id}`, label: 'RESULT', value: sum.message || 'nothing new', tone: 'deck-cell-dim' }
    })

    const nextSyncLabel = computed(() => {
      const at = Date.parse(syncStatus.value.nextRunAt || '')
      if (!at) return ''
      const mins = Math.ceil((at - now.value.getTime()) / 60_000)
      if (mins <= 0) return 'due'
      if (mins < 60) return `in ${mins} min`
      return `at ${fmtClockTz(at)}`
    })

    const syncButtonLabel = computed(() => {
      if (starting.value) return 'STARTING…'
      if (shownSyncId.value) return 'SYNCING…'
      return 'SYNC NOW'
    })

    const holdSyncState = (syncId) => {
      heldSyncId.value = syncId
      heldSyncStartedAt.value = new Date().toISOString()
      setTimeout(() => { heldSyncId.value = null }, MIN_SYNC_DISPLAY_MS)
    }

    const syncNow = async () => {
      starting.value = true
      try {
        const r = await api('POST', '/api/sync')
        if (r.alreadyRunning) flash({ msg: 'A sync is already running.', kind: 'info' })
        else holdSyncState(r.syncId)
        await loadSyncStatus()
        ensureSyncPolling()
      } catch (err) {
        flash({ msg: `Error: ${err.message}`, kind: 'err', ms: 5000 })
      } finally {
        starting.value = false
      }
    }

    let pollTimer = null
    onMounted(() => {
      refresh()
      pollTimer = setInterval(refresh, DASHBOARD_POLL_MS)
    })
    onUnmounted(() => {
      if (pollTimer) clearInterval(pollTimer)
    })
    const stopWatch = watch(shownSyncId, (curr) => {
      if (!curr || !heldSyncId.value) refresh()
    })
    onUnmounted(stopWatch)

    return {
      syncStatus, shownSyncId, lastSyncCell, resultCell, nextSyncLabel, recentSyncs,
      tvhConfigured, pipeline, HEALTH_COLOURS,
      onNow, guideUpcoming, guideOk, onNowPercent, onNowMeta, isSeriesRec, fmtClockTz, fmtRelativeDay, tsOfMs,
      isRecordingChannel, loadGuidePanel,
      watchLive, openInGuide, starting, syncNow, syncButtonLabel, fmtTime,
      flashText, flashKind,
    }
  },
}

const ShowsView = {
  template: `
    <div class="view-reveal space-y-6">
      <section class="panel">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title">TRACKED SHOWS · {{ shows.length }}</span>
            <info-button title="TRACKED SHOWS" doc="guide/following-shows">
              <p>The shows Freetvarr imports. Each sync checks the finished recordings in TVHeadend and files every episode whose title matches a show here into that show's folder for Plex.</p>
              <p>TVHeadend decides what records; this list decides what Freetvarr imports. To record a show, set a series recording in the TV Guide.</p>
              <p>For each show you can turn it off, sync it now, remove the TVHeadend copy after import, or set ad removal. A deleted show keeps the files already imported.</p>
            </info-button>
          </span>
          <span v-if="flashText" :class="['status-readout', flashKind]">{{ flashText }}</span>
        </header>
        <div class="panel-body">
          <table v-if="shows.length" class="deck-table hidden md:table">
            <thead><tr>
              <th>Show pattern</th>
              <th>Destination</th>
              <th>Season template</th>
              <th>Enabled</th>
              <th title="Remove the recording from TVHeadend after each successful import. TVHeadend keeps the episode in its history, so it does not record it again.">Remove after import</th>
              <th title="Detect = report ad breaks only; Cut = remove them from the file (keeps a .orig backup).">Ad removal</th>
              <th></th>
            </tr></thead>
            <tbody>
              <tr v-for="s in shows" :key="s.id">
                <td class="font-mono text-ink">{{ s.show_pattern }}</td>
                <td><code>{{ s.dest_folder }}</code></td>
                <td><code>{{ s.season_template }}</code></td>
                <td>
                  <input type="checkbox" class="chk" :checked="s.enabled" @change="toggle(s, $event.target.checked)" />
                </td>
                <td>
                  <input type="checkbox" class="chk" :checked="s.delete_after_import" @change="toggleDeleteAfter(s, $event.target.checked)" />
                </td>
                <td>
                  <select class="field-input" style="width: auto; padding-top: 0.3rem; padding-bottom: 0.3rem;"
                    :value="s.ad_removal" :disabled="!adRemovalEnabled"
                    :title="adRemovalEnabled ? '' : 'Enable ad removal in Settings first.'"
                    @change="setAdRemoval(s, $event.target.value)">
                    <option value="off">OFF</option>
                    <option value="detect">DETECT</option>
                    <option value="cut">CUT</option>
                  </select>
                </td>
                <td>
                  <div class="flex items-center gap-2 flex-wrap">
                    <button type="button" class="btn" @click="syncOne(s)"
                      :disabled="!s.enabled || syncingId === s.id"
                      :title="s.enabled ? 'Sync just this show now' : 'Enable to sync'">
                      <template v-if="syncingId === s.id">STARTING…</template><template v-else><play-icon /> SYNC</template>
                    </button>
                    <button type="button" class="btn btn-danger" @click="remove(s)">DELETE</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="shows.length" class="md:hidden space-y-3">
            <article v-for="s in shows" :key="s.id" class="deck-card space-y-3">
              <span class="deck-card-title">{{ s.show_pattern }}</span>
              <div class="space-y-1">
                <p class="deck-card-meta"><span class="deck-card-label">Dest</span> <code>{{ s.dest_folder }}</code></p>
                <p class="deck-card-meta"><span class="deck-card-label">Seasons</span> <code>{{ s.season_template }}</code></p>
              </div>
              <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
                <label class="flex items-center gap-2 cursor-pointer font-mono text-xs uppercase tracking-[0.08em] text-ink-dim">
                  <input type="checkbox" class="chk" :checked="s.enabled" @change="toggle(s, $event.target.checked)" />
                  Enabled
                </label>
                <label class="flex items-center gap-2 cursor-pointer font-mono text-xs uppercase tracking-[0.08em] text-ink-dim">
                  <input type="checkbox" class="chk" :checked="s.delete_after_import" @change="toggleDeleteAfter(s, $event.target.checked)" />
                  Remove after import
                </label>
              </div>
              <div class="flex items-center gap-3">
                <span class="deck-card-label whitespace-nowrap">Ad removal</span>
                <select class="field-input flex-1" style="padding-top: 0.3rem; padding-bottom: 0.3rem;"
                  :value="s.ad_removal" :disabled="!adRemovalEnabled"
                  @change="setAdRemoval(s, $event.target.value)">
                  <option value="off">OFF</option>
                  <option value="detect">DETECT</option>
                  <option value="cut">CUT</option>
                </select>
              </div>
              <div class="grid grid-cols-2 gap-2 pt-1">
                <button type="button" class="btn justify-center" @click="syncOne(s)"
                  :disabled="!s.enabled || syncingId === s.id">
                  <template v-if="syncingId === s.id">STARTING…</template><template v-else><play-icon /> SYNC</template>
                </button>
                <button type="button" class="btn btn-danger justify-center" @click="remove(s)">DELETE</button>
              </div>
            </article>
          </div>
          <p v-else class="text-ink-dim text-sm">
            No shows tracked yet — add one below to start tracking.
          </p>
        </div>
      </section>

      <section class="panel">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title">TRACK NEW SHOW</span>
            <info-button title="TRACK NEW SHOW" doc="guide/following-shows#add-a-show">
              <p>Pick a title TVHeadend has recorded, or type one. A recording goes to the first show whose title match appears in the recording's title.</p>
              <p>Freetvarr suggests a folder under your media root, and matches folders that are already there. The season template sets the name of each season folder.</p>
              <p><strong>Auto-remove</strong> deletes the TVHeadend copy after Plex has the file. <strong>Ad removal</strong> finds or cuts the ad breaks, when it is on in Settings.</p>
            </info-button>
          </span>
        </header>
        <form class="panel-body" @submit.prevent="add">
          <div class="grid gap-4 md:grid-cols-2">
            <div class="field-row">
              <label class="field-label">Title match</label>
              <div class="flex flex-wrap items-center gap-2">
                <input type="text" v-model="newPattern" list="tvh-shows" placeholder="e.g. Bluey" class="field-input flex-1 min-w-[12rem]" />
                <button type="button" class="btn btn-sm" @click="loadTvhShows" :disabled="loadingShows"
                  title="List the titles TVHeadend has finished recordings for.">
                  <template v-if="loadingShows">LISTING…</template><template v-else><refresh-icon /> REFRESH TITLES</template>
                </button>
              </div>
              <datalist id="tvh-shows">
                <option v-for="fs in tvhShows" :key="fs.id" :value="fs.title" />
              </datalist>
              <p class="text-xs text-ink-mute mt-2">
                Case-insensitive substring of the TVHeadend recording title.
              </p>
            </div>
            <div class="field-row">
              <label class="field-label">Destination folder under <code>{{ mediaRoot || '/media/tv' }}</code></label>
              <input type="text" v-model="newFolder" list="media-folders" placeholder="e.g. Bluey (2018)" class="field-input" />
              <datalist id="media-folders">
                <option v-for="d in folders" :key="d" :value="d" />
              </datalist>
              <p v-if="suggestion" class="text-xs text-ink-dim mt-2">
                Suggested ({{ suggestionIsNew ? 'new folder' : 'existing' }}):
                <code>{{ suggestion }}</code>
                <button type="button" class="btn-link" @click="newFolder = suggestion">use</button>
              </p>
            </div>
            <div class="field-row">
              <label class="field-label">Season template</label>
              <input type="text" v-model="newTemplate" placeholder="Season {season}" class="field-input" />
            </div>
            <div class="field-row">
              <span class="field-label">Auto-remove</span>
              <label class="flex items-center gap-3 cursor-pointer h-[2.5rem]">
                <input id="new-del-after" type="checkbox" class="chk" v-model="newDeleteAfter" />
                <span class="font-mono text-sm text-ink-dim">
                  Remove from TVHeadend after each successful import
                </span>
              </label>
            </div>
            <div class="field-row">
              <label class="field-label">Ad removal</label>
              <select class="field-input" v-model="newAdRemoval" :disabled="!adRemovalEnabled">
                <option value="off">OFF</option>
                <option value="detect">DETECT — report ad breaks only</option>
                <option value="cut">CUT — remove ad breaks (keeps .orig backup)</option>
              </select>
              <p v-if="!adRemovalEnabled" class="text-xs text-ink-mute mt-2">
                Enable ad removal in Settings to use this.
              </p>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-3 mt-2">
            <button type="submit" class="btn btn-primary" :disabled="adding">
              <template v-if="adding">ADDING…</template><template v-else><plus-icon /> TRACK SHOW</template>
            </button>
            <span v-if="formStatusText" :class="['status-readout', formStatusKind]">{{ formStatusText }}</span>
          </div>
        </form>
      </section>
    </div>
  `,
  setup() {
    const { flashText, flashKind, flash, flashUntilSyncDone } = useFlash()
    const [formStatusText, formStatusKind, setFormStatus] = makeStatus()
    const shows = ref([])
    const tvhShows = ref([])
    const folders = ref([])
    const newPattern = ref('')
    const newFolder = ref('')
    const newTemplate = ref('Season {season}')
    const newDeleteAfter = ref(false)
    const newAdRemoval = ref('off')
    const suggestion = ref('')
    const suggestionIsNew = ref(false)
    const adding = ref(false)
    const loadingShows = ref(false)
    const syncingId = ref(null)
    const mediaRoot = ref('')
    const tvhUrlSet = ref(false)
    const adRemovalEnabled = ref(false)

    const refresh = async () => {
      const r = await api('GET', '/api/shows')
      shows.value = r.shows
    }

    const loadStorageHint = async () => {
      const s = await api('GET', '/api/settings').catch(() => ({}))
      mediaRoot.value = s.media_root || ''
      tvhUrlSet.value = Boolean(s.tvh_url)
      adRemovalEnabled.value = Boolean(s.ad_removal_enabled)
    }

    const suggestFor = async (pattern) => {
      const trimmed = (pattern || '').trim()
      if (trimmed.length < 2) {
        suggestion.value = ''
        suggestionIsNew.value = false
        return
      }
      try {
        const r = await api('GET', `/api/folder-suggest?show=${encodeURIComponent(trimmed)}`)
        folders.value = r.folders || []
        if (r.match?.folder) {
          suggestion.value = r.match.folder
          suggestionIsNew.value = false
        } else {
          suggestion.value = trimmed
          suggestionIsNew.value = true
        }
      } catch {
        suggestion.value = trimmed
        suggestionIsNew.value = true
      }
    }

    let debounceTimer = null
    watch(newPattern, (v) => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => suggestFor(v), 250)
    })

    onMounted(async () => {
      await Promise.all([refresh(), loadStorageHint()])
      if (shows.value.length === 0 && tvhUrlSet.value && !loadingShows.value) {
        await loadTvhShows()
      }
    })

    const add = async () => {
      if (!newPattern.value.trim() || !newFolder.value.trim()) {
        setFormStatus('Title match and folder are required.', 'err', 5000)
        return
      }
      adding.value = true
      try {
        await api('POST', '/api/shows', {
          show_pattern: newPattern.value.trim(),
          dest_folder: newFolder.value.trim(),
          season_template: newTemplate.value.trim() || 'Season {season}',
          delete_after_import: newDeleteAfter.value === true,
          ad_removal: newAdRemoval.value,
        })
        newPattern.value = ''
        newFolder.value = ''
        newTemplate.value = 'Season {season}'
        newDeleteAfter.value = false
        newAdRemoval.value = 'off'
        suggestion.value = ''
        await refresh()
        setFormStatus('Added.')
      } catch (err) {
        setFormStatus(`Error: ${err.message}`, 'err', 5000)
      } finally {
        adding.value = false
      }
    }

    const toggle = async (s, enabled) => {
      try {
        await api('PATCH', `/api/shows/${s.id}`, { enabled })
        await refresh()
      } catch (err) {
        flash({ msg: `Error: ${err.message}`, kind: 'err', ms: 5000 })
      }
    }

    const toggleDeleteAfter = async (s, delete_after_import) => {
      try {
        await api('PATCH', `/api/shows/${s.id}`, { delete_after_import })
        await refresh()
      } catch (err) {
        flash({ msg: `Error: ${err.message}`, kind: 'err', ms: 5000 })
      }
    }

    const setAdRemoval = async (s, ad_removal) => {
      try {
        await api('PATCH', `/api/shows/${s.id}`, { ad_removal })
        await refresh()
      } catch (err) {
        flash({ msg: `Error: ${err.message}`, kind: 'err', ms: 5000 })
      }
    }

    const remove = async (s) => {
      if (!confirm(`Delete show "${s.show_pattern}"?`)) return
      try {
        await api('DELETE', `/api/shows/${s.id}`)
        await refresh()
        flash({ msg: `Removed "${s.show_pattern}".` })
      } catch (err) {
        flash({ msg: `Error: ${err.message}`, kind: 'err', ms: 5000 })
      }
    }

    const loadTvhShows = async () => {
      loadingShows.value = true
      setFormStatus('Listing TVHeadend recordings…', 'info', 0)
      try {
        const r = await api('POST', '/api/tvh-shows')
        tvhShows.value = r.shows
        setFormStatus(`Found ${r.shows.length} title${r.shows.length === 1 ? '' : 's'}.`, 'ok', 5000)
      } catch (err) {
        setFormStatus(`Error: ${err.message}`, 'err', 5000)
      } finally {
        loadingShows.value = false
      }
    }

    const syncOne = async (s) => {
      syncingId.value = s.id
      try {
        const r = await api('POST', '/api/sync', { show_id: s.id })
        if (r.alreadyRunning) flash({ msg: 'A sync is already running.', kind: 'info' })
        else flashUntilSyncDone({ msg: `Started sync #${r.syncId} for "${s.show_pattern}".` })
        await loadSyncStatus()
        ensureSyncPolling()
      } catch (err) {
        flash({ msg: `Error: ${err.message}`, kind: 'err', ms: 5000 })
      } finally {
        syncingId.value = null
      }
    }

    return {
      shows, tvhShows, folders, mediaRoot,
      newPattern, newFolder, newTemplate, newDeleteAfter, newAdRemoval,
      suggestion, suggestionIsNew, adding, loadingShows, syncingId, adRemovalEnabled,
      add, toggle, toggleDeleteAfter, setAdRemoval, remove, loadTvhShows, syncOne,
      flashText, flashKind, formStatusText, formStatusKind,
    }
  },
}

const SyncsView = {
  template: `
    <div class="view-reveal space-y-6">
      <section class="panel">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title" title="Older syncs auto-pruned to keep the latest 500.">SYNCS · {{ filter === 'all' ? 'LATEST' : filter.toUpperCase() }} {{ syncs.length }}</span>
            <info-button title="SYNCS" doc="guide/syncs">
              <p>Every sync Freetvarr has run, newest first: when it started, and what it imported, failed, or removed.</p>
              <p>Syncs run on the schedule in Settings, or when you press <strong>SYNC NOW</strong>. Only one runs at a time.</p>
              <p>Filter the list by activity. Freetvarr keeps the latest 500 syncs.</p>
            </info-button>
          </span>
          <div class="flex items-center gap-3">
            <span v-if="syncStatus.cron" class="text-xs font-mono text-ink-dim">CRON · <code>{{ syncStatus.cron }}</code></span>
            <span class="text-xs font-mono text-ink-mute" title="History is auto-capped server-side at 500 most recent syncs.">CAP · 500</span>
            <span v-if="flashText" :class="['status-readout', flashKind]">{{ flashText }}</span>
          </div>
        </header>
        <div class="panel-body space-y-4">
          <div class="flex flex-wrap gap-3">
            <button type="button" class="btn btn-primary" @click="syncNow" :disabled="starting || !!syncStatus.activeSyncId">
              <template v-if="syncStatus.activeSyncId"><span class="spinner"></span> SYNC RUNNING…</template>
              <template v-else-if="starting">STARTING…</template>
              <template v-else><play-icon /> SYNC NOW</template>
            </button>
            <button type="button" class="btn" @click="manualRefresh"><refresh-icon /> REFRESH</button>
            <button type="button" class="btn btn-danger" @click="clearAll" :disabled="!syncs.length"><cross-icon /> CLEAR HISTORY</button>
          </div>

          <div class="flex items-center gap-2 min-w-0">
            <span class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim">ACTIVITY</span>
            <div class="chip-row md:flex-wrap">
              <button v-for="opt in filterOptions" :key="opt.key"
                type="button"
                :class="['btn', 'btn-sm', filter === opt.key ? 'btn-on' : '']"
                @click="setFilter(opt.key)">{{ opt.label }}</button>
            </div>
          </div>

          <table v-if="syncs.length" class="deck-table hidden md:table">
            <thead><tr>
              <th>Started</th><th>Finished</th><th>Status</th><th>Summary</th><th></th>
            </tr></thead>
            <tbody>
              <tr v-for="s in syncs" :key="s.id" :class="{ active: s.id === syncStatus.activeSyncId }">
                <td class="font-mono">{{ fmtTime(s.started_at) }}</td>
                <td class="font-mono">{{ fmtTime(s.finished_at) }}</td>
                <td><span :class="['pill', s.status]">{{ s.status }}</span></td>
                <td><summary-line :summary="s.summary"/></td>
                <td>
                  <button type="button" class="btn btn-sm btn-icon btn-danger"
                    :disabled="s.id === syncStatus.activeSyncId"
                    @click="removeSync(s)"
                    title="Delete this sync from history.">
                    <trash-icon />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="syncs.length" class="md:hidden space-y-3">
            <article v-for="s in syncs" :key="s.id"
              :class="['deck-card', 'space-y-2', { active: s.id === syncStatus.activeSyncId }]">
              <div class="flex items-start justify-between gap-3">
                <span :class="['pill', s.status]">{{ s.status }}</span>
                <button type="button" class="btn btn-sm btn-icon btn-danger"
                  :disabled="s.id === syncStatus.activeSyncId"
                  @click="removeSync(s)">
                  <trash-icon />
                </button>
              </div>
              <p class="deck-card-meta">
                {{ fmtTime(s.started_at) }}<template v-if="s.finished_at"> – {{ fmtTime(s.finished_at) }}</template>
              </p>
              <summary-line :summary="s.summary"/>
            </article>
          </div>
          <p v-else class="text-ink-dim text-sm">
            {{ filter === 'all' ? 'No syncs yet.' : 'No syncs match the current filter.' }}
          </p>
        </div>
      </section>
    </div>
  `,
  setup() {
    const { flashText, flashKind, flash, flashUntilSyncDone } = useFlash()
    const syncs = ref([])
    const starting = ref(false)
    const filter = ref('all')
    const filterOptions = [
      { key: 'all',       label: 'ALL' },
      { key: 'manual',    label: 'MANUAL' },
      { key: 'cron',      label: 'CRON' },
      { key: 'imports',   label: 'IMPORTS' },
      { key: 'fails',     label: 'FAILS' },
      { key: 'deletes',   label: 'REMOVALS' },
      { key: 'empty',     label: 'EMPTY' },
    ]

    const refresh = async () => {
      const qs = filter.value === 'all' ? '' : `?filter=${filter.value}`
      const r = await api('GET', `/api/syncs${qs}`)
      syncs.value = r.syncs
    }

    const manualRefresh = async () => {
      try {
        await refresh()
        const label = filter.value === 'all' ? 'syncs' : `${filter.value} syncs`
        flash({ msg: `Refreshed — ${syncs.value.length} ${label}.` })
      } catch (err) {
        flash({ msg: `Refresh failed: ${err.message}`, kind: 'err', ms: 6000 })
      }
    }

    const setFilter = (v) => {
      filter.value = v
      refresh()
    }

    const syncNow = async () => {
      starting.value = true
      try {
        const r = await api('POST', '/api/sync')
        if (r.alreadyRunning) flash({ msg: 'A sync is already running.', kind: 'info' })
        else flashUntilSyncDone({ msg: `Started sync #${r.syncId}.` })
        await loadSyncStatus()
        ensureSyncPolling()
        await refresh()
      } catch (err) {
        flash({ msg: `Error: ${err.message}`, kind: 'err', ms: 5000 })
      } finally {
        starting.value = false
      }
    }

    const removeSync = async (s) => {
      if (!confirm(`Delete sync #${s.id}?`)) return
      try {
        await api('DELETE', `/api/syncs/${s.id}`)
        await refresh()
      } catch (err) {
        flash({ msg: `Error: ${err.message}`, kind: 'err', ms: 5000 })
      }
    }

    const clearAll = async () => {
      const suffix = syncStatus.value.activeSyncId ? ' (except the active sync)' : ''
      if (!confirm(`Delete all sync history${suffix}?`)) return
      try {
        const r = await api('DELETE', '/api/syncs')
        flash({ msg: `Deleted ${r.deleted} sync${r.deleted === 1 ? '' : 's'}.` })
        await refresh()
      } catch (err) {
        flash({ msg: `Error: ${err.message}`, kind: 'err', ms: 5000 })
      }
    }

    let pollTimer = null
    onMounted(() => {
      refresh()
      pollTimer = setInterval(refresh, SYNCS_POLL_MS)
    })
    onUnmounted(() => {
      if (pollTimer) clearInterval(pollTimer)
    })
    const stopWatch = watch(() => syncStatus.value.activeSyncId, refresh)
    onUnmounted(stopWatch)

    return {
      syncs, syncStatus, starting,
      filter, filterOptions, setFilter,
      syncNow, refresh, manualRefresh, removeSync, clearAll,
      fmtTime,
      flashText, flashKind,
    }
  },
}

const RecordingsView = {
  template: `
    <div class="view-reveal space-y-6">
      <section class="panel">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title">TRACKED RECORDINGS · {{ rangeLabel }} of {{ total }}</span>
            <info-button title="TRACKED RECORDINGS" doc="guide/recordings">
              <p>Every episode Freetvarr has tried to import from TVHeadend, and the result: <strong>done</strong>, <strong>partial</strong>, <strong>skipped</strong>, or <strong>failed</strong>. The next sync tries a partial import again.</p>
              <p>A struck-through row is gone from TVHeadend, but the file is still in your media folder.</p>
              <p>A copy, an ad scan, or a cut shows a progress bar while it runs. You can scan or cut an imported recording again.</p>
            </info-button>
          </span>
          <div class="flex flex-wrap items-center gap-3">
            <span v-if="flashText" :class="['status-readout', flashKind]">{{ flashText }}</span>
            <button type="button" class="btn btn-sm btn-danger" @click="purgeDeleted"
              :disabled="purging"
              title="Remove all tombstoned rows from Freetvarr's history (recordings already removed from TVHeadend).">
              <template v-if="purging">PURGING…</template><template v-else><cross-icon /> PURGE REMOVED</template>
            </button>
            <button type="button" class="btn btn-sm" @click="manualRefresh"><refresh-icon /> REFRESH</button>
          </div>
        </header>
        <div class="panel-body space-y-4">
          <div class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-x-6">
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim">STATUS</span>
              <div class="chip-row md:flex-wrap">
                <button v-for="opt in statusOptions" :key="opt"
                  type="button"
                  :class="['btn', 'btn-sm', statusFilter === opt ? 'btn-on' : '']"
                  @click="setStatus(opt)">{{ opt.toUpperCase() }}</button>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim">SHOW</span>
              <select :value="showFilter" @change="setShow($event.target.value)"
                class="field-input" style="width: auto; min-width: 9rem; padding-top: 0.3rem; padding-bottom: 0.3rem;">
                <option value="all">— any —</option>
                <option v-for="s in shows" :key="s.id" :value="s.id">{{ s.show_pattern }}</option>
              </select>
            </div>
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim">WHEN</span>
              <div class="chip-row md:flex-wrap">
                <button v-for="opt in sinceOptions" :key="opt.key"
                  type="button"
                  :class="['btn', 'btn-sm', sinceFilter === opt.key ? 'btn-on' : '']"
                  @click="setSince(opt.key)">{{ opt.label }}</button>
              </div>
            </div>
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim">ON TVHEADEND</span>
              <div class="chip-row md:flex-wrap">
                <button v-for="opt in deletedOptions" :key="opt.key"
                  type="button"
                  :class="['btn', 'btn-sm', deletedFilter === opt.key ? 'btn-on' : '']"
                  @click="setDeleted(opt.key)">{{ opt.label }}</button>
              </div>
            </div>
          </div>
          <p class="text-xs font-mono text-ink-mute">
            Legend: <span class="tombstone-legend">struck-through + dim</span> = removed from TVHeadend.
          </p>
          <table v-if="recordings.length" class="deck-table hidden md:table">
            <thead><tr>
              <th class="sortable" @click="toggleSort('show_pattern')">Show<sort-arrow :dir="sortDirFor('show_pattern')" /></th>
              <th class="sortable" @click="toggleSort('title')">Title<sort-arrow :dir="sortDirFor('title')" /></th>
              <th>S/E</th>
              <th class="sortable" @click="toggleSort('size')">Size<sort-arrow :dir="sortDirFor('size')" /></th>
              <th class="sortable" @click="toggleSort('status')">Status<sort-arrow :dir="sortDirFor('status')" /></th>
              <th title="Ad break detection/removal status. Hover a pill for break count + minutes.">Ads</th>
              <th class="sortable" @click="toggleSort('imported_at')">Imported<sort-arrow :dir="sortDirFor('imported_at')" /></th>
              <th></th>
            </tr></thead>
            <tbody>
              <tr v-for="r in recordings" :key="r.recording_id"
                :class="{ tombstone: r.deleted_from_tvh_at }"
                :title="r.deleted_from_tvh_at ? 'Removed from TVHeadend ' + fmtTime(r.deleted_from_tvh_at) : ''">
                <td class="font-mono">{{ r.show_pattern || '—' }}</td>
                <td class="font-mono">{{ r.title }}</td>
                <td class="font-mono">{{ se(r) }}</td>
                <td class="font-mono whitespace-nowrap">{{ fmtBytes(r.size) }}</td>
                <td>
                  <span :class="['pill', r.status]">{{ r.status }}</span>
                  <span v-if="r.error" class="block text-xs font-mono text-signal-orange-hi mt-1">{{ r.error }}</span>
                  <progress-block v-if="progressPhase(r) === 'importing'"
                    :progress="r.progress" :caption="progressCaption(r)" :bar="true"/>
                </td>
                <td>
                  <span v-if="r.ad_status" :class="['pill', r.ad_status]" :title="adTooltip(r)">{{ adLabel(r.ad_status) }}</span>
                  <span v-else-if="!progressPhase(r)" class="text-ink-mute">—</span>
                  <progress-block v-if="isAdProgress(r)"
                    :progress="r.progress" :caption="progressCaption(r)" :bar="hasBar(r)"/>
                </td>
                <td class="font-mono whitespace-nowrap">{{ fmtTime(r.imported_at) }}</td>
                <td>
                  <div class="flex items-center gap-2">
                  <button v-if="canAdScan(r)" type="button" class="btn btn-sm btn-icon"
                    @click="adScan(r)" :disabled="adScanningId === r.recording_id"
                    title="Scan this recording for ad breaks now (uses the show's ad removal mode; detect-only when the show is off).">
                    <span v-if="adScanningId === r.recording_id">…</span>
                    <svg v-else viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <circle cx="4" cy="4.5" r="1.75"/>
                      <circle cx="4" cy="11.5" r="1.75"/>
                      <path d="M5.5 5.75 13 12M5.5 10.25 13 4"/>
                    </svg>
                  </button>
                  <button v-if="canDelete(r)" type="button" class="btn btn-sm btn-icon btn-danger"
                    @click="deleteFromTvh(r)" :disabled="deletingId === r.recording_id"
                    title="Remove this recording from TVHeadend. TVHeadend deletes the file and keeps the episode in its history. Irreversible.">
                    <span v-if="deletingId === r.recording_id">…</span>
                    <trash-icon v-else />
                  </button>
                  <button v-else-if="canRemove(r)" type="button" class="btn btn-sm btn-icon btn-danger"
                    @click="removeRecording(r)" :disabled="removingId === r.recording_id"
                    :title="removeTitle(r)">
                    <span v-if="removingId === r.recording_id">…</span>
                    <trash-icon v-else />
                  </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="recordings.length" class="md:hidden space-y-3">
            <article v-for="r in recordings" :key="r.recording_id"
              :class="['deck-card', 'space-y-2', { tombstone: r.deleted_from_tvh_at }]">
              <div class="flex items-start justify-between gap-3">
                <span class="deck-card-title">{{ r.title }}</span>
                <span :class="['pill', r.status]">{{ r.status }}</span>
              </div>
              <p class="deck-card-meta">
                {{ r.show_pattern || '—' }}<template v-if="se(r)"> · {{ se(r) }}</template><template v-if="fmtBytes(r.size)"> · {{ fmtBytes(r.size) }}</template><template v-if="r.imported_at"> · {{ fmtTime(r.imported_at) }}</template>
              </p>
              <p v-if="r.deleted_from_tvh_at" class="deck-card-meta">
                removed from TVHeadend {{ fmtTime(r.deleted_from_tvh_at) }}
              </p>
              <p v-if="r.error" class="text-xs font-mono text-signal-orange-hi">{{ r.error }}</p>
              <div v-if="r.ad_status" class="flex flex-wrap items-center gap-2">
                <span :class="['pill', r.ad_status]">{{ adLabel(r.ad_status) }}</span>
                <span v-if="adTooltip(r)" class="deck-card-meta">{{ adTooltip(r) }}</span>
              </div>
              <progress-block v-if="progressPhase(r) === 'importing'"
                :progress="r.progress" :caption="progressCaption(r)" :bar="true"/>
              <progress-block v-if="isAdProgress(r)"
                :progress="r.progress" :caption="progressCaption(r)" :bar="hasBar(r)"/>
              <div v-if="canAdScan(r) || canDelete(r) || canRemove(r)" class="flex items-center justify-end gap-2 pt-1">
                <button v-if="canAdScan(r)" type="button" class="btn btn-sm btn-icon"
                  @click="adScan(r)" :disabled="adScanningId === r.recording_id">
                  <span v-if="adScanningId === r.recording_id">…</span>
                  <svg v-else viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="4" cy="4.5" r="1.75"/>
                    <circle cx="4" cy="11.5" r="1.75"/>
                    <path d="M5.5 5.75 13 12M5.5 10.25 13 4"/>
                  </svg>
                </button>
                <button v-if="canDelete(r)" type="button" class="btn btn-sm btn-icon btn-danger"
                  @click="deleteFromTvh(r)" :disabled="deletingId === r.recording_id">
                  <span v-if="deletingId === r.recording_id">…</span>
                  <trash-icon v-else />
                </button>
                <button v-else-if="canRemove(r)" type="button" class="btn btn-sm btn-icon btn-danger"
                  @click="removeRecording(r)" :disabled="removingId === r.recording_id" :title="removeTitle(r)">
                  <span v-if="removingId === r.recording_id">…</span>
                  <trash-icon v-else />
                </button>
              </div>
            </article>
          </div>
          <p v-else-if="total === 0" class="text-ink-dim text-sm">
            {{ hasFiltersApplied ? 'No recordings match the current filters.' : 'No recordings tracked yet.' }}
          </p>
          <div v-if="total > pageSize" class="flex flex-wrap items-center justify-between gap-3 font-mono text-xs text-ink-dim pt-1">
            <span>Page {{ page }} of {{ totalPages }} · {{ total }} total</span>
            <div class="flex items-center gap-2">
              <button type="button" class="btn btn-sm" :disabled="page <= 1" @click="page = page - 1"><arrow-left-icon /> PREV</button>
              <button type="button" class="btn btn-sm" :disabled="page >= totalPages" @click="page = page + 1">NEXT <arrow-right-icon /></button>
            </div>
          </div>
        </div>
      </section>
    </div>
  `,
  setup() {
    const { flashText, flashKind, flash } = useFlash()
    const recordings = ref([])
    const shows = ref([])
    const deletingId = ref(null)
    const removingId = ref(null)
    const purging = ref(false)
    const adRemovalEnabled = ref(false)
    const adScanningId = ref(null)
    const total = ref(0)
    const page = ref(1)
    const pageSize = ref(50)
    const sortCol = ref(null)
    const sortDir = ref(null)
    const statusFilter = ref('all')
    const showFilter = ref('all')
    const sinceFilter = ref('all')
    const deletedFilter = ref('all')

    const statusOptions = ['all', 'done', 'partial', 'failed', 'skipped', 'importing']
    const sinceOptions = [
      { key: 'all', label: 'ALL' },
      { key: '1h',  label: '1H'  },
      { key: '24h', label: '24H' },
      { key: '7d',  label: '7D'  },
      { key: '30d', label: '30D' },
      { key: '90d', label: '90D' },
    ]
    const deletedOptions = [
      { key: 'all',      label: 'ALL'      },
      { key: 'on_tvh', label: 'ON TVH' },
      { key: 'deleted',  label: 'REMOVED'  },
    ]

    const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

    const rangeLabel = computed(() => {
      if (total.value === 0) return '0'
      const start = (page.value - 1) * pageSize.value + 1
      const end = Math.min(total.value, page.value * pageSize.value)
      return `${start}–${end}`
    })

    const hasFiltersApplied = computed(() =>
      statusFilter.value !== 'all'
      || showFilter.value !== 'all'
      || sinceFilter.value !== 'all'
      || deletedFilter.value !== 'all',
    )

    const manualRefresh = async () => {
      try {
        await refresh()
        flash({ msg: `Refreshed — ${total.value} recording${total.value === 1 ? '' : 's'}.` })
      } catch (err) {
        flash({ msg: `Refresh failed: ${err.message}`, kind: 'err', ms: 6000 })
      }
    }

    const refresh = async () => {
      const params = new URLSearchParams({
        page: String(page.value),
        pageSize: String(pageSize.value),
      })
      if (sortCol.value) params.set('sort', sortCol.value)
      if (sortDir.value) params.set('dir', sortDir.value)
      if (statusFilter.value !== 'all') params.set('status', statusFilter.value)
      if (showFilter.value !== 'all') params.set('show_id', String(showFilter.value))
      if (sinceFilter.value !== 'all') params.set('since', sinceFilter.value)
      if (deletedFilter.value !== 'all') params.set('deleted', deletedFilter.value)
      const r = await api('GET', `/api/recordings?${params}`)
      recordings.value = r.recordings
      total.value = r.total
      if (page.value > 1 && r.recordings.length === 0) page.value = 1
    }

    const loadShows = async () => {
      const r = await api('GET', '/api/shows').catch(() => ({ shows: [] }))
      shows.value = r.shows || []
    }

    const loadAdRemovalSetting = async () => {
      const s = await api('GET', '/api/settings').catch(() => ({}))
      adRemovalEnabled.value = Boolean(s.ad_removal_enabled)
    }

    const setStatus = (v) => { statusFilter.value = v; page.value = 1 }
    const setShow = (v) => { showFilter.value = v; page.value = 1 }
    const setSince = (v) => { sinceFilter.value = v; page.value = 1 }
    const setDeleted = (v) => { deletedFilter.value = v; page.value = 1 }

    const toggleSort = (col) => {
      if (sortCol.value !== col) {
        sortCol.value = col
        sortDir.value = 'desc'
      } else if (sortDir.value === 'desc') {
        sortDir.value = 'asc'
      } else {
        sortCol.value = null
        sortDir.value = null
      }
      page.value = 1
    }

    const sortDirFor = (col) => (sortCol.value === col ? sortDir.value : null)

    const canDelete = (r) => r.status === 'done' && !r.deleted_from_tvh_at
    const canRemove = (r) => Boolean(r.deleted_from_tvh_at)
      || UNIMPORTED_STATUSES.includes(r.status)
    const removeTitle = (r) => (r.deleted_from_tvh_at
      ? "Remove this tombstone from Freetvarr's history."
      : "Remove this recording from Freetvarr's history."
        + ' If it is still in TVHeadend, the next sync imports it again.')
    const canAdScan = (r) => adRemovalEnabled.value && r.status === 'done'

    const adLabel = (status) => status.replace(/_/g, ' ')

    const progressPhase = (r) => r.progress?.phase || null

    const isAdProgress = (r) => {
      const phase = progressPhase(r)
      return phase === 'scanning' || phase === 'cutting' || phase === 'verifying'
    }

    const hasBar = (r) => {
      const phase = progressPhase(r)
      return phase === 'importing' || phase === 'scanning'
    }

    const progressCaption = (r) => {
      const p = r.progress
      if (!p) return ''
      if (p.phase === 'importing') {
        const bits = [`${p.percent}%`]
        if (p.etaLabel) bits.push(p.etaLabel)
        if (p.detail) bits.push(p.detail)
        return bits.join(' · ')
      }
      if (p.phase === 'scanning') {
        if (p.percent == null) return p.detail || 'scanning'
        return p.etaLabel ? `${p.percent}% · ~${p.etaLabel} left` : `${p.percent}%`
      }
      return p.detail || p.phase
    }

    const adTooltip = (r) => {
      if (!r.ad_breaks_json) return ''
      try {
        const breaks = JSON.parse(r.ad_breaks_json)
        const secs = breaks.reduce((sum, b) => sum + (b.end - b.start), 0)
        return `${breaks.length} break${breaks.length === 1 ? '' : 's'} · ${(secs / 60).toFixed(1)} min of ads`
      } catch {
        return ''
      }
    }

    const adScan = async (r) => {
      adScanningId.value = r.recording_id
      try {
        await api('POST', `/api/recordings/${encodeURIComponent(r.recording_id)}/ad-scan`)
        flash({ msg: `Ad scan started for "${r.title}" — can take minutes.` })
        await refresh()
      } catch (err) {
        flash({ msg: `Ad scan failed: ${err.message}`, kind: 'err', ms: 6000 })
      } finally {
        adScanningId.value = null
      }
    }

    const deleteFromTvh = async (r) => {
      const prompt = `Remove "${r.title}" from TVHeadend?\n\n`
        + 'TVHeadend deletes the recording file and keeps the episode in its history,'
        + ' so it does not record it again. This is irreversible.'
      if (!confirm(prompt)) return
      deletingId.value = r.recording_id
      try {
        const url = `/api/recordings/${encodeURIComponent(r.recording_id)}/delete-from-tvh`
        const result = await api('POST', url)
        if (result.ok) {
          flash({ msg: `Removed "${r.title}" from TVHeadend.` })
          await refresh()
        } else {
          flash({
            msg: `TVHeadend remove failed: ${result.error} (stage: ${result.stage || '?'})`,
            kind: 'err',
            ms: 8000,
          })
        }
      } catch (err) {
        flash({ msg: `TVHeadend remove failed: ${err.message}`, kind: 'err', ms: 8000 })
      } finally {
        deletingId.value = null
      }
    }

    const removeRecording = async (r) => {
      const note = r.deleted_from_tvh_at
        ? ''
        : '\n\nIf it is still in TVHeadend, the next sync imports it again.'
      if (!confirm(`Remove "${r.title}" from Freetvarr's history?${note}`)) return
      removingId.value = r.recording_id
      try {
        await api('DELETE', `/api/recordings/${encodeURIComponent(r.recording_id)}`)
        flash({ msg: `Removed "${r.title}".` })
        await refresh()
      } catch (err) {
        flash({ msg: `Remove failed: ${err.message}`, kind: 'err', ms: 6000 })
      } finally {
        removingId.value = null
      }
    }

    const purgeDeleted = async () => {
      if (!confirm('Purge all tombstoned recordings from Freetvarr\'s history?')) return
      purging.value = true
      try {
        const r = await api('DELETE', '/api/recordings?deleted=true')
        flash({ msg: `Purged ${r.deleted} tombstone${r.deleted === 1 ? '' : 's'}.` })
        await refresh()
      } catch (err) {
        flash({ msg: `Purge failed: ${err.message}`, kind: 'err', ms: 6000 })
      } finally {
        purging.value = false
      }
    }

    let pollTimer = null
    const hasActiveProgress = () => recordings.value.some((r) => r.progress)
    const scheduleNextPoll = () => {
      const delay = hasActiveProgress() ? RECORDINGS_ACTIVE_POLL_MS : RECORDINGS_POLL_MS
      pollTimer = setTimeout(pollTick, delay)
    }
    const pollTick = async () => {
      await refresh().catch(() => {})
      scheduleNextPoll()
    }
    onMounted(() => {
      loadShows()
      loadAdRemovalSetting()
      refresh().catch(() => {}).finally(scheduleNextPoll)
    })
    onUnmounted(() => {
      if (pollTimer) clearTimeout(pollTimer)
    })

    watch(
      [page, sortCol, sortDir, statusFilter, showFilter, sinceFilter, deletedFilter],
      refresh,
    )

    const stopSyncWatch = watch(() => syncStatus.value.activeSyncId, refresh)
    onUnmounted(stopSyncWatch)

    return {
      recordings, shows, total, page, pageSize, totalPages, rangeLabel,
      sortCol, sortDir, statusFilter, showFilter, sinceFilter, deletedFilter,
      statusOptions, sinceOptions, deletedOptions, hasFiltersApplied,
      deletingId, removingId, purging, adRemovalEnabled, adScanningId,
      refresh, manualRefresh, canDelete,
      canAdScan, adLabel, adTooltip, adScan,
      progressPhase, isAdProgress, hasBar, progressCaption,
      deleteFromTvh, removeRecording, canRemove, removeTitle, purgeDeleted,
      setStatus, setShow, setSince, setDeleted, toggleSort, sortDirFor,
      se: seasonEpisodeLabel, fmtBytes, fmtTime,
      flashText, flashKind,
    }
  },
}

const SettingsView = {
  template: `
    <div class="view-reveal space-y-6">
      <div class="grid gap-6 lg:grid-cols-2">
      <section class="panel">
        <header class="panel-header">
          <span class="panel-title">SETUP WIZARD</span>
          <span class="text-xs font-mono text-ink-dim">re-walk the first-run flow</span>
        </header>
        <div class="panel-body flex flex-wrap items-center justify-between gap-4">
          <p class="text-sm text-ink-dim leading-relaxed max-w-2xl">
            Re-open the guided setup at any time. Already-saved values prefill — including a <code>••••• (stored)</code> hint for the Plex token and the TVHeadend password — so you can tweak one step without retyping the rest. To wipe captured data first, use <strong class="text-ink">NUKE ALL STATE</strong> in the Danger Zone below.
          </p>
          <button type="button" class="btn" @click="reopenWizard"><refresh-icon /> REOPEN WIZARD</button>
        </div>
      </section>
      <section class="panel">
        <header class="panel-header">
          <span class="panel-title">HEALTH CHECK</span>
          <span class="text-xs font-mono text-ink-dim">read-only</span>
        </header>
        <div class="panel-body flex flex-wrap items-center justify-between gap-4">
          <p class="text-sm text-ink-dim leading-relaxed max-w-2xl">
            The Doctor checks the TVHeadend login and rights, the tuners, the guide, the folders, Plex, and live TV, then says what to fix. It changes nothing.
          </p>
          <a href="#/doctor" class="btn no-hover-underline"><pulse-icon /> RUN DOCTOR</a>
        </div>
      </section>
      </div>
      <form @submit.prevent="save" class="space-y-6 pb-24">
        <section id="section-tvheadend" class="panel">
          <header class="panel-header">
            <span class="panel-heading">
              <span class="panel-title">TVHEADEND</span>
              <info-button title="TVHEADEND" doc="guide/tvheadend">
                <p>The address and login Freetvarr uses for the TVHeadend API. Freetvarr reads the guide, channels, and recordings from it, and sets and cancels recordings.</p>
                <p><strong>AUTO-DISCOVER</strong> looks for TVHeadend on your network. The TVHeadend user needs the rights in the setup guide.</p>
              </info-button>
            </span>
            <span class="text-xs font-mono text-ink-dim">the recorder</span>
          </header>
          <div class="panel-body grid gap-4 md:grid-cols-3">
            <div class="md:col-span-3 flex flex-wrap items-center gap-3">
              <button type="button" class="btn" @click="detectTvh" :disabled="tvhDetecting">
                <template v-if="tvhDetecting">SCANNING…</template><template v-else><search-icon /> AUTO-DISCOVER TVHEADEND</template>
              </button>
              <span v-if="tvhDiscoverText" :class="['status-readout', tvhDiscoverKind]">{{ tvhDiscoverText }}</span>
              <span v-else class="text-xs font-mono text-ink-dim">port 9981 · this host</span>
            </div>
            <div v-if="tvhCandidates.length > 1" class="md:col-span-3">
              <p class="text-sm text-ink-dim mb-2">Multiple TVHeadend servers found — pick one:</p>
              <ul class="space-y-2">
                <li v-for="c in tvhCandidates" :key="c.url">
                  <button type="button" class="btn" @click="useTvhCandidate(c)">
                    Use {{ c.url }}{{ c.version ? ' (v' + c.version + ')' : '' }}
                  </button>
                </li>
              </ul>
            </div>
            <div class="field-row md:col-span-3">
              <label class="field-label">TVHeadend URL</label>
              <input type="text" class="field-input" v-model="tvhUrl" placeholder="e.g. http://192.168.1.10:9981" />
            </div>
            <div class="field-row">
              <label class="field-label">Username</label>
              <input type="text" class="field-input" v-model="tvhUsername" placeholder="blank if TVHeadend is open" autocomplete="off" />
            </div>
            <div class="field-row">
              <label class="field-label">Password</label>
              <input type="password" class="field-input" v-model="tvhPassword"
                :placeholder="tvhPasswordSet ? '••••• (stored)' : 'blank if TVHeadend is open'" autocomplete="off" />
              <p class="text-xs text-ink-mute mt-1">Blank keeps the stored password.</p>
            </div>
            <div class="field-row md:col-span-3 flex flex-wrap items-center gap-3">
              <button type="button" class="btn" @click="testTvh" :disabled="tvhTesting">
                <template v-if="tvhTesting">TESTING…</template><template v-else><pulse-icon /> TEST CONNECTION</template>
              </button>
              <span v-if="tvhStatus" :class="['status-readout', tvhStatusKind]">{{ tvhStatus }}</span>
            </div>
            <div class="md:col-span-3">
              <toggle-switch v-model="deleteAfterPlexRefreshOnly" class="toggle-prose">
                Only remove from TVHeadend after Plex refresh succeeds
                <span class="text-ink-mute">(recommended — confirms the file is in Plex first)</span>
              </toggle-switch>
            </div>
          </div>
        </section>

        <section id="section-schedule" class="panel">
          <header class="panel-header">
            <span class="panel-heading">
              <span class="panel-title">SCHEDULE</span>
              <info-button title="SCHEDULE" doc="guide/syncs#scheduled-and-manual">
                <p>How often Freetvarr checks TVHeadend for new recordings to import, as a cron rule. <code>*/30 * * * *</code> is every 30 minutes.</p>
                <p>A change applies without a restart. <strong>SYNC NOW</strong> on the dashboard runs a sync at any time.</p>
              </info-button>
            </span>
            <span class="text-xs font-mono text-ink-dim">when Freetvarr syncs</span>
          </header>
          <div class="panel-body">
            <div class="field-row">
              <label class="field-label">Sync cron (5-field, e.g. <code>*/30 * * * *</code>)</label>
              <input type="text" class="field-input" v-model="syncCron" :placeholder="syncCronEffective || '*/30 * * * *'" />
              <p v-if="!syncCron && syncCronEffective" class="text-xs text-ink-dim mt-2">
                Currently running on <code>{{ syncCronEffective }}</code> (scheduler default).
              </p>
            </div>
          </div>
        </section>

        <section id="section-storage" class="panel">
          <header class="panel-header">
            <span class="panel-heading">
              <span class="panel-title">STORAGE</span>
              <info-button title="STORAGE" doc="guide/configuration#the-two-recordings-paths">
                <ul><li><strong>Media root</strong>: where imported episodes go. Plex reads this folder.</li><li><strong>Recordings folder, as Freetvarr sees it</strong>: the TVHeadend recordings folder, inside the Freetvarr container.</li><li><strong>Recordings folder, as TVHeadend sees it</strong>: the same folder, at the path TVHeadend reports.</li></ul>
                <p>When both containers mount the folder at the same path, the two recordings paths are the same. Keep recordings and the media root on one filesystem: imports are then instant hardlinks, not copies.</p>
              </info-button>
            </span>
            <span class="text-xs font-mono text-ink-dim">where recordings land</span>
          </header>
          <div class="panel-body space-y-4">
            <div class="field-row">
              <label class="field-label">Media root <span class="text-ink-mute">(inside container)</span></label>
              <input type="text" class="field-input" v-model="mediaRoot" placeholder="/media/tv" />
              <p class="text-xs text-ink-mute mt-1 leading-relaxed">
                Container-internal directory where Freetvarr writes imported episodes. In Docker, this must match a bind-mount target in your <code>docker-compose.yml</code> — changing it without updating compose will silently fail. Bare-metal: an absolute path you own and can write to.
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <button type="button" class="btn btn-sm" @click="testMediaRoot" :disabled="mediaRootTesting">
                <template v-if="mediaRootTesting">TESTING…</template><template v-else><pulse-icon /> TEST PATH</template>
              </button>
              <span v-if="mediaRootStatus" :class="['status-readout', mediaRootStatusKind]">{{ mediaRootStatus }}</span>
            </div>
            <div class="grid gap-4 md:grid-cols-2 pt-1">
              <div class="field-row">
                <label class="field-label">Recordings folder (as Freetvarr sees it)</label>
                <input type="text" class="field-input" v-model="recordingsRoot" placeholder="/recordings" />
                <div class="flex flex-wrap items-center gap-3 mt-2">
                  <button type="button" class="btn btn-sm" @click="recordingsCheck.run" :disabled="recordingsCheck.checking">
                    <template v-if="recordingsCheck.checking">CHECKING…</template><template v-else><pulse-icon /> TEST PATH</template>
                  </button>
                  <span v-if="recordingsCheck.text" :class="['status-readout', recordingsCheck.kind]">{{ recordingsCheck.text }}</span>
                </div>
              </div>
              <div class="field-row">
                <label class="field-label">Recordings folder (as TVHeadend sees it)</label>
                <input type="text" class="field-input" v-model="tvhRecordingsPath" placeholder="/recordings" />
                <div class="flex flex-wrap items-center gap-3 mt-2">
                  <button type="button" class="btn btn-sm" @click="tvhPathCheck.run" :disabled="tvhPathCheck.checking">
                    <template v-if="tvhPathCheck.checking">CHECKING…</template><template v-else><pulse-icon /> CHECK TVHEADEND</template>
                  </button>
                  <span v-if="tvhPathCheck.text" :class="['status-readout', tvhPathCheck.kind]">{{ tvhPathCheck.text }}</span>
                </div>
              </div>
            </div>
            <p class="text-xs text-ink-mute leading-relaxed">
              Both containers must mount the same folder; Freetvarr rewrites TVHeadend's file paths onto its own mount, then hardlinks or copies the file.
            </p>
          </div>
        </section>

        <section id="section-plex" class="panel">
          <header class="panel-header">
            <span class="panel-heading">
              <span class="panel-title">PLEX</span>
              <info-button title="PLEX" doc="guide/plex">
                <p>Optional. After a sync imports an episode, Freetvarr asks Plex to refresh the library section, so new episodes show up without a manual scan.</p>
                <p>Freetvarr needs the Plex address, a token, and the section. Without Plex, Freetvarr still imports and files episodes.</p>
              </info-button>
            </span>
            <span class="text-xs font-mono text-ink-dim">post-sync section refresh</span>
          </header>
          <div class="panel-body grid gap-4 md:grid-cols-2">
            <div class="md:col-span-2 flex flex-wrap items-center gap-3">
              <button type="button" class="btn" @click="discoverPlex" :disabled="plexDiscovering">
                <template v-if="plexDiscovering">SCANNING…</template><template v-else><search-icon /> AUTO-DISCOVER PLEX</template>
              </button>
              <span v-if="plexDiscoverText" :class="['status-readout', plexDiscoverKind]">{{ plexDiscoverText }}</span>
              <span v-else class="text-xs font-mono text-ink-dim">GDM · LAN broadcast</span>
            </div>
            <div v-if="plexCandidates.length > 1" class="md:col-span-2">
              <p class="text-sm text-ink-dim mb-2">Multiple Plex servers found — pick one:</p>
              <ul class="space-y-2">
                <li v-for="c in plexCandidates" :key="c.ip + ':' + c.port">
                  <button type="button" class="btn" @click="usePlexCandidate(c)">
                    Use {{ c.name || 'Plex' }} ({{ c.ip }}:{{ c.port }})
                  </button>
                </li>
              </ul>
            </div>
            <div class="field-row md:col-span-2">
              <label class="field-label">Plex URL</label>
              <input type="text" class="field-input" v-model="plexUrl" placeholder="http://127.0.0.1:32400" />
            </div>
            <div class="field-row md:col-span-2">
              <label class="field-label">Plex token</label>
              <input type="password" class="field-input" v-model="plexToken"
                :placeholder="plexTokenSet ? '••••• (stored)' : 'X-Plex-Token'" autocomplete="off" />
              <div class="mt-2 flex flex-wrap items-center gap-3">
                <button type="button" class="btn btn-sm" @click="detectPlexToken" :disabled="plexDetecting">
                  <template v-if="plexDetecting">DETECTING…</template><template v-else><bolt-icon /> AUTO-DETECT TOKEN</template>
                </button>
                <span v-if="plexTokenStatus" :class="['status-readout', plexTokenStatusKind]">{{ plexTokenStatus }}</span>
              </div>
              <p class="text-xs text-ink-mute mt-1 leading-relaxed">
                Reads <code>PlexOnlineToken</code> from <code>Preferences.xml</code> at the path below. Requires Plex to run on the same host as Freetvarr with its config dir bind-mounted into the container. URL doesn't have to be localhost — works even if Plex was discovered as a LAN IP.
              </p>
            </div>
            <div class="field-row md:col-span-2">
              <label class="field-label">Preferences.xml path <span class="text-ink-mute">(inside container)</span></label>
              <input type="text" class="field-input" v-model="plexPrefsPath" placeholder="/plex-preferences.xml" />
              <p class="text-xs text-ink-mute mt-1 leading-relaxed">
                Container-internal path. Requires a Docker bind-mount targeting this path. Edit if you mount Plex's config at a non-default location.
              </p>
            </div>
            <div class="field-row md:col-span-2">
              <label class="field-label">Plex TV section</label>
              <select v-if="plexSections.length" class="field-input" v-model="plexSectionId">
                <option value="">— pick a section —</option>
                <option v-for="sec in plexSections" :key="sec.key" :value="sec.key">
                  {{ sec.title }} (#{{ sec.key }}, {{ sec.type }})
                </option>
              </select>
              <input v-else type="text" class="field-input" v-model="plexSectionId"
                placeholder="numeric section ID (use Load sections to discover)" />
            </div>
            <div class="md:col-span-2 flex flex-wrap items-center gap-3">
              <button type="button" class="btn" @click="loadPlexSections" :disabled="plexProbing">
                <template v-if="plexProbing">PROBING…</template><template v-else><download-icon /> LOAD SECTIONS</template>
              </button>
              <button type="button" class="btn" @click="refreshPlexNow" :disabled="plexRefreshing">
                <template v-if="plexRefreshing">REFRESHING…</template><template v-else><refresh-icon /> REFRESH PLEX NOW</template>
              </button>
              <span v-if="plexStatus" :class="['status-readout', plexStatusKind]">{{ plexStatus }}</span>
            </div>
          </div>
        </section>

        <section id="section-ad-removal" class="panel">
          <header class="panel-header">
            <span class="panel-heading">
              <span class="panel-title">AD REMOVAL</span>
              <info-button title="AD REMOVAL" doc="guide/ad-removal">
                <p>Finds the ad breaks in a recording with comskip, and can cut them out with ffmpeg. Both come with Freetvarr.</p>
                <p>Turn it on here, then set a mode for each show on the Shows tab. <strong>DETECT</strong> only marks the breaks. <strong>CUT</strong> removes them and keeps the original for a set number of days.</p>
                <p>Detection is not always right. Use DETECT on a channel first, and check the breaks before you let it cut.</p>
              </info-button>
            </span>
            <span class="text-xs font-mono text-ink-dim">comskip · optional</span>
          </header>
          <div class="panel-body space-y-4">
            <div>
              <toggle-switch v-model="adRemovalEnabled" class="toggle-prose">
                Enable ad removal
                <span class="text-ink-mute">(per-show mode is set on the Shows tab)</span>
              </toggle-switch>
            </div>
            <div class="field-row md:max-w-xs">
              <label class="field-label">Keep <code>.orig</code> backups for (days)</label>
              <input type="number" min="1" class="field-input" v-model="adOriginalRetentionDays" />
            </div>
            <p class="text-xs font-mono text-ink-dim">
              comskip.ini: <code>{{ comskipIniOverride ? '/config/comskip.ini (override)' : 'bundled AU free-to-air default' }}</code>
            </p>
            <p class="text-xs text-ink-mute leading-relaxed">
              Detection runs comskip on each imported recording and is CPU-heavy — expect minutes per episode. CUT mode rewrites the file (keyframe stream-copy, no transcode) and keeps the original as <code>&lt;file&gt;.ts.orig</code> until the retention window lapses. Detection accuracy varies by channel; trial DETECT mode before trusting CUT.
            </p>
          </div>
        </section>

        <about-panel />

        <section id="section-danger-zone" class="panel">
          <header class="panel-header">
            <span class="panel-title">DANGER ZONE</span>
            <span class="text-xs font-mono text-ink-dim">irreversible</span>
          </header>
          <div class="panel-body space-y-4">
            <div>
              <p class="text-sm text-ink leading-relaxed">
                Wipe all settings, shows, recordings history, and sync history from Freetvarr's database. The next time you open Freetvarr, the setup wizard fires from scratch.
              </p>
              <p class="text-xs text-ink-mute leading-relaxed mt-2">
                Your imported video files in <code>{{ mediaRoot || '/media/tv' }}</code> are <strong>not touched</strong> — only Freetvarr's own bookkeeping is cleared. Refused while a sync is running.
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <button type="button" class="btn btn-danger" @click="nukeState" :disabled="nuking">
                <template v-if="nuking">NUKING…</template><template v-else><trash-icon /> NUKE ALL STATE</template>
              </button>
            </div>
          </div>
        </section>

        <div class="settings-save-bar">
          <div class="max-w-6xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3">
            <span v-if="status" :class="['status-readout', statusKind]">{{ status }}</span>
            <span v-else class="text-xs font-mono text-ink-mute">Changes apply on save · scheduler reloads if <code>sync_cron</code> changed.</span>
            <button type="submit" class="btn btn-primary" :disabled="saving">
              <template v-if="saving">SAVING…</template><template v-else><check-icon /> SAVE SETTINGS</template>
            </button>
          </div>
        </div>
      </form>
    </div>
  `,
  setup() {
    const tvhUrl = ref('')
    const tvhUsername = ref('')
    const tvhPassword = ref('')
    const tvhPasswordSet = ref(false)
    const tvhTesting = ref(false)
    const tvhStatus = ref('')
    const tvhStatusKind = ref('ok')
    const recordingsRoot = ref('')
    const tvhRecordingsPath = ref('')
    const recordingsCheck = usePathCheck(() => recordingsFolderStatus({
      path: recordingsRoot.value,
      mediaRoot: mediaRoot.value,
    }))
    const tvhPathCheck = usePathCheck(() => tvhRecordingsPathStatus({
      path: tvhRecordingsPath.value,
      fill: (value) => (tvhRecordingsPath.value = value),
    }))
    const syncCron = ref('')
    const syncCronEffective = ref('')
    const plexUrl = ref('')
    const plexToken = ref('')
    const plexTokenSet = ref(false)
    const plexSectionId = ref('')
    const plexSections = ref([])
    const plexProbing = ref(false)
    const plexRefreshing = ref(false)
    const plexDetecting = ref(false)
    const plexTokenStatus = ref('')
    const plexTokenStatusKind = ref('ok')
    const plexDiscovering = ref(false)
    const plexCandidates = ref([])
    const plexPrefsPath = ref('')
    const deleteAfterPlexRefreshOnly = ref(true)
    const adRemovalEnabled = ref(false)
    const adOriginalRetentionDays = ref('7')
    const comskipIniOverride = ref(false)
    const status = ref('')
    const statusKind = ref('ok')
    const plexStatus = ref('')
    const plexStatusKind = ref('ok')
    const saving = ref(false)
    const nuking = ref(false)
    const mediaRoot = ref('')
    const mediaRootTesting = ref(false)
    const mediaRootStatus = ref('')
    const mediaRootStatusKind = ref('ok')

    const flash = ({ msg, kind = 'ok', ms = FLASH_DEFAULT_MS }) => {
      status.value = msg
      statusKind.value = kind
      if (ms > 0) setTimeout(() => (status.value = ''), ms)
    }

    const setPlexStatus = (msg, kind = 'ok', ms = FLASH_DEFAULT_MS) => {
      plexStatus.value = msg
      plexStatusKind.value = kind
      if (ms > 0) setTimeout(() => (plexStatus.value = ''), ms)
    }

    const setPlexTokenStatus = (msg, kind = 'ok', ms = FLASH_DEFAULT_MS) => {
      plexTokenStatus.value = msg
      plexTokenStatusKind.value = kind
      if (ms > 0) setTimeout(() => (plexTokenStatus.value = ''), ms)
    }

    onMounted(async () => {
      const s = await api('GET', '/api/settings')
      tvhUrl.value = s.tvh_url || ''
      tvhUsername.value = s.tvh_username || ''
      tvhPasswordSet.value = Boolean(s.tvh_password_set)
      recordingsRoot.value = s.recordings_root || ''
      tvhRecordingsPath.value = s.tvh_recordings_path || ''
      syncCron.value = s.sync_cron || ''
      syncCronEffective.value = s.sync_cron_effective || ''
      if (s.tz) tz.value = s.tz
      plexUrl.value = s.plex_url || ''
      plexTokenSet.value = Boolean(s.plex_token_set)
      plexSectionId.value = s.plex_tv_section_id || ''
      plexPrefsPath.value = s.plex_prefs_path || ''
      mediaRoot.value = s.media_root || ''
      deleteAfterPlexRefreshOnly.value = s.delete_after_plex_refresh_only !== false
      adRemovalEnabled.value = Boolean(s.ad_removal_enabled)
      adOriginalRetentionDays.value = s.ad_original_retention_days || '7'
      comskipIniOverride.value = Boolean(s.comskip_ini_override)
      await scrollToRouteSection()
    })
    const stopSectionWatch = watch(routeSection, scrollToRouteSection)
    onUnmounted(stopSectionWatch)

    const save = async () => {
      saving.value = true
      try {
        const body = {
          tvh_url: tvhUrl.value,
          tvh_username: tvhUsername.value,
          recordings_root: recordingsRoot.value,
          tvh_recordings_path: tvhRecordingsPath.value,
          sync_cron: syncCron.value,
          plex_url: plexUrl.value,
          plex_tv_section_id: plexSectionId.value,
          plex_prefs_path: plexPrefsPath.value,
          media_root: mediaRoot.value,
          delete_after_plex_refresh_only: deleteAfterPlexRefreshOnly.value,
          ad_removal_enabled: adRemovalEnabled.value,
          ad_original_retention_days: adOriginalRetentionDays.value,
        }
        if (plexToken.value) body.plex_token = plexToken.value
        if (tvhPassword.value) body.tvh_password = tvhPassword.value
        await api('POST', '/api/settings', body)
        if (plexToken.value) {
          plexTokenSet.value = true
          plexToken.value = ''
        }
        if (tvhPassword.value) {
          tvhPasswordSet.value = true
          tvhPassword.value = ''
        }
        flash({ msg: 'Saved.' })
      } catch (err) {
        flash({ msg: `Error: ${err.message}`, kind: 'err', ms: 5000 })
      } finally {
        saving.value = false
      }
    }

    const tvhDetecting = ref(false)
    const tvhCandidates = ref([])
    const [tvhDiscoverText, tvhDiscoverKind, setTvhDiscover] = makeStatus()
    const useTvhCandidate = (c) => {
      tvhUrl.value = c.url
      tvhCandidates.value = []
      setTvhDiscover(tvhDetectSummary(c), c.loopback ? 'info' : 'ok', 0)
    }
    const detectTvh = async () => {
      tvhDetecting.value = true
      tvhCandidates.value = []
      setTvhDiscover('Scanning this host (~2s)…', 'info', 0)
      try {
        const r = await api('POST', '/api/tvh-detect')
        if (r.candidates.length === 1) useTvhCandidate(r.candidates[0])
        else {
          tvhCandidates.value = r.candidates
          setTvhDiscover(`${r.candidates.length} TVHeadend servers answered.`, 'info', 0)
        }
      } catch (err) {
        setTvhDiscover(`Auto-discover failed: ${err.message}`, 'err', 8000)
      } finally {
        tvhDetecting.value = false
      }
    }

    const testTvh = async () => {
      tvhTesting.value = true
      tvhStatus.value = 'Contacting TVHeadend…'
      tvhStatusKind.value = 'info'
      try {
        const r = await api('POST', '/api/tvh-test', {
          tvh_url: tvhUrl.value,
          tvh_username: tvhUsername.value,
          ...(tvhPassword.value ? { tvh_password: tvhPassword.value } : {}),
        })
        if (tvhPassword.value) {
          tvhPasswordSet.value = true
          tvhPassword.value = ''
        }
        tvhStatus.value = tvhTestSummary(r)
        tvhStatusKind.value = 'ok'
      } catch (err) {
        tvhStatus.value = `Failed: ${err.message}${err.stage ? ` (stage: ${err.stage})` : ''}`
        tvhStatusKind.value = 'err'
      } finally {
        tvhTesting.value = false
      }
    }

    const loadPlexSections = async () => {
      plexProbing.value = true
      try {
        const body = { plex_url: plexUrl.value }
        if (plexToken.value) body.plex_token = plexToken.value
        const { sections = [] } = await api('POST', '/api/plex-sections', body)
        plexSections.value = sections
        if (sections.length === 0) {
          setPlexStatus('Connected to Plex, but no library sections returned.', 'info', 6000)
        } else {
          setPlexStatus(`Loaded ${sections.length} Plex sections.`)
        }
      } catch (err) {
        setPlexStatus(`Plex probe failed: ${err.message}`, 'err', 8000)
      } finally {
        plexProbing.value = false
      }
    }

    const detectPlexToken = async () => {
      plexDetecting.value = true
      try {
        if (plexPrefsPath.value) {
          await api('POST', '/api/settings', { plex_prefs_path: plexPrefsPath.value })
        }
        const r = await api('POST', '/api/plex-detect-token')
        if (r.ok) {
          plexTokenSet.value = true
          plexToken.value = r.token || ''
          setPlexTokenStatus(`Token detected from ${r.source}.`, 'ok', 5000)
        } else {
          setPlexTokenStatus(`Auto-detect failed: ${r.reason}`, 'err', 8000)
        }
      } catch (err) {
        setPlexTokenStatus(`Auto-detect failed: ${err.message}`, 'err', 8000)
      } finally {
        plexDetecting.value = false
      }
    }

    const [plexDiscoverText, plexDiscoverKind, setPlexDiscover] = makeStatus()
    const discoverPlex = async () => {
      plexDiscovering.value = true
      plexCandidates.value = []
      setPlexDiscover('Broadcasting GDM (~2s)…', 'info', 0)
      try {
        const { servers = [] } = await api('POST', '/api/discover-plex')
        if (servers.length === 0) {
          setPlexDiscover('No Plex servers found on the LAN.', 'err', 5000)
        } else if (servers.length === 1) {
          usePlexCandidate(servers[0])
        } else {
          plexCandidates.value = servers
          setPlexDiscover(`Found ${servers.length} Plex servers — choose one below.`, 'info', 5000)
        }
      } catch (err) {
        setPlexDiscover(`Plex discovery failed: ${err.message}`, 'err', 5000)
      } finally {
        plexDiscovering.value = false
      }
    }

    const usePlexCandidate = (c) => {
      plexUrl.value = `http://${c.ip}:${c.port}`
      plexCandidates.value = []
      setPlexDiscover(`Selected ${c.name || 'Plex'} at ${c.ip}:${c.port}. Save to persist.`, 'ok', 5000)
    }

    const testMediaRoot = async () => {
      mediaRootTesting.value = true
      mediaRootStatus.value = ''
      try {
        const r = await api('POST', '/api/media-root-test', { path: mediaRoot.value })
        if (r.ok) {
          mediaRootStatus.value = `OK — ${r.path} is writable.`
          mediaRootStatusKind.value = 'ok'
        } else {
          mediaRootStatus.value = r.error
          mediaRootStatusKind.value = 'err'
        }
      } catch (err) {
        mediaRootStatus.value = `Test failed: ${err.message}`
        mediaRootStatusKind.value = 'err'
      } finally {
        mediaRootTesting.value = false
      }
    }

    const nukeState = async () => {
      const mediaPath = mediaRoot.value || '/media/tv'
      const prompt = 'NUKE ALL STATE?\n\n'
        + 'This deletes every setting, show, recording entry, and sync from Freetvarr\'s database.\n\n'
        + `Your imported video files in ${mediaPath} are NOT touched.\n\n`
        + 'This cannot be undone. Continue?'
      if (!confirm(prompt)) return
      nuking.value = true
      try {
        await api('POST', '/api/nuke-state')
        try { localStorage.removeItem(WELCOME_DISMISSED_KEY) } catch { /* private mode */ }
        window.location.hash = '#/welcome'
        window.location.reload()
      } catch (err) {
        flash({ msg: `Nuke failed: ${err.message}`, kind: 'err', ms: 6000 })
        nuking.value = false
      }
    }

    const reopenWizard = () => {
      try { localStorage.removeItem(WELCOME_DISMISSED_KEY) } catch { /* private mode */ }
      if (window.location.hash === '#/welcome') {
        window.location.reload()
      } else {
        window.location.hash = '#/welcome'
      }
    }

    const refreshPlexNow = async () => {
      plexRefreshing.value = true
      try {
        const body = {
          plex_url: plexUrl.value,
          plex_tv_section_id: plexSectionId.value,
        }
        if (plexToken.value) body.plex_token = plexToken.value
        const r = await api('POST', '/api/plex-refresh', body)
        if (r.triggered) setPlexStatus(`Plex refresh sent (HTTP ${r.status}).`)
        else if (r.skipped) setPlexStatus(`Not configured: ${r.reason}.`, 'info', 6000)
        else setPlexStatus(`Plex refresh failed: ${r.error}.`, 'err', 8000)
      } catch (err) {
        setPlexStatus(`Plex refresh failed: ${err.message}`, 'err', 8000)
      } finally {
        plexRefreshing.value = false
      }
    }

    return {
      tvhUrl, tvhUsername, tvhPassword, tvhPasswordSet, tvhTesting, tvhStatus, tvhStatusKind,
      recordingsRoot, tvhRecordingsPath, recordingsCheck, tvhPathCheck,
      syncCron, syncCronEffective,
      plexUrl, plexToken, plexTokenSet, plexSectionId, plexSections,
      plexProbing, plexRefreshing, plexDetecting,
      plexTokenStatus, plexTokenStatusKind,
      plexDiscovering, plexCandidates, plexPrefsPath, plexDiscoverText, plexDiscoverKind,
      deleteAfterPlexRefreshOnly,
      adRemovalEnabled, adOriginalRetentionDays, comskipIniOverride,
      status, statusKind, plexStatus, plexStatusKind, saving,
      nuking, nukeState, reopenWizard,
      mediaRoot, mediaRootTesting, mediaRootStatus, mediaRootStatusKind, testMediaRoot,
      save, loadPlexSections, refreshPlexNow, detectPlexToken,
      discoverPlex, usePlexCandidate,
      testTvh, detectTvh, tvhDetecting, tvhCandidates, useTvhCandidate,
      tvhDiscoverText, tvhDiscoverKind,
    }
  },
}

const DOCS_BASE = 'https://furey.github.io/freetvarr/'
const DOCTOR_GROUPS = [
  { key: 'tvheadend', label: 'TVHEADEND' },
  { key: 'guide',     label: 'GUIDE'     },
  { key: 'storage',   label: 'STORAGE'   },
  { key: 'plex',      label: 'PLEX'      },
  { key: 'live',      label: 'LIVE TV'   },
  { key: 'host',      label: 'HOST'      },
]
const DOCTOR_PILLS = { pass: 'doctor-pass', warn: 'doctor-warn', fail: 'doctor-fail', skip: 'doctor-skip' }
const DOCTOR_STATUS_ORDER = ['fail', 'warn', 'pass', 'skip']
const DOCTOR_PILL_ORDER = ['pass', 'warn', 'fail', 'skip']

const sortDoctorChecks = (checks) => [...checks].sort((a, b) =>
  DOCTOR_STATUS_ORDER.indexOf(a.status) - DOCTOR_STATUS_ORDER.indexOf(b.status))

const DOCTOR_SCAN_MIN_MS = 700
const DOCTOR_REVEAL_MS = 2200
const DOCTOR_STEP_MIN_MS = 80
const DOCTOR_STEP_MAX_MS = 260

const doctorRevealStepMs = (count) =>
  Math.min(DOCTOR_STEP_MAX_MS, Math.max(DOCTOR_STEP_MIN_MS, DOCTOR_REVEAL_MS / Math.max(1, count)))

const DoctorSpinner = {
  template: `
    <svg class="doctor-spinner" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
      <circle class="doctor-spinner-track" cx="8" cy="8" r="6"/>
      <circle class="doctor-spinner-arc" cx="8" cy="8" r="6" pathLength="100" stroke-dasharray="28 72"/>
    </svg>
  `,
}

const DoctorView = {
  template: `
    <div class="view-reveal space-y-6">
      <section class="panel">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title">DOCTOR</span>
            <info-button title="DOCTOR" doc="guide/doctor">
              <p>Checks TVHeadend, the guide, the folders, Plex, live TV, and the host, then says what to fix. It only reads; it changes nothing.</p>
              <ul><li><strong>Pass</strong>: nothing to do.</li><li><strong>Warn</strong>: Freetvarr works, but something costs space, guide data, or picture quality.</li><li><strong>Fail</strong>: something Freetvarr needs is broken. The row says how to fix it.</li><li><strong>Skip</strong>: the check could not run, usually because an earlier check failed.</li></ul>
              <p><strong>RE-RUN</strong> checks again. Otherwise the results can be up to 15 seconds old.</p>
            </info-button>
          </span>
          <div class="flex items-center gap-3">
            <span v-if="report && !checking" class="text-xs font-mono text-ink-dim">ran {{ ranLabel }}, {{ durationLabel }}</span>
            <button type="button" class="btn btn-sm" @click="load({ fresh: true })" :disabled="checking">
              <template v-if="checking"><doctor-spinner /> CHECKING</template><template v-else><refresh-icon /> RE-RUN</template>
            </button>
          </div>
        </header>
        <div class="panel-body space-y-3">
          <div v-if="checking" class="doctor-progress" role="status">
            <div class="doctor-progress-line">
              <doctor-spinner class="text-signal-orange" />
              <span class="status-readout info">{{ progressText }}</span>
            </div>
            <div class="progress-track">
              <div :class="['progress-fill', { indeterminate: phase === 'scanning' }]" :style="phase === 'scanning' ? null : { width: progressPercent + '%' }"></div>
            </div>
          </div>
          <div v-if="report" class="flex flex-wrap gap-2">
            <span v-for="s in summaryPills" :key="s.status" :class="['pill', s.pill, { 'doctor-pill-zero': !s.count }]">{{ s.count }} {{ s.status }}</span>
          </div>
          <p v-if="error" class="status-readout err">Doctor failed: {{ error }}</p>
          <p class="text-sm text-ink-dim leading-relaxed max-w-2xl">
            The Doctor reads TVHeadend, Plex, and the folders Freetvarr uses, then lists what needs fixing. It changes nothing.
          </p>
        </div>
      </section>

      <section v-for="g in groups" :key="g.key" :id="'section-' + g.key" class="panel">
        <header class="panel-header">
          <span class="panel-title">{{ g.label }}</span>
        </header>
        <ul class="doctor-list">
          <li v-for="c in g.checks" :key="c.id" :class="['doctor-row', 'doctor-row-' + rowState(c)]">
            <span v-if="rowState(c) === 'resolved'" :class="['pill', 'doctor-pill', pillFor(c.status)]">{{ c.status }}</span>
            <span v-else class="pill doctor-pill doctor-pill-pending" :aria-label="rowState(c) === 'active' ? 'Checking' : 'Waiting'">
              <doctor-spinner v-if="rowState(c) === 'active'" /><template v-else>···</template>
            </span>
            <div class="min-w-0 space-y-1.5">
              <div class="text-sm font-semibold text-ink doctor-row-title">{{ c.title }}</div>
              <template v-if="rowState(c) === 'resolved'">
                <div class="doctor-detail font-mono text-xs text-ink-dim">{{ c.detail }}</div>
                <p v-if="needsFix(c) && c.fix" class="text-sm text-ink leading-relaxed">{{ c.fix }}</p>
                <div v-if="needsFix(c) || c.action" class="flex flex-wrap items-center gap-x-5 gap-y-2 pt-0.5">
                  <a v-if="needsFix(c) && c.doc" :href="docsUrl(c.doc)" target="_blank" rel="noopener noreferrer"
                    class="link-arrow text-xs font-mono uppercase tracking-[0.16em]">Read more <external-link-icon /></a>
                  <a v-if="c.action" :href="c.action.href"
                    class="link-arrow text-xs font-mono uppercase tracking-[0.16em]">{{ c.action.label }} <arrow-right-icon /></a>
                </div>
              </template>
              <div v-else class="doctor-placeholder" aria-hidden="true"></div>
            </div>
          </li>
        </ul>
      </section>
    </div>
  `,
  setup() {
    const report = ref(null)
    const checking = ref(false)
    const error = ref('')
    const phase = ref('scanning')
    const revealed = ref(0)
    let runId = 0

    const groups = computed(() => {
      const checks = report.value?.checks || []
      return DOCTOR_GROUPS
        .map((g) => ({ ...g, checks: sortDoctorChecks(checks.filter((c) => c.group === g.key)) }))
        .filter((g) => g.checks.length)
    })

    const orderedChecks = computed(() => groups.value.flatMap((g) => g.checks))
    const revealOrder = computed(() => new Map(orderedChecks.value.map((c, i) => [c.id, i])))

    const rowState = (c) => {
      const index = revealOrder.value.get(c.id)
      if (index < revealed.value) return 'resolved'
      if (phase.value === 'revealing' && index === revealed.value) return 'active'
      return 'pending'
    }

    const isCurrentRun = (id) => id === runId

    const revealRows = async (id) => {
      const total = orderedChecks.value.length
      if (prefersReducedMotion()) {
        revealed.value = total
        return
      }
      const stepMs = doctorRevealStepMs(total)
      for (let i = 1; i <= total; i += 1) {
        await wait(stepMs)
        if (!isCurrentRun(id)) return
        revealed.value = i
      }
    }

    const fetchReport = async ({ fresh, id }) => {
      const minimumScan = prefersReducedMotion() ? null : wait(DOCTOR_SCAN_MIN_MS)
      const [result] = await Promise.allSettled([api('GET', `/api/doctor${fresh ? '?fresh=1' : ''}`), minimumScan])
      if (!isCurrentRun(id)) return false
      if (result.status === 'rejected') {
        error.value = result.reason?.message || String(result.reason)
        return false
      }
      report.value = result.value
      return true
    }

    const load = async ({ fresh = false } = {}) => {
      const id = ++runId
      checking.value = true
      error.value = ''
      phase.value = 'scanning'
      revealed.value = 0
      const ok = await fetchReport({ fresh, id })
      if (!isCurrentRun(id)) return
      if (ok) {
        phase.value = 'revealing'
        await scrollToRouteSection()
        await revealRows(id)
        if (!isCurrentRun(id)) return
      } else {
        revealed.value = orderedChecks.value.length
      }
      phase.value = 'done'
      checking.value = false
    }

    const resolvedChecks = computed(() => orderedChecks.value.slice(0, revealed.value))

    const summaryPills = computed(() => DOCTOR_PILL_ORDER.map((status) => ({
      status,
      pill: DOCTOR_PILLS[status],
      count: resolvedChecks.value.filter((c) => c.status === status).length,
    })))

    const progressPercent = computed(() => {
      const total = orderedChecks.value.length
      return total ? Math.round((revealed.value / total) * 100) : 0
    })

    const progressText = computed(() => (phase.value === 'scanning'
      ? 'Checking TVHeadend, Plex, and the folders…'
      : `Checked ${revealed.value} of ${orderedChecks.value.length}`))

    const ranLabel = computed(() => fmtClockTz(Date.parse(report.value.ranAt)))
    const durationLabel = computed(() => `${(report.value.durationMs / 1000).toFixed(1)} s`)

    const pillFor = (status) => DOCTOR_PILLS[status]
    const needsFix = (c) => c.status === 'fail' || c.status === 'warn'
    const docsUrl = (doc) => `${DOCS_BASE}${doc}`

    onMounted(load)
    const stopSectionWatch = watch(routeSection, scrollToRouteSection)
    onUnmounted(() => {
      runId += 1
      stopSectionWatch()
    })

    return {
      report, checking, error, phase, load, groups, rowState, summaryPills,
      progressPercent, progressText, ranLabel, durationLabel, pillFor, needsFix, docsUrl,
    }
  },
}

const WelcomeView = {
  template: `
    <div class="view-reveal space-y-6">
      <section class="panel">
        <header class="panel-header">
          <span class="panel-title">{{ stepTitle }} · STEP {{ step }} / {{ totalSteps }}</span>
          <button type="button" class="btn-link link-arrow" @click="skipToSettings">SKIP TO SETTINGS <arrow-right-icon /></button>
        </header>
        <div class="panel-body space-y-4">

          <div v-if="step === 1" class="space-y-4">
            <p class="text-ink text-base leading-relaxed">
              Freetvarr watches <strong class="text-signal-orange">TVHeadend</strong> for new recordings of shows you follow, imports them into your <strong class="text-plex-yellow">Plex</strong> library, and (optionally) removes them from TVHeadend afterwards.
            </p>
            <p class="text-ink-dim text-sm leading-relaxed">
              This wizard takes about two minutes. The only required step is pointing Freetvarr at TVHeadend — Plex is optional.
            </p>
            <p v-if="hasExistingConfig" class="text-xs font-mono text-plex-yellow">
              <span class="led-dot sm bg-plex-yellow align-middle mr-1"></span> RETURN VISIT — your existing settings are prefilled. Leave a field as-is to keep its stored value; stored secrets show as <code>••••• (stored)</code>.
            </p>
          </div>

          <div v-if="step === 2" class="space-y-4">
            <p class="text-ink text-sm leading-relaxed">
              Freetvarr needs the address of your TVHeadend server. Leave the username and password blank if TVHeadend allows anonymous access.
            </p>
            <div class="flex flex-wrap items-center gap-3">
              <button type="button" class="btn" @click="detectTvh()" :disabled="tvhDetecting">
                <template v-if="tvhDetecting && !tvhAutoScanning">SCANNING…</template><template v-else><search-icon /> AUTO-DISCOVER TVHEADEND</template>
              </button>
              <span v-if="tvhDiscoverText"
                :class="['status-readout', tvhDiscoverKind]">{{ tvhDiscoverText }}</span>
            </div>
            <div v-if="tvhCandidates.length > 1" class="space-y-2">
              <p class="text-sm text-ink-dim">Multiple TVHeadend servers found — pick one:</p>
              <ul class="space-y-2">
                <li v-for="c in tvhCandidates" :key="c.url">
                  <button type="button" class="btn" @click="useTvhCandidate(c)">
                    Use {{ c.url }}{{ c.version ? ' (v' + c.version + ')' : '' }}
                  </button>
                </li>
              </ul>
            </div>
            <div class="field-row">
              <label class="field-label">TVHeadend URL</label>
              <input type="text" class="field-input" v-model="tvhUrl" placeholder="e.g. http://192.168.1.10:9981" />
            </div>
            <div class="grid gap-4 md:grid-cols-2">
              <div class="field-row">
                <label class="field-label">Username</label>
                <input type="text" class="field-input" v-model="tvhUsername" autocomplete="off" />
              </div>
              <div class="field-row">
                <label class="field-label">Password</label>
                <input type="password" class="field-input" v-model="tvhPassword"
                  :placeholder="tvhPasswordSet ? '••••• (stored)' : ''" autocomplete="off" />
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <button type="button" class="btn" @click="testTvh" :disabled="tvhTesting">
                <template v-if="tvhTesting">TESTING…</template><template v-else><pulse-icon /> TEST CONNECTION</template>
              </button>
              <span v-if="tvhText" :class="['status-readout', tvhKind]">{{ tvhText }}</span>
            </div>
          </div>

          <div v-if="step === 3" class="space-y-4">
            <p class="text-ink text-sm leading-relaxed">
              Where Freetvarr writes imported episodes inside the container. Leave blank to fall back to <code>MEDIA_ROOT</code> env (default <code>/media/tv</code>).
            </p>
            <div class="field-row">
              <label class="field-label">Media root <span class="text-ink-mute">(inside container)</span></label>
              <input type="text" class="field-input" v-model="mediaRoot" placeholder="/media/tv" />
              <div class="flex flex-wrap items-center gap-3 mt-2">
                <button type="button" class="btn btn-sm" @click="testMediaRoot" :disabled="mediaRootTesting">
                  <template v-if="mediaRootTesting">TESTING…</template><template v-else><pulse-icon /> TEST PATH</template>
                </button>
                <span v-if="mediaRootStatus" :class="['status-readout', mediaRootStatusKind]">{{ mediaRootStatus }}</span>
              </div>
              <p class="text-xs text-ink-mute mt-2 leading-relaxed">
                Must match a bind-mount target in your <code>docker-compose.yml</code> — changing it without updating compose will silently fail.
              </p>
            </div>
            <div class="grid gap-4 md:grid-cols-2">
              <div class="field-row">
                <label class="field-label">Recordings folder (as Freetvarr sees it)</label>
                <input type="text" class="field-input" v-model="recordingsRoot" placeholder="/recordings" />
                <div class="flex flex-wrap items-center gap-3 mt-2">
                  <button type="button" class="btn btn-sm" @click="recordingsCheck.run" :disabled="recordingsCheck.checking">
                    <template v-if="recordingsCheck.checking">CHECKING…</template><template v-else><pulse-icon /> TEST PATH</template>
                  </button>
                  <span v-if="recordingsCheck.text" :class="['status-readout', recordingsCheck.kind]">{{ recordingsCheck.text }}</span>
                </div>
              </div>
              <div class="field-row">
                <label class="field-label">Recordings folder (as TVHeadend sees it)</label>
                <input type="text" class="field-input" v-model="tvhRecordingsPath" placeholder="/recordings" />
                <div class="flex flex-wrap items-center gap-3 mt-2">
                  <button type="button" class="btn btn-sm" @click="tvhPathCheck.run" :disabled="tvhPathCheck.checking">
                    <template v-if="tvhPathCheck.checking">CHECKING…</template><template v-else><pulse-icon /> CHECK TVHEADEND</template>
                  </button>
                  <span v-if="tvhPathCheck.text" :class="['status-readout', tvhPathCheck.kind]">{{ tvhPathCheck.text }}</span>
                </div>
              </div>
            </div>
            <p class="text-xs text-ink-mute leading-relaxed">
              Both containers must mount the same folder; Freetvarr rewrites TVHeadend's file paths onto its own mount.
            </p>
          </div>

          <div v-if="step === 4" class="space-y-4">
            <p class="text-ink text-sm leading-relaxed">
              <strong>Optional.</strong> Connect to <strong class="text-plex-yellow">Plex</strong> so Freetvarr can trigger a library refresh after each sync. Skip if you don't use Plex.
            </p>
            <div class="flex flex-wrap items-center gap-3">
              <button type="button" class="btn" @click="discoverPlex" :disabled="plexDiscovering">
                <template v-if="plexDiscovering">SCANNING…</template><template v-else><search-icon /> AUTO-DISCOVER PLEX</template>
              </button>
              <span v-if="plexDiscoverText"
                :class="['status-readout', plexDiscoverKind]">{{ plexDiscoverText }}</span>
            </div>
            <div v-if="plexCandidates.length > 1" class="space-y-2">
              <p class="text-sm text-ink-dim">Multiple Plex servers found — pick one:</p>
              <ul class="space-y-2">
                <li v-for="c in plexCandidates" :key="c.ip + ':' + c.port">
                  <button type="button" class="btn" @click="usePlexCandidate(c)">
                    Use {{ c.name || 'Plex' }} ({{ c.ip }}:{{ c.port }})
                  </button>
                </li>
              </ul>
            </div>
            <div class="grid gap-4">
              <div class="field-row">
                <label class="field-label">Plex URL</label>
                <input type="text" class="field-input" v-model="plexUrl" placeholder="http://127.0.0.1:32400" />
              </div>
              <div class="field-row">
                <label class="field-label">Plex token</label>
                <input type="password" class="field-input" v-model="plexToken"
                  :placeholder="plexTokenSet ? '••••• (stored)' : 'X-Plex-Token'" autocomplete="off" />
                <div class="mt-2 flex flex-wrap items-center gap-3">
                  <button type="button" class="btn btn-sm" @click="detectPlexToken" :disabled="plexDetectingToken">
                    <template v-if="plexDetectingToken">DETECTING…</template><template v-else><bolt-icon /> AUTO-DETECT TOKEN</template>
                  </button>
                  <span v-if="plexTokenStatus" :class="['status-readout', plexTokenStatusKind]">{{ plexTokenStatus }}</span>
                </div>
                <p class="text-xs text-ink-mute mt-2 leading-relaxed">
                  Reads <code>PlexOnlineToken</code> from Plex's <code>Preferences.xml</code> at the path below. Requires Plex to run on the same host as Freetvarr, with its config directory bind-mounted into the container. The URL field above isn't checked — if Plex's IP is your LAN address but Plex is on this machine, this still works.
                </p>
              </div>
              <div class="field-row">
                <label class="field-label">Preferences.xml path <span class="text-ink-mute">(inside container)</span></label>
                <input type="text" class="field-input" v-model="plexPrefsPath" placeholder="/plex-preferences.xml" />
                <p class="text-xs text-ink-mute mt-1 leading-relaxed">
                  Container-internal path. Requires a Docker bind-mount targeting this path. Edit if you mount Plex's <code>Preferences.xml</code> at a non-default location.
                </p>
              </div>
              <div class="field-row">
                <label class="field-label">Plex TV section</label>
                <select v-if="plexSections.length" class="field-input" v-model="plexSectionId">
                  <option value="">— pick a section —</option>
                  <option v-for="sec in plexSections" :key="sec.key" :value="sec.key">
                    {{ sec.title }} (#{{ sec.key }}, {{ sec.type }})
                  </option>
                </select>
                <input v-else type="text" class="field-input" v-model="plexSectionId" placeholder="numeric section ID" />
              </div>
              <div class="flex flex-wrap items-center gap-3">
                <button type="button" class="btn" @click="loadPlexSections" :disabled="plexProbing">
                  <template v-if="plexProbing">PROBING…</template><template v-else><download-icon /> LOAD SECTIONS</template>
                </button>
                <span v-if="plexSectionsText"
                  :class="['status-readout', plexSectionsKind]">{{ plexSectionsText }}</span>
              </div>
            </div>
          </div>

          <div v-if="step === 5" class="space-y-4">
            <p class="text-ink text-base leading-relaxed">
              <span class="led-dot sm bg-plex-yellow align-middle mr-1"></span> You're set.
            </p>
            <p class="text-ink-dim text-sm leading-relaxed">
              Next: head to the <strong class="text-ink">Shows</strong> tab and add your first show. Freetvarr will pick it up on the next sync (every 30 minutes by default).
            </p>
            <p class="text-ink-dim text-sm leading-relaxed">
              To check the whole setup, <a href="#/doctor">run the Doctor</a>. It reads TVHeadend, Plex, and the folders, and changes nothing.
            </p>
          </div>

        </div>
        <div class="panel-body border-t border-hairline flex items-center justify-between gap-3 pt-4">
          <button type="button" class="btn" @click="back" :disabled="step === 1 || saving"><arrow-left-icon /> BACK</button>
          <div class="flex items-center gap-3">
            <span v-if="saveStatusText"
              :class="['status-readout', saveStatusKind]">{{ saveStatusText }}</span>
            <span v-else-if="!canAdvance" class="text-xs text-signal-yellow font-mono">A TVHeadend URL is required to continue.</span>
            <button type="button" class="btn btn-primary" @click="next" :disabled="!canAdvance || saving">
              {{ nextLabel }} <arrow-right-icon />
            </button>
          </div>
        </div>
      </section>
    </div>
  `,
  setup() {
    const [plexDiscoverText, plexDiscoverKind, setPlexDiscover] = makeStatus()
    const [plexSectionsText, plexSectionsKind, setPlexSections] = makeStatus()
    const [tvhText, tvhKind, setTvhText] = makeStatus()
    const [saveStatusText, saveStatusKind, setSaveStatus, clearSaveStatus] = makeStatus()
    const step = ref(1)
    const totalSteps = 5
    const STEP_TITLES = {
      1: 'WELCOME',
      2: 'TVHEADEND',
      3: 'STORAGE',
      4: 'PLEX',
      5: 'READY',
    }
    const stepTitle = computed(() => STEP_TITLES[step.value] || 'WELCOME')
    const saving = ref(false)

    const tvhUrl = ref('')
    const tvhUsername = ref('')
    const tvhPassword = ref('')
    const tvhPasswordSet = ref(false)
    const tvhTesting = ref(false)
    const recordingsRoot = ref('')
    const tvhRecordingsPath = ref('')
    const recordingsCheck = usePathCheck(() => recordingsFolderStatus({
      path: recordingsRoot.value,
      mediaRoot: mediaRoot.value,
    }))
    const tvhPathCheck = usePathCheck(() => tvhRecordingsPathStatus({
      path: tvhRecordingsPath.value,
      fill: (value) => (tvhRecordingsPath.value = value),
    }))

    const plexUrl = ref('')
    const plexToken = ref('')
    const plexSectionId = ref('')
    const plexSections = ref([])
    const plexProbing = ref(false)
    const plexDiscovering = ref(false)
    const plexCandidates = ref([])
    const plexDetectingToken = ref(false)
    const plexTokenStatus = ref('')
    const plexTokenStatusKind = ref('ok')
    const plexPrefsPath = ref('')

    const setPlexTokenStatus = (msg, kind = 'ok', ms = FLASH_DEFAULT_MS) => {
      plexTokenStatus.value = msg
      plexTokenStatusKind.value = kind
      if (ms > 0) setTimeout(() => (plexTokenStatus.value = ''), ms)
    }

    const plexTokenSet = ref(false)

    const mediaRoot = ref('')
    const mediaRootTesting = ref(false)
    const mediaRootStatus = ref('')
    const mediaRootStatusKind = ref('ok')

    const hasExistingConfig = computed(() =>
      Boolean(tvhUrl.value || tvhPasswordSet.value
        || plexUrl.value !== 'http://127.0.0.1:32400'
        || plexTokenSet.value || plexSectionId.value),
    )

    onMounted(async () => {
      const s = await api('GET', '/api/settings').catch(() => ({}))
      tvhUrl.value = s.tvh_url || ''
      tvhUsername.value = s.tvh_username || ''
      tvhPasswordSet.value = Boolean(s.tvh_password_set)
      recordingsRoot.value = s.recordings_root || ''
      tvhRecordingsPath.value = s.tvh_recordings_path || ''
      mediaRoot.value = s.media_root || ''
      plexUrl.value = s.plex_url || 'http://127.0.0.1:32400'
      plexTokenSet.value = Boolean(s.plex_token_set)
      plexSectionId.value = s.plex_tv_section_id || ''
      plexPrefsPath.value = s.plex_prefs_path || ''
    })

    const testMediaRoot = async () => {
      mediaRootTesting.value = true
      mediaRootStatus.value = ''
      try {
        const r = await api('POST', '/api/media-root-test', { path: mediaRoot.value })
        if (r.ok) {
          mediaRootStatus.value = `OK — ${r.path} is writable.`
          mediaRootStatusKind.value = 'ok'
        } else {
          mediaRootStatus.value = r.error
          mediaRootStatusKind.value = 'err'
        }
      } catch (err) {
        mediaRootStatus.value = `Test failed: ${err.message}`
        mediaRootStatusKind.value = 'err'
      } finally {
        mediaRootTesting.value = false
      }
    }

    let sectionAutoLoadTimer = null
    watch([plexUrl, plexToken], ([url, token]) => {
      clearTimeout(sectionAutoLoadTimer)
      if (!url || !token || plexSections.value.length) return
      sectionAutoLoadTimer = setTimeout(() => loadPlexSections({ silent: true }), 600)
    })

    const canAdvance = computed(() => {
      if (step.value === 2) return Boolean(tvhUrl.value.trim())
      return true
    })

    const nextLabel = computed(() => {
      if (step.value === totalSteps) return 'GO TO SHOWS'
      if (step.value === 2) return 'SAVE & NEXT'
      if (step.value === 3) {
        const hasStorage = mediaRoot.value || recordingsRoot.value || tvhRecordingsPath.value
        return hasStorage ? 'SAVE & NEXT' : 'SKIP'
      }
      if (step.value === 4) {
        const hasPlex = plexUrl.value || plexToken.value || plexSectionId.value
        return hasPlex ? 'SAVE & NEXT' : 'SKIP'
      }
      return 'NEXT'
    })

    const dismiss = () => {
      try { localStorage.setItem(WELCOME_DISMISSED_KEY, '1') } catch { /* private mode */ }
    }

    const skipToSettings = () => {
      dismiss()
      window.location.hash = '#/settings'
    }

    const back = () => {
      if (step.value > 1) {
        clearSaveStatus()
        step.value--
      }
    }

    const next = async () => {
      if (step.value === totalSteps) {
        dismiss()
        window.location.hash = '#/shows'
        return
      }
      clearSaveStatus()
      saving.value = true
      try {
        if (step.value === 2) {
          const connected = await testTvh()
          if (!connected) {
            setSaveStatus('Connection failed. Correct the TVHeadend details to continue.', 'err', 0)
            return
          }
        } else if (step.value === 3) {
          await api('POST', '/api/settings', {
            media_root: mediaRoot.value,
            recordings_root: recordingsRoot.value,
            tvh_recordings_path: tvhRecordingsPath.value,
          })
        } else if (step.value === 4) {
          const body = {
            plex_url: plexUrl.value,
            plex_tv_section_id: plexSectionId.value,
            plex_prefs_path: plexPrefsPath.value,
          }
          if (plexToken.value) body.plex_token = plexToken.value
          await api('POST', '/api/settings', body)
        }
        step.value++
      } catch (err) {
        setSaveStatus(`Save failed: ${err.message}`, 'err', 5000)
      } finally {
        saving.value = false
      }
    }

    const loadPlexSections = async ({ silent = false } = {}) => {
      plexProbing.value = true
      try {
        const body = { plex_url: plexUrl.value }
        if (plexToken.value) body.plex_token = plexToken.value
        const { sections = [] } = await api('POST', '/api/plex-sections', body)
        plexSections.value = sections
        if (!silent || sections.length) {
          setPlexSections(`Loaded ${sections.length} Plex sections.`, 'ok', 5000)
        }
      } catch (err) {
        if (!silent) setPlexSections(`Plex probe failed: ${err.message}`, 'err', 5000)
      } finally {
        plexProbing.value = false
      }
    }

    const discoverPlex = async () => {
      plexDiscovering.value = true
      plexCandidates.value = []
      setPlexDiscover('Broadcasting GDM (~2s)…', 'info', 0)
      try {
        const { servers = [] } = await api('POST', '/api/discover-plex')
        if (servers.length === 0) {
          setPlexDiscover('No Plex servers found on the LAN.', 'err', 5000)
        } else if (servers.length === 1) {
          usePlexCandidate(servers[0])
        } else {
          plexCandidates.value = servers
          setPlexDiscover(`Found ${servers.length} Plex servers — choose one below.`, 'info', 5000)
        }
      } catch (err) {
        setPlexDiscover(`Plex discovery failed: ${err.message}`, 'err', 5000)
      } finally {
        plexDiscovering.value = false
      }
    }

    const usePlexCandidate = (c) => {
      plexUrl.value = `http://${c.ip}:${c.port}`
      plexCandidates.value = []
      setPlexDiscover(`Selected ${c.name || 'Plex'} at ${c.ip}:${c.port}.`, 'ok', 5000)
    }

    const detectPlexToken = async () => {
      plexDetectingToken.value = true
      try {
        if (plexPrefsPath.value) {
          await api('POST', '/api/settings', { plex_prefs_path: plexPrefsPath.value })
        }
        const r = await api('POST', '/api/plex-detect-token')
        if (r.ok) {
          plexToken.value = r.token || ''
          setPlexTokenStatus(`Token detected from ${r.source}.`, 'ok', 5000)
        } else {
          setPlexTokenStatus(`Auto-detect failed: ${r.reason}`, 'err', 8000)
        }
      } catch (err) {
        setPlexTokenStatus(`Auto-detect failed: ${err.message}`, 'err', 8000)
      } finally {
        plexDetectingToken.value = false
      }
    }

    const tvhDetecting = ref(false)
    const tvhCandidates = ref([])
    const [tvhDiscoverText, tvhDiscoverKind, setTvhDiscover] = makeStatus()
    const useTvhCandidate = (c) => {
      tvhUrl.value = c.url
      tvhCandidates.value = []
      setTvhDiscover(tvhDetectSummary(c), c.loopback ? 'info' : 'ok', 0)
    }
    const tvhAutoScanning = ref(false)
    const detectTvh = async ({ quiet = false } = {}) => {
      tvhDetecting.value = true
      tvhAutoScanning.value = quiet
      tvhCandidates.value = []
      setTvhDiscover('Scanning this host (~2s)…', 'info', 0)
      try {
        const r = await api('POST', '/api/tvh-detect')
        if (r.candidates.length === 1) useTvhCandidate(r.candidates[0])
        else {
          tvhCandidates.value = r.candidates
          setTvhDiscover(`${r.candidates.length} TVHeadend servers answered.`, 'info', 0)
        }
      } catch (err) {
        if (quiet) setTvhDiscover('', 'info', 0)
        else setTvhDiscover(`Auto-discover failed: ${err.message}`, 'err', 8000)
      } finally {
        tvhDetecting.value = false
        tvhAutoScanning.value = false
      }
    }
    watch(step, (curr) => {
      if (curr === 2 && !tvhUrl.value.trim()) detectTvh({ quiet: true })
    })
    watch([tvhUrl, tvhUsername, tvhPassword], () => {
      if (step.value === 2) clearSaveStatus()
    })

    const testTvh = async () => {
      tvhTesting.value = true
      setTvhText('Contacting TVHeadend…', 'info', 0)
      try {
        const r = await api('POST', '/api/tvh-test', {
          tvh_url: tvhUrl.value.trim(),
          tvh_username: tvhUsername.value.trim(),
          ...(tvhPassword.value ? { tvh_password: tvhPassword.value } : {}),
        })
        if (tvhPassword.value) {
          tvhPasswordSet.value = true
          tvhPassword.value = ''
        }
        setTvhText(tvhTestSummary(r), 'ok', 8000)
        return true
      } catch (err) {
        setTvhText(`Failed: ${err.message}`, 'err', 0)
        return false
      } finally {
        tvhTesting.value = false
      }
    }

    return {
      step, totalSteps, stepTitle, saving, canAdvance, nextLabel, hasExistingConfig,
      tvhUrl, tvhUsername, tvhPassword, tvhPasswordSet, tvhTesting,
      recordingsRoot, tvhRecordingsPath, recordingsCheck, tvhPathCheck,
      plexUrl, plexToken, plexTokenSet, plexSectionId, plexSections, plexProbing,
      plexDiscovering, plexCandidates, plexDetectingToken, plexPrefsPath,
      plexTokenStatus, plexTokenStatusKind,
      mediaRoot, mediaRootTesting, mediaRootStatus, mediaRootStatusKind, testMediaRoot,
      back, next, skipToSettings, loadPlexSections, testTvh,
      detectTvh, tvhDetecting, tvhAutoScanning, tvhCandidates, useTvhCandidate, tvhDiscoverText, tvhDiscoverKind,
      discoverPlex, usePlexCandidate, detectPlexToken,
      plexDiscoverText, plexDiscoverKind,
      plexSectionsText, plexSectionsKind,
      tvhText, tvhKind,
      saveStatusText, saveStatusKind,
    }
  },
}

const EPG_ZOOM_LEVELS = [
  { key: 's', pxPerMin: 3, rowRem: 3.4, narrowRowRem: 3, halfHourTicks: false },
  { key: 'm', pxPerMin: 5, rowRem: 4.4, narrowRowRem: 3.75, halfHourTicks: true },
  { key: 'l', pxPerMin: 8, rowRem: 5.6, narrowRowRem: 4.75, halfHourTicks: true },
]
const EPG_ZOOM_KEY = 'freetvarr.guideZoom'
const EPG_NOW_ANCHOR = 0.2
const EPG_NARROW_QUERY = '(max-width: 767px)'
const EPG_CELL_INSET_PX = 10
const EPG_CELL_TEXT_MIN_PX = 40
const EPG_THUMB_TEXT_MIN_PX = 72
const EPG_TOOLTIP_DELAY_MS = 250
const EPG_TOOLTIP_GAP_PX = 12
const EPG_TOOLTIP_EDGE_PX = 8
const EPG_RAIL_DEFAULT_PX = 200
const EPG_RAIL_MIN_PX = 90
const EPG_RAIL_MAX_PX = 320
const EPG_RAIL_KEY = 'freetvarr.epgRailPx'
const EPG_IMAGES_KEY = 'freetvarr.guideImages'
const EPG_DRAG_THRESHOLD_PX = 6
const PIN_LIFT_HOLD_MS = 250
const EPG_STATE_POLL_MS = 60_000
const EPG_SEARCH_DEBOUNCE_MS = 300
const EPG_LEAD_OPTIONS = [0, 1, 2, 3, 5, 10, 15]
const EPG_LAG_OPTIONS = [0, 5, 10, 15, 30, 60]
const EPG_KEEP_OPTIONS = [
  { value: 0, label: 'ALL EPISODES' },
  { value: 5, label: 'KEEP 5' },
  { value: 10, label: 'KEEP 10' },
]

const CHANNEL_SORT_OPTIONS = [
  { key: 'default', label: 'TVH ORDER' },
  { key: 'number', label: 'NUMBER' },
  { key: 'name', label: 'NAME' },
]

let infoDialogCount = 0

const LATEST_RELEASE_KEY = 'freetvarr.latest-release'
const LATEST_RELEASE_TTL_MS = 60 * 60 * 1000
const COPIED_FLASH_MS = 2000

const readCachedLatestRelease = () => {
  try {
    const cached = JSON.parse(sessionStorage.getItem(LATEST_RELEASE_KEY) || 'null')
    return cached && Date.now() - cached.at < LATEST_RELEASE_TTL_MS ? cached.latest : undefined
  } catch {
    return undefined
  }
}

const cacheLatestRelease = (latest) => {
  try {
    sessionStorage.setItem(LATEST_RELEASE_KEY, JSON.stringify({ at: Date.now(), latest }))
  } catch {}
}

const fetchLatestRelease = async () => {
  const cached = readCachedLatestRelease()
  if (cached !== undefined) return cached
  const res = await fetch('https://api.github.com/repos/furey/freetvarr/tags?per_page=20', {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`)
  const tags = await res.json()
  const latest = latestReleaseTag(tags.map((tag) => tag.name))
  cacheLatestRelease(latest)
  return latest
}

const copyText = async (text) => {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text)
  const scratch = document.createElement('textarea')
  scratch.value = text
  scratch.setAttribute('readonly', '')
  scratch.style.position = 'fixed'
  scratch.style.opacity = '0'
  document.body.append(scratch)
  scratch.select()
  const copied = document.execCommand('copy')
  scratch.remove()
  if (!copied) throw new Error('Copy failed')
}

const AboutPanel = {
  template: `
    <section id="section-about" class="panel">
      <header class="panel-header">
        <span class="panel-heading">
          <span class="panel-title">ABOUT</span>
          <info-button title="ABOUT" doc="guide/troubleshooting#reporting-a-bug">
            <p>The versions Freetvarr is running with. Include them when you report a bug.</p>
            <p><strong>COPY</strong> puts them on the clipboard as plain text. The update check asks GitHub for the newest Freetvarr release, from this browser.</p>
          </info-button>
        </span>
        <span class="text-xs font-mono text-ink-dim">versions</span>
      </header>
      <div class="panel-body flex flex-wrap items-end justify-between gap-4">
        <dl class="about-list">
          <dt>FREETVARR</dt>
          <dd>
            <a v-if="about.version" :href="releaseUrl(about.version)" target="_blank" rel="noopener noreferrer">{{ about.version }}</a>
            <span v-else class="about-muted">…</span>
          </dd>
          <dt>UPDATES</dt>
          <dd>
            <a v-if="update.state === 'available'" :href="releaseUrl(update.latest)" target="_blank" rel="noopener noreferrer" class="about-update">{{ update.latest }} available</a>
            <span v-else :class="update.state === 'current' ? 'about-current' : 'about-muted'">{{ updateText }}</span>
          </dd>
          <dt>BUILD</dt>
          <dd>{{ about.build || '…' }}</dd>
          <dt>TVHEADEND</dt>
          <dd :class="{ 'about-muted': !about.tvheadend }">{{ tvheadendText }}</dd>
          <dt>NODE</dt>
          <dd>{{ about.node || '…' }}</dd>
        </dl>
        <button type="button" class="btn" @click="copyAbout" :disabled="!about.version">
          <template v-if="copyState === 'copied'"><check-icon /> COPIED</template>
          <template v-else-if="copyState === 'failed'"><cross-icon /> COPY FAILED</template>
          <template v-else><copy-icon /> COPY</template>
        </button>
      </div>
    </section>
  `,
  setup() {
    const tvheadendLoaded = ref(false)
    const update = ref({ state: 'checking', latest: null })
    const copyState = ref('')
    let copyTimer = null
    const about = serverAbout
    const tvheadendText = computed(() => {
      if (about.value.tvheadend) return about.value.tvheadend
      return tvheadendLoaded.value ? 'not connected' : '…'
    })
    const updateText = computed(() => ({
      checking: 'Checking…',
      current: 'Up to date',
      failed: "Couldn't check for updates",
    })[update.value.state] || '')
    const aboutLines = () => [
      `Freetvarr ${about.value.version}`,
      `Build ${about.value.build}`,
      `TVHeadend ${about.value.tvheadend || 'not connected'}`,
      `Node ${about.value.node}`,
    ].join('\n')
    const flashCopy = (state) => {
      copyState.value = state
      clearTimeout(copyTimer)
      copyTimer = setTimeout(() => { copyState.value = '' }, COPIED_FLASH_MS)
    }
    const copyAbout = async () => {
      try {
        await copyText(aboutLines())
        flashCopy('copied')
      } catch {
        flashCopy('failed')
      }
    }
    const loadTvheadendVersion = async () => {
      await fetchServerAbout('?tvheadend=1').catch(() => {})
      tvheadendLoaded.value = true
    }
    const checkForUpdate = async () => {
      try {
        const [latest] = await Promise.all([fetchLatestRelease(), about.value.version || fetchServerAbout()])
        const state = isNewerRelease({ current: about.value.version, latest }) ? 'available' : 'current'
        update.value = { state: latest ? state : 'failed', latest }
      } catch {
        update.value = { state: 'failed', latest: null }
      }
    }
    onMounted(() => {
      loadTvheadendVersion()
      checkForUpdate()
    })
    onUnmounted(() => clearTimeout(copyTimer))
    return { about, update, updateText, tvheadendText, copyState, copyAbout, releaseUrl }
  },
}

const InfoButton = {
  props: {
    title: { type: String, required: true },
    doc: { type: String, default: '' },
  },
  template: `
    <button ref="trigger" type="button" class="info-btn" :aria-label="'About ' + title" :title="'About ' + title"
      :aria-expanded="open" @click="show"><info-icon /></button>
    <teleport to="body">
      <transition name="epg-sheet">
        <div v-if="open" class="epg-modal-backdrop" @click.self="close">
          <section ref="dialog" class="panel epg-modal info-modal" role="dialog" aria-modal="true"
            :aria-labelledby="headingId" tabindex="-1">
            <header class="panel-header">
              <span :id="headingId" class="panel-title">{{ title }}</span>
              <button type="button" class="btn btn-sm btn-icon epg-modal-x" @click="close" aria-label="Close"><cross-icon /></button>
            </header>
            <div class="panel-body info-modal-body">
              <slot />
              <div class="epg-modal-actions flex items-center justify-end gap-2">
                <button type="button" class="btn epg-modal-close mr-auto" @click="close"><cross-icon /> CLOSE</button>
                <a v-if="doc" :href="docUrl" target="_blank" rel="noopener noreferrer" class="btn no-hover-underline">
                  READ THE DOCS <external-link-icon />
                </a>
              </div>
            </div>
          </section>
        </div>
      </transition>
    </teleport>
  `,
  setup(props) {
    const open = ref(false)
    const trigger = ref(null)
    const dialog = ref(null)
    const headingId = `info-dialog-${++infoDialogCount}`
    const docUrl = computed(() => `${DOCS_BASE}${props.doc}`)

    const onKeydown = (e) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      close()
    }

    const setSheetOpen = (isOpen) => {
      try { document.body.classList.toggle('sheet-open', isOpen) } catch {}
    }

    const show = async () => {
      open.value = true
      setSheetOpen(true)
      window.addEventListener('keydown', onKeydown, true)
      await nextTick()
      dialog.value?.focus()
    }

    const close = () => {
      if (!open.value) return
      open.value = false
      setSheetOpen(false)
      window.removeEventListener('keydown', onKeydown, true)
      trigger.value?.focus()
    }

    onUnmounted(() => {
      if (!open.value) return
      setSheetOpen(false)
      window.removeEventListener('keydown', onKeydown, true)
    })

    return { open, trigger, dialog, headingId, docUrl, show, close }
  },
}

const ChannelsModal = {
  props: ['channels', 'hiddenIds', 'sort', 'hideSdSimulcasts'],
  emits: ['close', 'saved'],
  template: `
    <div class="epg-modal-backdrop" @click.self="$emit('close')">
      <section class="panel epg-modal">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title">CHANNELS</span>
            <info-button title="Channels" doc="guide/tv-guide#favourites">
              <p>Favourites sit at the top of Live TV and the TV Guide, in the order set here. Press a star to add or remove a favourite, and use the arrows to change the order.</p>
              <p>Untick a channel to hide it from both pages. A favourite is always shown. The sort order and the SD simulcast switch apply to the other channels.</p>
            </info-button>
          </span>
          <button type="button" class="btn btn-sm btn-icon epg-modal-x" @click="$emit('close')" aria-label="Close"><cross-icon /></button>
        </header>
        <div class="panel-body space-y-5">
          <div>
            <label class="field-label">FAVOURITES · SHOWN FIRST, IN THIS ORDER</label>
            <p v-if="pinnedDraft.length === 0" class="text-xs text-ink-dim">
              No favourites yet. Tap the <star-icon class="icon-inline" /> next to a channel below, in the TV Guide rail, or in Live TV.
            </p>
            <ul v-else class="space-y-1.5">
              <li v-for="(id, i) in pinnedDraft" :key="id" class="flex items-center gap-2">
                <button type="button" class="btn btn-sm btn-icon" :disabled="i === 0"
                  @click="movePin(i, -1)" :aria-label="'Move ' + draftName(id) + ' up'"><arrow-up-icon /></button>
                <button type="button" class="btn btn-sm btn-icon" :disabled="i === pinnedDraft.length - 1"
                  @click="movePin(i, 1)" :aria-label="'Move ' + draftName(id) + ' down'"><arrow-down-icon /></button>
                <button type="button" class="epg-pin pinned" @click="toggleDraftPin(id)"
                  :aria-label="'Remove ' + draftName(id) + ' from favourites'"><star-icon /></button>
                <span class="font-mono text-[0.8rem] flex-1 min-w-0 truncate">{{ draftName(id) }}</span>
              </li>
            </ul>
          </div>
          <div>
            <label class="field-label">SORT OTHER CHANNELS BY</label>
            <div class="chip-row">
              <button v-for="s in CHANNEL_SORT_OPTIONS" :key="s.key" type="button"
                :class="['btn', 'btn-sm', sortDraft === s.key ? 'btn-on' : '']"
                @click="sortDraft = s.key">{{ s.label }}</button>
            </div>
          </div>
          <div>
            <label class="flex items-center gap-2.5 text-sm cursor-pointer">
              <input type="checkbox" class="chk" v-model="hideSdDraft" />
              <span class="font-mono text-[0.8rem]">HIDE SD SIMULCASTS</span>
            </label>
            <p class="text-xs text-ink-dim mt-1.5">
              Hides an SD channel only when its HD twin is in the lineup (10 next to 10 HD, Nine next to 9HD). SD-only channels stay. Applies to the grid and search; a favourite is never hidden.
            </p>
          </div>
          <div>
            <label class="field-label">ALL CHANNELS · <star-icon class="icon-inline" /> FAVOURITE, TICK TO SHOW</label>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              <div v-for="ch in channels" :key="ch.id" class="flex items-center gap-2">
                <button type="button" :class="['epg-pin', { pinned: pinnedDraft.includes(String(ch.id)) }]"
                  @click="toggleDraftPin(String(ch.id))"
                  :aria-label="pinnedDraft.includes(String(ch.id)) ? 'Remove ' + ch.name + ' from favourites' : 'Add ' + ch.name + ' to favourites'"><star-icon /></button>
                <label class="flex items-center gap-2.5 text-sm cursor-pointer min-w-0"
                  :title="pinnedDraft.includes(String(ch.id)) ? 'Favourites are always shown' : null">
                  <input type="checkbox" class="chk"
                    :checked="!hiddenDraft.has(String(ch.id))"
                    :disabled="pinnedDraft.includes(String(ch.id))"
                    @change="toggleHidden(ch)" />
                  <span class="font-mono text-[0.8rem] truncate">
                    <span class="text-ink-mute">{{ ch.number ?? '' }}</span>
                    {{ ch.name }}<span v-if="ch.hd" class="text-ink-mute"> · HD</span>
                  </span>
                </label>
              </div>
            </div>
          </div>
          <div class="epg-modal-actions flex items-center justify-end gap-2 pt-1">
            <span v-if="statusText" :class="['status-readout', statusKind]">{{ statusText }}</span>
            <button type="button" class="btn btn-sm" @click="$emit('close')">CANCEL</button>
            <button type="button" class="btn btn-sm btn-primary" @click="save" :disabled="savingPrefs">
              {{ savingPrefs ? 'SAVING…' : 'SAVE' }}
            </button>
          </div>
        </div>
      </section>
    </div>
  `,
  setup(props, { emit }) {
    const pinnedDraft = ref(props.channels.filter((c) => c.pinned).map((c) => String(c.id)))
    const hiddenDraft = ref(new Set((props.hiddenIds || []).map(String)))
    const sortDraft = ref(props.sort || 'default')
    const hideSdDraft = ref(Boolean(props.hideSdSimulcasts))
    const savingPrefs = ref(false)
    const [statusText, statusKind, setStatus] = makeStatus()

    onMounted(() => {
      try { document.body.classList.add('sheet-open') } catch { /* ignore */ }
    })
    onUnmounted(() => {
      try { document.body.classList.remove('sheet-open') } catch { /* ignore */ }
    })

    const draftName = (id) => props.channels.find((c) => String(c.id) === String(id))?.name || `channel ${id}`

    const toggleDraftPin = (id) => {
      if (pinnedDraft.value.includes(id)) {
        pinnedDraft.value = pinnedDraft.value.filter((p) => p !== id)
        return
      }
      pinnedDraft.value = [...pinnedDraft.value, id]
      const next = new Set(hiddenDraft.value)
      next.delete(id)
      hiddenDraft.value = next
    }

    const movePin = (i, delta) => {
      const next = [...pinnedDraft.value]
      const [moved] = next.splice(i, 1)
      next.splice(i + delta, 0, moved)
      pinnedDraft.value = next
    }

    const toggleHidden = (ch) => {
      const next = new Set(hiddenDraft.value)
      const key = String(ch.id)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      hiddenDraft.value = next
    }

    const save = async () => {
      savingPrefs.value = true
      try {
        await api('PUT', '/api/epg/channel-prefs', {
          pinned_ids: pinnedDraft.value,
          hidden_ids: [...hiddenDraft.value],
          sort: sortDraft.value,
          hide_sd_simulcasts: hideSdDraft.value,
        })
        emit('saved')
      } catch (err) {
        setStatus(`Save failed: ${err.message}`, 'err', 8000)
      } finally {
        savingPrefs.value = false
      }
    }

    return {
      CHANNEL_SORT_OPTIONS, pinnedDraft, hiddenDraft, sortDraft, hideSdDraft, savingPrefs,
      statusText, statusKind, draftName, toggleDraftPin, movePin, toggleHidden, save,
    }
  },
}

const togglePinnedChannel = async ({ pinnedIds, channelId }) => {
  const key = String(channelId)
  const next = pinnedIds.includes(key) ? pinnedIds.filter((id) => id !== key) : [...pinnedIds, key]
  await api('PUT', '/api/epg/channel-prefs', { pinned_ids: next })
}

const EpgView = {
  template: `
    <div :class="['view-reveal', 'space-y-6', { 'max-w-[69rem] mx-auto': mode !== 'guide' }]">
      <section class="panel">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title">GUIDE<template v-if="mode === 'guide'"> · {{ dayTitle }}</template><template v-else> · {{ mode.toUpperCase() }}</template></span>
            <info-button v-if="mode === 'upcoming'" title="TV GUIDE: UPCOMING" doc="guide/tv-guide#recording-a-programme">
              <p>Everything TVHeadend will record, soonest first. <strong>SCHEDULED</strong> cards are timers set in TVHeadend, marked <strong>SERIES</strong> or <strong>ONE-OFF</strong>. <strong>EXPECTED</strong> cards are episodes your series rules should catch in the next 7 days.</p>
              <p>Click a card to open the programme, where you can cancel the recording. Search filters the list as you type.</p>
            </info-button>
            <info-button v-else-if="mode === 'series'" title="TV GUIDE: SERIES" doc="guide/tv-guide#how-a-series-recording-works">
              <p>Each card is a series rule in TVHeadend. A rule records every airing of the show on its channel, on any day and at any time, and skips episode numbers it has already recorded.</p>
              <p>A rule covers one channel only, so an HD simulcast needs its own rule. Click a card to open the show's next airing, where you can cancel the series.</p>
            </info-button>
            <info-button v-else title="TV GUIDE: GUIDE" doc="guide/tv-guide#the-grid">
              <p>Channels run down the page and time runs across; the orange line marks now. The day chips, <strong>NOW</strong>, and <strong>TONIGHT</strong> move through the week, and the zoom buttons change the time scale.</p>
              <p>Earlier programmes from today are dimmed. The grid runs on to 3am; programmes after midnight are dimmed, and the date pill opens the next day. Blue borders are scheduled, gold borders are series recordings, and orange is recording now. Hover a programme for its details.</p>
              <p>Click a programme to record it, record the series, or cancel. A programme on now also offers <strong>WATCH LIVE</strong>.</p>
            </info-button>
          </span>
          <div class="flex flex-wrap items-center gap-3">
            <span v-if="flashText" :class="['status-readout', flashKind]">{{ flashText }}</span>
            <toggle-switch v-if="mode === 'guide'" v-model="showImages" label="IMAGES" />
            <button type="button" class="btn btn-sm" @click="openChannelsModal" :disabled="!guide"><sliders-icon /> CHANNELS</button>
            <button type="button" class="btn btn-sm" @click="manualRefresh" :disabled="loading"><refresh-icon /> REFRESH</button>
          </div>
        </header>
        <div class="panel-body space-y-4">
          <div class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-x-6">
            <div class="chip-row md:flex-wrap">
              <button v-for="m in modes" :key="m.key" type="button"
                :class="['btn', 'btn-sm', mode === m.key ? 'btn-on' : '']"
                @click="setMode(m.key)">{{ m.label }}</button>
            </div>
            <div class="flex-1 min-w-[12rem] md:max-w-xs md:ml-auto">
              <input v-model="searchQ" type="search" class="field-input" :placeholder="searchPlaceholder"
                style="padding-top: 0.35rem; padding-bottom: 0.35rem;" />
            </div>
          </div>

          <template v-if="mode === 'guide' && searchActive">
            <p class="text-xs font-mono text-ink-mute">
              {{ searching ? 'Searching…' : searchResults.length + ' result' + (searchResults.length === 1 ? '' : 's') + ' for “' + searchQ.trim() + '”' }}
            </p>
            <div class="space-y-3">
              <article v-for="p in searchResults" :key="p.program_id + '-' + p.start"
                class="deck-card deck-card-clickable deck-card-with-image" role="button" tabindex="0"
                @click="openProgram(p, channelById(p.channelId))"
                @keydown.enter.prevent="openProgram(p, channelById(p.channelId))"
                @keydown.space.prevent="openProgram(p, channelById(p.channelId))">
                <programme-image v-if="p.has_image" :event-id="p.program_id" :channel-id="p.channelId" :has-logo="hasChannelLogo(p.channelId)" />
                <div class="deck-card-text">
                <div class="flex items-start justify-between gap-3">
                  <span class="deck-card-title">{{ p.title }}</span>
                  <span class="flex items-center gap-1.5 shrink-0">
                    <span v-if="isSeriesScheduled(p)" class="pill done">SERIES</span>
                    <span v-if="cellState(p) === 'recording'" class="pill recording">RECORDING</span>
                    <span v-else-if="cellState(p) === 'scheduled'" class="pill scheduled">SCHEDULED</span>
                    <span v-else-if="cellState(p) === 'series'" class="pill done">SERIES</span>
                    <span v-else-if="cellState(p) === 'recorded'" class="pill skipped">RECORDED</span>
                  </span>
                </div>
                <p class="deck-card-meta flex items-center gap-1.5">
                  <channel-logo class="shrink-0" :channel-id="p.channelId" :has-logo="hasChannelLogo(p.channelId)" />
                  <span>{{ p.channelName }} · {{ fmtDayTime(p.start) }}–{{ fmtClock(p.end) }}<template v-if="p.episode_title"> · {{ p.episode_title }}</template></span>
                </p>
                </div>
              </article>
              <p v-if="!searching && searchResults.length === 0" class="text-ink-dim text-sm">Nothing upcoming matches.</p>
            </div>
          </template>

          <template v-else-if="mode === 'guide'">
            <div class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-x-6">
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim">DAY</span>
                <div class="chip-row md:flex-wrap">
                  <button v-for="d in dayChips" :key="d.day" type="button"
                    :class="['btn', 'btn-sm', day === d.day ? 'btn-on' : '']"
                    @click="setDay(d.day)">{{ d.label }}</button>
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-x-6 gap-y-3 md:ml-auto">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim">JUMP</span>
                  <div class="chip-row">
                    <button type="button" class="btn btn-sm" @click="jumpNow">NOW</button>
                    <button type="button" class="btn btn-sm" @click="jumpTonight">TONIGHT</button>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim">ZOOM</span>
                  <div class="chip-row">
                    <button type="button" class="btn btn-sm btn-icon epg-zoom-btn" aria-label="Zoom out"
                      :disabled="zoomIndex === 0" @click="changeZoom(-1)"><minus-icon /></button>
                    <button type="button" class="btn btn-sm btn-icon epg-zoom-btn" aria-label="Zoom in"
                      :disabled="zoomIndex === zoomLevelCount - 1" @click="changeZoom(1)"><plus-icon /></button>
                  </div>
                </div>
              </div>
            </div>
            <p v-if="stateLine" class="text-xs font-mono text-ink-mute">{{ stateLine }}</p>
            <p v-if="guide?.stale" class="text-xs font-mono text-plex-yellow">
              Showing the cached guide — TVHeadend did not answer; it refreshes automatically on the next try.
            </p>
            <div v-if="errorCode === 'no-url'" class="space-y-3">
              <p class="text-sm text-ink">Set the TVHeadend URL in Settings.</p>
              <div class="flex items-center gap-2">
                <a href="#/settings" class="btn btn-sm btn-primary no-underline">OPEN SETTINGS</a>
                <button type="button" class="btn btn-sm" @click="loadDay(day, { force: true })"><refresh-icon /> RETRY</button>
              </div>
            </div>
            <div v-else-if="errorCode === 'no-channels'" class="space-y-3">
              <p class="text-sm text-ink">TVHeadend has no channels yet; scan and map them in TVHeadend.</p>
              <button type="button" class="btn btn-sm" @click="loadDay(day, { force: true })"><refresh-icon /> RETRY</button>
            </div>
            <div v-else-if="error" class="space-y-3">
              <p class="text-sm font-mono text-signal-orange-hi">{{ error }}</p>
              <p class="text-xs text-ink-dim">
                Check the TVHeadend connection in <a href="#/settings">Settings</a>.
              </p>
              <button type="button" class="btn btn-sm" @click="loadDay(day, { force: true })"><refresh-icon /> RETRY</button>
            </div>
            <div v-else-if="loading && !guide" class="text-ink-dim font-mono text-sm"><signal-bars-icon /> loading guide…</div>
            <div v-else-if="guide" class="relative" :style="{ '--epg-rail-px': 'min(' + railPx + 'px, 38vw)' }">
              <div class="epg-grid-edge" aria-hidden="true" :style="{ height: railStripH + 'px', right: scrollbarW + 'px' }"></div>
              <button v-if="pinsOffscreen" type="button" class="epg-pinned-chip" @click="scrollRailTop"><arrow-up-icon /> {{ pinnedCount }} FAVOURITES</button>
              <button v-if="midnightOnScreen && day < 6" type="button" class="epg-pinned-chip epg-next-day-chip"
                :style="{ right: 'calc(' + scrollbarW + 'px + 0.4rem)' }" :aria-label="'Go to ' + nextDayLongLabel"
                @click="goToNextDay">{{ narrow ? nextDayWeekday : nextDayLabel }} <chevron-right-icon /></button>
              <div :class="['epg-scroll', 'epg-zoom-' + zoom, { 'epg-zooming': zooming }]" ref="scrollEl"
                @pointerover="onGridPointer" @pointermove="onGridPointer" @pointerout="onGridPointerOut"
                @pointerdown="hideTooltip" @focusin="onGridFocusIn" @focusout="onGridFocusOut">
              <div class="epg-canvas" :style="{ width: 'calc(var(--epg-rail-px) + ' + (trackWidth + trackTailPx) + 'px)' }">
                <div class="epg-ruler">
                  <div class="epg-ruler-corner">
                    <input v-model="railFilter" type="search" class="field-input epg-corner-filter"
                      :placeholder="narrow ? 'Filter' : 'Filter channels'" aria-label="Filter channels by number or name" />
                    <div class="epg-rail-edge" aria-hidden="true" :style="{ height: railStripH + 'px' }"></div>
                    <div class="epg-rail-resizer" title="Drag to resize the channel rail"
                      :style="{ height: railStripH + 'px' }"
                      @pointerdown="onRailResizeDown"
                      @pointermove="onRailResizeMove"
                      @pointerup="onRailResizeUp"
                      @pointercancel="onRailResizeUp"></div>
                  </div>
                  <div class="epg-ruler-track" :style="{ width: trackWidth + 'px' }">
                    <span v-for="t in ticks" :key="t.x" :class="['epg-tick', { half: t.half }]" :style="{ left: t.x + 'px' }">{{ t.label }}</span>
                    <span class="epg-tick epg-midnight-tick" :style="{ left: midnightX + 'px' }"><calendar-icon /> {{ nextDayLabel }}</span>
                  </div>
                </div>
                <div class="epg-midnight-line" aria-hidden="true" :style="{ left: 'calc(var(--epg-rail-px) + ' + midnightX + 'px)' }"></div>
                <div v-if="day === 6" class="epg-guide-end-lane" :style="{ left: 'calc(var(--epg-rail-px) + ' + midnightX + 'px)' }">
                  <span class="epg-guide-end">Guide ends {{ lastDayLabel }}</span>
                </div>
                <transition-group name="epg-rows" tag="div">
                <div v-for="{ kind, key, label, shown, ch } in railItems" :key="key"
                  v-show="shown"
                  v-memo="[ch, label, shown, nowMs, state, railNumWidth, showImages, zoom, thumbMinCellPx, dropTargetId === key, dropTargetId === key && dropAfter, dragPinId === key]"
                  :data-channel-id="ch?.id"
                  :class="kind === 'heading' ? 'epg-heading-row' : ['epg-row', { pinned: ch.pinned, 'epg-drop-target': dropTargetId === key, 'epg-drop-after': dropAfter && dropTargetId === key, 'epg-dragging': dragPinId === key }]">
                  <template v-if="kind === 'heading'">
                    <div class="epg-heading-rail"><span class="channel-group-heading">{{ label }}</span></div>
                    <div class="epg-heading-track"></div>
                  </template>
                  <template v-else>
                  <div class="epg-rail-cell"
                    :title="ch.pinned ? 'Drag to reorder favourites' : null"
                    @pointerdown="onPinPointerDown(ch, $event)"
                    @pointermove="onPinPointerMove"
                    @pointerup="onPinPointerUp"
                    @pointercancel="onPinPointerCancel">
                    <channel-identity :channel="ch" :has-logo="Boolean(ch.logos?.length)" :number="railNum(ch)" @pin="togglePin(ch)" />
                  </div>
                  <div class="epg-track" :style="{ width: trackWidth + 'px' }">
                    <button v-for="p in guide.programs[ch.id]" :key="p.program_id + '-' + p.start" type="button"
                      :class="['epg-cell', cellState(p), { past: p.past || p.end <= nowMs, 'on-now': p.start <= nowMs && p.end > nowMs, 'next-day': p.start >= guide.dayEnd, 'with-thumb': cellHasThumb(p) }]"
                      :style="cellStyle(p)" :aria-label="cellTitle(p)" :data-key="cellKey(ch, p)"
                      @click="openProgram(p, ch)">
                      <programme-image v-if="cellHasThumb(p)" :event-id="p.program_id" variant="cell"
                        :channel-id="ch.id" :has-logo="Boolean(ch.logos?.length)" />
                      <span v-if="cellState(p) === 'recording'" class="epg-cell-rec-fill" :style="{ width: recordingFillPercent(p) + '%' }"></span>
                      <template v-if="cellShowsText(p)">
                        <span class="epg-cell-title">{{ p.title }}</span>
                        <span class="epg-cell-meta">
                          <span v-if="cellState(p) === 'recording'" class="led-dot sm live"></span>
                          <span v-else-if="cellState(p) === 'scheduled'" class="led-dot sm" style="background:#1eb6ff"></span>
                          <span v-else-if="cellState(p) === 'series'" class="led-dot sm" style="background:#e2b03c"></span>
                          <span v-else-if="cellState(p) === 'recorded'" class="led-dot sm" style="background:#9a9289"></span>
                          <span v-if="isSeriesScheduled(p)" class="led-dot sm" style="background:#e2b03c"></span>
                          {{ fmtClock(p.start) }}
                        </span>
                      </template>
                    </button>
                  </div>
                  </template>
                </div>
                </transition-group>
                <div v-if="day === 0 && nowX != null" class="epg-nowline" :style="{ left: 'calc(var(--epg-rail-px) + ' + nowX + 'px)' }"></div>
              </div>
              </div>
            </div>
          </template>

          <template v-else-if="mode === 'upcoming'">
            <p v-if="stateError" class="text-sm font-mono text-signal-orange-hi">{{ stateError }}</p>
            <div v-else-if="!state" class="text-ink-dim font-mono text-sm"><signal-bars-icon /> contacting TVHeadend…</div>
            <template v-else>
              <p v-if="state?.stale" class="text-xs font-mono text-plex-yellow">TVHeadend is unreachable right now — showing its last known state.</p>
              <p v-if="upcoming.length === 0" class="text-ink-dim text-sm">Nothing scheduled in TVHeadend.</p>
              <p v-else-if="upcomingFiltered.length === 0" class="text-ink-dim text-sm">No upcoming recordings match “{{ searchQ.trim() }}”.</p>
              <div v-else class="space-y-3">
                <article v-for="r in upcomingFiltered" :key="r.programId + '-' + r.source"
                  class="deck-card deck-card-clickable deck-card-with-image" role="button" tabindex="0"
                  @click="openUpcoming(r)"
                  @keydown.enter.prevent="openUpcoming(r)"
                  @keydown.space.prevent="openUpcoming(r)">
                  <programme-image v-if="r.hasImage" :event-id="r.programId" :channel-id="r.channelId" :has-logo="hasChannelLogo(r.channelId)" />
                  <div class="deck-card-text">
                  <div class="flex items-start justify-between gap-3">
                    <span class="deck-card-title">{{ r.name }}</span>
                    <span class="flex items-center gap-1.5 shrink-0">
                      <template v-if="r.source === 'series'">
                        <span class="pill done">SERIES</span>
                        <span class="pill">EXPECTED</span>
                      </template>
                      <template v-else>
                        <span v-if="isSeriesRec(r)" class="pill done">SERIES</span>
                        <span v-else class="pill">ONE-OFF</span>
                        <span v-if="isActiveRecording(r)" class="pill recording">RECORDING</span>
                        <span v-else class="pill scheduled">SCHEDULED</span>
                      </template>
                    </span>
                  </div>
                  <p class="deck-card-meta flex items-center gap-1.5">
                    <channel-logo class="shrink-0" :channel-id="r.channelId" :has-logo="hasChannelLogo(r.channelId)" />
                    <span>{{ channelName(r.channelId) }} · {{ fmtDayTime(tsOf(r.startDate)) }}–{{ fmtClock(tsOf(r.endDate)) }}<template v-if="r.episodeTitle"> · {{ r.episodeTitle }}</template></span>
                  </p>
                  </div>
                </article>
              </div>
            </template>
          </template>

          <template v-else>
            <p v-if="stateError" class="text-sm font-mono text-signal-orange-hi">{{ stateError }}</p>
            <div v-else-if="!state" class="text-ink-dim font-mono text-sm"><signal-bars-icon /> contacting TVHeadend…</div>
            <template v-else>
              <p v-if="state?.stale" class="text-xs font-mono text-plex-yellow">TVHeadend is unreachable right now — showing its last known state.</p>
              <p v-if="seriesTags.length === 0" class="text-ink-dim text-sm">No series recordings set in TVHeadend.</p>
              <p v-else-if="seriesTagsFiltered.length === 0" class="text-ink-dim text-sm">No series match “{{ searchQ.trim() }}”.</p>
              <div v-else class="space-y-3">
                <article v-for="t in seriesTagsFiltered" :key="seriesKey(t)"
                  class="deck-card deck-card-clickable deck-card-with-image" role="button" tabindex="0"
                  @click="openSeriesTag(t)"
                  @keydown.enter.prevent="openSeriesTag(t)"
                  @keydown.space.prevent="openSeriesTag(t)">
                  <programme-image v-if="t.imageProgramId != null" :event-id="t.imageProgramId" :channel-id="t.channelId" :has-logo="hasChannelLogo(t.channelId)" />
                  <div class="deck-card-text">
                  <div class="flex items-start justify-between gap-3">
                    <span class="deck-card-title">{{ t.name || t.title || seriesKey(t) }}</span>
                    <span class="pill done">SERIES</span>
                  </div>
                  <p class="deck-card-meta flex items-center gap-1.5">
                    <channel-logo class="shrink-0" :channel-id="t.channelId" :has-logo="hasChannelLogo(t.channelId)" />
                    <span>{{ channelName(t.channelId) }}<template v-if="t.episodesToKeep"> · keep {{ t.episodesToKeep }}</template></span>
                  </p>
                  </div>
                </article>
              </div>
            </template>
          </template>
        </div>
      </section>

      <teleport to="body">
      <transition name="epg-sheet">
      <div v-if="selected" class="epg-modal-backdrop" @click.self="closeModal">
        <section class="panel epg-modal">
          <header class="panel-header">
            <span class="panel-title">{{ selected.program.title }}</span>
            <button type="button" class="btn btn-sm btn-icon epg-modal-x" @click="closeModal" aria-label="Close"><cross-icon /></button>
          </header>
          <programme-image v-if="selected.program.has_image" :key="selected.program.program_id" :event-id="selected.program.program_id" variant="hero"
            :channel-id="selected.channel?.id ?? selected.program.channelId" :has-logo="hasChannelLogo(selected.channel?.id ?? selected.program.channelId)" />
          <div class="panel-body space-y-4">
            <p class="text-sm font-mono text-ink-dim">
              {{ selected.channel?.name || channelName(selected.program.channelId) }}<template v-if="selected.program.start"> ·
              <span class="hidden md:inline">{{ fmtDayTime(selected.program.start) }}–{{ fmtClock(selected.program.end) }}</span><span class="md:hidden">{{ fmtShortRange(selected.program.start, selected.program.end) }}</span></template>
              <template v-if="ratingLabel(selected.program)"> · {{ ratingLabel(selected.program) }}</template>
              <template v-if="seLabel(selected.program)"> · {{ seLabel(selected.program) }}</template>
            </p>
            <p v-if="selected.program.episode_title" class="text-sm text-ink">{{ selected.program.episode_title }}</p>
            <p v-if="selected.program.synopsis" class="text-sm text-ink-dim leading-relaxed">{{ selected.program.synopsis }}</p>
            <p v-if="cellState(selected.program) === 'scheduled' || cellState(selected.program) === 'recording'" class="text-xs font-mono text-signal-blue-hi">
              {{ cellState(selected.program) === 'recording' ? 'Recording now in TVHeadend' : 'Scheduled to record in TVHeadend' }}{{ isSeriesScheduled(selected.program) ? ' (part of a series recording).' : ' (one-off recording).' }}
            </p>
            <p v-else-if="cellState(selected.program) === 'series'" class="text-xs font-mono" style="color:#e2b03c">
              A series rule records this show in TVHeadend.
            </p>
            <div v-if="canRecord" class="grid grid-cols-2 gap-3">
              <div>
                <label class="field-label">START EARLY</label>
                <select v-model.number="leadTime" class="field-input">
                  <option v-for="m in leadOptions" :key="m" :value="m">{{ m }} MIN</option>
                </select>
              </div>
              <div>
                <label class="field-label">RUN LATE</label>
                <select v-model.number="lagTime" class="field-input">
                  <option v-for="m in lagOptions" :key="m" :value="m">{{ m }} MIN</option>
                </select>
              </div>
              <div v-if="selected.program.series_link" class="col-span-2">
                <label class="field-label">SERIES · EPISODES TO KEEP</label>
                <select v-model.number="episodesToKeep" class="field-input">
                  <option v-for="o in keepOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
              </div>
            </div>
            <div class="epg-modal-actions flex flex-wrap items-center justify-end gap-2 pt-1">
              <button type="button" class="btn epg-modal-close mr-auto" @click="closeModal" aria-label="Close"><cross-icon v-if="!hasCancelAction" /> CLOSE</button>
              <span v-if="modalStatusText" :class="['status-readout', modalStatusKind]">{{ modalStatusText }}</span>
              <button v-if="canWatchLive" type="button" class="btn btn-primary" @click="watchSelected"><tv-icon /> WATCH LIVE</button>
              <template v-if="cellState(selected.program) === 'scheduled' || cellState(selected.program) === 'recording'">
                <template v-if="isSeriesScheduled(selected.program) && cancelChoice">
                  <span class="text-xs font-mono text-ink-mute">This is part of a series recording — cancel what?</span>
                  <button type="button" class="btn btn-danger" :class="{ 'is-busy': modalAction === 'cancel-episode' }" @click="cancelSelected" :disabled="modalBusy">
                    <span class="btn-label"><cross-icon /> THIS EPISODE</span>
                    <span v-if="modalAction === 'cancel-episode'" class="spinner spinner-overlay"></span>
                  </button>
                  <button type="button" class="btn btn-danger" :class="{ 'is-busy': modalAction === 'cancel-whole' }" @click="cancelSelectedSeries" :disabled="modalBusy">
                    <span class="btn-label"><cross-icon /> WHOLE SERIES</span>
                    <span v-if="modalAction === 'cancel-whole'" class="spinner spinner-overlay"></span>
                  </button>
                  <button type="button" class="btn" @click="cancelChoice = false" :disabled="modalBusy">KEEP</button>
                </template>
                <button v-else type="button" class="btn btn-danger" :class="{ 'is-busy': modalAction === 'cancel' }"
                  @click="isSeriesScheduled(selected.program) ? (cancelChoice = true) : cancelSelected()" :disabled="modalBusy">
                  <span class="btn-label"><cross-icon /> CANCEL RECORDING</span>
                  <span v-if="modalAction === 'cancel'" class="spinner spinner-overlay"></span>
                </button>
              </template>
              <template v-else-if="cellState(selected.program) === 'series'">
                <button type="button" class="btn btn-danger" :class="{ 'is-busy': modalAction === 'cancel-series' }" @click="cancelSelectedSeries" :disabled="modalBusy">
                  <span class="btn-label"><cross-icon /> CANCEL SERIES</span>
                  <span v-if="modalAction === 'cancel-series'" class="spinner spinner-overlay"></span>
                </button>
              </template>
              <template v-else-if="canRecord">
                <button v-if="selected.program.series_link" type="button" class="btn" :class="{ 'is-busy': modalAction === 'record-series' }" @click="recordSelectedSeries" :disabled="modalBusy">
                  <span class="btn-label"><record-icon /> RECORD SERIES</span>
                  <span v-if="modalAction === 'record-series'" class="spinner spinner-overlay"></span>
                </button>
                <button type="button" class="btn btn-primary" :class="{ 'is-busy': modalAction === 'record' }" @click="recordSelected" :disabled="modalBusy">
                  <span class="btn-label"><record-icon /> RECORD</span>
                  <span v-if="modalAction === 'record'" class="spinner spinner-overlay"></span>
                </button>
              </template>
              <p v-else class="text-xs font-mono text-ink-mute">This programme has already aired.</p>
            </div>
          </div>
        </section>
      </div>
      </transition>
      </teleport>

      <teleport to="body">
      <transition name="epg-tip">
      <div v-if="tooltip" ref="tooltipEl" class="epg-tooltip" aria-hidden="true">
        <div class="epg-tooltip-title">{{ tooltip.programme.title }}</div>
        <div v-if="tooltip.programme.episode_title || seLabel(tooltip.programme)" class="epg-tooltip-episode">
          <span v-if="seLabel(tooltip.programme)" class="epg-tooltip-se">{{ seLabel(tooltip.programme) }}</span>
          <span v-if="tooltip.programme.episode_title">{{ tooltip.programme.episode_title }}</span>
        </div>
        <div class="epg-tooltip-meta">{{ fmtProgrammeRange(tooltip.programme) }} · {{ tooltip.channel.name }}</div>
        <div v-if="recordingStateText(tooltip.programme)" :class="['epg-tooltip-state', cellState(tooltip.programme)]">
          <span :class="['led-dot', 'sm', { live: cellState(tooltip.programme) === 'recording' }]"></span>
          {{ recordingStateText(tooltip.programme) }}
        </div>
        <p v-if="tooltip.programme.synopsis" class="epg-tooltip-synopsis">{{ tooltip.programme.synopsis }}</p>
      </div>
      </transition>
      </teleport>

      <teleport to="body">
      <transition name="epg-sheet">
      <channels-modal v-if="channelsModal" :channels="guide?.channels || []" :hidden-ids="guide?.hiddenIds || []"
        :sort="guide?.sort" :hide-sd-simulcasts="guide?.hideSdSimulcasts"
        @close="channelsModal = false" @saved="onChannelPrefsSaved" />
      </transition>
      </teleport>
    </div>
  `,
  setup() {
    const { flashText, flashKind, flash } = useFlash()
    const mode = ref('guide')
    const modes = [
      { key: 'guide', label: 'GUIDE' },
      { key: 'upcoming', label: 'UPCOMING' },
      { key: 'series', label: 'SERIES' },
    ]
    const day = ref(0)
    const guide = ref(null)
    const guideByDay = new Map()
    const loading = ref(false)
    const error = ref('')
    const errorCode = ref('')
    const state = ref(null)
    const stateError = ref('')
    const scrollEl = ref(null)
    const searchQ = ref('')
    const searchResults = ref([])
    const searching = ref(false)
    const selected = ref(null)
    const modalBusy = ref(false)
    const modalAction = ref('')
    const busyId = ref(null)
    const channelsModal = ref(false)
    const [modalStatusText, modalStatusKind, setModalStatus] = makeStatus()

    watch([selected, channelsModal], ([program, channels]) => {
      try { document.body.classList.toggle('sheet-open', Boolean(program || channels)) } catch { /* ignore */ }
    })
    onUnmounted(() => {
      try { document.body.classList.remove('sheet-open') } catch { /* ignore */ }
    })
    const leadTime = ref(2)
    const lagTime = ref(10)
    const episodesToKeep = ref(0)

    const clampRailPx = (px) => Math.min(EPG_RAIL_MAX_PX, Math.max(EPG_RAIL_MIN_PX, px))
    const storedRailPx = () => {
      try {
        const px = Number(localStorage.getItem(EPG_RAIL_KEY))
        return Number.isFinite(px) && px > 0 ? clampRailPx(px) : EPG_RAIL_DEFAULT_PX
      } catch { return EPG_RAIL_DEFAULT_PX }
    }
    const railPx = ref(storedRailPx())

    const zoom = storedChoice({ key: EPG_ZOOM_KEY, options: EPG_ZOOM_LEVELS.map((l) => l.key), fallback: 'm' })
    const zoomIndex = computed(() => EPG_ZOOM_LEVELS.findIndex((l) => l.key === zoom.value))
    const zoomLevel = computed(() => EPG_ZOOM_LEVELS[zoomIndex.value])
    const pxPerMin = computed(() => zoomLevel.value.pxPerMin)
    const trackWidth = computed(() => (guide.value ? spillLengthMin(guide.value) : 24 * 60) * pxPerMin.value)
    const midnightX = computed(() => (guide.value ? dayLengthMin(guide.value) : 24 * 60) * pxPerMin.value)
    const zooming = ref(false)
    const narrow = useMediaQuery(EPG_NARROW_QUERY)

    const thumbMinCellPx = computed(() => {
      const rowRem = narrow.value ? zoomLevel.value.narrowRowRem : zoomLevel.value.rowRem
      const thumbPx = ((rowRem * 16 - EPG_CELL_INSET_PX) * 16) / 9
      return Math.round(thumbPx) + EPG_THUMB_TEXT_MIN_PX
    })

    // Minute resolution on purpose: the seconds clock ref would otherwise
    // re-render every grid cell once a second (past/on-now classes read this).
    const nowMs = computed(() => Math.floor(now.value.getTime() / 60_000) * 60_000)

    const railFilter = ref('')
    const showImages = storedFlag({ key: EPG_IMAGES_KEY, fallback: true })

    const visibleChannels = computed(() =>
      (guide.value?.channels || []).filter((c) => !c.hidden))

    // The filter hides rows with v-show instead of removing them from the
    // v-for: toggling display is a style flip, while remove-and-remount pays
    // for every programme cell again.
    const railMatchIds = computed(() => {
      const q = railFilter.value.trim().toLowerCase()
      if (!q) return null
      const set = new Set()
      for (const c of visibleChannels.value) {
        if ((c.name || '').toLowerCase().includes(q) || String(c.number ?? '').startsWith(q)) {
          set.add(String(c.id))
        }
      }
      return set
    })

    const rowShown = (ch) => !railMatchIds.value || railMatchIds.value.has(String(ch.id))

    const railItems = computed(() => {
      const shownChannels = visibleChannels.value.filter(rowShown)
      const groupShown = (pinned) => shownChannels.some((c) => Boolean(c.pinned) === pinned)
      const anyPinned = groupShown(true)
      const headedGroups = new Set()
      const groupHeading = (pinned) => ({
        kind: 'heading',
        key: pinned ? 'h-fav' : 'h-other',
        label: channelGroupLabel({ pinned, anyPinned }),
        shown: groupShown(pinned),
      })
      return visibleChannels.value.flatMap((ch) => {
        const pinned = Boolean(ch.pinned)
        const entry = { kind: 'channel', key: String(ch.id), shown: rowShown(ch), ch }
        if (headedGroups.has(pinned)) return [entry]
        headedGroups.add(pinned)
        return [groupHeading(pinned), entry]
      })
    })

    const pinnedCount = computed(() => visibleChannels.value.filter((c) => c.pinned).length)

    const railNumWidth = computed(() =>
      Math.max(2, ...visibleChannels.value.map((c) => String(c.number ?? '').length)))
    const railNum = (ch) =>
      ch.number == null ? '' : String(ch.number).padStart(railNumWidth.value, '0')

    const ticks = computed(() => {
      if (!guide.value) return []
      const stepMin = zoomLevel.value.halfHourTicks ? 30 : 60
      const { dayStart, spillEnd } = guide.value
      const midnightMin = dayLengthMin(guide.value)
      return rulerTickMinutes({ dayStart, dayEnd: spillEnd, stepMin })
        .filter((min) => min !== midnightMin)
        .map((min) => ({
          x: min * pxPerMin.value,
          label: fmtClock(dayStart + min * 60_000),
          half: min % 60 !== 0,
        }))
    })

    const nowX = computed(() => {
      if (!guide.value) return null
      const x = ((nowMs.value - guide.value.dayStart) / 60_000) * pxPerMin.value
      return x >= 0 && x <= trackWidth.value ? x : null
    })

    const scrollViewW = ref(0)

    const trackTailPx = computed(() => {
      if (day.value !== 0 || nowX.value == null) return 0
      return Math.max(0, Math.ceil(nowX.value + scrollViewW.value * (1 - EPG_NOW_ANCHOR) - trackWidth.value))
    })

    const todayNumber = computed(() => localDayNumber({ ms: nowMs.value, timeZone: tz.value }))

    const dayChips = computed(() => Array.from({ length: 7 }, (_, d) => {
      if (d === 0) return { day: 0, label: 'TODAY' }
      return { day: d, label: weekdayOfDayNumber(todayNumber.value + d).toUpperCase() }
    }))

    const noonOf = (ms) => new Date(ms + 12 * 3_600_000)
    const nextDayNoon = computed(() => noonOf(guide.value?.dayEnd ?? 0))
    const nextDayLabel = computed(() =>
      dateFormat({ weekday: 'short', day: 'numeric', month: 'short' }).format(nextDayNoon.value).replace(',', '').toUpperCase())
    const nextDayWeekday = computed(() => dateFormat({ weekday: 'short' }).format(nextDayNoon.value).toUpperCase())
    const nextDayLongLabel = computed(() =>
      dateFormat({ weekday: 'long', day: 'numeric', month: 'long' }).format(nextDayNoon.value).replace(',', ''))
    const lastDayLabel = computed(() =>
      dateFormat({ weekday: 'short', day: 'numeric', month: 'short' }).format(noonOf(guide.value?.dayStart ?? 0)).replace(',', ''))

    const dayTitle = computed(() => {
      if (!guide.value) return dayChips.value[day.value]?.label || ''
      return dateFormat({ weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(guide.value.dayStart + 12 * 3_600_000))
    })

    const scheduledByProgramId = computed(() => {
      const map = new Map()
      for (const r of state.value?.futureRecordings || []) {
        if (r?.programId != null) map.set(String(r.programId), r)
      }
      return map
    })

    const activeRecordingSet = computed(() =>
      new Set((state.value?.activeRecordingIds || []).map(String)))

    const seriesLinkSet = computed(() => {
      const set = new Set()
      for (const t of state.value?.seriesTags || []) {
        const link = t?.seriesLinkId ?? t?.id
        if (link != null) set.add(String(link))
      }
      return set
    })

    const upcoming = computed(() => {
      const list = state.value?.upcomingRecordings
        ?? (state.value?.futureRecordings || []).filter((r) => !r.pendingDelete)
      return [...list].sort((a, b) => tsOf(a.startDate) - tsOf(b.startDate))
    })

    const seriesTags = computed(() => state.value?.seriesTags || [])

    const scheduledCount = computed(() =>
      (state.value?.futureRecordings || []).filter((r) => !r.pendingDelete).length)

    const stateLine = computed(() => {
      if (!state.value) return ''
      const bits = [
        state.value.stale ? 'tvheadend unreachable' : 'tvheadend online',
        `${scheduledCount.value} scheduled`,
        `${seriesTags.value.length} series`,
      ]
      if (state.value.tunerCount) {
        bits.push(`${state.value.tunerCount} tuner${state.value.tunerCount === 1 ? '' : 's'}`)
      }
      if (state.value.storageInfo?.free) {
        bits.push(`${fmtBytes(state.value.storageInfo.free)} free`)
      }
      return bits.join(' · ')
    })

    const searchActive = computed(() => searchQ.value.trim().length >= 2)

    const searchPlaceholder = computed(() => {
      if (mode.value === 'upcoming') return 'Filter upcoming…'
      if (mode.value === 'series') return 'Filter series…'
      return 'Search the next 7 days…'
    })

    const listFilter = computed(() => searchQ.value.trim().toLowerCase())

    const upcomingFiltered = computed(() => {
      const q = listFilter.value
      if (!q) return upcoming.value
      return upcoming.value.filter((r) =>
        `${r.name || ''} ${r.episodeTitle || ''} ${channelName(r.channelId) || ''}`.toLowerCase().includes(q))
    })

    const seriesTagsFiltered = computed(() => {
      const q = listFilter.value
      if (!q) return seriesTags.value
      return seriesTags.value.filter((t) =>
        `${t.name || t.title || ''} ${channelName(t.channelId) || ''}`.toLowerCase().includes(q))
    })

    const canRecord = computed(() =>
      selected.value && selected.value.program.end > nowMs.value
      && (selected.value.channel?.recordable !== false))

    const canWatchLive = computed(() => {
      if (!selected.value?.channel) return false
      const { start, end } = selected.value.program
      const t = now.value.getTime()
      return Boolean(start) && start <= t && end > t
    })

    const hasCancelAction = computed(() => Boolean(selected.value)
      && ['scheduled', 'recording', 'series'].includes(cellState(selected.value.program)))

    const watchSelected = () => {
      const { program, channel } = selected.value
      closeModal()
      watchLive({ channel: liveChannelOf(channel), nowTitle: program.title })
    }

    const tsOf = tsOfMs
    const fmtClock = fmtClockTz

    const fmtDayTime = (ms) => dateFormat({
      weekday: 'short', day: 'numeric', month: 'short',
      hour: 'numeric', minute: '2-digit',
    }).format(new Date(ms)).toLowerCase().replace(/\s(am|pm)$/, '$1')

    const fmtShortRange = (start, end) => {
      const day = dateFormat({ weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(start)).toLowerCase().replace(',', '')
      const from = fmtClock(start).replace(':00', '')
      const to = fmtClock(end).replace(':00', '')
      const trimmed = from.slice(-2) === to.slice(-2) ? from.replace(/(am|pm)$/, '') : from
      return `${day} @ ${trimmed}–${to}`
    }

    const ratingLabel = (p) => {
      const r = p?.rating
      return typeof r === 'string' && r && Number.isNaN(Number(r)) ? r : ''
    }

    const seLabel = (p) => {
      if (p.series_no == null && p.episode_no == null) return ''
      const s = p.series_no != null ? `S${String(p.series_no).padStart(2, '0')}` : ''
      const e = p.episode_no != null ? `E${String(p.episode_no).padStart(2, '0')}` : ''
      return `${s}${e}`
    }

    const channelById = (id) =>
      (guide.value?.channels || []).find((c) => String(c.id) === String(id)) || null

    const channelName = (id) => channelById(id)?.name || `channel ${id}`

    const hasChannelLogo = (id) => Boolean(channelById(id)?.logos?.length)

    const seriesKey = (t) => String(t?.seriesLinkId ?? t?.id ?? t?.name ?? '')

    const cellState = (p) => {
      if (p.past) return p.recorded ? 'recorded' : ''
      const scheduled = scheduledByProgramId.value.get(String(p.program_id ?? p.programId))
      if (scheduled && activeRecordingSet.value.has(String(scheduled.programId))) return 'recording'
      if (scheduled) return 'scheduled'
      if (p.series_link != null && seriesLinkSet.value.has(String(p.series_link))) return 'series'
      return ''
    }

    const isSeriesScheduled = (p) => {
      const scheduled = scheduledByProgramId.value.get(String(p.program_id ?? p.programId))
      return Boolean(scheduled?.seriesLinkId != null
        && seriesLinkSet.value.has(String(scheduled.seriesLinkId)))
    }

    const recordingStateText = (p) => {
      const state = cellState(p)
      if (state === 'recording') return 'recording now'
      if (state === 'scheduled') {
        return isSeriesScheduled(p) ? 'series recording scheduled' : 'one-off recording scheduled'
      }
      if (state === 'series') return 'series rule on this show'
      if (state === 'recorded') return 'recorded'
      return ''
    }

    const cellTitle = (p) => [p.title, recordingStateText(p)].filter(Boolean).join(' · ')

    const cellKey = (ch, p) => `${ch.id}|${p.program_id}|${p.start}`

    const cellX = (t) => {
      const clamped = Math.max(t, guide.value.dayStart)
      return ((clamped - guide.value.dayStart) / 60_000) * pxPerMin.value
    }

    const cellWidth = (p) => {
      const start = Math.max(p.start, guide.value.dayStart)
      const end = Math.min(p.end, guide.value.spillEnd)
      return Math.max(((end - start) / 60_000) * pxPerMin.value - 2, 6)
    }

    const cellShowsText = (p) => cellWidth(p) > EPG_CELL_TEXT_MIN_PX

    const cellHasThumb = (p) => showImages.value && p.has_image && cellWidth(p) >= thumbMinCellPx.value

    const recordingFillPercent = (p) => {
      const span = p.end - p.start
      if (span <= 0) return 0
      return Math.min(100, Math.max(0, ((nowMs.value - p.start) / span) * 100))
    }

    const cellStyle = (p) => ({
      left: `${cellX(p.start)}px`,
      width: `${cellWidth(p)}px`,
    })

    const loadDay = async (d, { force = false } = {}) => {
      error.value = ''
      errorCode.value = ''
      if (!force && guideByDay.has(d)) {
        guide.value = guideByDay.get(d)
        return
      }
      loading.value = true
      try {
        const g = await api('GET', `/api/epg/guide?day=${d}`)
        guideByDay.set(d, g)
        if (day.value === d) guide.value = g
      } catch (err) {
        error.value = `Guide load failed: ${err.message}`
        errorCode.value = err.code || ''
      } finally {
        loading.value = false
      }
    }

    const loadState = async ({ fresh = false } = {}) => {
      stateError.value = ''
      try {
        state.value = await api('GET', `/api/epg/state${fresh ? '?fresh=1' : ''}`)
      } catch (err) {
        stateError.value = `TVHeadend state failed: ${err.message}`
      }
    }

    const scrollToMs = async (ms, { anchor = 0, leadPx = 60 } = {}) => {
      await nextTick()
      if (!scrollEl.value || !guide.value) return
      scrollViewW.value = scrollEl.value.clientWidth
      await nextTick()
      const x = ((ms - guide.value.dayStart) / 60_000) * pxPerMin.value
      const trackWidth = scrollEl.value.clientWidth - railWidthOf(scrollEl.value)
      const offset = anchor ? trackWidth * anchor : leadPx
      scrollEl.value.scrollLeft = Math.max(0, x - offset)
    }

    const scrollToNow = () => scrollToMs(Date.now(), { anchor: EPG_NOW_ANCHOR })

    const clockOfDay = (hour) =>
      localClockMs({ dayStart: guide.value?.dayStart ?? 0, hour, timeZone: tz.value })

    const rollOverToToday = async () => {
      guideByDay.clear()
      await loadDay(0, { force: true })
      if (mode.value === 'guide' && !searchActive.value) await scrollToNow()
    }

    watch(nowMs, (ms) => {
      if (day.value !== 0 || loading.value || !guide.value || ms < guide.value.dayEnd) return
      rollOverToToday()
    })

    const setDay = async (d, { atMs = null } = {}) => {
      day.value = d
      await loadDay(d)
      if (atMs != null) await scrollToMs(Math.max(atMs, guide.value?.dayStart ?? atMs), { leadPx: 0 })
      else if (d === 0) await scrollToNow()
      else await scrollToMs(clockOfDay(18))
    }

    const leftEdgeMs = () => guide.value.dayStart + (scrollEl.value.scrollLeft / pxPerMin.value) * 60_000

    const goToNextDay = () => setDay(day.value + 1, { atMs: leftEdgeMs() })

    const setMode = async (m) => {
      if (m !== mode.value) searchQ.value = ''
      mode.value = m
      if (m !== 'guide') {
        loadState()
        return
      }
      if (day.value === 0) await scrollToNow()
      else await scrollToMs(clockOfDay(18))
    }

    const jumpNow = async () => {
      if (day.value !== 0) await setDay(0)
      else await scrollToNow()
    }

    const jumpTonight = async () => {
      if (day.value !== 0) { day.value = 0; await loadDay(0) }
      await scrollToMs(clockOfDay(19))
    }

    const railWidthOf = (el) => el.querySelector('.epg-ruler-corner')?.offsetWidth || 0

    const firstVisibleRow = (el) => {
      const top = el.scrollTop + (el.querySelector('.epg-ruler')?.offsetHeight || 0)
      const row = [...el.querySelectorAll('.epg-row')]
        .find((r) => r.offsetHeight > 0 && r.offsetTop + r.offsetHeight > top)
      return row ? { el: row, offset: row.offsetTop - el.scrollTop } : null
    }

    const captureZoomAnchor = (el) => {
      const viewW = el.clientWidth - railWidthOf(el)
      const nowOnScreen = day.value === 0 && nowX.value != null
        && nowX.value >= el.scrollLeft && nowX.value <= el.scrollLeft + viewW
      const screenX = nowOnScreen ? nowX.value - el.scrollLeft : viewW / 2
      return { minutes: (el.scrollLeft + screenX) / pxPerMin.value, screenX, row: firstVisibleRow(el) }
    }

    const restoreZoomAnchor = (el, { minutes, screenX, row }) => {
      el.scrollLeft = minutes * pxPerMin.value - screenX
      if (row) el.scrollTop = row.el.offsetTop - row.offset
    }

    const changeZoom = async (step) => {
      const level = EPG_ZOOM_LEVELS[zoomIndex.value + step]
      if (!level) return
      const el = scrollEl.value
      const anchor = el && guide.value ? captureZoomAnchor(el) : null
      zooming.value = true
      zoom.value = level.key
      await nextTick()
      if (anchor) restoreZoomAnchor(el, anchor)
      requestAnimationFrame(() => { zooming.value = false })
    }

    const manualRefresh = async () => {
      guideByDay.clear()
      await Promise.all([loadDay(day.value, { force: true }), loadState({ fresh: true })])
      if (!error.value) flash({ msg: 'Guide refreshed.' })
    }

    const openProgram = (p, channel) => {
      leadTime.value = 2
      lagTime.value = 10
      episodesToKeep.value = 0
      cancelChoice.value = false
      modalAction.value = ''
      setModalStatus('')
      selected.value = { program: p, channel }
    }

    const openSeriesTag = (t) => {
      const link = seriesKey(t)
      const next = upcoming.value.find((r) => String(r.seriesLinkId) === link)
      if (next) return openUpcoming(next)
      openProgram({
        program_id: null,
        epg_program_id: null,
        title: t.name || t.title || link,
        episode_title: null,
        start: null,
        end: null,
        series_link: link,
        channelId: t.channelId,
      }, channelById(t.channelId))
    }

    const openUpcoming = (r) => {
      openProgram({
        program_id: r.programId,
        epg_program_id: r.epgProgramId ?? null,
        title: r.name,
        episode_title: r.episodeTitle || null,
        start: tsOf(r.startDate),
        end: tsOf(r.endDate),
        series_link: r.seriesLinkId || null,
        series_no: r.seriesNo ?? null,
        episode_no: r.episodeNo ?? null,
        has_image: Boolean(r.hasImage),
        channelId: r.channelId,
      }, channelById(r.channelId))
    }

    let returnRoute = ''

    const openHandoff = () => {
      const handoff = guideHandoff.value
      if (!handoff) return
      guideHandoff.value = null
      returnRoute = handoff.returnTo || '#/dashboard'
      if (handoff.upcoming) return openUpcoming(handoff.upcoming)
      const listed = (guide.value?.programs[handoff.channelId] || [])
        .find((p) => p.start === handoff.program.start)
      openProgram(listed || handoff.program, channelById(handoff.channelId))
    }

    const closeModal = () => {
      cancelChoice.value = false
      selected.value = null
      if (!returnRoute) return
      const target = returnRoute
      returnRoute = ''
      window.location.hash = target
    }

    const recordSelected = async () => {
      const { program, channel } = selected.value
      modalBusy.value = true
      modalAction.value = 'record'
      try {
        await api('POST', '/api/epg/record', {
          channel_id: channel?.id ?? program.channelId,
          program_id: program.program_id,
          epg_program_id: program.epg_program_id,
          lead_time: leadTime.value,
          lag_time: lagTime.value,
        })
        flash({ msg: `Scheduled "${program.title}".` })
        closeModal()
        await loadState({ fresh: true })
      } catch (err) {
        setModalStatus(`Record failed: ${err.message}`, 'err', 8000)
      } finally {
        modalBusy.value = false
        modalAction.value = ""
      }
    }

    const recordSelectedSeries = async () => {
      const { program, channel } = selected.value
      modalBusy.value = true
      modalAction.value = 'record-series'
      try {
        await api('POST', '/api/epg/record-series', {
          series_link: program.series_link,
          channel_id: channel?.id ?? program.channelId,
          program_id: program.program_id,
          epg_program_id: program.epg_program_id,
          lead_time: leadTime.value,
          lag_time: lagTime.value,
          episodes_to_keep: episodesToKeep.value,
        })
        flash({ msg: `Series recording set for "${program.title}".` })
        closeModal()
        await loadState({ fresh: true })
      } catch (err) {
        setModalStatus(`Series record failed: ${err.message}`, 'err', 8000)
      } finally {
        modalBusy.value = false
        modalAction.value = ""
      }
    }

    const cancelChoice = ref(false)

    const cancelSelected = async () => {
      const { program } = selected.value
      modalBusy.value = true
      modalAction.value = cancelChoice.value ? 'cancel-episode' : 'cancel'
      try {
        await api('POST', '/api/epg/cancel', { program_id: program.program_id })
        flash({ msg: `Cancelled "${program.title}".` })
        closeModal()
        await loadState({ fresh: true })
      } catch (err) {
        setModalStatus(`Cancel failed: ${err.message}`, 'err', 8000)
      } finally {
        modalBusy.value = false
        modalAction.value = ""
      }
    }

    const cancelSelectedSeries = async () => {
      const { program } = selected.value
      const rec = scheduledByProgramId.value.get(String(program.program_id ?? program.programId))
      modalBusy.value = true
      modalAction.value = cancelChoice.value ? 'cancel-whole' : 'cancel-series'
      try {
        await api('POST', '/api/epg/cancel-series', {
          program_id: rec?.programId ?? null,
          series_link_id: rec?.seriesLinkId ?? program.series_link,
        })
        flash({ msg: `Series recording cancelled.` })
        closeModal()
        await loadState({ fresh: true })
      } catch (err) {
        setModalStatus(`Cancel failed: ${err.message}`, 'err', 8000)
      } finally {
        modalBusy.value = false
        modalAction.value = ""
      }
    }

    const cancelUpcoming = async (r) => {
      if (!confirm(`Cancel the scheduled recording of "${r.name}"?`)) return
      busyId.value = r.programId
      try {
        await api('POST', '/api/epg/cancel', { program_id: r.programId })
        flash({ msg: `Cancelled "${r.name}".` })
        await loadState({ fresh: true })
      } catch (err) {
        flash({ msg: `Cancel failed: ${err.message}`, kind: 'err', ms: 8000 })
      } finally {
        busyId.value = null
      }
    }

    const cancelSeriesTag = async (t) => {
      if (!confirm(`Cancel the series recording "${t.name || seriesKey(t)}"? Existing recordings stay in TVHeadend.`)) return
      busyId.value = seriesKey(t)
      try {
        await api('POST', '/api/epg/cancel-series', {
          program_id: t.programId ?? null,
          series_link_id: t.seriesLinkId ?? t.id,
        })
        flash({ msg: `Series recording cancelled.` })
        await loadState({ fresh: true })
      } catch (err) {
        flash({ msg: `Cancel failed: ${err.message}`, kind: 'err', ms: 8000 })
      } finally {
        busyId.value = null
      }
    }

    const reloadGuide = async () => {
      guideByDay.clear()
      await loadDay(day.value, { force: true })
    }

    const currentPins = () => (guide.value?.channels || [])
      .filter((c) => c.pinned)
      .map((c) => String(c.id))

    const reorderPins = async (pins) => {
      try {
        await api('PUT', '/api/epg/channel-prefs', { pinned_ids: pins })
        await reloadGuide()
      } catch (err) {
        flash({ msg: `Reorder failed: ${err.message}`, kind: 'err', ms: 6000 })
      }
    }

    const pinDrag = usePinDrag({ rowSelector: '.epg-row.pinned', currentPins, onReorder: reorderPins })
    const { dragPinId, dropTargetId, dropAfter, onPinPointerDown, onPinPointerMove, onPinPointerUp, onPinPointerCancel } = pinDrag

    const isSeriesRec = (r) =>
      r?.seriesLinkId != null && seriesLinkSet.value.has(String(r.seriesLinkId))

    const pinsOffscreen = ref(false)

    const updatePinsOffscreen = () => {
      const el = scrollEl.value
      if (!el) { pinsOffscreen.value = false; return }
      const rects = [...el.querySelectorAll('.epg-row.pinned')]
        .map((row) => row.getBoundingClientRect())
        .filter((r) => r.height > 0)
      if (!rects.length) { pinsOffscreen.value = false; return }
      const rulerBottom = el.getBoundingClientRect().top + el.querySelector('.epg-ruler').offsetHeight
      pinsOffscreen.value = rects[rects.length - 1].bottom < rulerBottom
    }

    const scrollRailTop = () => scrollEl.value?.scrollTo({ top: 0, behavior: 'smooth' })

    const midnightOnScreen = ref(false)

    const updateMidnightOnScreen = () => {
      const el = scrollEl.value
      if (!el || !guide.value) { midnightOnScreen.value = false; return }
      const viewW = el.clientWidth - railWidthOf(el)
      midnightOnScreen.value = midnightX.value >= el.scrollLeft && midnightX.value <= el.scrollLeft + viewW
    }

    const updateFloatingChips = () => {
      updatePinsOffscreen()
      updateMidnightOnScreen()
    }

    watch([midnightX, guide], () => nextTick(updateMidnightOnScreen))

    const railStripH = ref(0)
    const scrollbarW = ref(0)
    const syncScrollSize = () => {
      railStripH.value = scrollEl.value?.clientHeight || 0
      scrollbarW.value = scrollEl.value ? scrollEl.value.offsetWidth - scrollEl.value.clientWidth : 0
      scrollViewW.value = scrollEl.value?.clientWidth || 0
    }

    let scrollRo = null
    watch(scrollEl, (el, prev) => {
      if (prev) prev.removeEventListener('scroll', updateFloatingChips)
      if (scrollRo) { scrollRo.disconnect(); scrollRo = null }
      if (el) {
        el.addEventListener('scroll', updateFloatingChips, { passive: true })
        scrollRo = new ResizeObserver(() => { syncScrollSize(); updateFloatingChips() })
        scrollRo.observe(el)
      }
      syncScrollSize()
      updateFloatingChips()
    })
    onUnmounted(() => { if (scrollRo) scrollRo.disconnect() })

    const railResize = { active: false, startX: 0, startW: 0 }

    const onRailResizeDown = (e) => {
      e.preventDefault()
      setDragLock(true)
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ }
      railResize.active = true
      railResize.startX = e.clientX
      railResize.startW = railPx.value
    }

    const onRailResizeMove = (e) => {
      if (!railResize.active) return
      railPx.value = clampRailPx(railResize.startW + e.clientX - railResize.startX)
    }

    const onRailResizeUp = () => {
      setDragLock(false)
      if (!railResize.active) return
      railResize.active = false
      try { localStorage.setItem(EPG_RAIL_KEY, String(railPx.value)) } catch { /* private mode */ }
    }

    const togglePin = async (ch) => {
      if (pinDrag.didDrag()) return
      const pinnedIds = (guide.value?.channels || []).filter((c) => c.pinned).map((c) => String(c.id))
      try {
        await togglePinnedChannel({ pinnedIds, channelId: ch.id })
        await reloadGuide()
      } catch (err) {
        flash({ msg: `Favourite failed: ${err.message}`, kind: 'err', ms: 6000 })
      }
    }

    const openChannelsModal = () => {
      channelsModal.value = true
    }

    const onChannelPrefsSaved = async () => {
      channelsModal.value = false
      await reloadGuide()
      flash({ msg: 'Channel preferences saved.' })
    }

    const tooltip = ref(null)
    const tooltipEl = ref(null)
    const hover = { cell: null, anchor: null, timer: 0, frame: 0, x: 0, y: 0 }

    const programmeByKey = computed(() => {
      const map = new Map()
      for (const ch of guide.value?.channels || []) {
        for (const p of guide.value.programs[ch.id] || []) map.set(cellKey(ch, p), { programme: p, channel: ch })
      }
      return map
    })

    const fmtWeekdayClock = (ms) => `${dateFormat({ weekday: 'short' }).format(new Date(ms))} ${fmtClock(ms)}`

    const fmtProgrammeRange = (p) => {
      const crossesMidnight = dayKey(p.start) !== dayKey(p.end - 1)
      return crossesMidnight
        ? `${fmtWeekdayClock(p.start)}–${fmtWeekdayClock(p.end)}`
        : `${fmtClock(p.start)}–${fmtClock(p.end)}`
    }

    const cellIsTruncated = (cell) => {
      const title = cell.querySelector('.epg-cell-title')
      if (!title) return true
      return title.scrollWidth > title.clientWidth + 1
    }

    const clampToViewport = (value, size, viewport) =>
      Math.min(Math.max(value, EPG_TOOLTIP_EDGE_PX), viewport - EPG_TOOLTIP_EDGE_PX - size)

    const besidePointer = ({ width, height }) => {
      const right = hover.x + EPG_TOOLTIP_GAP_PX
      const below = hover.y + EPG_TOOLTIP_GAP_PX
      const fitsRight = right + width <= window.innerWidth - EPG_TOOLTIP_EDGE_PX
      const fitsBelow = below + height <= window.innerHeight - EPG_TOOLTIP_EDGE_PX
      return {
        x: fitsRight ? right : hover.x - EPG_TOOLTIP_GAP_PX - width,
        y: fitsBelow ? below : hover.y - EPG_TOOLTIP_GAP_PX - height,
      }
    }

    const besideCell = ({ height }) => {
      const rect = hover.anchor.getBoundingClientRect()
      const below = rect.bottom + EPG_TOOLTIP_EDGE_PX
      const fitsBelow = below + height <= window.innerHeight - EPG_TOOLTIP_EDGE_PX
      return { x: rect.left, y: fitsBelow ? below : rect.top - EPG_TOOLTIP_EDGE_PX - height }
    }

    const placeTooltip = () => {
      hover.frame = 0
      const el = tooltipEl.value
      if (!el) return
      const size = { width: el.offsetWidth, height: el.offsetHeight }
      const { x, y } = hover.anchor ? besideCell(size) : besidePointer(size)
      const left = clampToViewport(x, size.width, window.innerWidth)
      const top = clampToViewport(y, size.height, window.innerHeight)
      el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
    }

    const schedulePlacement = () => {
      if (!hover.frame) hover.frame = requestAnimationFrame(placeTooltip)
    }

    const hideTooltip = () => {
      clearTimeout(hover.timer)
      cancelAnimationFrame(hover.frame)
      hover.timer = 0
      hover.frame = 0
      tooltip.value = null
    }

    const forgetHoveredCell = () => {
      hideTooltip()
      hover.cell = null
      hover.anchor = null
    }

    const showTooltipFor = async (cell) => {
      const entry = programmeByKey.value.get(cell.dataset.key)
      if (!entry) return
      tooltip.value = entry
      await nextTick()
      placeTooltip()
    }

    const enterCell = (cell) => {
      hideTooltip()
      hover.cell = cell
      hover.anchor = null
      if (!cell || !cellIsTruncated(cell)) return
      hover.timer = setTimeout(() => showTooltipFor(cell), EPG_TOOLTIP_DELAY_MS)
    }

    const onGridPointer = (e) => {
      if (e.pointerType !== 'mouse') return
      hover.x = e.clientX
      hover.y = e.clientY
      const cell = e.target.closest?.('.epg-cell') || null
      if (cell !== hover.cell) return enterCell(cell)
      if (tooltip.value && !hover.anchor) schedulePlacement()
    }

    const onGridPointerOut = (e) => {
      if (e.pointerType !== 'mouse' || hover.anchor) return
      if (hover.cell?.contains(e.relatedTarget)) return
      forgetHoveredCell()
    }

    const onGridFocusIn = (e) => {
      const cell = e.target.closest?.('.epg-cell')
      if (!cell || !cell.matches(':focus-visible') || !cellIsTruncated(cell)) return forgetHoveredCell()
      hideTooltip()
      hover.cell = cell
      hover.anchor = cell
      showTooltipFor(cell)
    }

    const onGridFocusOut = () => {
      if (hover.anchor) forgetHoveredCell()
    }

    const onAnyScroll = () => {
      if (hover.anchor && tooltip.value) return schedulePlacement()
      forgetHoveredCell()
    }

    watch([selected, channelsModal, zoom, guide, mode], forgetHoveredCell)

    let searchTimer = null
    watch(searchQ, () => {
      if (searchTimer) clearTimeout(searchTimer)
      if (mode.value !== 'guide' || !searchActive.value) { searchResults.value = []; return }
      searching.value = true
      searchTimer = setTimeout(async () => {
        try {
          const r = await api('GET', `/api/epg/search?q=${encodeURIComponent(searchQ.value.trim())}`)
          searchResults.value = r.results || []
        } catch {
          searchResults.value = []
        } finally {
          searching.value = false
        }
      }, EPG_SEARCH_DEBOUNCE_MS)
    })

    watch(searchActive, async (active, wasActive) => {
      if (active || !wasActive || mode.value !== 'guide') return
      if (day.value === 0) await scrollToNow()
      else await scrollToMs(clockOfDay(18))
    })

    const onKeydown = (e) => {
      if (e.key !== 'Escape') return
      if (selected.value) closeModal()
      else if (channelsModal.value) channelsModal.value = false
    }

    let statePollTimer = null
    onMounted(async () => {
      window.addEventListener('keydown', onKeydown)
      window.addEventListener('scroll', onAnyScroll, { capture: true, passive: true })
      loadState()
      await loadDay(0)
      openHandoff()
      await scrollToNow()
      statePollTimer = setInterval(loadState, EPG_STATE_POLL_MS)
    })
    onUnmounted(() => {
      window.removeEventListener('keydown', onKeydown)
      window.removeEventListener('scroll', onAnyScroll, { capture: true })
      hideTooltip()
      if (statePollTimer) clearInterval(statePollTimer)
      if (searchTimer) clearTimeout(searchTimer)
    })

    return {
      mode, modes, setMode, day, dayChips, dayTitle, setDay,
      guide, loading, error, errorCode, loadDay, state, stateError, stateLine,
      scrollEl, railPx, trackWidth, trackTailPx, railStripH, scrollbarW, railNumWidth, ticks, nowX, nowMs,
      zoom, zoomIndex, zoomLevelCount: EPG_ZOOM_LEVELS.length, zooming, thumbMinCellPx, changeZoom,
      tooltip, tooltipEl, hideTooltip, onGridPointer, onGridPointerOut, onGridFocusIn, onGridFocusOut,
      recordingStateText, fmtProgrammeRange, cellKey, cellShowsText,
      visibleChannels, railNum, railFilter, pinnedCount, pinsOffscreen, scrollRailTop,
      midnightX, midnightOnScreen, goToNextDay, nextDayLabel, nextDayWeekday, nextDayLongLabel, lastDayLabel,
      cellState, cellStyle, cellWidth, cellTitle, isSeriesScheduled, isSeriesRec, recordingFillPercent,
      jumpNow, jumpTonight, manualRefresh,
      searchQ, searchActive, searchResults, searching, searchPlaceholder, upcomingFiltered, seriesTagsFiltered,
      selected, openProgram, openUpcoming, closeModal, modalBusy, modalAction, canRecord,
      canWatchLive, watchSelected, hasCancelAction,
      modalStatusText, modalStatusKind,
      leadTime, lagTime, episodesToKeep,
      leadOptions: EPG_LEAD_OPTIONS, lagOptions: EPG_LAG_OPTIONS, keepOptions: EPG_KEEP_OPTIONS,
      recordSelected, recordSelectedSeries, cancelSelected, cancelSelectedSeries, cancelChoice,
      upcoming, seriesTags, seriesKey, cancelUpcoming, cancelSeriesTag, openSeriesTag,
      isActiveRecording: (r) => activeRecordingSet.value.has(String(r.programId)),
      busyId, channelsModal, openChannelsModal, onChannelPrefsSaved,
      togglePin, railItems, narrow, showImages, cellHasThumb,
      dropTargetId, dropAfter, dragPinId,
      onPinPointerDown, onPinPointerMove, onPinPointerUp, onPinPointerCancel,
      onRailResizeDown, onRailResizeMove, onRailResizeUp,
      channelById, channelName, hasChannelLogo, fmtClock, fmtDayTime, fmtShortRange, seLabel, ratingLabel, tsOf,
      flashText, flashKind,
    }
  },
}

const live = reactive({
  open: false,
  channel: null,
  nowTitle: '',
  sessionId: null,
  phase: 'idle',
  message: '',
  holders: [],
  conflict: null,
  tuningStartedAt: 0,
})

let liveVideo = null
let liveHls = null
let liveAttached = false
let livePollTimer = null
let liveRun = 0

const liveChannelOf = (channel) => ({
  id: channel.id,
  name: channel.name,
  hasLogo: (channel.logos || []).length > 0,
})

const watchLive = ({ channel, nowTitle }) => {
  if (live.open && live.channel?.id === channel.id && live.phase !== 'ended') return
  stopLive()
  Object.assign(live, {
    open: true, channel, nowTitle, sessionId: null,
    phase: 'tuning', message: '', holders: [], conflict: null, tuningStartedAt: Date.now(),
  })
  liveVideo?.play()?.catch(() => {})
  startLiveSession(liveRun)
}

const stopLive = () => {
  liveRun += 1
  clearTimeout(livePollTimer)
  detachLiveVideo()
  if (live.sessionId) api('DELETE', `/api/live/${live.sessionId}`).catch(() => {})
  Object.assign(live, { open: false, sessionId: null, phase: 'idle', message: '', holders: [], conflict: null })
}

const startLiveSession = async (run) => {
  try {
    const r = await api('POST', '/api/live', { channel_id: live.channel.id })
    if (run !== liveRun) {
      api('DELETE', `/api/live/${r.session.id}`).catch(() => {})
      return
    }
    live.sessionId = r.session.id
    live.conflict = r.conflict
    if (r.session.status === 'ended') return endLive(run, r.session.reason)
    pollLive(run)
  } catch (err) {
    if (run !== liveRun) return
    live.phase = 'ended'
    live.message = liveStartErrorText(err)
    live.holders = err.data?.holders || []
  }
}

const pollLive = async (run) => {
  if (run !== liveRun) return
  try {
    const params = new URLSearchParams({ channel: live.channel.id, session: live.sessionId })
    const r = await api('GET', `/api/live/preflight?${params}`)
    if (run !== liveRun) return
    live.conflict = r.conflict
    const session = r.session
    if (!session || session.id !== live.sessionId || session.status === 'ended') {
      return endLive(run, session?.reason)
    }
    if (session.status === 'live' && !liveAttached) await attachLiveVideo(run, session.playlist)
  } catch {
    if (run !== liveRun) return
  }
  livePollTimer = setTimeout(() => pollLive(run), liveAttached ? LIVE_POLL_PLAYING_MS : LIVE_POLL_TUNING_MS)
}

const playsHlsOnlyNatively = () =>
  !('MediaSource' in window) && liveVideo.canPlayType('application/vnd.apple.mpegurl') !== ''

const attachLiveVideo = async (run, playlist) => {
  liveAttached = true
  live.phase = 'live'
  if (!playsHlsOnlyNatively()) return attachHlsJs(run, playlist)
  liveVideo.addEventListener('error', () => {
    if (run !== liveRun || !liveAttached || liveHls) return
    clearVideoSource()
    attachHlsJs(run, playlist)
  }, { once: true })
  liveVideo.src = playlist
  liveVideo.play()?.catch(() => {})
}

const attachHlsJs = async (run, playlist, { rebuilt = false } = {}) => {
  const { default: Hls } = await import('/vendor/hls.mjs')
  if (run !== liveRun) return
  if (!Hls.isSupported()) return endLive(run, { code: 'unsupported' })
  liveHls = new Hls(LIVE_HLS_CONFIG)
  let recovered = false
  liveHls.on(Hls.Events.ERROR, (event, data) => {
    if (!data.fatal || run !== liveRun) return
    if (data.type !== Hls.ErrorTypes.MEDIA_ERROR) return endLive(run, { code: 'playback', detail: data.details })
    if (!recovered) {
      recovered = true
      return liveHls.recoverMediaError()
    }
    if (rebuilt) return endLive(run, { code: 'playback', detail: data.details })
    liveHls.destroy()
    liveHls = null
    attachHlsJs(run, playlist, { rebuilt: true })
  })
  liveHls.loadSource(playlist)
  liveHls.attachMedia(liveVideo)
  liveVideo.play()?.catch(() => {})
}

const endLive = (run, reason) => {
  if (run !== liveRun) return
  clearTimeout(livePollTimer)
  detachLiveVideo()
  if (live.sessionId) api('DELETE', `/api/live/${live.sessionId}`).catch(() => {})
  live.sessionId = null
  live.phase = 'ended'
  live.message = liveReasonText(reason)
}

const detachLiveVideo = () => {
  liveHls?.destroy()
  liveHls = null
  liveAttached = false
  if (!liveVideo) return
  liveVideo.pause()
  clearVideoSource()
}

const clearVideoSource = () => {
  liveVideo.removeAttribute('src')
  liveVideo.load()
}

const liveReasonText = (reason) => {
  const detail = reason?.detail ? `: ${reason.detail}` : '.'
  if (!reason) return 'Stopped: the stream ended.'
  if (reason.code === 'preempted') return `Stopped: the recording "${reason.recording}" took the tuner.`
  if (reason.code === 'no-input') return 'Stopped: TVHeadend gets no signal for this channel.'
  if (reason.code === 'gone') return 'Stopped: TVHeadend ended the stream.'
  if (reason.code === 'idle') return 'Stopped: nobody was watching.'
  if (reason.code === 'shutdown') return 'Stopped: Freetvarr restarted.'
  if (reason.code === 'no-tuner') return 'No free tuner.'
  if (reason.code === 'ffmpeg') return `ffmpeg failed${detail}`
  if (reason.code === 'upstream') return `TVHeadend refused the stream${detail}`
  if (reason.code === 'playback') return `Playback failed${detail}`
  if (reason.code === 'unsupported') return 'This browser cannot play live TV.'
  return 'Stopped.'
}

const liveStartErrorText = (err) => {
  if (err.code === 'no-tuner') return 'No free tuner. Every tuner is busy on another multiplex:'
  return `Error: ${err.message}`
}

const liveHolderText = (h) => `${h.tuner} · ${h.mux} · ${h.holders.join(', ') || 'in use'}`

const fmtCountdown = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

window.addEventListener('pagehide', () => {
  if (!live.sessionId) return
  fetch(`/api/live/${live.sessionId}`, {
    method: 'DELETE',
    keepalive: true,
    headers: { 'x-csrf-token': csrfToken || '' },
  }).catch(() => {})
})

const FULLSCREEN_EXIT_RESUME_MS = 1_500

let resumeAfterFullscreenUntil = 0

const resumeAtLiveEdge = () => {
  if (!live.open || live.phase === 'ended' || !liveVideo) return
  const { seekable } = liveVideo
  if (seekable.length) liveVideo.currentTime = seekable.end(seekable.length - 1)
  liveVideo.play()?.catch(() => {})
}

const onLiveFullscreenExit = () => {
  resumeAfterFullscreenUntil = Date.now() + FULLSCREEN_EXIT_RESUME_MS
  setTimeout(resumeAtLiveEdge, 100)
}

const onLivePause = () => {
  if (Date.now() < resumeAfterFullscreenUntil) setTimeout(resumeAtLiveEdge, 100)
}

const TvIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5.5 1.5 8 4l2.5-2.5"/>
      <rect x="1.5" y="4" width="13" height="10" rx="1.5"/>
      <path d="M6.75 7.25v3.5l2.9-1.75z" fill="currentColor"/>
    </svg>
  `,
}

const RecordIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <circle cx="8" cy="8" r="6"/>
      <circle cx="8" cy="8" r="2.75" fill="currentColor" stroke="none"/>
    </svg>
  `,
}

const StopIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="3.5" y="3.5" width="9" height="9" rx="1"/>
    </svg>
  `,
}

const CrossIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8"/>
    </svg>
  `,
}

const RefreshIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12.7 10.21A5 5 0 1 1 8.5 3.53"/>
      <path d="M6.75 1.25 9.25 3.5 6.75 5.75"/>
    </svg>
  `,
}

const SlidersIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M2 3.5h7M12 3.5h2M2 8h2M7 8h7M2 12.5h4.5M9.5 12.5H14"/>
      <circle cx="10.5" cy="3.5" r="1.5"/>
      <circle cx="5.5" cy="8" r="1.5"/>
      <circle cx="8" cy="12.5" r="1.5"/>
    </svg>
  `,
}

const ArrowLeftIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M13.5 8h-11M6.5 4l-4 4 4 4"/>
    </svg>
  `,
}

const ArrowRightIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M2.5 8h11M9.5 4l4 4-4 4"/>
    </svg>
  `,
}

const ChevronRightIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M6 3.5l4.5 4.5L6 12.5"/>
    </svg>
  `,
}

const CalendarIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/>
      <path d="M2.5 6.75h11M5.5 2v3M10.5 2v3"/>
    </svg>
  `,
}

const ArrowUpIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M8 13.5v-11M4 6.5l4-4 4 4"/>
    </svg>
  `,
}

const ArrowDownIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M8 2.5v11M4 9.5l4 4 4-4"/>
    </svg>
  `,
}

const PlayIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5.5 3.75v8.5L12.75 8z"/>
    </svg>
  `,
}

const PlusIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M8 3v10M3 8h10"/>
    </svg>
  `,
}

const MinusIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 8h10"/>
    </svg>
  `,
}

const CheckIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 8.5l3.25 3.25L13 5"/>
    </svg>
  `,
}

const StarIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 1.25l2.03 4.3 4.72.58-3.47 3.25.9 4.67L8 11.75l-4.18 2.3.9-4.67L1.25 6.13l4.72-.58z"/>
    </svg>
  `,
}

const StepMarkIcon = {
  props: { state: { type: String, default: 'pending' } },
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path v-if="state === 'done'" d="M3 8.5l3.25 3.25L13 5"/>
      <circle v-else-if="state === 'active'" cx="8" cy="8" r="4" fill="currentColor" stroke="none"/>
      <path v-else-if="state === 'failed'" d="M4 4l8 8M12 4l-8 8"/>
      <path v-else-if="state === 'warn'" d="M8 3v6.25M8 12.75v.25"/>
      <path v-else-if="state === 'skipped'" d="M4 8h8"/>
      <circle v-else cx="8" cy="8" r="3.75"/>
    </svg>
  `,
}

const SortArrow = {
  props: { dir: { type: String, default: null } },
  template: `
    <arrow-down-icon v-if="dir === 'desc'" class="sort-arrow" />
    <arrow-up-icon v-else-if="dir === 'asc'" class="sort-arrow" />
  `,
}

const SignalBarsIcon = {
  template: `
    <svg viewBox="0 0 10 4" class="signal-bars" fill="currentColor" aria-hidden="true">
      <rect x="0" y="0" width="4" height="4"/>
      <rect x="5.5" y="0" width="4" height="4"/>
    </svg>
  `,
}

const SearchIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="7" cy="7" r="4.25"/>
      <path d="M10.25 10.25l3.25 3.25"/>
    </svg>
  `,
}

const PulseIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M1.5 8.5h2.75L6 4l3.5 8.5 1.75-4h3.25"/>
    </svg>
  `,
}

const BoltIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 1.75 3.5 9.25H8l-1 5 5.5-7.5H8z"/>
    </svg>
  `,
}

const DownloadIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M8 2.5V10M4.75 7 8 10.25 11.25 7M3 13.5h10"/>
    </svg>
  `,
}

const TrashIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 5h10M6.5 5V3h3v2M4.5 5l.7 8.5h5.6L11.5 5M6.5 7.5v4M9.5 7.5v4"/>
    </svg>
  `,
}

const ExternalLinkIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9.5 2.5h4v4M13.5 2.5 7.5 8.5M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3"/>
    </svg>
  `,
}

const CopyIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1"/>
      <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/>
    </svg>
  `,
}

const InfoIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25"/>
      <path d="M8 7.25v4"/>
      <circle cx="8" cy="4.9" r="0.85" fill="currentColor" stroke="none"/>
    </svg>
  `,
}

const StaleBuildBanner = {
  template: `
    <div v-if="staleBuild" class="stale-build" role="status">
      <div class="max-w-6xl mx-auto px-4 md:px-6 py-2 flex items-center gap-3">
        <span class="panel-title hidden sm:inline shrink-0">Update</span>
        <span class="stale-build-text">A new version of Freetvarr is ready.</span>
        <button type="button" class="btn btn-sm btn-primary shrink-0" @click="reloadPage"><refresh-icon /> RELOAD</button>
        <button type="button" class="btn btn-icon shrink-0" @click="dismissStaleBuild" aria-label="Dismiss until the next update" title="Dismiss"><cross-icon /></button>
      </div>
    </div>
  `,
  setup() {
    const reloadPage = () => window.location.reload()
    const dismissStaleBuild = () => { dismissedBuild.value = latestBuild.value }
    return { staleBuild, reloadPage, dismissStaleBuild }
  },
}

const LivePlayer = {
  template: `
    <teleport to="body">
    <transition name="epg-sheet">
    <div v-show="live.open" class="epg-modal-backdrop live-backdrop">
      <section class="panel epg-modal live-modal" role="dialog" aria-label="Live TV">
        <header class="panel-header live-header">
          <channel-logo class="shrink-0" :channel-id="live.channel?.id" :has-logo="Boolean(live.channel?.hasLogo)" />
          <div class="flex-1 min-w-0">
            <span class="panel-title block truncate">{{ live.channel?.name }}</span>
            <span v-if="live.nowTitle" class="block truncate text-xs text-ink-dim mt-1">{{ live.nowTitle }}</span>
          </div>
          <button type="button" class="btn btn-icon" @click="stopLive" aria-label="Stop and close"><cross-icon /></button>
        </header>
        <div class="live-frame">
          <video ref="videoEl" :class="['live-video', { 'is-veiled': chips !== 'hidden' }]" playsinline controls></video>
          <div v-if="chips !== 'hidden'" :key="chipsRun" :class="['live-chips', chips]" aria-hidden="true">
            <span v-for="n in 3" :key="n" class="live-chip-orbit" :style="{ '--i': n - 1 }">
              <span class="live-chip-arm"><i class="live-chip"></i></span>
            </span>
          </div>
          <div v-if="chips === 'ended'" class="live-chips-row" aria-hidden="true">
            <i v-for="n in 3" :key="n" class="live-chip"></i>
          </div>
          <span v-if="chips === 'tuning' || chips === 'ended'" class="live-chip-caption">{{ live.channel?.name }} · {{ statusText }}</span>
          <button type="button" class="btn btn-icon live-landscape-close" @click="stopLive" aria-label="Stop and close"><cross-icon /></button>
        </div>
        <div class="panel-body space-y-3">
          <ul v-if="live.holders.length" class="space-y-1 font-mono text-xs text-ink-dim">
            <li v-for="h in live.holders" :key="h.tuner">{{ liveHolderText(h) }}</li>
          </ul>
          <div class="epg-modal-actions flex items-center justify-between gap-3">
            <span :class="['status-readout', 'min-w-0', statusKind]">{{ statusText }}</span>
            <div v-if="live.phase === 'ended'" class="flex shrink-0 gap-2">
              <button type="button" class="btn" @click="retryLive"><refresh-icon /> RETRY</button>
              <button type="button" class="btn" @click="stopLive"><cross-icon /> CLOSE</button>
            </div>
            <button v-else type="button" class="btn btn-danger shrink-0" @click="stopLive"><stop-icon /> STOP</button>
          </div>
        </div>
      </section>
    </div>
    </transition>
    </teleport>
  `,
  setup() {
    const videoEl = ref(null)
    const chips = ref(live.phase === 'tuning' ? 'tuning' : 'hidden')
    const chipsRun = ref(0)
    let chipsTimer = null
    let chipsShownAt = 0
    let handOffPending = false

    const showChips = (state) => {
      clearTimeout(chipsTimer)
      handOffPending = false
      if (state === 'tuning' && chips.value !== 'tuning') {
        chipsRun.value += 1
        chipsShownAt = Date.now()
      }
      chips.value = state
    }

    const animateChipsAway = () => {
      handOffPending = false
      if (chips.value !== 'tuning' || live.phase !== 'live') return
      chips.value = 'handoff'
      chipsTimer = setTimeout(() => { chips.value = 'hidden' }, CHIPS_HANDOFF_MS)
    }

    const handOffToVideo = () => {
      if (chips.value !== 'tuning' || live.phase !== 'live' || handOffPending) return
      handOffPending = true
      const wait = Math.max(0, CHIPS_MIN_SHOWN_MS - (Date.now() - chipsShownAt))
      chipsTimer = setTimeout(animateChipsAway, wait)
    }

    watch(() => live.phase, (phase) => {
      if (phase === 'tuning') return showChips('tuning')
      if (phase === 'ended') return showChips('ended')
      if (phase === 'idle') return showChips('hidden')
    })

    const statusText = computed(() => {
      if (live.phase === 'ended') return live.message
      if (live.phase === 'tuning') {
        const slow = now.value.getTime() - live.tuningStartedAt > TUNING_SLOW_MS
        return slow ? 'TUNING… STILL WAITING FOR A SIGNAL' : 'TUNING…'
      }
      if (!live.conflict) return 'LIVE'
      const wait = fmtCountdown(live.conflict.startsAt - now.value.getTime())
      return `LIVE · "${live.conflict.title}" needs this tuner at ${fmtClockTz(live.conflict.startsAt)} (in ${wait})`
    })

    const statusKind = computed(() => {
      if (live.phase === 'ended' || live.conflict) return 'err'
      return live.phase === 'live' ? 'ok' : 'info'
    })

    const onKeydown = (e) => {
      if (e.key === 'Escape' && live.open) stopLive()
    }

    onMounted(() => {
      liveVideo = videoEl.value
      liveVideo.addEventListener('webkitendfullscreen', onLiveFullscreenExit)
      liveVideo.addEventListener('pause', onLivePause)
      liveVideo.addEventListener('loadeddata', handOffToVideo)
      liveVideo.addEventListener('playing', handOffToVideo)
      window.addEventListener('keydown', onKeydown)
    })
    onUnmounted(() => {
      clearTimeout(chipsTimer)
      window.removeEventListener('keydown', onKeydown)
    })

    const retryLive = () => watchLive({ channel: live.channel, nowTitle: live.nowTitle })
    return { live, videoEl, chips, chipsRun, stopLive, retryLive, statusText, statusKind, liveHolderText }
  },
}

const LIVE_POLL_TUNING_MS = 1_000
const CHIPS_HANDOFF_MS = 440
const CHIPS_MIN_SHOWN_MS = 1_800
const TUNING_SLOW_MS = 15_000
const LIVE_HLS_CONFIG = {
  workerPath: '/vendor/hls.worker.js',
  liveSyncDurationCount: 2,
  liveMaxLatencyDurationCount: 4,
  backBufferLength: 30,
}
const LIVE_POLL_PLAYING_MS = 10_000

const VIEW_MAP = {
  dashboard: DashboardView,
  live: LiveView,
  guide: EpgView,
  shows: ShowsView,
  syncs: SyncsView,
  recordings: RecordingsView,
  settings: SettingsView,
  doctor: DoctorView,
  welcome: WelcomeView,
}

const TABS = [
  { key: 'dashboard',  label: 'DASHBOARD'  },
  { key: 'live',       label: 'LIVE TV'    },
  { key: 'guide',      label: 'TV GUIDE'   },
  { key: 'shows',      label: 'SHOWS'      },
  { key: 'syncs',      label: 'SYNCS'      },
  { key: 'recordings', label: 'RECORDINGS' },
  { key: 'settings',   label: 'SETTINGS'   },
]

const App = {
  template: `
    <div class="min-h-dvh flex flex-col">
      <header class="app-header sticky top-0 z-20 backdrop-blur-md bg-surface-deep/85 border-b border-hairline">
        <div class="max-w-6xl mx-auto px-4 md:px-6">
          <div class="flex items-center justify-between gap-4 py-3">
            <a href="#/dashboard" class="no-hover-underline flex items-center gap-3 no-underline text-ink">
              <svg viewBox="0 0 15.5 3" :class="['brand-mark', 'w-[39px]', 'h-[8px]', 'shrink-0', { syncing: syncStatus.activeSyncId }]" aria-hidden="true">
                <rect x="0"    y="0" width="4" height="3" fill="#1eb6ff"/>
                <rect x="5.75" y="0" width="4" height="3" fill="#ff8a00"/>
                <rect x="11.5" y="0" width="4" height="3" fill="#e2b03c"/>
              </svg>
              <span class="font-mono font-semibold text-lg tracking-[0.1em] text-ink">Freetvarr</span>
              <span class="hidden sm:inline text-xs font-mono uppercase tracking-[0.2em] text-ink-mute translate-y-[2px]"><span class="text-signal-orange">//</span> Self-hosted free-to-air TV</span>
            </a>
            <div class="flex items-center gap-5">
              <a v-if="recordingCount" href="#/dashboard" class="no-hover-underline flex items-center gap-2" :title="recordingCount + ' recording now in TVHeadend'">
                <span class="led-dot sm live"></span>
                <span class="font-mono text-xs tracking-[0.18em] text-signal-orange">REC</span>
              </a>
              <div v-if="syncStatus.activeSyncId || !recordingCount" class="flex items-center gap-2">
                <span :class="['led-dot', 'sm', syncStatus.activeSyncId ? 'live' : 'idle']"></span>
                <span :class="['font-mono', 'text-xs', 'tracking-[0.18em]', syncStatus.activeSyncId ? 'text-signal-orange' : 'text-ink-mute']">
                  {{ syncStatus.activeSyncId ? 'SYNC' : 'IDLE' }}
                </span>
                <span v-if="syncStatus.activeSyncId" class="hidden md:inline text-xs font-mono text-ink-dim">
                  · #{{ syncStatus.activeSyncId }}
                </span>
              </div>
              <div class="hidden md:flex items-center gap-2 font-mono text-xs">
                <span class="text-ink-mute uppercase tracking-[0.18em]">{{ tzShortName }}</span>
                <span class="text-plex-yellow">{{ clockReadout }}</span>
              </div>
            </div>
          </div>
          <nav class="tab-strip">
            <a v-for="t in tabs" :key="t.key"
              :href="'#/' + t.key"
              :data-active="route === t.key"
              :class="['tab-led', 'block', 'whitespace-nowrap', 'px-1', 'py-2', 'font-mono', 'text-sm', 'tracking-[0.2em]', route === t.key ? 'text-ink' : 'text-ink-dim hover:text-ink']">
              {{ t.label }}
            </a>
          </nav>
        </div>
        <stale-build-banner />
      </header>

      <main :class="['flex-1', route === 'guide' ? 'max-w-none' : 'max-w-6xl', 'w-full', 'mx-auto', 'px-4', 'py-5', 'md:px-6', 'md:py-8']">
        <component :is="currentView" :key="route + ':' + refreshTick" />
      </main>

      <footer class="border-t border-hairline">
        <div class="max-w-6xl mx-auto px-4 md:px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-ink-mute">
          <span><a href="/#dashboard" class="no-underline text-ink">Freetvarr</a> <a v-if="appVersion" :href="releaseUrl(appVersion)" target="_blank" rel="noopener noreferrer" class="text-ink-dim" :title="'Freetvarr ' + appVersion + ' on GitHub'">{{ appVersion }}</a> · Self-hosted free-to-air TV</span>
          <a
            href="https://github.com/furey/freetvarr"
            target="_blank"
            rel="noopener noreferrer"
            class="icon-link"
            aria-label="View source on GitHub"
            title="View source on GitHub">
            <svg viewBox="0 0 24 24" class="w-4 h-4" fill="currentColor" aria-hidden="true">
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
            </svg>
          </a>
        </div>
      </footer>
      <live-player />
    </div>
  `,
  setup() {
    const currentView = computed(() => VIEW_MAP[route.value] || DashboardView)
    watch(route, async () => {
      await nextTick()
      document.querySelector('.tab-strip [data-active="true"]')
        ?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
    }, { immediate: true })
    const appVersion = computed(() => serverAbout.value.version || '')
    return {
      route, refreshTick, tabs: TABS, currentView,
      syncStatus, clockReadout, tzShortName, recordingCount,
      appVersion, releaseUrl,
    }
  },
}

const welcomeDismissed = () => {
  try { return localStorage.getItem(WELCOME_DISMISSED_KEY) === '1' } catch { return false }
}

checkForNewBuild()

fetch('/api/settings')
  .then((r) => noteBuild(r).json())
  .then((s) => {
    if (s.tz) tz.value = s.tz
    const hashIsExplicit = (window.location.hash || '').replace(/^#\/?/, '').toLowerCase()
    if (!s.tvh_url && !welcomeDismissed() && hashIsExplicit !== 'welcome') {
      window.history.replaceState(null, '', '#/welcome')
      route.value = 'welcome'
    }
  })
  .catch(() => {})

loadSyncStatus().then(ensureSyncPolling)
pollRecordingNow()

const PULL_TRIGGER_PX = 60
const PULL_HOLD_PX = 52
const PULL_SLOP_PX = 6
const PULL_TICKS = 8
const PULL_MIN_SPIN_MS = 600
const PULL_FADE_MS = 200
const PULL_SETTLE_MS = 350
const PULL_SPRING = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

const PULL_REFRESH_SPINNER = `<span class="pull-refresh-spinner">${
  Array.from({ length: PULL_TICKS }, (_, i) => `<i style="--i:${i}"></i>`).join('')
}</span>`

const isStandaloneApp = () =>
  window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches

const hasScrolledAncestor = (el) => {
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    if (node.scrollTop > 0) return true
  }
  return false
}

const pullBlocked = (e) => window.scrollY > 0
  || e.touches.length > 1
  || Boolean(e.target.closest?.('.epg-modal-backdrop, .epg-row.pinned .epg-rail-cell, .live-row.pinned .live-row-handle'))
  || hasScrolledAncestor(e.target)

const clamp01 = (n) => Math.min(1, Math.max(0, n))

const rubberBand = (dragged, span = window.innerHeight) => (1 - 1 / ((dragged * 0.55) / span + 1)) * span

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const refreshInPlace = async () => {
  refreshTick.value += 1
  await Promise.all([loadSyncStatus(), pollRecordingNow(), wait(PULL_MIN_SPIN_MS)])
}

const refreshFromPull = async () => {
  await checkForNewBuild()
  if (shouldReloadOnPull({ loaded: loadedBuild, latest: latestBuild.value })) return window.location.reload()
  await refreshInPlace()
}

const installPullToRefresh = ({ onRefresh }) => {
  if (!isStandaloneApp()) return
  const page = document.getElementById('app')
  const indicator = document.createElement('div')
  indicator.className = 'pull-refresh'
  indicator.setAttribute('aria-hidden', 'true')
  indicator.innerHTML = PULL_REFRESH_SPINNER
  document.body.append(indicator)
  let start = null
  let claimed = false
  let committed = false
  let offset = 0
  let refreshing = false
  let frame = 0
  const settleTransition = () => (prefersReducedMotion()
    ? 'transform 150ms linear'
    : `transform ${PULL_SETTLE_MS}ms ${PULL_SPRING}`)
  const render = (animate) => {
    const transition = animate ? settleTransition() : 'none'
    page.style.transition = transition
    indicator.style.transition = transition
    page.style.transform = offset ? `translate3d(0, ${offset}px, 0)` : ''
    const bar = page.querySelector('.settings-save-bar')
    if (bar) {
      bar.style.transition = transition
      bar.style.transform = offset ? `translate3d(0, ${-offset}px, 0)` : ''
    }
    indicator.style.transform = `translate3d(-50%, ${offset / 2}px, 0)`
    indicator.style.setProperty('--pull-progress', clamp01(offset / PULL_TRIGGER_PX))
  }
  const place = (px, { animate = false } = {}) => {
    offset = px
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => render(animate))
  }
  const finish = async () => {
    indicator.classList.add('done')
    await wait(PULL_FADE_MS)
    place(0, { animate: true })
    await wait(PULL_SETTLE_MS)
    indicator.classList.remove('refreshing', 'done')
    document.body.classList.remove('pull-refreshing')
    refreshing = false
  }
  const commit = () => {
    committed = true
    indicator.classList.add('refreshing')
  }
  const runRefresh = async () => {
    refreshing = true
    document.body.classList.add('pull-refreshing')
    place(PULL_HOLD_PX, { animate: true })
    await onRefresh().catch(() => {})
    await finish()
  }
  const release = () => {
    start = null
    if (committed) {
      committed = false
      return runRefresh()
    }
    place(0, { animate: true })
  }
  window.addEventListener('touchstart', (e) => {
    if (refreshing || pullBlocked(e)) return
    const touch = e.touches[0]
    start = { x: touch.clientX, y: touch.clientY }
    claimed = false
    committed = false
  }, { passive: true })
  window.addEventListener('touchmove', (e) => {
    if (!start) return
    if (e.touches.length > 1 || document.body.classList.contains('epg-drag-lock')) {
      committed = false
      indicator.classList.remove('refreshing')
      return release()
    }
    const touch = e.touches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (!claimed) {
      if (Math.abs(dx) < PULL_SLOP_PX && Math.abs(dy) < PULL_SLOP_PX) return
      if (Math.abs(dx) > dy) {
        start = null
        return
      }
      claimed = true
    }
    e.preventDefault()
    place(rubberBand(Math.max(0, dy - PULL_SLOP_PX)))
    if (!committed && offset >= PULL_TRIGGER_PX) commit()
  }, { passive: false })
  window.addEventListener('touchend', (e) => {
    if (!start || e.touches.length > 0) return
    release()
  })
  window.addEventListener('touchcancel', () => {
    if (start) release()
  })
}

installPullToRefresh({ onRefresh: refreshFromPull })

const app = createApp(App)
app.component('summary-line', SummaryLine)
app.component('progress-block', ProgressBlock)
app.component('programme-image', ProgrammeImage)
app.component('channel-logo', ChannelLogo)
app.component('toggle-switch', ToggleSwitch)
app.component('channel-identity', ChannelIdentity)
app.component('star-icon', StarIcon)
app.component('step-mark-icon', StepMarkIcon)
app.component('sort-arrow', SortArrow)
app.component('signal-bars-icon', SignalBarsIcon)
app.component('recording-card', RecordingCard)
app.component('recording-now-panel', RecordingNowPanel)
app.component('live-player', LivePlayer)
app.component('stale-build-banner', StaleBuildBanner)
app.component('channels-modal', ChannelsModal)
app.component('info-button', InfoButton)
app.component('about-panel', AboutPanel)
app.component('copy-icon', CopyIcon)
app.component('info-icon', InfoIcon)
app.component('doctor-spinner', DoctorSpinner)
app.component('tv-icon', TvIcon)
app.component('cross-icon', CrossIcon)
app.component('record-icon', RecordIcon)
app.component('stop-icon', StopIcon)
app.component('refresh-icon', RefreshIcon)
app.component('sliders-icon', SlidersIcon)
app.component('arrow-left-icon', ArrowLeftIcon)
app.component('arrow-right-icon', ArrowRightIcon)
app.component('arrow-up-icon', ArrowUpIcon)
app.component('chevron-right-icon', ChevronRightIcon)
app.component('calendar-icon', CalendarIcon)
app.component('arrow-down-icon', ArrowDownIcon)
app.component('play-icon', PlayIcon)
app.component('plus-icon', PlusIcon)
app.component('minus-icon', MinusIcon)
app.component('check-icon', CheckIcon)
app.component('search-icon', SearchIcon)
app.component('pulse-icon', PulseIcon)
app.component('bolt-icon', BoltIcon)
app.component('download-icon', DownloadIcon)
app.component('trash-icon', TrashIcon)
app.component('external-link-icon', ExternalLinkIcon)
app.mount('#app')
