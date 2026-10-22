import { SETTINGS_GROUPS } from './settings-pages.js'

const locate = (id) => {
  const group = SETTINGS_GROUPS.find((candidate) => candidate.pages.some((page) => page.id === id))
  return { group, page: group.pages.find((page) => page.id === id) }
}

const ENTRIES = [
  { page: 'about', description: 'Versions, licences, and links to Setup and the health checks.', tags: ['help', 'version', 'licence', 'credits'] },
  { label: 'Versions', page: 'about', setting: 'versions', description: 'Freetvarr, TVHeadend, and Node versions, uptime, and the update check.', tags: ['update', 'build', 'bug report', 'copy'] },
  { label: 'Licences', page: 'about', setting: 'licences', description: 'The licences of Freetvarr, its fonts, and the film and TV data.', tags: ['license', 'credits', 'fonts', 'open source', 'attribution'] },
  { page: 'diagram', description: 'Each part of the system, what it does, and its settings.', tags: ['map', 'components', 'how it works', 'aerial'] },

  { page: 'for-you', description: 'Suggestions from the guide, hidden shows, and the viewing history.', tags: ['suggestions', 'recommendations'] },
  { label: 'Show For you', page: 'for-you', setting: 'show-for-you', description: 'Adds For you to Home and the highlights.', tags: ['suggestions', 'recommendations'] },
  { label: 'Films in other languages', page: 'for-you', setting: 'other-language-films', description: 'All, a few, or no films first made in another language.', tags: ['subtitles', 'foreign', 'language'] },
  { label: 'Hidden shows', page: 'for-you', setting: 'hidden-shows', description: 'Shows you marked Not interested.', tags: ['not interested', 'show again', 'unhide'] },
  { label: 'Animate the For you icon', page: 'for-you', setting: 'animate-icon', description: 'A short sparkle on the For you icon when Freetvarr opens.', tags: ['sparkle', 'animation', 'motion'] },
  { label: 'Suggestion level', page: 'for-you', setting: 'suggestion-level', description: 'Auto, Basic, Standard, or Plus suggestions.', tags: ['tier', 'hardware', 'check again', 'processor'] },
  { label: 'Viewing history', page: 'for-you', setting: 'viewing-history', description: 'What Freetvarr notes about what you watch.', tags: ['history', 'privacy'] },
  { label: 'Pause history', page: 'for-you', setting: 'pause-history', description: 'Stops noting what you watch.', tags: ['privacy', 'tracking'] },
  { label: 'Clear viewing history', page: 'for-you', setting: 'clear-history', description: 'Deletes the viewing history.', tags: ['delete', 'privacy', 'forget'] },

  { page: 'player', description: 'How the player starts, and how many live streams play at once.', tags: ['player', 'video'] },
  { label: 'This device', page: 'player', setting: 'player-device', description: 'Player settings saved on this device.', tags: ['browser', 'local'] },
  { label: 'Start muted', page: 'player', setting: 'start-muted', description: 'Every video starts with the sound off.', tags: ['sound', 'audio', 'volume', 'mute'] },
  { label: 'Hide player controls after', page: 'player', setting: 'controls-hide', description: 'How long the player controls stay on screen.', tags: ['overlay', 'controls', 'timeout'] },
  { label: 'Live TV', page: 'player', setting: 'player-live-tv', description: 'Live TV settings for every device in the home.', tags: ['live'] },
  { label: 'Live streams at once', page: 'player', setting: 'live-streams', description: 'How many live pictures play at once, in Multiview and the player.', tags: ['streams', 'multiview', 'stutter', 'tuner', 'transcoding'] },
  { label: 'Measure again', page: 'player', setting: 'live-streams', description: 'Measures how many live streams this box plays smoothly.', tags: ['benchmark', 'speed test'] },

  { page: 'channels', description: 'The channels that Live TV, the TV guide, and search show.', tags: ['lineup', 'channel list'] },
  { label: 'Hide SD simulcasts', page: 'channels', setting: 'hide-sd-simulcasts', description: 'Hides SD copies of HD channels.', tags: ['hd', 'duplicate', 'twins'] },
  { label: 'Hide SD channels', page: 'channels', setting: 'hide-sd-channels', description: 'Hides every SD channel except favourites.', tags: ['standard definition'] },

  { page: 'film-tv-info', description: 'Pictures, ratings, reviews, cast, and genres from online film and TV databases.', tags: ['metadata', 'tvmaze', 'tmdb', 'wikipedia'] },
  { label: 'Look up online', page: 'film-tv-info', setting: 'look-up-online', description: 'The switches that send programme titles online.', tags: ['privacy', 'lookups'] },
  { label: 'Missing pictures', page: 'film-tv-info', setting: 'missing-pictures', description: 'Pictures from TVmaze, Wikipedia, and TMDB.', tags: ['artwork', 'images', 'posters'] },
  { label: 'Ratings', page: 'film-tv-info', setting: 'ratings', description: 'Scores for films and drama series.', tags: ['scores', 'stars'] },
  { label: 'Reviews', page: 'film-tv-info', setting: 'reviews', description: 'A line from a TMDB review.', tags: ['tmdb'] },
  { label: 'Cast and crew', page: 'film-tv-info', setting: 'cast-and-crew', description: 'Cast and crew from TMDB and TVmaze.', tags: ['credits', 'actors'] },
  { label: 'Genres', page: 'film-tv-info', setting: 'genres', description: 'Genres from TVmaze and Wikidata for For you and search.', tags: ['tvmaze', 'wikidata', 'other titles'] },
  { label: 'TMDB key', page: 'film-tv-info', setting: 'tmdb-key', description: 'The optional key for TMDB posters, ratings, and reviews.', tags: ['api key', 'the movie database', 'token'] },
  { label: 'TMDB API key', page: 'film-tv-info', setting: 'tmdb-key', description: 'Test, save, or remove the TMDB key.', tags: ['api key', 'token'] },
  { label: 'Picture cropping', page: 'film-tv-info', setting: 'picture-cropping', description: 'How Freetvarr crops programme pictures.', tags: ['crop'] },
  { label: 'Keep faces in view', page: 'film-tv-info', setting: 'faces', description: 'Crops pictures so they show the faces.', tags: ['crop', 'face detection'] },
  { label: 'Movie corrections', page: 'film-tv-info', setting: 'movie-corrections', description: 'Shows you marked Not a movie or This is a movie.', tags: ['not a movie', 'this is a movie', 'film', 'undo'] },

  { page: 'tv-apps', description: 'Watch live TV with the guide in Jellyfin or Kodi.', tags: ['tv apps', 'jellyfin', 'kodi', 'iptv', 'm3u', 'xmltv'] },
  { label: 'TV login', page: 'tv-apps', setting: 'tv-login', description: 'A TVHeadend login that can only watch TV.', tags: ['make a tv login', 'delete tv login', 'account'] },
  { label: 'Login name', page: 'tv-apps', setting: 'tv-login', description: 'The name of the TV login.', tags: ['account'] },
  { label: 'TVHeadend address', page: 'tv-apps', setting: 'tv-apps-address', description: 'The address TV apps use for TVHeadend.', tags: ['host', 'ip'] },
  { label: 'Jellyfin', page: 'tv-apps', setting: 'jellyfin', description: 'The tuner and guide addresses to copy into Jellyfin.', tags: ['m3u', 'xmltv', 'tuner url', 'guide url'] },
  { label: 'Kodi', page: 'tv-apps', setting: 'kodi', description: 'The details to copy into the Kodi TVHeadend client.', tags: ['htsp', 'pvr'] },

  { page: 'series', description: 'Every series recording, its folder, and its ad mode.', tags: ['series recording', 'season pass', 'assign folder', 'cancel series'] },
  { page: 'folders', description: 'Recording titles that save to a folder you choose.', tags: ['title match', 'folder rules', 'patterns'] },
  { label: 'Add title', page: 'folders', setting: 'add-title', description: 'Saves recordings with a title you enter to a folder.', tags: ['title match', 'new'] },
  { label: 'Remove from TVHeadend after import', page: 'folders', setting: 'remove-after-import', description: 'Deletes the TVHeadend copy once Freetvarr imports it.', tags: ['delete', 'clean up', 'free space'] },
  { page: 'log', description: 'Every finished recording, and what Freetvarr did with it.', tags: ['finished recordings', 'failed', 'import', 'history'] },

  { page: 'ad-removal', description: 'Finds the ads in a recording, and can cut them out.', tags: ['ads', 'commercials', 'comskip', 'ad breaks'] },
  { label: 'Enable ad removal', page: 'ad-removal', setting: 'enable-ad-removal', description: 'Turns on the ad mode for each series.', tags: ['ads', 'commercials', 'skip'] },
  { label: 'Keep the original after a cut', page: 'ad-removal', setting: 'ad-retention', description: 'Days to keep the recording from before the cut.', tags: ['ads', 'orig', 'backup', 'days'] },
  { label: 'Detection settings', page: 'ad-removal', setting: 'ad-detection', description: 'Built in, or your own comskip.ini.', tags: ['ads', 'comskip.ini'] },

  { page: 'storage', description: 'What goes into your library, and the folders it saves to.', tags: ['recording folders', 'library', 'folders', 'paths'] },
  { label: 'What to import', page: 'storage', setting: 'what-to-import', description: 'Which recordings go into your library.', tags: ['import'] },
  { label: 'Import every recording', page: 'storage', setting: 'import-unmatched', description: 'One-offs and films with no series go to their folders.', tags: ['one-offs', 'unmatched', 'films'] },
  { label: 'Add to library by default', page: 'storage', setting: 'add-to-library', description: 'New recordings start with Add to library on.', tags: ['library', 'default'] },
  { label: 'Library folders', page: 'storage', setting: 'library-folders', description: 'Where Freetvarr saves episodes, one-offs, and films.', tags: ['paths'] },
  { label: 'Media root', page: 'storage', setting: 'media-root', description: 'The folder TV episodes save to.', tags: ['tv folder', 'episodes', 'path'] },
  { label: 'One-off folder', page: 'storage', setting: 'oneoff-root', description: 'The folder single recordings save to.', tags: ['one-offs', 'sport', 'specials', 'path'] },
  { label: 'Movies folder', page: 'storage', setting: 'movies-root', description: 'The optional folder films save to.', tags: ['films', 'path'] },
  { label: 'Recordings folder', page: 'storage', setting: 'recordings-folder', description: 'The TVHeadend recordings folder that Freetvarr imports from.', tags: ['path', 'tvheadend'] },
  { label: 'As Freetvarr sees it', page: 'storage', setting: 'recordings-root', description: 'The recordings folder at the path Freetvarr uses.', tags: ['path'] },
  { label: 'As TVHeadend sees it', page: 'storage', setting: 'tvh-recordings-path', description: 'The recordings folder at the path TVHeadend reports.', tags: ['path', 'check tvheadend'] },

  { page: 'plex', description: 'How Freetvarr tells Plex about new recordings.', tags: ['library and plex', 'media server'] },
  { label: 'Plex server', page: 'plex', setting: 'plex-server', description: 'The Plex address and token.', tags: ['auto-discover'] },
  { label: 'Auto-discover Plex', page: 'plex', setting: 'plex-server', description: 'Looks for Plex on your home network.', tags: ['find', 'scan'] },
  { label: 'Plex URL', page: 'plex', setting: 'plex-url', description: 'The Plex address.', tags: ['address', 'auto-discover'] },
  { label: 'Plex token', page: 'plex', setting: 'plex-token', description: 'The Plex token, typed or found for you.', tags: ['x-plex-token', 'auto-detect token'] },
  { label: 'Preferences.xml path', page: 'plex', setting: 'plex-prefs', description: 'Where Freetvarr reads the Plex token from.', tags: ['token not found'] },
  { label: 'Plex libraries', page: 'plex', setting: 'plex-libraries', description: 'The Plex sections Freetvarr refreshes.', tags: ['sections', 'load sections', 'refresh plex now', 'create libraries'] },
  { label: 'Create libraries', page: 'plex', setting: 'plex-libraries', description: 'Makes the Plex libraries that are missing.', tags: ['sections'] },
  { label: 'TV section', page: 'plex', setting: 'plex-tv-section', description: 'The Plex library for TV episodes.', tags: ['library'] },
  { label: 'One-off section', page: 'plex', setting: 'plex-oneoff-section', description: 'The Plex library for one-offs.', tags: ['library'] },
  { label: 'Movies section', page: 'plex', setting: 'plex-movies-section', description: 'The Plex library for films.', tags: ['library', 'films'] },
  { label: 'Wait for Plex before removing recordings from TVHeadend', page: 'plex', setting: 'plex-wait', description: 'Keeps a recording in TVHeadend if Plex does not answer.', tags: ['delete', 'remove'] },

  { page: 'health', description: 'Checks every part of the system and says what to fix.', tags: ['doctor', 'checks', 'problems', 'diagnose'] },
  { label: 'Health checks', page: 'health', description: 'Run the checks, then fix what they find.', tags: ['doctor', 'run checks'] },
  { page: 'activity', description: 'Every sync Freetvarr has run.', tags: ['syncs', 'sync history', 'sync now'] },
  { label: 'Sync now', page: 'activity', description: 'Runs a sync at once.', tags: ['import', 'refresh'] },
  { page: 'setup', description: 'Check or change TVHeadend, channels, the guide, folders, and Plex.', tags: ['wizard', 'channel scan', 'scan again', 'guide source'] },
  { label: 'Channel scan', page: 'setup', description: 'Scans the aerial for channels again.', tags: ['scan again', 'retune', 'new channels'] },
  { label: 'Run the whole setup from the start', page: 'setup', description: 'Runs every setup step again.', tags: ['wizard', 'restart'] },
  { page: 'tvheadend', description: 'The TVHeadend address and login, and the tuners.', tags: ['tvh', 'server'] },
  { label: 'Server', page: 'tvheadend', setting: 'tvh-server', description: 'The TVHeadend address and login.', tags: ['tvh', 'auto-discover', 'test connection'] },
  { label: 'Auto-discover TVHeadend', page: 'tvheadend', setting: 'tvh-server', description: 'Looks for TVHeadend on this computer.', tags: ['find', 'scan', 'tvh'] },
  { label: 'TVHeadend URL', page: 'tvheadend', setting: 'tvh-url', description: 'The TVHeadend address.', tags: ['tvh', 'address'] },
  { label: 'Username', page: 'tvheadend', setting: 'tvh-login', description: 'The TVHeadend login Freetvarr uses.', tags: ['tvh', 'login'] },
  { label: 'Password', page: 'tvheadend', setting: 'tvh-login', description: 'The password of the TVHeadend login.', tags: ['tvh', 'login'] },
  { label: 'Open access', page: 'tvheadend', setting: 'open-access', description: 'Undoes Secure and connect from setup.', tags: ['restore open access', 'secure and connect'] },
  { label: 'Tuners', page: 'tvheadend', setting: 'tuners', description: 'How many tuners are in use.', tags: ['tuners in use'] },
  { page: 'schedule', description: 'The time zone, and when Freetvarr checks TVHeadend for new recordings.', tags: ['time zone', 'sync times', 'time and syncs', 'clock'] },
  { label: 'Time zone', page: 'schedule', setting: 'time-zone', description: 'The time zone for the guide, recordings, and syncs.', tags: ['tz', 'clock'] },
  { label: 'Syncs', page: 'schedule', setting: 'syncs', description: 'When Freetvarr checks TVHeadend for new recordings.', tags: ['import'] },
  { label: 'Sync schedule', page: 'schedule', setting: 'syncs', description: 'How often Freetvarr syncs.', tags: ['cron', 'how often', 'timer'] },
  { label: 'Custom schedule', page: 'schedule', setting: 'syncs', description: 'A cron expression for the sync schedule.', tags: ['cron'] },
  { page: 'reset', description: 'Delete Freetvarr\'s settings and start setup again.', tags: ['reset', 'wipe', 'factory', 'delete everything', 'danger zone'] },
  { label: 'Reset Freetvarr', page: 'reset', setting: 'reset', description: 'Deletes the settings, series, and history.', tags: ['wipe', 'factory', 'start again'] },
]

export const SETTINGS_INDEX = ENTRIES.map((entry) => {
  const { group, page } = locate(entry.page)
  return {
    ...entry,
    label: entry.label ?? page.label,
    href: page.href,
    path: entry.label ? `${group.label} → ${page.label}` : group.label,
    isPage: !entry.label,
  }
})

export const settingLabelOf = (setting) => SETTINGS_INDEX.find((entry) => entry.setting === setting)?.label ?? ''

export const searchSettings = (query) => {
  const words = wordsOf(query)
  if (!words.length) return []
  return SETTINGS_INDEX
    .map((entry, order) => ({ entry, order, rank: rankOf({ entry, words, phrase: words.join(' ') }) }))
    .filter(({ rank }) => rank !== null)
    .sort((a, b) => a.rank - b.rank || Number(b.entry.isPage) - Number(a.entry.isPage) || a.order - b.order)
    .map(({ entry }) => entry)
}

const rankOf = ({ entry, words, phrase }) => {
  const label = wordsOf(entry.label)
  if (label.join(' ') === phrase) return 0
  if (everyWordStarts({ words, in: label }) || entry.tags.some((tag) => wordsOf(tag).join(' ') === phrase)) return 1
  if (label.join(' ').includes(phrase)) return 2
  if (everyWordStarts({ words, in: wordsOf(entry.description) })) return 3
  if (entry.tags.some((tag) => everyWordStarts({ words, in: wordsOf(tag) }))) return 4
  const everything = wordsOf([entry.label, entry.description, entry.path, ...entry.tags].join(' '))
  return everyWordStarts({ words, in: everything }) ? 5 : null
}

const everyWordStarts = ({ words, in: candidates }) =>
  words.every((word) => candidates.some((candidate) => candidate.startsWith(word)))

const wordsOf = (text = '') => text
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .split(/[^a-z0-9.]+/)
  .map((word) => word.replace(/^\.+|\.+$/g, ''))
  .filter(Boolean)
