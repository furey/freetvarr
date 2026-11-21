import { adMenuItemOf, restoreMenuItemOf } from './ad-confirm.js'
import { weekdayClockOf } from './library-shelves.js'
import { airedRangeText, durationText } from './recording-info.js'
import { countOf, episodeHeading, episodeMetaOf, hasRecordingsIn, isSeriesShow, itemNounOf, singleItemOf } from './show-page.js'
import { isSingleTitleKind } from './title-kind.js'
import { showKeyOf } from './show-key.js'
import { CHANGE_CATEGORIES } from './category-override.js'

export const allEpisodesOf = (show) => (show?.seasons || []).flatMap((season) => season.episodes).filter((episode) => !episode.scheduled)

export const isRecordingNow = ({ episode, activeIds }) => Boolean(episode.inProgress) || Boolean(activeIds?.has(episode.recordingId))

export const importedEpisodesOf = (show) => allEpisodesOf(show).filter((episode) => !episode.inProgress)

export const runningEpisodeOf = (show) => allEpisodesOf(show).find((episode) => episode.inProgress?.phase === 'recording') || null

export const deletableEpisodesOf = ({ episodes, activeIds }) =>
  episodes.filter((episode) => !episode.scheduled && !isRecordingNow({ episode, activeIds }))

export const compareEpisodeOrder = (a, b) => {
  const numbered = a.episode != null && b.episode != null
  const bySeasonEpisode = numbered ? (a.season ?? 0) - (b.season ?? 0) || a.episode - b.episode : 0
  return bySeasonEpisode || (a.airedAt ?? 0) - (b.airedAt ?? 0)
}

export const earlierEpisodesOf = ({ episodes, episode }) =>
  episodes.filter((other) => other.recordingId !== episode.recordingId && compareEpisodeOrder(other, episode) < 0)

export const latestEarlierEpisodeOf = ({ episodes, episode }) =>
  earlierEpisodesOf({ episodes, episode }).sort(compareEpisodeOrder).at(-1) || null

export const clockOf = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = String(total % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`
}

export const showMenuOf = ({ show, activeIds = new Set(), canMove = false, adRemovalEnabled = false }) => {
  const single = singleItemOf(show)
  if (single) return singleTitleMenuOf({ show, item: single, activeIds, canMove, adRemovalEnabled })
  return collectionMenuOf({ show, activeIds, canMove })
}

const collectionMenuOf = ({ show, activeIds, canMove }) => {
  const noun = itemNounOf(show.kind)
  const episodes = importedEpisodesOf(show)
  const running = runningEpisodeOf(show)
  const next = show.resumeNext ? episodes.find((e) => e.recordingId === show.resumeNext.recordingId) : null
  const deletable = deletableEpisodesOf({ episodes, activeIds })
  const watchedCount = deletable.filter((episode) => episode.watched).length
  const hasArtwork = episodes.length > 0 || Boolean(show.rule) || Boolean(running)
  return [
    [
      running?.inProgress.canPlayFromStart && { key: 'from-start', label: 'Watch from the start', icon: 'restart' },
      next && { key: 'play-next', label: 'Play next unwatched', icon: 'play', detail: next.episode != null ? `E${next.episode}` : '' },
      ...markAllItemsOf(episodes),
    ],
    [
      show.rule && { key: 'options', label: 'Recording options', icon: 'options' },
      show.rule && (show.rule.paused
        ? { key: 'resume-series', label: 'Resume recording', icon: 'play' }
        : { key: 'pause-series', label: 'Pause recording', icon: 'pause' }),
      titleInfoItemOf(show),
      canMerge({ canMove, kind: show.kind }) && episodes.some(isRecorded) && MERGE_ITEM,
      shelfMoveOf(show),
      episodes.some((e) => e.filePath) && { key: 'plex', label: 'Open in Plex', icon: 'external' },
      hasArtwork && { key: 'change-picture', label: 'Change picture', icon: 'picture' },
      show.kind !== 'movie' && CHANGE_CATEGORIES,
      hasArtwork && { key: 'refresh-artwork', label: 'Refresh artwork', icon: 'refresh' },
    ],
    [
      running && { key: 'stop-recording', label: 'Stop recording…', icon: 'stop', danger: true },
      watchedCount && { key: 'delete-watched', label: `Delete watched ${noun.many}`, icon: 'trash', danger: true, detail: String(watchedCount) },
      deletable.length && { key: 'delete-all', label: `Delete all ${noun.many}`, icon: 'trash', danger: true, detail: String(deletable.length) },
    ],
  ].map((group) => group.filter(Boolean)).filter((group) => group.length)
}

const singleTitleMenuOf = ({ show, item, activeIds, canMove, adRemovalEnabled }) => {
  const recording = isRecordingNow({ episode: item, activeIds })
  return [
    singlePlayItemsOf(item),
    [
      ...ruleItemsOf(show),
      titleInfoItemOf(show),
      canMerge({ canMove, kind: show.kind }) && isRecorded(item) && MERGE_ITEM,
      shelfMoveOf(show),
      canImport(item) && { key: 'import', label: importLabelOf(item), icon: 'refresh' },
      adRemovalEnabled && canRescan(item) && adMenuItemOf(item),
      canRescan(item) && restoreMenuItemOf(item),
      item.filePath && { key: 'plex', label: 'Open in Plex', icon: 'external' },
      { key: 'change-picture', label: 'Change picture', icon: 'picture' },
      show.kind !== 'movie' && CHANGE_CATEGORIES,
      { key: 'refresh-artwork', label: 'Refresh artwork', icon: 'refresh' },
    ],
    [
      item.inProgress?.phase === 'recording' && { key: 'stop-recording', label: 'Stop recording…', icon: 'stop', danger: true },
      !recording && !item.inProgress && { key: 'delete-episode', label: `Delete ${itemNounOf(show.kind).one}`, icon: 'trash', danger: true },
    ],
  ].map((group) => group.filter(Boolean)).filter((group) => group.length)
}

const singlePlayItemsOf = (item) => {
  if (item.inProgress) return [item.inProgress.canPlayFromStart && { key: 'from-start', label: 'Watch from the start', icon: 'restart' }]
  const resumable = item.playable && !item.watched && item.positionS > 0
  return [
    resumable && { key: 'play-start', label: 'Play from the start', icon: 'restart' },
    !item.failed && (item.watched
      ? { key: 'unwatched', label: 'Mark as unwatched', icon: 'unwatched' }
      : { key: 'watched', label: 'Mark as watched', icon: 'check' }),
  ]
}

const ruleItemsOf = (show) => (show.rule
  ? [
    { key: 'options', label: 'Recording options', icon: 'options' },
    show.rule.paused
      ? { key: 'resume-series', label: 'Resume recording', icon: 'play' }
      : { key: 'pause-series', label: 'Pause recording', icon: 'pause' },
  ]
  : [])

const titleInfoItemOf = (show) => ({ key: 'show-info', label: isSeriesShow(show) ? 'Show info' : 'Info', icon: 'info' })

const canMerge = ({ canMove, kind }) => canMove && kind !== 'movie'

const MERGE_ITEM = { key: 'move', label: 'Merge into another show…', icon: 'move' }

export const SINGLE_ITEM_KEYS = new Set(['play-start', 'watched', 'unwatched', 'import', 'remove-ads', 'restore-original', 'delete-episode'])

export const titleMenuSubtitleOf = ({ show, timeZone }) => {
  const single = singleItemOf(show)
  if (single) return episodeMetaOf({ episode: single, timeZone })
  const list = allEpisodesOf(show)
  if (!list.length) return ''
  const unwatched = list.filter((e) => !e.watched && !e.failed).length
  return `${countOf({ count: list.length, noun: itemNounOf(show.kind) })} · ${unwatched} unwatched`
}

export const markAllItemsOf = (episodes) => {
  const canMarkWatched = episodes.some((e) => !e.watched && !e.failed)
  const canMarkUnwatched = episodes.some((e) => e.watched || e.positionS > 0)
  if (!canMarkWatched && !canMarkUnwatched) return []
  return [
    markAllItemOf({ key: 'mark-all-watched', label: 'Mark all as watched', icon: 'check', enabled: canMarkWatched, reason: 'All watched' }),
    markAllItemOf({ key: 'mark-all-unwatched', label: 'Mark all as unwatched', icon: 'unwatched', enabled: canMarkUnwatched, reason: 'All unwatched' }),
  ]
}

const markAllItemOf = ({ key, label, icon, enabled, reason }) => (enabled
  ? { key, label, icon }
  : { key, label, icon, detail: reason, disabled: true })

export const shelfMoveOf = (show) => {
  if (show.kind === 'oneoff') return { key: 'kind-show', label: 'Move to Shows', icon: 'move' }
  if (show.kind === 'show') return { key: 'kind-one-off', label: 'Move to One-offs', icon: 'move' }
  return null
}

export const episodeMenuOf = ({ episode, episodes = [], activeIds = new Set(), adRemovalEnabled = false, canMove = false, kind = 'show' }) => {
  if (episode.inProgress) return inProgressMenuOf({ episode, kind })
  const noun = itemNounOf(kind)
  const recording = isRecordingNow({ episode, activeIds })
  const resumable = episode.playable && !episode.watched && episode.positionS > 0
  const hasUnwatchedEarlier = earlierEpisodesOf({ episodes, episode }).some((other) => !other.watched && !other.failed)
  return [
    [
      resumable && { key: 'resume', label: 'Resume', icon: 'play', detail: `from ${clockOf(episode.positionS)}` },
      episode.playable && (resumable
        ? { key: 'play-start', label: 'Play from the start', icon: 'restart' }
        : { key: 'play-start', label: 'Play', icon: 'play' }),
      !episode.failed && (episode.watched
        ? { key: 'unwatched', label: 'Mark as unwatched', icon: 'unwatched' }
        : { key: 'watched', label: 'Mark as watched', icon: 'check' }),
      hasUnwatchedEarlier && { key: 'watched-earlier', label: `Mark earlier ${noun.many} as watched`, icon: 'check-list' },
    ],
    [
      itemInfoItemOf(kind),
      canMerge({ canMove, kind }) && isRecorded(episode) && MERGE_ITEM,
      canImport(episode) && { key: 'import', label: importLabelOf(episode), icon: 'refresh' },
      adRemovalEnabled && canRescan(episode) && adMenuItemOf(episode),
      canRescan(episode) && restoreMenuItemOf(episode),
      episode.filePath && { key: 'plex', label: 'Open in Plex', icon: 'external' },
    ],
    [
      !recording && { key: 'delete-episode', label: `Delete ${noun.one}`, icon: 'trash', danger: true },
    ],
  ].map((group) => group.filter(Boolean)).filter((group) => group.length)
}

const itemInfoItemOf = (kind) => ({ key: 'episode-info', label: isSingleTitleKind(kind) ? 'Info' : 'Episode info', icon: 'info' })

export const inProgressMenuOf = ({ episode, kind = 'show' }) => {
  const recording = episode.inProgress.phase === 'recording'
  return [
    [
      recording && episode.inProgress.canPlayFromStart && { key: 'from-start', label: 'Watch from the start', icon: 'restart' },
      recording && { key: 'watch-live', label: 'Watch live', icon: 'show' },
    ],
    [
      itemInfoItemOf(kind),
    ],
    [
      recording && { key: 'stop-recording', label: 'Stop recording…', icon: 'stop', danger: true },
    ],
  ].map((group) => group.filter(Boolean)).filter((group) => group.length)
}

export const menuPendingLabelOf = (key) => MENU_PENDING_LABELS[key] || ''

export const selectionTitle = (count) => (count ? `${count} selected` : 'Select episodes')

export const toggledSelection = ({ selected, recordingId }) => {
  const next = new Set(selected)
  if (next.has(recordingId)) next.delete(recordingId)
  else next.add(recordingId)
  return next
}

export const allSelectedIn = ({ episodes, selected, activeIds }) => {
  const selectable = deletableEpisodesOf({ episodes, activeIds })
  return selectable.length > 0 && selectable.every((episode) => selected.has(episode.recordingId))
}

export const selectAllIn = ({ episodes, selected, activeIds }) => {
  const ids = deletableEpisodesOf({ episodes, activeIds }).map((episode) => episode.recordingId)
  const next = new Set(selected)
  if (allSelectedIn({ episodes, selected, activeIds })) ids.forEach((id) => next.delete(id))
  else ids.forEach((id) => next.add(id))
  return next
}

export const prunedSelection = ({ selected, episodes, activeIds }) => {
  const allowed = new Set(deletableEpisodesOf({ episodes, activeIds }).map((episode) => episode.recordingId))
  return new Set([...selected].filter((id) => allowed.has(id)))
}

export const watchedChangeTargets = ({ episodes, watched }) => episodes.filter((episode) => !episode.inProgress && (watched
  ? !episode.watched && !episode.failed
  : episode.watched || episode.positionS > 0))

export const markedText = ({ count, watched }) => {
  const what = count === 1 ? '1 episode' : `${count} episodes`
  return `Marked ${what} as ${watched ? 'watched' : 'unwatched'}`
}

export const unmarkedText = ({ failed, total }) => {
  const what = total === 1 ? 'the episode' : `${failed} of ${total} episodes`
  return `Could not mark ${what}`
}

export const episodeInfoOf = ({ episode, showTitle, timeZone, kind = '', year = null, nicknames = [] }) => {
  const fromPlex = episode.source === 'plex'
  const copies = fromPlex ? episode.versions || [] : episode.otherVersions || []
  const versionCount = copies.length + (fromPlex ? 0 : 1)
  const title = isSingleTitleKind(kind) ? showTitle : episodeHeading(episode)
  return {
    title,
    subtitle: title === showTitle ? '' : showTitle,
    more: moreInfoOfShow({ title: showTitle, kind, year }),
    note: versionCount > 1 ? versionsNoteOf({ count: versionCount, fromPlex, noun: itemNounOf(kind) }) : '',
    text: episode.synopsis || '',
    rows: [
      airedRowOf({ episode, kind, fromPlex, timeZone }),
      { label: 'Channel', value: episode.channelName || '' },
      { label: 'Length', value: durationText(episode.durationS) },
      { label: 'Watched', value: watchedTextOf(episode) },
      !fromPlex && { label: copies.length ? 'Recording' : 'Saves to', value: episode.filePath || '', mono: true },
      ...copies.flatMap((copy, i) => copyRowsOf({ copy, label: copyLabelOf({ copy, index: i, fromPlex, count: copies.length }) })),
      { label: 'Also known as', value: nicknames.join(', ') },
    ].filter((row) => row && row.value),
  }
}

const airedRowOf = ({ episode, kind, fromPlex, timeZone }) => {
  const value = airedRangeText({ airedAt: episode.airedAt, durationSeconds: episode.durationS, timeZone })
  if (!isSingleTitleKind(kind)) return { label: 'Aired', value }
  return fromPlex ? null : { label: 'Recorded', value }
}

export const moreInfoOfShow = ({ title, kind = '', year = null }) => ({
  title: title || '',
  kind: kind === 'movie' ? 'movie' : '',
  year: year ?? null,
})

export const isRecorded = (episode) => episode.source !== 'plex'

export const copySourceText = (manager) => COPY_SOURCES[manager] || 'In your Plex library'

export const copySizeText = (copy) => [
  sizeOf(copy.sizeBytes),
  [videoCodecText(copy.videoCodec), resolutionText(copy.resolution)].filter(Boolean).join(' '),
  audioCodecText(copy.audioCodec),
].filter(Boolean).join(' · ')

const versionsNoteOf = ({ count, fromPlex, noun }) => (fromPlex
  ? `This ${noun.one} has ${count} versions. Freetvarr plays the first; Plex picks either.`
  : `This ${noun.one} has ${count} versions. Freetvarr plays the recording; Plex picks either.`)

const copyLabelOf = ({ copy, index, fromPlex, count }) => {
  if (fromPlex) return count > 1 ? `Version ${index + 1}` : 'Came from'
  return { sonarr: 'Sonarr copy', radarr: 'Radarr copy' }[copy.manager] || 'Other copy'
}

const copyRowsOf = ({ copy, label }) => [
  { label, value: copySourceText(copy.manager) },
  { label: 'File', value: copy.filePath || '', mono: true },
  { label: 'Size', value: copySizeText(copy) },
]

const sizeOf = (bytes) => {
  if (!(bytes > 0)) return ''
  if (bytes >= 1e9) return `${Number((bytes / 1e9).toFixed(1))} GB`
  return `${Math.max(1, Math.round(bytes / 1e6))} MB`
}

const videoCodecText = (codec) => ({ h264: 'H.264', hevc: 'HEVC', mpeg2video: 'MPEG-2', vc1: 'VC-1', av1: 'AV1' }[String(codec || '').toLowerCase()] || (codec ? String(codec).toUpperCase() : ''))

const resolutionText = (resolution) => {
  if (!resolution) return ''
  if (/^\d+$/.test(String(resolution))) return `${resolution}p`
  return String(resolution).toUpperCase()
}

const audioCodecText = (codec) => ({ aac: 'AAC', ac3: 'AC-3', eac3: 'E-AC-3', mp2: 'MP2', dca: 'DTS', truehd: 'TrueHD' }[String(codec || '').toLowerCase()] || '')

const seriesRecordingTextOf = ({ show, recorded }) => {
  if (show.rule) return show.rule.summary || 'On'
  return recorded ? 'Not recording new episodes' : ''
}

export const titleInfoOf = ({ show, timeZone, nicknames = [] }) => {
  const single = singleItemOf(show)
  if (!single) return showInfoOf({ show, timeZone, nicknames })
  return episodeInfoOf({ episode: single, showTitle: show.title, timeZone, kind: show.kind, year: show.year, nicknames })
}

export const showInfoOf = ({ show, timeZone, nicknames = [] }) => {
  const episodes = allEpisodesOf(show)
  const unwatched = episodes.filter((e) => !e.watched && !e.failed).length
  const recorded = hasRecordingsIn(show)
  const next = show.nextAiring
  return {
    title: show.title,
    subtitle: '',
    text: '',
    more: moreInfoOfShow({ title: show.title, kind: show.kind, year: show.year }),
    rows: [
      { label: isSeriesShow(show) ? 'Episodes' : 'Recordings', value: `${episodes.length} ${recorded ? 'recorded' : 'in your library'} · ${unwatched} unwatched` },
      (isSeriesShow(show) || show.rule) && { label: 'Series recording', value: seriesRecordingTextOf({ show, recorded }) },
      { label: 'Next airing', value: next ? `${weekdayClockOf({ ms: next.startDate, timeZone })}${next.channelName ? ` on ${next.channelName}` : ''}` : '' },
      { label: 'Saves to', value: show.rule?.savesTo?.path || '', mono: true },
      { label: 'Also known as', value: nicknames.join(', ') },
    ].filter((row) => row && row.value),
  }
}

export const moveSubtitleOf = ({ title, count }) =>
  `${shortTitleOf(title)} · ${count === 1 ? '1 episode' : `${count} episodes`}`

export const moveTargetsOf = ({ shows = [], query = '', currentKey = '' }) => {
  const needle = query.trim().toLowerCase()
  return shows
    .filter((show) => show.key !== currentKey && show.title.toLowerCase().includes(needle))
    .map((show) => ({ key: show.key, title: show.title, poster: show.poster, meta: moveMetaOf(show) }))
}

export const newShowTitleOf = ({ shows = [], query = '' }) => {
  const title = query.trim()
  if (!title || title.length > MAX_SHOW_TITLE_LENGTH) return ''
  const key = showKeyOf(title)
  return shows.some((show) => show.key === key) ? '' : title
}

export const movedText = (title) => `Moved to ${title}`

export const undoMovesOf = (previous = []) => {
  const byTitle = new Map()
  for (const { id, title } of previous) {
    if (!byTitle.has(title)) byTitle.set(title, [])
    byTitle.get(title).push(id)
  }
  return [...byTitle.entries()].map(([title, ids]) => ({ ids, title }))
}

const moveMetaOf = (show) => {
  const total = show.counts?.total ?? 0
  if (!total) return 'No episodes yet'
  return total === 1 ? '1 episode' : `${total} episodes`
}

const shortTitleOf = (title) => {
  if (title.length <= SHORT_TITLE_LENGTH) return title
  const cut = title.slice(0, SHORT_TITLE_LENGTH)
  const wordEnd = cut.lastIndexOf(' ')
  return `${(wordEnd > 0 ? cut.slice(0, wordEnd) : cut).trimEnd()}…`
}

const watchedTextOf = (episode) => {
  if (episode.watched) return 'Yes'
  if (episode.positionS > 0) return `Up to ${clockOf(episode.positionS)}`
  return 'Not yet'
}

const canImport = (episode) => IMPORTABLE_STATES.includes(episode.libraryState || episode.status) && !episode.deletedFromTvhAt

const importLabelOf = (episode) => (['failed', 'skipped'].includes(episode.status) ? 'Retry' : 'Import')

const canRescan = (episode) => isRecorded(episode) && episode.status === 'done' && Boolean(episode.filePath) && !episode.libraryState

const COPY_SOURCES = { sonarr: 'Downloaded by Sonarr', radarr: 'Downloaded by Radarr' }
const SHORT_TITLE_LENGTH = 24
const MAX_SHOW_TITLE_LENGTH = 200

const IMPORTABLE_STATES = ['not_imported', 'failed', 'skipped']

const MENU_PENDING_LABELS = {
  'mark-all-watched': 'Marking as watched…',
  'mark-all-unwatched': 'Marking as unwatched…',
  'pause-series': 'Pausing…',
  'resume-series': 'Resuming…',
  'refresh-artwork': 'Refreshing artwork…',
  watched: 'Marking as watched…',
  unwatched: 'Marking as unwatched…',
  'watched-earlier': 'Marking as watched…',
  import: 'Importing…',
}
