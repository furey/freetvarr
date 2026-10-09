export const DEFAULT_SYNC_CRON = '*/30 * * * *'
export const CUSTOM_SYNC_SCHEDULE = 'custom'

export const SYNC_SCHEDULE_PRESETS = [
  { cron: '*/15 * * * *', label: 'Every 15 minutes', aliases: ['0,15,30,45 * * * *', '0-59/15 * * * *'] },
  { cron: '*/30 * * * *', label: 'Every 30 minutes', aliases: ['0,30 * * * *', '0-59/30 * * * *'] },
  { cron: '0 * * * *', label: 'Every hour', aliases: ['0 */1 * * *', '0 0-23 * * *'] },
]

export const normaliseCron = (cron) => String(cron ?? '').trim().split(/\s+/).join(' ')

export const syncSchedulePreset = (cron) => {
  const expression = normaliseCron(cron) || DEFAULT_SYNC_CRON
  const preset = SYNC_SCHEDULE_PRESETS.find((candidate) =>
    [candidate.cron, ...candidate.aliases].includes(expression))
  return preset ? preset.cron : CUSTOM_SYNC_SCHEDULE
}

export const describeSyncSchedule = (cron) => {
  const expression = normaliseCron(cron)
  const preset = SYNC_SCHEDULE_PRESETS.find((candidate) =>
    [candidate.cron, ...candidate.aliases].includes(expression))
  if (!preset) return expression ? `Schedule: ${expression}.` : ''
  return `Runs ${preset.label.charAt(0).toLowerCase()}${preset.label.slice(1)}.`
}

const plural = (count, unit) => count === 1 ? unit : `${unit}s`

const clockText = (hour, minute) => {
  const suffix = hour < 12 ? 'am' : 'pm'
  const clockHour = hour % 12 || 12
  return `${clockHour}:${String(minute).padStart(2, '0')}${suffix}`
}

export const describeSyncFrequency = (cron) => {
  const expression = normaliseCron(cron)
  const preset = SYNC_SCHEDULE_PRESETS.find((candidate) =>
    [candidate.cron, ...candidate.aliases].includes(expression))
  if (preset) return preset.label.charAt(0).toLowerCase() + preset.label.slice(1)
  const everyMinutes = expression.match(/^\*\/(\d{1,2}) \* \* \* \*$/)
  if (everyMinutes && Number(everyMinutes[1]) > 0 && Number(everyMinutes[1]) < 60) {
    const step = Number(everyMinutes[1])
    return `every ${step} ${plural(step, 'minute')}`
  }
  const everyHours = expression.match(/^0 \*\/(\d{1,2}) \* \* \*$/)
  if (everyHours && Number(everyHours[1]) > 0 && Number(everyHours[1]) < 24) {
    const step = Number(everyHours[1])
    return step === 1 ? 'every hour' : `every ${step} hours`
  }
  const daily = expression.match(/^(\d{1,2}) (\d{1,2}) \* \* \*$/)
  if (daily && Number(daily[1]) < 60 && Number(daily[2]) < 24) {
    return `daily at ${clockText(Number(daily[2]), Number(daily[1]))}`
  }
  return ''
}
