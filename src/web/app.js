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
import {
  fadeEdges,
  nudgeDecision,
  nudgeOffsetAt,
  NUDGE_DELAY_MS,
  NUDGE_DISTANCE_PX,
  NUDGE_TOTAL_MS,
} from '/tab-strip.js'
import { CancelSeriesStep } from '/components/cancel-series-step.js'
import { ChannelIdentity } from '/components/channel-identity.js'
import { ChannelsModal } from '/components/channels-modal.js'
import { CopyRow } from '/components/copy-row.js'
import { ConfirmDialog, FilterSheet } from '/components/dialogs.js'
import { ErrorDiagnosis } from '/components/error-diagnosis.js'
import { noAutofill, ToggleSwitch, TimeZoneField } from '/components/forms.js'
import { GuideCombobox } from '/components/guide-combobox.js'
import { HeaderButton, ZoomControl } from '/components/header-controls.js'
import {
  TvIcon,
  RecordIcon,
  SeriesRecordIcon,
  StopIcon,
  GoLiveIcon,
  MusicNotesIcon,
  SpeakerIcon,
  SpeakerMutedIcon,
  CrossIcon,
  RefreshIcon,
  SlidersIcon,
  FilterIcon,
  ImageIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronRightIcon,
  CalendarIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  PlayIcon,
  PauseIcon,
  FullscreenIcon,
  ExitFullscreenIcon,
  StartOverIcon,
  AirplayIcon,
  PlusIcon,
  MinusIcon,
  UnlinkIcon,
  CheckIcon,
  PencilIcon,
  StarIcon,
  StepMarkIcon,
  SortArrow,
  SignalBarsIcon,
  EyeIcon,
  EyeOffIcon,
  SearchIcon,
  PulseIcon,
  BoltIcon,
  DownloadIcon,
  TrashIcon,
  AdScanIcon,
  ExternalLinkIcon,
  CopyIcon,
  InfoIcon,
  CaptionsIcon,
  MoreIcon,
} from '/components/icons.js'
import { ChannelLogo, ProgrammeImage } from '/components/images.js'
import { InfoButton } from '/components/info-button.js'
import { ListSkeleton } from '/components/list-skeleton.js'
import { LivePlayer } from '/components/live-player.js'
import { ManualOption } from '/components/manual-option.js'
import {
  PlayerHeader,
  PlayerOverlayButtons,
  PlayerActionRow,
  PlayerMoreMenu,
  PlayerInfoPanel,
} from '/components/player-parts.js'
import { ProgressBlock } from '/components/progress-block.js'
import { RecordingCard, RecordingNowPanel } from '/components/recording-cards.js'
import { RecordingStatus, RecordingDrawer } from '/components/recording-drawer.js'
import { RecordingPlayer } from '/components/recording-player.js'
import { StaleBuildBanner } from '/components/stale-build-banner.js'
import { SummaryLine } from '/components/summary-line.js'
import { SyncDetail } from '/components/sync-detail.js'
import { SyncStatusIcon, SyncResult } from '/components/sync-status.js'
import { TvAppsPanel } from '/components/tv-apps-panel.js'
import { VersionsRow } from '/components/versions-row.js'
import { noteBuild, serverAbout, checkForNewBuild, releaseUrl } from '/shared/api.js'
import { refreshFromPull, installPullToRefresh } from '/shared/pull-to-refresh.js'
import { recordingCount, pollRecordingNow } from '/shared/recording-now.js'
import { route } from '/shared/router.js'
import { browserStorage } from '/shared/storage.js'
import { refreshTick } from '/shared/store.js'
import { syncStatus, loadSyncStatus, ensureSyncPolling } from '/shared/sync-status.js'
import { tz, clockReadout, tzShortName } from '/shared/time.js'
import { prefersReducedMotion } from '/shared/utils.js'
import { ChannelSetupStep } from '/views/channel-setup-step.js'
import { DashboardView } from '/views/dashboard-view.js'
import { DoctorSpinner, DoctorView } from '/views/doctor-view.js'
import { EpgView } from '/views/epg-view.js'
import { FolderEditor, FolderSyncButton } from '/views/folder-editor.js'
import { GuideSetupStep } from '/views/guide-setup-step.js'
import { LiveView } from '/views/live-view.js'
import { PlexLibrarySetup } from '/views/plex-library-setup.js'
import { RecordingsView } from '/views/recordings-view.js'
import { SeriesDrawer } from '/views/series-drawer.js'
import { SeriesView } from '/views/series-view.js'
import { SettingsView } from '/views/settings-view.js'
import { SyncsView } from '/views/syncs-view.js'
import { WelcomeView } from '/views/welcome-view.js'

const VIEW_MAP = {
  dashboard: DashboardView,
  live: LiveView,
  guide: EpgView,
  series: SeriesView,
  syncs: SyncsView,
  recordings: RecordingsView,
  settings: SettingsView,
  doctor: DoctorView,
  welcome: WelcomeView,
}

const TAB_FOR_ROUTE = { doctor: 'settings' }

const TABS = [
  { key: 'dashboard',  label: 'DASHBOARD'  },
  { key: 'live',       label: 'LIVE TV'    },
  { key: 'guide',      label: 'TV GUIDE'   },
  { key: 'series',     label: 'SERIES'     },
  { key: 'syncs',      label: 'SYNCS'      },
  { key: 'recordings', label: 'RECORDINGS' },
  { key: 'settings',   label: 'SETTINGS'   },
]

const NAV_HINT_KEY = 'freetvarr.navHintShown'

const NAV_INTERRUPT_EVENTS = ['pointerdown', 'touchstart', 'wheel']

const useTabStripHints = (tabStrip) => {
  const tabFade = reactive({ left: false, right: false })
  let fadeFrame = 0
  let nudgeTimer = 0
  let nudgeFrame = 0
  let userTouched = false
  const updateFade = () => {
    const strip = tabStrip.value
    if (!strip) return
    Object.assign(tabFade, fadeEdges(strip))
  }
  const scheduleFade = () => {
    if (fadeFrame) return
    fadeFrame = requestAnimationFrame(() => {
      fadeFrame = 0
      updateFade()
    })
  }
  const navHintShown = () => {
    try {
      return browserStorage()?.getItem(NAV_HINT_KEY) === '1'
    } catch {
      return true
    }
  }
  const markNavHintShown = () => {
    try { browserStorage()?.setItem(NAV_HINT_KEY, '1') } catch {}
  }
  const stopNudge = () => {
    cancelAnimationFrame(nudgeFrame)
    nudgeFrame = 0
  }
  const noteUserTouch = () => {
    userTouched = true
    if (!nudgeFrame) return
    stopNudge()
    markNavHintShown()
  }
  const playNudge = (strip) => {
    const distancePx = Math.min(NUDGE_DISTANCE_PX, strip.scrollWidth - strip.clientWidth)
    const startedAt = performance.now()
    const step = (now) => {
      const elapsedMs = now - startedAt
      strip.scrollLeft = nudgeOffsetAt({ elapsedMs, distancePx })
      nudgeFrame = elapsedMs < NUDGE_TOTAL_MS ? requestAnimationFrame(step) : 0
    }
    nudgeFrame = requestAnimationFrame(step)
    markNavHintShown()
  }
  const maybeNudge = () => {
    const strip = tabStrip.value
    if (!strip) return
    const decision = nudgeDecision({
      alreadyShown: navHintShown(),
      reducedMotion: prefersReducedMotion(),
      userTouched,
      scrollLeft: strip.scrollLeft,
      scrollWidth: strip.scrollWidth,
      clientWidth: strip.clientWidth,
    })
    if (decision === 'mark') return markNavHintShown()
    if (decision === 'run') playNudge(strip)
  }
  const stripObserver = new ResizeObserver(scheduleFade)
  onMounted(() => {
    const strip = tabStrip.value
    strip.addEventListener('scroll', scheduleFade, { passive: true })
    NAV_INTERRUPT_EVENTS.forEach((type) => strip.addEventListener(type, noteUserTouch, { passive: true }))
    stripObserver.observe(strip)
    updateFade()
    nudgeTimer = setTimeout(maybeNudge, NUDGE_DELAY_MS)
  })
  onUnmounted(() => {
    stripObserver.disconnect()
    clearTimeout(nudgeTimer)
    stopNudge()
    cancelAnimationFrame(fadeFrame)
  })
  return { tabFade, updateFade }
}

const App = {
  template: `
    <div class="min-h-dvh flex flex-col">
      <header ref="appHeader" class="app-header sticky top-0 z-20 backdrop-blur-md bg-surface-deep/85 border-b border-hairline">
        <div class="max-w-6xl mx-auto px-4 md:px-6">
          <div class="flex items-center justify-between gap-4 py-3">
            <a href="#/dashboard" class="no-hover-underline flex items-center gap-3 no-underline text-ink">
              <svg viewBox="0 0 15.5 3" :class="['brand-mark', 'w-[39px]', 'h-[8px]', 'shrink-0', { syncing: syncStatus.activeSyncId }]" aria-hidden="true">
                <rect x="0"    y="0" width="4" height="3" fill="#1eb6ff"/>
                <rect x="5.75" y="0" width="4" height="3" fill="#ff8a00"/>
                <rect x="11.5" y="0" width="4" height="3" fill="#e2b03c"/>
              </svg>
              <span class="font-mono font-semibold text-lg tracking-[0.1em] text-ink">Freetvarr</span>
              <span class="hidden sm:inline ml-[10px] text-xs font-mono uppercase tracking-[0.2em] text-ink-mute translate-y-[2px]">Self-hosted free-to-air TV</span>
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
          <nav ref="tabStrip" class="tab-strip" :data-fade-left="tabFade.left" :data-fade-right="tabFade.right">
            <a v-for="t in tabs" :key="t.key"
              :href="'#/' + t.key"
              :data-active="isActiveTab(t.key)"
              :class="['tab-led', 'block', 'whitespace-nowrap', 'px-1', 'py-2', 'font-mono', 'text-sm', 'tracking-[0.2em]', isActiveTab(t.key) ? 'text-ink' : 'text-ink-dim hover:text-ink']">
              {{ t.label }}
            </a>
          </nav>
        </div>
        <stale-build-banner />
      </header>

      <main :class="['flex-1', route === 'guide' ? 'max-w-none main-guide' : 'max-w-6xl', 'w-full', 'mx-auto', 'px-4', 'py-5', 'md:px-6', 'md:py-8']">
        <component :is="currentView" :key="route + ':' + refreshTick" />
      </main>

      <footer class="border-t border-hairline">
        <div class="max-w-6xl mx-auto px-4 md:px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-ink-mute">
          <span><a href="/#dashboard" class="no-underline text-ink">Freetvarr</a> <a v-if="appVersion" :href="releaseUrl(appVersion)" target="_blank" rel="noopener noreferrer" class="text-ink-dim" :title="'Freetvarr ' + appVersion + ' on GitHub'">{{ appVersion }}</a><span class="hidden sm:inline"> · Self-hosted free-to-air TV</span></span>
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
      <recording-player />
    </div>
  `,
  setup() {
    const currentView = computed(() => VIEW_MAP[route.value] || DashboardView)
    const isActiveTab = (key) => (TAB_FOR_ROUTE[route.value] || route.value) === key
    const tabStrip = ref(null)
    const { tabFade, updateFade } = useTabStripHints(tabStrip)
    watch(route, async () => {
      await nextTick()
      document.querySelector('.tab-strip [data-active="true"]')
        ?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
      updateFade()
    }, { immediate: true })
    const appVersion = computed(() => serverAbout.value.version || '')
    const appHeader = ref(null)
    const publishHeaderHeight = () => {
      document.documentElement.style.setProperty('--app-header-h', `${appHeader.value?.offsetHeight ?? 0}px`)
    }
    const headerObserver = new ResizeObserver(publishHeaderHeight)
    onMounted(() => {
      publishHeaderHeight()
      headerObserver.observe(appHeader.value)
    })
    onUnmounted(() => headerObserver.disconnect())
    return {
      appHeader, tabStrip, tabFade, route, refreshTick, tabs: TABS, currentView, isActiveTab,
      syncStatus, clockReadout, tzShortName, recordingCount,
      appVersion, releaseUrl,
    }
  },
}

checkForNewBuild()

fetch('/api/settings')
  .then((r) => noteBuild(r).json())
  .then((s) => {
    if (s.tz) tz.value = s.tz
    const hashIsExplicit = (window.location.hash || '').replace(/^#\/?/, '').toLowerCase()
    if (!s.tvh_url && !s.welcome_dismissed && hashIsExplicit !== 'welcome') {
      window.history.replaceState(null, '', '#/welcome')
      route.value = 'welcome'
    }
  })
  .catch(() => {})

loadSyncStatus().then(ensureSyncPolling)
pollRecordingNow()

installPullToRefresh({ onRefresh: refreshFromPull })

const app = createApp(App)
app.directive('no-autofill', noAutofill)
app.component('summary-line', SummaryLine)
app.component('sync-status-icon', SyncStatusIcon)
app.component('sync-result', SyncResult)
app.component('sync-detail', SyncDetail)
app.component('error-diagnosis', ErrorDiagnosis)
app.component('recording-status', RecordingStatus)
app.component('recording-drawer', RecordingDrawer)
app.component('progress-block', ProgressBlock)
app.component('programme-image', ProgrammeImage)
app.component('channel-logo', ChannelLogo)
app.component('toggle-switch', ToggleSwitch)
app.component('cancel-series-step', CancelSeriesStep)
app.component('time-zone-field', TimeZoneField)
app.component('guide-combobox', GuideCombobox)
app.component('manual-option', ManualOption)
app.component('plex-library-setup', PlexLibrarySetup)
app.component('channel-setup-step', ChannelSetupStep)
app.component('guide-setup-step', GuideSetupStep)
app.component('channel-identity', ChannelIdentity)
app.component('star-icon', StarIcon)
app.component('step-mark-icon', StepMarkIcon)
app.component('sort-arrow', SortArrow)
app.component('signal-bars-icon', SignalBarsIcon)
app.component('list-skeleton', ListSkeleton)
app.component('recording-card', RecordingCard)
app.component('recording-now-panel', RecordingNowPanel)
app.component('live-player', LivePlayer)
app.component('recording-player', RecordingPlayer)
app.component('pause-icon', PauseIcon)
app.component('fullscreen-icon', FullscreenIcon)
app.component('exit-fullscreen-icon', ExitFullscreenIcon)
app.component('airplay-icon', AirplayIcon)
app.component('start-over-icon', StartOverIcon)
app.component('player-header', PlayerHeader)
app.component('player-overlay-buttons', PlayerOverlayButtons)
app.component('player-action-row', PlayerActionRow)
app.component('player-info-panel', PlayerInfoPanel)
app.component('stale-build-banner', StaleBuildBanner)
app.component('channels-modal', ChannelsModal)
app.component('info-button', InfoButton)
app.component('series-folder-editor', FolderEditor)
app.component('folder-sync-button', FolderSyncButton)
app.component('series-drawer', SeriesDrawer)
app.component('filter-sheet', FilterSheet)
app.component('header-button', HeaderButton)
app.component('zoom-control', ZoomControl)
app.component('filter-icon', FilterIcon)
app.component('image-icon', ImageIcon)
app.component('versions-row', VersionsRow)
app.component('copy-row', CopyRow)
app.component('tv-apps-panel', TvAppsPanel)
app.component('copy-icon', CopyIcon)
app.component('info-icon', InfoIcon)
app.component('captions-icon', CaptionsIcon)
app.component('more-icon', MoreIcon)
app.component('player-more-menu', PlayerMoreMenu)
app.component('eye-icon', EyeIcon)
app.component('eye-off-icon', EyeOffIcon)
app.component('doctor-spinner', DoctorSpinner)
app.directive('autofocus', {
  mounted: (el, binding) => {
    if (binding.value !== false) el.focus()
  },
})
app.component('tv-icon', TvIcon)
app.component('cross-icon', CrossIcon)
app.component('music-notes-icon', MusicNotesIcon)
app.component('speaker-icon', SpeakerIcon)
app.component('speaker-muted-icon', SpeakerMutedIcon)
app.component('record-icon', RecordIcon)
app.component('series-record-icon', SeriesRecordIcon)
app.component('stop-icon', StopIcon)
app.component('go-live-icon', GoLiveIcon)
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
app.component('unlink-icon', UnlinkIcon)
app.component('check-icon', CheckIcon)
app.component('pencil-icon', PencilIcon)
app.component('search-icon', SearchIcon)
app.component('pulse-icon', PulseIcon)
app.component('bolt-icon', BoltIcon)
app.component('download-icon', DownloadIcon)
app.component('trash-icon', TrashIcon)
app.component('ad-scan-icon', AdScanIcon)
app.component('confirm-dialog', ConfirmDialog)
app.component('external-link-icon', ExternalLinkIcon)
app.mount('#app')
