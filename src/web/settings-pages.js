const hrefOf = ({ group, id }) => (group === 'system' ? `#/settings/system/${id}` : `#/settings/${id}`)

export const SETTINGS_GROUPS = [
  {
    key: 'preferences',
    label: 'Preferences',
    pages: [
      { id: 'storage', label: 'Recording', view: 'settings', section: 'storage' },
      { id: 'plex', label: 'Library and Plex', view: 'settings', section: 'plex' },
      { id: 'pictures', label: 'Pictures', view: 'settings', section: 'pictures' },
      { id: 'ad-removal', label: 'Ad removal', view: 'settings', section: 'ad-removal' },
      { id: 'tv-apps', label: 'Watch on TV', view: 'settings', section: 'tv-apps' },
      { id: 'schedule', label: 'Schedule', view: 'settings', section: 'schedule' },
    ],
  },
  {
    key: 'system',
    label: 'System',
    pages: [
      { id: 'health', label: 'Health', view: 'system' },
      { id: 'activity', label: 'Activity', view: 'system' },
      { id: 'series', label: 'Series rules', view: 'system' },
      { id: 'folders', label: 'Folders', view: 'system' },
      { id: 'log', label: 'Recording log', view: 'system' },
      { id: 'tvheadend', label: 'TVHeadend', view: 'settings', section: 'tvheadend' },
    ],
  },
  {
    key: 'about',
    label: 'About',
    pages: [
      { id: 'about', label: 'About Freetvarr', view: 'settings', section: 'help' },
      { id: 'reset', label: 'Danger zone', view: 'settings', section: 'danger-zone' },
    ],
  },
].map((group) => ({
  ...group,
  pages: group.pages.map((page) => ({ ...page, href: hrefOf({ group: group.key, id: page.id }) })),
}))

export const settingsPageOf = ({ params = [], narrow = false }) => {
  const id = params[0] === 'system' ? params[1] : PAGE_ALIASES[params[0]] ?? params[0]
  const group = params[0] === 'system' ? 'system' : null
  const page = ALL_PAGES.find((candidate) => candidate.id === id && (!group || candidate.group === group))
  if (page) return page
  return narrow ? null : ALL_PAGES[0]
}

const PAGE_ALIASES = { help: 'about', 'danger-zone': 'reset' }

const ALL_PAGES = SETTINGS_GROUPS.flatMap((group) => group.pages.map((page) => ({ ...page, group: group.key })))
