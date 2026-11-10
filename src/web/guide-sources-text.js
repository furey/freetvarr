export const AUTOMATIC = 'auto'

export const listingChoicesOf = (sources = []) => [
  { value: AUTOMATIC, label: 'Automatic' },
  ...sources.map((source) => ({ value: source.id, label: source.label })),
]

export const listingModeHintOf = ({ mode, sources = [] }) => {
  if (mode === AUTOMATIC) {
    const [first, ...rest] = sources
    if (!first) return ''
    const next = rest.map((source) => source.label).join(' or ') || 'the next source'
    return `${first.label} first. When a channel's ${first.label} listings stay degraded for two builds, that channel uses ${next} until ${first.label} recovers. Each change shows in Activity.`
  }
  const chosen = sources.find((source) => source.id === mode)
  return chosen ? `${chosen.label} first for every channel that has it, even while its listings are degraded. Health warns you when they are.` : ''
}

export const sourceMetaOf = ({ source, clockOf }) => {
  if (!source.measured) return 'Not measured yet. Freetvarr measures each source when it builds the merged guide.'
  return [
    source.score === null ? null : `${source.score}% of channels healthy`,
    `${source.horizonDays} ${source.horizonDays === 1 ? 'day' : 'days'} ahead`,
    source.lastSuccessAt ? `last read ${clockOf(source.lastSuccessAt)}` : 'no good read yet',
  ].filter(Boolean).join(' · ')
}

export const channelsChangeOf = (repoint) => (repoint.added.length
  ? `${repoint.currentChannels} now, ${repoint.channels} after`
  : `${repoint.channels}`)

export const addedChannelsOf = ({ names = [], shown = ADDED_SHOWN }) => {
  if (!names.length) return ''
  if (names.length <= shown) return joinAnd(names)
  return `${names.slice(0, shown).join(', ')}, and ${names.length - shown} more`
}

export const daysAheadOf = (days = []) => days.map(({ label, days: count }) => `${label}: ${count} ${count === 1 ? 'day' : 'days'}`).join(' · ')

export const repointReasonTextOf = (reason) => REASONS[reason] ?? ''

export const channelChoicesOf = ({ channel, sources = [] }) => [
  { value: '', label: 'Automatic' },
  ...sources.filter((source) => channel.sources.includes(source.id)).map((source) => ({ value: source.id, label: source.label })),
]

export const channelStateOf = ({ channel, sources = [] }) => {
  const labelOf = (id) => sources.find((source) => source.id === id)?.label ?? id
  if (channel.pin) {
    const degraded = channel.degraded.includes(channel.pin)
    return degraded ? `Pinned to ${labelOf(channel.pin)}, which is degraded on this channel.` : `Pinned to ${labelOf(channel.pin)}.`
  }
  if (channel.fallback) return `Uses ${labelOf(channel.lead)}, because its ${labelOf(channel.sources[0])} listings are degraded.`
  return channel.lead ? `Uses ${labelOf(channel.lead)}.` : ''
}

export const listedChannelsOf = (channels = []) => channels.filter((channel) => channel.pin || channel.fallback)

export const pinnableChannelsOf = (channels = []) => channels
  .filter((channel) => channel.sources.length > 1 && !channel.pin)
  .sort((a, b) => (a.lcn ?? Infinity) - (b.lcn ?? Infinity) || a.name.localeCompare(b.name))

const joinAnd = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`)

const ADDED_SHOWN = 4

const REASONS = {
  'no-plan': 'Freetvarr has no merged guide for your time zone yet. TVHeadend keeps the guide it has.',
  'no-tvheadend': 'Freetvarr could not read TVHeadend. Check the connection under SETTINGS → TVHEADEND.',
  'no-grabber': 'This TVHeadend cannot download a guide from an address, so it keeps the guide that comes with the broadcast.',
  'custom-grabber': 'TVHeadend reads a guide address that Freetvarr does not merge, so it stays as it is.',
  'no-address': 'Freetvarr found no address that TVHeadend can reach it on.',
  building: 'Freetvarr is building the merged guide for the first time. This takes about 15 minutes.',
}
