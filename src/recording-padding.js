export const MAX_PADDING_MINUTES = 240

export const paddingMinutesFrom = (value) => {
  if (value == null || value === '') return null
  const minutes = Number(value)
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= MAX_PADDING_MINUTES ? minutes : undefined
}
