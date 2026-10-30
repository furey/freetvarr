import { matchingAutorecOf } from './autorec-match.js'
import { isSimulcastHd, simulcastBaseKey, simulcastPairsOf, timeshiftOf } from './web/simulcast.js'

export const TWIN_START_TOLERANCE_MS = 60 * 1000

export const airingIdentityOf = ({ programmes = [], channels = [], channelIdOf = (programme) => programme.channel_id }) => {
  const channelById = new Map(channels.map((channel) => [String(channel.id), channel]))
  const families = channelFamiliesOf(channels)
  const rankOf = rankingOf(channels)
  const buckets = new Map()
  for (const programme of programmes) {
    const channel = channelById.get(String(channelIdOf(programme))) || { id: channelIdOf(programme) }
    const title = normaliseTitle(programme.title)
    if (!title) continue
    const family = families.get(String(channel.id)) || { key: `channel:${channel.id}`, offsetMs: 0 }
    const bucketKey = `${family.key}|${title}`
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, [])
    buckets.get(bucketKey).push({ programme, channel, offsetMs: family.offsetMs, baseStart: Number(programme.start) - family.offsetMs })
  }
  const groups = [...buckets.values()].flatMap(clustersOf)
  const groupOf = new Map(groups.flatMap((group) => group.airings.map((airing) => [idOf(airing.programme), group])))
  return {
    groups,
    groupOf: (programme) => groupOf.get(idOf(programme)) || null,
    preferredOf: ({ group, nowMs }) => preferredAiringOf({ group, nowMs, rankOf }),
    twinsOf: (programme) => twinsIn({ group: groupOf.get(idOf(programme)), programme }),
    airingOf: (programme) => groupOf.get(idOf(programme))?.airings.find((airing) => idOf(airing.programme) === idOf(programme)) || null,
  }
}

export const preferredAiringsOf = ({ identity, nowMs }) => identity.groups
  .map((group) => identity.preferredOf({ group, nowMs }))
  .filter(Boolean)

export const isPreferredAiring = ({ identity, programme, nowMs }) => {
  const group = identity.groupOf(programme)
  if (!group) return false
  const preferred = identity.preferredOf({ group, nowMs })
  return Boolean(preferred) && idOf(preferred.programme) === idOf(programme)
}

export const coveredProgrammeIdsOf = ({ identity, isCovered }) => new Set(identity.groups
  .filter((group) => group.airings.some(isCovered))
  .flatMap((group) => group.airings.map((airing) => idOf(airing.programme))))

export const airingCoverCheckOf = ({ scheduledProgramIds = new Set(), autorecs = [] }) => {
  const scheduled = new Set([...scheduledProgramIds].map(String))
  return ({ programme, channel }) => Boolean(programme.dvr_state || programme.dvr_uuid)
    || scheduled.has(idOf(programme))
    || Boolean(matchingAutorecOf({ autorecs, programme, channelId: channel.id }))
}

export const twinAnnotationOf = ({ identity, programme, autorecs = [] }) => {
  const twins = identity.twinsOf(programme)
  const own = identity.airingOf(programme)
  const rule = [own || { programme, channel: { id: programme.channel_id } }, ...twins]
    .map((airing) => matchingAutorecOf({ autorecs, programme: airing.programme, channelId: airing.channel.id }))
    .find(Boolean)
  return {
    ...(twins.length ? { twins: twins.map(twinSummaryOf) } : {}),
    ...(rule ? { rule_link: rule.seriesLinkId } : {}),
  }
}

const twinSummaryOf = ({ programme, channel }) => ({
  program_id: programme.program_id,
  channel_id: channel.id,
  channel_name: channel.name || null,
  series_link: programme.series_link || null,
})

const channelFamiliesOf = (channels) => {
  const families = new Map()
  for (const pair of simulcastPairsOf(channels)) {
    for (const channel of pair) families.set(String(channel.id), { key: `pair:${simulcastBaseKey(channel.name)}`, offsetMs: 0 })
  }
  for (const channel of channels) {
    if (!families.has(String(channel.id))) families.set(String(channel.id), { key: `channel:${channel.id}`, offsetMs: 0 })
  }
  const familyByBaseKey = originalFamiliesByBaseKey({ channels, families })
  for (const channel of channels) {
    const shift = timeshiftOf(channel.name)
    const original = shift && familyByBaseKey.get(shift.baseKey)
    if (original) families.set(String(channel.id), { key: original, offsetMs: shift.offsetMs })
  }
  return families
}

const originalFamiliesByBaseKey = ({ channels, families }) => {
  const byBaseKey = new Map()
  for (const channel of channels) {
    if (timeshiftOf(channel.name)) continue
    const baseKey = simulcastBaseKey(channel.name)
    const family = families.get(String(channel.id)).key
    byBaseKey.set(baseKey, byBaseKey.has(baseKey) && byBaseKey.get(baseKey) !== family ? null : family)
  }
  return byBaseKey
}

const clustersOf = (airings) => {
  const sorted = [...airings].sort((a, b) => a.baseStart - b.baseStart)
  const clusters = []
  for (const airing of sorted) {
    const last = clusters.at(-1)
    if (last && airing.baseStart - last.baseStart <= TWIN_START_TOLERANCE_MS) last.airings.push(airing)
    else clusters.push({ baseStart: airing.baseStart, airings: [airing] })
  }
  return clusters
}

const preferredAiringOf = ({ group, nowMs, rankOf }) => {
  const visible = group.airings.filter((airing) => !airing.channel.hidden && Number(airing.programme.end) > nowMs)
  const earliestOffset = Math.min(...visible.map((airing) => airing.offsetMs))
  const showing = visible
    .filter((airing) => airing.offsetMs === earliestOffset)
    .sort((a, b) => rankOf(a.channel) - rankOf(b.channel))
  return showing[0] || null
}

const rankingOf = (channels) => {
  const order = new Map(channels.map((channel, index) => [String(channel.id), index]))
  return (channel) => (isSimulcastHd(channel) ? 0 : 2 * channels.length)
    + (channel.pinned ? 0 : channels.length)
    + (order.get(String(channel.id)) ?? channels.length)
}

const twinsIn = ({ group, programme }) => {
  if (!group) return []
  const own = group.airings.find((airing) => airing.programme === programme || idOf(airing.programme) === idOf(programme))
  return group.airings.filter((airing) => airing !== own && airing.offsetMs === own?.offsetMs)
}

const idOf = (programme) => String(programme.program_id ?? programme.programId)

const normaliseTitle = (title) => (title || '').trim().toLowerCase()
