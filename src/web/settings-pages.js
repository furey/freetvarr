const SYSTEM_ADDRESS_IDS = ['setup', 'health', 'activity', 'series', 'folders', 'log', 'tvheadend', 'reset']

const hrefOf = ({ id }) => (SYSTEM_ADDRESS_IDS.includes(id) ? `#/settings/system/${id}` : `#/settings/${id}`)

export const SETTINGS_GROUPS = [
  {
    key: 'about',
    label: 'About',
    pages: [
      { id: 'about', label: 'About Freetvarr', view: 'settings', section: 'help' },
      { id: 'diagram', label: 'System diagram', view: 'diagram' },
    ],
  },
  {
    key: 'watching',
    label: 'Watching',
    pages: [
      { id: 'player', label: 'Playback', view: 'player' },
      { id: 'channels', label: 'Channels', view: 'channels' },
      { id: 'film-tv-info', label: 'Film and TV info', view: 'settings', section: 'film-tv-info' },
      { id: 'for-you', label: 'For you', view: 'for-you' },
      { id: 'tv-apps', label: 'Watch on TV', view: 'settings', section: 'tv-apps' },
    ],
  },
  {
    key: 'recording',
    label: 'Recording',
    pages: [
      { id: 'series', label: 'Series rules', view: 'system' },
      { id: 'folders', label: 'Title matches', view: 'system' },
      { id: 'storage', label: 'Media library', view: 'settings', section: 'storage' },
      { id: 'ad-removal', label: 'Ad removal', view: 'settings', section: 'ad-removal' },
      { id: 'plex', label: 'Plex', view: 'settings', section: 'plex' },
      { id: 'log', label: 'Recording log', view: 'system' },
    ],
  },
  {
    key: 'system',
    label: 'System',
    pages: [
      { id: 'setup', label: 'Setup', view: 'system' },
      { id: 'health', label: 'Health', view: 'system' },
      { id: 'activity', label: 'Activity', view: 'system' },
      { id: 'schedule', label: 'Schedule', view: 'settings', section: 'schedule' },
      { id: 'tvheadend', label: 'TVHeadend', view: 'settings', section: 'tvheadend' },
    ],
  },
  {
    key: 'danger',
    label: 'Danger zone',
    pages: [
      { id: 'reset', label: 'Reset', view: 'settings', section: 'danger-zone' },
    ],
  },
].map((group) => ({
  ...group,
  pages: group.pages.map((page) => ({ ...page, href: hrefOf(page) })),
}))

export const settingsPageOf = ({ params = [], narrow = false }) => {
  const id = params[0] === 'system' ? params[1] : PAGE_ALIASES[params[0]] ?? params[0]
  const page = ALL_PAGES.find((candidate) => candidate.id === id)
  if (page) return page
  return narrow ? null : ALL_PAGES[0]
}

const PAGE_ALIASES = {
  pictures: 'film-tv-info',
  suggestions: 'for-you',
  help: 'about',
  'danger-zone': 'reset',
  'media-library': 'storage',
  library: 'storage',
  folders: 'storage',
  playback: 'player',
  'live-streams': 'player',
}

const ALL_PAGES = SETTINGS_GROUPS.flatMap((group) => group.pages.map((page) => ({ ...page, group: group.key })))
