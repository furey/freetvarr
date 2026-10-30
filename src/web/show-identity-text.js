export const identityRowOf = ({ status, title }) => {
  if (!status) return null
  const current = status.current || status.suggested
  const currentCandidate = (status.candidates || []).find((candidate) => current && candidate.tvmazeId === current.tvmazeId)
  if (status.state === 'choose' && !status.current) {
    return status.candidates?.length
      ? { title: 'Check which show this is', meta: `Freetvarr found more than one show called ${title}. Pick yours so Plex matches the right one.` }
      : null
  }
  if (status.state === 'declined') return { title: 'None of these', meta: 'The folder keeps the plain name. Press to pick a show.' }
  if (!current) return null
  const details = currentCandidate ? detailsOf(currentCandidate) : ''
  if (status.state === 'confirm') {
    return { title: 'Check which show this is', meta: `Freetvarr thinks this is ${current.name}${details ? `, ${details}` : ''}. Press to check or change it.` }
  }
  return { title: current.name, meta: details || 'Press to change the show.' }
}

export const candidateMetaOf = ({ candidate, current }) => {
  const details = detailsOf(candidate)
  const isCurrent = Boolean(current) && candidate.tvmazeId === current.tvmazeId
  return isCurrent ? `${details} · Current` : details
}

const detailsOf = (candidate) => [candidate.country, candidate.network, candidate.years].filter(Boolean).join(' · ')
