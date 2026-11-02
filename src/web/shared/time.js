import { ref, watch } from '/vendor/vue.esm-browser.prod.js'
import { localDayNumber } from '/guide-time.js'
import {
  dateFormat as cachedDateFormat,
  formatClock,
  formatDate,
  knownTimeZoneOf,
} from '/time-format.js'
import { readSnapshot, writeSnapshot } from '/warm-start.js'
import { browserStorage } from '/shared/storage.js'

const readPageTimeZone = () => knownTimeZoneOf(document.querySelector('meta[name="freetvarr-time-zone"]')?.content)

export const tz = ref(readPageTimeZone() ?? readSnapshot({ storage: browserStorage(), key: 'tz' }) ?? 'UTC')
watch(tz, (zone) => writeSnapshot({ storage: browserStorage(), key: 'tz', data: zone }))

export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || ''

export const dateFormat = (options, timeZone = tz.value) => cachedDateFormat(options, timeZone)

export const toIso = (s) => (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? `${s.replace(' ', 'T')}Z` : s)

export const fmtTime = (s) => {
  if (!s) return ''
  const date = new Date(toIso(s))
  const parts = Object.fromEntries(dateFormat({
    day: 'numeric', month: 'short', year: 'numeric',
  }).formatToParts(date).map((p) => [p.type, p.value]))
  const thisYear = dateFormat({ year: 'numeric' }).format(new Date())
  const day = parts.year === thisYear ? `${parts.day}\u00a0${parts.month}` : `${parts.day}\u00a0${parts.month}\u00a0${parts.year}`
  return `${day} ${formatClock(date.getTime(), tz.value)}`
}

export const fmtElapsed = ({ at, nowMs }) => {
  const secs = Math.max(0, Math.floor((nowMs - Date.parse(toIso(at))) / 1000))
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
}

export const now = ref(new Date())
setInterval(() => { now.value = new Date() }, 1000)

export const fmtClockTz = (ms) => formatClock(ms, tz.value)

export const fmtRelativeDay = (ms) => {
  const daysAhead = localDayNumber({ ms, timeZone: tz.value }) - localDayNumber({ ms: Date.now(), timeZone: tz.value })
  if (daysAhead === 0) return 'Today'
  if (daysAhead === 1) return 'Tomorrow'
  return formatDate(ms, tz.value)
}

export const tsOfMs = (v) => {
  if (v == null) return 0
  if (typeof v === 'number') return v
  const n = Number(v)
  if (Number.isFinite(n)) return n
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? t : 0
}
