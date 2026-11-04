export const MAX_PADDING_MINUTES = 240
export const MAX_EPISODES_TO_KEEP = 999
export const PADDING_ERROR = `lead_time and lag_time must be whole numbers of minutes from 0 to ${MAX_PADDING_MINUTES}`
export const EPISODES_TO_KEEP_ERROR = `episodes_to_keep must be a whole number from 0 to ${MAX_EPISODES_TO_KEEP}`

export const paddingMinutesFrom = (value) => {
  if (value == null || value === '') return null
  const minutes = Number(value)
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= MAX_PADDING_MINUTES ? minutes : undefined
}

export const recordOptionsFrom = ({ lead_time, lag_time, episodes_to_keep }) => {
  const leadTime = paddingMinutesFrom(lead_time)
  const lagTime = paddingMinutesFrom(lag_time)
  if (leadTime === undefined || lagTime === undefined) return { error: PADDING_ERROR }
  const episodesToKeep = episodesToKeepFrom(episodes_to_keep)
  if (episodesToKeep === undefined) return { error: EPISODES_TO_KEEP_ERROR }
  return {
    options: {
      ...(leadTime != null ? { leadTime } : {}),
      ...(lagTime != null ? { lagTime } : {}),
      ...(episodesToKeep != null ? { episodesToKeep } : {}),
    },
  }
}

const episodesToKeepFrom = (value) => {
  if (value == null || value === '') return null
  const count = Number(value)
  return Number.isInteger(count) && count >= 0 && count <= MAX_EPISODES_TO_KEEP ? count : undefined
}
