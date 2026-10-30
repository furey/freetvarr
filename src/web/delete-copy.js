import { episodeHeading } from './show-page.js'

export const sizeText = (bytes) => {
  if (!(bytes > 0)) return ''
  if (bytes >= TERABYTE) return `${trimmed(bytes / TERABYTE)} TB`
  if (bytes >= GIGABYTE) return `${trimmed(bytes / GIGABYTE)} GB`
  return `${Math.max(1, Math.round(bytes / MEGABYTE))} MB`
}

export const listText = (labels) => {
  if (labels.length <= 1) return labels[0] || ''
  return `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`
}

export const episodeLabelOf = (item) => (item.episode != null ? `E${item.episode}` : episodeHeading({
  title: item.title,
  episodeTitle: item.episodeTitle,
  episode: null,
}))

export const episodesText = (count) => (count === 1 ? '1 episode' : `${count} episodes`)

export const deleteConfirmOf = ({ variant, show, preview, episodes = [], totalCount, stopSeries = false, removeSeries = false, choice = 'both' }) => {
  const items = preview.items || []
  const count = preview.count ?? items.length
  const recorded = items.filter((item) => item.recording !== false)
  const missing = recorded.filter((item) => item.missing)
  const allCopies = copiesOf(items)
  const copies = allCopies.filter((copy) => !copy.recording)
  const managedRecordings = allCopies.filter((copy) => copy.recording)
  const plainRecorded = recorded.filter((item) => !(item.copies || []).some((copy) => copy.recording))
  const offersStopSeries = variant === 'all' && Boolean(show.rule)
  const stopsSeries = offersStopSeries && stopSeries
  const offersRemoveSeries = variant === 'all' && (preview.sonarrSeries || []).length > 0
  const removesSeries = offersRemoveSeries && removeSeries
  const recordingBytes = allCopies.length ? recorded.reduce((sum, item) => sum + (item.bytes || 0), 0) : preview.bytes
  const single = variant === 'episode'
  const onlyFiles = !recorded.length && copies.length > 0 && copies.every((copy) => copy.route === 'disk')
  const chooser = single && items[0]?.canChoose ? choicesOf(items[0].otherManager) : []
  const tvheadendEpisodes = recorded.length ? episodes.filter((episode) => episode.source !== 'plex') : []
  return {
    title: onlyFiles && single ? 'Delete this file?' : titleOf({ variant, count, showTitle: show.title }),
    deleted: [
      plainRecordingLineOf({ variant, single, copies, recorded: plainRecorded, bytes: recordingBytes, filePath: episodes[0]?.filePath }),
      ...managedRecordingLinesOf({ copies: managedRecordings, single, unmonitor: preview.unmonitor !== false, episodeLabel: single ? episodeLabelOf(items[0] || {}) : '' }),
      tvheadendLineOf({ variant, count: recorded.length || count, episodes: tvheadendEpisodes, missingCount: missing.length }),
      ...copyLinesOf({ copies, single, withRecording: recorded.length > 0, unmonitor: preview.unmonitor !== false, episodeLabel: single ? episodeLabelOf(items[0] || {}) : '' }),
      stopsSeries ? { title: 'The series recording', detail: 'New episodes stop recording' } : null,
      removesSeries ? { title: 'The series in Sonarr', detail: 'Sonarr stops downloading new episodes' } : null,
    ].filter(Boolean),
    missingNote: missingNoteOf(missing),
    notes: [managedRecordingNoteOf({ copies: managedRecordings, single }), ...copyNotesOf({ copies, single })].filter(Boolean),
    stays: [
      ...staysOf({ variant, count, totalCount, episodes, show, stopsSeries }),
      allCopies.some((copy) => copy.route === 'sonarr') && !removesSeries ? sonarrStaysLineOf({ showTitle: show.title, series: preview.sonarrSeries || [] }) : null,
    ].filter(Boolean),
    undoText: undoTextOf({
      copies: allCopies,
      plainRecordings: plainRecorded.filter((item) => !item.missing).length,
      tvheadendRecordings: inTvheadendCountOf(tvheadendEpisodes),
      recycleBin: preview.recycleBin || {},
    }),
    confirmLabel: confirmLabelOf({ variant, count, choice, chooser, onlyFiles }),
    busyLabel: 'Deleting…',
    offersStopSeries,
    offersRemoveSeries,
    chooser,
  }
}

const copiesOf = (items) => [...new Map(items.flatMap((item) => item.copies || []).map((copy) => [copy.filePath, copy])).values()]

const choicesOf = (manager) => [
  { value: 'both', label: 'Both' },
  { value: 'recording', label: 'Recording' },
  { value: 'other', label: copyNameOf(manager) },
]

const copyNameOf = (manager) => ({ sonarr: 'Sonarr copy', radarr: 'Radarr copy' }[manager] || 'Other copy')

const confirmLabelOf = ({ variant, count, choice, chooser, onlyFiles }) => {
  if (chooser.length) return { both: 'Delete both', recording: 'Delete recording', other: `Delete ${chooser[2].label.toLowerCase()}` }[choice]
  if (variant === 'episode') return onlyFiles ? 'Delete file' : 'Delete episode'
  return `Delete ${episodesText(count)}`
}

const plainRecordingLineOf = ({ variant, single, copies, recorded, bytes, filePath }) => {
  if (!recorded.length) return null
  return copies.length && single
    ? recordingLineOf({ bytes, filePath })
    : libraryLineOf({ variant, items: recorded, bytes })
}

const managedRecordingLinesOf = ({ copies, single, unmonitor, episodeLabel }) => ['sonarr', 'radarr'].flatMap((route) => {
  const list = copies.filter((copy) => copy.route === route)
  if (!list.length) return []
  const name = appNameOf(route)
  const size = sizeText(sumOf(list))
  const stops = unmonitor ? `, which stops monitoring ${single ? episodeLabel : list.length === 1 ? 'it' : 'them'}` : ''
  const title = single ? 'The recording' : list.length === 1 ? '1 recording' : `${list.length} recordings`
  return [{ title, detail: `${size ? `${size}, ` : ''}deleted through ${name}${stops}`, path: single ? fileNameOf(list[0].filePath) : '' }]
})

const managedRecordingNoteOf = ({ copies, single }) => {
  const managed = copies.filter((copy) => copy.route === 'sonarr' || copy.route === 'radarr')
  if (!managed.length) return ''
  const name = appNameOf(managed[0].route)
  return single || managed.length === 1
    ? `${name} manages this recording, so Freetvarr deletes it through ${name}.`
    : `${name} manages ${managed.length} of these recordings, so Freetvarr deletes them through ${name}.`
}

const recordingLineOf = ({ bytes, filePath }) => ({
  title: 'The recording',
  detail: sizeText(bytes),
  path: filePath ? fileNameOf(filePath) : '',
})

const copyLinesOf = ({ copies, single, withRecording, unmonitor, episodeLabel }) => {
  const managed = ['sonarr', 'radarr'].flatMap((route) => {
    const list = copies.filter((copy) => copy.route === route)
    if (!list.length) return []
    const name = route === 'sonarr' ? 'Sonarr' : 'Radarr'
    const size = sizeText(sumOf(list))
    if (single) {
      const stops = unmonitor && withRecording ? `, which stops monitoring ${episodeLabel}` : ''
      return [
        { title: withRecording ? `The ${name} copy` : 'The file', detail: `${size ? `${size}, ` : ''}deleted through ${name}${stops}${coversText(list[0])}` },
        unmonitor && !withRecording ? { title: `${name} monitoring for ${episodeLabel}`, detail: `${name} stops looking for ${episodeLabel}, so it does not download it again` } : null,
      ].filter(Boolean)
    }
    return [{ title: `${filesText(list.length)} from ${name}`, detail: `${size ? `${size}, ` : ''}deleted through ${name}${unmonitor ? `, which stops monitoring ${list.length === 1 ? 'it' : 'them'}` : ''}` }]
  })
  const disk = copies.filter((copy) => copy.route === 'disk' && !copy.outside)
  const diskLines = !disk.length ? [] : single
    ? [{ title: withRecording ? 'The other copy' : 'The file', detail: `${sizeText(sumOf(disk))}${coversText(disk[0])}`.replace(/^ · /, ''), path: disk[0].filePath }]
    : [{ title: `${filesText(disk.length)} from the disk`, detail: sizeText(sumOf(disk)) || 'No app manages them' }]
  return [...managed, ...diskLines]
}

const copyNotesOf = ({ copies, single }) => {
  const disk = copies.filter((copy) => copy.route === 'disk' && !copy.outside)
  const linked = copies.filter((copy) => copy.hardlinked)
  const outside = copies.filter((copy) => copy.outside)
  const unconnected = copies.filter((copy) => copy.route === 'not-connected')
  return [
    disk.length ? (single && disk.length === 1
      ? 'No app manages this file, so Freetvarr deletes it from the disk. Plex removes the episode at its next scan.'
      : `No app manages ${filesText(disk.length)}, so Freetvarr deletes them from the disk. Plex removes them at its next scan.`) : '',
    linked.length ? (linked.length === 1
      ? 'Another copy of this file stays on the disk, so deleting it frees no space.'
      : `Other copies of ${filesText(linked.length)} stay on the disk, so deleting them frees no space.`) : '',
    outside.length ? `${outside.length === 1 ? 'One file is' : `${outside.length} files are`} outside your library folders, so Freetvarr leaves ${outside.length === 1 ? 'it' : 'them'} alone.` : '',
    unconnected.length ? `${appNameOf(unconnected[0].manager)} is not connected, so Freetvarr leaves its files alone. Connect it in Settings → Recording → Sonarr and Radarr.` : '',
  ].filter(Boolean)
}

const undoTextOf = ({ copies, plainRecordings, tvheadendRecordings, recycleBin }) => {
  const isRecycled = (copy) => ARR_ROUTES.includes(copy.route) && Boolean(recycleBin[copy.route]?.on)
  const recycled = copies.filter(isRecycled)
  if (!recycled.length) return "You can't undo this."
  const app = recycled[0].route
  const days = recycleBin[app].days
  const kept = keptNounOf({ recycled, plainRecordings })
  const keeps = `${appNameOf(app)} keeps ${kept} in its recycle bin${days ? ` for ${daysText(days)}` : ''}.`
  const permanent = permanentLabelsOf({ copies: copies.filter((copy) => !isRecycled(copy)), plainRecordings, tvheadendRecordings })
  return permanent.length ? `${keeps} ${capitalised(listText(permanent))} cannot be undone.` : keeps
}

const keptNounOf = ({ recycled, plainRecordings }) => {
  if (plainRecordings && recycled.every((copy) => !copy.recording)) return recycled.length === 1 ? 'its copy' : 'its copies'
  return recycled.length === 1 ? 'the file' : 'the files'
}

const permanentLabelsOf = ({ copies, plainRecordings, tvheadendRecordings }) => {
  const disk = copies.filter((copy) => copy.route === 'disk' && !copy.outside)
  const arr = copies.filter((copy) => ARR_ROUTES.includes(copy.route))
  return [
    plainRecordings ? (plainRecordings === 1 ? 'the recording' : 'the recordings') : '',
    !plainRecordings && tvheadendRecordings ? (tvheadendRecordings === 1 ? 'the TVHeadend recording' : 'the TVHeadend recordings') : '',
    disk.length ? (disk.length === 1 ? 'the other file' : 'the other files') : '',
    ...ARR_ROUTES.filter((route) => arr.some((copy) => copy.route === route))
      .map((route) => `the ${appNameOf(route)} ${arr.filter((copy) => copy.route === route).length === 1 ? 'copy' : 'copies'}`),
  ].filter(Boolean)
}

const sonarrStaysLineOf = ({ showTitle, series }) => {
  const title = `The rest of ${showTitle} in Sonarr`
  if (series.some((entry) => entry.monitored === true)) return { title, detail: 'New episodes still download' }
  if (series.length && series.every((entry) => entry.monitored === false)) return { title, detail: 'Sonarr is not monitoring this series' }
  return { title }
}

const inTvheadendCountOf = (episodes) => episodes.filter((episode) => !episode.deletedFromTvhAt).length

const capitalised = (text) => text.charAt(0).toUpperCase() + text.slice(1)

const coversText = (copy) => {
  const covers = copy.covers || []
  return covers.length > 1 ? ` · one file holds ${listText(covers.map((cover) => `E${cover.episode}`))}` : ''
}

const daysText = (days) => `${days}\u00a0${days === 1 ? 'day' : 'days'}`

const filesText = (count) => (count === 1 ? '1 file' : `${count} files`)

const sumOf = (copies) => copies.reduce((sum, copy) => sum + (copy.sizeBytes || copy.bytes || 0), 0)

const fileNameOf = (filePath) => String(filePath).split(/[\\/]/).pop()

const appNameOf = (manager) => ({ sonarr: 'Sonarr', radarr: 'Radarr' }[manager] || 'The app')

export const deleteOutcomeOf = ({ body, labelsById = {}, recycleBin = {} }) => {
  const results = body?.results || []
  const detail = [plexLineOf(body?.plex), recycleLineOf({ results, recycleBin })].filter(Boolean).join('. ')
  const deleted = results.filter((result) => result.ok)
  const failed = results.filter((result) => !result.ok)
  const failures = failed.map((result) => `${labelsById[result.recordingId] || 'An episode'}: ${failureReasonOf(result)}`)
  if (!failed.length) {
    return { kind: 'ok', title: `Deleted ${episodesText(deleted.length)}`, detail, failures }
  }
  const title = deleted.length
    ? `Deleted ${deleted.length} of ${episodesText(results.length)}`
    : `Could not delete ${results.length === 1 ? 'the episode' : 'the episodes'}`
  return { kind: 'partial', title, detail, failures }
}

export const recycleLineOf = ({ results = [], recycleBin = {} }) => {
  const routes = new Set(results.flatMap((result) => result.copies || []).filter((copy) => copy.ok && copy.recycled).map((copy) => copy.route))
  const app = ['sonarr', 'radarr'].find((route) => routes.has(route) && recycleBin?.[route]?.on)
  if (!app) return ''
  const days = recycleBin[app].days
  return `${appNameOf(app)} keeps it in its recycle bin${days ? ` for ${daysText(days)}` : ''}`
}

export const deleteRefusalOf = (err) => {
  const countChanged = err?.status === 409 && Number.isInteger(err?.data?.count)
  if (countChanged) return { recheck: true, message: 'The episodes changed since you opened this. Check the list again.' }
  return { recheck: false, message: err?.message || 'Something went wrong.' }
}

export const plexLineOf = (plex = {}) => {
  const outcomes = Object.values(plex || {})
  if (outcomes.some((outcome) => outcome?.triggered)) return 'Plex is updating its library'
  const failed = outcomes.find((outcome) => outcome?.error)
  return failed ? `Plex did not refresh (${failed.error})` : ''
}

const titleOf = ({ variant, count, showTitle }) => {
  if (variant === 'episode') return 'Delete this episode?'
  if (variant === 'watched') return `Delete ${count} watched ${count === 1 ? 'episode' : 'episodes'} of ${showTitle}?`
  if (variant === 'selected') return `Delete ${count} selected ${count === 1 ? 'episode' : 'episodes'} of ${showTitle}?`
  if (count === 1) return `Delete the only episode of ${showTitle}?`
  return `Delete all ${count} episodes of ${showTitle}?`
}

const libraryLineOf = ({ variant, items, bytes }) => {
  const present = items.filter((item) => !item.missing)
  if (!present.length) return null
  const size = sizeText(bytes)
  const what = variant === 'episode' ? 'This episode' : presentLabelOf({ variant, present })
  return { title: size ? `${what}, ${size}` : what, detail: 'from your library and Plex' }
}

const presentLabelOf = ({ variant, present }) => {
  const listable = variant !== 'all' && present.length <= LISTED_MAX && present.every((item) => item.episode != null)
  return listable ? listText(present.map(episodeLabelOf)) : episodesText(present.length)
}

const tvheadendLineOf = ({ variant, count, episodes, missingCount }) => {
  const inTvheadend = inTvheadendCountOf(episodes)
  if (!inTvheadend) return null
  if (variant === 'episode') return { title: 'Its recording in TVHeadend' }
  if (inTvheadend < count) return { title: `${inTvheadend === 1 ? '1 recording' : `${inTvheadend} recordings`} in TVHeadend` }
  return { title: missingCount ? `All ${count} recordings in TVHeadend` : 'Their recordings in TVHeadend' }
}

const missingNoteOf = (missing) => {
  if (!missing.length) return ''
  const one = missing.length === 1
  const who = missing.length <= LISTED_MAX ? listText(missing.map(episodeLabelOf)) : episodesText(missing.length)
  return one
    ? `${who} is already missing from your library. Someone may have moved or deleted it. Freetvarr deletes only its TVHeadend recording.`
    : `${who} are already missing from your library. Someone may have moved or deleted them. Freetvarr deletes only their TVHeadend recordings.`
}

const staysOf = ({ variant, count, totalCount, episodes, show, stopsSeries }) => {
  const others = Math.max(0, (totalCount ?? count) - count)
  const series = !stopsSeries && show.rule ? seriesLineOf(show.rule) : null
  const episodesLine = {
    episode: others ? { title: others === 1 ? `The other episode of ${show.title}` : `The other ${others} episodes of ${show.title}` } : null,
    watched: others ? { title: `${others} unwatched ${others === 1 ? 'episode' : 'episodes'}` } : null,
    selected: others ? { title: others === 1 ? 'The other episode' : `The other ${others} episodes` } : null,
    all: null,
  }[variant]
  if (variant === 'all') return [series, { title: 'Your other shows' }].filter(Boolean)
  return [episodesLine, series].filter(Boolean)
}

const seriesLineOf = (rule) => {
  if (rule.paused) return { title: 'The series recording', detail: 'Paused, so new episodes do not record' }
  const channel = rule.anyChannel ? 'any channel' : rule.channels?.[0]
  return { title: 'The series recording', detail: channel ? `New episodes still record on ${channel}` : 'New episodes still record' }
}

const failureReasonOf = (result) => {
  if (result.error) return sentenceOf(result.error)
  if (result.library === 'failed') return 'Freetvarr could not delete the library file.'
  if (result.tvh === 'failed') return 'TVHeadend did not remove the recording.'
  return 'Something went wrong.'
}

const sentenceOf = (text) => {
  const trimmedText = String(text).trim()
  return /[.!?]$/.test(trimmedText) ? trimmedText : `${trimmedText}.`
}

const trimmed = (value) => (value < 10 ? String(Number(value.toFixed(1))) : String(Math.round(value)))

const LISTED_MAX = 3
const ARR_ROUTES = ['sonarr', 'radarr']
const MEGABYTE = 1e6
const GIGABYTE = 1e9
const TERABYTE = 1e12
