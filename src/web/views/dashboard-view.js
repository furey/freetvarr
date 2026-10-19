import { ref, computed, onMounted, onUnmounted, watch } from '/vendor/vue.esm-browser.prod.js'
import { watchRowLabel } from '/live-info.js'
import { formatMinutes } from '/time-format.js'
import { readSnapshot, writeSnapshot, onNowAt, upcomingAt } from '/warm-start.js'
import { syncWhen } from '/sync-when.js'
import { isNotableSync, firstSyncError, syncStrip, syncStripLabel } from '/sync-row.js'
import { OFF_AIR_MESSAGE } from '/components/channel-identity.js'
import { api, fetchSettings } from '/shared/api.js'
import { useFlash } from '/shared/composables.js'
import { fmtBytes, onNowPercent, onNowMeta } from '/shared/format.js'
import { watchLive } from '/shared/live-session.js'
import { isRecordingChannel } from '/shared/recording-now.js'
import { browserStorage } from '/shared/storage.js'
import { openInGuide } from '/shared/store.js'
import { syncMsOf, syncTookText } from '/shared/sync-format.js'
import { syncStatus, loadSyncStatus, ensureSyncPolling } from '/shared/sync-status.js'
import {
  tz,
  fmtTime,
  fmtAgo,
  fmtElapsed,
  now,
  fmtClockTz,
  fmtRelativeDay,
  tsOfMs,
} from '/shared/time.js'

const MIN_SYNC_DISPLAY_MS = 1500

const DASHBOARD_POLL_MS = 30_000

const GUIDE_PANEL_RETRY_MS = 5000
const SKELETON_LIVE_WIDTHS = ['62%', '48%', '71%', '55%']
const SKELETON_UPCOMING_WIDTHS = ['58%', '44%', '64%']
const SKELETON_SYNC_WIDTHS = ['86%', '74%', '81%', '68%', '77%']
const RECENT_SYNCS_COUNT = 12

const hostOf = (url) => {
  if (!url) return ''
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export const DashboardView = {
  template: `
    <div class="view-reveal space-y-6">
      <recording-now-panel />

      <section v-if="tvhConfigured || !guideLoaded" class="panel" :aria-busy="!guideLoaded">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title">WHAT'S ON</span>
            <info-button title="WHAT'S ON" doc="guide/tv-guide#on-the-dashboard">
              <p>What is on now on your favourite channels, what is on next, and the next recordings TVHeadend has scheduled. All of it comes from TVHeadend.</p>
              <p>Star a channel in <strong>LIVE TV</strong> or the <strong>TV GUIDE</strong> to add it here.</p>
              <p>Tap a channel to watch it live. Tap <strong>INFO</strong>, a next programme, or a recording to open its details in the <strong>TV GUIDE</strong>.</p>
            </info-button>
          </span>
          <div class="flex items-center gap-4">
            <a href="#/live" class="link-arrow text-xs font-mono uppercase tracking-[0.16em]">Live TV <arrow-right-icon /></a>
            <a href="#/guide" class="link-arrow text-xs font-mono uppercase tracking-[0.16em]">Guide <arrow-right-icon /></a>
          </div>
        </header>
        <div v-if="!guideLoaded" class="panel-body whats-on-body space-y-5 skeleton-reveal" aria-hidden="true">
          <div>
            <div class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim mb-3"><signal-bars-icon /> Tuning in</div>
            <div class="space-y-3">
              <div v-for="width in SKELETON_LIVE_WIDTHS" :key="width" class="skeleton-row-live flex items-center gap-3 md:gap-4">
                <span class="skeleton skeleton-logo"></span>
                <span class="skeleton skeleton-line w-16 md:w-28 shrink-0"></span>
                <span class="flex-1 min-w-0 space-y-2">
                  <span class="skeleton skeleton-line" :style="{ width }"></span>
                  <span class="skeleton skeleton-track"></span>
                </span>
              </div>
            </div>
          </div>
          <div class="next-recordings">
            <div class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim mb-3">Next recordings</div>
            <div class="space-y-2">
              <div v-for="width in SKELETON_UPCOMING_WIDTHS" :key="width" class="skeleton-row-upcoming">
                <span class="skeleton skeleton-line" :style="{ width }"></span>
              </div>
            </div>
          </div>
        </div>
        <div v-else-if="!guideOk" class="panel-body flex flex-wrap items-center gap-3">
          <span class="status-readout err">Guide unavailable. TVHeadend did not answer.</span>
          <button type="button" class="btn btn-sm" @click="loadGuidePanel"><refresh-icon /> RETRY</button>
        </div>
        <div v-else class="panel-body whats-on-body space-y-5">
          <div v-if="onNow.length">
            <div class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim mb-3">Live now</div>
            <div class="space-y-3">
            <div v-for="e in onNow" :key="e.channel.id" class="dash-live-row flex items-center gap-3 md:gap-4">
              <channel-logo class="shrink-0" :channel-id="e.channel.id" :has-logo="e.channel.hasLogo" />
              <span :class="['font-mono text-xs text-ink-dim w-16 md:w-28 shrink-0 truncate', { 'off-air': e.channel.offAir }]" :title="e.channel.offAir ? OFF_AIR_MESSAGE : e.channel.name">{{ e.channel.name }}</span>
              <div class="flex-1 min-w-0">
                <button type="button" class="on-now-open row-play block w-full" :title="e.channel.offAir ? OFF_AIR_MESSAGE : null"
                  :aria-label="watchRowLabel({ channel: e.channel, now: e.now })"
                  @click="watchLive({ channel: e.channel, nowTitle: e.now?.title || '' })">
                  <template v-if="e.now">
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
                  </template>
                  <span v-else class="block text-sm text-ink-mute">No guide data</span>
                </button>
              </div>
              <button v-if="e.next" type="button" class="on-now-open row-over hidden sm:block font-mono text-xs text-ink-dim min-w-0 max-w-[16rem] truncate"
                :aria-label="'Show details for ' + e.next.title"
                @click="openInGuide({ channelId: e.channel.id, program: e.next })">
                next: <span class="text-xs font-semibold font-sans text-ink">{{ e.next.title }}</span> {{ fmtClockTz(e.next.start) }}
              </button>
              <button v-if="e.now" type="button" class="btn btn-sm row-info row-over"
                :aria-label="'Programme info for ' + e.now.title"
                @click="openInGuide({ channelId: e.channel.id, program: e.now })">INFO</button>
              <span v-else class="row-info" aria-hidden="true"></span>
            </div>
            </div>
          </div>
          <div v-else class="flex flex-wrap items-center gap-3">
            <p class="text-xs text-ink-dim">Star channels to see what's on now.</p>
            <a href="#/live" class="btn btn-sm no-hover-underline">OPEN LIVE TV</a>
          </div>
          <div class="next-recordings">
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
              <p>A sync reads the finished recordings in TVHeadend, imports them into your library (series episodes into their series folders, single recordings and films into the one-off and movies folders), then asks Plex to refresh.</p>
              <ul><li><strong>STATUS</strong>: <strong>Idle</strong> or <strong>Syncing</strong>.</li><li><strong>LAST SYNC</strong>: when the last sync ran, and how it went.</li><li><strong>RESULT</strong>: what it imported, or what failed.</li><li><strong>SYNC NOW</strong>: runs a sync at once, without waiting for the schedule.</li></ul>
              <p>The strip below shows TVHeadend, your series, the last 7 days of recordings, and Plex. Press a cell to open its page.</p>
            </info-button>
          </span>
          <span v-if="nextSyncLabel" class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim" :title="'Cron: ' + syncStatus.cron">NEXT SYNC · <span class="text-ink normal-case">{{ nextSyncLabel }}</span></span>
        </header>
        <div class="deck-status">
          <div class="deck-cell deck-cell-status">
            <span class="deck-cell-label">STATUS</span>
            <span :class="['deck-cell-value', { 'deck-cell-live': shownSyncId }]">{{ shownSyncId ? 'Syncing' : 'Idle' }}</span>
          </div>
          <div class="deck-zone-action">
            <button type="button" class="btn btn-primary" @click="syncNow" :disabled="!!shownSyncId || starting">
              <play-icon v-if="!shownSyncId && !starting" /> {{ syncButtonLabel }}
            </button>
          </div>
          <a href="#/syncs" class="deck-cell deck-cell-last no-hover-underline" :title="lastSyncCell.title">
            <span class="deck-cell-label">
              {{ lastSyncCell.label }}
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
              {{ cell.label }}
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
              <p>The latest sync and what it did, then a bar for each of the last {{ RECENT_SYNCS_COUNT }} syncs, newest on the right. A tall bar is a sync that imported, removed, or failed something; a short bar found nothing new.</p>
              <p>Below the bars, each of those tall-bar syncs has a row. Press a row to open its details on the <strong>SYNCS</strong> tab. <strong>SEE ALL</strong> opens the <strong>SYNCS</strong> tab with the full history.</p>
            </info-button>
          </span>
          <a href="#/syncs" class="link-arrow text-xs font-mono uppercase tracking-[0.16em]">See all <arrow-right-icon /></a>
        </header>
        <div class="panel-body" :aria-busy="!syncsLoaded">
          <div v-if="!syncsLoaded" class="skeleton-reveal" aria-hidden="true">
            <div class="skeleton-row-sync-head"></div>
            <div v-for="width in SKELETON_SYNC_WIDTHS" :key="width" class="skeleton-row-sync">
              <span class="skeleton skeleton-line" :style="{ width }"></span>
            </div>
          </div>
          <div v-else-if="recentSyncs.length" class="recent-syncs-view">
            <div class="sync-glance">
              <p v-if="runningSync" class="sync-glance-line">
                <sync-status-icon status="running" />
                <span class="text-signal-blue-hi">Syncing now</span>
                <span class="text-ink-dim truncate">· {{ syncTookText(runningSync) }}</span>
              </p>
              <p v-if="lastFinishedSync" class="sync-glance-line">
                <sync-status-icon :status="lastFinishedSync.status" />
                <span class="truncate min-w-0">Last sync {{ syncWhenText(lastFinishedSync) }}</span>
                <sync-result :sync="lastFinishedSync" />
              </p>
              <div class="sync-strip" role="img" :aria-label="stripLabel" :style="{ '--strip-size': RECENT_SYNCS_COUNT }">
                <i v-for="m in stripMarks" :key="m.key" :class="['sync-strip-mark', m.mark]"></i>
              </div>
              <div class="sync-strip-legend" aria-hidden="true"><span>Last {{ RECENT_SYNCS_COUNT }} syncs</span><span>Now</span></div>
            </div>
            <p class="sync-changes-title">Imports, removals, failures</p>
            <div v-if="notableSyncs.length" class="sync-lines">
              <a v-for="s in notableSyncs" :key="s.id" :href="syncDetailsHref(s)"
                class="sync-line no-underline no-hover-underline" :aria-label="'Details of sync #' + s.id">
                <sync-status-icon :status="s.status" />
                <span class="sync-line-time truncate">{{ syncWhenText(s) }}</span>
                <sync-result :sync="s" />
                <chevron-right-icon class="sync-line-chevron" />
                <span v-if="firstSyncError(s)" class="sync-line-error truncate">{{ firstSyncError(s) }}</span>
              </a>
            </div>
            <p v-else class="sync-lines-empty">No imports, removals, or failures in the last {{ recentSyncs.length }} sync{{ recentSyncs.length === 1 ? '' : 's' }}.</p>
          </div>
          <p v-else-if="syncsLoaded" class="text-ink-dim text-sm">No syncs yet.</p>
        </div>
      </section>
    </div>
  `,
  setup() {
    const snapshot = readSnapshot({ storage: browserStorage(), key: 'dashboard' })
    const nowMs = Date.now()
    const { flashText, flashKind, flash } = useFlash()
    const starting = ref(false)
    const heldSyncId = ref(null)
    const runningSince = ref({ id: null, at: null })
    const shownSyncId = computed(() => syncStatus.value.activeSyncId || heldSyncId.value)
    const recentSyncs = ref(snapshot?.recentSyncs ?? [])
    const statsLoaded = ref(Boolean(snapshot))
    const syncsLoaded = ref(Boolean(snapshot))
    const guideLoaded = ref(Boolean(snapshot))
    const seriesCount = ref(snapshot?.seriesCount ?? 0)
    const outsideLibraryCount = ref(snapshot?.outsideLibraryCount ?? 0)
    const seriesUnavailable = ref(false)
    const recordings7dCount = ref(snapshot?.recordings7dCount ?? 0)
    const plexConfigured = ref(snapshot?.plexConfigured ?? false)
    const plexHost = ref(snapshot?.plexHost ?? '')
    const tvhState = ref(snapshot?.tvhState ?? null)
    const tvhReachable = ref(snapshot?.tvhReachable ?? false)
    const tvhConfigured = ref(snapshot?.tvhConfigured ?? false)
    const onNow = ref(onNowAt({ entries: snapshot?.onNow, nowMs }))
    const guideUpcoming = ref(upcomingAt({
      recordings: snapshot?.guideUpcoming,
      nowMs,
      startMsOf: (r) => tsOfMs(r.startDate),
    }))
    const guideSeriesLinks = ref(new Set(snapshot?.guideSeriesLinks ?? []))
    const guideOk = ref(snapshot?.guideOk ?? true)

    const saveSnapshot = () => writeSnapshot({
      storage: browserStorage(),
      key: 'dashboard',
      data: {
        recentSyncs: recentSyncs.value,
        seriesCount: seriesCount.value,
        outsideLibraryCount: outsideLibraryCount.value,
        recordings7dCount: recordings7dCount.value,
        plexConfigured: plexConfigured.value,
        plexHost: plexHost.value,
        tvhState: tvhState.value && {
          tunerCount: tvhState.value.tunerCount,
          storageInfo: tvhState.value.storageInfo,
        },
        tvhReachable: tvhReachable.value,
        tvhConfigured: tvhConfigured.value,
        onNow: onNow.value,
        guideUpcoming: guideUpcoming.value,
        guideSeriesLinks: [...guideSeriesLinks.value],
        guideOk: guideOk.value,
      },
    })

    const lastSync = computed(() => recentSyncs.value[0] || null)
    const runningSync = computed(() => recentSyncs.value.find((s) => s.status === 'running') || null)
    const lastFinishedSync = computed(() => recentSyncs.value.find((s) => s.status !== 'running') || null)
    const notableSyncs = computed(() => recentSyncs.value.filter(isNotableSync))
    const stripMarks = computed(() => syncStrip({ syncs: recentSyncs.value, size: RECENT_SYNCS_COUNT }))
    const stripLabel = computed(() => syncStripLabel({ syncs: recentSyncs.value, size: RECENT_SYNCS_COUNT }))

    const deckSync = computed(() => {
      const id = shownSyncId.value
      if (!id || lastSync.value?.id === id) return lastSync.value
      const startedAt = runningSince.value.id === id ? runningSince.value.at : null
      return { id, status: 'running', started_at: startedAt, summary: null }
    })

    const noteRunningSince = (id) => {
      if (id && runningSince.value.id !== id) runningSince.value = { id, at: new Date().toISOString() }
    }


    const loadGuidePanel = async () => {
      if (!tvhConfigured.value) {
        tvhState.value = null
        tvhReachable.value = false
        guideLoaded.value = true
        return
      }
      const [s, onNowResult] = await Promise.all([
        api('GET', '/api/epg/state').catch(() => null),
        api('GET', '/api/epg/now').catch(() => null),
      ])
      tvhReachable.value = Boolean(s) && !s.stale
      if (s) applyRecordingState(s)
      if (onNowResult) onNow.value = onNowResult.entries || []
      guideOk.value = Boolean(onNowResult) || onNow.value.length > 0
      guideLoaded.value = true
      if (!s || !onNowResult) retryGuidePanelSoon()
    }

    const applyRecordingState = (s) => {
      tvhState.value = s
      guideSeriesLinks.value = new Set((s.seriesTags || []).map((t) => String(t.seriesLinkId ?? t.id)))
      guideUpcoming.value = (s.futureRecordings || [])
        .filter((r) => !r.pendingDelete)
        .sort((a, b) => tsOfMs(a.startDate) - tsOfMs(b.startDate))
        .slice(0, 3)
    }

    let guideRetryTimer = null
    const retryGuidePanelSoon = () => {
      if (guideRetryTimer) return
      guideRetryTimer = setTimeout(() => {
        guideRetryTimer = null
        loadGuidePanel()
      }, GUIDE_PANEL_RETRY_MS)
    }
    onUnmounted(() => clearTimeout(guideRetryTimer))

    const isSeriesRec = (r) =>
      r?.seriesLinkId != null && guideSeriesLinks.value.has(String(r.seriesLinkId))


    const syncDetailsHref = (s) => `#/syncs/${s.id}`

    const applySyncs = (syncs) => {
      recentSyncs.value = (syncs.syncs || []).slice(0, RECENT_SYNCS_COUNT)
      syncsLoaded.value = true
    }

    const applySeries = (series) => {
      seriesCount.value = series.series?.length || 0
      outsideLibraryCount.value = series.series?.filter((s) => s.savesTo?.kind !== 'library').length || 0
      seriesUnavailable.value = Boolean(series.error)
    }

    const applySettings = (settings) => {
      plexConfigured.value = Boolean(settings.plex_url && settings.plex_token_set && settings.plex_tv_section_id)
      plexHost.value = hostOf(settings.plex_url)
      tvhConfigured.value = Boolean(settings.tvh_url)
    }

    const refresh = async () => {
      await Promise.all([
        api('GET', `/api/syncs?pageSize=${RECENT_SYNCS_COUNT}`).then(applySyncs).catch(() => { syncsLoaded.value = true }),
        loadSyncStatus().then(ensureSyncPolling),
        api('GET', '/api/series').catch((err) => ({ series: [], error: err.message })).then(applySeries),
        api('GET', '/api/recordings?since=7d&pageSize=10')
          .then((recordings) => { recordings7dCount.value = recordings.total || 0 })
          .catch(() => {}),
        fetchSettings().catch(() => ({})).then(applySettings).then(loadGuidePanel),
      ])
      statsLoaded.value = true
      saveSnapshot()
    }

    const tvhCell = computed(() => {
      const base = { label: 'TVHEADEND', href: '#/settings/tvheadend' }
      if (!statsLoaded.value) return { ...base, value: '...' }
      if (!tvhConfigured.value) return { ...base, value: 'not set up', cta: true }
      if (!tvhReachable.value) return { ...base, href: '#/doctor/tvheadend', value: 'unreachable' }
      const s = tvhState.value
      const bits = [
        ...(s?.tunerCount ? [`${s.tunerCount} tuner${s.tunerCount === 1 ? '' : 's'}`] : []),
        ...(s?.storageInfo?.free ? [`${fmtBytes(s.storageInfo.free)} free`] : []),
      ]
      return { ...base, value: bits.join(' · ') || 'reachable' }
    })

    const seriesCell = computed(() => {
      const base = { label: 'SERIES', href: '#/series' }
      if (!statsLoaded.value || seriesUnavailable.value) return { ...base, value: '...' }
      if (!seriesCount.value) return { ...base, href: '#/guide', value: 'record a series', cta: true }
      const outside = outsideLibraryCount.value ? ` · ${outsideLibraryCount.value} not in library` : ''
      return { ...base, value: `${seriesCount.value} series${outside}` }
    })

    const recordingsCell = computed(() => ({
      label: 'RECORDINGS 7D',
      href: '#/recordings',
      value: statsLoaded.value ? `${recordings7dCount.value} imported` : '...',
    }))

    const plexCell = computed(() => {
      const base = { label: 'PLEX', href: '#/settings/plex' }
      if (!statsLoaded.value) return { ...base, value: '...' }
      if (!plexConfigured.value) return { ...base, value: 'not set up', cta: true }
      return { ...base, value: plexHost.value || 'connected' }
    })

    const pipeline = computed(() => [tvhCell.value, seriesCell.value, recordingsCell.value, plexCell.value])

    const lastSyncCell = computed(() => {
      const s = deckSync.value
      if (!statsLoaded.value && !s) return { label: 'LAST SYNC', value: '...', dim: true }
      if (!s) return { label: 'LAST SYNC', value: 'never', dim: true }
      const nowMs = now.value.getTime()
      const title = [`#${s.id}`, fmtTime(s.started_at), s.summary?.trigger].filter(Boolean).join(' · ')
      if (s.status === 'running') {
        return { label: 'ELAPSED', value: fmtElapsed({ at: s.started_at, nowMs }), title }
      }
      return { label: 'LAST SYNC', value: fmtAgo({ at: s.finished_at || s.started_at, nowMs }), title }
    })

    const resultCell = computed(() => {
      if (flashText.value) {
        return { key: `flash-${flashText.value}`, label: 'NOTICE', value: flashText.value, tone: flashKind.value, title: flashText.value }
      }
      const s = deckSync.value
      if (!statsLoaded.value && !s) return { key: 'loading', label: 'RESULT', value: '...', tone: 'deck-cell-dim' }
      if (!s) return { key: 'none', label: 'RESULT', value: 'none', tone: 'deck-cell-dim' }
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
      if (mins < 60) return `in ${formatMinutes(mins)}`
      return `at ${fmtClockTz(at)}`
    })

    const syncButtonLabel = computed(() => {
      if (starting.value) return 'STARTING…'
      if (shownSyncId.value) return 'SYNCING…'
      return 'SYNC NOW'
    })

    const holdSyncState = (syncId) => {
      heldSyncId.value = syncId
      noteRunningSince(syncId)
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
      noteRunningSince(curr)
      if (!curr || !heldSyncId.value) refresh()
    })
    onUnmounted(stopWatch)

    return {
      syncStatus, shownSyncId, lastSyncCell, resultCell, nextSyncLabel, recentSyncs,
      tvhConfigured, pipeline,
      onNow, guideUpcoming, guideOk, onNowPercent, onNowMeta, isSeriesRec, fmtClockTz, fmtRelativeDay, tsOfMs,
      isRecordingChannel, loadGuidePanel,
      OFF_AIR_MESSAGE, watchLive, watchRowLabel, openInGuide, starting, syncNow, syncButtonLabel, fmtTime,
      flashText, flashKind, statsLoaded, syncsLoaded, guideLoaded,
      syncWhenText, syncTookText, syncDetailsHref, firstSyncError,
      runningSync, lastFinishedSync, notableSyncs, stripMarks, stripLabel, RECENT_SYNCS_COUNT,
      SKELETON_LIVE_WIDTHS, SKELETON_UPCOMING_WIDTHS, SKELETON_SYNC_WIDTHS,
    }
  },
}

const syncWhenText = (s) => syncWhen({
  startedMs: syncMsOf(s.started_at),
  finishedMs: s.status === 'running' ? null : syncMsOf(s.finished_at),
  nowMs: now.value.getTime(),
  timeZone: tz.value,
})
