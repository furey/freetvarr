import { MAX_CAST, creditsKeyOf, crewLinesOf, isSettledCredits, shownCastOf } from './credits-display.js'
import { remainingHoldMs } from './pending.js'
import { retryDelayOf } from './ratings-display.js'
import { durationText } from './recording-info.js'
import { genreLabel } from './live-info.js'

export const MORE_INFO_MIN_MS = 900
export const MORE_INFO_SKELETON_AFTER_MS = 200
export const MORE_INFO_CLOSED = { opened: false, load: false }
export const UNKNOWN_KIND = 'unknown'

export const moreInfoRequestOf = ({ title, kind = null, year = null } = {}) => {
  const request = { title: String(title || '').trim(), kind: REQUEST_KINDS.has(kind) ? kind : '', year: year ?? null }
  return creditsKeyOf(request) ? request : null
}

export const moreInfoToggledOf = ({ isOpen, opened = false }) => ({
  opened: opened || Boolean(isOpen),
  load: Boolean(isOpen) && !opened,
})

export const looksUpCreditsFor = (request) => Boolean(request) && request.kind !== UNKNOWN_KIND

export const moreInfoSkeletonOf = (kind = '') => ({
  cast: MAX_CAST,
  crew: kind === 'movie' ? FILM_CREW_ROWS : SERIES_CREW_ROWS,
  details: DETAIL_ROWS,
})

export const moreInfoAfterLoadOf = (answer) => ({ opened: answer?.status !== 'pending' })

export const guideDetailsOf = ({ genre = null, genres = '' } = {}) => ({
  genres: String(genres || '').trim() || genreLabel(genre),
})

export const loadMoreInfoCredits = async ({
  request,
  fetchCredits,
  isCurrent = () => true,
  onSlow = () => {},
  clock = Date.now,
  wait = waitMs,
  after = afterMs,
  slowAfterMs = MORE_INFO_SKELETON_AFTER_MS,
  minMs = MORE_INFO_MIN_MS,
}) => {
  let shownAt = null
  const stopTimer = after(slowAfterMs, () => {
    shownAt = clock()
    onSlow()
  })
  const answer = await (request?.kind === UNKNOWN_KIND ? null : settledCreditsOf({ request, fetchCredits, isCurrent, wait }))
  stopTimer()
  if (shownAt === null) return answer
  const remaining = remainingHoldMs({ startedAt: shownAt, now: clock(), minMs })
  if (remaining > 0) await wait(remaining)
  return answer
}

export const moreInfoOf = ({ credits = null, kind = '', guide = {} }) => {
  const film = kind === 'movie'
  const details = credits?.status === 'ready' ? credits.details || {} : {}
  const labels = film ? FILM_LABELS : SERIES_LABELS
  const genres = Array.isArray(details.genres) && details.genres.length ? details.genres.join(', ') : guide.genres || ''
  const rows = [
    { label: labels.company, value: details.company || '' },
    { label: labels.year, value: details.year ? String(details.year) : '' },
    { label: 'Genres', value: genres },
    { label: labels.minutes, value: details.minutes > 0 ? durationText(details.minutes * 60) : '' },
    { label: 'Language', value: details.language || '' },
  ].filter((row) => row.value)
  const cast = shownCastOf(credits)
  const crew = crewLinesOf(credits)
  const stillLooking = credits?.status === 'pending'
  const emptyText = stillLooking || !(cast.length || crew.length || rows.length) ? emptyTextOf(credits) : ''
  return { cast, crew, rows, emptyText }
}

const settledCreditsOf = async ({ request, fetchCredits, isCurrent, wait }) => {
  for (let attempt = 0; ; attempt += 1) {
    const answer = await Promise.resolve().then(() => fetchCredits(request)).catch(() => null)
    if (!isCurrent()) return null
    if (isSettledCredits(answer)) return answer
    if (answer?.status !== 'pending') return null
    const delay = retryDelayOf(attempt)
    if (delay == null) return STILL_PENDING
    await wait(delay)
    if (!isCurrent()) return null
  }
}

const emptyTextOf = (credits) => {
  if (credits?.status === 'pending') return STILL_LOOKING_TEXT
  return credits?.off ? LOOKUPS_OFF_TEXT : NOTHING_FOUND_TEXT
}

const waitMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const afterMs = (ms, run) => {
  const timer = setTimeout(run, ms)
  return () => clearTimeout(timer)
}

const FILM_CREW_ROWS = 3
const SERIES_CREW_ROWS = 2
const DETAIL_ROWS = 5
const SERIES_LABELS = { company: 'Network', year: 'First aired', minutes: 'Episode length' }
const FILM_LABELS = { company: 'Studio', year: 'Released', minutes: 'Runtime' }
const REQUEST_KINDS = new Set(['movie', UNKNOWN_KIND])
const STILL_PENDING = { status: 'pending', cast: [], crew: [], details: null }
const STILL_LOOKING_TEXT = 'Still looking up cast and crew. Close and open More info to try again.'
const NOTHING_FOUND_TEXT = 'No cast, crew, or details found for this programme.'
const LOOKUPS_OFF_TEXT = 'Cast and crew lookups are off. Turn them on in Settings, under Film and TV info.'
