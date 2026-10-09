export const formatClock = (ms, timeZone) => clockText({ ms, timeZone, withSeconds: false })

export const formatClockSeconds = (ms, timeZone) => clockText({ ms, timeZone, withSeconds: true })

export const formatDate = (ms, timeZone, { long = false, weekday, month } = {}) => {
  const weekdayStyle = weekday ?? (long ? 'long' : 'short')
  const monthStyle = month ?? (long ? 'long' : 'short')
  const parts = partsOf({
    ms,
    timeZone,
    options: { weekday: weekdayStyle, day: 'numeric', month: monthStyle },
  })
  return `${parts.weekday}, ${parts.day} ${parts.month}`
}

export const formatSeconds = (seconds, decimals = 2) => `${Number(seconds.toFixed(decimals))}s`

export const formatMinutes = (count, { long = false } = {}) => {
  const unit = long ? 'minute' : 'min'
  return `${count} ${unit}${count === 1 ? '' : 's'}`
}

export const formatHours = (count) => `${count} hr${count === 1 ? '' : 's'}`

export const formatUptime = (seconds) => {
  const totalSeconds = Math.max(0, Math.floor(seconds))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainder = totalSeconds % 60
  if (days > 0) {
    return [
      formatDays(days),
      hours > 0 ? formatHours(hours) : '',
      minutes > 0 ? formatMinutes(minutes) : '',
    ].filter(Boolean).join(' ')
  }
  if (totalSeconds < 60) return formatSecs(remainder)
  const paddedSecs = formatSecs(remainder, { pad: true })
  if (hours === 0) return `${formatMinutes(minutes)} ${paddedSecs}`
  return `${formatHours(hours)} ${formatMinutes(minutes)} ${paddedSecs}`
}

const formatSecs = (count, { pad = false } = {}) =>
  `${pad ? String(count).padStart(2, '0') : count} sec${count === 1 ? '' : 's'}`

const formatDays = (count) => `${count} day${count === 1 ? '' : 's'}`

export const stripDayPeriodSpace = (text) => text.replace(/[\s  ]+(am|pm)$/i, (_, period) => period.toLowerCase())

export const dateFormat = (options, timeZone) => {
  const key = `${timeZone}|${JSON.stringify(options)}`
  if (!dateFormatters.has(key)) {
    dateFormatters.set(key, new Intl.DateTimeFormat('en-AU', { timeZone, ...options }))
  }
  return dateFormatters.get(key)
}

const dateFormatters = new Map()

const partsOf = ({ ms, timeZone, options }) =>
  Object.fromEntries(
    dateFormat(options, timeZone).formatToParts(new Date(ms)).map((p) => [p.type, p.value]),
  )

const clockText = ({ ms, timeZone, withSeconds }) => {
  const parts = partsOf({
    ms,
    timeZone,
    options: {
      hour: 'numeric',
      minute: '2-digit',
      ...(withSeconds ? { second: '2-digit' } : {}),
      hour12: true,
    },
  })
  const seconds = withSeconds ? `:${parts.second}` : ''
  return stripDayPeriodSpace(`${Number(parts.hour)}:${parts.minute}${seconds} ${parts.dayPeriod}`)
}
