import { createApp, computed, defineAsyncComponent } from '/vendor/vue.esm-browser.prod.js'
import { CancelSeriesStep } from '/components/cancel-series-step.js'
import { ChannelIdentity } from '/components/channel-identity.js'
import { ChannelTwinTag } from '/components/channel-twin-tag.js'
import { CopyRow } from '/components/copy-row.js'
import { ConfirmDialog } from '/components/dialogs.js'
import { ErrorDiagnosis } from '/components/error-diagnosis.js'
import { noAutofill, ToggleSwitch, TimeZoneField } from '/components/forms.js'
import { GuideCombobox } from '/components/guide-combobox.js'
import { ChannelsButton, ClockLabel, HealthAlert, PageHeader, RecordingChip, SearchButton } from '/components/header-widgets.js'
import {
  TvIcon,
  SeriesRecordIcon,
  StopIcon,
  GoLiveIcon,
  MusicNotesIcon,
  SpeakerIcon,
  SpeakerMutedIcon,
  CrossIcon,
  RefreshIcon,
  SlidersIcon,
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
} from '/components/icons.js'
import { AppNav, BrandMark } from '/components/app-shell.js'
import { startBrandIntro } from '/components/brand-intro-overlay.js'
import { BrandWordmark } from '/components/brand-wordmark.js'
import { ChannelLogo, GuideCellImage, ProgrammeImage } from '/components/images.js'
import { InfoButton } from '/components/info-button.js'
import { ListSkeleton } from '/components/list-skeleton.js'
import { LivePlayer } from '/components/live-player.js'
import {
  HomeNavIcon,
  LiveNavIcon,
  GuideNavIcon,
  RecordingsNavIcon,
  SettingsNavIcon,
  SearchGlyph,
  ChevronGlyph,
  DisclosureChevron,
  BackGlyph,
  CloseGlyph,
  PlayGlyph,
  MoreGlyph,
} from '/components/nav-icons.js'
import { PaddingRows } from '/components/padding-rows.js'
import { PlayerInfoPanel } from '/components/player-parts.js'
import { ProgrammeArtBadges, ProgrammeReviewCard } from '/components/programme-ratings.js'
import { ProgrammeSheetHost } from '/components/programme-sheet-host.js'
import { ProgressBlock } from '/components/progress-block.js'
import { RecordingPlayer } from '/components/recording-player.js'
import { RecordingsTabs } from '/components/recordings-tabs.js'
import { UiSegmented } from '/components/ui-segmented.js'
import { SearchOverlay } from '/components/search-overlay.js'
import { StaleBuildBanner } from '/components/stale-build-banner.js'
import { TitleArt } from '/components/title-art.js'
import { ClassificationChip } from '/components/classification-chip.js'
import { ToastRegion } from '/components/toast-region.js'
import { UiSheet } from '/components/ui-sheet.js'
import { WatchForSheet } from '/components/watch-for-sheet.js'
import { noteBuild, checkForNewBuild } from '/shared/api.js'
import { refreshFromPull, installPullToRefresh } from '/shared/pull-to-refresh.js'
import { pollHealth } from '/shared/health.js'
import { installImageFocus } from '/shared/image-focus.js'
import { installVisibleViewport } from '/shared/visible-viewport.js'
import { loadArtworkStamps } from '/shared/artwork-stamps.js'
import { pollRecordingNow } from '/shared/recording-now.js'
import { pageReveal } from '/shared/page-reveal.js'
import { route, routeParams } from '/shared/router.js'
import { refreshTick } from '/shared/store.js'
import { loadSyncStatus, ensureSyncPolling } from '/shared/sync-status.js'
import { tz } from '/shared/time.js'
import { recordingsPageOf } from '/route-table.js'
import { FolderEditor, FolderSyncButton } from '/views/folder-editor.js'
import { HomeView } from '/views/home-view.js'

const SETTINGS_COMPONENTS = {
  '/views/channel-setup-step.js': ['ChannelSetupStep'],
  '/views/doctor-view.js': ['DoctorSpinner'],
  '/views/guide-setup-step.js': ['GuideSetupStep'],
  '/views/plex-library-setup.js': ['PlexLibrarySetup'],
  '/views/series-drawer.js': ['SeriesDrawer'],
  '/components/live-streams-settings.js': ['LiveStreamsSetting', 'TunerStatusPanel'],
  '/components/movie-corrections.js': ['MovieCorrections'],
  '/components/tmdb-key-setting.js': ['TmdbKeySetting'],
  '/components/recording-drawer.js': ['RecordingStatus', 'RecordingDrawer'],
  '/components/summary-line.js': ['SummaryLine'],
  '/components/sync-detail.js': ['SyncDetail'],
  '/components/sync-status.js': ['SyncStatusIcon', 'SyncResult'],
  '/components/tv-apps-panel.js': ['TvAppsPanel'],
  '/components/versions-row.js': ['VersionsRow'],
}

const CHANNEL_COMPONENTS = {
  '/components/channels-modal.js': ['ChannelsModal'],
}

const VIEW_LOADERS = {
  forYou: () => loadView({ url: '/views/for-you-view.js', name: 'ForYouView' }),
  live: () => loadView({ url: '/views/live-view.js', name: 'LiveView', components: CHANNEL_COMPONENTS }),
  guide: () => loadView({ url: '/views/epg-view.js', name: 'EpgView', components: CHANNEL_COMPONENTS }),
  library: () => loadView({ url: '/views/recordings-library-view.js', name: 'RecordingsLibraryView' }),
  scheduled: () => loadView({ url: '/views/scheduled-view.js', name: 'ScheduledView' }),
  show: () => loadView({ url: '/views/show-view.js', name: 'ShowView' }),
  settings: () => loadView({
    url: '/views/settings-shell.js',
    name: 'SettingsShell',
    components: SETTINGS_COMPONENTS,
  }),
  welcome: () => loadView({
    url: '/views/welcome-view.js',
    name: 'WelcomeView',
    components: SETTINGS_COMPONENTS,
  }),
}

const loadView = async ({ url, name, components = {} }) => {
  const [module] = await Promise.all([import(url), registerComponents(components)])
  return module[name]
}

const registerComponents = async (components) => {
  const modules = await Promise.all(Object.keys(components).map((url) => import(url)))
  Object.values(components).forEach((names, index) => names
    .filter((name) => !app.component(name))
    .forEach((name) => app.component(name, modules[index][name])))
}

const ViewLoadError = {
  template: `
    <section class="ui-empty" role="alert">
      <h2 class="ui-empty-title">This page did not load</h2>
      <p class="ui-empty-text">Check the connection to Freetvarr, then reload.</p>
      <button type="button" class="ui-button" @click="reload">Reload</button>
    </section>
  `,
  setup: () => ({ reload: () => window.location.reload() }),
}

const lazyView = (loader) => defineAsyncComponent({
  loader,
  errorComponent: ViewLoadError,
  onError: (err, retry, fail, attempts) => (attempts <= VIEW_LOAD_RETRIES
    ? setTimeout(retry, attempts * VIEW_RETRY_STEP_MS)
    : fail()),
})

const VIEW_LOAD_RETRIES = 3
const VIEW_RETRY_STEP_MS = 1000

const RECORDINGS_VIEWS = {
  library: lazyView(VIEW_LOADERS.library),
  scheduled: lazyView(VIEW_LOADERS.scheduled),
  show: lazyView(VIEW_LOADERS.show),
}

const VIEW_MAP = {
  home: HomeView,
  'for-you': lazyView(VIEW_LOADERS.forYou),
  live: lazyView(VIEW_LOADERS.live),
  guide: lazyView(VIEW_LOADERS.guide),
  settings: lazyView(VIEW_LOADERS.settings),
  welcome: lazyView(VIEW_LOADERS.welcome),
}

const PREFETCHED_VIEWS = ['live', 'guide', 'library', 'forYou', 'scheduled', 'show', 'settings']

const whenIdle = (callback) => (window.requestIdleCallback
  ? window.requestIdleCallback(callback, { timeout: IDLE_TIMEOUT_MS })
  : setTimeout(callback, IDLE_TIMEOUT_MS))

const IDLE_TIMEOUT_MS = 2000

const prefetchViews = ([next, ...rest]) => {
  if (!next) return
  whenIdle(() => VIEW_LOADERS[next]()
    .catch(() => {})
    .finally(() => prefetchViews(rest)))
}

const prefetchViewsAfterLoad = () => {
  const start = () => prefetchViews(PREFETCHED_VIEWS)
  if (document.readyState === 'complete') return whenIdle(start)
  window.addEventListener('load', () => whenIdle(start), { once: true })
}

const FULL_SCREEN_VIEWS = ['welcome']

const viewFor = ({ view, params }) => (view === 'recordings'
  ? RECORDINGS_VIEWS[recordingsPageOf(params).page]
  : VIEW_MAP[view] || HomeView)

const App = {
  template: `
    <div v-if="fullScreen" class="app-setup">
      <component :is="currentView" :key="viewKey" />
      <toast-region />
    </div>
    <div v-else class="app-shell">
      <app-nav />
      <div class="app-main">
        <stale-build-banner />
        <main :class="['app-content', 'view-' + route]">
          <component :is="currentView" :key="viewKey" />
        </main>
      </div>
      <search-overlay />
      <live-player />
      <recording-player />
      <programme-sheet-host />
      <watch-for-sheet />
      <toast-region />
    </div>
  `,
  setup() {
    const currentView = computed(() => viewFor({ view: route.value, params: routeParams.value }))
    const viewKey = computed(() => {
      const page = route.value === 'recordings' ? `:${routeParams.value.join('/')}` : ''
      return `${route.value}${page}:${refreshTick.value}`
    })
    const fullScreen = computed(() => FULL_SCREEN_VIEWS.includes(route.value))
    return { route, currentView, viewKey, fullScreen }
  },
}

startBrandIntro()
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
pollHealth()
loadArtworkStamps().catch(() => {})
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadArtworkStamps().catch(() => {})
})

installPullToRefresh({ onRefresh: refreshFromPull })

const app = createApp(App)
app.component('app-nav', AppNav)
app.component('brand-mark', BrandMark)
app.component('brand-wordmark', BrandWordmark)
app.component('page-header', PageHeader)
app.component('search-button', SearchButton)
app.component('channels-button', ChannelsButton)
app.component('health-alert', HealthAlert)
app.component('recording-chip', RecordingChip)
app.component('clock-label', ClockLabel)
app.component('search-overlay', SearchOverlay)
app.component('recordings-tabs', RecordingsTabs)
app.component('ui-segmented', UiSegmented)
app.component('title-art', TitleArt)
app.component('classification-chip', ClassificationChip)
app.component('ui-sheet', UiSheet)
app.component('home-nav-icon', HomeNavIcon)
app.component('live-nav-icon', LiveNavIcon)
app.component('guide-nav-icon', GuideNavIcon)
app.component('recordings-nav-icon', RecordingsNavIcon)
app.component('settings-nav-icon', SettingsNavIcon)
app.component('search-glyph', SearchGlyph)
app.component('chevron-glyph', ChevronGlyph)
app.component('disclosure-chevron', DisclosureChevron)
app.component('back-glyph', BackGlyph)
app.component('close-glyph', CloseGlyph)
app.component('play-glyph', PlayGlyph)
app.component('more-glyph', MoreGlyph)
app.directive('no-autofill', noAutofill)
app.directive('page-reveal', pageReveal)
app.component('error-diagnosis', ErrorDiagnosis)
app.component('progress-block', ProgressBlock)
app.component('programme-image', ProgrammeImage)
app.component('guide-cell-image', GuideCellImage)
app.component('channel-logo', ChannelLogo)
app.component('channel-twin-tag', ChannelTwinTag)
app.component('toggle-switch', ToggleSwitch)
app.component('cancel-series-step', CancelSeriesStep)
app.component('time-zone-field', TimeZoneField)
app.component('guide-combobox', GuideCombobox)
app.component('channel-identity', ChannelIdentity)
app.component('star-icon', StarIcon)
app.component('step-mark-icon', StepMarkIcon)
app.component('sort-arrow', SortArrow)
app.component('list-skeleton', ListSkeleton)
app.component('live-player', LivePlayer)
app.component('programme-sheet-host', ProgrammeSheetHost)
app.component('programme-art-badges', ProgrammeArtBadges)
app.component('programme-review-card', ProgrammeReviewCard)
app.component('watch-for-sheet', WatchForSheet)
app.component('padding-rows', PaddingRows)
app.component('recording-player', RecordingPlayer)
app.component('pause-icon', PauseIcon)
app.component('fullscreen-icon', FullscreenIcon)
app.component('exit-fullscreen-icon', ExitFullscreenIcon)
app.component('airplay-icon', AirplayIcon)
app.component('start-over-icon', StartOverIcon)
app.component('player-info-panel', PlayerInfoPanel)
app.component('stale-build-banner', StaleBuildBanner)
app.component('toast-region', ToastRegion)
app.component('info-button', InfoButton)
app.component('series-folder-editor', FolderEditor)
app.component('folder-sync-button', FolderSyncButton)
app.component('copy-row', CopyRow)
app.component('copy-icon', CopyIcon)
app.component('info-icon', InfoIcon)
app.component('captions-icon', CaptionsIcon)
app.component('eye-icon', EyeIcon)
app.component('eye-off-icon', EyeOffIcon)
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
document.addEventListener('touchstart', () => {}, { passive: true })
const PAGE_ZOOM_GESTURES = ['gesturestart', 'gesturechange']
const stopPageZoom = (event) => event.preventDefault()
PAGE_ZOOM_GESTURES.forEach((type) => document.addEventListener(type, stopPageZoom, { passive: false }))
installImageFocus()
installVisibleViewport()
app.mount('#app')
prefetchViewsAfterLoad()
