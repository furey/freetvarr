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
  if (!streams || !streams.encoder) return `Freetvarr can convert ${max === 1 ? '1 live stream' : `${max} live streams`} at once on this NAS.`
  if (streams.encoder === 'copy') return `This NAS sends live TV without converting it. ${plays}`
  const how = streams.encoder === 'vaapi' ? 'with hardware' : 'in software'
  const speed = Number(streams.speed || 0).toFixed(1)
  const estimated = streams.estimated ?? max
  const enough = estimated === 1 ? 'enough for 1 stream' : `enough for ${estimated} streams at once`
  const tail = estimated === max ? '' : ` ${plays}`
  return `This NAS converts live TV ${how} at ${speed}× real time, ${enough}.${tail}`
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

export const measuredText = ({ benchmark, clockText }) => {
  if (!benchmark) return 'Not measured yet.'
  const when = benchmark.measuredAt ? ` Measured ${clockText(benchmark.measuredAt)}.` : ''
  return `${capacityText({ ...benchmark, max: benchmark.estimated })}${when}`
}

export const streamChoicesOf = ({ choices = [1, 2], benchmark }) => choices.map((value) => {
  const tooMany = Boolean(benchmark?.estimated) && value > benchmark.estimated
  return { value, label: String(value), tooMany }
})

export const tooManyNoteOf = (benchmark) => {
  if (!benchmark?.estimated) return ''
  const n = benchmark.estimated
  return `Your hardware measured enough for ${n}.`
}
