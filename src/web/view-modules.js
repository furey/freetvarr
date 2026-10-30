const SETTINGS_COMPONENTS = {
  '/views/channel-setup-step.js': ['ChannelSetupStep'],
  '/views/doctor-view.js': ['DoctorSpinner'],
  '/views/guide-setup-step.js': ['GuideSetupStep'],
  '/views/plex-library-setup.js': ['PlexLibrarySetup'],
  '/views/series-drawer.js': ['SeriesDrawer'],
  '/components/live-streams-settings.js': ['LiveStreamsSetting', 'TunerStatusPanel'],
  '/components/movie-corrections.js': ['MovieCorrections'],
  '/components/arr-settings.js': ['ArrSettings'],
  '/components/plex-library-setting.js': ['PlexLibrarySetting'],
  '/components/plex-watch-setting.js': ['PlexWatchSetting'],
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

export const VIEW_ENTRIES = {
  forYou: { url: '/views/for-you-view.js', name: 'ForYouView' },
  live: { url: '/views/live-view.js', name: 'LiveView', components: CHANNEL_COMPONENTS },
  guide: { url: '/views/epg-view.js', name: 'EpgView', components: CHANNEL_COMPONENTS },
  library: { url: '/views/recordings-library-view.js', name: 'RecordingsLibraryView' },
  scheduled: { url: '/views/scheduled-view.js', name: 'ScheduledView' },
  show: { url: '/views/show-view.js', name: 'ShowView' },
  settings: { url: '/views/settings-shell.js', name: 'SettingsShell', components: SETTINGS_COMPONENTS },
  welcome: { url: '/views/welcome-view.js', name: 'WelcomeView', components: SETTINGS_COMPONENTS },
}

export const VIEW_FIRST_REQUESTS = {
  library: ['/api/library/shows'],
  live: ['/api/epg/now?all=1'],
}
