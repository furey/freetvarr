import { ratingsKindOf, releaseYearOf, safeLinkOf } from './ratings-display.js'

export const MAX_CAST = 12

export const creditsKeyOf = ({ title, kind, year }) => {
  const name = String(title || '').trim()
  if (!name) return ''
  return `${ratingsKindOf(kind)}|${yearOf(year)}|${name.toLowerCase()}`
}

export const creditsUrlOf = ({ title, kind, year }) => {
  const params = new URLSearchParams({ title: String(title || '').trim(), kind: ratingsKindOf(kind) })
  const shownYear = yearOf(year)
  if (shownYear) params.set('year', shownYear)
  return `/api/epg/programme-credits?${params}`
}

export const isSettledCredits = (credits) => credits?.status === 'ready' || credits?.status === 'none'

export const shownCastOf = (credits) => {
  if (credits?.status !== 'ready' || !Array.isArray(credits.cast)) return []
  return credits.cast
    .map(castMemberOf)
    .filter(Boolean)
    .slice(0, MAX_CAST)
}

export const crewLinesOf = (credits) => {
  if (credits?.status !== 'ready' || !Array.isArray(credits.crew)) return []
  const namesByJob = new Map()
  for (const member of credits.crew) {
    const job = cleanText(member?.job)
    const name = cleanText(member?.name)
    if (!job || !name) continue
    const names = namesByJob.get(job) || []
    if (!names.includes(name)) namesByJob.set(job, [...names, name])
  }
  return [...namesByJob].map(([job, names]) => ({ job, names: names.join(', '), text: `${job}: ${names.join(', ')}` }))
}

export const overviewOf = (credits) => (credits?.status === 'ready' ? cleanText(credits.overview) : '')

export const newestSynopsisOf = (show) => {
  const episodes = (show?.seasons || []).flatMap((season) => season.episodes || [])
  const newest = episodes
    .filter((episode) => cleanText(episode.synopsis))
    .sort((a, b) => (b.airedAt ?? -Infinity) - (a.airedAt ?? -Infinity))[0]
  return newest ? cleanText(newest.synopsis) : cleanText(show?.nextAiring?.synopsis)
}

export const initialsOf = (name) => {
  const words = cleanText(name)
    .split(' ')
    .map((word) => word.replace(/^[^\p{L}\p{N}]+/u, ''))
    .filter(Boolean)
  if (!words.length) return ''
  const picked = words.length === 1 ? [words[0]] : [words[0], words.at(-1)]
  return picked.map((word) => [...word][0].toUpperCase()).join('')
}

const castMemberOf = (member) => {
  const name = cleanText(member?.name)
  if (!name) return null
  return {
    name,
    character: cleanText(member.character),
    image: safeLinkOf(member.image),
    url: safeLinkOf(member.url),
    initials: initialsOf(name),
  }
}

const yearOf = (year) => String(releaseYearOf(year) ?? '')

const cleanText = (text) => String(text ?? '').replace(/\s+/g, ' ').trim()
