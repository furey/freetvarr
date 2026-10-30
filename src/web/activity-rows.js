import { formatClock } from './time-format.js'
import { syncTook } from './sync-when.js'
import { localDayNumber } from './guide-time.js'

export const UP_NEXT_SOON_MS = 60 * 60 * 1000

export const jobRowOf = ({ run, nowMs, timeZone }) => ({
  id: run.id,
  kind: run.kind,
  title: run.title,
  sub: run.state === 'running' ? runningSubOf(run) : finishedSubOf(run),
  side: run.state === 'running' ? runningSideOf({ run, nowMs }) : finishedSideOf({ run, timeZone }),
  icon: iconOfRun(run),
  tone: toneOfRun(run),
  percent: run.state === 'running' ? run.percent : null,
  indeterminate: run.state === 'running' && run.percent == null,
})

export const recordingRowOf = ({ recording, nowMs, timeZone }) => {
  const endMs = recording.stopPadded ?? recording.stop
  const startMs = recording.recordingStartedAt ?? recording.start
  const slot = recording.start && recording.stop ? clockRangeOf({ startMs: recording.start, endMs: recording.stop, timeZone }) : null
  const stops = recording.stopPadded && recording.stopPadded !== recording.stop ? `stops ${formatClock(recording.stopPadded, timeZone)}` : null
  return {
    id: recording.id,
    kind: 'recording',
    title: `Recording · ${episodeTitleOf(recording)}`,
    sub: [recording.failed ? recording.statusText || 'Recording problem' : recording.channelName || 'TVHeadend', slot && [slot, stops].filter(Boolean).join(', '), recording.tuner].filter(Boolean).join(' · '),
    side: endMs > nowMs ? `${durationText(endMs - nowMs)} left` : 'finishing',
    icon: 'live',
    tone: recording.failed ? 'fail' : null,
    percent: percentBetween({ startMs, endMs, nowMs }),
    live: true,
  }
}

export const sessionRowOf = ({ session, nowMs }) => ({
  id: `session-${session.id}`,
  kind: session.kind,
  title: session.label.replace(/^"|"$/g, '').replace(/" from the start$/, ' from the start'),
  sub: [
    session.kind === 'live' ? 'Live TV' : session.inProgress ? 'Recording now' : 'Recording',
    clientLabelOf(session.client),
    videoModeText(session.videoMode),
    session.viewers > 1 ? `${session.viewers} watching` : null,
  ].filter(Boolean).join(' · '),
  side: durationText(nowMs - session.startedAt),
  icon: session.kind === 'live' ? 'live' : 'playing',
  tone: null,
  percent: null,
})

export const upNextRowOf = ({ plan, nowMs, timeZone }) => ({
  id: `plan-${plan.kind}`,
  kind: plan.kind,
  title: plan.title,
  sub: capitalise(plan.every),
  side: plan.nextAt - nowMs < UP_NEXT_SOON_MS ? soonText(plan.nextAt - nowMs) : laterText({ ms: plan.nextAt, nowMs, timeZone }),
  icon: 'idle',
})

export const serverLineOf = (server = {}) => {
  const parts = []
  if (Number.isFinite(server.uptimeSeconds)) parts.push({ before: 'Server up ', value: uptimeText(server.uptimeSeconds), after: '' })
  if (Number.isFinite(server.stalls)) {
    const worst = server.stalls ? `, worst ${secondsText(server.worstStallMs)}` : ''
    parts.push({ before: '', value: String(server.stalls), after: ` pause${server.stalls === 1 ? '' : 's'} over ${server.thresholdMs ?? 100} ms${worst}` })
  }
  if (server.tuners?.total) parts.push({ before: 'Tuners ', value: `${server.tuners.inUse} of ${server.tuners.total}`, after: ' in use' })
  return parts
}

export const clientLabelOf = (userAgent) => {
  const ua = String(userAgent || '')
  if (!ua) return null
  const device = DEVICES.find(({ pattern }) => pattern.test(ua))?.label ?? null
  const browser = BROWSERS.find(({ pattern }) => pattern.test(ua))?.label
    ?? (/iPhone|iPad/.test(ua) ? 'Home Screen app' : null)
  return [device, browser].filter(Boolean).join(' · ') || null
}

export const durationText = (ms) => {
  if (ms < 60_000) return 'under 1m'
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

export const uptimeText = (seconds) => {
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} m`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours} h ${minutes % 60} m`
  return `${Math.floor(hours / 24)} days`
}

export const triggerText = (trigger) => TRIGGERS[trigger] ?? null

export const startedByText = (trigger) => STARTED_BY[trigger] ?? triggerText(trigger)

export const stepStateOf = (step) => STEP_ICONS[step.state] ?? 'idle'

export const itemStateOf = (item) => ITEM_ICONS[item.state] ?? 'ok'

export const logLineOf = ({ line, timeZone }) => `${formatClock(line.at, timeZone)}  ${line.text}`

const runningSubOf = (run) => [
  run.step,
  run.progress?.total ? `${run.progress.done} of ${run.progress.total}${run.progress.unit ? ` ${run.progress.unit}` : ''}` : null,
  run.detail,
].filter(Boolean).join(' · ') || 'Starting'

const finishedSubOf = (run) => {
  if (run.state === 'failed') return run.error || 'Failed'
  return [run.outcome, triggerText(run.trigger)].filter(Boolean).join(' · ')
}

const runningSideOf = ({ run, nowMs }) => {
  const parts = []
  if (run.percent != null) parts.push(`${run.percent}%`)
  if (run.etaSeconds != null) parts.push(`${durationText(run.etaSeconds * 1000)} left`)
  if (!parts.length) parts.push(syncTook(nowMs - run.startedAt))
  return parts.join(' · ')
}

const finishedSideOf = ({ run, timeZone }) =>
  `${formatClock(run.finishedAt, timeZone)} · ${syncTook(run.finishedAt - run.startedAt)}`

const iconOfRun = (run) => {
  if (run.state === 'running') return 'running'
  if (run.state === 'failed') return 'failed'
  return run.tone === 'warn' ? 'warn' : 'ok'
}

const toneOfRun = (run) => {
  if (run.state === 'failed') return 'fail'
  return run.tone === 'warn' ? 'warn' : null
}

const episodeTitleOf = (recording) => {
  const number = recording.season != null && recording.episode != null ? ` S${recording.season} E${recording.episode}` : ''
  return `${recording.title}${number}`
}

const clockRangeOf = ({ startMs, endMs, timeZone }) => `${formatClock(startMs, timeZone)}–${formatClock(endMs, timeZone)}`

const percentBetween = ({ startMs, endMs, nowMs }) => {
  if (!startMs || !endMs || endMs <= startMs) return null
  return Math.max(0, Math.min(100, Math.round(((nowMs - startMs) / (endMs - startMs)) * 100)))
}

const videoModeText = (mode) => VIDEO_MODES[mode] ?? null

const laterText = ({ ms, nowMs, timeZone }) => {
  const days = localDayNumber({ ms, timeZone }) - localDayNumber({ ms: nowMs, timeZone })
  const clock = formatClock(ms, timeZone)
  return days === 1 ? `tomorrow ${clock}` : clock
}

const soonText = (ms) => (ms < 60_000 ? 'in under 1m' : `in ${Math.round(ms / 60_000)}m`)

const secondsText = (ms) => `${(Math.round(ms / 100) / 10).toString()} s`

const capitalise = (text) => (text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : '')

const DEVICES = [
  { pattern: /iPad/, label: 'iPad' },
  { pattern: /iPhone/, label: 'iPhone' },
  { pattern: /AppleTV|tvOS/, label: 'Apple TV' },
  { pattern: /Android.*Mobile/, label: 'Android phone' },
  { pattern: /Android/, label: 'Android' },
  { pattern: /Macintosh/, label: 'Mac' },
  { pattern: /Windows/, label: 'Windows' },
  { pattern: /CrOS/, label: 'Chromebook' },
  { pattern: /Linux/, label: 'Linux' },
]

const BROWSERS = [
  { pattern: /Edg\//, label: 'Edge' },
  { pattern: /Firefox\/|FxiOS/, label: 'Firefox' },
  { pattern: /Chrome\/|CriOS/, label: 'Chrome' },
  { pattern: /Safari\//, label: 'Safari' },
]

const VIDEO_MODES = {
  copy: 'copy, no conversion',
  vaapi: 'converted with VAAPI',
  transcode: 'converted',
}

const TRIGGERS = {
  manual: 'manual',
  'recording-finished': 'after a recording',
}

const STARTED_BY = { cron: 'Schedule', schedule: 'Schedule' }

const STEP_ICONS = { done: 'ok', running: 'running', failed: 'failed' }

const ITEM_ICONS = { pass: 'ok', done: 'ok', warn: 'warn', fail: 'failed', failed: 'failed', skip: 'idle' }
