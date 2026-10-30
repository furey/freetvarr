export const identityRowOf = ({ status, title, loading = false }) => {
  if (loading) return LOOKING_UP_ROW
  if (!status) return UNREACHABLE_ROW
  if (status.state === 'declined') return DECLINED_ROW
  const current = status.current || (status.state === 'choose' ? null : status.suggested)
  const currentCandidate = (status.candidates || []).find((candidate) => current && candidate.tvmazeId === current.tvmazeId)
  if (!current && !status.candidates?.length) return lookupRowOf({ lookup: status.lookup, title })
  if (!current) {
    return { title: 'Check which show this is', meta: `Freetvarr found more than one show called ${title}. Pick yours so Plex matches the right one.` }
  }
  const details = currentCandidate ? detailsOf(currentCandidate) : ''
  if (status.state === 'confirm') {
    return { title: 'Check which show this is', meta: `Freetvarr thinks this is ${current.name}${details ? `, ${details}` : ''}. Press to check or change it.` }
  }
  return { title: current.name, meta: details || 'Press to change the show.' }
}

export const folderFixNoteOf = (plan) => {
  if (plan?.state === 'managed') return `${plan.manager} also saves episodes in this folder, so rename the series in ${plan.manager} instead of here.`
  if (plan?.state === 'target-exists') return `A folder called ${plan.to} is already in your TV library, so Freetvarr cannot rename this folder to it.`
  return ''
}

export const candidateMetaOf = ({ candidate, current }) => {
  const details = detailsOf(candidate)
  const isCurrent = Boolean(current) && candidate.tvmazeId === current.tvmazeId
  return isCurrent ? `${details} · Current` : details
}

export const folderFixOutcomeOf = (plan) => {
  if (!plan) return ''
  const plex = 'Plex then rescans your TV library.'
  if (!plan.folderExists) return `The folder is not on disk yet, so Freetvarr changes where new episodes save to. ${plex}`
  const count = plan.recordings === 1 ? '1 recording' : `${plan.recordings} recordings`
  const moved = plan.recordings
    ? `Freetvarr updates the ${count} in it, and new episodes save to the new folder.`
    : 'New episodes save to the new folder.'
  return [moved, otherVideosOf(plan.otherVideos), plex].filter(Boolean).join(' ')
}

const otherVideosOf = (count) => {
  if (!count) return ''
  const videos = count === 1 ? '1 video' : `${count} videos`
  return `The folder also holds ${videos} that Freetvarr did not record, such as copies you added yourself. They move with the folder.`
}

const lookupRowOf = ({ lookup, title }) => {
  if (lookup === 'off') return { title: 'No show lookups', meta: 'Missing pictures is off in Settings, so Freetvarr does not look up the show and the folder keeps the plain name.' }
  if (lookup === 'pending') return { title: 'Still looking', meta: 'TVmaze is slow to answer. Open the series again in a minute.' }
  if (lookup === 'unreachable') return UNREACHABLE_ROW
  return { title: 'No show found', meta: `TVmaze has no show called ${title}, so the folder keeps the plain name.` }
}

const LOOKING_UP_ROW = { title: 'Looking up the show', meta: 'Freetvarr is checking TVmaze for the show this folder is named after.' }
const UNREACHABLE_ROW = { title: 'TVmaze not reachable', meta: 'Freetvarr cannot reach TVmaze right now, so the folder keeps the plain name. Try again later.' }
const DECLINED_ROW = { title: 'None of these', meta: 'The folder keeps the plain name. Press to pick a show.' }

const detailsOf = (candidate) => [candidate.country, candidate.network, candidate.years].filter(Boolean).join(' · ')
