import fs from 'node:fs'

export const knownShowOf = ({ keys = [], tvmazeCountry = null, channelNames = [], country = '', list = KNOWN_SHOWS }) => {
  const found = keys.map((key) => list.shows?.[key]).find(Boolean)
  if (!found) return null
  return Array.isArray(found) ? versionOf({ versions: found, tvmazeCountry, channelNames, country }) : found
}

const versionOf = ({ versions, tvmazeCountry, channelNames, country }) => {
  const byTvmaze = tvmazeCountry && versions.find((version) => version.origin === String(tvmazeCountry).toLowerCase())
  if (byTvmaze) return byTvmaze
  const words = new Set(channelNames.flatMap((name) => String(name).toLowerCase().split(/[^a-z0-9]+/)).filter(Boolean))
  const byChannel = versions.find((version) => (version.channels ?? []).some((word) => words.has(word)))
  if (byChannel) return byChannel
  return versions.find((version) => version.origin === country) ?? null
}

const loadKnownShows = () => {
  try {
    return JSON.parse(fs.readFileSync(new URL('./data/known-shows.json', import.meta.url), 'utf8'))
  } catch {
    return { version: 0, shows: {} }
  }
}

export const KNOWN_SHOWS = loadKnownShows()
