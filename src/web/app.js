import { createApp, computed } from '/vendor/vue.esm-browser.prod.js'
import { CancelSeriesStep } from '/components/cancel-series-step.js'
import { ChannelIdentity } from '/components/channel-identity.js'
import { ChannelsModal } from '/components/channels-modal.js'
import { CopyRow } from '/components/copy-row.js'
import { ConfirmDialog } from '/components/dialogs.js'
import { ErrorDiagnosis } from '/components/error-diagnosis.js'
import { noAutofill, ToggleSwitch, TimeZoneField } from '/components/forms.js'
import { GuideCombobox } from '/components/guide-combobox.js'
import { ClockLabel, HealthDot, PageHeader, RecordingChip, SearchButton } from '/components/header-widgets.js'
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
import { ChannelLogo, ProgrammeImage } from '/components/images.js'
import { InfoButton } from '/components/info-button.js'
import { ListSkeleton } from '/components/list-skeleton.js'
import { LivePlayer } from '/components/live-player.js'
import { LiveStreamsSetting, TunerStatusPanel } from '/components/live-streams-settings.js'
import { ManualOption } from '/components/manual-option.js'
import {
  HomeNavIcon,
  LiveNavIcon,
  GuideNavIcon,
  RecordingsNavIcon,
  SettingsNavIcon,
  SearchGlyph,
  ChevronGlyph,
  BackGlyph,
  CloseGlyph,
  PlayGlyph,
  MoreGlyph,
} from '/components/nav-icons.js'
import { PlayerInfoPanel } from '/components/player-parts.js'
import { ProgressBlock } from '/components/progress-block.js'
import { RecordingStatus, RecordingDrawer } from '/components/recording-drawer.js'
import { RecordingPlayer } from '/components/recording-player.js'
import { RecordingsTabs } from '/components/recordings-tabs.js'
import { SearchOverlay } from '/components/search-overlay.js'
import { StaleBuildBanner } from '/components/stale-build-banner.js'
import { SummaryLine } from '/components/summary-line.js'
import { SyncDetail } from '/components/sync-detail.js'
import { SyncStatusIcon, SyncResult } from '/components/sync-status.js'
import { TitleArt } from '/components/title-art.js'
import { TvAppsPanel } from '/components/tv-apps-panel.js'
import { UiSheet } from '/components/ui-sheet.js'
import { VersionsRow } from '/components/versions-row.js'
import { noteBuild, checkForNewBuild } from '/shared/api.js'
import { refreshFromPull, installPullToRefresh } from '/shared/pull-to-refresh.js'
import { pollHealth } from '/shared/health.js'
import { pollRecordingNow } from '/shared/recording-now.js'
import { route, routeParams } from '/shared/router.js'
import { refreshTick } from '/shared/store.js'
import { loadSyncStatus, ensureSyncPolling } from '/shared/sync-status.js'
import { tz } from '/shared/time.js'
import { recordingsPageOf } from '/route-table.js'
import { ChannelSetupStep } from '/views/channel-setup-step.js'
import { DoctorSpinner } from '/views/doctor-view.js'
import { EpgView } from '/views/epg-view.js'
import { FolderEditor, FolderSyncButton } from '/views/folder-editor.js'
import { GuideSetupStep } from '/views/guide-setup-step.js'
import { ForYouView } from '/views/for-you-view.js'
import { HomeView } from '/views/home-view.js'
import { LiveView } from '/views/live-view.js'
import { PlexLibrarySetup } from '/views/plex-library-setup.js'
import { RecordingsLibraryView } from '/views/recordings-library-view.js'
import { ScheduledView } from '/views/scheduled-view.js'
import { SeriesDrawer } from '/views/series-drawer.js'
import { SettingsShell } from '/views/settings-shell.js'
import { ShowView } from '/views/show-view.js'
import { WelcomeView } from '/views/welcome-view.js'

const RECORDINGS_VIEWS = {
  library: RecordingsLibraryView,
  scheduled: ScheduledView,
  show: ShowView,
}

const VIEW_MAP = {
  home: HomeView,
  'for-you': ForYouView,
  live: LiveView,
  guide: EpgView,
  settings: SettingsShell,
  welcome: WelcomeView,
}

const viewFor = ({ view, params }) => (view === 'recordings'
  ? RECORDINGS_VIEWS[recordingsPageOf(params).page]
  : VIEW_MAP[view] || HomeView)

const App = {
  template: `
    <div class="app-shell">
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
    </div>
  `,
  setup() {
    const currentView = computed(() => viewFor({ view: route.value, params: routeParams.value }))
    const viewKey = computed(() => {
      const page = route.value === 'recordings' ? `:${routeParams.value.join('/')}` : ''
      return `${route.value}${page}:${refreshTick.value}`
    })
    return { route, currentView, viewKey }
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

installPullToRefresh({ onRefresh: refreshFromPull })

const app = createApp(App)
app.component('app-nav', AppNav)
app.component('brand-mark', BrandMark)
app.component('brand-wordmark', BrandWordmark)
app.component('page-header', PageHeader)
app.component('search-button', SearchButton)
app.component('health-dot', HealthDot)
app.component('recording-chip', RecordingChip)
app.component('clock-label', ClockLabel)
app.component('search-overlay', SearchOverlay)
app.component('recordings-tabs', RecordingsTabs)
app.component('title-art', TitleArt)
app.component('ui-sheet', UiSheet)
app.component('home-nav-icon', HomeNavIcon)
app.component('live-nav-icon', LiveNavIcon)
app.component('guide-nav-icon', GuideNavIcon)
app.component('recordings-nav-icon', RecordingsNavIcon)
app.component('settings-nav-icon', SettingsNavIcon)
app.component('search-glyph', SearchGlyph)
app.component('chevron-glyph', ChevronGlyph)
app.component('back-glyph', BackGlyph)
app.component('close-glyph', CloseGlyph)
app.component('play-glyph', PlayGlyph)
app.component('more-glyph', MoreGlyph)
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
app.component('list-skeleton', ListSkeleton)
app.component('live-player', LivePlayer)
app.component('live-streams-setting', LiveStreamsSetting)
app.component('tuner-status-panel', TunerStatusPanel)
app.component('recording-player', RecordingPlayer)
app.component('pause-icon', PauseIcon)
app.component('fullscreen-icon', FullscreenIcon)
app.component('exit-fullscreen-icon', ExitFullscreenIcon)
app.component('airplay-icon', AirplayIcon)
app.component('start-over-icon', StartOverIcon)
app.component('player-info-panel', PlayerInfoPanel)
app.component('stale-build-banner', StaleBuildBanner)
app.component('channels-modal', ChannelsModal)
app.component('info-button', InfoButton)
app.component('series-folder-editor', FolderEditor)
app.component('folder-sync-button', FolderSyncButton)
app.component('series-drawer', SeriesDrawer)
app.component('versions-row', VersionsRow)
app.component('copy-row', CopyRow)
app.component('tv-apps-panel', TvAppsPanel)
app.component('copy-icon', CopyIcon)
app.component('info-icon', InfoIcon)
app.component('captions-icon', CaptionsIcon)
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
