export const EMPTY_TUNER_STATUS = {
  configured: true,
  total: 0,
  inUse: 0,
  recording: 0,
  free: 0,
  muxSharing: false,
  tuners: [],
  streams: { max: 1, inUse: 0 },
  channels: [],
}

export const tunerToneOf = (tuner) => {
  if (tuner.inUseBy === 'recording') return 'recording'
  if (tuner.inUseBy) return 'watching'
  return 'free'
}

export const tunerMeterOf = (status) => ({
  cells: (status.tuners || []).map((tuner, index) => ({ key: index, tone: tunerToneOf(tuner), label: tuner.label })),
  text: status.total ? `${status.inUse} of ${status.total} tuners` : 'No tuners found',
  freeText: freeTunersText(status.free),
})

export const freeTunersText = (free) => {
  if (!free) return 'No tuners free.'
  return free === 1 ? '1 tuner free.' : `${free} tuners free.`
}

export const streamsLimitReached = (streams) => Boolean(streams) && streams.inUse >= streams.max

const streamsPlayingText = (max) => (max === 1 ? '1 stream already playing' : `${max} streams already playing`)

export const pickerTagOf = ({ channel, status }) => {
  if (streamsLimitReached(status.streams)) {
    return { text: `Unavailable: ${streamsPlayingText(status.streams.max)}`, tone: 'warn', disabled: true }
  }
  if (!channel) return { text: '', tone: 'quiet', disabled: false }
  if (channel.cost === 'no-extra-tuner' && status.muxSharing) {
    const text = channel.sharesWith ? `No extra tuner: same multiplex as ${channel.sharesWith}` : 'No extra tuner'
    return { text, tone: 'quiet', disabled: false }
  }
  if (channel.cost === 'free-tuner') return { text: 'Uses a free tuner', tone: 'ok', disabled: false }
  if (channel.cost === 'unavailable') {
    const text = channel.reason === 'off-air' ? 'Unavailable: off air' : 'Unavailable: all tuners busy'
    return { text, tone: 'warn', disabled: true }
  }
  return { text: '', tone: 'quiet', disabled: false }
}

export const pickerRowsOf = ({ entries = [], status, excludeIds = [], conflictText = () => '' }) => {
  const excluded = new Set(excludeIds.map(String))
  const costs = new Map((status.channels || []).map((c) => [String(c.channelId), c]))
  const rows = entries
    .filter((entry) => entry.channel && !excluded.has(String(entry.channel.id)))
    .map((entry) => {
      const channel = costs.get(String(entry.channel.id))
      return {
        entry,
        favourite: Boolean(entry.channel.pinned),
        tag: pickerTagOf({ channel, status }),
        hint: channel?.conflict ? conflictText(channel.conflict) : '',
      }
    })
  return {
    favourites: rows.filter((row) => row.favourite),
    others: rows.filter((row) => !row.favourite),
  }
}

export const capacityText = (streams) => {
  const max = streams?.max ?? 1
  const plays = max === 1 ? 'Freetvarr plays 1 live stream at a time.' : `Freetvarr plays up to ${max} at once.`
  if (!streams?.encoder || streams.estimated == null) return plays
  if (streams.encoder === 'copy') return `This NAS sends live TV without converting it. ${plays}`
  if (max > streams.estimated) return overChoiceText({ chosen: max, estimated: streams.estimated })
  const measured = measuredCapacityText({ ...streams, clockText: null })
  return max < streams.estimated ? `${measured} ${plays}` : measured
}

export const tunerExplainerOf = (status) => {
  const total = status.total || 0
  const tuners = total === 1 ? '1 tuner' : `${total} tuners`
  const sharing = status.muxSharing
  return [
    `Your TV tuner hardware has ${tuners}.`,
    sharing ? 'Each tuner receives one multiplex: a group of channels from the same broadcaster, such as 7, 7two and 7mate.' : '',
    sharing
      ? 'Watching or recording a channel uses a tuner, unless another channel on the same multiplex is already tuned.'
      : 'Watching or recording a channel uses a tuner.',
    'Multiview plays two channels at once, so it uses up to two tuners.',
    'Recordings always come first.',
    capacityText(status.streams),
  ].filter(Boolean)
}

export const measuredText = ({ benchmark, chosen, clockText }) => {
  if (!benchmark) return 'Not measured yet.'
  if (benchmark.encoder === 'copy') return 'This NAS sends live TV without converting it.'
  if (isOverMeasured({ benchmark, chosen })) return `${overChoiceText({ chosen, estimated: benchmark.estimated })} Measure again.`
  return measuredCapacityText({ ...benchmark, clockText })
}

export const isOverMeasured = ({ benchmark, chosen }) =>
  Boolean(benchmark) && benchmark.encoder !== 'copy' && chosen > benchmark.estimated

export const measuredCapacityText = ({ encoder, estimated, measuredAt, clockText }) => {
  const how = encoder === 'vaapi' ? 'hardware' : 'software'
  const when = clockText && measuredAt ? `, measured ${clockText(measuredAt)}` : ''
  if (!estimated) return `Measured: this NAS cannot convert live TV smoothly (${how}${when}).`
  return `Measured: this NAS can convert ${liveStreamsText(estimated)} at once (${how}${when}).`
}

export const overChoiceText = ({ chosen, estimated }) => {
  const managed = estimated ? `managed ${estimated} smoothly` : 'could not convert even 1 smoothly'
  return `You chose ${chosen}. The last measurement ${managed}, so ${stutterText({ chosen, estimated })}.`
}

export const streamChoicesOf = ({ choices = [1, 2], benchmark }) => choices.map((value) => ({
  value,
  label: String(value),
  tooMany: isOverMeasured({ benchmark, chosen: value }),
}))

export const streamsHintOf = ({ tunerCount }) => {
  const multiview = 'Multiview shows this many pictures on a tablet or computer, and up to 2 on a phone.'
  if (!(tunerCount > 0) || tunerCount >= 4) return multiview
  const tuners = tunerCount === 1 ? '1 tuner' : `${tunerCount} tuners`
  return `${multiview} Choices stop at your ${tuners}.`
}

const stutterText = ({ chosen, estimated }) => {
  if (chosen === 1) return 'the picture may stutter'
  if (chosen - estimated === 1) return `the ${ORDINALS[chosen] || `${chosen}th`} picture may stutter`
  return 'some pictures may stutter'
}

const liveStreamsText = (n) => (n === 1 ? '1 live stream' : `${n} live streams`)

const ORDINALS = { 2: 'second', 3: 'third', 4: 'fourth' }
