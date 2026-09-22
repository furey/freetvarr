import {
  createApp,
  ref,
  computed,
  onMounted,
  onUnmounted,
  watch,
  nextTick,
} from '/vendor/vue.esm-browser.prod.js'

let csrfToken = null

const getCsrf = async ({ force = false } = {}) => {
  if (csrfToken && !force) return csrfToken
  const res = await fetch('/api/csrf-token')
  if (!res.ok) throw new Error(`csrf-token HTTP ${res.status}`)
  const data = await res.json().catch(() => {
    throw new Error(`csrf-token returned non-JSON (HTTP ${res.status})`)
  })
  csrfToken = data.token
  return csrfToken
}

const apiCall = async (method, url, body, headersExtra = {}) => {
  const headers = { 'Content-Type': 'application/json', ...headersExtra }
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || data.reason || `HTTP ${res.status}`)
    err.code = data.code || null
    err.stage = data.stage || null
    err.status = res.status
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

const fmtTime = (s) => {
  if (!s) return ''
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? `${s.replace(' ', 'T')}Z` : s
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: tz.value, day: '2-digit', month: '2-digit', year: '2-digit',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(iso)).replace(', ', ' ').replace(/\s(am|pm)$/, '$1')
}

const plexSummary = (p) => {
  if (p.triggered) return `plex ✓ (${p.status})`
  if (p.skipped) return 'plex —'
  if (p.error) return `plex ✗ ${p.error}`
  return 'plex ?'
}

const deleteSummary = (d) => {
  if (d.triggered) return `del ✓ ${d.deleted?.length ?? '?'}`
  if (d.skipped) return `del — ${d.reason || ''}`.trim()
  if (d.error) return `del ✗ ${d.error}`
  return 'del ?'
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
  if (s.plex) parts.push({ kind: 'text', text: plexSummary(s.plex) })
  if (s.delete) parts.push({ kind: 'text', text: deleteSummary(s.delete) })
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
const SYNC_FLASH_SAFETY_MS = 60_000

const ROUTES = ['dashboard', 'guide', 'shows', 'syncs', 'recordings', 'settings', 'welcome']
const WELCOME_DISMISSED_KEY = 'freetvarr.welcomeDismissed'
const DEFAULT_ROUTE = 'dashboard'

const DASHBOARD_POLL_MS = 30_000
const SYNCS_POLL_MS = 30_000
const RECORDINGS_POLL_MS = 60_000
const RECORDINGS_ACTIVE_POLL_MS = 2_000
const UNIMPORTED_STATUSES = ['failed', 'skipped']

const parseHash = () => {
  const h = (window.location.hash || '').replace(/^#\/?/, '').toLowerCase()
  return ROUTES.includes(h) ? h : DEFAULT_ROUTE
}

const route = ref(parseHash())
window.addEventListener('hashchange', () => { route.value = parseHash() })

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

let faviconCanvas = null
let faviconCtx = null
let faviconLink = null
let faviconTimer = null
let faviconStart = 0

const ensureFaviconCanvas = () => {
  if (faviconCanvas) return
  faviconCanvas = document.createElement('canvas')
  faviconCanvas.width = FAVICON_SIZE
  faviconCanvas.height = FAVICON_SIZE
  faviconCtx = faviconCanvas.getContext('2d')
  faviconLink = document.querySelector('link[rel="icon"]')
}

const drawFaviconFrame = (now) => {
  const phase = ((now - faviconStart) / FAVICON_BOB_PERIOD_MS) * Math.PI * 2
  faviconCtx.fillStyle = FAVICON_BG
  faviconCtx.fillRect(0, 0, FAVICON_SIZE, FAVICON_SIZE)
  FAVICON_CHIPS.forEach((chip, index) => {
    const stagger = (index / FAVICON_CHIPS.length) * Math.PI * 2
    const offset = Math.sin(phase + stagger) * FAVICON_BOB_AMPLITUDE
    faviconCtx.fillStyle = chip.color
    faviconCtx.fillRect(chip.x, FAVICON_CHIP_BASE_Y - offset, FAVICON_CHIP_WIDTH, FAVICON_CHIP_HEIGHT)
  })
  faviconLink.href = faviconCanvas.toDataURL('image/png')
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
  if (faviconLink) faviconLink.href = '/favicon.svg'
}

watch(() => syncStatus.value.activeSyncId, (curr) => {
  if (curr) startFaviconAnimation()
  else stopFaviconAnimation()
})

const now = ref(new Date())
setInterval(() => { now.value = new Date() }, 1000)

const clockReadout = computed(() => new Intl.DateTimeFormat('en-AU', {
  timeZone: tz.value,
  hour12: true,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
}).format(now.value))

const tzShortName = computed(() => {
  try {
    const parts = new Intl.DateTimeFormat('en-AU', {
      timeZone: tz.value,
      timeZoneName: 'short',
    }).formatToParts(now.value)
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

const fmtClockTz = (ms) => new Intl.DateTimeFormat('en-AU', {
  timeZone: tz.value, hour: 'numeric', minute: '2-digit',
}).format(new Date(ms)).replace(/\s/g, '').toLowerCase()

const tsOfMs = (v) => {
  if (v == null) return 0
  if (typeof v === 'number') return v
  const n = Number(v)
  if (Number.isFinite(n)) return n
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? t : 0
}

const DashboardView = {
  template: `
    <div class="view-reveal space-y-6">
      <section class="panel">
        <header class="panel-header">
          <span class="panel-title">SYNC DECK</span>
          <span v-if="syncStatus.cron" class="text-xs font-mono text-ink-dim">CRON · <code>{{ syncStatus.cron }}</code></span>
        </header>
        <div class="panel-body grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div class="flex flex-wrap items-center gap-4 mb-3">
              <span :class="['led-dot', syncStatus.activeSyncId ? 'live' : 'idle']"></span>
              <span :class="['text-3xl', 'md:text-4xl', 'font-mono', 'tracking-[0.2em]', syncStatus.activeSyncId ? 'text-signal-orange' : 'text-ink-dim']">
                {{ syncStatus.activeSyncId ? 'SYNC' : 'IDLE' }}
              </span>
              <span v-if="syncStatus.activeSyncId" class="font-mono text-sm text-ink-dim">
                · sync #{{ syncStatus.activeSyncId }} in progress
              </span>
            </div>
            <p v-if="lastSync" class="font-mono text-sm text-ink-dim">
              Last sync #{{ lastSync.id }}
              · <span :class="['pill', lastSync.status]">{{ lastSync.status }}</span>
              · {{ fmtTime(lastSync.started_at) }}
              <span v-if="lastSync.summary"> · <summary-line :summary="lastSync.summary"/></span>
            </p>
            <p v-else class="text-sm text-ink-dim">No syncs yet — kick one off.</p>
          </div>
          <div class="flex items-center gap-3 md:justify-self-end">
            <span v-if="flashText" :class="['status-readout', flashKind]">{{ flashText }}</span>
            <button type="button" class="btn btn-primary" @click="syncNow" :disabled="!!syncStatus.activeSyncId || starting">
              {{ starting ? 'STARTING…' : '▶ SYNC NOW' }}
            </button>
          </div>
        </div>
      </section>

      <section class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <a href="#/shows" class="panel p-5 block text-ink hover:text-ink no-hover-underline hover:border-signal-orange transition-colors">
          <div class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim mb-2">Shows</div>
          <div class="text-3xl md:text-4xl font-mono text-ink">{{ showCount }}</div>
          <div class="text-xs text-ink-dim mt-2">
            <span class="text-plex-yellow">{{ showEnabledCount }}</span> enabled
          </div>
        </a>
        <a href="#/recordings" class="panel p-5 block text-ink hover:text-ink no-hover-underline hover:border-signal-orange transition-colors">
          <div class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim mb-2">Recordings 7d</div>
          <div class="text-3xl md:text-4xl font-mono text-ink">{{ recordings7dCount }}</div>
          <div class="text-xs text-ink-dim mt-2">
            <span class="text-plex-yellow">{{ recordingsTotal }}</span> in window
          </div>
        </a>
        <article class="panel p-5">
          <div class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim mb-2">TVHeadend</div>
          <div class="text-lg font-mono" :class="tvhClass">{{ tvhLabel }}</div>
          <div v-if="tvhMeta" class="text-xs font-mono text-ink-dim mt-2 truncate" :title="tvhMeta">{{ tvhMeta }}</div>
        </article>
        <article class="panel p-5">
          <div class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim mb-2">Plex</div>
          <div class="text-lg font-mono" :class="plexClass">{{ plexLabel }}</div>
          <div v-if="plexHost" class="text-xs font-mono text-ink-dim mt-2 truncate">{{ plexHost }}</div>
        </article>
      </section>

      <section v-if="tvhConfigured && guideOk" class="panel">
        <header class="panel-header">
          <span class="panel-title">TV GUIDE</span>
          <a href="#/guide" class="text-xs font-mono uppercase tracking-[0.16em]">Open guide →</a>
        </header>
        <div class="panel-body space-y-5">
          <div v-if="onNow.length">
            <div class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim mb-3">On now · pinned channels</div>
            <div class="space-y-3">
            <div v-for="e in onNow" :key="e.channel.id" class="flex items-center gap-3 md:gap-4">
              <img v-if="e.channel.hasLogo" class="epg-rail-logo shrink-0" :src="'/api/epg/logo/' + e.channel.id" alt=""
                @error="$event.target.style.display = 'none'" />
              <span class="font-mono text-xs text-ink-dim w-20 md:w-28 shrink-0 truncate" :title="e.channel.name">{{ e.channel.name }}</span>
              <div class="flex-1 min-w-0">
                <template v-if="e.now">
                  <span class="block truncate">
                    <span class="text-sm font-semibold text-ink mr-3">{{ e.now.title }}</span>
                    <span class="font-mono text-xs text-ink-dim">{{ onNowMeta(e.now) }}</span>
                  </span>
                  <div class="progress" style="margin-top: 0.25rem; max-width: none;">
                    <div class="progress-track">
                      <div class="progress-fill" :style="{ width: onNowPercent(e.now) + '%' }"></div>
                    </div>
                  </div>
                </template>
                <span v-else class="text-sm text-ink-mute">off air</span>
              </div>
              <span v-if="e.next" class="hidden sm:block font-mono text-xs text-ink-dim min-w-0 max-w-[16rem] truncate">
                next: <span class="text-xs font-semibold font-sans text-ink">{{ e.next.title }}</span> {{ fmtClockTz(e.next.start) }}
              </span>
            </div>
            </div>
          </div>
          <p v-else class="text-xs text-ink-dim">
            Pin channels in the <a href="#/guide">TV Guide</a> (★ in the channel rail) to see what's on now.
          </p>
          <div v-if="guideUpcoming.length">
            <div class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim mb-3">Next recordings</div>
            <div class="space-y-2">
              <p v-for="r in guideUpcoming" :key="r.id" class="flex items-center gap-2.5 font-mono text-xs text-ink-dim min-w-0">
                <span class="led-dot sm shrink-0" :style="{ background: isSeriesRec(r) ? '#e2b03c' : '#1eb6ff' }"></span>
                <span class="truncate min-w-0"><span class="text-ink">{{ r.name }}</span>
                · {{ fmtClockTz(tsOfMs(r.startDate)) }}<template v-if="r.episodeTitle"> · {{ r.episodeTitle }}</template> · {{ isSeriesRec(r) ? 'series' : 'one-off' }}</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section class="panel">
        <header class="panel-header">
          <span class="panel-title">RECENT SYNCS</span>
          <a href="#/syncs" class="text-xs font-mono uppercase tracking-[0.16em]">See all →</a>
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
    const { flashText, flashKind, flash, flashUntilSyncDone } = useFlash()
    const starting = ref(false)
    const recentSyncs = ref([])
    const showCount = ref(0)
    const showEnabledCount = ref(0)
    const recordingsTotal = ref(0)
    const recordings7dCount = ref(0)
    const plexHost = ref('')
    const plexConfigured = ref(false)
    const tvhConfigured = ref(false)
    const tvhState = ref(null)
    const tvhReachable = ref(false)
    const onNow = ref([])
    const guideUpcoming = ref([])
    const guideSeriesLinks = ref(new Set())
    const guideOk = ref(true)

    const lastSync = computed(() => recentSyncs.value[0] || null)

    const onNowPercent = (p) => {
      const span = p.end - p.start
      if (span <= 0) return 0
      return Math.min(100, Math.max(0, Math.round(((Date.now() - p.start) / span) * 100)))
    }

    const onNowMeta = (p) => {
      const mins = Math.max(0, Math.ceil((p.end - Date.now()) / 60_000))
      return `${fmtClockTz(p.start)} · ${mins} min${mins === 1 ? '' : 's'} remaining`
    }

    const loadGuidePanel = async () => {
      if (!tvhConfigured.value) {
        tvhReachable.value = false
        tvhState.value = null
        return
      }
      const s = await api('GET', '/api/epg/state').catch(() => null)
      tvhState.value = s
      tvhReachable.value = Boolean(s) && !s.stale
      guideSeriesLinks.value = new Set((s?.seriesTags || []).map((t) => String(t.seriesLinkId ?? t.id)))
      guideUpcoming.value = (s?.futureRecordings || [])
        .filter((r) => !r.pendingDelete)
        .sort((a, b) => tsOfMs(a.startDate) - tsOfMs(b.startDate))
        .slice(0, 3)
      try {
        const r = await api('GET', '/api/epg/now')
        onNow.value = r.entries || []
        guideOk.value = true
      } catch {
        guideOk.value = false
      }
    }

    const isSeriesRec = (r) =>
      r?.seriesLinkId != null && guideSeriesLinks.value.has(String(r.seriesLinkId))

    const plexLabel = computed(() => plexConfigured.value ? 'Connected' : 'Not configured')
    const plexClass = computed(() => plexConfigured.value ? 'text-plex-yellow' : 'text-ink-dim')

    const activeRecordingCount = computed(() =>
      (tvhState.value?.futureRecordings || []).filter((r) => r.schedStatus === 'recording').length)

    const tvhLabel = computed(() => {
      if (!tvhConfigured.value) return 'Not configured'
      return tvhReachable.value ? 'Reachable' : 'Unreachable'
    })

    const tvhClass = computed(() => {
      if (!tvhConfigured.value) return 'text-ink-dim'
      return tvhReachable.value ? 'text-plex-yellow' : 'text-signal-orange-hi'
    })

    const tvhMeta = computed(() => {
      const s = tvhState.value
      if (!s) return ''
      const bits = []
      if (s.tunerCount) bits.push(`${s.tunerCount} tuner${s.tunerCount === 1 ? '' : 's'}`)
      bits.push(`${activeRecordingCount.value} recording`)
      if (s.storageInfo?.free) bits.push(`${fmtBytes(s.storageInfo.free)} free`)
      return bits.join(' · ')
    })

    const refresh = async () => {
      const [syncs, shows, recordings, settings] = await Promise.all([
        api('GET', '/api/syncs').catch(() => ({ syncs: [] })),
        api('GET', '/api/shows').catch(() => ({ shows: [] })),
        api('GET', '/api/recordings').catch(() => ({ recordings: [] })),
        api('GET', '/api/settings').catch(() => ({})),
      ])
      recentSyncs.value = (syncs.syncs || []).slice(0, 5)
      showCount.value = shows.shows?.length || 0
      showEnabledCount.value = shows.shows?.filter((s) => s.enabled).length || 0
      recordingsTotal.value = recordings.recordings?.length || 0
      recordings7dCount.value = recordings.recordings?.filter((r) => within7Days(r.imported_at)).length || 0
      plexConfigured.value = Boolean(settings.plex_url && settings.plex_token_set && settings.plex_tv_section_id)
      try {
        plexHost.value = settings.plex_url ? new URL(settings.plex_url).host : ''
      } catch {
        plexHost.value = settings.plex_url || ''
      }
      tvhConfigured.value = Boolean(settings.tvh_url)
      loadGuidePanel()
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

    let pollTimer = null
    onMounted(() => {
      refresh()
      pollTimer = setInterval(refresh, DASHBOARD_POLL_MS)
    })
    onUnmounted(() => {
      if (pollTimer) clearInterval(pollTimer)
    })
    const stopWatch = watch(() => syncStatus.value.activeSyncId, refresh)
    onUnmounted(stopWatch)

    return {
      syncStatus, lastSync, recentSyncs,
      showCount, showEnabledCount, recordingsTotal, recordings7dCount,
      plexLabel, plexClass, plexHost,
      tvhLabel, tvhClass, tvhMeta, tvhConfigured,
      onNow, guideUpcoming, guideOk, onNowPercent, onNowMeta, isSeriesRec, fmtClockTz, tsOfMs,
      starting, syncNow, fmtTime,
      flashText, flashKind,
    }
  },
}

const ShowsView = {
  template: `
    <div class="view-reveal space-y-6">
      <section class="panel">
        <header class="panel-header">
          <span class="panel-title">TRACKED SHOWS · {{ shows.length }}</span>
          <span v-if="flashText" :class="['status-readout', flashKind]">{{ flashText }}</span>
        </header>
        <div class="panel-body">
          <table v-if="shows.length" class="deck-table hidden md:table">
            <thead><tr>
              <th>Show pattern</th>
              <th>Destination</th>
              <th>Season template</th>
              <th>Enabled</th>
              <th title="Delete from TVHeadend after each successful import.">Delete after import</th>
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
                      {{ syncingId === s.id ? 'STARTING…' : '▶ SYNC' }}
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
                  Delete after import
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
                  {{ syncingId === s.id ? 'STARTING…' : '▶ SYNC' }}
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
          <span class="panel-title">TRACK NEW SHOW</span>
        </header>
        <form class="panel-body" @submit.prevent="add">
          <div class="grid gap-4 md:grid-cols-2">
            <div class="field-row">
              <label class="field-label">Title match</label>
              <div class="flex flex-wrap items-center gap-2">
                <input type="text" v-model="newPattern" list="tvh-shows" placeholder="e.g. Bluey" class="field-input flex-1 min-w-[12rem]" />
                <button type="button" class="btn btn-sm" @click="loadTvhShows" :disabled="loadingShows"
                  title="List the titles TVHeadend has finished recordings for.">
                  {{ loadingShows ? 'LISTING…' : '⟳ REFRESH TITLES' }}
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
              <span class="field-label">Auto-delete</span>
              <label class="flex items-center gap-3 cursor-pointer h-[2.5rem]">
                <input id="new-del-after" type="checkbox" class="chk" v-model="newDeleteAfter" />
                <span class="font-mono text-sm text-ink-dim">
                  Delete from TVHeadend after each successful import
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
              {{ adding ? 'ADDING…' : '＋ TRACK SHOW' }}
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
          <span class="panel-title" title="Older syncs auto-pruned to keep the latest 500.">SYNCS · {{ filter === 'all' ? 'LATEST' : filter.toUpperCase() }} {{ syncs.length }}</span>
          <div class="flex items-center gap-3">
            <span v-if="syncStatus.cron" class="text-xs font-mono text-ink-dim">CRON · <code>{{ syncStatus.cron }}</code></span>
            <span class="text-xs font-mono text-ink-mute" title="History is auto-capped server-side at 500 most recent syncs.">CAP · 500</span>
            <span v-if="flashText" :class="['status-readout', flashKind]">{{ flashText }}</span>
          </div>
        </header>
        <div class="panel-body space-y-4">
          <div class="flex flex-wrap gap-3">
            <button type="button" class="btn btn-primary" @click="syncNow" :disabled="starting || !!syncStatus.activeSyncId">
              {{ syncStatus.activeSyncId ? '● SYNC RUNNING…' : (starting ? 'STARTING…' : '▶ SYNC NOW') }}
            </button>
            <button type="button" class="btn" @click="manualRefresh"><span class="btn-glyph">⟳</span> REFRESH</button>
            <button type="button" class="btn btn-danger" @click="clearAll" :disabled="!syncs.length">⨯ CLEAR HISTORY</button>
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
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M3 5h10M6.5 5V3h3v2M4.5 5l.7 8.5h5.6L11.5 5M6.5 7.5v4M9.5 7.5v4"/>
                    </svg>
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
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M3 5h10M6.5 5V3h3v2M4.5 5l.7 8.5h5.6L11.5 5M6.5 7.5v4M9.5 7.5v4"/>
                  </svg>
                </button>
              </div>
              <p class="deck-card-meta">
                {{ fmtTime(s.started_at) }}<template v-if="s.finished_at"> → {{ fmtTime(s.finished_at) }}</template>
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
      { key: 'deletes',   label: 'DELETES' },
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
          <span class="panel-title">TRACKED RECORDINGS · {{ rangeLabel }} of {{ total }}</span>
          <div class="flex flex-wrap items-center gap-3">
            <span v-if="flashText" :class="['status-readout', flashKind]">{{ flashText }}</span>
            <button type="button" class="btn btn-sm btn-danger" @click="purgeDeleted"
              :disabled="purging"
              title="Remove all tombstoned rows from Freetvarr's history (recordings already deleted from TVHeadend).">
              {{ purging ? 'PURGING…' : '⨯ PURGE DELETED' }}
            </button>
            <button type="button" class="btn btn-sm" @click="manualRefresh"><span class="btn-glyph">⟳</span> REFRESH</button>
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
            Legend: <span class="tombstone-legend">struck-through + dim</span> = deleted from TVHeadend.
          </p>
          <table v-if="recordings.length" class="deck-table hidden md:table">
            <thead><tr>
              <th class="sortable" @click="toggleSort('show_pattern')">Show{{ sortMarker('show_pattern') }}</th>
              <th class="sortable" @click="toggleSort('title')">Title{{ sortMarker('title') }}</th>
              <th>S/E</th>
              <th class="sortable" @click="toggleSort('size')">Size{{ sortMarker('size') }}</th>
              <th class="sortable" @click="toggleSort('status')">Status{{ sortMarker('status') }}</th>
              <th title="Ad break detection/removal status. Hover a pill for break count + minutes.">Ads</th>
              <th class="sortable" @click="toggleSort('imported_at')">Imported{{ sortMarker('imported_at') }}</th>
              <th></th>
            </tr></thead>
            <tbody>
              <tr v-for="r in recordings" :key="r.recording_id"
                :class="{ tombstone: r.deleted_from_tvh_at }"
                :title="r.deleted_from_tvh_at ? 'Deleted from TVHeadend ' + fmtTime(r.deleted_from_tvh_at) : ''">
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
                    title="Delete this recording from TVHeadend. Irreversible.">
                    <span v-if="deletingId === r.recording_id">…</span>
                    <svg v-else viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M3 5h10M6.5 5V3h3v2M4.5 5l.7 8.5h5.6L11.5 5M6.5 7.5v4M9.5 7.5v4"/>
                    </svg>
                  </button>
                  <button v-else-if="canRemove(r)" type="button" class="btn btn-sm btn-icon btn-danger"
                    @click="removeRecording(r)" :disabled="removingId === r.recording_id"
                    :title="removeTitle(r)">
                    <span v-if="removingId === r.recording_id">…</span>
                    <svg v-else viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M3 5h10M6.5 5V3h3v2M4.5 5l.7 8.5h5.6L11.5 5M6.5 7.5v4M9.5 7.5v4"/>
                    </svg>
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
                deleted from TVHeadend {{ fmtTime(r.deleted_from_tvh_at) }}
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
                  <svg v-else viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M3 5h10M6.5 5V3h3v2M4.5 5l.7 8.5h5.6L11.5 5M6.5 7.5v4M9.5 7.5v4"/>
                  </svg>
                </button>
                <button v-else-if="canRemove(r)" type="button" class="btn btn-sm btn-icon btn-danger"
                  @click="removeRecording(r)" :disabled="removingId === r.recording_id" :title="removeTitle(r)">
                  <span v-if="removingId === r.recording_id">…</span>
                  <svg v-else viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M3 5h10M6.5 5V3h3v2M4.5 5l.7 8.5h5.6L11.5 5M6.5 7.5v4M9.5 7.5v4"/>
                  </svg>
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
              <button type="button" class="btn btn-sm" :disabled="page <= 1" @click="page = page - 1">← PREV</button>
              <button type="button" class="btn btn-sm" :disabled="page >= totalPages" @click="page = page + 1">NEXT →</button>
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
      { key: 'deleted',  label: 'DELETED'  },
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

    const sortMarker = (col) => {
      if (sortCol.value !== col || !sortDir.value) return ''
      return sortDir.value === 'desc' ? ' ↓' : ' ↑'
    }

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
      const prompt = `Delete "${r.title}" from TVHeadend?\n\n`
        + 'This is irreversible — the recording in TVHeadend will be gone.'
      if (!confirm(prompt)) return
      deletingId.value = r.recording_id
      try {
        const url = `/api/recordings/${encodeURIComponent(r.recording_id)}/delete-from-tvh`
        const result = await api('POST', url)
        if (result.ok) {
          flash({ msg: `Deleted "${r.title}" from TVHeadend.` })
          await refresh()
        } else {
          flash({
            msg: `Delete failed: ${result.error} (stage: ${result.stage || '?'})`,
            kind: 'err',
            ms: 8000,
          })
        }
      } catch (err) {
        flash({ msg: `Delete failed: ${err.message}`, kind: 'err', ms: 8000 })
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
      setStatus, setShow, setSince, setDeleted, toggleSort, sortMarker,
      se: seasonEpisodeLabel, fmtBytes, fmtTime,
      flashText, flashKind,
    }
  },
}

const SettingsView = {
  template: `
    <div class="view-reveal space-y-6">
      <section class="panel">
        <header class="panel-header">
          <span class="panel-title">SETUP WIZARD</span>
          <span class="text-xs font-mono text-ink-dim">re-walk the first-run flow</span>
        </header>
        <div class="panel-body flex flex-wrap items-center justify-between gap-4">
          <p class="text-sm text-ink-dim leading-relaxed max-w-2xl">
            Re-open the guided setup at any time. Already-saved values prefill — including a <code>••••• (stored)</code> hint for the Plex token and the TVHeadend password — so you can tweak one step without retyping the rest. To wipe captured data first, use <strong class="text-ink">NUKE ALL STATE</strong> in the Danger Zone below.
          </p>
          <button type="button" class="btn" @click="reopenWizard"><span class="btn-glyph">⟳</span> REOPEN WIZARD</button>
        </div>
      </section>
      <form @submit.prevent="save" class="space-y-6 pb-24">
        <section class="panel">
          <header class="panel-header">
            <span class="panel-title">TVHEADEND</span>
            <span class="text-xs font-mono text-ink-dim">the recorder</span>
          </header>
          <div class="panel-body grid gap-4 md:grid-cols-3">
            <div class="md:col-span-3 flex flex-wrap items-center gap-3">
              <button type="button" class="btn" @click="detectTvh" :disabled="tvhDetecting">
                {{ tvhDetecting ? 'SCANNING…' : '◎ AUTO-DISCOVER TVHEADEND' }}
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
                {{ tvhTesting ? 'TESTING…' : '↯ TEST CONNECTION' }}
              </button>
              <span v-if="tvhStatus" :class="['status-readout', tvhStatusKind]">{{ tvhStatus }}</span>
            </div>
            <div class="md:col-span-3 flex items-center gap-3">
              <input id="del-plex-only" type="checkbox" class="chk" v-model="deleteAfterPlexRefreshOnly" />
              <label for="del-plex-only" class="text-sm text-ink-dim">
                Only delete from TVHeadend after Plex refresh succeeds
                <span class="text-ink-mute">(recommended — confirms the file is in Plex first)</span>
              </label>
            </div>
          </div>
        </section>

        <section class="panel">
          <header class="panel-header">
            <span class="panel-title">SCHEDULE</span>
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

        <section class="panel">
          <header class="panel-header">
            <span class="panel-title">STORAGE</span>
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
                {{ mediaRootTesting ? 'TESTING…' : '↯ TEST PATH' }}
              </button>
              <span v-if="mediaRootStatus" :class="['status-readout', mediaRootStatusKind]">{{ mediaRootStatus }}</span>
            </div>
            <div class="grid gap-4 md:grid-cols-2 pt-1">
              <div class="field-row">
                <label class="field-label">Recordings folder (as Freetvarr sees it)</label>
                <input type="text" class="field-input" v-model="recordingsRoot" placeholder="/recordings" />
              </div>
              <div class="field-row">
                <label class="field-label">Recordings folder (as TVHeadend sees it)</label>
                <input type="text" class="field-input" v-model="tvhRecordingsPath" placeholder="/recordings" />
              </div>
            </div>
            <p class="text-xs text-ink-mute leading-relaxed">
              Both containers must mount the same folder; Freetvarr rewrites TVHeadend's file paths onto its own mount, then hardlinks or copies the file.
            </p>
          </div>
        </section>

        <section class="panel">
          <header class="panel-header">
            <span class="panel-title">PLEX</span>
            <span class="text-xs font-mono text-ink-dim">post-sync section refresh</span>
          </header>
          <div class="panel-body grid gap-4 md:grid-cols-2">
            <div class="md:col-span-2 flex flex-wrap items-center gap-3">
              <button type="button" class="btn" @click="discoverPlex" :disabled="plexDiscovering">
                {{ plexDiscovering ? 'SCANNING…' : '◎ AUTO-DISCOVER PLEX' }}
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
                  {{ plexDetecting ? 'DETECTING…' : '⚡ AUTO-DETECT TOKEN' }}
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
                {{ plexProbing ? 'PROBING…' : '⇣ LOAD SECTIONS' }}
              </button>
              <button type="button" class="btn" @click="refreshPlexNow" :disabled="plexRefreshing">
                {{ plexRefreshing ? 'REFRESHING…' : '⟳ REFRESH PLEX NOW' }}
              </button>
              <span v-if="plexStatus" :class="['status-readout', plexStatusKind]">{{ plexStatus }}</span>
            </div>
          </div>
        </section>

        <section class="panel">
          <header class="panel-header">
            <span class="panel-title">AD REMOVAL</span>
            <span class="text-xs font-mono text-ink-dim">comskip · optional</span>
          </header>
          <div class="panel-body space-y-4">
            <div class="flex items-center gap-3">
              <input id="ad-removal-enabled" type="checkbox" class="chk" v-model="adRemovalEnabled" />
              <label for="ad-removal-enabled" class="text-sm text-ink-dim">
                Enable ad removal
                <span class="text-ink-mute">(per-show mode is set on the Shows tab)</span>
              </label>
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

        <section class="panel">
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
                {{ nuking ? 'NUKING…' : '☠ NUKE ALL STATE' }}
              </button>
            </div>
          </div>
        </section>

        <div class="settings-save-bar">
          <div class="max-w-6xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3">
            <span v-if="status" :class="['status-readout', statusKind]">{{ status }}</span>
            <span v-else class="text-xs font-mono text-ink-mute">Changes apply on save · scheduler reloads if <code>sync_cron</code> changed.</span>
            <button type="submit" class="btn btn-primary" :disabled="saving">
              {{ saving ? 'SAVING…' : '✓ SAVE SETTINGS' }}
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
    })

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
      recordingsRoot, tvhRecordingsPath,
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

const WelcomeView = {
  template: `
    <div class="view-reveal space-y-6">
      <section class="panel">
        <header class="panel-header">
          <span class="panel-title">{{ stepTitle }} · STEP {{ step }} / {{ totalSteps }}</span>
          <button type="button" class="btn-link" @click="skipToSettings">SKIP TO SETTINGS →</button>
        </header>
        <div class="panel-body space-y-4">

          <div v-if="step === 1" class="space-y-4">
            <p class="text-ink text-base leading-relaxed">
              Freetvarr watches <strong class="text-signal-orange">TVHeadend</strong> for new recordings of shows you follow, imports them into your <strong class="text-plex-yellow">Plex</strong> library, and (optionally) deletes them from TVHeadend afterwards.
            </p>
            <p class="text-ink-dim text-sm leading-relaxed">
              This wizard takes about two minutes. The only required step is pointing Freetvarr at TVHeadend — Plex is optional.
            </p>
            <p v-if="hasExistingConfig" class="text-xs font-mono text-plex-yellow">
              ● RETURN VISIT — your existing settings are prefilled. Leave a field as-is to keep its stored value; stored secrets show as <code>••••• (stored)</code>.
            </p>
          </div>

          <div v-if="step === 2" class="space-y-4">
            <p class="text-ink text-sm leading-relaxed">
              Freetvarr needs the address of your TVHeadend server. Leave the username and password blank if TVHeadend allows anonymous access.
            </p>
            <div class="flex flex-wrap items-center gap-3">
              <button type="button" class="btn" @click="detectTvh()" :disabled="tvhDetecting">
                {{ tvhDetecting && !tvhAutoScanning ? 'SCANNING…' : '◎ AUTO-DISCOVER TVHEADEND' }}
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
                {{ tvhTesting ? 'TESTING…' : '↯ TEST CONNECTION' }}
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
                  {{ mediaRootTesting ? 'TESTING…' : '↯ TEST PATH' }}
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
              </div>
              <div class="field-row">
                <label class="field-label">Recordings folder (as TVHeadend sees it)</label>
                <input type="text" class="field-input" v-model="tvhRecordingsPath" placeholder="/recordings" />
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
                {{ plexDiscovering ? 'SCANNING…' : '◎ AUTO-DISCOVER PLEX' }}
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
                    {{ plexDetectingToken ? 'DETECTING…' : '⚡ AUTO-DETECT TOKEN' }}
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
                  {{ plexProbing ? 'PROBING…' : '⇣ LOAD SECTIONS' }}
                </button>
                <span v-if="plexSectionsText"
                  :class="['status-readout', plexSectionsKind]">{{ plexSectionsText }}</span>
              </div>
            </div>
          </div>

          <div v-if="step === 5" class="space-y-4">
            <p class="text-ink text-base leading-relaxed">
              <span class="text-plex-yellow">●</span> You're set.
            </p>
            <p class="text-ink-dim text-sm leading-relaxed">
              Next: head to the <strong class="text-ink">Shows</strong> tab and add your first show. Freetvarr will pick it up on the next sync (every 30 minutes by default).
            </p>
          </div>

        </div>
        <div class="panel-body border-t border-hairline flex items-center justify-between gap-3 pt-4">
          <button type="button" class="btn" @click="back" :disabled="step === 1 || saving">← BACK</button>
          <div class="flex items-center gap-3">
            <span v-if="saveStatusText"
              :class="['status-readout', saveStatusKind]">{{ saveStatusText }}</span>
            <span v-else-if="!canAdvance" class="text-xs text-signal-yellow font-mono">A TVHeadend URL is required to continue.</span>
            <button type="button" class="btn btn-primary" @click="next" :disabled="!canAdvance || saving">
              {{ nextLabel }}
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
      if (step.value === totalSteps) return 'GO TO SHOWS →'
      if (step.value === 2) return 'SAVE & NEXT →'
      if (step.value === 3) {
        const hasStorage = mediaRoot.value || recordingsRoot.value || tvhRecordingsPath.value
        return hasStorage ? 'SAVE & NEXT →' : 'SKIP →'
      }
      if (step.value === 4) {
        const hasPlex = plexUrl.value || plexToken.value || plexSectionId.value
        return hasPlex ? 'SAVE & NEXT →' : 'SKIP →'
      }
      return 'NEXT →'
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
          const body = {
            tvh_url: tvhUrl.value.trim(),
            tvh_username: tvhUsername.value.trim(),
          }
          if (tvhPassword.value) body.tvh_password = tvhPassword.value
          await api('POST', '/api/settings', body)
          if (tvhPassword.value) {
            tvhPasswordSet.value = true
            tvhPassword.value = ''
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
      } catch (err) {
        setTvhText(`Failed: ${err.message}`, 'err', 8000)
      } finally {
        tvhTesting.value = false
      }
    }

    return {
      step, totalSteps, stepTitle, saving, canAdvance, nextLabel, hasExistingConfig,
      tvhUrl, tvhUsername, tvhPassword, tvhPasswordSet, tvhTesting,
      recordingsRoot, tvhRecordingsPath,
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

const EPG_PX_PER_MIN = 3
const EPG_RAIL_DEFAULT_PX = 148
const EPG_RAIL_MIN_PX = 90
const EPG_RAIL_MAX_PX = 260
const EPG_RAIL_KEY = 'freetvarr.epgRailPx'
const EPG_DRAG_THRESHOLD_PX = 6
const EPG_DAY_MIN = 24 * 60
const EPG_STATE_POLL_MS = 60_000
const EPG_SEARCH_DEBOUNCE_MS = 300
const EPG_LEAD_OPTIONS = [0, 1, 2, 3, 5, 10, 15]
const EPG_LAG_OPTIONS = [0, 5, 10, 15, 30, 60]
const EPG_KEEP_OPTIONS = [
  { value: 0, label: 'ALL EPISODES' },
  { value: 5, label: 'KEEP 5' },
  { value: 10, label: 'KEEP 10' },
]

const EpgView = {
  template: `
    <div class="view-reveal space-y-6">
      <section class="panel">
        <header class="panel-header">
          <span class="panel-title">GUIDE<template v-if="mode === 'guide'"> · {{ dayTitle }}</template><template v-else> · {{ mode.toUpperCase() }}</template></span>
          <div class="flex flex-wrap items-center gap-3">
            <span v-if="flashText" :class="['status-readout', flashKind]">{{ flashText }}</span>
            <button type="button" class="btn btn-sm" @click="openChannelsModal" :disabled="!guide"><span class="btn-glyph">⚙︎</span> CHANNELS</button>
            <button type="button" class="btn btn-sm" @click="manualRefresh" :disabled="loading"><span class="btn-glyph">⟳</span> REFRESH</button>
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
                class="deck-card deck-card-clickable space-y-1.5" role="button" tabindex="0"
                @click="openProgram(p, channelById(p.channelId))"
                @keydown.enter.prevent="openProgram(p, channelById(p.channelId))"
                @keydown.space.prevent="openProgram(p, channelById(p.channelId))">
                <div class="flex items-start justify-between gap-3">
                  <span class="deck-card-title">{{ p.title }}</span>
                  <span class="flex items-center gap-1.5 shrink-0">
                    <span v-if="isSeriesScheduled(p)" class="pill done">SERIES</span>
                    <span v-if="cellState(p) === 'recording'" class="pill recording">RECORDING</span>
                    <span v-else-if="cellState(p) === 'scheduled'" class="pill scheduled">SCHEDULED</span>
                    <span v-else-if="cellState(p) === 'series'" class="pill done">SERIES</span>
                  </span>
                </div>
                <p class="deck-card-meta flex items-center gap-1.5">
                  <img v-if="channelById(p.channelId)?.logo" class="epg-rail-logo shrink-0" :src="'/api/epg/logo/' + p.channelId" alt="" loading="lazy" @error="$event.target.style.display = 'none'" />
                  <span>{{ p.channelName }} · {{ fmtDayTime(p.start) }}–{{ fmtClock(p.end) }}<template v-if="p.episode_title"> · {{ p.episode_title }}</template></span>
                </p>
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
              <div class="flex items-center gap-2 md:ml-auto">
                <span class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim">JUMP</span>
                <div class="chip-row">
                  <button type="button" class="btn btn-sm" @click="jumpNow">NOW</button>
                  <button type="button" class="btn btn-sm" @click="jumpTonight">TONIGHT</button>
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
                <button type="button" class="btn btn-sm" @click="loadDay(day, { force: true })">RETRY</button>
              </div>
            </div>
            <div v-else-if="errorCode === 'no-channels'" class="space-y-3">
              <p class="text-sm text-ink">TVHeadend has no channels yet; scan and map them in TVHeadend.</p>
              <button type="button" class="btn btn-sm" @click="loadDay(day, { force: true })">RETRY</button>
            </div>
            <div v-else-if="error" class="space-y-3">
              <p class="text-sm font-mono text-signal-orange-hi">{{ error }}</p>
              <p class="text-xs text-ink-dim">
                Check the TVHeadend connection in <a href="#/settings">Settings</a>.
              </p>
              <button type="button" class="btn btn-sm" @click="loadDay(day, { force: true })">RETRY</button>
            </div>
            <div v-else-if="loading && !guide" class="text-ink-dim font-mono text-sm">▰▰ loading guide…</div>
            <div v-else-if="guide" class="relative" :style="{ '--epg-rail-px': 'min(' + railPx + 'px, 32vw)' }">
              <button v-if="pinsOffscreen" type="button" class="epg-pinned-chip" @click="scrollRailTop">↑ {{ pinnedCount }} PINNED</button>
              <div class="epg-scroll" ref="scrollEl">
              <div class="epg-canvas" :style="{ width: 'calc(var(--epg-rail-px) + ' + trackWidth + 'px)' }">
                <div class="epg-ruler">
                  <div class="epg-ruler-corner">
                    <input v-model="railFilter" type="search" class="epg-corner-filter"
                      placeholder="filter…" aria-label="Filter channels by number or name" />
                    <div class="epg-rail-resizer" title="Drag to resize the channel rail"
                      :style="{ height: railStripH + 'px' }"
                      @pointerdown="onRailResizeDown"
                      @pointermove="onRailResizeMove"
                      @pointerup="onRailResizeUp"
                      @pointercancel="onRailResizeUp"></div>
                  </div>
                  <div class="epg-ruler-track" :style="{ width: trackWidth + 'px' }">
                    <span v-for="t in ticks" :key="t.x" class="epg-tick" :style="{ left: t.x + 'px' }">{{ t.label }}</span>
                  </div>
                </div>
                <transition-group name="epg-rows" tag="div">
                <div v-for="ch in visibleChannels" :key="ch.id"
                  v-show="rowShown(ch)"
                  v-memo="[ch, nowMs, state, railNumWidth, rowShown(ch), firstUnpinnedId === String(ch.id), dropTargetId === String(ch.id), dragPinId === String(ch.id)]"
                  :data-channel-id="ch.id"
                  :class="['epg-row', { 'epg-pin-divider': firstUnpinnedId === String(ch.id), pinned: ch.pinned, 'epg-drop-target': dropTargetId === String(ch.id), 'epg-dragging': dragPinId === String(ch.id) }]">
                  <div class="epg-rail-cell"
                    :title="ch.pinned ? 'Drag to reorder pinned channels' : null"
                    @pointerdown="onPinPointerDown(ch, $event)"
                    @pointermove="onPinPointerMove"
                    @pointerup="onPinPointerUp"
                    @pointercancel="onPinPointerCancel">
                    <button type="button" :class="['epg-pin', { pinned: ch.pinned }]"
                      :title="ch.pinned ? 'Unpin channel' : 'Pin channel to the top'"
                      :aria-label="(ch.pinned ? 'Unpin ' : 'Pin ') + ch.name"
                      @click="togglePin(ch)">★</button>
                    <span class="epg-rail-num">{{ railNum(ch) }}</span>
                    <img v-if="ch.logo" class="epg-rail-logo" :src="'/api/epg/logo/' + ch.id" alt="" loading="lazy" @error="$event.target.style.display = 'none'" />
                    <span class="epg-rail-name">{{ ch.name }}</span>
                  </div>
                  <div class="epg-track" :style="{ width: trackWidth + 'px' }">
                    <button v-for="p in guide.programs[ch.id]" :key="p.program_id + '-' + p.start" type="button"
                      :class="['epg-cell', cellState(p), { past: p.end <= nowMs, 'on-now': p.start <= nowMs && p.end > nowMs }]"
                      :style="cellStyle(p)" :title="cellTitle(p)"
                      @click="openProgram(p, ch)">
                      <template v-if="cellWidth(p) > 40">
                        <span class="epg-cell-title">{{ p.title }}</span>
                        <span class="epg-cell-meta">
                          <span v-if="cellState(p) === 'recording'" class="led-dot sm live"></span>
                          <span v-else-if="cellState(p) === 'scheduled'" class="led-dot sm" style="background:#1eb6ff"></span>
                          <span v-else-if="cellState(p) === 'series'" class="led-dot sm" style="background:#e2b03c"></span>
                          <span v-if="isSeriesScheduled(p)" class="led-dot sm" style="background:#e2b03c"></span>
                          {{ fmtClock(p.start) }}
                        </span>
                      </template>
                    </button>
                  </div>
                </div>
                </transition-group>
                <div v-if="day === 0 && nowX != null" class="epg-nowline" :style="{ left: 'calc(var(--epg-rail-px) + ' + nowX + 'px)' }"></div>
              </div>
              </div>
            </div>
          </template>

          <template v-else-if="mode === 'upcoming'">
            <p v-if="stateError" class="text-sm font-mono text-signal-orange-hi">{{ stateError }}</p>
            <div v-else-if="!state" class="text-ink-dim font-mono text-sm">▰▰ contacting TVHeadend…</div>
            <template v-else>
              <p v-if="state?.stale" class="text-xs font-mono text-plex-yellow">TVHeadend is unreachable right now — showing its last known state.</p>
              <p v-if="upcoming.length === 0" class="text-ink-dim text-sm">Nothing scheduled in TVHeadend.</p>
              <p v-else-if="upcomingFiltered.length === 0" class="text-ink-dim text-sm">No upcoming recordings match “{{ searchQ.trim() }}”.</p>
              <div v-else class="space-y-3">
                <article v-for="r in upcomingFiltered" :key="r.programId + '-' + r.source"
                  class="deck-card deck-card-clickable space-y-1.5" role="button" tabindex="0"
                  @click="openUpcoming(r)"
                  @keydown.enter.prevent="openUpcoming(r)"
                  @keydown.space.prevent="openUpcoming(r)">
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
                    <img v-if="channelById(r.channelId)?.logo" class="epg-rail-logo shrink-0" :src="'/api/epg/logo/' + r.channelId" alt="" loading="lazy" @error="$event.target.style.display = 'none'" />
                    <span>{{ channelName(r.channelId) }} · {{ fmtDayTime(tsOf(r.startDate)) }}–{{ fmtClock(tsOf(r.endDate)) }}<template v-if="r.episodeTitle"> · {{ r.episodeTitle }}</template></span>
                  </p>
                </article>
              </div>
            </template>
          </template>

          <template v-else>
            <p v-if="stateError" class="text-sm font-mono text-signal-orange-hi">{{ stateError }}</p>
            <div v-else-if="!state" class="text-ink-dim font-mono text-sm">▰▰ contacting TVHeadend…</div>
            <template v-else>
              <p v-if="state?.stale" class="text-xs font-mono text-plex-yellow">TVHeadend is unreachable right now — showing its last known state.</p>
              <p v-if="seriesTags.length === 0" class="text-ink-dim text-sm">No series recordings set in TVHeadend.</p>
              <p v-else-if="seriesTagsFiltered.length === 0" class="text-ink-dim text-sm">No series match “{{ searchQ.trim() }}”.</p>
              <div v-else class="space-y-3">
                <article v-for="t in seriesTagsFiltered" :key="seriesKey(t)"
                  class="deck-card deck-card-clickable space-y-1.5" role="button" tabindex="0"
                  @click="openSeriesTag(t)"
                  @keydown.enter.prevent="openSeriesTag(t)"
                  @keydown.space.prevent="openSeriesTag(t)">
                  <div class="flex items-start justify-between gap-3">
                    <span class="deck-card-title">{{ t.name || t.title || seriesKey(t) }}</span>
                    <span class="pill done">SERIES</span>
                  </div>
                  <p class="deck-card-meta flex items-center gap-1.5">
                    <img v-if="channelById(t.channelId)?.logo" class="epg-rail-logo shrink-0" :src="'/api/epg/logo/' + t.channelId" alt="" loading="lazy" @error="$event.target.style.display = 'none'" />
                    <span>{{ channelName(t.channelId) }}<template v-if="t.episodesToKeep"> · keep {{ t.episodesToKeep }}</template></span>
                  </p>
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
            <button type="button" class="btn btn-sm btn-icon epg-modal-x" @click="closeModal" aria-label="Close">✕</button>
          </header>
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
              <button type="button" class="btn btn-sm epg-modal-close mr-auto" @click="closeModal" aria-label="Close">✕ CLOSE</button>
              <span v-if="modalStatusText" :class="['status-readout', modalStatusKind]">{{ modalStatusText }}</span>
              <template v-if="cellState(selected.program) === 'scheduled' || cellState(selected.program) === 'recording'">
                <template v-if="isSeriesScheduled(selected.program) && cancelChoice">
                  <span class="text-xs font-mono text-ink-mute">This is part of a series recording — cancel what?</span>
                  <button type="button" class="btn btn-sm btn-danger" :class="{ 'is-busy': modalAction === 'cancel-episode' }" @click="cancelSelected" :disabled="modalBusy">
                    <span class="btn-label">⨯ THIS EPISODE</span>
                    <span v-if="modalAction === 'cancel-episode'" class="spinner spinner-overlay"></span>
                  </button>
                  <button type="button" class="btn btn-sm btn-danger" :class="{ 'is-busy': modalAction === 'cancel-whole' }" @click="cancelSelectedSeries" :disabled="modalBusy">
                    <span class="btn-label">⨯ WHOLE SERIES</span>
                    <span v-if="modalAction === 'cancel-whole'" class="spinner spinner-overlay"></span>
                  </button>
                  <button type="button" class="btn btn-sm" @click="cancelChoice = false" :disabled="modalBusy">KEEP</button>
                </template>
                <button v-else type="button" class="btn btn-sm btn-danger" :class="{ 'is-busy': modalAction === 'cancel' }"
                  @click="isSeriesScheduled(selected.program) ? (cancelChoice = true) : cancelSelected()" :disabled="modalBusy">
                  <span class="btn-label">⨯ CANCEL RECORDING</span>
                  <span v-if="modalAction === 'cancel'" class="spinner spinner-overlay"></span>
                </button>
              </template>
              <template v-else-if="cellState(selected.program) === 'series'">
                <button type="button" class="btn btn-sm btn-danger" :class="{ 'is-busy': modalAction === 'cancel-series' }" @click="cancelSelectedSeries" :disabled="modalBusy">
                  <span class="btn-label">⨯ CANCEL SERIES</span>
                  <span v-if="modalAction === 'cancel-series'" class="spinner spinner-overlay"></span>
                </button>
              </template>
              <template v-else-if="canRecord">
                <button v-if="selected.program.series_link" type="button" class="btn btn-sm" :class="{ 'is-busy': modalAction === 'record-series' }" @click="recordSelectedSeries" :disabled="modalBusy">
                  <span class="btn-label">⦿ RECORD SERIES</span>
                  <span v-if="modalAction === 'record-series'" class="spinner spinner-overlay"></span>
                </button>
                <button type="button" class="btn btn-sm btn-primary" :class="{ 'is-busy': modalAction === 'record' }" @click="recordSelected" :disabled="modalBusy">
                  <span class="btn-label">⦿ RECORD</span>
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
      <transition name="epg-sheet">
      <div v-if="channelsModal" class="epg-modal-backdrop" @click.self="channelsModal = false">
        <section class="panel epg-modal">
          <header class="panel-header">
            <span class="panel-title">CHANNELS</span>
            <button type="button" class="btn btn-sm btn-icon epg-modal-x" @click="channelsModal = false" aria-label="Close">✕</button>
          </header>
          <div class="panel-body space-y-5">
            <div>
              <label class="field-label">PINNED · SHOWN FIRST, IN THIS ORDER</label>
              <p v-if="pinnedDraft.length === 0" class="text-xs text-ink-dim">
                Nothing pinned yet — hit the ★ next to a channel below (or in the guide rail).
              </p>
              <ul v-else class="space-y-1.5">
                <li v-for="(id, i) in pinnedDraft" :key="id" class="flex items-center gap-2">
                  <button type="button" class="btn btn-sm btn-icon" :disabled="i === 0"
                    @click="movePin(i, -1)" :aria-label="'Move ' + draftName(id) + ' up'">↑</button>
                  <button type="button" class="btn btn-sm btn-icon" :disabled="i === pinnedDraft.length - 1"
                    @click="movePin(i, 1)" :aria-label="'Move ' + draftName(id) + ' down'">↓</button>
                  <span class="font-mono text-[0.8rem] flex-1 min-w-0 truncate">
                    <span class="text-signal-yellow">★</span> {{ draftName(id) }}
                  </span>
                  <button type="button" class="btn btn-sm btn-icon" @click="toggleDraftPin(id)"
                    :aria-label="'Unpin ' + draftName(id)">✕</button>
                </li>
              </ul>
            </div>
            <div>
              <label class="field-label">SORT UNPINNED CHANNELS BY</label>
              <div class="chip-row">
                <button v-for="s in sortOptions" :key="s.key" type="button"
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
                Hides an SD channel only when its HD twin is in the lineup (10 next to 10 HD, Nine next to 9HD). SD-only channels stay. Applies to the grid and search; a pinned channel is never hidden.
              </p>
            </div>
            <div>
              <label class="field-label">ALL CHANNELS · ★ PINS, TICK SHOWS</label>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                <div v-for="ch in guide?.channels || []" :key="ch.id" class="flex items-center gap-2">
                  <button type="button" :class="['epg-pin', { pinned: pinnedDraft.includes(String(ch.id)) }]"
                    @click="toggleDraftPin(String(ch.id))"
                    :aria-label="(pinnedDraft.includes(String(ch.id)) ? 'Unpin ' : 'Pin ') + ch.name">★</button>
                  <label class="flex items-center gap-2.5 text-sm cursor-pointer min-w-0">
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
              <span v-if="channelsModalStatusText" :class="['status-readout', channelsModalStatusKind]">{{ channelsModalStatusText }}</span>
              <button type="button" class="btn btn-sm" @click="channelsModal = false">CANCEL</button>
              <button type="button" class="btn btn-sm btn-primary" @click="saveChannelPrefs" :disabled="savingPrefs">
                {{ savingPrefs ? 'SAVING…' : 'SAVE' }}
              </button>
            </div>
          </div>
        </section>
      </div>
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
    const [channelsModalStatusText, channelsModalStatusKind, setChannelsModalStatus] = makeStatus()

    watch([selected, channelsModal], ([program, channels]) => {
      try { document.body.classList.toggle('sheet-open', Boolean(program || channels)) } catch { /* ignore */ }
    })
    onUnmounted(() => {
      try { document.body.classList.remove('sheet-open') } catch { /* ignore */ }
    })
    const hiddenDraft = ref(new Set())
    const pinnedDraft = ref([])
    const sortDraft = ref('default')
    const savingPrefs = ref(false)
    const hideSdDraft = ref(false)
    const sortOptions = [
      { key: 'default', label: 'TVH ORDER' },
      { key: 'number', label: 'NUMBER' },
      { key: 'name', label: 'NAME' },
    ]
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
    const trackWidth = EPG_DAY_MIN * EPG_PX_PER_MIN

    // Minute resolution on purpose: the seconds clock ref would otherwise
    // re-render every grid cell once a second (past/on-now classes read this).
    const nowMs = computed(() => Math.floor(now.value.getTime() / 60_000) * 60_000)

    const railFilter = ref('')

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

    const firstUnpinnedId = computed(() => {
      const shown = visibleChannels.value.filter(rowShown)
      for (let i = 1; i < shown.length; i++) {
        if (!shown[i].pinned && shown[i - 1].pinned) return String(shown[i].id)
      }
      return null
    })

    const pinnedCount = computed(() => visibleChannels.value.filter((c) => c.pinned).length)

    const railNumWidth = computed(() =>
      Math.max(2, ...visibleChannels.value.map((c) => String(c.number ?? '').length)))
    const railNum = (ch) =>
      ch.number == null ? '' : String(ch.number).padStart(railNumWidth.value, '0')

    const ticks = computed(() => {
      if (!guide.value) return []
      return Array.from({ length: 24 }, (_, h) => ({
        x: h * 60 * EPG_PX_PER_MIN,
        label: fmtClock(guide.value.dayStart + h * 3_600_000),
      }))
    })

    const nowX = computed(() => {
      if (!guide.value) return null
      const x = ((nowMs.value - guide.value.dayStart) / 60_000) * EPG_PX_PER_MIN
      return x >= 0 && x <= trackWidth ? x : null
    })

    const dayChips = computed(() => Array.from({ length: 7 }, (_, d) => {
      if (d === 0) return { day: 0, label: 'TODAY' }
      const date = new Date(Date.now() + d * 86_400_000)
      return {
        day: d,
        label: new Intl.DateTimeFormat('en-AU', { timeZone: tz.value, weekday: 'short' })
          .format(date).toUpperCase(),
      }
    }))

    const dayTitle = computed(() => {
      if (!guide.value) return dayChips.value[day.value]?.label || ''
      return new Intl.DateTimeFormat('en-AU', {
        timeZone: tz.value, weekday: 'long', day: 'numeric', month: 'short',
      }).format(new Date(guide.value.dayStart + 12 * 3_600_000))
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

    const tsOf = tsOfMs
    const fmtClock = fmtClockTz

    const fmtDayTime = (ms) => new Intl.DateTimeFormat('en-AU', {
      timeZone: tz.value, weekday: 'short', day: 'numeric', month: 'short',
      hour: 'numeric', minute: '2-digit',
    }).format(new Date(ms)).toLowerCase().replace(/\s(am|pm)$/, '$1')

    const fmtShortRange = (start, end) => {
      const day = new Intl.DateTimeFormat('en-AU', {
        timeZone: tz.value, weekday: 'short', day: '2-digit', month: '2-digit',
      }).format(new Date(start)).toLowerCase().replace(',', '')
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

    const seriesKey = (t) => String(t?.seriesLinkId ?? t?.id ?? t?.name ?? '')

    const cellState = (p) => {
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

    const cellTitle = (p) => {
      const state = cellState(p)
      if (state === 'recording') return `${p.title} · recording now`
      if (state === 'scheduled') {
        return `${p.title} · ${isSeriesScheduled(p) ? 'series recording scheduled' : 'one-off recording scheduled'}`
      }
      if (state === 'series') return `${p.title} · series rule on this show`
      return p.title
    }

    const cellX = (t) => {
      const clamped = Math.max(t, guide.value.dayStart)
      return ((clamped - guide.value.dayStart) / 60_000) * EPG_PX_PER_MIN
    }

    const cellWidth = (p) => {
      const start = Math.max(p.start, guide.value.dayStart)
      const end = Math.min(p.end, guide.value.dayEnd)
      return Math.max(((end - start) / 60_000) * EPG_PX_PER_MIN - 2, 6)
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

    const scrollToMs = async (ms) => {
      await nextTick()
      if (!scrollEl.value || !guide.value) return
      const x = ((ms - guide.value.dayStart) / 60_000) * EPG_PX_PER_MIN
      scrollEl.value.scrollLeft = Math.max(0, x - 60)
    }

    const setDay = async (d) => {
      day.value = d
      await loadDay(d)
      await scrollToMs(d === 0 ? nowMs.value - 30 * 60_000 : guide.value.dayStart + 18 * 3_600_000)
    }

    const setMode = async (m) => {
      if (m !== mode.value) searchQ.value = ''
      mode.value = m
      if (m !== 'guide') {
        loadState()
        return
      }
      await scrollToMs(day.value === 0
        ? nowMs.value - 30 * 60_000
        : (guide.value?.dayStart ?? 0) + 18 * 3_600_000)
    }

    const jumpNow = async () => {
      if (day.value !== 0) await setDay(0)
      else await scrollToMs(nowMs.value - 30 * 60_000)
    }

    const jumpTonight = async () => {
      if (day.value !== 0) { day.value = 0; await loadDay(0) }
      await scrollToMs(guide.value.dayStart + 19 * 3_600_000)
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
        channelId: r.channelId,
      }, channelById(r.channelId))
    }

    const closeModal = () => {
      cancelChoice.value = false
      selected.value = null
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

    const dragPinId = ref(null)
    const dropTargetId = ref(null)

    const currentPins = () => (guide.value?.channels || [])
      .filter((c) => c.pinned)
      .map((c) => String(c.id))

    // Pointer-based drag (not HTML5 drag-and-drop) so reordering works with a
    // finger on iOS as well as a mouse. The whole rail cell of a pinned row is
    // the drag surface; the drag only starts after a small movement threshold
    // so plain clicks and taps (the ★ button) still register. Rows are
    // hit-tested by their live bounding boxes on every move, and a cloned
    // ghost of the cell follows the pointer.
    const pinRowUnderPointer = (clientY) => {
      for (const el of document.querySelectorAll('.epg-row.pinned')) {
        const box = el.getBoundingClientRect()
        if (clientY >= box.top && clientY <= box.bottom) return el.dataset.channelId || null
      }
      return null
    }

    let pendingDrag = null
    let dragDidMove = false
    let ghostEl = null
    let ghostDX = 0
    let ghostDY = 0

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

    const setDragLock = (on) => {
      try { document.body.classList.toggle('epg-drag-lock', on) } catch { /* ignore */ }
    }

    const startPinDrag = (e) => {
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
      moveGhost(e)
    }

    const onPinPointerDown = (ch, e) => {
      if (!ch.pinned) return
      if (e.button !== 0 && e.pointerType === 'mouse') return
      pendingDrag = { ch, cell: e.currentTarget, pointerId: e.pointerId, x: e.clientX, y: e.clientY }
    }

    const onPinPointerMove = (e) => {
      if (pendingDrag) {
        if (Math.hypot(e.clientX - pendingDrag.x, e.clientY - pendingDrag.y) < EPG_DRAG_THRESHOLD_PX) return
        startPinDrag(e)
      }
      if (!dragPinId.value) return
      e.preventDefault()
      moveGhost(e)
      const over = pinRowUnderPointer(e.clientY)
      dropTargetId.value = over && over !== dragPinId.value ? over : null
    }

    const onPinPointerUp = async () => {
      pendingDrag = null
      setDragLock(false)
      removeGhost()
      if (dragDidMove) setTimeout(() => { dragDidMove = false }, 0)
      const from = dragPinId.value
      const to = dropTargetId.value
      dragPinId.value = null
      dropTargetId.value = null
      if (!from || !to || from === to) return
      const orig = currentPins()
      const movingDown = orig.indexOf(from) < orig.indexOf(to)
      const pins = orig.filter((id) => id !== from)
      pins.splice(pins.indexOf(to) + (movingDown ? 1 : 0), 0, from)
      try {
        await api('PUT', '/api/epg/channel-prefs', { pinned_ids: pins })
        await reloadGuide()
      } catch (err) {
        flash({ msg: `Reorder failed: ${err.message}`, kind: 'err', ms: 6000 })
      }
    }

    const onPinPointerCancel = () => {
      pendingDrag = null
      setDragLock(false)
      removeGhost()
      dragDidMove = false
      dragPinId.value = null
      dropTargetId.value = null
    }

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

    const railStripH = ref(0)
    const syncRailStrip = () => { railStripH.value = scrollEl.value?.clientHeight || 0 }

    let scrollRo = null
    watch(scrollEl, (el, prev) => {
      if (prev) prev.removeEventListener('scroll', updatePinsOffscreen)
      if (scrollRo) { scrollRo.disconnect(); scrollRo = null }
      if (el) {
        el.addEventListener('scroll', updatePinsOffscreen, { passive: true })
        scrollRo = new ResizeObserver(() => { syncRailStrip(); updatePinsOffscreen() })
        scrollRo.observe(el)
      }
      syncRailStrip()
      updatePinsOffscreen()
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
      if (dragDidMove) return
      const pinned = (guide.value?.channels || [])
        .filter((c) => c.pinned)
        .map((c) => String(c.id))
      const key = String(ch.id)
      const next = pinned.includes(key) ? pinned.filter((id) => id !== key) : [...pinned, key]
      try {
        await api('PUT', '/api/epg/channel-prefs', { pinned_ids: next })
        await reloadGuide()
      } catch (err) {
        flash({ msg: `Pin failed: ${err.message}`, kind: 'err', ms: 6000 })
      }
    }

    const openChannelsModal = () => {
      const channels = guide.value?.channels || []
      pinnedDraft.value = channels.filter((c) => c.pinned).map((c) => String(c.id))
      hiddenDraft.value = new Set((guide.value?.hiddenIds || []).map(String))
      sortDraft.value = guide.value?.sort || 'default'
      hideSdDraft.value = Boolean(guide.value?.hideSdSimulcasts)
      setChannelsModalStatus('')
      channelsModal.value = true
    }

    const draftName = (id) => channelById(id)?.name || `channel ${id}`

    const toggleDraftPin = (id) => {
      if (pinnedDraft.value.includes(id)) {
        pinnedDraft.value = pinnedDraft.value.filter((p) => p !== id)
      } else {
        pinnedDraft.value = [...pinnedDraft.value, id]
        const next = new Set(hiddenDraft.value)
        next.delete(id)
        hiddenDraft.value = next
      }
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

    const saveChannelPrefs = async () => {
      savingPrefs.value = true
      try {
        await api('PUT', '/api/epg/channel-prefs', {
          pinned_ids: pinnedDraft.value,
          hidden_ids: [...hiddenDraft.value],
          sort: sortDraft.value,
          hide_sd_simulcasts: hideSdDraft.value,
        })
        channelsModal.value = false
        await reloadGuide()
        flash({ msg: 'Channel preferences saved.' })
      } catch (err) {
        setChannelsModalStatus(`Save failed: ${err.message}`, 'err', 8000)
      } finally {
        savingPrefs.value = false
      }
    }

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

    const onKeydown = (e) => {
      if (e.key !== 'Escape') return
      if (selected.value) selected.value = null
      else if (channelsModal.value) channelsModal.value = false
    }

    let statePollTimer = null
    onMounted(async () => {
      window.addEventListener('keydown', onKeydown)
      await loadDay(0)
      await scrollToMs(Date.now() - 30 * 60_000)
      loadState()
      statePollTimer = setInterval(loadState, EPG_STATE_POLL_MS)
    })
    onUnmounted(() => {
      window.removeEventListener('keydown', onKeydown)
      if (statePollTimer) clearInterval(statePollTimer)
      if (searchTimer) clearTimeout(searchTimer)
    })

    return {
      mode, modes, setMode, day, dayChips, dayTitle, setDay,
      guide, loading, error, errorCode, loadDay, state, stateError, stateLine,
      scrollEl, railPx, trackWidth, railStripH, railNumWidth, ticks, nowX, nowMs,
      visibleChannels, railNum, railFilter, pinnedCount, pinsOffscreen, scrollRailTop,
      cellState, cellStyle, cellWidth, cellTitle, isSeriesScheduled, isSeriesRec,
      jumpNow, jumpTonight, manualRefresh,
      searchQ, searchActive, searchResults, searching, searchPlaceholder, upcomingFiltered, seriesTagsFiltered,
      selected, openProgram, openUpcoming, closeModal, modalBusy, modalAction, canRecord,
      modalStatusText, modalStatusKind, channelsModalStatusText, channelsModalStatusKind,
      leadTime, lagTime, episodesToKeep,
      leadOptions: EPG_LEAD_OPTIONS, lagOptions: EPG_LAG_OPTIONS, keepOptions: EPG_KEEP_OPTIONS,
      recordSelected, recordSelectedSeries, cancelSelected, cancelSelectedSeries, cancelChoice,
      upcoming, seriesTags, seriesKey, cancelUpcoming, cancelSeriesTag, openSeriesTag,
      isActiveRecording: (r) => activeRecordingSet.value.has(String(r.programId)),
      busyId, channelsModal, openChannelsModal, hiddenDraft, toggleHidden,
      pinnedDraft, sortDraft, sortOptions, savingPrefs, saveChannelPrefs, hideSdDraft,
      togglePin, toggleDraftPin, movePin, draftName, rowShown, firstUnpinnedId,
      dropTargetId, dragPinId,
      onPinPointerDown, onPinPointerMove, onPinPointerUp, onPinPointerCancel,
      onRailResizeDown, onRailResizeMove, onRailResizeUp,
      channelById, channelName, fmtClock, fmtDayTime, fmtShortRange, seLabel, ratingLabel, tsOf,
      flashText, flashKind,
    }
  },
}

const VIEW_MAP = {
  dashboard: DashboardView,
  guide: EpgView,
  shows: ShowsView,
  syncs: SyncsView,
  recordings: RecordingsView,
  settings: SettingsView,
  welcome: WelcomeView,
}

const TABS = [
  { key: 'dashboard',  label: 'DASHBOARD'  },
  { key: 'guide',      label: 'TV GUIDE'   },
  { key: 'shows',      label: 'SHOWS'      },
  { key: 'syncs',      label: 'SYNCS'      },
  { key: 'recordings', label: 'RECORDINGS' },
  { key: 'settings',   label: 'SETTINGS'   },
]

const App = {
  template: `
    <div class="min-h-dvh flex flex-col">
      <header class="sticky top-0 z-20 backdrop-blur-md bg-surface-deep/85 border-b border-hairline">
        <div class="max-w-6xl mx-auto px-4 md:px-6">
          <div class="flex items-center justify-between gap-4 py-3">
            <a href="#/dashboard" class="no-hover-underline flex items-center gap-3 no-underline text-ink">
              <svg viewBox="0 0 15.5 3" :class="['brand-mark', 'w-[39px]', 'h-[8px]', 'shrink-0', { syncing: syncStatus.activeSyncId }]" aria-hidden="true">
                <rect x="0"    y="0" width="4" height="3" fill="#1eb6ff"/>
                <rect x="5.75" y="0" width="4" height="3" fill="#ff8a00"/>
                <rect x="11.5" y="0" width="4" height="3" fill="#e2b03c"/>
              </svg>
              <span class="font-mono font-semibold text-lg tracking-[0.1em] text-ink">Freetvarr</span>
              <span class="hidden sm:inline text-xs font-mono uppercase tracking-[0.2em] text-ink-mute translate-y-[2px]"><span class="text-signal-orange">//</span> tvheadend → plex bridge</span>
            </a>
            <div class="flex items-center gap-5">
              <div class="flex items-center gap-2">
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
          <nav class="tab-strip pt-1">
            <a v-for="t in tabs" :key="t.key"
              :href="'#/' + t.key"
              :data-active="route === t.key"
              :class="['tab-led', 'block', 'whitespace-nowrap', 'px-1', 'py-2', 'font-mono', 'text-sm', 'tracking-[0.2em]', route === t.key ? 'text-ink' : 'text-ink-dim hover:text-ink']">
              {{ t.label }}
            </a>
          </nav>
        </div>
      </header>

      <main class="flex-1 max-w-6xl w-full mx-auto px-4 py-5 md:px-6 md:py-8">
        <component :is="currentView" :key="route" />
      </main>

      <footer class="border-t border-hairline">
        <div class="max-w-6xl mx-auto px-4 md:px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-ink-mute">
          <span><a href="/#dashboard" class="no-underline text-ink">Freetvarr</a> · self-hosted tvheadend → plex bridge</span>
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
    </div>
  `,
  setup() {
    const currentView = computed(() => VIEW_MAP[route.value] || DashboardView)
    watch(route, async () => {
      await nextTick()
      document.querySelector('.tab-strip [data-active="true"]')
        ?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
    }, { immediate: true })
    return {
      route, tabs: TABS, currentView,
      syncStatus, clockReadout, tzShortName,
    }
  },
}

const welcomeDismissed = () => {
  try { return localStorage.getItem(WELCOME_DISMISSED_KEY) === '1' } catch { return false }
}

fetch('/api/settings')
  .then((r) => r.json())
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

const app = createApp(App)
app.component('summary-line', SummaryLine)
app.component('progress-block', ProgressBlock)
app.mount('#app')
