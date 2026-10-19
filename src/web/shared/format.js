import { formatMinutes } from '/time-format.js'
import { now, fmtClockTz } from '/shared/time.js'

export const fmtBytes = (n) => {
  if (!n || n <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = Number(n)
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(1)}${units[i]}`
}

export const tvhDetectSummary = (c) => {
  const auth = c.needsAuth ? ' (asks for a login)' : ''
  const loop = c.loopback ? '. Only loopback answered. Use a LAN IP so logos and live TV load in the browser' : ''
  return `Found TVHeadend at ${c.url}${auth}${loop}.`
}

export const tvhTestSummary = (r) => {
  const bits = []
  if (r.channels) bits.push(`${r.channels} channel${r.channels === 1 ? '' : 's'}`)
  if (r.tuners) bits.push(`${r.tuners} tuner${r.tuners === 1 ? '' : 's'}`)
  return bits.length ? `Connected to TVHeadend · ${bits.join(' · ')}.` : 'Connected to TVHeadend.'
}

export const seasonEpisodeLabel = (r) => {
  if (r.season == null && r.episode == null) return ''
  const s = r.season != null ? `S${String(r.season).padStart(2, '0')}` : ''
  const e = r.episode != null ? `E${String(r.episode).padStart(2, '0')}` : ''
  return `${s}${e}`
}

export const onNowPercent = (p) => {
  const span = p.end - p.start
  if (span <= 0) return 0
  return Math.min(100, Math.max(0, Math.round(((now.value.getTime() - p.start) / span) * 100)))
}

export const onNowMeta = (p) => {
  const mins = Math.max(0, Math.ceil((p.end - now.value.getTime()) / 60_000))
  return `${fmtClockTz(p.start)} · ${formatMinutes(mins)} remaining`
}
