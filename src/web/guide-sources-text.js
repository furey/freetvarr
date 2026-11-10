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

export const broadcastIntroOf = ({ country, broadcast }) => {
  const place = country ?? 'your time zone'
  if (!broadcast) return `Freetvarr has no listings source for ${place}, so TVHeadend keeps the guide it has. Freetvarr could not read that guide just now.`
  return `Freetvarr has no listings source for ${place}, so TVHeadend keeps the guide it has: the broadcast guide (EIT), plus any XMLTV grabber you set up.`
}

export const broadcastMetaOf = (broadcast) => {
  if (!broadcast) return ''
  return [
    `${broadcast.listed} of ${broadcast.channels} ${broadcast.channels === 1 ? 'channel' : 'channels'} listed for the next 48 h`,
    `${broadcast.horizonDays} ${broadcast.horizonDays === 1 ? 'day' : 'days'} ahead (median)`,
    ...(broadcast.describedShare === null ? [] : [`${Math.round(broadcast.describedShare * 100)}% described`]),
  ].join(' · ')
}

export const suggestedFeedsNoteOf = ({ country }) => `Other people publish these XMLTV guide feeds for ${country ?? 'your country'} (third-party, licence not checked by Freetvarr). Freetvarr reads one only when you choose it. To use one, copy its address into the XMLTV URL grabber in TVHeadend, or into Another address under SETTINGS → SETUP → Guide.`

export const suggestedFeedsHintOf = ({ checked }) => (checked ? `Each address answered on ${checked}.` : '')

export const feedProvidersOf = (feeds = []) => [...new Map(feeds.map((feed) => [feed.provider, { name: feed.provider, source: feed.source }])).values()]

export const useMergedGuideDialogOf = ({ repoint }) => ({
  title: 'Use the merged guide?',
  confirmLabel: 'Use the merged guide',
  busyLabel: 'Starting',
  lead: 'TVHeadend reads the merged guide from Freetvarr.',
  rows: [
    { label: 'Guide address', detail: repoint.feedUrl },
    ...(repoint.rebuild ? [{ label: 'First build', value: 'About 15 minutes' }] : []),
    ...(repoint.days?.length ? [{ label: 'Days ahead', value: compactDaysAheadOf(repoint.days) }] : []),
    ...(repoint.added?.length ? [{ label: 'Channels that gain a guide', detail: repoint.added.join(', ') }] : []),
    { label: 'Series recordings', value: 'Keep matching' },
  ],
  note: 'If a step fails, Freetvarr puts everything back. You can stop using it later.',
})

export const stopMergedGuideDialogOf = ({ plan, sources = [], secondaryId = null }) => {
  const after = sources.find((source) => source.id === secondaryId)
  const address = stopAddressOf(plan)
  return {
    title: 'Stop using the merged guide?',
    confirmLabel: 'Stop using the merged guide',
    busyLabel: 'Starting',
    lead: stopLeadOf({ plan, after }),
    rows: [
      ...(after?.horizonDays ? [{ label: 'Days ahead', value: countOf(after.horizonDays, 'day') }] : []),
      ...(plan.primaryChannelNames?.length ? [{ label: 'Channels that lose their guide', detail: plan.primaryChannelNames.join(', ') }] : []),
      ...(plan.restoresLinks ? [{ label: 'Guide links put back', value: countOf(plan.restoresLinks, 'channel') }] : []),
      ...(address ? [{ label: 'Guide address', detail: address }] : []),
    ],
    note: 'If TVHeadend does not reload, Freetvarr puts the merged guide back. You can switch again later.',
  }
}

const stopLeadOf = ({ plan, after }) => {
  if (plan.enabled === false) return 'TVHeadend stops downloading a guide by address, as before you switched.'
  if (after?.label) return `TVHeadend goes back to the ${after.label} guide.`
  if (plan.sameUrl) return 'TVHeadend keeps reading the same address with the merged content off.'
  return "TVHeadend's guide grabber goes back to the address it read before."
}

const stopAddressOf = (plan) => {
  if (plan.sameUrl) return `No change: ${plan.grabberUrl}`
  return plan.afterUrl ?? ''
}

const compactDaysAheadOf = (days) => days.map(({ label, days: count }) => `${label} ${count}`).join(' · ')

const countOf = (count, noun) => `${count} ${count === 1 ? noun : `${noun}s`}`

export const failedRunActionsOf = (result) => (result?.kind === 'unmerge'
  ? { retry: 'unmerge', showKeep: false }
  : { retry: 'repoint', showKeep: true })

export const unmergeDoneTextOf = (outcome) => {
  const reads = outcome.enabled === false ? 'TVHeadend no longer downloads a guide by address, as before you switched.' : `TVHeadend reads ${outcome.grabberUrl} again.`
  const updated = outcome.updated ? '' : ' Its listings change after its next import.'
  return `${reads}${updated} The merged guide is off.`
}

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
