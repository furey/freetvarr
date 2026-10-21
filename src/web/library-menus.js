import { weekdayClockOf } from './library-shelves.js'
import { airedRangeText, durationText } from './recording-info.js'
import { episodeHeading } from './show-page.js'
import { showKeyOf } from './show-key.js'

export const allEpisodesOf = (show) => (show?.seasons || []).flatMap((season) => season.episodes)

export const isRecordingNow = ({ episode, activeIds }) => Boolean(activeIds?.has(episode.recordingId))

export const deletableEpisodesOf = ({ episodes, activeIds }) =>
  episodes.filter((episode) => !isRecordingNow({ episode, activeIds }))

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

export const showMenuOf = ({ show, activeIds = new Set(), canMove = false }) => {
  const episodes = allEpisodesOf(show)
  const next = show.resumeNext ? episodes.find((e) => e.recordingId === show.resumeNext.recordingId) : null
  const deletable = deletableEpisodesOf({ episodes, activeIds })
  const watchedCount = deletable.filter((episode) => episode.watched).length
  const hasArtwork = episodes.length > 0 || Boolean(show.rule)
  return [
    [
      next && { key: 'play-next', label: 'Play next unwatched', icon: 'play', detail: next.episode != null ? `E${next.episode}` : '' },
      episodes.some((e) => !e.watched && !e.failed) && { key: 'mark-all-watched', label: 'Mark all as watched', icon: 'check' },
      episodes.some((e) => e.watched || e.positionS > 0) && { key: 'mark-all-unwatched', label: 'Mark all as unwatched', icon: 'unwatched' },
    ],
    [
      show.rule && { key: 'options', label: 'Recording options', icon: 'options' },
      show.rule && (show.rule.paused
        ? { key: 'resume-series', label: 'Resume recording', icon: 'play' }
        : { key: 'pause-series', label: 'Pause recording', icon: 'pause' }),
      { key: 'show-info', label: 'Show info', icon: 'info' },
      canMove && episodes.length > 0 && { key: 'move', label: 'Move to show…', icon: 'move' },
      episodes.some((e) => e.filePath) && { key: 'plex', label: 'Open in Plex', icon: 'external' },
      hasArtwork && { key: 'change-picture', label: 'Change picture', icon: 'picture' },
      hasArtwork && { key: 'refresh-artwork', label: 'Refresh artwork', icon: 'refresh' },
    ],
    [
      watchedCount && { key: 'delete-watched', label: 'Delete watched episodes', icon: 'trash', danger: true, detail: String(watchedCount) },
      deletable.length && { key: 'delete-all', label: 'Delete all episodes', icon: 'trash', danger: true, detail: String(deletable.length) },
    ],
  ].map((group) => group.filter(Boolean)).filter((group) => group.length)
}

export const episodeMenuOf = ({ episode, episodes = [], activeIds = new Set(), adRemovalEnabled = false, canMove = false }) => {
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
      hasUnwatchedEarlier && { key: 'watched-earlier', label: 'Mark earlier episodes as watched', icon: 'check-list' },
    ],
    [
      { key: 'episode-info', label: 'Episode info', icon: 'info' },
      canMove && { key: 'move', label: 'Move to show…', icon: 'move' },
      canImport(episode) && { key: 'import', label: importLabelOf(episode), icon: 'refresh' },
      adRemovalEnabled && canRescan(episode) && { key: 'remove-ads', label: 'Remove ads again', icon: 'ads' },
      episode.filePath && { key: 'plex', label: 'Open in Plex', icon: 'external' },
    ],
    [
      !recording && { key: 'delete-episode', label: 'Delete episode', icon: 'trash', danger: true },
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

export const watchedChangeTargets = ({ episodes, watched }) => episodes.filter((episode) => (watched
  ? !episode.watched && !episode.failed
  : episode.watched || episode.positionS > 0))

export const markedText = ({ count, watched }) => {
  const what = count === 1 ? '1 episode' : `${count} episodes`
  return `Marked ${what} as ${watched ? 'watched' : 'unwatched'}`
}

export const episodeInfoOf = ({ episode, showTitle, timeZone }) => ({
  title: episodeHeading(episode),
  subtitle: showTitle,
  text: episode.synopsis || '',
  rows: [
    { label: 'Aired', value: airedRangeText({ airedAt: episode.airedAt, durationSeconds: episode.durationS, timeZone }) },
    { label: 'Channel', value: episode.channelName || '' },
    { label: 'Length', value: durationText(episode.durationS) },
    { label: 'Watched', value: watchedTextOf(episode) },
    { label: 'Saves to', value: episode.filePath || '', mono: true },
  ].filter((row) => row.value),
})

export const showInfoOf = ({ show, timeZone, nicknames = [] }) => {
  const episodes = allEpisodesOf(show)
  const unwatched = episodes.filter((e) => !e.watched && !e.failed).length
  const next = show.nextAiring
  return {
    title: show.title,
    subtitle: '',
    text: '',
    rows: [
      { label: 'Episodes', value: `${episodes.length} recorded · ${unwatched} unwatched` },
      { label: 'Series recording', value: show.rule ? show.rule.summary || 'On' : 'Not recording new episodes' },
      { label: 'Next airing', value: next ? `${weekdayClockOf({ ms: next.startDate, timeZone })}${next.channelName ? ` on ${next.channelName}` : ''}` : '' },
      { label: 'Saves to', value: show.rule?.savesTo?.path || '', mono: true },
      { label: 'Also known as', value: nicknames.join(', ') },
    ].filter((row) => row.value),
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

const importLabelOf = (episode) => {
  if (episode.libraryState === 'not_in_library') return 'Import again'
  return ['failed', 'skipped'].includes(episode.status) ? 'Retry' : 'Import'
}

const canRescan = (episode) => episode.status === 'done' && Boolean(episode.filePath) && !episode.libraryState

const SHORT_TITLE_LENGTH = 24
const MAX_SHOW_TITLE_LENGTH = 200

const IMPORTABLE_STATES =['not_imported', 'not_in_library', 'failed', 'skipped']

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
  'remove-ads': 'Starting…',
}
