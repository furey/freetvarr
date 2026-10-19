import { episodeHeading } from './show-page.js'

export const DELETE_VARIANTS = ['all', 'watched', 'episode', 'selected']

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

export const deleteConfirmOf = ({ variant, show, preview, episodes = [], totalCount, stopSeries = false }) => {
  const items = preview.items || []
  const count = preview.count ?? items.length
  const missing = items.filter((item) => item.missing)
  const offersStopSeries = variant === 'all' && Boolean(show.rule)
  const stopsSeries = offersStopSeries && stopSeries
  return {
    title: titleOf({ variant, count, showTitle: show.title }),
    deleted: [
      libraryLineOf({ variant, items, bytes: preview.bytes }),
      tvheadendLineOf({ variant, count, episodes, missingCount: missing.length }),
      stopsSeries ? { title: 'The series recording', detail: 'New episodes stop recording' } : null,
    ].filter(Boolean),
    missingNote: missingNoteOf(missing),
    stays: staysOf({ variant, count, totalCount, episodes, show, stopsSeries }),
    confirmLabel: variant === 'episode' ? 'Delete episode' : `Delete ${episodesText(count)}`,
    busyLabel: 'Deleting…',
    offersStopSeries,
  }
}

export const deleteOutcomeOf = ({ body, labelsById = {} }) => {
  const results = body?.results || []
  const deleted = results.filter((result) => result.ok)
  const failed = results.filter((result) => !result.ok)
  const failures = failed.map((result) => `${labelsById[result.recordingId] || 'An episode'}: ${failureReasonOf(result)}`)
  if (!failed.length) {
    return { kind: 'ok', title: `Deleted ${episodesText(deleted.length)}`, detail: plexLineOf(body?.plex), failures }
  }
  const title = deleted.length
    ? `Deleted ${deleted.length} of ${episodesText(results.length)}`
    : `Could not delete ${results.length === 1 ? 'the episode' : 'the episodes'}`
  return { kind: 'partial', title, detail: plexLineOf(body?.plex), failures }
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
  const inTvheadend = episodes.filter((episode) => !episode.deletedFromTvhAt).length
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
const MEGABYTE = 1e6
const GIGABYTE = 1e9
const TERABYTE = 1e12
