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
