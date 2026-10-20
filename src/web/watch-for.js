export const WATCH_FOR_DEFAULT_LEAD = 2
export const WATCH_FOR_DEFAULT_LAG = 10

export const watchForOfferOf = ({ query, searching = false, guideCount = 0, minLength = 2 }) => {
  const title = String(query ?? '').trim()
  if (searching || guideCount > 0 || title.length < minLength) return null
  return title
}

export const watchForTitleOf = (value) => String(value ?? '').trim()

export const watchForActionLabelOf = ({ recordWhenSeen }) => (recordWhenSeen ? 'Record when it appears' : 'Watch for')

export const watchRequestOf = ({ title, recordWhenSeen, leadTime, lagTime }) => (recordWhenSeen
  ? { title, mode: 'record', lead_time: leadTime, lag_time: lagTime }
  : { title, mode: 'notify' })

export const watchedMessageOf = ({ title, item }) => {
  if (item?.mode === 'record' && item.fulfilledAt) return `"${title}" is in the guide, so every episode now records on any channel.`
  if (item?.mode === 'record') return `Freetvarr records "${title}" on any channel once it is in the guide.`
  return `Watching for "${title}". It shows in Scheduled under Watching for.`
}
